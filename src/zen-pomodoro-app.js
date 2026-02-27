import Constants from './constants.js';
import { logger } from './log-manager.js';
import {
  getConfig, saveConfig,
  formatTime, getPhaseLabel,
  sendBrowserNotification, isPopupWindow,
  LOG_CATEGORIES,
  RESTORATION_NOTIFICATION_DELAY_MS, DOM_SETTLE_DELAY_MS
} from './helpers.js';
import {
  applyLastDialogPosition, setupDialogDrag
} from './ui-helpers.js';
import { isInBreakPhase } from './break-phase-utils.js';
import PomodoroTimer from './pomodoro-timer.js';
import WindowSyncManager from './window-sync-manager.js';
import WorkspaceDetector from './workspace-detector.js';
import OverlayManager from './overlay-manager.js';
import KeyboardShortcutHandler from './keyboard-shortcut-handler.js';
import SecurityManager from './security-manager.js';
import SineModBlocker from './sine-mod-blocker.js';
import WebsiteBlocker from './website-blocker.js';
import TransitionPhaseManager from './transition-phase-manager.js';
import DailyReminderManager from './daily-reminder-manager.js';
import PostSessionReminderManager from './post-session-reminder-manager.js';
import DistractionDumpManager from './distraction-dump-manager.js';
import CustomCycleManager from './custom-cycle-manager.js';

// ============================================
// Main Application Class
// ============================================

class ZenPomodoroApp {
  constructor({ storage = null } = {}) {
    this.timer = new PomodoroTimer();
    this.windowSync = new WindowSyncManager(); // Cross-window timer sync
    if (storage && typeof this.windowSync.setStorage === 'function') {
      this.windowSync.setStorage(storage);
    }
    this.workspace = new WorkspaceDetector();
    this.overlay = new OverlayManager();
    this.keyboardShortcut = new KeyboardShortcutHandler();
    this.security = new SecurityManager();
    this.sineModBlocker = new SineModBlocker(); // NEW: Sine Mod settings blocker
    this.websiteBlocker = new WebsiteBlocker(); // NEW: LeechBlock-style website blocker
    this.transitionManager = new TransitionPhaseManager(); // Transition popup manager
    this.dailyReminder = new DailyReminderManager(); // Daily reminders at configured times
    this.postSessionReminder = new PostSessionReminderManager(); // Post-session idle reminder
    this.distractionDump = new DistractionDumpManager(); // Distraction dump for capturing thoughts
    this.customCycles = new CustomCycleManager(); // Custom cycle manager for advanced pomodoro cycles
    this.logger = logger; // Expose logger instance
    this.notificationPermissionRequested = false;
    this.initialized = false; // DUPLICATE FIX: Track initialization to prevent duplicate setup
    this._prefTriggerObserver = null;
    this._lastExportLogsTriggerAt = 0;
    this._isResettingExportLogsPref = false;

    this.init();
  }

  /**
   * Initialize the application
   * DUPLICATE FIX: Prevent duplicate initialization with guard
   */
  init() {
    if (this.initialized) {
      console.warn('Zen Pomodoro already initialized, skipping duplicate init');
      return;
    }

    logger.log(LOG_CATEGORIES.INIT, 'Application initializing');
    console.log('Zen Pomodoro Focus Blocker initializing...');

    // Wait for browser to be fully loaded
    // DUPLICATE FIX: Use once option to prevent duplicate listeners
    if (document.readyState === 'complete') {
      this.onReady();
    } else {
      window.addEventListener('load', () => this.onReady(), { once: true });
    }
  }

  /**
   * Called when browser is ready
   */
  onReady() {
    // Double-check guard since init() already checks, but safer for edge cases
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    logger.log(LOG_CATEGORIES.INIT, 'Application ready');
    console.log('Zen Pomodoro Focus Blocker ready');

    // Expose app globally early so restoration code can access it
    window.zenPomodoroApp = this;

    this._initCrossWindowSync();
    this._migrateBlockedWorkspacesToRulesets();
    this._initModules();
    this._initPreferenceTriggers();
    this._restoreTimerState();
    this.requestNotificationPermission();
    this._initReminderManagers();

    logger.log(LOG_CATEGORIES.INIT, 'Application initialization complete');
  }

  /**
   * Initialize cross-window synchronization system
   * @private
   */
  _initCrossWindowSync() {
    logger.log(LOG_CATEGORIES.INIT, 'Initializing cross-window sync');
    this.windowSync.init();
    logger.setWindowId(this.windowSync.windowId);
    logger.initSync();
    logger.requestExistingLogs();

    // Setup sync callbacks
    this.windowSync.onSyncStateChanged = (syncState) => {
      this._onSyncStateReceived(syncState);
    };
    this.windowSync.onOwnershipLost = () => {
      this._onOwnershipLost();
    };
    this.windowSync.onOwnershipTaken = (syncState) => {
      this._onOwnershipTaken(syncState);
    };
    this.windowSync.onReminderSyncChanged = (syncData) => {
      this._onReminderSyncReceived(syncData);
    };
  }

