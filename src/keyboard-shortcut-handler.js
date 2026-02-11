import Constants from './constants.js';
import { logger } from './log-manager.js';
import { 
  getConfig, saveConfig, setPref,
  formatTime,
  sanitizeText, validateIntegerInput,
  findRuleAndExecute,
  isValidRangeValue, getValidatedIntFromDialog,
  URL_REVOKE_DELAY_MS,
  MOD_VERSION, MODIFIER_KEYS, LOCKOUT_METHODS, LOG_CATEGORIES
} from './helpers.js';
import {
  setupDialogDrag, applyLastDialogPosition, saveDialogPosition,
  isValidTimeFormat,
  createLabeledInputRow, createLabeledSelectRow,
  renderListOrEmptyMessage, updateCountdownElement, getMenuPhaseLabel,
  handleStopTimerWithLockout, handleSkipFocusWithLockout,
  isDistractionDumpBlocking, handlePauseResumeTimer
} from './ui-helpers.js';
import UndoRedoManager from './undo-redo-manager.js';

// ============================================

// Issue 4: Define dialog selectors as a constant for maintainability
const POMODORO_DIALOG_SELECTORS = [
  '#zen-pomodoro-menu-dialog',
  '#zen-pomodoro-start-dialog',
  '#zen-pomodoro-settings-dialog',
  '#zen-pomodoro-ruleset-dialog',
  '#zen-pomodoro-lock-screen',
  '#zen-pomodoro-alert-dialog',
  '#zen-pomodoro-confirm-dialog',
];

/**
 * Mapping of shortcut modifier key names to their corresponding event property names.
 * Used by parseShortcut to convert string shortcuts (e.g., "Ctrl+Shift+P") to key objects.
 * @constant {Object<string, string>}
 */
const SHORTCUT_MODIFIER_MAP = {
  ctrl: 'ctrlKey',
  control: 'ctrlKey',
  alt: 'altKey',
  shift: 'shiftKey',
  meta: 'metaKey',
  cmd: 'metaKey',
  command: 'metaKey',
};

class KeyboardShortcutHandler {
  constructor() {
    this.keydownHandler = null;
    this.toggleIndicatorHandler = null; // Handler for toggle indicator visibility shortcut
    this.menuDialog = null;
    this.menuTimerUpdateInterval = null;
    this.reminderCountdownUpdateInterval = null; // For post-session reminder countdown
  }

