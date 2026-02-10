import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import { formatTime, sendBrowserNotification } from './helpers.js';

const { LOG_CATEGORIES } = Constants;
const { SAVE_STATE_INTERVAL_SECONDS, TRANSITION_PHASE_DURATION_SECONDS } = Constants;

// Backward compatibility: getConfig, getPref, setPref
const getConfig = () => Storage.loadConfig();
const getPref = (key) => Storage.getPref(key);
const setPref = (key, value) => Storage.setPref(key, value);

class PomodoroTimer {
  constructor() {
    this.isActive = false;
    this.isPaused = false;
    this.pausedOnBlockedWorkspace = false; // Track if paused while on blocked workspace
    this.remainingTime = 0;
    this.currentPhase = 'focus';
    this.currentCycle = 1;
    this.totalCycles = 4;
    this.mode = 'pomodoro';
    this.intervalId = null;
    this.config = getConfig();
    this.savedConfig = null; // Store config with timer state
    this.onTick = null;
    this.onPhaseChange = null;
    this.onComplete = null;
    this.tickCounter = 0; // Counter for reducing save frequency
    // Custom cycle properties
    this.customCycle = null; // Current custom cycle configuration
    this.customCycleBlocks = null; // Array of blocks from custom cycle
    this.currentBlockIndex = 0; // Current block index in custom cycle
    /** Track which reminders have been shown for current phase to avoid duplicates */
    this.shownRemindersForCurrentPhase = new Set();
  }

  /**
   * Start the timer
   * @param {string} mode - Timer mode ('pomodoro' or 'simple')
   * @param {number} cycles - Number of pomodoro cycles
   * @param {Object} sessionOverrides - Optional session-only duration overrides
   */
  start(mode = 'pomodoro', cycles = 4, sessionOverrides = {}) {
    this.mode = mode;
    this.totalCycles = cycles;
    this.currentCycle = 1;
    this.currentPhase = 'focus';
    this.isActive = true;
    this.isPaused = false;
    this.tickCounter = 0;

    // Clear shown reminders for new session
    this.shownRemindersForCurrentPhase.clear();

    // Get base config from preferences (ensures we start fresh without previous session modifications)
    this.config = getConfig();

    // Apply session-only overrides (these don't persist to saved config)
    const effectiveConfig = { ...this.config, ...sessionOverrides };

    // Store the effective config with timer state for proper restoration
    this.savedConfig = { ...effectiveConfig };

    if (mode === 'simple') {
      this.remainingTime = effectiveConfig.simpleDuration * 60;
    } else {
      this.remainingTime = effectiveConfig.focusDuration * 60;
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Timer started', {
      mode: mode,
      cycles: cycles,
      duration: this.remainingTime,
      phase: this.currentPhase,
    });

    this.startInterval();
    this.saveState();

