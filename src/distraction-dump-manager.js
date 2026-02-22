import { logger } from './log-manager.js';
import { getConfig, LOG_CATEGORIES } from './helpers.js';
import { applyLastDialogPosition, setupDialogDrag } from './ui-helpers.js';

// ============================================
// DistractionDumpManager Class
// ============================================

/**
 * Manages the Distraction Dump feature.
 * Allows users to pause their timer and capture distracting thoughts
 * without blocking or using up focus time.
 */
class DistractionDumpManager {
  constructor() {
    this.isActive = false;
    this.dumpInterval = null;
    this.dumpTimeRemaining = 0;
    this.savedTimerState = null; // Stores the paused timer state
    this.dumpIndicatorClickHandler = null; // Click handler for ending dump
    this.dumpUsedThisFocusPhase = false; // Track if dump was used in current focus phase
    this.lastTickTimestamp = null;
  }

  /**
   * Reset the dump usage flag for a new focus phase.
   * Called when entering a new focus phase (new cycle or new timer).
   */
  resetForNewFocusPhase() {
    this.dumpUsedThisFocusPhase = false;
    logger.log(LOG_CATEGORIES.TIMER, 'Distraction dump reset for new focus phase');
  }

  /**
   * Export dump state for persistence across browser restarts.
   * @returns {Object} Dump state object
   */
  getStateForPersistence() {
    return {
      isActive: this.isActive,
      dumpTimeRemaining: this.dumpTimeRemaining,
      savedTimerState: this.savedTimerState,
      dumpUsedThisFocusPhase: this.dumpUsedThisFocusPhase,
      lastTickTimestamp: this.lastTickTimestamp,
    };
  }

  /**
   * Validate and restore boolean field from state.
   * @private
   * @param {*} value - Value from state
   * @returns {boolean} Validated boolean value
   */
  _restoreBooleanField(value) {
    return Boolean(value);
  }

  /**
   * Validate and restore numeric field from state.
   * @private
   * @param {*} value - Value from state
   * @returns {number} Validated number (0 if invalid)
   */
  _restoreNumericField(value) {
    return typeof value === 'number' && value >= 0 ? value : 0;
  }

  /**
   * Restore dump state from persistence.
   * @param {Object} state - Saved dump state
   * @returns {boolean} True if dump was active and restored
   */
  restoreState(state) {
    if (!state) return false;

    this.isActive = this._restoreBooleanField(state.isActive);
    this.dumpTimeRemaining = this._restoreNumericField(state.dumpTimeRemaining);
    this.savedTimerState = state.savedTimerState || null;
    this.dumpUsedThisFocusPhase = this._restoreBooleanField(state.dumpUsedThisFocusPhase);

    if (
      this.isActive &&
      typeof state.lastTickTimestamp === 'number' &&
      state.lastTickTimestamp > 0 &&
      this.dumpTimeRemaining > 0
    ) {
      const elapsed = Math.floor((Date.now() - state.lastTickTimestamp) / 1000);
      const clampedElapsed = Math.max(0, Math.min(elapsed, this.dumpTimeRemaining));
      this.dumpTimeRemaining = Math.max(0, this.dumpTimeRemaining - clampedElapsed);
      logger.log(LOG_CATEGORIES.TIMER, 'Adjusted dump time after restore', {
        elapsed: clampedElapsed,
        remaining: this.dumpTimeRemaining,
      });
    }

    return this.isActive;
  }

  /**
   * Check if distraction dump is available for the current focus phase.
   * @returns {boolean} True if dump is available
   */
  isDumpAvailable() {
    return !this.dumpUsedThisFocusPhase && !this.isActive;
  }