  /**
   * Start real-time timer updates in the menu dialog
   * @param {HTMLElement} statusText - The element to update with timer status
   */
  _startMenuTimerUpdates(statusText) {
    // Clear any existing interval first
    this._stopMenuTimerUpdates();

    this.menuTimerUpdateInterval = setInterval(() => {
      // Check if timer is still active and element is still in DOM
      // (prevents errors if menu is closed during interval execution)
      const isTimerActive = window.zenPomodoroApp?.timer?.isActive;
      if (!isTimerActive || !statusText.isConnected) {
        this._stopMenuTimerUpdates();
        return;
      }

      const status = window.zenPomodoroApp.timer.getStatus();
      const timeStr = formatTime(status.remainingTime);
      const phaseStr = getMenuPhaseLabel(status.currentPhase);

      if (status.mode === 'simple') {
        statusText.textContent = `${phaseStr}: ${timeStr}`;
      } else {
        statusText.textContent = `${phaseStr}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
      }
    }, 1000);
  }

  /**
   * Stop the real-time timer updates in the menu dialog
   */
  _stopMenuTimerUpdates() {
    if (this.menuTimerUpdateInterval) {
      clearInterval(this.menuTimerUpdateInterval);
      this.menuTimerUpdateInterval = null;
    }
  }

  /**
   * Start real-time reminder countdown updates in the menu dialog
   * @param {HTMLElement} postSessionCountdownElement - The element to update with post-session countdown
   * @param {HTMLElement} firstTimeCountdownElement - The element to update with first-time countdown
   */
  _startReminderCountdownUpdates(postSessionCountdownElement, firstTimeCountdownElement) {
    this._stopReminderCountdownUpdates();
    this._updateReminderCountdown(postSessionCountdownElement, firstTimeCountdownElement);

    this.reminderCountdownUpdateInterval = setInterval(() => {
      // Stop interval when BOTH elements are either missing or disconnected from DOM (menu closed)
      const allPostGoneOrDisconnected =
        !postSessionCountdownElement || !postSessionCountdownElement.isConnected;
      const allFirstGoneOrDisconnected =
        !firstTimeCountdownElement || !firstTimeCountdownElement.isConnected;

      if (allPostGoneOrDisconnected && allFirstGoneOrDisconnected) {
        this._stopReminderCountdownUpdates();
        return;
      }
      this._updateReminderCountdown(postSessionCountdownElement, firstTimeCountdownElement);
    }, 1000);
  }

  /**
   * Update the reminder countdown display
   * @param {HTMLElement} postSessionCountdownElement - The element to update for post-session countdown
   * @param {HTMLElement} firstTimeCountdownElement - The element to update for first-time countdown
   * @private
   */
  _updateReminderCountdown(postSessionCountdownElement, firstTimeCountdownElement) {
    // Update post-session reminder countdown
    if (window.zenPomodoroApp?.postSessionReminder) {
      const secondsUntil = window.zenPomodoroApp.postSessionReminder.getTimeUntilNextReminder();
      updateCountdownElement(postSessionCountdownElement, secondsUntil, {
        readyText: 'Reminder ready to show',
        prefixText: 'Next reminder in: ',
        useHours: false,
      });
    }

    // Update daily reminder countdown
    if (window.zenPomodoroApp?.dailyReminder) {
      const secondsUntil = window.zenPomodoroApp.dailyReminder.getTimeUntilDailyReminder();
      updateCountdownElement(firstTimeCountdownElement, secondsUntil, {
        readyText: 'Daily reminder ready to show',
        prefixText: 'Daily reminder in: ',
        useHours: true,
      });
    }
  }

  /**
   * Stop the reminder countdown updates
   */
  _stopReminderCountdownUpdates() {
    if (this.reminderCountdownUpdateInterval) {
      clearInterval(this.reminderCountdownUpdateInterval);
      this.reminderCountdownUpdateInterval = null;
    }
  }

  /**
   * Issue 3: Close all existing dialogs to prevent duplicates
   * MEMORY LEAK FIX: Clean up associated resources for dialogs that manage state
   */
  closeAllDialogs() {
    // Stop any running timer updates in the menu
    this._stopMenuTimerUpdates();

    // Stop any running reminder countdown updates
    this._stopReminderCountdownUpdates();

    // Clean up lock screen resources if the security manager exists
    if (window.zenPomodoroApp?.security) {
      window.zenPomodoroApp.security.cleanupLockScreen();
    }

    POMODORO_DIALOG_SELECTORS.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.remove();
    });
    this.menuDialog = null;
  }

  /**
   * Initialize keyboard shortcut handler
   */
  init() {
    const config = getConfig();
    this.setupKeyboardShortcut(config.keyboardShortcut);
    console.log(`Zen Pomodoro: Keyboard shortcut registered: ${config.keyboardShortcut}`);

    // Setup toggle indicator shortcut
    this.setupToggleIndicatorShortcut(config.toggleIndicatorShortcut);
    console.log(`Zen Pomodoro: Toggle indicator shortcut registered: ${config.toggleIndicatorShortcut}`);
  }

  /**
   * Parse keyboard shortcut string into components.
   * Uses SHORTCUT_MODIFIER_MAP lookup table for cleaner code.
   * @param {string} shortcut - e.g., "Alt+Shift+P" or "Ctrl+P"
   * @returns {object} - { ctrlKey, altKey, shiftKey, metaKey, key }
   */
  parseShortcut(shortcut) {
    const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
    const result = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: '',
    };

    for (const part of parts) {
      const modifierKey = SHORTCUT_MODIFIER_MAP[part];
      if (modifierKey) {
        result[modifierKey] = true;
      } else {
        result.key = part.toUpperCase();
      }
    }

    return result;
  }

  /**
   * Setup keyboard shortcut listener
   * @param {string} shortcut - Keyboard shortcut string
   */
  setupKeyboardShortcut(shortcut) {
    // Clean up existing handler
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }

    const parsed = this.parseShortcut(shortcut);

    this.keydownHandler = (event) => {
      // Check if all modifier keys match using helper function
      if (this._isShortcutMatch(event, parsed)) {
        event.preventDefault();
        event.stopPropagation();
        this.showPomodoroMenu();
      }
    };

    document.addEventListener('keydown', this.keydownHandler, true);
  }

  /**
   * Check if a keyboard event matches the parsed shortcut.
   * @param {KeyboardEvent} event - The keyboard event
   * @param {Object} parsed - Parsed shortcut with modifier key booleans and key
   * @returns {boolean} True if event matches shortcut
   * @private
   */
  _isShortcutMatch(event, parsed) {
    const modifiersMatch =
      event.ctrlKey === parsed.ctrlKey &&
      event.altKey === parsed.altKey &&
      event.shiftKey === parsed.shiftKey &&
      event.metaKey === parsed.metaKey;

    return modifiersMatch && event.key.toUpperCase() === parsed.key;
  }

  /**
   * Setup keyboard shortcut for toggling indicator visibility.
   * @param {string} shortcut - Keyboard shortcut string
   */
  setupToggleIndicatorShortcut(shortcut) {
    // Clean up existing handler
    if (this.toggleIndicatorHandler) {
      document.removeEventListener('keydown', this.toggleIndicatorHandler);
    }

    // Don't set up handler if shortcut is empty
    if (!shortcut || shortcut.trim() === '') {
      return;
    }

    const parsed = this.parseShortcut(shortcut);

    this.toggleIndicatorHandler = (event) => {
      // Check if all modifier keys match using helper function
      if (this._isShortcutMatch(event, parsed)) {
        event.preventDefault();
        event.stopPropagation();
        this._toggleIndicatorVisibility();
      }
    };

    document.addEventListener('keydown', this.toggleIndicatorHandler, true);
  }

  /**
   * Toggle the timer indicator visibility.
   * @private
   */
  _toggleIndicatorVisibility() {
    // Only toggle if timer is active
    if (!window.zenPomodoroApp?.timer?.isActive) {
      return;
    }

    const overlay = window.zenPomodoroApp?.overlay;
    if (!overlay) return;

    // Toggle visibility - indicator visibility is controlled by 'active' class
    if (overlay.indicator) {
      const isCurrentlyHidden = !overlay.indicator.classList.contains('active');

      if (isCurrentlyHidden) {
        overlay.showIndicator();
        logger.log(LOG_CATEGORIES.TIMER, 'Indicator shown via shortcut');
      } else {
        overlay.hideIndicator();
        logger.log(LOG_CATEGORIES.TIMER, 'Indicator hidden via shortcut');
      }
    }
  }

  /**
   * Handle "Cut Break Early" action - skip break/transition phase and go to focus.
   * Extracted from showPomodoroMenu to reduce complexity.
   * @param {string} currentPhase - Current timer phase
   * @private
   */
  _handleCutBreakEarly(currentPhase) {
    // CROSS-WINDOW SYNC: Claim ownership before modifying timer
    window.zenPomodoroApp?._claimOwnershipForAction();

    const timer = window.zenPomodoroApp.timer;

    // If in transition phase, directly start the focus phase (skip transition popup)
    if (currentPhase === 'transition') {
      window.zenPomodoroApp.transitionManager.hideTransitionPopup();
      this._startNextFocusPhase(timer);
      return;
    }

    // In break or long-break phase
    if (timer.mode === 'custom') {
      // Custom cycle mode: use helper for consistent handling
      this._startNextFocusPhase(timer);
    } else {
      // Regular Pomodoro mode: increment cycle and start focus
      timer.currentCycle++;
      logger.log(LOG_CATEGORIES.TIMER, 'Cut break early: Incremented cycle count', {
        currentCycle: timer.currentCycle,
        totalCycles: timer.totalCycles,
      });
      timer.startFocusFromTransition();
      window.zenPomodoroApp.updateOverlayVisibility();
    }
  }

  /**
   * Start the next focus phase, handling both custom and regular modes.
   * @param {Object} timer - The timer instance
   * @private
   */
  _startNextFocusPhase(timer) {
    if (timer.mode === 'custom') {
      if (timer.skipToNextCustomBlock()) {
        window.zenPomodoroApp.updateOverlayVisibility();
      }
    } else {
      timer.startFocusFromTransition();
      window.zenPomodoroApp.updateOverlayVisibility();
    }
  }

  /**
   * Show the main Pomodoro menu dialog
   * Issue 4: Toggle behavior - if any dialog is open, close it instead of creating new
   */
  showPomodoroMenu() {
    // Issue 4: Check if any dialogs are currently open using shared constant
    const existingDialogs = document.querySelectorAll(POMODORO_DIALOG_SELECTORS.join(', '));

    if (existingDialogs.length > 0) {
      // If any dialog exists, close them all and return (toggle behavior)
      logger.log(LOG_CATEGORIES.MENU, 'Closing all dialogs (toggle behavior)');
      this.closeAllDialogs();
      return;
    }

    logger.log(LOG_CATEGORIES.MENU, 'Opening main menu');

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-menu-dialog';
    dialog.className = 'zen-pomodoro-dialog active';
    this.menuDialog = dialog;

    const h2 = document.createElement('h2');
    h2.textContent = '⏱️ Pomodoro Timer';

    const menuSection = document.createElement('div');
    menuSection.className = 'zen-pomodoro-config-section';

    const timerActive =
      window.zenPomodoroApp &&
      window.zenPomodoroApp.timer &&
      window.zenPomodoroApp.timer.isActive;

    if (timerActive) {
      // Timer is running - show timer controls
      const status = window.zenPomodoroApp.timer.getStatus();
      const timeStr = formatTime(status.remainingTime);
      // Use helper function to map phase to display label
      const phaseStr = getMenuPhaseLabel(status.currentPhase);

      const statusRow = document.createElement('div');
      statusRow.className = 'zen-pomodoro-config-row';
      statusRow.style.justifyContent = 'center';
      statusRow.style.marginBottom = '16px';
      const statusText = document.createElement('div');
      statusText.style.fontSize = '18px';
      statusText.style.fontWeight = '600';
      // Don't show cycle info for simple timer mode - only pomodoro mode has cycles
      if (status.mode === 'simple') {
        statusText.textContent = `${phaseStr}: ${timeStr}`;
      } else {
        statusText.textContent = `${phaseStr}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
      }
      statusRow.appendChild(statusText);

      // Start real-time timer updates while menu is open
      this._startMenuTimerUpdates(statusText);

      const pauseResumeBtn = document.createElement('button');
      pauseResumeBtn.className = 'zen-pomodoro-dialog-button';
      pauseResumeBtn.textContent = status.isPaused ? 'Resume Timer' : 'Pause Timer';
      pauseResumeBtn.addEventListener('click', () => {
        // Check if Distraction Dump is active - provide user feedback
        if (isDistractionDumpBlocking()) {
          window.zenPomodoroApp.showCustomAlert(
            Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
            Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
          );
          return;
        }
        this._stopMenuTimerUpdates();
        handlePauseResumeTimer();
        dialog.remove();
        this.menuDialog = null;
      });

      // Cut Break Early button - only shown during break, long-break, or transition phases
      const isBreakOrTransition =
        status.currentPhase === 'break' ||
        status.currentPhase === 'long-break' ||
        status.currentPhase === 'transition';
      let cutBreakBtn = null;
      if (isBreakOrTransition) {
        cutBreakBtn = document.createElement('button');
        cutBreakBtn.className = 'zen-pomodoro-dialog-button secondary';
        cutBreakBtn.textContent = 'Cut Break Early';
        cutBreakBtn.addEventListener('click', () => {
          this._stopMenuTimerUpdates();
          dialog.remove();
          this.menuDialog = null;
          this._handleCutBreakEarly(status.currentPhase);
        });
      }

      // Skip Focus button - only shown during focus phase (not break/transition)
      // Requires lockscreen verification like stopping timer
      let skipFocusBtn = null;
      if (status.currentPhase === 'focus') {
        skipFocusBtn = document.createElement('button');
        skipFocusBtn.className = 'zen-pomodoro-dialog-button secondary';
        skipFocusBtn.textContent = 'Skip Focus';
        skipFocusBtn.addEventListener('click', () => {
          // Check if Distraction Dump is active - provide user feedback
          if (isDistractionDumpBlocking()) {
            window.zenPomodoroApp.showCustomAlert(
              Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
              Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
            );
            return;
          }
          this._stopMenuTimerUpdates();
          dialog.remove();
          this.menuDialog = null;
          
          handleSkipFocusWithLockout(() => {
            // CROSS-WINDOW SYNC: Claim ownership before modifying timer
            window.zenPomodoroApp?._claimOwnershipForAction();
            const timer = window.zenPomodoroApp.timer;
            if (timer.skipFocusToBreak()) {
              window.zenPomodoroApp.updateOverlayVisibility();
            }
          });
        });
      }

      const stopBtn = document.createElement('button');
      stopBtn.className = 'zen-pomodoro-dialog-button secondary';
      stopBtn.textContent = 'Stop Timer';
      stopBtn.addEventListener('click', () => {
        this._stopMenuTimerUpdates();
        dialog.remove();
        this.menuDialog = null;
        // Issue 6: Require lockout before stopping timer using helper function
        handleStopTimerWithLockout(() => {
          window.zenPomodoroApp.stopTimer();
        });
      });

      const settingsBtn = document.createElement('button');
      settingsBtn.className = 'zen-pomodoro-dialog-button secondary';
      settingsBtn.textContent = 'Timer Settings';
      settingsBtn.addEventListener('click', () => {
        this._stopMenuTimerUpdates();
        saveDialogPosition(dialog);
        dialog.remove();
        this.menuDialog = null;
        this.showSettingsDialog();
      });

      const rulesetBtn = document.createElement('button');
      rulesetBtn.className = 'zen-pomodoro-dialog-button secondary';
      rulesetBtn.textContent = 'Ruleset Settings';
      rulesetBtn.addEventListener('click', () => {
        this._stopMenuTimerUpdates();
        saveDialogPosition(dialog);
        dialog.remove();
        this.menuDialog = null;
        this.showRulesetSettingsDialog();
      });

      // Toggle indicator visibility button
      const toggleIndicatorBtn = document.createElement('button');
      toggleIndicatorBtn.className = 'zen-pomodoro-dialog-button secondary';
      toggleIndicatorBtn.textContent =
        window.zenPomodoroApp?.overlay?.indicator?.classList.contains('active')
          ? 'Hide Timer Indicator'
          : 'Show Timer Indicator';
      toggleIndicatorBtn.addEventListener('click', () => {
        if (window.zenPomodoroApp?.overlay) {
          const indicator = window.zenPomodoroApp.overlay.indicator;
          if (indicator?.classList.contains('active')) {
            window.zenPomodoroApp.overlay.hideIndicator();
            toggleIndicatorBtn.textContent = 'Show Timer Indicator';
          } else {
            window.zenPomodoroApp.overlay.showIndicator();
            toggleIndicatorBtn.textContent = 'Hide Timer Indicator';
          }
        }
      });

      // Distraction Dump button - only during focus phase
      // Available even when paused since Distraction Dump serves a different purpose
      // (temporarily lifting ALL blocks for thought capture, not just pausing timer)
      // Only one dump is allowed per focus phase
      let dumpBtn = null;
      const config = getConfig();
      const dumpManager = window.zenPomodoroApp?.distractionDump;
      const isDumpActive = dumpManager?.isActive;
      const isDumpAvailable = dumpManager?.isDumpAvailable();
      if (
        config.distractionDumpEnabled &&
        status.currentPhase === 'focus'
      ) {
        dumpBtn = document.createElement('button');
        dumpBtn.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-dump-button';
        if (isDumpActive) {
          // Dump is currently running - show End Dump Early option
          dumpBtn.textContent = '🧠 End Dump Early';
          dumpBtn.addEventListener('click', () => {
            this._stopMenuTimerUpdates();
            dialog.remove();
            this.menuDialog = null;
            window.zenPomodoroApp.distractionDump.showEndDumpConfirmation();
          });
        } else if (isDumpAvailable) {
          // Dump is available - show Start Dump option
          dumpBtn.textContent = '🧠 Distraction Dump';
          dumpBtn.addEventListener('click', () => {
            this._stopMenuTimerUpdates();
            dialog.remove();
            this.menuDialog = null;
            window.zenPomodoroApp.distractionDump.showDumpConfigDialog();
          });
        } else {
          // Dump already used this focus phase
          dumpBtn.textContent = '🧠 Dump Used';
          dumpBtn.disabled = true;
          dumpBtn.title = 'Distraction Dump can only be used once per focus phase';
          dumpBtn.style.opacity = '0.5';
          dumpBtn.style.cursor = 'not-allowed';
        }
      }

      menuSection.appendChild(statusRow);
      menuSection.appendChild(pauseResumeBtn);
      if (dumpBtn) {
        menuSection.appendChild(dumpBtn);
      }
      if (cutBreakBtn) {
        menuSection.appendChild(cutBreakBtn);
      }
      if (skipFocusBtn) {
        menuSection.appendChild(skipFocusBtn);
      }
      menuSection.appendChild(stopBtn);
      menuSection.appendChild(toggleIndicatorBtn);
      menuSection.appendChild(settingsBtn);
      menuSection.appendChild(rulesetBtn);
    } else {
      // Timer not running - show start options
      const startBtn = document.createElement('button');
      startBtn.className = 'zen-pomodoro-dialog-button';
      startBtn.textContent = 'Start Pomodoro Timer';
      startBtn.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.menuDialog = null;
        this.showConfigDialog();
      });

      const settingsBtn = document.createElement('button');
      settingsBtn.className = 'zen-pomodoro-dialog-button secondary';
      settingsBtn.textContent = 'Timer Settings';
      settingsBtn.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.menuDialog = null;
        this.showSettingsDialog();
      });

      const rulesetBtn = document.createElement('button');
      rulesetBtn.className = 'zen-pomodoro-dialog-button secondary';
      rulesetBtn.textContent = 'Ruleset Settings';
      rulesetBtn.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.menuDialog = null;
        this.showRulesetSettingsDialog();
      });

      const customCyclesBtn = document.createElement('button');
      customCyclesBtn.className = 'zen-pomodoro-dialog-button secondary';
      customCyclesBtn.textContent = 'Custom Cycles';
      customCyclesBtn.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.menuDialog = null;
        if (window.zenPomodoroApp?.customCycles) {
          window.zenPomodoroApp.customCycles.showCustomCyclesMenu();
        }
      });

      menuSection.appendChild(startBtn);
      menuSection.appendChild(settingsBtn);
      menuSection.appendChild(rulesetBtn);
      menuSection.appendChild(customCyclesBtn);
    }

    // Buttons section
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Close';
    cancelButton.addEventListener('click', () => {
      this._stopMenuTimerUpdates();
      this._stopReminderCountdownUpdates();
      dialog.remove();
      this.menuDialog = null;
    });

    buttonDiv.appendChild(cancelButton);

    // Version indicator at bottom of menu
    const versionIndicator = document.createElement('div');
    versionIndicator.className = 'zen-pomodoro-version-indicator';
    versionIndicator.textContent = `v${MOD_VERSION}`;

    // Post-session reminder countdown indicator
    const postSessionCountdown = document.createElement('div');
    postSessionCountdown.className = 'zen-pomodoro-reminder-countdown zen-pomodoro-hidden';

    // First-time reminder countdown indicator
    const firstTimeCountdown = document.createElement('div');
    firstTimeCountdown.className = 'zen-pomodoro-first-time-countdown zen-pomodoro-hidden';

    dialog.appendChild(h2);
    dialog.appendChild(menuSection);
    dialog.appendChild(buttonDiv);
    dialog.appendChild(postSessionCountdown);
    dialog.appendChild(firstTimeCountdown);
    dialog.appendChild(versionIndicator);

    // Start reminder countdown updates (will auto-hide if not applicable)
    this._startReminderCountdownUpdates(postSessionCountdown, firstTimeCountdown);

    document.documentElement.appendChild(dialog);

    // Apply saved position from previous dialog before setting up drag
    applyLastDialogPosition(dialog);

    // Issue 8: Make dialog draggable
    setupDialogDrag(dialog);

    // Focus the dialog
    dialog.focus();

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this._stopMenuTimerUpdates();
        this._stopReminderCountdownUpdates();
        dialog.remove();
        this.menuDialog = null;
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    // Stop any running timer updates in the menu
    this._stopMenuTimerUpdates();

    // Stop any running reminder countdown updates
    this._stopReminderCountdownUpdates();

    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.toggleIndicatorHandler) {
      document.removeEventListener('keydown', this.toggleIndicatorHandler, true);
      this.toggleIndicatorHandler = null;
    }
    if (this.menuDialog) {
      this.menuDialog.remove();
      this.menuDialog = null;
    }
  }

  /**
   * Show timer configuration dialog
   */
  showConfigDialog() {
    // Prevent duplicate dialogs
    const existingDialog = document.getElementById('zen-pomodoro-start-dialog');
    if (existingDialog) {
      logger.log(LOG_CATEGORIES.MENU, 'Start timer dialog already exists, skipping');
      return;
    }

    logger.log(LOG_CATEGORIES.MENU, 'Opening start timer dialog');

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-start-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    const config = getConfig();
    const isSimpleMode = config.timerMode === 'simple';

    // Create dialog structure
    const backButton = this._createBackButton(dialog);
    const h2 = this._createDialogTitle('Start Timer');

    // Undo/Redo for start timer config
    const configUndoRedo = new UndoRedoManager();
    configUndoRedo.pushState(JSON.parse(JSON.stringify(config)));
    const undoRedoButtons = configUndoRedo.createButtons();

    const configSection = document.createElement('div');
    configSection.className = 'zen-pomodoro-config-section';

    // Mode selection using helper
    const { row: modeRow, select: modeSelect } = createLabeledSelectRow(
      'Timer Mode:',
      'zen-pomodoro-mode-select',
      [
        { value: 'simple', text: 'Simple Timer', selected: isSimpleMode },
        { value: 'pomodoro', text: 'Pomodoro Mode', selected: !isSimpleMode && config.timerMode !== 'custom' },
        { value: 'custom', text: 'Custom Cycle', selected: config.timerMode === 'custom' },
      ]
    );

    // Custom cycle selection row (only shown when custom mode is selected)
    const customCycleRow = this._createCustomCycleSelectRow(config);
    customCycleRow.classList.toggle('hidden', config.timerMode !== 'custom');
    customCycleRow.dataset.mode = 'custom';

    // Duration inputs
    const durationRows = this._createDurationInputRows(config, isSimpleMode);

    // Ruleset selection
    const activeRulesetsRow = this._createActiveRulesetsRow(config);

    // Add to config section
    [modeRow, customCycleRow, ...durationRows, activeRulesetsRow].forEach((row) =>
      configSection.appendChild(row)
    );

    // Buttons
    const { buttonDiv, cancelButton, startButton } = this._createStartDialogButtons();

    // Assemble dialog - create header row for back button and undo/redo
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '8px';
    backButton.style.marginBottom = '0';
    headerRow.appendChild(backButton);
    headerRow.appendChild(undoRedoButtons);

    [headerRow, h2, configSection, buttonDiv].forEach((el) => {
      dialog.appendChild(el);
    });
    document.documentElement.appendChild(dialog);

    // Track changes for undo/redo
    configSection.addEventListener('change', () => {
      configUndoRedo.pushState(JSON.parse(JSON.stringify(getConfig())));
    });

    // Set restore callback for undo/redo
    configUndoRedo.onStateRestore = (state) => {
      saveConfig(state);
      saveDialogPosition(dialog);
      dialog.remove();
      this.showConfigDialog();
    };

    // Apply saved position from parent dialog before setting up drag
    applyLastDialogPosition(dialog);
    setupDialogDrag(dialog);

    // Event handlers
    this._setupModeToggleHandler(modeSelect, [...durationRows, customCycleRow]);
    cancelButton.addEventListener('click', () => dialog.remove());
    this._setupStartHandler(dialog, config, modeSelect, startButton);
  }

  /**
   * Create duration input rows for the start timer dialog.
   * @param {Object} config - Configuration object
   * @param {boolean} isSimpleMode - Whether simple timer mode is active
   * @returns {HTMLElement[]} Array of duration row elements
   * @private
   */
  _createDurationInputRows(config, isSimpleMode) {
    const simpleDurationRow = createLabeledInputRow(
      'Duration (min):',
      'zen-pomodoro-simple-duration-input',
      { value: config.simpleDuration, min: '1', max: '180' }
    );
    simpleDurationRow.classList.toggle('hidden', !isSimpleMode);
    simpleDurationRow.dataset.mode = 'simple';

    const focusDurationRow = createLabeledInputRow(
      'Focus (min):',
      'zen-pomodoro-focus-duration-input',
      { value: config.focusDuration, min: '1', max: '120' }
    );
    focusDurationRow.classList.toggle('hidden', isSimpleMode);
    focusDurationRow.dataset.mode = 'pomodoro';

    const breakDurationRow = createLabeledInputRow(
      'Break (min):',
      'zen-pomodoro-break-duration-input',
      { value: config.breakDuration, min: '1', max: '60' }
    );
    breakDurationRow.classList.toggle('hidden', isSimpleMode);
    breakDurationRow.dataset.mode = 'pomodoro';

    const cyclesRow = createLabeledInputRow('Number of Cycles:', 'zen-pomodoro-cycles-input', {
      value: config.cycles,
      min: '1',
      max: '20',
    });
    cyclesRow.classList.toggle('hidden', isSimpleMode);
    cyclesRow.dataset.mode = 'pomodoro';

    return [simpleDurationRow, focusDurationRow, breakDurationRow, cyclesRow];
  }

  /**
   * Create the active rulesets selection row.
   * @param {Object} config - Configuration object
   * @returns {HTMLElement} Rulesets row element
   * @private
   */
  _createActiveRulesetsRow(config) {
    const row = document.createElement('div');
    row.className = 'zen-pomodoro-config-row zen-pomodoro-workspace-row';
    row.id = 'zen-pomodoro-active-rulesets-row';

    const label = document.createElement('label');
    label.textContent = 'Active Blocking Rulesets:';

    row.appendChild(label);
    row.appendChild(this._createRulesetCheckboxes(config));

    return row;
  }

  /**
   * Create a back button for dialogs.
   * @param {HTMLElement} dialog - The dialog element
   * @returns {HTMLButtonElement} The back button
   * @private
   */
  _createBackButton(dialog) {
    const backButton = document.createElement('button');
    backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
    backButton.textContent = '← Back';
    backButton.addEventListener('click', () => {
      if (dialog && dialog.parentNode) {
        saveDialogPosition(dialog);
        dialog.remove();
      }
      this.showPomodoroMenu();
    });
    return backButton;
  }

  /**
   * Create ruleset checkboxes for the start timer dialog.
   * @param {Object} config - Configuration object
   * @returns {HTMLElement} Container with ruleset checkboxes
   * @private
   */
  _createRulesetCheckboxes(config) {
    const container = document.createElement('div');
    container.className = 'zen-pomodoro-workspace-list';
    container.id = 'zen-pomodoro-active-rulesets-container';

    const rulesets = config.rulesets || [];
    if (rulesets.length === 0) {
      const noRulesets = document.createElement('p');
      noRulesets.style.color = '#888';
      noRulesets.style.fontSize = '12px';
      noRulesets.textContent = 'No rulesets configured. Add rulesets in Settings.';
      container.appendChild(noRulesets);
      return container;
    }

    rulesets.forEach((ruleset) => {
      const checkboxRow = document.createElement('div');
      checkboxRow.className = 'zen-pomodoro-checkbox-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `active-ruleset-${ruleset.id}`;
      checkbox.value = ruleset.id;
      checkbox.checked = (config.activeRulesets || ['default']).includes(ruleset.id);
      checkbox.disabled = !ruleset.enabled;

      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = ruleset.name + (ruleset.enabled ? '' : ' (disabled)');
      if (!ruleset.enabled) label.style.color = '#666';

      checkboxRow.appendChild(checkbox);
      checkboxRow.appendChild(label);
      container.appendChild(checkboxRow);
    });

    return container;
  }

  /**
   * Create a dialog title element.
   * @param {string} text - Title text
   * @returns {HTMLHeadingElement} The title element
   * @private
   */
  _createDialogTitle(text) {
    const h2 = document.createElement('h2');
    h2.textContent = text;
    return h2;
  }

  /**
   * Create buttons for the start timer dialog.
   * @returns {{buttonDiv: HTMLElement, cancelButton: HTMLButtonElement, startButton: HTMLButtonElement}}
   * @private
   */
  _createStartDialogButtons() {
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.id = 'zen-pomodoro-cancel-button';
    cancelButton.textContent = 'Cancel';

    const startButton = document.createElement('button');
    startButton.className = 'zen-pomodoro-dialog-button';
    startButton.id = 'zen-pomodoro-start-button';
    startButton.textContent = 'Start Timer';
    // Mark as instant-click button - no hold required
    startButton.setAttribute('data-instant-click', 'true');

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(startButton);

    return { buttonDiv, cancelButton, startButton };
  }

  /**
   * Setup mode toggle handler for showing/hiding duration rows.
   * @param {HTMLSelectElement} modeSelect - Mode select element
   * @param {Object} rows - Object containing row elements
   * @param {HTMLElement[]} rows - Array of duration row elements with dataset.mode attributes
   * @private
   */
  _setupModeToggleHandler(modeSelect, rows) {
    modeSelect.addEventListener('change', () => {
      const selectedMode = modeSelect.value;
      rows.forEach((row) => {
        const mode = row.dataset.mode;
        if (mode === 'simple') {
          row.classList.toggle('hidden', selectedMode !== 'simple');
        } else if (mode === 'pomodoro') {
          row.classList.toggle('hidden', selectedMode !== 'pomodoro');
        } else if (mode === 'custom') {
          row.classList.toggle('hidden', selectedMode !== 'custom');
        }
      });
    });
  }

  /**
   * Create the custom cycle selection row.
   * @param {Object} config - Configuration object
   * @returns {HTMLElement} Custom cycle selection row
   * @private
   */
  _createCustomCycleSelectRow(config) {
    const savedCycles = config.customCycles || [];
    const row = document.createElement('div');
    row.className = 'zen-pomodoro-config-row';

    const label = document.createElement('label');
    label.textContent = 'Select Cycle:';

    if (savedCycles.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.style.fontSize = '12px';
      emptyMessage.style.color = '#888';
      emptyMessage.style.margin = '8px 0';
      emptyMessage.textContent = 'No custom cycles available. Create one in Custom Cycles settings.';
      
      row.appendChild(label);
      row.appendChild(emptyMessage);
      return row;
    }

    const select = document.createElement('select');
    select.id = 'zen-pomodoro-custom-cycle-select';
    select.className = 'zen-pomodoro-dialog-input';

    savedCycles.forEach((cycle) => {
      const option = document.createElement('option');
      option.value = cycle.id;
      option.textContent = cycle.name;
      select.appendChild(option);
    });

    row.appendChild(label);
    row.appendChild(select);

    return row;
  }

  /**
   * Setup start button handler with session duration overrides.
   * @param {HTMLElement} dialog - Dialog element
   * @param {Object} config - Config object
   * @param {HTMLSelectElement} modeSelect - Mode select element
   * @param {HTMLButtonElement} startButton - Start button element
   * @private
   */
  _setupStartHandler(dialog, config, modeSelect, startButton) {
    const applyDurationsAndStart = () => {
      logger.log(LOG_CATEGORIES.MENU, 'Start button clicked - starting timer immediately');
      const mode = modeSelect.value;
      const cyclesInput = dialog.querySelector('#zen-pomodoro-cycles-input');
      const cycles = cyclesInput
        ? validateIntegerInput(cyclesInput.value, 1, 20, config.cycles)
        : config.cycles;

      const sessionOverrides = this._buildSessionOverrides(dialog, mode, config);

      // Save selected active rulesets to config
      const activeRulesetsContainer = dialog.querySelector(
        '#zen-pomodoro-active-rulesets-container'
      );
      if (activeRulesetsContainer) {
        const selectedRulesets = [];
        activeRulesetsContainer
          .querySelectorAll('input[type="checkbox"]:checked')
          .forEach((checkbox) => {
            selectedRulesets.push(checkbox.value);
          });
        config.activeRulesets = selectedRulesets;
        saveConfig(config);
        logger.log(LOG_CATEGORIES.SETTINGS, 'Active rulesets saved', {
          rulesets: selectedRulesets,
        });
      }

      dialog.remove();

      if (window.zenPomodoroApp) {
        this._startTimerForMode({ mode, dialog, config, cycles, sessionOverrides });
      }
    };

    // Instant click handler - timer starts immediately on click (no hold required)
    startButton.addEventListener('click', applyDurationsAndStart);
  }

  /**
   * Build session override object from dialog inputs.
   * @param {HTMLElement} dialog - Dialog element
   * @param {string} mode - Timer mode
   * @param {Object} config - Config object
   * @returns {Object} Session overrides
   * @private
   */
  _buildSessionOverrides(dialog, mode, config) {
    const sessionOverrides = {};

    if (mode === 'simple') {
      const simpleDurationInput = dialog.querySelector('#zen-pomodoro-simple-duration-input');
      sessionOverrides.simpleDuration = simpleDurationInput
        ? validateIntegerInput(simpleDurationInput.value, 1, 180, config.simpleDuration)
        : config.simpleDuration;
    } else if (mode === 'pomodoro') {
      const focusDurationInput = dialog.querySelector('#zen-pomodoro-focus-duration-input');
      const breakDurationInput = dialog.querySelector('#zen-pomodoro-break-duration-input');
      sessionOverrides.focusDuration = focusDurationInput
        ? validateIntegerInput(focusDurationInput.value, 1, 120, config.focusDuration)
        : config.focusDuration;
      sessionOverrides.breakDuration = breakDurationInput
        ? validateIntegerInput(breakDurationInput.value, 1, 60, config.breakDuration)
        : config.breakDuration;
    }
    // Custom mode doesn't need overrides as cycle config contains all durations

    return sessionOverrides;
  }

  /**
   * Start timer based on selected mode.
   * @param {Object} options - Start options
   * @param {string} options.mode - Timer mode (simple, pomodoro, custom)
   * @param {HTMLElement} options.dialog - Dialog element for querying custom cycle select
   * @param {Object} options.config - Config object
   * @param {number} options.cycles - Number of cycles
   * @param {Object} options.sessionOverrides - Session duration overrides
   * @private
   */
  _startTimerForMode({ mode, dialog, config, cycles, sessionOverrides }) {
    if (mode !== 'custom') {
      window.zenPomodoroApp.startTimer(mode, cycles, sessionOverrides);
      return;
    }

    const cycleSelect = dialog.querySelector('#zen-pomodoro-custom-cycle-select');
    const savedCycles = config.customCycles || [];

    if (!cycleSelect || !cycleSelect.value) {
      window.zenPomodoroApp.showCustomAlert(
        'No Cycle Selected',
        'Please select a custom cycle or create one first.'
      );
      return;
    }

    const selectedCycle = savedCycles.find((c) => c.id === cycleSelect.value);
    if (selectedCycle) {
      window.zenPomodoroApp.startCustomCycle(selectedCycle);
    } else {
      logger.log(LOG_CATEGORIES.MENU, 'Selected custom cycle not found');
      window.zenPomodoroApp.showCustomAlert(
        'Cycle Not Found',
        'The selected custom cycle could not be found. Please select another cycle.'
      );
    }
  }

  /**
   * Show settings dialog
   * Checks security lock before showing
   */
  showSettingsDialog() {
    logger.log(LOG_CATEGORIES.MENU, 'Settings dialog requested');

    // Check if security lock should be shown
    if (window.zenPomodoroApp && window.zenPomodoroApp.security) {
      const timerActive = window.zenPomodoroApp.timer.isActive;
      if (window.zenPomodoroApp.security.shouldLockSettings(timerActive)) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Lock screen required for settings', {
          timerActive: timerActive,
        });
        window.zenPomodoroApp.security.showLockScreen(timerActive, () => {
          this.createSettingsDialog();
        });
        return;
      }
    }

    this.createSettingsDialog();
  }

  /**
   * Create the actual settings dialog
   */
  createSettingsDialog() {
    logger.log(LOG_CATEGORIES.MENU, 'Opening settings dialog');

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-settings-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    const config = getConfig();

    // Issue 5: Add back button
    const backButton = document.createElement('button');
    backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
    backButton.textContent = '← Back';
    backButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.showPomodoroMenu();
    });

    const h2 = document.createElement('h2');
    h2.textContent = 'Pomodoro Timer Settings';

    // Undo/Redo for settings
    const settingsUndoRedo = new UndoRedoManager();
    settingsUndoRedo.pushState(JSON.parse(JSON.stringify(config)));
    const undoRedoButtons = settingsUndoRedo.createButtons();

    const configSection = document.createElement('div');
    configSection.className = 'zen-pomodoro-config-section';

    // ========================================
    // Keyboard Shortcut Recorder
    // ========================================
    const shortcutRow = document.createElement('div');
    shortcutRow.className = 'zen-pomodoro-config-row';
    const shortcutLabel = document.createElement('label');
    shortcutLabel.textContent = 'Keyboard Shortcut:';
    const shortcutInput = document.createElement('div');
    shortcutInput.className = 'zen-pomodoro-shortcut-recorder';
    shortcutInput.id = 'keyboard-shortcut';
    shortcutInput.tabIndex = 0;
    shortcutInput.textContent = config.keyboardShortcut;
    shortcutInput.setAttribute('data-shortcut', config.keyboardShortcut);

    let isRecording = false;

    shortcutInput.addEventListener('click', () => {
      if (!isRecording) {
        isRecording = true;
        shortcutInput.textContent = 'Press keys...';
        shortcutInput.classList.add('recording');
      }
    });

    shortcutInput.addEventListener('keydown', (e) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      // Build shortcut string from modifier keys + regular key
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');

      // Get the key (ignore modifier keys alone)
      // Normalize key: single characters to uppercase, special keys keep their natural casing
      const key = e.key;
      if (!MODIFIER_KEYS.includes(key)) {
        // Only uppercase single character keys, keep special keys like ArrowUp, Enter as-is
        const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
        parts.push(normalizedKey);

        const shortcutStr = parts.join('+');
        shortcutInput.textContent = shortcutStr;
        shortcutInput.setAttribute('data-shortcut', shortcutStr);
        shortcutInput.classList.remove('recording');
        isRecording = false;
      }
    });

    shortcutInput.addEventListener('blur', () => {
      if (isRecording) {
        shortcutInput.textContent = shortcutInput.getAttribute('data-shortcut');
        shortcutInput.classList.remove('recording');
        isRecording = false;
      }
    });

    shortcutRow.appendChild(shortcutLabel);
    shortcutRow.appendChild(shortcutInput);

    // ========================================
    // Toggle Indicator Shortcut Recorder
    // ========================================
    const toggleIndicatorRow = document.createElement('div');
    toggleIndicatorRow.className = 'zen-pomodoro-config-row';
    const toggleIndicatorLabel = document.createElement('label');
    toggleIndicatorLabel.textContent = 'Hide/Show Indicator Shortcut:';
    const toggleIndicatorInput = document.createElement('div');
    toggleIndicatorInput.className = 'zen-pomodoro-shortcut-recorder';
    toggleIndicatorInput.id = 'toggle-indicator-shortcut';
    toggleIndicatorInput.tabIndex = 0;
    toggleIndicatorInput.textContent = config.toggleIndicatorShortcut;
    toggleIndicatorInput.setAttribute('data-shortcut', config.toggleIndicatorShortcut);

    let isRecordingToggle = false;

    toggleIndicatorInput.addEventListener('click', () => {
      if (!isRecordingToggle) {
        isRecordingToggle = true;
        toggleIndicatorInput.textContent = 'Press keys...';
        toggleIndicatorInput.classList.add('recording');
      }
    });

    toggleIndicatorInput.addEventListener('keydown', (e) => {
      if (!isRecordingToggle) return;

      e.preventDefault();
      e.stopPropagation();

      // Build shortcut string from modifier keys + regular key
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');

      // Get the key (ignore modifier keys alone)
      // Normalize key: single characters to uppercase, special keys keep their natural casing
      const key = e.key;
      if (!MODIFIER_KEYS.includes(key)) {
        // Only uppercase single character keys, keep special keys like ArrowUp, Enter as-is
        const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
        parts.push(normalizedKey);

        const shortcutStr = parts.join('+');
        toggleIndicatorInput.textContent = shortcutStr;
        toggleIndicatorInput.setAttribute('data-shortcut', shortcutStr);
        toggleIndicatorInput.classList.remove('recording');
        isRecordingToggle = false;
      }
    });

    toggleIndicatorInput.addEventListener('blur', () => {
      if (isRecordingToggle) {
        toggleIndicatorInput.textContent = toggleIndicatorInput.getAttribute('data-shortcut');
        toggleIndicatorInput.classList.remove('recording');
        isRecordingToggle = false;
      }
    });

    toggleIndicatorRow.appendChild(toggleIndicatorLabel);
    toggleIndicatorRow.appendChild(toggleIndicatorInput);

    // ========================================
    // Timer Mode Selection
    // ========================================
    const timerModeRow = document.createElement('div');
    timerModeRow.className = 'zen-pomodoro-config-row';
    const timerModeLabel = document.createElement('label');
    timerModeLabel.textContent = 'Timer Mode:';
    const timerModeSelect = document.createElement('select');
    timerModeSelect.id = 'timer-mode';

    const simpleOption = document.createElement('option');
    simpleOption.value = 'simple';
    simpleOption.textContent = 'Simple Timer';
    simpleOption.selected = config.timerMode === 'simple';

    const pomodoroOption = document.createElement('option');
    pomodoroOption.value = 'pomodoro';
    pomodoroOption.textContent = 'Pomodoro Timer';
    pomodoroOption.selected = config.timerMode === 'pomodoro';

    timerModeSelect.appendChild(simpleOption);
    timerModeSelect.appendChild(pomodoroOption);
    timerModeRow.appendChild(timerModeLabel);
    timerModeRow.appendChild(timerModeSelect);

    // ========================================
    // Simple Timer Duration (only visible for simple mode)
    // ========================================
    const simpleDurationRow = createLabeledInputRow(
      'Simple Timer Duration (min):',
      'simple-duration',
      { value: config.simpleDuration, min: 1, max: 180 }
    );
    if (config.timerMode !== 'simple') {
      simpleDurationRow.classList.add('hidden');
    }

    // ========================================
    // Pomodoro-specific options
    // ========================================
    const focusRow = createLabeledInputRow('Focus Duration (min):', 'focus-duration', {
      value: config.focusDuration,
      min: 1,
      max: 120,
    });
    if (config.timerMode === 'simple') {
      focusRow.classList.add('hidden');
    }

    const breakRow = createLabeledInputRow('Break Duration (min):', 'break-duration', {
      value: config.breakDuration,
      min: 1,
      max: 60,
    });
    if (config.timerMode === 'simple') {
      breakRow.classList.add('hidden');
    }

    const cyclesRow = createLabeledInputRow('Number of Cycles:', 'cycles', {
      value: config.cycles,
      min: 1,
      max: 20,
    });
    if (config.timerMode === 'simple') {
      cyclesRow.classList.add('hidden');
    }

    // Timer mode change handler
    timerModeSelect.addEventListener('change', () => {
      const isSimple = timerModeSelect.value === 'simple';
      simpleDurationRow.classList.toggle('hidden', !isSimple);
      focusRow.classList.toggle('hidden', isSimple);
      breakRow.classList.toggle('hidden', isSimple);
      cyclesRow.classList.toggle('hidden', isSimple);
    });

    // ========================================
    // Motivational message
    // ========================================
    const messageRow = document.createElement('div');
    messageRow.className = 'zen-pomodoro-config-row';
    const messageLabel = document.createElement('label');
    messageLabel.textContent = 'Motivational Message:';
    const messageInput = document.createElement('input');
    messageInput.type = 'text';
    messageInput.id = 'motivational-message';
    messageInput.className = 'zen-pomodoro-message-input';
    messageInput.value = config.motivationalMessage;
    messageRow.appendChild(messageLabel);
    messageRow.appendChild(messageInput);

    // ========================================
    // Website Blocking Rulesets Section
    // (Opens in separate dialog for better organization)
    // ========================================
    const rulesetsSection = document.createElement('div');
    rulesetsSection.className = 'zen-pomodoro-lockout-section';

    const rulesetsTitle = document.createElement('div');
    rulesetsTitle.className = 'zen-pomodoro-lockout-section-title';
    rulesetsTitle.textContent = '🚫 Website Blocking';

    const rulesetsDescription = document.createElement('p');
    rulesetsDescription.style.fontSize = '13px';
    rulesetsDescription.style.color = '#888';
    rulesetsDescription.style.margin = '0 0 12px 0';
    rulesetsDescription.textContent =
      'Manage website and keyword blocking rules in a dedicated dialog.';

    const manageRulesetsButton = document.createElement('button');
    manageRulesetsButton.className = 'zen-pomodoro-dialog-button secondary';
    manageRulesetsButton.id = 'zen-pomodoro-manage-rulesets';
    manageRulesetsButton.textContent = 'Manage Rulesets';
    manageRulesetsButton.addEventListener('click', () => {
      // Hide current settings dialog
      dialog.classList.remove('active');
      // Show ruleset settings dialog, pass callback to show settings again when done
      this.showRulesetSettingsDialog(() => {
        // Re-show settings dialog when returning
        dialog.classList.add('active');
      });
    });

    rulesetsSection.appendChild(rulesetsTitle);
    rulesetsSection.appendChild(rulesetsDescription);
    rulesetsSection.appendChild(manageRulesetsButton);

    // ========================================
    // Lockout Methods Section
    // ========================================
    const lockoutSection = document.createElement('div');
    lockoutSection.className = 'zen-pomodoro-lockout-section';

    const lockoutTitle = document.createElement('div');
    lockoutTitle.className = 'zen-pomodoro-lockout-section-title';
    lockoutTitle.textContent = 'Settings Lock Options';

    // Idle lockout method
    const idleMethodRow = document.createElement('div');
    idleMethodRow.className = 'zen-pomodoro-config-row';
    const idleMethodLabel = document.createElement('label');
    idleMethodLabel.textContent = 'Lockout (Timer Idle):';
    const idleMethodSelect = document.createElement('select');
    idleMethodSelect.id = 'idle-lock-method';

    const idleHoldOption = document.createElement('option');
    idleHoldOption.value = LOCKOUT_METHODS.HOLD;
    idleHoldOption.textContent = 'Hold to Unlock';
    idleHoldOption.selected = config.settingsLockIdleMethod === LOCKOUT_METHODS.HOLD;

    const idleCodeOption = document.createElement('option');
    idleCodeOption.value = LOCKOUT_METHODS.CODE;
    idleCodeOption.textContent = 'Code Entry';
    idleCodeOption.selected = config.settingsLockIdleMethod === LOCKOUT_METHODS.CODE;

    idleMethodSelect.appendChild(idleHoldOption);
    idleMethodSelect.appendChild(idleCodeOption);
    idleMethodRow.appendChild(idleMethodLabel);
    idleMethodRow.appendChild(idleMethodSelect);

    // Active lockout method
    const activeMethodRow = document.createElement('div');
    activeMethodRow.className = 'zen-pomodoro-config-row';
    const activeMethodLabel = document.createElement('label');
    activeMethodLabel.textContent = 'Lockout (Timer Active):';
    const activeMethodSelect = document.createElement('select');
    activeMethodSelect.id = 'active-lock-method';

    const activeHoldOption = document.createElement('option');
    activeHoldOption.value = LOCKOUT_METHODS.HOLD;
    activeHoldOption.textContent = 'Hold to Unlock';
    activeHoldOption.selected = config.settingsLockActiveMethod === LOCKOUT_METHODS.HOLD;

    const activeCodeOption = document.createElement('option');
    activeCodeOption.value = LOCKOUT_METHODS.CODE;
    activeCodeOption.textContent = 'Code Entry';
    activeCodeOption.selected = config.settingsLockActiveMethod === LOCKOUT_METHODS.CODE;

    activeMethodSelect.appendChild(activeHoldOption);
    activeMethodSelect.appendChild(activeCodeOption);
    activeMethodRow.appendChild(activeMethodLabel);
    activeMethodRow.appendChild(activeMethodSelect);

    // Separate hold duration settings for idle and active states
    const idleHoldDurationRow = createLabeledInputRow(
      'Idle Hold Time (seconds):',
      'idle-hold-duration',
      { value: config.settingsLockIdleHoldDuration, min: 1, max: 300 }
    );
    const activeHoldDurationRow = createLabeledInputRow(
      'Active Hold Time (seconds):',
      'active-hold-duration',
      { value: config.settingsLockActiveHoldDuration, min: 1, max: 300 }
    );

    // Separate code length settings for idle and active states
    const idleCodeLengthRow = createLabeledInputRow(
      'Idle Code Length (8-128):',
      'idle-code-length',
      { value: config.settingsLockIdleCodeLength, min: 8, max: 128 }
    );
    const activeCodeLengthRow = createLabeledInputRow(
      'Active Code Length (8-128):',
      'active-code-length',
      { value: config.settingsLockActiveCodeLength, min: 8, max: 128 }
    );

    // Show/hide settings based on the selected method for each state
    const updateLockoutVisibility = () => {
      const idleUsesHold = idleMethodSelect.value === LOCKOUT_METHODS.HOLD;
      const idleUsesCode = idleMethodSelect.value === LOCKOUT_METHODS.CODE;
      const activeUsesHold = activeMethodSelect.value === LOCKOUT_METHODS.HOLD;
      const activeUsesCode = activeMethodSelect.value === LOCKOUT_METHODS.CODE;

      idleHoldDurationRow.classList.toggle('hidden', !idleUsesHold);
      activeHoldDurationRow.classList.toggle('hidden', !activeUsesHold);
      idleCodeLengthRow.classList.toggle('hidden', !idleUsesCode);
      activeCodeLengthRow.classList.toggle('hidden', !activeUsesCode);
    };

    idleMethodSelect.addEventListener('change', updateLockoutVisibility);
    activeMethodSelect.addEventListener('change', updateLockoutVisibility);
    updateLockoutVisibility();

    lockoutSection.appendChild(lockoutTitle);
    lockoutSection.appendChild(idleMethodRow);
    lockoutSection.appendChild(activeMethodRow);
    lockoutSection.appendChild(idleHoldDurationRow);
    lockoutSection.appendChild(activeHoldDurationRow);
    lockoutSection.appendChild(idleCodeLengthRow);
    lockoutSection.appendChild(activeCodeLengthRow);

    // ========================================
    // Unified Reminder Section
    // ========================================
    const reminderSection = document.createElement('div');
    reminderSection.className = 'zen-pomodoro-lockout-section';

    const reminderTitle = document.createElement('div');
    reminderTitle.className = 'zen-pomodoro-lockout-section-title';
    reminderTitle.textContent = '⏰ Reminder Settings';

    const reminderDescription = document.createElement('p');
    reminderDescription.style.fontSize = '13px';
    reminderDescription.style.color = '#888';
    reminderDescription.style.margin = '0 0 12px 0';
    reminderDescription.textContent =
      'Choose one reminder mode: Daily (at scheduled times), Post-Session (after timer completion), or Off.';

    // Radio button group for reminder modes
    const reminderModeGroup = document.createElement('div');
    reminderModeGroup.style.marginBottom = '16px';

    // Helper function to create radio option
    const createRadioOption = (value, label, description) => {
      const radioRow = document.createElement('div');
      radioRow.style.marginBottom = '8px';

      const radioInput = document.createElement('input');
      radioInput.type = 'radio';
      radioInput.name = 'reminder-mode';
      radioInput.id = `reminder-mode-${value}`;
      radioInput.value = value;
      radioInput.checked = config.reminderMode === value;

      const radioLabel = document.createElement('label');
      radioLabel.setAttribute('for', `reminder-mode-${value}`);
      radioLabel.style.marginLeft = '8px';
      radioLabel.textContent = label;

      if (description) {
        const descSpan = document.createElement('span');
        descSpan.style.color = '#888';
        descSpan.style.fontSize = '12px';
        descSpan.style.marginLeft = '4px';
        descSpan.textContent = description;
        radioLabel.appendChild(descSpan);
      }

      radioRow.appendChild(radioInput);
      radioRow.appendChild(radioLabel);
      return { row: radioRow, input: radioInput };
    };

    const offRadio = createRadioOption(Constants.REMINDER_MODES.NONE, 'Off', '(no reminders)');
    const dailyRadio = createRadioOption(
      Constants.REMINDER_MODES.DAILY,
      'Daily Reminders',
      '(at scheduled times)'
    );
    const postSessionRadio = createRadioOption(
      Constants.REMINDER_MODES.POST_SESSION,
      'Post-Session Reminders',
      '(after timer completion)'
    );

    reminderModeGroup.appendChild(offRadio.row);
    reminderModeGroup.appendChild(dailyRadio.row);
    reminderModeGroup.appendChild(postSessionRadio.row);

    // ========================================
    // Daily Reminder Settings Subsection
    // ========================================
    const dailyReminderSubsection = document.createElement('div');
    dailyReminderSubsection.className = 'zen-pomodoro-subsection';
    dailyReminderSubsection.style.marginTop = '16px';
    dailyReminderSubsection.style.paddingLeft = '24px';
    dailyReminderSubsection.style.borderLeft = '3px solid #007acc';

    const dailySubtitle = document.createElement('div');
    dailySubtitle.style.fontSize = '14px';
    dailySubtitle.style.fontWeight = 'bold';
    dailySubtitle.style.marginBottom = '12px';
    dailySubtitle.textContent = 'Daily Reminder Settings';

    // Reminder times input (comma-separated)
    const reminderTimesRow = document.createElement('div');
    reminderTimesRow.className = 'zen-pomodoro-config-row';
    reminderTimesRow.id = 'daily-reminder-times-row';

    const reminderTimesLabel = document.createElement('label');
    reminderTimesLabel.textContent = 'Reminder Times (comma-separated, 24h):';

    const reminderTimesInput = document.createElement('input');
    reminderTimesInput.type = 'text';
    reminderTimesInput.id = 'daily-reminder-times';
    reminderTimesInput.placeholder = '11:15,16:15';
    reminderTimesInput.value = config.dailyReminderTimes.join(',');

    reminderTimesRow.appendChild(reminderTimesLabel);
    reminderTimesRow.appendChild(reminderTimesInput);

    // Skip cooldown input
    const dailyReminderCooldownRow = createLabeledInputRow(
      'Skip cooldown (min):',
      'daily-reminder-skip-cooldown',
      { value: config.dailyReminderSkipCooldown, min: 1, max: 120 }
    );

    // Development: Trigger reminder button
    const triggerReminderButton = document.createElement('button');
    triggerReminderButton.className = 'zen-pomodoro-dialog-button secondary';
    triggerReminderButton.id = 'zen-pomodoro-trigger-daily-reminder';
    triggerReminderButton.textContent = '🧪 Test Daily Reminder';
    triggerReminderButton.title = 'Trigger the daily reminder for testing (ignores time/date)';
    triggerReminderButton.addEventListener('click', () => {
      if (window.zenPomodoroApp?.dailyReminder) {
        dialog.classList.remove('active');
        window.zenPomodoroApp.dailyReminder.triggerReminderForTesting();
      }
    });

    dailyReminderSubsection.appendChild(dailySubtitle);
    dailyReminderSubsection.appendChild(reminderTimesRow);
    dailyReminderSubsection.appendChild(dailyReminderCooldownRow);
    dailyReminderSubsection.appendChild(triggerReminderButton);

    // ========================================
    // Post-Session Settings Subsection
    // ========================================
    const postSessionSubsection = document.createElement('div');
    postSessionSubsection.className = 'zen-pomodoro-subsection';
    postSessionSubsection.style.marginTop = '16px';
    postSessionSubsection.style.paddingLeft = '24px';
    postSessionSubsection.style.borderLeft = '3px solid #007acc';

    const postSessionSubtitle = document.createElement('div');
    postSessionSubtitle.style.fontSize = '14px';
    postSessionSubtitle.style.fontWeight = 'bold';
    postSessionSubtitle.style.marginBottom = '12px';
    postSessionSubtitle.textContent = 'Post-Session Settings';

    // Idle time input
    const postSessionIdleTimeRow = createLabeledInputRow(
      'Idle time before reminder (min):',
      'post-session-idle-time',
      { value: config.postSessionIdleTime, min: 1, max: 240 }
    );

    // Skip cooldown input
    const postSessionCooldownRow = createLabeledInputRow(
      'Skip cooldown (min):',
      'post-session-skip-cooldown',
      { value: config.postSessionSkipCooldown, min: 1, max: 120 }
    );

    // Focus time goal input
    const postSessionFocusTimeRow = createLabeledInputRow(
      'Daily focus time goal (min):',
      'post-session-focus-time-goal',
      { value: config.postSessionFocusTimeGoal, min: 1, max: 600 }
    );

    // Focus time goal help text
    const focusTimeHelpText = document.createElement('p');
    focusTimeHelpText.className = 'zen-pomodoro-help-text';
    focusTimeHelpText.textContent = 'Reminders stop after this much focus time is achieved.';

    // Reminder end time input
    const postSessionEndTimeRow = document.createElement('div');
    postSessionEndTimeRow.className = 'zen-pomodoro-config-row';
    postSessionEndTimeRow.id = 'post-session-end-time-row';

    const postSessionEndTimeLabel = document.createElement('label');
    postSessionEndTimeLabel.textContent = 'Auto-off time (24h):';

    const postSessionEndTimeInput = document.createElement('input');
    postSessionEndTimeInput.type = 'time';
    postSessionEndTimeInput.id = 'post-session-end-time';
    postSessionEndTimeInput.value = config.postSessionReminderEndTime;

    postSessionEndTimeRow.appendChild(postSessionEndTimeLabel);
    postSessionEndTimeRow.appendChild(postSessionEndTimeInput);

    // End time help text
    const endTimeHelpText = document.createElement('p');
    endTimeHelpText.className = 'zen-pomodoro-help-text';
    endTimeHelpText.textContent =
      'Automatically disable reminders after this time (e.g., 00:30 for 12:30 AM).';

    // Skip method select
    const postSessionMethodRow = document.createElement('div');
    postSessionMethodRow.className = 'zen-pomodoro-config-row';
    const postSessionMethodLabel = document.createElement('label');
    postSessionMethodLabel.textContent = 'Skip method:';
    const postSessionMethodSelect = document.createElement('select');
    postSessionMethodSelect.id = 'post-session-skip-method';

    const postSessionHoldOption = document.createElement('option');
    postSessionHoldOption.value = LOCKOUT_METHODS.HOLD;
    postSessionHoldOption.textContent = 'Hold to Skip';
    postSessionHoldOption.selected = config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD;

    const postSessionCodeOption = document.createElement('option');
    postSessionCodeOption.value = LOCKOUT_METHODS.CODE;
    postSessionCodeOption.textContent = 'Code Entry';
    postSessionCodeOption.selected = config.postSessionSkipMethod === LOCKOUT_METHODS.CODE;

    postSessionMethodSelect.appendChild(postSessionHoldOption);
    postSessionMethodSelect.appendChild(postSessionCodeOption);
    postSessionMethodRow.appendChild(postSessionMethodLabel);
    postSessionMethodRow.appendChild(postSessionMethodSelect);

    // Hold duration input
    const postSessionHoldDurationRow = createLabeledInputRow(
      'Initial hold time (sec):',
      'post-session-hold-duration',
      { value: config.postSessionSkipHoldDuration, min: 5, max: 120 }
    );

    // Code length input
    const postSessionCodeLengthRow = createLabeledInputRow(
      'Initial code length:',
      'post-session-code-length',
      { value: config.postSessionSkipCodeLength, min: 16, max: 128 }
    );

    // Escalation info
    const escalationInfo = document.createElement('p');
    escalationInfo.className = 'zen-pomodoro-help-text top-margin';
    escalationInfo.textContent = 'Skip requirement increases by 50% each time.';

    // Development: Trigger post-session reminder button
    const triggerPostSessionButton = document.createElement('button');
    triggerPostSessionButton.className = 'zen-pomodoro-dialog-button secondary';
    triggerPostSessionButton.id = 'zen-pomodoro-trigger-post-session';
    triggerPostSessionButton.textContent = '🧪 Test Post-Session Reminder';
    triggerPostSessionButton.title =
      'Trigger the post-session reminder for testing (ignores idle time)';

    triggerPostSessionButton.addEventListener('click', () => {
      if (window.zenPomodoroApp?.postSessionReminder) {
        dialog.classList.remove('active');
        window.zenPomodoroApp.postSessionReminder.triggerReminderForTesting();
      }
    });

    // Helper to set element display style
    const setElementDisplay = (element, visible) => {
      element.classList.toggle('hidden', !visible);
    };

    // Show/hide settings based on skip method
    const updatePostSessionMethodVisibility = () => {
      const usesHold = postSessionMethodSelect.value === LOCKOUT_METHODS.HOLD;
      setElementDisplay(postSessionHoldDurationRow, usesHold);
      setElementDisplay(postSessionCodeLengthRow, !usesHold);
    };

    postSessionMethodSelect.addEventListener('change', updatePostSessionMethodVisibility);

    postSessionSubsection.appendChild(postSessionSubtitle);
    postSessionSubsection.appendChild(postSessionIdleTimeRow);
    postSessionSubsection.appendChild(postSessionCooldownRow);
    postSessionSubsection.appendChild(postSessionFocusTimeRow);
    postSessionSubsection.appendChild(focusTimeHelpText);
    postSessionSubsection.appendChild(postSessionEndTimeRow);
    postSessionSubsection.appendChild(endTimeHelpText);
    postSessionSubsection.appendChild(postSessionMethodRow);
    postSessionSubsection.appendChild(postSessionHoldDurationRow);
    postSessionSubsection.appendChild(postSessionCodeLengthRow);
    postSessionSubsection.appendChild(escalationInfo);
    postSessionSubsection.appendChild(triggerPostSessionButton);

    // Show/hide subsections based on selected reminder mode
    const updateReminderModeVisibility = () => {
      // Scope lookup to the current settings dialog to avoid picking radios from other dialogs
      const root = reminderSection.closest('.zen-pomodoro-dialog') || document;
      const selectedMode = root.querySelector('input[name="reminder-mode"]:checked')?.value;
      setElementDisplay(
        dailyReminderSubsection,
        selectedMode === Constants.REMINDER_MODES.DAILY
      );
      setElementDisplay(
        postSessionSubsection,
        selectedMode === Constants.REMINDER_MODES.POST_SESSION
      );

      // Update post-session method visibility if post-session is selected
      if (selectedMode === Constants.REMINDER_MODES.POST_SESSION) {
        updatePostSessionMethodVisibility();
      }
    };

    // Add event listeners to radio buttons
    [offRadio.input, dailyRadio.input, postSessionRadio.input].forEach((radio) => {
      radio.addEventListener('change', updateReminderModeVisibility);
    });

    // Initial visibility update
    updateReminderModeVisibility();

    // Assemble reminder section
    reminderSection.appendChild(reminderTitle);
    reminderSection.appendChild(reminderDescription);
    reminderSection.appendChild(reminderModeGroup);
    reminderSection.appendChild(dailyReminderSubsection);
    reminderSection.appendChild(postSessionSubsection);

    // ========================================
    // Timer Reminders Section
    // ========================================
    const timerRemindersSection = document.createElement('div');
    timerRemindersSection.className = 'zen-pomodoro-config-section';

    const timerRemindersTitle = document.createElement('h3');
    timerRemindersTitle.textContent = 'Timer Reminders';

    const timerRemindersDescription = document.createElement('p');
    timerRemindersDescription.className = 'zen-pomodoro-help-text';
    timerRemindersDescription.textContent =
      'Get notified at specified times before focus or break phases end.';

    // Enable timer reminders checkbox
    const timerRemindersEnabledRow = document.createElement('div');
    timerRemindersEnabledRow.className = 'zen-pomodoro-config-row';
    const timerRemindersEnabledLabel = document.createElement('label');
    timerRemindersEnabledLabel.textContent = 'Enable timer reminders:';
    const timerRemindersEnabledCheckbox = document.createElement('input');
    timerRemindersEnabledCheckbox.type = 'checkbox';
    timerRemindersEnabledCheckbox.id = 'timer-reminders-enabled';
    timerRemindersEnabledCheckbox.checked = config.timerRemindersEnabled;
    timerRemindersEnabledRow.appendChild(timerRemindersEnabledLabel);
    timerRemindersEnabledRow.appendChild(timerRemindersEnabledCheckbox);

    // Focus Phase Reminders Subsection
    const focusRemindersSubsection = document.createElement('div');
    focusRemindersSubsection.className = 'zen-pomodoro-subsection';
    focusRemindersSubsection.style.marginTop = '16px';
    focusRemindersSubsection.style.paddingLeft = '24px';
    focusRemindersSubsection.style.borderLeft = '3px solid #007acc';

    const focusRemindersSubtitle = document.createElement('div');
    focusRemindersSubtitle.style.fontSize = '14px';
    focusRemindersSubtitle.style.fontWeight = 'bold';
    focusRemindersSubtitle.style.marginBottom = '12px';
    focusRemindersSubtitle.textContent = 'Focus Phase Reminders';

    const focusRemindersHelp = document.createElement('p');
    focusRemindersHelp.className = 'zen-pomodoro-help-text';
    focusRemindersHelp.textContent = 'Minutes before focus phase ends to show reminder:';

    // Focus reminders list
    const focusRemindersList = document.createElement('div');
    focusRemindersList.id = 'focus-reminders-list';
    focusRemindersList.style.marginBottom = '12px';

    // Initialize array if missing
    if (!Array.isArray(config.focusPhaseReminders)) {
      config.focusPhaseReminders = [];
    }

    const renderFocusReminders = () => {
      focusRemindersList.innerHTML = '';
      const reminders = config.focusPhaseReminders || [];
      reminders.forEach((minutes) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'zen-pomodoro-reminder-item';
        itemRow.style.display = 'flex';
        itemRow.style.alignItems = 'center';
        itemRow.style.marginBottom = '8px';

        const itemText = document.createElement('span');
        itemText.textContent = `${minutes} minute${minutes === 1 ? '' : 's'}`;
        itemText.style.flex = '1';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'zen-pomodoro-dialog-button secondary';
        deleteBtn.textContent = '×';
        deleteBtn.style.minWidth = '32px';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.addEventListener('click', () => {
          // Use filter to avoid stale index issues
          config.focusPhaseReminders = config.focusPhaseReminders.filter((m) => m !== minutes);
          renderFocusReminders();
        });

        itemRow.appendChild(itemText);
        itemRow.appendChild(deleteBtn);
        focusRemindersList.appendChild(itemRow);
      });
    };

    renderFocusReminders();

    // Add focus reminder input
    const addFocusReminderRow = document.createElement('div');
    addFocusReminderRow.className = 'zen-pomodoro-config-row';
    const addFocusReminderInput = document.createElement('input');
    addFocusReminderInput.type = 'number';
    addFocusReminderInput.id = 'add-focus-reminder-input';
    addFocusReminderInput.placeholder = 'Minutes';
    addFocusReminderInput.min = 1;
    addFocusReminderInput.max = 120;
    addFocusReminderInput.style.flex = '1';

    const addFocusReminderBtn = document.createElement('button');
    addFocusReminderBtn.className = 'zen-pomodoro-dialog-button secondary';
    addFocusReminderBtn.textContent = 'Add';
    addFocusReminderBtn.addEventListener('click', () => {
      const value = parseInt(addFocusReminderInput.value, 10);
      if (isValidRangeValue(value, 1, 120)) {
        if (!config.focusPhaseReminders.includes(value)) {
          config.focusPhaseReminders.push(value);
          config.focusPhaseReminders.sort((a, b) => b - a); // Sort descending
          renderFocusReminders();
          addFocusReminderInput.value = '';
        }
      }
    });

    addFocusReminderRow.appendChild(addFocusReminderInput);
    addFocusReminderRow.appendChild(addFocusReminderBtn);

    focusRemindersSubsection.appendChild(focusRemindersSubtitle);
    focusRemindersSubsection.appendChild(focusRemindersHelp);
    focusRemindersSubsection.appendChild(focusRemindersList);
    focusRemindersSubsection.appendChild(addFocusReminderRow);

    // Break Phase Reminders Subsection
    const breakRemindersSubsection = document.createElement('div');
    breakRemindersSubsection.className = 'zen-pomodoro-subsection';
    breakRemindersSubsection.style.marginTop = '16px';
    breakRemindersSubsection.style.paddingLeft = '24px';
    breakRemindersSubsection.style.borderLeft = '3px solid #007acc';

    const breakRemindersSubtitle = document.createElement('div');
    breakRemindersSubtitle.style.fontSize = '14px';
    breakRemindersSubtitle.style.fontWeight = 'bold';
    breakRemindersSubtitle.style.marginBottom = '12px';
    breakRemindersSubtitle.textContent = 'Break Phase Reminders';

    const breakRemindersHelp = document.createElement('p');
    breakRemindersHelp.className = 'zen-pomodoro-help-text';
    breakRemindersHelp.textContent = 'Minutes before break phase ends to show reminder:';

    // Break reminders list
    const breakRemindersList = document.createElement('div');
    breakRemindersList.id = 'break-reminders-list';
    breakRemindersList.style.marginBottom = '12px';

    // Initialize array if missing
    if (!Array.isArray(config.breakPhaseReminders)) {
      config.breakPhaseReminders = [];
    }

    const renderBreakReminders = () => {
      breakRemindersList.innerHTML = '';
      const reminders = config.breakPhaseReminders || [];
      reminders.forEach((minutes) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'zen-pomodoro-reminder-item';
        itemRow.style.display = 'flex';
        itemRow.style.alignItems = 'center';
        itemRow.style.marginBottom = '8px';

        const itemText = document.createElement('span');
        itemText.textContent = `${minutes} minute${minutes === 1 ? '' : 's'}`;
        itemText.style.flex = '1';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'zen-pomodoro-dialog-button secondary';
        deleteBtn.textContent = '×';
        deleteBtn.style.minWidth = '32px';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.addEventListener('click', () => {
          // Use filter to avoid stale index issues
          config.breakPhaseReminders = config.breakPhaseReminders.filter((m) => m !== minutes);
          renderBreakReminders();
        });

        itemRow.appendChild(itemText);
        itemRow.appendChild(deleteBtn);
        breakRemindersList.appendChild(itemRow);
      });
    };

    renderBreakReminders();

    // Add break reminder input
    const addBreakReminderRow = document.createElement('div');
    addBreakReminderRow.className = 'zen-pomodoro-config-row';
    const addBreakReminderInput = document.createElement('input');
    addBreakReminderInput.type = 'number';
    addBreakReminderInput.id = 'add-break-reminder-input';
    addBreakReminderInput.placeholder = 'Minutes';
    addBreakReminderInput.min = 1;
    addBreakReminderInput.max = 60;
    addBreakReminderInput.style.flex = '1';

    const addBreakReminderBtn = document.createElement('button');
    addBreakReminderBtn.className = 'zen-pomodoro-dialog-button secondary';
    addBreakReminderBtn.textContent = 'Add';
    addBreakReminderBtn.addEventListener('click', () => {
      const value = parseInt(addBreakReminderInput.value, 10);
      if (isValidRangeValue(value, 1, 60)) {
        if (!config.breakPhaseReminders.includes(value)) {
          config.breakPhaseReminders.push(value);
          config.breakPhaseReminders.sort((a, b) => b - a); // Sort descending
          renderBreakReminders();
          addBreakReminderInput.value = '';
        }
      }
    });

    addBreakReminderRow.appendChild(addBreakReminderInput);
    addBreakReminderRow.appendChild(addBreakReminderBtn);

    breakRemindersSubsection.appendChild(breakRemindersSubtitle);
    breakRemindersSubsection.appendChild(breakRemindersHelp);
    breakRemindersSubsection.appendChild(breakRemindersList);
    breakRemindersSubsection.appendChild(addBreakReminderRow);

    // Assemble timer reminders section
    timerRemindersSection.appendChild(timerRemindersTitle);
    timerRemindersSection.appendChild(timerRemindersDescription);
    timerRemindersSection.appendChild(timerRemindersEnabledRow);
    timerRemindersSection.appendChild(focusRemindersSubsection);
    timerRemindersSection.appendChild(breakRemindersSubsection);

    // ========================================
    // Assemble config section
    // ========================================
    configSection.appendChild(shortcutRow);
    configSection.appendChild(toggleIndicatorRow);
    configSection.appendChild(timerModeRow);
    configSection.appendChild(simpleDurationRow);
    configSection.appendChild(focusRow);
    configSection.appendChild(breakRow);
    configSection.appendChild(cyclesRow);
    configSection.appendChild(messageRow);
    configSection.appendChild(rulesetsSection);
    configSection.appendChild(lockoutSection);
    configSection.appendChild(reminderSection);
    configSection.appendChild(timerRemindersSection);

    // Buttons
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.id = 'zen-pomodoro-settings-cancel';
    cancelButton.textContent = 'Cancel';

    const exportLogsButton = document.createElement('button');
    exportLogsButton.className = 'zen-pomodoro-dialog-button secondary';
    exportLogsButton.id = 'zen-pomodoro-export-logs';
    exportLogsButton.textContent = 'Export Logs';

    // Helper function to save all settings
    const saveAllSettings = () => {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Saving settings');
      this._saveKeyboardShortcut(shortcutInput, config);
      this._saveToggleIndicatorShortcut(toggleIndicatorInput, config);
      this._saveTimerSettings(dialog, config, timerModeSelect);
      this._saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect);
      this._saveReminderSettings(dialog, config);
      this._saveTimerRemindersSettings(dialog, config);

      saveConfig(config);
      this._updateOverlayMessage(config);
    };

    const saveButton = document.createElement('button');
    saveButton.className = 'zen-pomodoro-dialog-button secondary';
    saveButton.id = 'zen-pomodoro-settings-save';
    saveButton.textContent = 'Save';

    const saveCloseButton = document.createElement('button');
    saveCloseButton.className = 'zen-pomodoro-dialog-button';
    saveCloseButton.id = 'zen-pomodoro-settings-save-close';
    saveCloseButton.textContent = 'Save & Close';

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(exportLogsButton);
    buttonDiv.appendChild(saveButton);
    buttonDiv.appendChild(saveCloseButton);

    // Assemble dialog - create header row for back button and undo/redo
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '8px';
    backButton.style.marginBottom = '0';
    headerRow.appendChild(backButton);
    headerRow.appendChild(undoRedoButtons);

    dialog.appendChild(headerRow);
    dialog.appendChild(h2);
    dialog.appendChild(configSection);
    dialog.appendChild(buttonDiv);

    document.documentElement.appendChild(dialog);

    // Track changes for undo/redo
    configSection.addEventListener('change', () => {
      settingsUndoRedo.pushState(JSON.parse(JSON.stringify(getConfig())));
    });

    // Set restore callback for undo/redo
    settingsUndoRedo.onStateRestore = (state) => {
      // Save the restored state to config
      saveConfig(state);
      // Re-create the dialog to reflect changes
      saveDialogPosition(dialog);
      dialog.remove();
      this.createSettingsDialog();
    };

    // Apply saved position from parent dialog before setting up drag
    applyLastDialogPosition(dialog);

    // Issue 8: Make dialog draggable
    setupDialogDrag(dialog);

    cancelButton.addEventListener('click', () => {
      logger.log(LOG_CATEGORIES.MENU, 'Settings dialog cancelled');
      dialog.remove();
    });

    exportLogsButton.addEventListener('click', () => {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Export logs button clicked');
      if (window.zenPomodoroApp?.logger) {
        window.zenPomodoroApp.logger.exportLogs();
        window.zenPomodoroApp.showCustomAlert(
          'Export Complete',
          'Logs have been exported successfully.'
        );
      }
    });

    // Save button - saves settings but keeps dialog open
    saveButton.addEventListener('click', () => {
      saveAllSettings();
      window.zenPomodoroApp?.showCustomAlert('Saved', 'Settings have been saved.');
    });

    // Save & Close button - saves settings and closes dialog
    saveCloseButton.addEventListener('click', () => {
      saveAllSettings();
      dialog.remove();
    });
  }

  /**
   * Save keyboard shortcut from settings dialog.
   * @param {HTMLElement} shortcutInput - The shortcut input element
   * @param {Object} config - Configuration object to update
   * @private
   */
  _saveKeyboardShortcut(shortcutInput, config) {
    const newShortcut = shortcutInput.getAttribute('data-shortcut');
    if (!newShortcut || newShortcut === config.keyboardShortcut) return;

    const shortcutParts = newShortcut.split('+');
    const hasNonModifierKey = shortcutParts.some(
      (part) => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(part)
    );

    if (!hasNonModifierKey) return;

    config.keyboardShortcut = newShortcut;
    if (window.zenPomodoroApp?.keyboardShortcut) {
      window.zenPomodoroApp.keyboardShortcut.setupKeyboardShortcut(newShortcut);
    }
    setPref('keyboardShortcut', newShortcut);
  }

  /**
   * Save toggle indicator shortcut from settings dialog.
   * @param {HTMLElement} shortcutInput - The shortcut input element
   * @param {Object} config - Configuration object to update
   * @private
   */
  _saveToggleIndicatorShortcut(shortcutInput, config) {
    const newShortcut = shortcutInput.getAttribute('data-shortcut');
    if (!newShortcut || newShortcut === config.toggleIndicatorShortcut) return;

    const shortcutParts = newShortcut.split('+');
    const hasNonModifierKey = shortcutParts.some(
      (part) => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(part)
    );

    if (!hasNonModifierKey) return;

    config.toggleIndicatorShortcut = newShortcut;
    if (window.zenPomodoroApp?.keyboardShortcut) {
      window.zenPomodoroApp.keyboardShortcut.setupToggleIndicatorShortcut(newShortcut);
    }
    setPref('toggleIndicatorShortcut', newShortcut);
  }

  /**
   * Save timer settings from settings dialog.
   * @param {HTMLElement} dialog - The dialog element
   * @param {Object} config - Configuration object to update
   * @param {HTMLSelectElement} timerModeSelect - Timer mode select element
   * @private
   */
  _saveTimerSettings(dialog, config, timerModeSelect) {
    config.timerMode = timerModeSelect.value;

    const simpleDurationInput = dialog.querySelector('#simple-duration');
    if (simpleDurationInput) {
      config.simpleDuration = validateIntegerInput(
        simpleDurationInput.value,
        1,
        180,
        config.simpleDuration
      );
    }
    const focusDurationInput = dialog.querySelector('#focus-duration');
    if (focusDurationInput) {
      config.focusDuration = validateIntegerInput(
        focusDurationInput.value,
        1,
        120,
        config.focusDuration
      );
    }
    const breakDurationInput = dialog.querySelector('#break-duration');
    if (breakDurationInput) {
      config.breakDuration = validateIntegerInput(
        breakDurationInput.value,
        1,
        60,
        config.breakDuration
      );
    }
    const cyclesInput = dialog.querySelector('#cycles');
    if (cyclesInput) {
      config.cycles = validateIntegerInput(cyclesInput.value, 1, 20, config.cycles);
    }
    const motivationalMessageInput = dialog.querySelector('#motivational-message');
    if (motivationalMessageInput) {
      config.motivationalMessage = sanitizeText(motivationalMessageInput.value);
    }
  }

  /**
   * Save lockout settings from settings dialog.
   * @param {HTMLElement} dialog - The dialog element
   * @param {Object} config - Configuration object to update
   * @param {HTMLSelectElement} idleMethodSelect - Idle method select element
   * @param {HTMLSelectElement} activeMethodSelect - Active method select element
   * @private
   */
  _saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect) {
    config.settingsLockIdleMethod = idleMethodSelect.value;
    config.settingsLockActiveMethod = activeMethodSelect.value;

    // Save idle hold duration
    const idleHoldDurationInput = dialog.querySelector('#idle-hold-duration');
    if (idleHoldDurationInput) {
      config.settingsLockIdleHoldDuration = validateIntegerInput(
        idleHoldDurationInput.value,
        1,
        300,
        config.settingsLockIdleHoldDuration
      );
    }

    // Save active hold duration
    const activeHoldDurationInput = dialog.querySelector('#active-hold-duration');
    if (activeHoldDurationInput) {
      config.settingsLockActiveHoldDuration = validateIntegerInput(
        activeHoldDurationInput.value,
        1,
        300,
        config.settingsLockActiveHoldDuration
      );
    }

    // Save idle code length
    const idleCodeLengthInput = dialog.querySelector('#idle-code-length');
    if (idleCodeLengthInput) {
      config.settingsLockIdleCodeLength = validateIntegerInput(
        idleCodeLengthInput.value,
        8,
        128,
        config.settingsLockIdleCodeLength
      );
    }

    // Save active code length
    const activeCodeLengthInput = dialog.querySelector('#active-code-length');
    if (activeCodeLengthInput) {
      config.settingsLockActiveCodeLength = validateIntegerInput(
        activeCodeLengthInput.value,
        8,
        128,
        config.settingsLockActiveCodeLength
      );
    }
  }

  /**
   * Save blocked workspaces from settings dialog.
   * @param {HTMLElement} workspaceContainer - Container with workspace checkboxes
   * @param {Object} config - Configuration object to update
   * @private
   */
  _saveBlockedWorkspaces(workspaceContainer, config) {
    const checkedWorkspaces = [];
    workspaceContainer.querySelectorAll('input[type="checkbox"]:checked').forEach((checkbox) => {
      checkedWorkspaces.push(checkbox.value);
    });
    config.blockedWorkspaces = checkedWorkspaces;
  }

  /**
   * Save reminder settings from settings dialog (unified for both daily and post-session).
   * @param {HTMLElement} dialog - The dialog element
   * @param {Object} config - Configuration object to update
   * @private
   */
  _saveReminderSettings(dialog, config) {
    const selectedMode = dialog.querySelector('input[name="reminder-mode"]:checked')?.value;
    
    if (!selectedMode) {
      logger.log(LOG_CATEGORIES.SETTINGS, 'No reminder mode selected, defaulting to none');
      config.reminderMode = Constants.REMINDER_MODES.NONE;
      setPref('reminderMode', Constants.REMINDER_MODES.NONE);
      return;
    }

    config.reminderMode = selectedMode;
    setPref('reminderMode', selectedMode);
    logger.log(LOG_CATEGORIES.SETTINGS, 'Saving reminder mode', { mode: selectedMode });

    if (selectedMode === Constants.REMINDER_MODES.DAILY) {
      this._saveDailyReminderSettings(dialog, config);
    } else if (selectedMode === Constants.REMINDER_MODES.POST_SESSION) {
      this._savePostSessionReminderSettings(dialog, config);
    }
  }

  /**
   * Save daily reminder settings from dialog.
   * @param {HTMLElement} dialog - The dialog element
   * @param {Object} config - Configuration object to update
   * @private
   */
  _saveDailyReminderSettings(dialog, config) {
    // Save skip cooldown
    const cooldownInput = dialog.querySelector('#daily-reminder-skip-cooldown');
    if (cooldownInput) {
      config.dailyReminderSkipCooldown = validateIntegerInput(
        parseInt(cooldownInput.value, 10),
        1,
        120,
        config.dailyReminderSkipCooldown
      );
    }

    // Validate and save times (comma-separated HH:MM values)
    const validTimes = this._parseValidTimesFromInput(dialog);
    if (validTimes.length > 0) {
      config.dailyReminderTimes = validTimes;
    }

    logger.log(LOG_CATEGORIES.SETTINGS, 'Saved daily reminder settings', {
      times: config.dailyReminderTimes,
      skipCooldown: config.dailyReminderSkipCooldown,
    });
  }

  /**
   * Parse and validate times from the daily reminder times input.
   * @param {HTMLElement} dialog - The dialog element
   * @returns {string[]} Array of valid HH:MM time strings
   * @private
   */
  _parseValidTimesFromInput(dialog) {
    const timesInput = dialog.querySelector('#daily-reminder-times');
    if (!timesInput?.value) return [];
    
    const times = timesInput.value.split(',').map((t) => t.trim());
    return times.filter((t) => isValidTimeFormat(t));
  }

  /**
   * Save post-session reminder settings from dialog.
   * @param {HTMLElement} dialog - The dialog element
   * @param {Object} config - Configuration object to update
   * @private
   */
  _savePostSessionReminderSettings(dialog, config) {
    const methodSelect = dialog.querySelector('#post-session-skip-method');
    if (methodSelect) {
      config.postSessionSkipMethod = methodSelect.value;
    }

    // Save integer settings using helper
    const intSettings = [
      { selector: '#post-session-idle-time', key: 'postSessionIdleTime', min: 1, max: 240 },
      { selector: '#post-session-skip-cooldown', key: 'postSessionSkipCooldown', min: 1, max: 120 },
      { selector: '#post-session-focus-time-goal', key: 'postSessionFocusTimeGoal', min: 1, max: 600, zenUiPrefKey: 'postSessionFocusTimeGoal' },
      { selector: '#post-session-hold-duration', key: 'postSessionSkipHoldDuration', min: 5, max: 120 },
      { selector: '#post-session-code-length', key: 'postSessionSkipCodeLength', min: 16, max: 128 },
    ];

    intSettings.forEach(({ selector, key, min, max, zenUiPrefKey = null }) => {
      const value = getValidatedIntFromDialog(dialog, { selector, min, max, defaultValue: config[key] });
      if (value !== null) {
        config[key] = value;
        if (zenUiPrefKey) setPref(zenUiPrefKey, value);
      }
    });

    // Save end time (with HH:MM validation)
    const endTimeInput = dialog.querySelector('#post-session-end-time');
    if (endTimeInput?.value && isValidTimeFormat(endTimeInput.value)) {
      config.postSessionReminderEndTime = endTimeInput.value;
      setPref('postSessionReminderEndTime', endTimeInput.value);
    }

    logger.log(LOG_CATEGORIES.SETTINGS, 'Saved post-session reminder settings', {
      skipMethod: config.postSessionSkipMethod,
      idleTime: config.postSessionIdleTime,
      skipCooldown: config.postSessionSkipCooldown,
      focusTimeGoal: config.postSessionFocusTimeGoal,
      endTime: config.postSessionReminderEndTime,
    });
  }

  /**
   * Save timer reminders settings from dialog.
   * @param {HTMLElement} dialog - The dialog element
   * @param {Object} config - Configuration object to update
   * @private
   */
  _saveTimerRemindersSettings(dialog, config) {
    // Save enabled checkbox
    const enabledCheckbox = dialog.querySelector('#timer-reminders-enabled');
    if (enabledCheckbox) {
      config.timerRemindersEnabled = enabledCheckbox.checked;
      setPref('timerRemindersEnabled', enabledCheckbox.checked);
    }

    // Save focus phase reminders array
    if (config.focusPhaseReminders && Array.isArray(config.focusPhaseReminders)) {
      setPref('focusPhaseReminders', config.focusPhaseReminders.join(','));
    }

    // Save break phase reminders array
    if (config.breakPhaseReminders && Array.isArray(config.breakPhaseReminders)) {
      setPref('breakPhaseReminders', config.breakPhaseReminders.join(','));
    }

    logger.log(LOG_CATEGORIES.SETTINGS, 'Saved timer reminders settings', {
      enabled: config.timerRemindersEnabled,
      focusReminders: config.focusPhaseReminders,
      breakReminders: config.breakPhaseReminders,
    });
  }

  /**
   * Update overlay message if it exists.
   * @param {Object} config - Configuration object with message
   * @private
   */
  _updateOverlayMessage(config) {
    if (!window.zenPomodoroApp?.overlay?.overlay) return;

    const messageEl =
      window.zenPomodoroApp.overlay.overlay.querySelector('#zen-pomodoro-message');
    if (messageEl) {
      messageEl.textContent = sanitizeText(config.motivationalMessage);
    }
  }

  /**
   * Show the Ruleset Settings dialog
   * @param {Function} [onClose] - Optional callback when dialog closes (for returning to settings)
   */
  showRulesetSettingsDialog(onClose = null) {
    logger.log(LOG_CATEGORIES.MENU, 'Opening ruleset settings dialog');

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-ruleset-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    const config = getConfig();

    // Back button - returns to settings or closes
    const backButton = document.createElement('button');
    backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
    backButton.textContent = '← Back';
    backButton.addEventListener('click', () => {
      // Save current rulesets before closing
      saveConfig(config);
      saveDialogPosition(dialog);
      dialog.remove();
      if (onClose) {
        onClose();
      } else {
        this.showPomodoroMenu();
      }
    });

    const h2 = document.createElement('h2');
    h2.textContent = 'Ruleset Settings';

    // Undo/Redo for rulesets
    const rulesetUndoRedo = new UndoRedoManager();
    rulesetUndoRedo.pushState(JSON.parse(JSON.stringify(config)));
    const undoRedoButtons = rulesetUndoRedo.createButtons();

    const configSection = document.createElement('div');
    configSection.className = 'zen-pomodoro-config-section';

    // Description
    const description = document.createElement('p');
    description.style.fontSize = '13px';
    description.style.color = '#888';
    description.style.margin = '0 0 12px 0';
    description.textContent =
      'Configure website and keyword blocking rules. Block websites by domain, path, or keywords in page content.';

    // Rulesets container
    const rulesetsContainer = document.createElement('div');
    rulesetsContainer.className = 'zen-pomodoro-rulesets-container';
    rulesetsContainer.id = 'zen-pomodoro-rulesets-container';

    // Render existing rulesets
    this._renderRulesets(rulesetsContainer, config);

    // Add New Ruleset button
    const addRulesetRow = document.createElement('div');
    addRulesetRow.className = 'zen-pomodoro-config-row';
    addRulesetRow.style.marginTop = '12px';

    const addRulesetButton = document.createElement('button');
    addRulesetButton.className = 'zen-pomodoro-dialog-button secondary';
    addRulesetButton.id = 'zen-pomodoro-add-ruleset';
    addRulesetButton.textContent = '+ Add Ruleset';
    addRulesetButton.addEventListener('click', () => {
      this._addNewRuleset(rulesetsContainer, config);
    });
    addRulesetRow.appendChild(addRulesetButton);

    // Export/Import buttons
    const exportImportRow = document.createElement('div');
    exportImportRow.className = 'zen-pomodoro-config-row';
    exportImportRow.style.gap = '8px';
    exportImportRow.style.marginTop = '8px';

    const exportRulesetsButton = document.createElement('button');
    exportRulesetsButton.className = 'zen-pomodoro-dialog-button secondary small';
    exportRulesetsButton.textContent = 'Export Rulesets';
    exportRulesetsButton.addEventListener('click', () => {
      this._exportRulesets(config);
    });

    const importRulesetsButton = document.createElement('button');
    importRulesetsButton.className = 'zen-pomodoro-dialog-button secondary small';
    importRulesetsButton.textContent = 'Import Rulesets';
    importRulesetsButton.addEventListener('click', () => {
      this._importRulesets(rulesetsContainer, config);
    });

    exportImportRow.appendChild(exportRulesetsButton);
    exportImportRow.appendChild(importRulesetsButton);

    configSection.appendChild(description);
    configSection.appendChild(rulesetsContainer);
    configSection.appendChild(addRulesetRow);
    configSection.appendChild(exportImportRow);

    // Buttons
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.id = 'zen-pomodoro-ruleset-cancel';
    cancelButton.textContent = 'Cancel';

    const saveButton = document.createElement('button');
    saveButton.className = 'zen-pomodoro-dialog-button secondary';
    saveButton.id = 'zen-pomodoro-ruleset-save';
    saveButton.textContent = 'Save';

    const saveCloseButton = document.createElement('button');
    saveCloseButton.className = 'zen-pomodoro-dialog-button';
    saveCloseButton.id = 'zen-pomodoro-ruleset-save-close';
    saveCloseButton.textContent = 'Save & Close';

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(saveButton);
    buttonDiv.appendChild(saveCloseButton);

    // Assemble dialog - create header row for back button and undo/redo
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '8px';
    backButton.style.marginBottom = '0';
    headerRow.appendChild(backButton);
    headerRow.appendChild(undoRedoButtons);

    dialog.appendChild(headerRow);
    dialog.appendChild(h2);
    dialog.appendChild(configSection);
    dialog.appendChild(buttonDiv);

    document.documentElement.appendChild(dialog);

    // Track changes for undo/redo
    configSection.addEventListener('change', () => {
      rulesetUndoRedo.pushState(JSON.parse(JSON.stringify(getConfig())));
    });

    // Set restore callback for undo/redo
    rulesetUndoRedo.onStateRestore = (state) => {
      saveConfig(state);
      saveDialogPosition(dialog);
      dialog.remove();
      this.showRulesetSettingsDialog(onClose);
    };

    // Apply saved position from parent dialog before setting up drag
    applyLastDialogPosition(dialog);

    // Make dialog draggable
    setupDialogDrag(dialog);

    cancelButton.addEventListener('click', () => {
      logger.log(LOG_CATEGORIES.MENU, 'Ruleset settings dialog cancelled');
      dialog.remove();
      if (onClose) {
        onClose();
      }
    });

    // Save button - saves settings but keeps dialog open
    saveButton.addEventListener('click', () => {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Saving ruleset settings');
      saveConfig(config);
      window.zenPomodoroApp?.showCustomAlert('Saved', 'Ruleset settings have been saved.');
    });

    // Save & Close button - saves settings and closes dialog
    saveCloseButton.addEventListener('click', () => {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Saving ruleset settings and closing');
      saveConfig(config);
      dialog.remove();

      if (onClose) {
        onClose();
      }
    });
  }

  /**
   * Render rulesets in container
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration object
   * @private
   */
  _renderRulesets(container, config) {
    const rulesets = config.rulesets || [];
    renderListOrEmptyMessage({
      container,
      items: rulesets,
      emptyClass: 'zen-pomodoro-empty-rulesets',
      emptyText: 'No rulesets configured. Add one to start blocking websites.',
      renderItem: (ruleset, index) => {
        const rulesetItem = this._createRulesetItem(ruleset, index, container, config);
        container.appendChild(rulesetItem);
      },
    });
  }

  /**
   * Update workspace blocked status in a ruleset.
   * @param {Object} config - Configuration object
   * @param {string} rulesetId - Ruleset ID
   * @param {string} workspaceId - Workspace ID
   * @param {boolean} isBlocked - Whether workspace should be blocked
   * @private
   */
  _updateRulesetWorkspace(config, rulesetId, workspaceId, isBlocked) {
    const rulesetIndex = config.rulesets.findIndex((r) => r.id === rulesetId);
    if (rulesetIndex === -1) return;

    const currentRuleset = config.rulesets[rulesetIndex];
    if (!currentRuleset.blockedWorkspaces) {
      currentRuleset.blockedWorkspaces = [];
    }

    if (isBlocked) {
      if (!currentRuleset.blockedWorkspaces.includes(workspaceId)) {
        currentRuleset.blockedWorkspaces.push(workspaceId);
      }
    } else {
      currentRuleset.blockedWorkspaces = currentRuleset.blockedWorkspaces.filter(
        (wsId) => wsId !== workspaceId
      );
    }
  }

  /**
   * Create a ruleset item element
   * @param {Object} ruleset - Ruleset data
   * @param {number} index - Ruleset index
   * @param {HTMLElement} container - Parent container
   * @param {Object} config - Configuration object
   * @returns {HTMLElement}
   * @private
   */
  _createRulesetItem(ruleset, index, container, config) {
    const item = document.createElement('div');
    item.className = 'zen-pomodoro-ruleset-item';
    item.dataset.rulesetId = ruleset.id;

    // Header row with name and controls
    const headerRow = document.createElement('div');
    headerRow.className = 'zen-pomodoro-ruleset-header';

    // Enable checkbox
    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = ruleset.enabled;
    enableCheckbox.addEventListener('change', () => {
      // Find by ID to avoid stale index issues
      const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
      if (rulesetIndex !== -1) {
        config.rulesets[rulesetIndex].enabled = enableCheckbox.checked;
      }
    });

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'zen-pomodoro-ruleset-name';
    nameInput.value = ruleset.name;
    nameInput.placeholder = 'Ruleset Name';
    nameInput.addEventListener('change', () => {
      const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
      if (rulesetIndex !== -1) {
        config.rulesets[rulesetIndex].name = nameInput.value || 'Unnamed Ruleset';
      }
    });

    // Expand/collapse toggle
    const expandBtn = document.createElement('button');
    expandBtn.className = 'zen-pomodoro-dialog-button secondary small';
    expandBtn.textContent = '▼';
    expandBtn.addEventListener('click', () => {
      const details = item.querySelector('.zen-pomodoro-ruleset-details');
      const isCollapsed = details.classList.contains('zen-pomodoro-collapsed');
      details.classList.toggle('zen-pomodoro-collapsed');
      expandBtn.textContent = isCollapsed ? '▲' : '▼';
    });

    // Delete button - use ID instead of index
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'zen-pomodoro-dialog-button secondary small';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', () => {
      const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
      if (config.rulesets.length > 1 && rulesetIndex !== -1) {
        config.rulesets.splice(rulesetIndex, 1);
        config.activeRulesets = config.activeRulesets.filter((id) => id !== ruleset.id);
        this._renderRulesets(container, config);
      } else if (config.rulesets.length <= 1) {
        window.zenPomodoroApp?.showCustomAlert(
          'Cannot Delete',
          'You must have at least one ruleset.'
        );
      }
    });

    headerRow.appendChild(enableCheckbox);
    headerRow.appendChild(nameInput);
    headerRow.appendChild(expandBtn);
    headerRow.appendChild(deleteBtn);

    // Details section (collapsible)
    const details = document.createElement('div');
    details.className = 'zen-pomodoro-ruleset-details zen-pomodoro-collapsed';

    // Rules container
    const rulesContainer = document.createElement('div');
    rulesContainer.className = 'zen-pomodoro-rules-container';
    rulesContainer.id = `rules-container-${ruleset.id}`;

    // Render existing rules
    this._renderRules(rulesContainer, ruleset, config);

    // Add Rule button
    const addRuleBtn = document.createElement('button');
    addRuleBtn.className = 'zen-pomodoro-dialog-button secondary';
    addRuleBtn.textContent = '+ Add Rule/Condition';
    addRuleBtn.style.marginTop = '12px';
    addRuleBtn.addEventListener('click', () => {
      this._addNewRule(rulesContainer, ruleset, config);
    });

    // Keyword title-only info row (checkbox is always checked due to browser security restrictions)
    const titleOnlyRow = document.createElement('div');
    titleOnlyRow.className = 'zen-pomodoro-checkbox-row';
    titleOnlyRow.style.marginTop = '12px';

    const titleOnlyCheckbox = document.createElement('input');
    titleOnlyCheckbox.type = 'checkbox';
    titleOnlyCheckbox.id = `title-only-${ruleset.id}`;
    // Always checked and disabled - keywords can only check tab titles due to browser security
    titleOnlyCheckbox.checked = true;
    titleOnlyCheckbox.disabled = true;
    titleOnlyCheckbox.title =
      'Keywords match tab titles only due to browser security restrictions.';

    const titleOnlyLabel = document.createElement('label');
    titleOnlyLabel.htmlFor = `title-only-${ruleset.id}`;
    titleOnlyLabel.textContent = 'Keywords match tab title only (browser security limitation)';
    titleOnlyLabel.title = 'Keywords match tab titles only due to browser security restrictions.';
    titleOnlyLabel.style.cursor = 'help';

    titleOnlyRow.appendChild(titleOnlyCheckbox);
    titleOnlyRow.appendChild(titleOnlyLabel);

    // Workspace selection UI for this ruleset
    const workspaceSection = document.createElement('div');
    workspaceSection.className = 'zen-pomodoro-ruleset-workspace-section';
    workspaceSection.style.marginTop = '16px';

    const workspaceTitle = document.createElement('div');
    workspaceTitle.textContent = 'Blocked Workspaces:';
    workspaceTitle.style.fontWeight = 'bold';
    workspaceTitle.style.marginBottom = '8px';

    const workspaceContainer = document.createElement('div');
    workspaceContainer.className = 'zen-pomodoro-workspace-list';
    workspaceContainer.id = `workspace-container-${ruleset.id}`;

    const workspaces = window.zenPomodoroApp
      ? window.zenPomodoroApp.workspace.getAllWorkspaces()
      : [];

    if (workspaces.length === 0) {
      const noWorkspacesMsg = document.createElement('div');
      noWorkspacesMsg.className = 'zen-pomodoro-no-workspaces-msg';
      noWorkspacesMsg.textContent = 'No workspaces found';
      workspaceContainer.appendChild(noWorkspacesMsg);
    } else {
      // Ensure ruleset has blockedWorkspaces array
      if (!ruleset.blockedWorkspaces) {
        ruleset.blockedWorkspaces = [];
      }

      workspaces.forEach((workspace) => {
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.className = 'zen-pomodoro-checkbox-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `workspace-${ruleset.id}-${workspace.id}`;
        checkbox.value = workspace.id;
        checkbox.checked = ruleset.blockedWorkspaces.includes(workspace.id);
        checkbox.addEventListener('change', () => {
          this._updateRulesetWorkspace(config, ruleset.id, workspace.id, checkbox.checked);
        });

        const label = document.createElement('label');
        label.setAttribute('for', `workspace-${ruleset.id}-${workspace.id}`);
        label.textContent = workspace.name;

        checkboxWrapper.appendChild(checkbox);
        checkboxWrapper.appendChild(label);
        workspaceContainer.appendChild(checkboxWrapper);
      });
    }

    workspaceSection.appendChild(workspaceTitle);
    workspaceSection.appendChild(workspaceContainer);

    // Assemble details
    details.appendChild(rulesContainer);
    details.appendChild(addRuleBtn);
    details.appendChild(titleOnlyRow);
    details.appendChild(workspaceSection);

    item.appendChild(headerRow);
    item.appendChild(details);

    return item;
  }

  /**
   * Render individual rules in a container
   * Uses shared utility to reduce code duplication.
   * @param {HTMLElement} container - Rules container
   * @param {Object} ruleset - Parent ruleset
   * @param {Object} config - Configuration object
   * @private
   */
  _renderRules(container, ruleset, config) {
    const rules = ruleset.rules || [];
    renderListOrEmptyMessage({
      container,
      items: rules,
      emptyClass: 'zen-pomodoro-empty-rules',
      emptyText: 'No rules configured. Click "Add Rule/Condition" to add one.',
      renderItem: (rule) => {
        const ruleEl = this._createRuleElement(rule, ruleset, config, container);
        container.appendChild(ruleEl);
      },
    });
  }

  /**
   * Create a single rule element
   * @param {Object} rule - Rule data { id, pattern, type, condition }
   * @param {Object} ruleset - Parent ruleset
   * @param {Object} config - Configuration object
   * @param {HTMLElement} container - Rules container
   * @returns {HTMLElement}
   * @private
   */
  _createRuleElement(rule, ruleset, config, container) {
    const ruleEl = document.createElement('div');
    ruleEl.className = 'zen-pomodoro-rule-item';
    ruleEl.dataset.ruleId = rule.id;

    // Pattern input
    const patternInput = document.createElement('input');
    patternInput.type = 'text';
    patternInput.className = 'zen-pomodoro-rule-pattern';
    patternInput.value = rule.pattern || '';
    patternInput.placeholder =
      rule.type === 'keyword' ? 'Enter keyword...' : 'site.com or *.site.com';
    patternInput.addEventListener('change', () => {
      findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj) => {
        ruleObj.pattern = patternInput.value.trim();
      });
    });

    // Type dropdown (Website/Keyword)
    const typeSelect = document.createElement('select');
    typeSelect.className = 'zen-pomodoro-rule-select';

    const websiteOption = document.createElement('option');
    websiteOption.value = 'website';
    websiteOption.textContent = 'Website';
    if (rule.type === 'website') websiteOption.selected = true;
    typeSelect.appendChild(websiteOption);

    const keywordOption = document.createElement('option');
    keywordOption.value = 'keyword';
    keywordOption.textContent = 'Keyword';
    if (rule.type === 'keyword') keywordOption.selected = true;
    typeSelect.appendChild(keywordOption);

    typeSelect.addEventListener('change', () => {
      findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj) => {
        ruleObj.type = typeSelect.value;
        // Update placeholder
        patternInput.placeholder =
          typeSelect.value === 'keyword' ? 'Enter keyword...' : 'site.com or *.site.com';
      });
    });

    // Condition dropdown (Block/Allow)
    const conditionSelect = document.createElement('select');
    conditionSelect.className = 'zen-pomodoro-rule-select';

    const blockOption = document.createElement('option');
    blockOption.value = 'block';
    blockOption.textContent = 'Block';
    if (rule.condition === 'block') blockOption.selected = true;
    conditionSelect.appendChild(blockOption);

    const allowOption = document.createElement('option');
    allowOption.value = 'allow';
    allowOption.textContent = 'Allow';
    if (rule.condition === 'allow') allowOption.selected = true;
    conditionSelect.appendChild(allowOption);

    conditionSelect.addEventListener('change', () => {
      findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj) => {
        ruleObj.condition = conditionSelect.value;
      });
    });

    // Delete rule button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'zen-pomodoro-dialog-button secondary small';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete rule';
    deleteBtn.addEventListener('click', () => {
      findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj, ruleIndex, rulesArray) => {
        rulesArray.splice(ruleIndex, 1);
        this._renderRules(container, ruleset, config);
      });
    });

    ruleEl.appendChild(patternInput);
    ruleEl.appendChild(typeSelect);
    ruleEl.appendChild(conditionSelect);
    ruleEl.appendChild(deleteBtn);

    return ruleEl;
  }

  /**
   * Add a new rule to a ruleset
   * @param {HTMLElement} container - Rules container
   * @param {Object} ruleset - Parent ruleset
   * @param {Object} config - Configuration object
   * @private
   */
  _addNewRule(container, ruleset, config) {
    const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
    if (rulesetIndex === -1) return;

    if (!config.rulesets[rulesetIndex].rules) {
      config.rulesets[rulesetIndex].rules = [];
    }

    const newRule = {
      id: this._generateRuleId(),
      pattern: '',
      type: 'website',
      condition: 'block',
    };

    config.rulesets[rulesetIndex].rules.push(newRule);
    this._renderRules(container, config.rulesets[rulesetIndex], config);
  }

  /**
   * Generate a unique rule ID using crypto.randomUUID with fallback
   * @returns {string} Unique rule ID
   * @private
   */
  _generateRuleId() {
    if (typeof crypto?.randomUUID === 'function') {
      return 'rule-' + crypto.randomUUID();
    }
    // Fallback: timestamp + random string for uniqueness
    return 'rule-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Generate a unique ruleset ID using crypto.randomUUID with fallback
   * @returns {string} Unique ruleset ID
   * @private
   */
  _generateRulesetId() {
    if (typeof crypto?.randomUUID === 'function') {
      return 'ruleset-' + crypto.randomUUID();
    }
    // Fallback: timestamp + random string for uniqueness
    return 'ruleset-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Add a new ruleset
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration object
   * @private
   */
  _addNewRuleset(container, config) {
    const newId = this._generateRulesetId();

    const newRuleset = {
      id: newId,
      name: 'New Ruleset',
      enabled: true,
      rules: [],
      // Keywords only check tab titles due to browser security restrictions (cross-origin)
      checkTitleOnly: true,
    };

    if (!config.rulesets) config.rulesets = [];
    config.rulesets.push(newRuleset);

    this._renderRulesets(container, config);
    logger.log(LOG_CATEGORIES.SETTINGS, 'New ruleset added', { id: newId });
  }

  /**
   * Export rulesets to JSON file
   * @param {Object} config - Configuration object
   * @private
   */
  _exportRulesets(config) {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      rulesets: config.rulesets || [],
    };

    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zen-pomodoro-rulesets-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);

    logger.log(LOG_CATEGORIES.SETTINGS, 'Rulesets exported', { count: config.rulesets.length });
    window.zenPomodoroApp?.showCustomAlert(
      'Export Complete',
      `Exported ${config.rulesets.length} rulesets.`
    );
  }

  /**
   * Validate and normalize a single imported ruleset.
   * @param {Object} ruleset - Raw imported ruleset
   * @returns {Object} Normalized ruleset
   * @private
   */
  _normalizeImportedRuleset(ruleset) {
    ruleset.id = 'imported-' + this._generateRulesetId().replace('ruleset-', '');
    ruleset.name = ruleset.name || 'Imported Ruleset';
    ruleset.enabled = ruleset.enabled !== false;
    ruleset.checkTitleOnly = !!ruleset.checkTitleOnly;

    // Convert old format to new format if needed
    if (this._hasOldFormatProperties(ruleset)) {
      ruleset.rules = this._convertOldFormatToRules(ruleset);
      delete ruleset.sites;
      delete ruleset.blockKeywords;
      delete ruleset.allowKeywords;
    }

    // Ensure rules array exists
    if (!Array.isArray(ruleset.rules)) {
      ruleset.rules = [];
    }

    // Validate and normalize each rule
    ruleset.rules = ruleset.rules.filter((rule) => this._normalizeImportedRule(rule));

    return ruleset;
  }

  /**
   * Check if ruleset has old format properties.
   * @param {Object} ruleset - Ruleset to check
   * @returns {boolean} True if has old format
   * @private
   */
  _hasOldFormatProperties(ruleset) {
    return (
      Array.isArray(ruleset.sites) ||
      Array.isArray(ruleset.blockKeywords) ||
      Array.isArray(ruleset.allowKeywords)
    );
  }

  /**
   * Normalize and validate an imported rule.
   * @param {Object} rule - Raw imported rule
   * @returns {boolean} True if rule is valid
   * @private
   */
  _normalizeImportedRule(rule) {
    if (!rule || typeof rule !== 'object') return false;

    rule.id = rule.id || this._generateRuleId();
    rule.pattern = typeof rule.pattern === 'string' ? rule.pattern : '';
    rule.type = ['website', 'keyword'].includes(rule.type) ? rule.type : 'website';
    rule.condition = ['block', 'allow'].includes(rule.condition) ? rule.condition : 'block';

    return true;
  }

  /**
   * Process imported rulesets JSON data.
   * @param {string} jsonText - Raw JSON text
   * @param {Object} config - Current config
   * @param {HTMLElement} container - Container for re-rendering
   * @throws {Error} If invalid format
   * @private
   */
  _processImportedRulesets(jsonText, config, container) {
    const importData = JSON.parse(jsonText);

    if (!importData.rulesets || !Array.isArray(importData.rulesets)) {
      throw new Error('Invalid rulesets format');
    }

    const importedCount = importData.rulesets.length;
    importData.rulesets.forEach((ruleset) => this._normalizeImportedRuleset(ruleset));

    config.rulesets = [...(config.rulesets || []), ...importData.rulesets];
    this._renderRulesets(container, config);

    logger.log(LOG_CATEGORIES.SETTINGS, 'Rulesets imported', { count: importedCount });
    return importedCount;
  }

  /**
   * Import rulesets from JSON file.
   * Refactored to reduce cyclomatic complexity.
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration object
   * @private
   */
  _importRulesets(container, config) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();

      // Add error handler for FileReader
      reader.onerror = () => {
        logger.log(LOG_CATEGORIES.SETTINGS, 'FileReader error during import', {
          error: reader.error?.message,
        });
        window.zenPomodoroApp?.showCustomAlert(
          'Import Failed',
          'Could not read the file. Please try again.'
        );
      };

      reader.onload = (event) => {
        try {
          const importedCount = this._processImportedRulesets(
            event.target.result,
            config,
            container
          );
          window.zenPomodoroApp?.showCustomAlert(
            'Import Complete',
            `Imported ${importedCount} rulesets.`
          );
        } catch (err) {
          logger.log(LOG_CATEGORIES.SETTINGS, 'Ruleset import failed', { error: err.message });
          window.zenPomodoroApp?.showCustomAlert(
            'Import Failed',
            'Could not parse the rulesets file. Please ensure it is a valid JSON file.'
          );
        }
      };

      reader.readAsText(file);
    });

    input.click();
  }

  /**
   * Convert old ruleset format (sites/blockKeywords/allowKeywords arrays) to new rules format
   * @param {Object} ruleset - Ruleset with old format
   * @returns {Array} Array of rule objects
   * @private
   */
  _convertOldFormatToRules(ruleset) {
    const rules = [];

    // Convert sites array
    if (Array.isArray(ruleset.sites)) {
      ruleset.sites.forEach((site) => {
        const rule = this._convertSiteToRule(site);
        if (rule) rules.push(rule);
      });
    }

    // Convert blockKeywords array
    this._convertKeywordsToRules(ruleset.blockKeywords, 'block', rules);

    // Convert allowKeywords array
    this._convertKeywordsToRules(ruleset.allowKeywords, 'allow', rules);

    return rules;
  }

  /**
   * Convert a site pattern to a rule object
   * @param {string} site - Site pattern (may include + prefix for allow)
   * @returns {Object|null} Rule object or null if invalid
   * @private
   */
  _convertSiteToRule(site) {
    if (!site || typeof site !== 'string') return null;
    const trimmed = site.trim();
    if (!trimmed) return null;

    // Check for + prefix (allow exception)
    const isAllow = trimmed.startsWith('+');
    return {
      id: this._generateRuleId(),
      pattern: isAllow ? trimmed.substring(1) : trimmed,
      type: 'website',
      condition: isAllow ? 'allow' : 'block',
    };
  }

  /**
   * Convert keywords array to rules and add to rules array
   * @param {Array} keywords - Array of keywords
   * @param {string} condition - 'block' or 'allow'
   * @param {Array} rules - Array to add rules to
   * @private
   */
  _convertKeywordsToRules(keywords, condition, rules) {
    if (!Array.isArray(keywords)) return;

    keywords.forEach((keyword) => {
      if (!keyword || typeof keyword !== 'string') return;
      const trimmed = keyword.trim();
      if (!trimmed) return;

      rules.push({
        id: this._generateRuleId(),
        pattern: trimmed,
        type: 'keyword',
        condition: condition,
      });
    });
  }
}

export default KeyboardShortcutHandler;