    // CROSS-WINDOW SYNC: Claim ownership and write sync state after saveState
    const sync = window.zenPomodoroApp?.windowSync;
    if (sync) {
      sync.claimOwnership();
      this._writeSyncState();
    }
  }

  /**
   * Start a custom cycle timer
   * @param {Object} customCycle - Custom cycle configuration
   */
  startCustomCycle(customCycle) {
    this.mode = 'custom';
    this.customCycle = customCycle;
    this.customCycleBlocks = [...customCycle.blocks]; // Make a copy
    this.currentBlockIndex = 0;
    // Count focus blocks to determine total cycles
    this.totalCycles = customCycle.blocks.filter(b => b.type === 'focus').length;

    // Validate that cycle has at least one block
    if (this.customCycleBlocks.length === 0) {
      logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle has no blocks, cannot start');
      return;
    }

    // Set initial cycle based on first block type - if first block is focus, we're on cycle 1
    // If first block is a break, we haven't started any focus cycle yet (0)
    const firstBlock = this.customCycleBlocks[0];
    this.currentCycle = firstBlock.type === 'focus' ? 1 : 0;
    this.isActive = true;
    this.isPaused = false;
    this.tickCounter = 0;

    // Clear shown reminders for new session
    this.shownRemindersForCurrentPhase.clear();

    // Load fresh config from preferences (ensures we start fresh without previous session modifications)
    this.config = getConfig();

    // Store the config with timer state for proper restoration
    this.savedConfig = { ...this.config };

    // Start with first block
    this._startCustomBlock(firstBlock);

    logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle timer started', {
      cycleName: customCycle.name,
      blocks: this.customCycleBlocks.length,
      totalCycles: this.totalCycles,
      firstBlock: firstBlock.type,
    });

    this.saveState();

    // CROSS-WINDOW SYNC: Claim ownership and write sync state after saveState
    const sync = window.zenPomodoroApp?.windowSync;
    if (sync) {
      sync.claimOwnership();
      this._writeSyncState();
    }
  }

  /**
   * Start a specific custom cycle block
   * @private
   * @param {Object} block - Block configuration to start
   */
  _startCustomBlock(block) {
    this.remainingTime = block.duration * 60;
    this.currentPhase = block.type;

    // Increment current cycle only when starting a focus block (not for breaks or transitions)
    if (block.type === 'focus' && this.currentBlockIndex > 0) {
      // Check if previous block was not a focus block (to avoid double increment)
      const previousBlock = this.customCycleBlocks[this.currentBlockIndex - 1];
      if (previousBlock.type !== 'focus') {
        this.currentCycle++;
      }
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Custom block started', {
      blockIndex: this.currentBlockIndex,
      type: block.type,
      duration: block.duration,
      currentCycle: this.currentCycle,
    });

    this.startInterval();

    // Notify phase change callback if registered
    if (this.onPhaseChange) {
      this.onPhaseChange(this.currentPhase, this.remainingTime);
    }
  }

  /**
   * Pause the timer
   */
  pause() {
    if (!this.isActive || this.isPaused) return;
    this.isPaused = true;
    this.stopInterval();
    logger.log(LOG_CATEGORIES.TIMER, 'Timer paused', {
      remainingTime: this.remainingTime,
      phase: this.currentPhase,
    });
    this.saveState();
    this._writeSyncState();
  }

  /**
   * Resume the timer
   */
  resume() {
    if (!this.isActive || !this.isPaused) return;
    this.isPaused = false;
    this.startInterval();
    logger.log(LOG_CATEGORIES.TIMER, 'Timer resumed', {
      remainingTime: this.remainingTime,
      phase: this.currentPhase,
    });
    this.saveState();
    this._writeSyncState();
  }

  /**
   * Stop the timer
   */
  stop() {
    this.isActive = false;
    this.isPaused = false;
    this.pausedOnBlockedWorkspace = false;
    this.stopInterval();
    logger.log(LOG_CATEGORIES.TIMER, 'Timer stopped');

    // Clear saved state
    this.clearState();

    // CROSS-WINDOW SYNC: Release ownership and clear sync state
    const sync = window.zenPomodoroApp?.windowSync;
    if (sync) {
      sync.releaseOwnership();
      this._writeSyncState();
    }

    // Notify completion callback if registered
    if (this.onComplete) {
      this.onComplete();
    }
  }

  /**
   * Skip to the next phase
   */
  skip() {
    if (!this.isActive) return;

    if (this.mode === 'custom') {
      this.skipToNextCustomBlock();
      return;
    }

    if (this.mode === 'simple') {
      logger.log(LOG_CATEGORIES.TIMER, 'Cannot skip in simple mode');
      return;
    }

    const wasInFocusPhase = this.currentPhase === 'focus';

    // Determine next phase based on current state
    if (this.currentPhase === 'focus') {
      this.startBreakPhase();
    } else {
      this.startFocusPhase();
    }

    // Notify phase change callback if registered
    if (this.onPhaseChange) {
      this.onPhaseChange(this.currentPhase, this.remainingTime);
    }

    // Log the skip action with clear before/after info
    logger.log(LOG_CATEGORIES.TIMER, 'Phase skipped', {
      from: wasInFocusPhase ? 'focus' : 'break',
      to: this.currentPhase,
      cycle: this.currentCycle,
    });

    this.saveState();
    this._writeSyncState();
  }

  /**
   * Skip to next custom cycle block
   */
  skipToNextCustomBlock() {
    if (!this.isActive || this.mode !== 'custom') return;

    // Move to next block
    this.currentBlockIndex++;

    // Check if we've completed the cycle
    if (this.currentBlockIndex >= this.customCycleBlocks.length) {
      logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle completed');
      this.stop();
      return;
    }

    // Start next block
    const nextBlock = this.customCycleBlocks[this.currentBlockIndex];
    this._startCustomBlock(nextBlock);

    this.saveState();
    this._writeSyncState();
  }

  /**
   * Start the focus phase
   * @private
   */
  startFocusPhase() {
    this.currentPhase = 'focus';

    // Clear shown reminders when entering new focus phase
    this.shownRemindersForCurrentPhase.clear();

    // Use saved config if available (for proper session-only override support)
    const config = this.savedConfig || this.config;
    this.remainingTime = config.focusDuration * 60;

    this.startInterval();
    logger.log(LOG_CATEGORIES.TIMER, 'Focus phase started', {
      cycle: this.currentCycle,
      duration: this.remainingTime,
    });
  }

  /**
   * Start the break phase
   * @private
   */
  startBreakPhase() {
    // Use saved config if available (for proper session-only override support)
    const config = this.savedConfig || this.config;

    // Determine break duration based on cycle
    if (this.currentCycle >= this.totalCycles) {
      this.currentPhase = 'long-break';
      this.remainingTime = config.longBreakDuration * 60;
    } else {
      this.currentPhase = 'break';
      this.remainingTime = config.breakDuration * 60;
    }

    // Clear shown reminders when entering break phase
    this.shownRemindersForCurrentPhase.clear();

    this.startInterval();
    logger.log(LOG_CATEGORIES.TIMER, 'Break phase started', {
      cycle: this.currentCycle,
      type: this.currentPhase,
      duration: this.remainingTime,
    });
  }

  /**
   * Start the transition phase (break ending soon warning)
   * @private
   */
  startTransitionPhase() {
    this.currentPhase = 'transition';

    // Clear shown reminders when entering transition phase
    this.shownRemindersForCurrentPhase.clear();

    this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;
    this.startInterval();
    logger.log(LOG_CATEGORIES.TIMER, 'Transition phase started', {
      cycle: this.currentCycle,
      duration: this.remainingTime,
    });
  }

  /**
   * Start the interval countdown
   * @private
   */
  startInterval() {
    // Clear any existing interval
    this.stopInterval();

    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);
  }

  /**
   * Stop the interval countdown
   * @private
   */
  stopInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Handle timer tick
   * @private
   */
  tick() {
    if (this.remainingTime > 0) {
      this.remainingTime--;
      this.tickCounter++;

      // Call tick callback if registered
      if (this.onTick) {
        this.onTick(this.remainingTime);
      }

      // Save state every N seconds to reduce I/O overhead
      if (this.tickCounter % SAVE_STATE_INTERVAL_SECONDS === 0) {
        this.saveState();
        this._writeSyncState();
      }
    } else {
      this.handlePhaseComplete();
    }
  }

  /**
   * Handle phase completion
   * @private
   */
  handlePhaseComplete() {
    this.stopInterval();

    // Clear shown reminders since phase is ending
    this.shownRemindersForCurrentPhase.clear();

    // Send notification
    const config = this.savedConfig || this.config;
    if (config.enableNotifications) {
      if (this.currentPhase === 'focus') {
        sendBrowserNotification('Focus Complete', 'Time for a break!');
      } else if (this.currentPhase === 'break' || this.currentPhase === 'long-break') {
        sendBrowserNotification('Break Complete', 'Time to focus!');
      } else if (this.currentPhase === 'transition') {
        sendBrowserNotification('Break Ending Soon', 'Get ready to focus!');
      }
    }

    // Handle mode-specific completion
    if (this.mode === 'custom') {
      this.handleCustomBlockComplete();
      return;
    }

    if (this.mode === 'simple') {
      logger.log(LOG_CATEGORIES.TIMER, 'Simple timer completed');
      this.stop();
      return;
    }

    // Pomodoro mode
    if (this.currentPhase === 'focus') {
      // Start break after focus
      this.startBreakPhase();
    } else if (this.currentPhase === 'break' || this.currentPhase === 'long-break') {
      // Check if transition phase is enabled
      if (config.enableTransitionPhase) {
        this.startTransitionPhase();
      } else {
        // Start next focus phase immediately or complete
        this.handleBreakComplete();
      }
    } else if (this.currentPhase === 'transition') {
      // Transition phase complete - start next focus phase or complete
      this.handleBreakComplete();
    }

    // Notify phase change callback if registered
    if (this.onPhaseChange) {
      this.onPhaseChange(this.currentPhase, this.remainingTime);
    }

    this.saveState();
    this._writeSyncState();
  }

  /**
   * Handle break completion (after regular break, long break, or transition phase)
   * @private
   */
  handleBreakComplete() {
    // Check if all cycles are complete
    if (this.currentCycle >= this.totalCycles) {
      logger.log(LOG_CATEGORIES.TIMER, 'All cycles completed');
      this.stop();
      return;
    }

    // Move to next cycle
    this.currentCycle++;
    this.startFocusPhase();
  }

  /**
   * Handle custom block completion
   * @private
   */
  handleCustomBlockComplete() {
    // Move to next block
    this.currentBlockIndex++;

    // Check if we've completed the cycle
    if (this.currentBlockIndex >= this.customCycleBlocks.length) {
      logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle completed');
      this.stop();
      return;
    }

    // Start next block
    const nextBlock = this.customCycleBlocks[this.currentBlockIndex];
    this._startCustomBlock(nextBlock);

    // Notify phase change callback if registered
    if (this.onPhaseChange) {
      this.onPhaseChange(this.currentPhase, this.remainingTime);
    }

    this.saveState();
    this._writeSyncState();
  }

  /**
   * Check if timer can be skipped (for custom cycles)
   * @private
   * @returns {boolean} True if current block can be skipped
   */
  _canSkipCustomBlock() {
    if (this.mode !== 'custom') return false;
    if (this.currentBlockIndex >= this.customCycleBlocks.length) return false;

    const currentBlock = this.customCycleBlocks[this.currentBlockIndex];
    // Only allow skipping break and transition blocks, never focus
    return currentBlock.type === 'break' || currentBlock.type === 'transition';
  }

  /**
   * Save timer state to preferences
   */
  saveState() {
    if (!this.isActive) return;

    const state = {
      isActive: this.isActive,
      isPaused: this.isPaused,
      pausedOnBlockedWorkspace: this.pausedOnBlockedWorkspace,
      remainingTime: this.remainingTime,
      currentPhase: this.currentPhase,
      currentCycle: this.currentCycle,
      totalCycles: this.totalCycles,
      mode: this.mode,
      savedConfig: this.savedConfig, // Save the effective config
      customCycle: this.customCycle,
      customCycleBlocks: this.customCycleBlocks,
      currentBlockIndex: this.currentBlockIndex,
      // Get distraction dump state for persistence
      distractionDump: window.zenPomodoroApp?.distractionDump?.getStateForPersistence(),
    };

    try {
      setPref('timer-state', JSON.stringify(state));
      logger.log(LOG_CATEGORIES.TIMER, 'Timer state saved', {
        phase: this.currentPhase,
        remaining: this.remainingTime,
        cycle: this.currentCycle,
      });
    } catch (error) {
      logger.log(LOG_CATEGORIES.TIMER, 'Failed to save timer state', { error: error.message });
    }
  }

  /**
   * Write sync state to sync storage (for cross-window synchronization)
   * @private
   */
  _writeSyncState() {
    const sync = window.zenPomodoroApp?.windowSync;
    if (!sync) return;

    // Only write if we own the timer
    if (!sync.ownsTimer) return;

    const state = {
      isActive: this.isActive,
      isPaused: this.isPaused,
      pausedOnBlockedWorkspace: this.pausedOnBlockedWorkspace,
      remainingTime: this.remainingTime,
      currentPhase: this.currentPhase,
      currentCycle: this.currentCycle,
      totalCycles: this.totalCycles,
      mode: this.mode,
      savedConfig: this.savedConfig,
      customCycle: this.customCycle,
      customCycleBlocks: this.customCycleBlocks,
      currentBlockIndex: this.currentBlockIndex,
      timestamp: Date.now(),
    };

    sync.writeState(state);
  }

  /**
   * Load timer state from preferences
   */
  loadState() {
    try {
      const stateJson = getPref('timer-state');
      if (!stateJson) {
        logger.log(LOG_CATEGORIES.TIMER, 'No saved timer state found');
        return false;
      }

      const state = JSON.parse(stateJson);
      if (!state.isActive) {
        logger.log(LOG_CATEGORIES.TIMER, 'Saved state indicates timer not active');
        return false;
      }

      // Restore state
      this.isActive = state.isActive;
      this.isPaused = state.isPaused || false;
      this.pausedOnBlockedWorkspace = state.pausedOnBlockedWorkspace || false;
      this.remainingTime = state.remainingTime;
      this.currentPhase = state.currentPhase;
      this.currentCycle = state.currentCycle;
      this.totalCycles = state.totalCycles;
      this.mode = state.mode;
      this.savedConfig = state.savedConfig;
      this.customCycle = state.customCycle;
      this.customCycleBlocks = state.customCycleBlocks;
      this.currentBlockIndex = state.currentBlockIndex || 0;

      // Store distraction dump state for later restoration
      const pendingDumpState = state.distractionDump;

      // Load fresh config (for preferences that may have changed)
      this.config = getConfig();

      // If we were paused, stay paused
      if (!this.isPaused) {
        this.startInterval();
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Timer state restored', {
        phase: this.currentPhase,
        remaining: this.remainingTime,
        cycle: this.currentCycle,
        isPaused: this.isPaused,
        mode: this.mode,
      });

      // CROSS-WINDOW SYNC: Write sync state after loading (will claim ownership)
      const sync = window.zenPomodoroApp?.windowSync;
      if (sync) {
        // Set callback to restore distraction dump after components are ready
        this.onReady = () => {
          // Restore distraction dump state if present
          if (pendingDumpState && window.zenPomodoroApp?.distractionDump) {
            window.zenPomodoroApp.distractionDump.restoreState(pendingDumpState);
            logger.log(LOG_CATEGORIES.TIMER, 'Distraction dump state restored', pendingDumpState);
          }
        };

        sync.claimOwnership();
        this._writeSyncState();
      }

      return true;
    } catch (error) {
      logger.log(LOG_CATEGORIES.TIMER, 'Failed to restore timer state', { error: error.message });
      return false;
    }
  }

  /**
   * Clear saved timer state
   */
  clearState() {
    try {
      setPref('timer-state', '');
      logger.log(LOG_CATEGORIES.TIMER, 'Timer state cleared');
    } catch (error) {
      logger.log(LOG_CATEGORIES.TIMER, 'Failed to clear timer state', { error: error.message });
    }
  }

  /**
   * Get human-readable phase label
   * @returns {string} Phase label
   */
  getPhaseLabel() {
    switch (this.currentPhase) {
      case 'focus':
        return 'Focus';
      case 'break':
        return 'Break';
      case 'long-break':
        return 'Long Break';
      case 'transition':
        return 'Break Ending Soon';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get formatted time string
   * @param {number} [seconds] - Optional seconds to format (defaults to remainingTime)
   * @returns {string} Formatted time string (MM:SS)
   */
  getFormattedTime(seconds) {
    return formatTime(seconds !== undefined ? seconds : this.remainingTime);
  }

  /**
   * Get progress percentage (0-100)
   * @returns {number} Progress percentage
   */
  getProgress() {
    if (!this.isActive) return 0;

    const totalTime = this._getTotalPhaseTime();
    if (totalTime === 0) return 100;

    const elapsed = totalTime - this.remainingTime;
    return Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
  }

  /**
   * Get total time for current phase
   * @private
   * @returns {number} Total seconds for current phase
   */
  _getTotalPhaseTime() {
    const config = this.savedConfig || this.config;

    if (this.mode === 'custom') {
      if (
        this.currentBlockIndex >= 0 &&
        this.currentBlockIndex < this.customCycleBlocks.length
      ) {
        return this.customCycleBlocks[this.currentBlockIndex].duration * 60;
      }
      return 0;
    }

    switch (this.currentPhase) {
      case 'focus':
        return config.focusDuration * 60;
      case 'break':
        return config.breakDuration * 60;
      case 'long-break':
        return config.longBreakDuration * 60;
      case 'transition':
        return TRANSITION_PHASE_DURATION_SECONDS;
      default:
        return 0;
    }
  }

  /**
   * Check if we're in a break phase (including transition)
   * @returns {boolean} True if in break phase
   */
  isInBreakPhase() {
    // 'long-break' for backwards compatibility with saved state
    // 'transition' because blocking should remain disabled during break-ending warning
    return (
      this.currentPhase === 'break' ||
      this.currentPhase === 'long-break' ||
      this.currentPhase === 'transition'
    );
  }

  /**
   * Update config (used when settings change)
   * @param {Object} newConfig - New configuration object
   */
  updateConfig(newConfig) {
    this.config = newConfig;
    logger.log(LOG_CATEGORIES.TIMER, 'Timer config updated');
  }
}

export default PomodoroTimer;