  /**
   * Check if a distraction dump can be started.
   * @returns {boolean} True if dump can start
   * @private
   */
  _canStartDump() {
    if (this.isActive) {
      logger.log(LOG_CATEGORIES.TIMER, 'Distraction dump already active');
      return false;
    }

    // Only one dump per focus phase is allowed
    if (this.dumpUsedThisFocusPhase) {
      logger.log(LOG_CATEGORIES.TIMER, 'Cannot start dump - already used in this focus phase');
      return false;
    }

    const timer = window.zenPomodoroApp?.timer;
    if (!timer?.isActive) {
      logger.log(LOG_CATEGORIES.TIMER, 'Cannot start dump - timer not active');
      return false;
    }

    // Only allow during focus phase
    if (timer.currentPhase !== 'focus') {
      logger.log(LOG_CATEGORIES.TIMER, 'Cannot start dump - not in focus phase');
      return false;
    }

    return true;
  }

  /**
   * Enable dump mode - pause timer and lift all blocks.
   * @private
   */
  _enableDumpMode() {
    const timer = window.zenPomodoroApp?.timer;

    // Pause the main timer if not already paused
    if (timer && !timer.isPaused) {
      timer.pause();
    }

    // Notify WebsiteBlocker that dump is active
    if (window.zenPomodoroApp?.websiteBlocker) {
      window.zenPomodoroApp.websiteBlocker.distractionDumpActive = true;
      window.zenPomodoroApp.websiteBlocker._checkCurrentPage();
    }

    // Hide workspace overlay if showing
    window.zenPomodoroApp?.overlay?.hide();
  }

  /**
   * Disable dump mode - restore timer and all blocks.
   * @private
   */
  _disableDumpMode() {
    this._restoreWebsiteBlocker();
    this._restoreTimerIfNotPausedBefore();
    window.zenPomodoroApp?.updateOverlayVisibility?.();
  }

  /**
   * Restore the website blocker after dump ends.
   * @private
   */
  _restoreWebsiteBlocker() {
    const websiteBlocker = window.zenPomodoroApp?.websiteBlocker;
    if (websiteBlocker) {
      websiteBlocker.distractionDumpActive = false;
      websiteBlocker._checkCurrentPage();
    }
  }

  /**
   * Resume the main timer only if it wasn't paused before dump started.
   * This preserves the user's intent if they had manually paused before starting dump.
   * @private
   */
  _restoreTimerIfNotPausedBefore() {
    const timer = window.zenPomodoroApp?.timer;
    const wasPausedBefore = this.savedTimerState?.isPaused;
    const shouldResume = timer?.isActive && timer.isPaused && !wasPausedBefore;
    if (shouldResume) {
      timer.resume();
    }
  }

  /**
   * Start a distraction dump session using configured duration.
   */
  startDump() {
    // Check if feature is enabled
    const config = getConfig();
    if (!config.distractionDumpEnabled) {
      logger.log(LOG_CATEGORIES.TIMER, 'Cannot start dump - feature is disabled');
      return;
    }

    if (!this._canStartDump()) return;

    // CROSS-WINDOW SYNC: Claim ownership before starting dump if in secondary window
    if (typeof window.zenPomodoroApp?._claimOwnershipForAction === 'function') {
      window.zenPomodoroApp._claimOwnershipForAction();
    }

    const duration = config.distractionDumpDuration;
    const timer = window.zenPomodoroApp?.timer;

    logger.log(LOG_CATEGORIES.TIMER, 'Starting distraction dump', { duration });

    this.isActive = true;
    this.dumpUsedThisFocusPhase = true; // Mark dump as used for this focus phase
    this.dumpTimeRemaining = duration * 60; // Convert to seconds

    // Save current timer state
    this.savedTimerState = {
      remainingTime: timer.remainingTime,
      isPaused: timer.isPaused,
    };

    this._enableDumpMode();
    
    // Set up small purple indicator with click handler to end dump
    this._setupDumpIndicator();
    this.lastTickTimestamp = Date.now();

    // Start countdown
    this.dumpInterval = setInterval(() => {
      const now = Date.now();
      const rawElapsed = this.lastTickTimestamp
        ? Math.floor((now - this.lastTickTimestamp) / 1000)
        : 1;
      const elapsed = Math.max(1, rawElapsed);
      this.lastTickTimestamp = now;
      this.dumpTimeRemaining = Math.max(0, this.dumpTimeRemaining - elapsed);
      this._updateDisplay(this.dumpTimeRemaining);

      if (this.dumpTimeRemaining <= 0) {
        this.endDump();
      }
    }, 1000);
  }

