import Constants from './constants.js';
import { logger } from './log-manager.js';
import {
  getConfig, saveConfig, setPref,
  sanitizeText, validateIntegerInput,
  isValidRangeValue, getValidatedIntFromDialog,
  MOD_VERSION, MODIFIER_KEYS, LOCKOUT_METHODS, LOG_CATEGORIES
} from './helpers.js';
import {
  setupDialogDrag, applyLastDialogPosition, saveDialogPosition,
  isValidTimeFormat,
  createLabeledInputRow, createLabeledSelectRow
} from './ui-helpers.js';
import UndoRedoManager from './undo-redo-manager.js';

/**
 * Save keyboard shortcut from settings dialog.
 * @param {HTMLElement} shortcutInput - The shortcut input element
 * @param {Object} config - Configuration object to update
 */
export function saveKeyboardShortcut(shortcutInput, config) {
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
 */
export function saveToggleIndicatorShortcut(shortcutInput, config) {
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
 */
export function saveTimerSettings(dialog, config, timerModeSelect) {
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
 */
export function saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect) {
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
 */
export function saveBlockedWorkspaces(workspaceContainer, config) {
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
 */
export function saveReminderSettings(dialog, config) {
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
    saveDailyReminderSettings(dialog, config);
  } else if (selectedMode === Constants.REMINDER_MODES.POST_SESSION) {
    savePostSessionReminderSettings(dialog, config);
  }
}

/**
 * Save daily reminder settings from dialog.
 * @param {HTMLElement} dialog - The dialog element
 * @param {Object} config - Configuration object to update
 */
export function saveDailyReminderSettings(dialog, config) {
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
  const validTimes = parseValidTimesFromInput(dialog);
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
 */
export function parseValidTimesFromInput(dialog) {
  const timesInput = dialog.querySelector('#daily-reminder-times');
  if (!timesInput?.value) return [];
  
  const times = timesInput.value.split(',').map((t) => t.trim());
  return times.filter((t) => isValidTimeFormat(t));
}

/**
 * Save post-session reminder settings from dialog.
 * @param {HTMLElement} dialog - The dialog element
 * @param {Object} config - Configuration object to update
 */
export function savePostSessionReminderSettings(dialog, config) {
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
 */
export function saveTimerRemindersSettings(dialog, config) {
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
 */
export function updateOverlayMessage(config) {
  if (!window.zenPomodoroApp?.overlay?.overlay) return;

  const messageEl =
    window.zenPomodoroApp.overlay.overlay.querySelector('#zen-pomodoro-message');
  if (messageEl) {
    messageEl.textContent = sanitizeText(config.motivationalMessage);
  }
}


/**
 * Create and display the settings dialog.
 * @param {Object} handler - The KeyboardShortcutHandler instance
 */
export function createSettingsDialog(handler) {
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
      handler.showPomodoroMenu();
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
      handler.showRulesetSettingsDialog(() => {
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
      saveKeyboardShortcut(shortcutInput, config);
      saveToggleIndicatorShortcut(toggleIndicatorInput, config);
      saveTimerSettings(dialog, config, timerModeSelect);
      saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect);
      saveReminderSettings(dialog, config);
      saveTimerRemindersSettings(dialog, config);

      saveConfig(config);
      updateOverlayMessage(config);
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
      handler.createSettingsDialog();
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