  /**
   * Initialize all modules and setup their callbacks
   * @private
   */
  _initModules() {
    // Initialize keyboard shortcut handler
    logger.log(LOG_CATEGORIES.INIT, 'Initializing keyboard shortcut handler');
    this.keyboardShortcut.init();

    // Start workspace monitoring
    logger.log(LOG_CATEGORIES.INIT, 'Starting workspace monitoring');
    this.workspace.startMonitoring();

    // Initialize Sine Mod Blocker
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Sine Mod Blocker');
    this.sineModBlocker.init();

    // Initialize Website Blocker
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Website Blocker');
    this.websiteBlocker.init();

    // Setup timer callbacks
    this.timer.onTick = (time, phase, cycle, total) => {
      this.onTimerTick(time, phase, cycle, total);
    };

    this.timer.onPhaseChange = (phase, cycle) => {
      this.onPhaseChange(phase, cycle);
    };

    this.timer.onComplete = () => {
      this.onTimerComplete();
    };

    // Setup transition phase callbacks
    this.timer.onTransitionStart = () => {
      this.onTransitionStart();
    };

    this.timer.onTransitionEnd = () => {
      this.onTransitionEnd();
    };

    // Setup transition manager callback (called when popup closes)
    this.transitionManager.onTransitionComplete = () => {
      this.onTransitionPopupComplete();
    };

    // Setup workspace change callback
    this.workspace.onWorkspaceChange = (workspaceId, isBlocked) => {
      this.onWorkspaceChange(workspaceId, isBlocked);
    };
  }