  /**
   * Set up dump indicator and click handler.
   * @private
   */
  _setupDumpIndicator() {
    const overlay = window.zenPomodoroApp?.overlay;
    if (!overlay) return;

    // Show dump indicator
    overlay.showDumpIndicator(this.dumpTimeRemaining);

    // Set up click handler to end dump (but not if indicator was dragged)
    const indicator = overlay.indicator;
    if (indicator) {
      // Store handler for cleanup
      this.dumpIndicatorClickHandler = () => {
        // Skip if the indicator was just dragged (to prevent accidental end dump)
        if (overlay.indicatorDidDrag) {
          return;
        }
        this.showEndDumpConfirmation();
      };
      indicator.addEventListener('click', this.dumpIndicatorClickHandler);
    }
  }

  /**
   * Show confirmation dialog to end dump early.
   */
  showEndDumpConfirmation() {
    if (!this.isActive) return;

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-dump-end-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    const title = document.createElement('h2');
    title.className = 'zen-pomodoro-dialog-title';
    title.textContent = 'End Distraction Dump?';
    dialog.appendChild(title);

    const description = document.createElement('p');
    description.className = 'zen-pomodoro-dialog-description';
    description.textContent = 'End the dump and resume your focus timer? All blocks will be restored.';
    dialog.appendChild(description);

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      dialog.remove();
    });

    const endButton = document.createElement('button');
    endButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-dialog-button-primary';
    endButton.textContent = 'End Dump & Resume';
    endButton.addEventListener('click', () => {
      dialog.remove();
      this.endDump();
    });

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(endButton);
    dialog.appendChild(buttonDiv);

    document.documentElement.appendChild(dialog);
    applyLastDialogPosition(dialog);
    setupDialogDrag(dialog);
  }

  /**
   * Clean up dump UI (indicator click handler and interval).
   * @private
   */
  _cleanupDumpUI() {
    if (this.dumpInterval) {
      clearInterval(this.dumpInterval);
      this.dumpInterval = null;
    }

    // Remove click handler from indicator
    const overlay = window.zenPomodoroApp?.overlay;
    const indicator = overlay?.indicator;
    if (indicator && this.dumpIndicatorClickHandler) {
      indicator.removeEventListener('click', this.dumpIndicatorClickHandler);
      this.dumpIndicatorClickHandler = null;
    }

    // Hide dump indicator and restore normal indicator
    overlay?.hideDumpIndicator();
  }

  /**
   * End the distraction dump and restore the timer.
   */
  endDump() {
    if (!this.isActive) return;

    // CROSS-WINDOW SYNC: Claim ownership before ending dump if in secondary window
    if (typeof window.zenPomodoroApp?._claimOwnershipForAction === 'function') {
      window.zenPomodoroApp._claimOwnershipForAction();
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Ending distraction dump');

    this.isActive = false;
    this._cleanupDumpUI();
    this._disableDumpMode();
    this.savedTimerState = null;
  }

  /**
   * Update the dump indicator display.
   * @param {number} timeInSeconds - Time remaining in seconds
   * @private
   */
  _updateDisplay(timeInSeconds) {
    const overlay = window.zenPomodoroApp?.overlay;
    if (overlay) {
      overlay.updateDumpIndicator(timeInSeconds);
    }
  }

  /**
   * Clean up the distraction dump manager.
   */
  destroy() {
    if (this.isActive) {
      this.endDump();
    }
  }
}

export default DistractionDumpManager;
