import Constants from './constants.js';
import { logger } from './log-manager.js';
import { 
  getConfig, saveConfig,
  formatTime, validateIntegerInput,
  MOD_VERSION, LOG_CATEGORIES
} from './helpers.js';
import {
  setupDialogDrag, applyLastDialogPosition, saveDialogPosition,
  createLabeledInputRow, createLabeledSelectRow,
  updateCountdownElement, getMenuPhaseLabel,
  handleStopTimerWithLockout, handleSkipFocusWithLockout,
  isDistractionDumpBlocking, handlePauseResumeTimer
} from './ui-helpers.js';
import UndoRedoManager from './undo-redo-manager.js';
import { createSettingsDialog as _createSettingsDialog } from './settings-dialog.js';
import { showRulesetSettingsDialog as _showRulesetSettingsDialog } from './ruleset-dialog.js';

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
   * Helper: Close menu dialog and clean up resources
   */
  _closeMenuDialog(dialog) {
    this._stopMenuTimerUpdates();
    this._stopReminderCountdownUpdates();
    dialog.remove();
    this.menuDialog = null;
  }

  /**
   * Helper: Create the dialog shell and basic structure
   */
  _createMenuDialogShell() {
    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-menu-dialog';
    dialog.className = 'zen-pomodoro-dialog active';
    this.menuDialog = dialog;

    const h2 = document.createElement('h2');
    h2.textContent = '⏱️ Pomodoro Timer';

    const menuSection = document.createElement('div');
    menuSection.className = 'zen-pomodoro-config-section';

    return { dialog, h2, menuSection };
  }

  /**
   * Helper: Create distraction dump button based on current state
   */
  _createDumpButton(status) {
    const config = getConfig();
    const dumpManager = window.zenPomodoroApp?.distractionDump;
    
    if (!config.distractionDumpEnabled || status.currentPhase !== 'focus') {
      return null;
    }
    
    const isDumpActive = dumpManager?.isActive;
    const isDumpAvailable = dumpManager?.isDumpAvailable();
    
    const dumpBtn = document.createElement('button');
    dumpBtn.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-dump-button';
    
    if (isDumpActive) {
      dumpBtn.textContent = '🧠 End Dump Early';
      return { btn: dumpBtn, action: 'endDump' };
    } else if (isDumpAvailable) {
      dumpBtn.textContent = '🧠 Distraction Dump';
      return { btn: dumpBtn, action: 'startDump' };
    } else {
      dumpBtn.textContent = '🧠 Dump Used';
      dumpBtn.disabled = true;
      dumpBtn.title = 'Distraction Dump can only be used once per focus phase';
      dumpBtn.style.opacity = '0.5';
      dumpBtn.style.cursor = 'not-allowed';
      return { btn: dumpBtn, action: 'disabled' };
    }
  }

  /**
   * Helper: Create menu for active timer state
   */
  _createTimerActiveMenu(dialog, menuSection) {
    const status = window.zenPomodoroApp.timer.getStatus();

    const statusRow = this._createStatusRow(status);
    const pauseResumeBtn = this._createPauseResumeButton(dialog, status);
    const phaseButtons = this._createPhaseButtons(dialog, status);
    const stopBtn = this._createStopButton(dialog);
    const toggleIndicatorBtn = this._createToggleIndicatorButton();
    const navButtons = this._createActiveMenuNavButtons(dialog);

    // Append all elements in order
    menuSection.appendChild(statusRow);
    menuSection.appendChild(pauseResumeBtn);
    this._appendDumpButton(dialog, status, menuSection);
    phaseButtons.forEach(btn => menuSection.appendChild(btn));
    menuSection.appendChild(stopBtn);
    menuSection.appendChild(toggleIndicatorBtn);
    navButtons.forEach(btn => menuSection.appendChild(btn));
  }

  /**
   * Create the status row showing current phase and time.
   * @param {Object} status - Timer status object
   * @returns {HTMLElement} Status row element
   * @private
   */
  _createStatusRow(status) {
    const timeStr = formatTime(status.remainingTime);
    const phaseStr = getMenuPhaseLabel(status.currentPhase);

    const statusRow = document.createElement('div');
    statusRow.className = 'zen-pomodoro-config-row';
    statusRow.style.justifyContent = 'center';
    statusRow.style.marginBottom = '16px';
    const statusText = document.createElement('div');
    statusText.style.fontSize = '18px';
    statusText.style.fontWeight = '600';

    if (status.mode === 'simple') {
      statusText.textContent = `${phaseStr}: ${timeStr}`;
    } else {
      statusText.textContent = `${phaseStr}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
    }
    statusRow.appendChild(statusText);
    this._startMenuTimerUpdates(statusText);
    return statusRow;
  }

  /**
   * Create the pause/resume button.
   * @param {HTMLElement} dialog - Menu dialog
   * @param {Object} status - Timer status
   * @returns {HTMLElement} Pause/Resume button
   * @private
   */
  _createPauseResumeButton(dialog, status) {
    const btn = document.createElement('button');
    btn.className = 'zen-pomodoro-dialog-button';
    btn.textContent = status.isPaused ? 'Resume Timer' : 'Pause Timer';
    btn.addEventListener('click', () => {
      if (isDistractionDumpBlocking()) {
        window.zenPomodoroApp.showCustomAlert(
          Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
          Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
        );
        return;
      }
      this._closeMenuDialog(dialog);
      handlePauseResumeTimer();
    });
    return btn;
  }

  /**
   * Create phase-specific buttons (Cut Break Early or Skip Focus).
   * @param {HTMLElement} dialog - Menu dialog
   * @param {Object} status - Timer status
   * @returns {Array<HTMLElement>} Array of phase buttons (may be empty)
   * @private
   */
  _createPhaseButtons(dialog, status) {
    const buttons = [];
    const isBreakOrTransition =
      status.currentPhase === 'break' ||
      status.currentPhase === 'long-break' ||
      status.currentPhase === 'transition';

    if (isBreakOrTransition) {
      const cutBreakBtn = document.createElement('button');
      cutBreakBtn.className = 'zen-pomodoro-dialog-button secondary';
      cutBreakBtn.textContent = 'Cut Break Early';
      cutBreakBtn.addEventListener('click', () => {
        this._closeMenuDialog(dialog);
        this._handleCutBreakEarly(status.currentPhase);
      });
      buttons.push(cutBreakBtn);
    }

    if (status.currentPhase === 'focus') {
      const skipFocusBtn = document.createElement('button');
      skipFocusBtn.className = 'zen-pomodoro-dialog-button secondary';
      skipFocusBtn.textContent = 'Skip Focus';
      skipFocusBtn.addEventListener('click', () => {
        if (isDistractionDumpBlocking()) {
          window.zenPomodoroApp.showCustomAlert(
            Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
            Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
          );
          return;
        }
        this._closeMenuDialog(dialog);
        handleSkipFocusWithLockout(() => {
          window.zenPomodoroApp?._claimOwnershipForAction();
          const timer = window.zenPomodoroApp.timer;
          if (timer.skipFocusToBreak()) {
            window.zenPomodoroApp.updateOverlayVisibility();
          }
        });
      });
      buttons.push(skipFocusBtn);
    }

    return buttons;
  }

  /**
   * Create the stop timer button.
   * @param {HTMLElement} dialog - Menu dialog
   * @returns {HTMLElement} Stop button
   * @private
   */
  _createStopButton(dialog) {
    const stopBtn = document.createElement('button');
    stopBtn.className = 'zen-pomodoro-dialog-button secondary';
    stopBtn.textContent = 'Stop Timer';
    stopBtn.addEventListener('click', () => {
      this._closeMenuDialog(dialog);
      handleStopTimerWithLockout(() => {
        window.zenPomodoroApp.stopTimer();
      });
    });
    return stopBtn;
  }

  /**
   * Create the toggle timer indicator button.
   * @returns {HTMLElement} Toggle indicator button
   * @private
   */
  _createToggleIndicatorButton() {
    const btn = document.createElement('button');
    btn.className = 'zen-pomodoro-dialog-button secondary';
    btn.textContent =
      window.zenPomodoroApp?.overlay?.indicator?.classList.contains('active')
        ? 'Hide Timer Indicator'
        : 'Show Timer Indicator';
    btn.addEventListener('click', () => {
      if (window.zenPomodoroApp?.overlay) {
        const indicator = window.zenPomodoroApp.overlay.indicator;
        if (indicator?.classList.contains('active')) {
          window.zenPomodoroApp.overlay.hideIndicator();
          btn.textContent = 'Show Timer Indicator';
        } else {
          window.zenPomodoroApp.overlay.showIndicator();
          btn.textContent = 'Hide Timer Indicator';
        }
      }
    });
    return btn;
  }

  /**
   * Create navigation buttons (Settings, Rulesets, Export Logs) for the active timer menu.
   * @param {HTMLElement} dialog - Menu dialog
   * @returns {Array<HTMLElement>} Array of navigation buttons
   * @private
   */
  _createActiveMenuNavButtons(dialog) {
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

    const exportLogsBtn = document.createElement('button');
    exportLogsBtn.className = 'zen-pomodoro-dialog-button secondary';
    exportLogsBtn.textContent = 'Export Logs';
    exportLogsBtn.addEventListener('click', () => {
      if (window.zenPomodoroApp?.logger) {
        window.zenPomodoroApp.logger.exportLogs();
        window.zenPomodoroApp.showCustomAlert(
          'Export Complete',
          'Logs have been exported successfully.'
        );
      }
    });

    return [settingsBtn, rulesetBtn, exportLogsBtn];
  }

  /**
   * Create and append the distraction dump button if applicable.
   * @param {HTMLElement} dialog - Menu dialog
   * @param {Object} status - Timer status
   * @param {HTMLElement} menuSection - Menu section to append to
   * @private
   */
  _appendDumpButton(dialog, status, menuSection) {
    const dumpButtonInfo = this._createDumpButton(status);
    if (!dumpButtonInfo) return;

    const { btn: dumpBtn, action } = dumpButtonInfo;
    if (action === 'endDump') {
      dumpBtn.addEventListener('click', () => {
        this._closeMenuDialog(dialog);
        window.zenPomodoroApp.distractionDump.showEndDumpConfirmation();
      });
    } else if (action === 'startDump') {
      dumpBtn.addEventListener('click', () => {
        this._closeMenuDialog(dialog);
        window.zenPomodoroApp.distractionDump.startDump();
      });
    }
    menuSection.appendChild(dumpBtn);
  }

  /**
   * Helper: Create menu for inactive timer state
   */
  _createTimerInactiveMenu(dialog, menuSection) {
    // Start Pomodoro Timer button
    const startBtn = document.createElement('button');
    startBtn.className = 'zen-pomodoro-dialog-button';
    startBtn.textContent = 'Start Pomodoro Timer';
    startBtn.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.menuDialog = null;
      this.showConfigDialog();
    });

    // Timer Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'zen-pomodoro-dialog-button secondary';
    settingsBtn.textContent = 'Timer Settings';
    settingsBtn.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.menuDialog = null;
      this.showSettingsDialog();
    });

    // Ruleset Settings button
    const rulesetBtn = document.createElement('button');
    rulesetBtn.className = 'zen-pomodoro-dialog-button secondary';
    rulesetBtn.textContent = 'Ruleset Settings';
    rulesetBtn.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.menuDialog = null;
      this.showRulesetSettingsDialog();
    });

    // Custom Cycles button
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

    // Export Logs button
    const exportLogsBtn = document.createElement('button');
    exportLogsBtn.className = 'zen-pomodoro-dialog-button secondary';
    exportLogsBtn.textContent = 'Export Logs';
    exportLogsBtn.addEventListener('click', () => {
      if (window.zenPomodoroApp?.logger) {
        window.zenPomodoroApp.logger.exportLogs();
        window.zenPomodoroApp.showCustomAlert(
          'Export Complete',
          'Logs have been exported successfully.'
        );
      }
    });

    menuSection.appendChild(startBtn);
    menuSection.appendChild(settingsBtn);
    menuSection.appendChild(rulesetBtn);
    menuSection.appendChild(customCyclesBtn);
    menuSection.appendChild(exportLogsBtn);
  }

  /**
   * Helper: Create menu footer with close button, version, and countdown indicators
   */
  _createMenuFooter(dialog) {
    // Buttons section
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Close';
    cancelButton.addEventListener('click', () => {
      this._closeMenuDialog(dialog);
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

    return { buttonDiv, postSessionCountdown, firstTimeCountdown, versionIndicator };
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

    const { dialog, h2, menuSection } = this._createMenuDialogShell();

    const timerActive =
      window.zenPomodoroApp &&
      window.zenPomodoroApp.timer &&
      window.zenPomodoroApp.timer.isActive;

    if (timerActive) {
      this._createTimerActiveMenu(dialog, menuSection);
    } else {
      this._createTimerInactiveMenu(dialog, menuSection);
    }

    const { buttonDiv, postSessionCountdown, firstTimeCountdown, versionIndicator } = this._createMenuFooter(dialog);

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
        this._closeMenuDialog(dialog);
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
    _createSettingsDialog(this);
  }


  /**
   * Show the Ruleset Settings dialog
   * @param {Function} [onClose] - Optional callback when dialog closes (for returning to settings)
   */
  showRulesetSettingsDialog(onClose = null) {
    _showRulesetSettingsDialog(this, onClose);
  }
}

export default KeyboardShortcutHandler;