  /**
   * Initialize observer for Sine preference-triggered actions.
   * @private
   */
  _initPreferenceTriggers() {
    if (this._prefTriggerObserver) {
      return;
    }

    this._prefTriggerObserver = {
      observe: (subject, topic, data) => {
        this._handlePreferenceTrigger(data);
      },
    };

    try {
      Services.prefs.addObserver(`${Constants.PREF_PREFIX}.`, this._prefTriggerObserver);
    } catch (e) {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Failed to initialize preference trigger observer', {
        error: e.message,
      });
    }
  }

  /**
   * Handle preference-triggered actions from Sine preferences.
   * @param {string} prefName - Full preference key
   * @private
   */
  _handlePreferenceTrigger(prefName) {
    const exportPrefName = `${Constants.PREF_PREFIX}.${Constants.EXPORT_LOGS_REQUEST_PREF_KEY}`;
    if (prefName !== exportPrefName) {
      return;
    }

    this._handleExportLogsPreferenceTrigger();
  }

  /**
   * Handle export logs trigger pref and reset trigger value.
   * @private
   */
  _handleExportLogsPreferenceTrigger() {
    if (this._isResettingExportLogsPref) {
      return;
    }

    const exportPrefName = `${Constants.PREF_PREFIX}.${Constants.EXPORT_LOGS_REQUEST_PREF_KEY}`;
    let shouldExport = false;

    try {
      const prefType = Services.prefs.getPrefType(exportPrefName);
      if (prefType === Services.prefs.PREF_BOOL) {
        shouldExport = Services.prefs.getBoolPref(exportPrefName, false);
      } else if (prefType === Services.prefs.PREF_STRING) {
        // Defensive support for string trigger values from older/manual pref edits.
        const value = Services.prefs.getCharPref(exportPrefName, '').trim().toLowerCase();
        shouldExport = value === 'true' || value === '1' || value === 'export';
      }
    } catch (e) {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Failed to read export logs preference trigger', {
        error: e.message,
      });
    }

    if (!shouldExport) {
      return;
    }

    const now = Date.now();
    if (now - this._lastExportLogsTriggerAt < Constants.EXPORT_LOGS_TRIGGER_DEBOUNCE_MS) {
      this._resetExportLogsTriggerPref();
      return;
    }

    this._lastExportLogsTriggerAt = now;

    try {
      logger.exportLogs();
    } finally {
      this._resetExportLogsTriggerPref();
    }
  }

  /**
   * Reset export logs trigger preference after handling.
   * @private
   */
  _resetExportLogsTriggerPref() {
    const exportPrefName = `${Constants.PREF_PREFIX}.${Constants.EXPORT_LOGS_REQUEST_PREF_KEY}`;

    try {
      this._isResettingExportLogsPref = true;
      Services.prefs.setBoolPref(exportPrefName, false);
    } catch (e) {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Failed to reset export logs preference trigger', {
        error: e.message,
      });
    } finally {
      this._isResettingExportLogsPref = false;
    }
  }

  /**
   * Restore timer state from previous session
   * @private
   */
  _restoreTimerState() {
    const restored = this.timer.loadState();
    if (!restored) {
      return;
    }

    // CROSS-WINDOW SYNC: Check if another window is actively managing the timer
    const isAnotherWindowActive = this.windowSync.isAnotherWindowActive();

    if (isAnotherWindowActive) {
      this._handleSecondaryWindowSync();
    } else {
      this._handlePrimaryWindowRestore();
    }
  }

  /**
   * Handle timer sync for secondary window (when another window is active)
   * @private
   */
  _handleSecondaryWindowSync() {
    // Another window is running the timer - sync from it instead of treating as restart
    logger.log(LOG_CATEGORIES.INIT, 'Another window is active - syncing timer state');

    // Read more accurate state from sync pref (updated every tick by owner)
    const syncState = this.windowSync.readSyncState();
    if (syncState) {
      this.timer.syncFromState(syncState);
    }

    // Show indicator with correct paused state (NOT forced paused)
    this.overlay.showIndicator();
    this.overlay.updateIndicatorPausedState(this.timer.isPaused);
    this.updateOverlayVisibility();

    // Update display with current timer values
    if (this.timer.onTick) {
      this.timer.onTick(
        this.timer.remainingTime,
        this.timer.currentPhase,
        this.timer.currentCycle,
        this.timer.totalCycles
      );
    }

    // Start heartbeat monitoring (detect if owner dies)
    this.windowSync.startHeartbeatMonitor();

    // Notify blockers that timer is active
    this.sineModBlocker.onTimerStart();
    this.websiteBlocker.onTimerStart();

    // Do NOT show "Timer Restored" notification - this is not a restart
    this.timer.restoredFromRestart = false;
  }

  /**
   * Handle timer restoration for primary window (genuine browser restart)
   * @private
   */
  _handlePrimaryWindowRestore() {
    // No other window active - this is a genuine browser restart
    logger.log(LOG_CATEGORIES.INIT, 'Timer state restored from previous session');
    console.log('Restored timer state from previous session');

    // Claim ownership since we're the only window
    this.windowSync.claimOwnership();

    // INDICATOR FIX: Show indicator after state restoration
    this.overlay.showIndicator();
    // Ensure paused state is reflected on the indicator since timer is paused on restore
    this.overlay.updateIndicatorPausedState(true);
    this.updateOverlayVisibility();

    this._restoreDistractionDumpIfNeeded();
    this._showTransitionPopupIfNeeded();
    this._showRestorationNotificationIfNeeded();
  }

  /**
   * Restore distraction dump state if it was active before restart
   * @private
   */
  _restoreDistractionDumpIfNeeded() {
    if (!this.timer.pendingDumpState) {
      return;
    }

    const dumpRestored = this.distractionDump.restoreState(this.timer.pendingDumpState);
    if (dumpRestored) {
      logger.log(LOG_CATEGORIES.INIT, 'Distraction dump state restored');
      // Re-enable dump mode (pause timer, lift blocks)
      this.distractionDump._enableDumpMode();
      this.distractionDump._setupDumpIndicator();
      this.distractionDump.lastTickTimestamp = Date.now();
      // Restart the dump countdown
      this.distractionDump.dumpInterval = setInterval(() => {
        const now = Date.now();
        const rawElapsed = this.distractionDump.lastTickTimestamp
          ? Math.floor((now - this.distractionDump.lastTickTimestamp) / 1000)
          : 1;
        const elapsed = Math.max(1, rawElapsed);
        this.distractionDump.lastTickTimestamp = now;
        this.distractionDump.dumpTimeRemaining = Math.max(
          0,
          this.distractionDump.dumpTimeRemaining - elapsed
        );
        this.distractionDump._updateDisplay(this.distractionDump.dumpTimeRemaining);
        if (this.distractionDump.dumpTimeRemaining <= 0) {
          this.distractionDump.endDump();
        }
      }, 1000);
    }
    this.timer.pendingDumpState = null;
  }

  /**
   * Show transition popup if timer was restored into transition phase
   * @private
   */
  _showTransitionPopupIfNeeded() {
    if (this.timer.currentPhase === 'transition') {
      this.transitionManager.showTransitionPopup();
    }
  }

  /**
   * Show restoration notification if needed (not in popup windows)
   * @private
   */
  _showRestorationNotificationIfNeeded() {
    if (!this.timer.restoredFromRestart) {
      return;
    }

    // AUTO-PAUSE FIX: Show notification that timer was paused
    // POPUP FIX: Only show restoration notification in main browser window, not popups
    if (!isPopupWindow()) {
      setTimeout(() => {
        this.showRestorationNotification();
      }, RESTORATION_NOTIFICATION_DELAY_MS);
    } else {
      logger.log(LOG_CATEGORIES.INIT, 'Skipping restoration notification in popup window');
    }

    this.timer.restoredFromRestart = false;
  }

  /**
   * Initialize daily and post-session reminder managers
   * @private
   */
  _initReminderManagers() {
    // Initialize Daily Reminder Manager (after app is globally exposed)
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Daily Reminder Manager');
    this.dailyReminder.onStartTimer = () => {
      // Hide reminder first, then show start timer dialog
      this.dailyReminder.hideReminder();
      this.keyboardShortcut.showConfigDialog();
    };
    this.dailyReminder.init();

    // Initialize Post-Session Reminder Manager
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Post-Session Reminder Manager');
    this.postSessionReminder.onStartTimer = () => {
      // Hide reminder first, then show start timer dialog
      this.postSessionReminder.hideReminder();
      this.keyboardShortcut.showConfigDialog();
    };
    this.postSessionReminder.init();
  }

  /**
   * Request notification permission
   * MISSING FEATURE: Notification permission request
   */
  requestNotificationPermission() {
    const config = getConfig();
    if (config.enableNotifications && !this.notificationPermissionRequested) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission()
          .then((permission) => {
            console.log('Notification permission:', permission);
            this.notificationPermissionRequested = true;
          })
          .catch((err) => {
            console.error('Failed to request notification permission:', err);
          });
      } else {
        this.notificationPermissionRequested = true;
      }
    }
  }

  /**
   * Start the timer
   */
  /**
   * Start the timer
   * @param {string} mode - Timer mode ('pomodoro' or 'simple')
   * @param {number} cycles - Number of pomodoro cycles
   * @param {Object} sessionOverrides - Optional session-only duration overrides
   */
  startTimer(mode = 'pomodoro', cycles = 4, sessionOverrides = {}) {
    console.log(`Starting timer: mode=${mode}, cycles=${cycles}`);

    this.timer.start(mode, cycles, sessionOverrides);
    this.overlay.showIndicator();
    this.updateOverlayVisibility();

    // Reset distraction dump availability for new timer session
    this.distractionDump.resetForNewFocusPhase();

    // Notify Sine Mod Blocker that timer started
    this.sineModBlocker.onTimerStart();

    // Notify Website Blocker that timer started
    this.websiteBlocker.onTimerStart();

    // Record timer start date for daily reminder tracking
    this.dailyReminder.recordTimerStarted();

    // Hide daily reminder if showing (timer has been started)
    this.dailyReminder.hideReminder();

    // Notify Post-Session Reminder that timer started (resets idle tracking)
    this.postSessionReminder.onTimerStart();

    // Broadcast timer start to other windows to hide reminders
    this.windowSync.writeReminderSync({ action: 'timer-started' });

    // Double-check overlay visibility after a short delay
    // This ensures the DOM has settled after timer start
    setTimeout(() => {
      this.updateOverlayVisibility();
    }, DOM_SETTLE_DELAY_MS);
  }

  /**
   * Start a custom cycle timer
   * @param {Object} customCycle - Custom cycle configuration object
   */
  startCustomCycle(customCycle) {
    logger.log(LOG_CATEGORIES.TIMER, 'Starting custom cycle', { cycleName: customCycle.name });

    this.timer.startCustomCycle(customCycle);
    this.overlay.showIndicator();
    this.updateOverlayVisibility();

    // Reset distraction dump availability for new timer session
    this.distractionDump.resetForNewFocusPhase();

    // Notify Sine Mod Blocker that timer started
    this.sineModBlocker.onTimerStart();

    // Notify Website Blocker that timer started
    this.websiteBlocker.onTimerStart();

    // Record timer start date for daily reminder tracking
    this.dailyReminder.recordTimerStarted();

    // Hide daily reminder if showing (timer has been started)
    this.dailyReminder.hideReminder();

    // Notify Post-Session Reminder that timer started (resets idle tracking)
    this.postSessionReminder.onTimerStart();

    // Broadcast timer start to other windows to hide reminders
    this.windowSync.writeReminderSync({ action: 'timer-started' });

    // Double-check overlay visibility after a short delay
    // This ensures the DOM has settled after timer start
    setTimeout(() => {
      this.updateOverlayVisibility();
    }, DOM_SETTLE_DELAY_MS);
  }

  /**
   * Handle sync state received from the owner window.
   * Updates timer state and UI for secondary windows.
   * @param {Object} syncState - Timer state from owner window
   * @private
   */
  _onSyncStateReceived(syncState) {
    const wasActive = this.timer.isActive;
    const oldPhase = this.timer.currentPhase;

    // Update timer state
    this.timer.syncFromState(syncState);

    // Update UI
    this.overlay.updateDisplay(
      syncState.remainingTime,
      syncState.currentPhase,
      syncState.currentCycle,
      syncState.totalCycles
    );
    this.overlay.updateIndicatorPausedState(syncState.isPaused);
    this.updateOverlayVisibility();

    this._syncDumpState(syncState);
    this._handleRemoteTimerStop(wasActive, syncState);
    this._handleRemoteTimerStart(wasActive, syncState);
    this._handleRemotePhaseChange(oldPhase, syncState);
  }

  /**
   * Sync distraction dump state from owner window to this secondary window.
   * @param {Object} syncState - Timer state from owner window
   * @private
   */
  _syncDumpState(syncState) {
    if (!this._canSyncDumpState(syncState)) return;
    const wasInDump = this.distractionDump.isActive || false;

    if (syncState.dumpActive && !wasInDump) {
      this._applyRemoteDumpStart(syncState);
    } else if (!syncState.dumpActive && wasInDump) {
      this._applyRemoteDumpEnd();
    }
  }

  /**
   * Check if dump state sync is possible.
   * @param {Object} syncState - Timer sync state
   * @returns {boolean} True if dump state can be synced
   * @private
   */
  _canSyncDumpState(syncState) {
    return syncState.dumpActive !== undefined && this.websiteBlocker && this.distractionDump;
  }

  /**
   * Apply dump-started state from the owner window to this secondary window.
   * @param {Object} syncState - Timer sync state containing dump fields
   * @private
   */
  _applyRemoteDumpStart(syncState) {
    this.distractionDump.isActive = true;
    this.distractionDump.dumpTimeRemaining = syncState.dumpTimeRemaining || 0;
    this.distractionDump.dumpUsedThisFocusPhase = syncState.dumpUsedThisFocusPhase || false;
    this.websiteBlocker.distractionDumpActive = true;
    this.websiteBlocker._checkCurrentPage();
    this.overlay.hide();
    if (this.overlay?.showDumpIndicator) {
      this.overlay.showDumpIndicator(syncState.dumpTimeRemaining || 0);
    }
  }

  /**
   * Apply dump-ended state from the owner window to this secondary window.
   * @private
   */
  _applyRemoteDumpEnd() {
    this.distractionDump.isActive = false;
    this.distractionDump.dumpTimeRemaining = 0;
    this.websiteBlocker.distractionDumpActive = false;
    this.websiteBlocker._checkCurrentPage();
    this.updateOverlayVisibility();
    if (this.overlay?.hideDumpIndicator) {
      this.overlay.hideDumpIndicator();
    }
  }

  /**
   * Handle remote timer stop event in secondary window.
   * @param {boolean} wasActive - Whether timer was active before sync
   * @param {Object} syncState - Timer state from owner window
   * @private
   */
  _handleRemoteTimerStop(wasActive, syncState) {
    if (!wasActive || syncState.isActive) return;
    logger.log(LOG_CATEGORIES.SYNC, 'Timer stopped remotely');
    this.overlay.hide();
    this.overlay.hideIndicator();
    this.transitionManager.destroy();
    this.sineModBlocker.onTimerStop();
    this.websiteBlocker.onTimerStop();
    this.windowSync.stopHeartbeatMonitor();
  }

  /**
   * Handle remote timer start event in secondary window.
   * @param {boolean} wasActive - Whether timer was active before sync
   * @param {Object} syncState - Timer state from owner window
   * @private
   */
  _handleRemoteTimerStart(wasActive, syncState) {
    if (wasActive || !syncState.isActive) return;
    logger.log(LOG_CATEGORIES.SYNC, 'Timer started remotely');
    this.overlay.showIndicator();
    this.sineModBlocker.onTimerStart();
    this.websiteBlocker.onTimerStart();
    this.windowSync.startHeartbeatMonitor();
  }

  /**
   * Handle remote phase change event in secondary window.
   * @param {string} oldPhase - Previous phase before sync
   * @param {Object} syncState - Timer state from owner window
   * @private
   */
  _handleRemotePhaseChange(oldPhase, syncState) {
    if (oldPhase === syncState.currentPhase) return;
    logger.log(LOG_CATEGORIES.SYNC, 'Phase changed remotely', {
      oldPhase,
      newPhase: syncState.currentPhase,
    });
    if (syncState.currentPhase === 'focus') {
      this.distractionDump.resetForNewFocusPhase();
    }
  }

  /**
   * Handle reminder sync received from another window.
   * Hides reminders on this window when dismissed/skipped on another window.
   * @param {Object} syncData - Reminder action data from another window
   * @private
   */
  _onReminderSyncReceived(syncData) {
    if (!syncData || !syncData.action) return;
    logger.log(LOG_CATEGORIES.SYNC, 'Reminder sync received', { action: syncData.action });

    switch (syncData.action) {
      case 'daily-dismissed':
      case 'daily-skipped':
        this._hideDailyReminderFromSync();
        break;
      case 'post-session-dismissed':
      case 'post-session-skipped':
        this._hidePostSessionReminderFromSync();
        break;
      case 'timer-started':
        this._hideDailyReminderFromSync();
        this._hidePostSessionReminderFromSync();
        break;
    }
  }

  /**
   * Hide daily reminder on this window due to a sync event from another window.
   * @private
   */
  _hideDailyReminderFromSync() {
    if (this.dailyReminder?.isShowing) {
      this.dailyReminder.hideReminder(true);
    }
  }

  /**
   * Hide post-session reminder on this window due to a sync event from another window.
   * @private
   */
  _hidePostSessionReminderFromSync() {
    if (this.postSessionReminder?.isShowing) {
      this.postSessionReminder.hideReminder(true);
    }
  }

  /**
   * Handle loss of timer ownership to another window.
   * Stops local interval and becomes a secondary window.
   * @private
   */
  _onOwnershipLost() {
    logger.log(LOG_CATEGORIES.SYNC, 'Ownership lost - switching to secondary mode');
    // Stop our interval since we're no longer the owner
    if (this.timer.intervalId) {
      clearInterval(this.timer.intervalId);
      this.timer.intervalId = null;
    }
    // Start heartbeat monitoring to detect if new owner dies
    this.windowSync.startHeartbeatMonitor();
  }

  /**
   * Handle taking over timer ownership from a dead/crashed owner window.
   * Resumes the timer interval with adjusted remaining time.
   * @param {Object} syncState - Last known timer state from dead owner
   * @private
   */
  _onOwnershipTaken(syncState) {
    logger.log(LOG_CATEGORIES.SYNC, 'Taking over timer ownership', {
      remainingTime: syncState.remainingTime,
      phase: syncState.currentPhase,
    });

    // Update timer state from the last known sync state
    this.timer.syncFromState(syncState);

    // If timer was running (not paused), start our own interval
    if (this.timer.isActive && !this.timer.isPaused) {
      this.timer.startInterval();
    } else if (this.timer.isActive && this.timer.isPaused) {
      // Timer was paused - don't start interval, just update UI
      this.overlay.updateIndicatorPausedState(true);
    }

    this.updateOverlayVisibility();
  }

  /**
   * Claim ownership for a user-initiated action in a secondary window.
   * Ensures this window becomes the owner before modifying timer state.
   * @private
   */
  _claimOwnershipForAction() {
    if (!this.windowSync.isTimerOwner && this.timer.isActive) {
      this.windowSync.claimOwnership();
      // Start interval since we're now the owner
      if (!this.timer.intervalId) {
        this.timer.startInterval();
      }
      // Write initial sync state immediately so other windows see the update
      this.timer._writeSyncState();
    }
  }

  /**
   * Stop the timer
   */
  stopTimer() {
    logger.log(LOG_CATEGORIES.TIMER, 'Stop timer requested by user');

    // CROSS-WINDOW SYNC: Claim ownership before stopping
    this._claimOwnershipForAction();

    this.timer.stop();
    this.overlay.hide();
    this.overlay.hideIndicator();

    // Clean up transition popup if showing
    this.transitionManager.destroy();

    // Notify Sine Mod Blocker that timer stopped
    this.sineModBlocker.onTimerStop();

    // Notify Website Blocker that timer stopped
    this.websiteBlocker.onTimerStop();

    // CROSS-WINDOW SYNC: Stop heartbeat monitoring since timer is stopped
    this.windowSync.stopHeartbeatMonitor();
  }

  /**
   * Handle timer tick
   */
  onTimerTick(time, phase, cycle, total) {
    this.overlay.updateDisplay(time, phase, cycle, total);
    this.updateOverlayVisibility();
  }

  /**
   * Handle phase change
   */
  onPhaseChange(phase, cycle) {
    logger.log(LOG_CATEGORIES.TIMER, 'Phase change notification', { phase: phase, cycle: cycle });

    this.overlay.updatePhaseColor(phase);
    this.updateOverlayVisibility();

    // Reset distraction dump availability when entering a new focus phase
    if (phase === 'focus') {
      this.distractionDump.resetForNewFocusPhase();
    }

    // Show notification if enabled
    const config = getConfig();
    if (config.enableNotifications) {
      this.showNotification(phase);
    }
  }

  /**
   * Handle timer completion
   */
  onTimerComplete() {
    logger.log(LOG_CATEGORIES.TIMER, 'Timer session completed');

    this.overlay.hide();
    this.overlay.hideIndicator();

    // Show completion notification
    this.showNotification('complete');

    // Reset daily reminder skip state
    this.dailyReminder.onTimerComplete();

    // Notify Post-Session Reminder that timer completed (starts idle tracking)
    this.postSessionReminder.onTimerComplete();
  }

  /**
   * Handle transition phase start (break phase ended, show popup)
   */
  onTransitionStart() {
    logger.log(LOG_CATEGORIES.TIMER, 'Transition phase starting - showing popup');

    // Show the transition popup
    this.transitionManager.showTransitionPopup();

    // Update overlay visibility (blocking should remain disabled during transition)
    this.updateOverlayVisibility();

    // Show notification about break ending
    const config = getConfig();
    if (config.enableNotifications) {
      this.showNotification('transition');
    }
  }

  /**
   * Handle transition phase end (timer hit zero)
   * Called by the timer when transition countdown completes
   */
  onTransitionEnd() {
    logger.log(LOG_CATEGORIES.TIMER, 'Transition timer ended - hiding popup');

    // Hide the popup (which triggers onTransitionPopupComplete)
    this.transitionManager.hideTransitionPopup();
  }

  /**
   * Handle transition popup completion (popup closed, start focus)
   * Called when the transition popup is closed (by timer or button)
   */
  onTransitionPopupComplete() {
    logger.log(LOG_CATEGORIES.TIMER, 'Transition popup closed - starting focus phase');

    // CROSS-WINDOW SYNC: Claim ownership before modifying timer
    this._claimOwnershipForAction();

    // Start the actual focus phase
    this.timer.startFocusFromTransition();

    // Update overlay visibility (re-enable blocking)
    this.updateOverlayVisibility();

    // Notify blockers that focus is starting
    this.websiteBlocker.onTimerStart();
  }

  /**
   * Handle workspace change
   */
  onWorkspaceChange(workspaceId, isBlocked) {
    logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace changed', {
      workspaceId: workspaceId,
      isBlocked: isBlocked,
      timerActive: this.timer.isActive,
      timerPaused: this.timer.isPaused,
      // TODO: pausedOnBlockedWorkspace is logged for debugging but no longer affects overlay logic.
      // Can be removed from this log and PomodoroTimer class in future cleanup.
      pausedOnBlockedWorkspace: this.timer.pausedOnBlockedWorkspace,
    });

    // Pass workspace info to updateOverlayVisibility to avoid re-querying DOM
    this.updateOverlayVisibility(workspaceId, isBlocked);
  }

  /**
   * Update overlay visibility based on current state
   * Bug Fix: Also hide indicator when timer is not active
   * BREAK PHASE FIX: Overlay is hidden during break phases to allow free browsing
   * TRANSITION PHASE FIX: Overlay is hidden during transition phase to allow free browsing
   *
   * Blocking behavior (applies to both paused and running states):
   *   - Blocked workspaces → show overlay (determined by this.workspace.isCurrentWorkspaceBlocked())
   *   - Unblocked workspaces → hide overlay
   *
   * @param {string} workspaceId - Optional workspace ID to check (avoids DOM re-query)
   * @param {boolean} isBlocked - Optional pre-computed blocked status (avoids re-computation)
   */
  updateOverlayVisibility(workspaceId = null, isBlocked = null) {
    // Handle timer inactive state
    if (!this.timer.isActive) {
      this._hideOverlayAndIndicator();
      return;
    }

    // Handle distraction dump active - all blocking should be lifted
    const dumpManager = window.zenPomodoroApp?.distractionDump;
    if (dumpManager?.isActive) {
      this.overlay.hide();
      // Keep dump indicator visible (it's managed by DistractionDumpManager)
      return;
    }

    // Handle paused during break phase
    if (this._isPausedDuringBreak()) {
      this._handlePausedBreakPhase(isBlocked);
      return;
    }

    // Handle active break phase
    if (this._isInActiveBreakPhase()) {
      this._hideOverlayKeepIndicator();
      return;
    }

    // Handle transition phase
    if (this._isInTransitionPhase()) {
      this._hideOverlayKeepIndicator();
      return;
    }

    // Handle regular focus phase (paused or running)
    this._handleFocusPhase(workspaceId, isBlocked);
  }

  /**
   * Hide both overlay and indicator.
   * @private
   */
  _hideOverlayAndIndicator() {
    this.overlay.hide();
    this.overlay.hideIndicator();
  }

  /**
   * Check if timer is paused during a break phase.
   * Includes transition phase since isInBreakPhase() returns true for transition.
   * @returns {boolean} True if paused during break/transition
   * @private
   */
  _isPausedDuringBreak() {
    return this.timer.isPaused && isInBreakPhase();
  }

  /**
   * Handle overlay visibility when paused during break phase.
   * @param {boolean} isBlocked - Pre-computed blocked status
   * @private
   */
  _handlePausedBreakPhase(isBlocked) {
    // SPECIAL CASE: When timer is paused during break/transition, block workspaces
    // This prevents users from indefinitely pausing during break to bypass blocking
    // BUG FIX v1.3.5: Use isWorkspaceInBlockedList() instead of isCurrentWorkspaceBlocked()
    // because isCurrentWorkspaceBlocked() returns false during break/transition phases
    const workspaceBlocked =
      isBlocked !== null ? isBlocked : this.workspace.isWorkspaceInBlockedList();

    if (workspaceBlocked) {
      // Use _showOverlayWithStatus to display current phase and timer info
      this._showOverlayWithStatus();
    } else {
      this.overlay.hide();
    }
    // Keep indicator visible to show paused state
  }

  /**
   * Check if currently in an active (not paused) break phase.
   * @returns {boolean} True if in break phase and not paused
   * @private
   */
  _isInActiveBreakPhase() {
    return isInBreakPhase();
  }

  /**
   * Check if currently in transition phase.
   * @returns {boolean} True if in transition phase
   * @private
   */
  _isInTransitionPhase() {
    return this.timer.currentPhase === 'transition';
  }

  /**
   * Hide overlay but keep indicator visible.
   * @private
   */
  _hideOverlayKeepIndicator() {
    this.overlay.hide();
    // Keep the indicator visible during breaks/transition so user knows timer is running
  }

  /**
   * Handle overlay visibility during focus phase.
   * @param {string} workspaceId - Optional workspace ID
   * @param {boolean} isBlocked - Pre-computed blocked status
   * @private
   */
  _handleFocusPhase(workspaceId, isBlocked) {
    // Show overlay only on blocked workspaces (same logic for paused and running states)
    // Use provided status if available, otherwise check current workspace
    const workspaceBlocked =
      isBlocked !== null ? isBlocked : this.workspace.isCurrentWorkspaceBlocked();

    // Get workspace ID for logging (use provided or query current)
    const currentWorkspaceId = workspaceId || this.workspace.getActiveWorkspace();

    if (workspaceBlocked) {
      this._logBlockedWorkspace(currentWorkspaceId, isBlocked);
      this._showOverlayWithStatus();
    } else {
      this._logUnblockedWorkspace(currentWorkspaceId, isBlocked);
      this.overlay.hide();
    }
  }

  /**
   * Log blocked workspace information.
   * @param {string} workspaceId - Current workspace ID
   * @param {boolean} isBlocked - Blocked status parameter
   * @private
   */
  _logBlockedWorkspace(workspaceId, isBlocked) {
    logger.log(LOG_CATEGORIES.OVERLAY, 'Current workspace is blocked - showing overlay', {
      workspaceId: workspaceId,
      isPaused: this.timer.isPaused,
      workspaceBlocked: true,
      isBlockedParam: isBlocked,
    });
  }

  /**
   * Log unblocked workspace information.
   * @param {string} workspaceId - Current workspace ID
   * @param {boolean} isBlocked - Blocked status parameter
   * @private
   */
  _logUnblockedWorkspace(workspaceId, isBlocked) {
    logger.log(LOG_CATEGORIES.OVERLAY, 'Current workspace is unblocked - hiding overlay', {
      workspaceId: workspaceId,
      isPaused: this.timer.isPaused,
      workspaceBlocked: false,
      isBlockedParam: isBlocked,
    });
  }

  /**
   * Helper method to show overlay with current timer status.
   * Reduces code duplication in updateOverlayVisibility().
   * @private
   */
  _showOverlayWithStatus() {
    const status = this.timer.getStatus();
    this.overlay.show(status.currentPhase);
    this.overlay.updateDisplay(
      status.remainingTime,
      status.currentPhase,
      status.currentCycle,
      status.totalCycles
    );
  }

  /**
   * Show notification
   * SECURITY FIX: Simplified nested try-catch with conditional icon property
   */
  showNotification(phase) {
    const messages = {
      focus: 'Time to focus! 💪',
      break: 'Take a break! ☕',
      'long-break': 'Take a break! ☕', // Keep for backwards compatibility
      transition: 'Break ending soon! ⏰',
      complete: 'Pomodoro session complete! 🎉',
    };

    const message = messages[phase] || 'Pomodoro timer';

    sendBrowserNotification('Zen Pomodoro Timer', message);
  }

  /**
   * Show notification when timer is restored from browser restart.
   * Informs user that timer was paused and prompts them to continue.
   * AUTO-PAUSE FIX: Non-blocking notification on timer restoration
   */
  showRestorationNotification() {
    const status = this.timer.getStatus();
    const timeStr = formatTime(status.remainingTime);
    const phaseLabel = getPhaseLabel(status.currentPhase);

    const message = `Your ${phaseLabel} timer (${timeStr} remaining) has been paused. Click the indicator to resume.`;

    sendBrowserNotification('Timer Restored', message);
  }

  /**
   * Show custom alert dialog
   * UI/UX FIX: Replace alert() with custom dialog
   */
  showCustomAlert(title, message) {
    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-alert-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    const h2 = document.createElement('h2');
    h2.textContent = title;

    const p = document.createElement('p');
    p.textContent = message;
    p.className = 'zen-pomodoro-dialog-message';

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const okButton = document.createElement('button');
    okButton.className = 'zen-pomodoro-dialog-button';
    okButton.textContent = 'OK';

    buttonDiv.appendChild(okButton);

    dialog.appendChild(h2);
    dialog.appendChild(p);
    dialog.appendChild(buttonDiv);

    document.documentElement.appendChild(dialog);

    // Apply saved position from parent dialog before setting up drag
    applyLastDialogPosition(dialog);

    // Issue 8: Make dialog draggable
    setupDialogDrag(dialog);

    okButton.addEventListener('click', () => {
      dialog.remove();
    });
  }

  /**
   * Show custom confirm dialog
   * UI/UX FIX: Replace confirm() with custom dialog
   */
  showCustomConfirm(title, message, onConfirm) {
    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-confirm-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    const h2 = document.createElement('h2');
    h2.textContent = title;

    const p = document.createElement('p');
    p.textContent = message;
    p.className = 'zen-pomodoro-dialog-message';

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Cancel';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'zen-pomodoro-dialog-button';
    confirmButton.textContent = 'Confirm';

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(confirmButton);

    dialog.appendChild(h2);
    dialog.appendChild(p);
    dialog.appendChild(buttonDiv);

    document.documentElement.appendChild(dialog);

    // Apply saved position from parent dialog before setting up drag
    applyLastDialogPosition(dialog);

    // Issue 8: Make dialog draggable
    setupDialogDrag(dialog);

    cancelButton.addEventListener('click', () => {
      dialog.remove();
    });

    confirmButton.addEventListener('click', () => {
      dialog.remove();
      onConfirm();
    });
  }

  /**
   * Migrate global blockedWorkspaces to default ruleset.
   * This ensures backwards compatibility for users upgrading from older versions.
   * Only migrates if the default ruleset exists and has no blocked workspaces.
   * @private
   */
  _migrateBlockedWorkspacesToRulesets() {
    const config = getConfig();

    // Only migrate if there are global blocked workspaces
    if (!config.blockedWorkspaces || config.blockedWorkspaces.length === 0) {
      return;
    }

    // Find the default ruleset
    const defaultRuleset = config.rulesets?.find((r) => r.id === 'default');
    if (!defaultRuleset) {
      logger.log(LOG_CATEGORIES.INIT, 'Migration skipped: No default ruleset found', {
        globalBlockedCount: config.blockedWorkspaces.length,
      });
      return;
    }

    // Only migrate if the ruleset doesn't already have blocked workspaces
    if (!defaultRuleset.blockedWorkspaces || defaultRuleset.blockedWorkspaces.length === 0) {
      defaultRuleset.blockedWorkspaces = [...config.blockedWorkspaces];
      // Clear global blockedWorkspaces to prevent re-migration
      config.blockedWorkspaces = [];
      saveConfig(config);
      logger.log(LOG_CATEGORIES.INIT, 'Migrated global blocked workspaces to default ruleset', {
        migratedCount: defaultRuleset.blockedWorkspaces.length,
      });
    } else {
      logger.log(
        LOG_CATEGORIES.INIT,
        'Migration skipped: Default ruleset already has blocked workspaces',
        {
          globalBlockedCount: config.blockedWorkspaces.length,
          rulesetBlockedCount: defaultRuleset.blockedWorkspaces.length,
        }
      );
    }
  }

  /**
   * Clean up and destroy the application.
   * MEMORY LEAK FIX: Properly cleanup all modules when browser shuts down.
   * This method is called when the browser window is unloading.
   */
  destroy() {
    logger.log(LOG_CATEGORIES.INIT, 'Application shutting down, cleaning up resources');

    // All modules with destroy() methods (null-checked in _destroyModules)
    const modules = [
      this.windowSync,
      this.sineModBlocker,
      this.websiteBlocker,
      this.transitionManager,
      this.dailyReminder,
      this.postSessionReminder,
      this.distractionDump,
      this.keyboardShortcut,
      this.overlay,
    ];
    this._destroyModules(modules);

    // Additional cleanup
    this._runCleanupActions();
    this._destroyPreferenceTriggerObserver();

    // Clean up cross-window log sync
    logger.destroySync();

    this.initialized = false;

    logger.log(LOG_CATEGORIES.INIT, 'Application cleanup complete');
  }

  /**
   * Safely destroy a list of modules that may have a destroy() method.
   * @param {Array} modules - Array of module instances (may contain nulls)
   * @private
   */
  _destroyModules(modules) {
    for (const module of modules) {
      if (module && typeof module.destroy === 'function') {
        module.destroy();
      }
    }
  }

  /**
   * Run additional cleanup actions for modules with non-standard cleanup methods.
   * @private
   */
  _runCleanupActions() {
    if (this.workspace && typeof this.workspace.stopMonitoring === 'function') {
      this.workspace.stopMonitoring();
    }
    if (this.timer && typeof this.timer.stop === 'function') {
      // Suppress completion callback during teardown to prevent false notifications
      this.timer.stop({ suppressCompleteCallback: true });
    }
    if (this.security && typeof this.security.cleanupLockScreen === 'function') {
      this.security.cleanupLockScreen();
    }
  }

  /**
   * Remove preference trigger observer.
   * @private
   */
  _destroyPreferenceTriggerObserver() {
    if (!this._prefTriggerObserver) {
      return;
    }

    try {
      Services.prefs.removeObserver(`${Constants.PREF_PREFIX}.`, this._prefTriggerObserver);
    } catch (e) {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Failed to remove preference trigger observer', {
        error: e.message,
      });
    } finally {
      this._prefTriggerObserver = null;
    }
  }
}

export default ZenPomodoroApp;
