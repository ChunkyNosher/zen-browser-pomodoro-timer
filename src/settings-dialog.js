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
 * Save a shortcut value from a shortcut recorder element.
 * @param {HTMLElement} shortcutInput - The shortcut recorder element
 * @param {Object} config - Configuration object to update
 * @param {Object} options - Options for the shortcut save
 * @param {string} options.configKey - Config property name and pref key
 * @param {Function} options.setupFn - Function to call on the handler
 */
function saveShortcutValue(shortcutInput, config, { configKey, setupFn }) {
  const newShortcut = shortcutInput.getAttribute('data-shortcut');
  if (!newShortcut || newShortcut === config[configKey]) return;

  const shortcutParts = newShortcut.split('+');
  const hasNonModifierKey = shortcutParts.some(
    (part) => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(part)
  );

  if (!hasNonModifierKey) return;

  config[configKey] = newShortcut;
  if (window.zenPomodoroApp?.keyboardShortcut) {
    setupFn(window.zenPomodoroApp.keyboardShortcut, newShortcut);
  }
  setPref(configKey, newShortcut);
}

/**
 * Save keyboard shortcut from settings dialog.
 * @param {HTMLElement} shortcutInput - The shortcut input element
 * @param {Object} config - Configuration object to update
 */
export function saveKeyboardShortcut(shortcutInput, config) {
  saveShortcutValue(shortcutInput, config, {
    configKey: 'keyboardShortcut',
    setupFn: (handler, shortcut) => handler.setupKeyboardShortcut(shortcut),
  });
}

/**
 * Save toggle indicator shortcut from settings dialog.
 * @param {HTMLElement} shortcutInput - The shortcut input element
 * @param {Object} config - Configuration object to update
 */
export function saveToggleIndicatorShortcut(shortcutInput, config) {
  saveShortcutValue(shortcutInput, config, {
    configKey: 'toggleIndicatorShortcut',
    setupFn: (handler, shortcut) => handler.setupToggleIndicatorShortcut(shortcut),
  });
}

/**
 * Create a shortcut recorder element with click, keydown, and blur handlers.
 * @param {string} id - Element ID
 * @param {string} currentShortcut - Current shortcut value to display
 * @returns {HTMLElement} Shortcut recorder div element
 */
function setupShortcutRecorder(id, currentShortcut) {
  const input = document.createElement('div');
  input.className = 'zen-pomodoro-shortcut-recorder';
  input.id = id;
  input.tabIndex = 0;
  input.textContent = currentShortcut;
  input.setAttribute('data-shortcut', currentShortcut);

  let recording = false;

  input.addEventListener('click', () => {
    if (!recording) {
      recording = true;
      input.textContent = 'Press keys...';
      input.classList.add('recording');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');

    const key = e.key;
    if (!MODIFIER_KEYS.includes(key)) {
      const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
      parts.push(normalizedKey);
      const shortcutStr = parts.join('+');
      input.textContent = shortcutStr;
      input.setAttribute('data-shortcut', shortcutStr);
      input.classList.remove('recording');
      recording = false;
    }
  });

  input.addEventListener('blur', () => {
    if (recording) {
      input.textContent = input.getAttribute('data-shortcut');
      input.classList.remove('recording');
      recording = false;
    }
  });

  return input;
}

/**
 * Create a reminder subsection with a list and add button.
 * Shared logic for both focus and break phase reminder UI.
 * @param {Object} config - Configuration object
 * @param {string} configKey - Config property name (e.g. 'focusPhaseReminders')
 * @param {string} title - Subsection title text
 * @param {string} helpText - Help text describing the reminders
 * @param {string} listId - DOM ID for the reminder list
 * @param {string} inputId - DOM ID for the add input
 * @param {number} minVal - Minimum valid value
 * @param {number} maxVal - Maximum valid value
 * @returns {HTMLElement} The subsection element
 */
function createReminderSubsection(config, configKey, title, helpText, listId, inputId, minVal, maxVal) {
  const subsection = document.createElement('div');
  subsection.className = 'zen-pomodoro-subsection';
  subsection.style.marginTop = '16px';
  subsection.style.paddingLeft = '24px';
  subsection.style.borderLeft = '3px solid #007acc';

  const subtitle = document.createElement('div');
  subtitle.style.fontSize = '14px';
  subtitle.style.fontWeight = 'bold';
  subtitle.style.marginBottom = '12px';
  subtitle.textContent = title;

  const help = document.createElement('p');
  help.className = 'zen-pomodoro-help-text';
  help.textContent = helpText;

  const list = document.createElement('div');
  list.id = listId;
  list.style.marginBottom = '12px';

  if (!Array.isArray(config[configKey])) {
    config[configKey] = [];
  }

  const renderReminders = () => {
    list.innerHTML = '';
    const reminders = config[configKey] || [];
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
        config[configKey] = config[configKey].filter((m) => m !== minutes);
        renderReminders();
      });

      itemRow.appendChild(itemText);
      itemRow.appendChild(deleteBtn);
      list.appendChild(itemRow);
    });
  };

  renderReminders();

  const addRow = document.createElement('div');
  addRow.className = 'zen-pomodoro-config-row';
  const addInput = document.createElement('input');
  addInput.type = 'number';
  addInput.id = inputId;
  addInput.placeholder = 'Minutes';
  addInput.min = minVal;
  addInput.max = maxVal;
  addInput.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.className = 'zen-pomodoro-dialog-button secondary';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const value = parseInt(addInput.value, 10);
    if (isValidRangeValue(value, minVal, maxVal)) {
      if (!config[configKey].includes(value)) {
        config[configKey].push(value);
        config[configKey].sort((a, b) => b - a);
        renderReminders();
        addInput.value = '';
      }
    }
  });

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);

  subsection.appendChild(subtitle);
  subsection.appendChild(help);
  subsection.appendChild(list);
  subsection.appendChild(addRow);

  return subsection;
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
 * Create header section with back button and title.
 * @param {Object} handler - The KeyboardShortcutHandler instance
 * @param {HTMLElement} dialog - The dialog element
 * @returns {Object} Object containing backButton and title elements
 */
function createHeaderSection(handler, dialog) {
  const backButton = document.createElement('button');
  backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
  backButton.textContent = '← Back';
  backButton.addEventListener('click', () => {
    saveDialogPosition(dialog);
    dialog.remove();
    handler.showPomodoroMenu();
  });

  const title = document.createElement('h2');
  title.textContent = 'Pomodoro Timer Settings';

  return { backButton, title };
}

/**
 * Create keyboard shortcut recorder rows.
 * @param {Object} config - Configuration object
 * @returns {Object} Object containing shortcutRow and toggleIndicatorRow
 */
function createShortcutRows(config) {
  // Keyboard Shortcut Recorder
  const shortcutRow = document.createElement('div');
  shortcutRow.className = 'zen-pomodoro-config-row';
  const shortcutLabel = document.createElement('label');
  shortcutLabel.textContent = 'Keyboard Shortcut:';
  const shortcutInput = setupShortcutRecorder('keyboard-shortcut', config.keyboardShortcut);
  shortcutRow.appendChild(shortcutLabel);
  shortcutRow.appendChild(shortcutInput);

  // Toggle Indicator Shortcut Recorder
  const toggleIndicatorRow = document.createElement('div');
  toggleIndicatorRow.className = 'zen-pomodoro-config-row';
  const toggleIndicatorLabel = document.createElement('label');
  toggleIndicatorLabel.textContent = 'Hide/Show Indicator Shortcut:';
  const toggleIndicatorInput = setupShortcutRecorder('toggle-indicator-shortcut', config.toggleIndicatorShortcut);
  toggleIndicatorRow.appendChild(toggleIndicatorLabel);
  toggleIndicatorRow.appendChild(toggleIndicatorInput);

  return { shortcutRow, shortcutInput, toggleIndicatorRow, toggleIndicatorInput };
}

/**
 * Create timer mode section with duration settings.
 * @param {Object} config - Configuration object
 * @returns {Object} Object containing timer mode elements
 */
function createTimerModeSection(config) {
  // Timer Mode Selection
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

  // Simple Timer Duration (only visible for simple mode)
  const simpleDurationRow = createLabeledInputRow(
    'Simple Timer Duration (min):',
    'simple-duration',
    { value: config.simpleDuration, min: 1, max: 180 }
  );
  if (config.timerMode !== 'simple') {
    simpleDurationRow.classList.add('hidden');
  }

  // Pomodoro-specific options
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

  return {
    timerModeRow,
    timerModeSelect,
    simpleDurationRow,
    focusRow,
    breakRow,
    cyclesRow
  };
}

/**
 * Create motivational message input row.
 * @param {Object} config - Configuration object
 * @returns {HTMLElement} Message row element
 */
function createMotivationalMessageRow(config) {
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
  return messageRow;
}

/**
 * Create website blocking rulesets section.
 * @param {Object} handler - The KeyboardShortcutHandler instance
 * @param {HTMLElement} dialog - The dialog element
 * @returns {HTMLElement} Rulesets section element
 */
function createRulesetsSection(handler, dialog) {
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
    dialog.classList.remove('active');
    handler.showRulesetSettingsDialog(() => {
      dialog.classList.add('active');
    });
  });

  rulesetsSection.appendChild(rulesetsTitle);
  rulesetsSection.appendChild(rulesetsDescription);
  rulesetsSection.appendChild(manageRulesetsButton);

  return rulesetsSection;
}

/**
 * Create lockout methods section with hold/code settings.
 * @param {Object} config - Configuration object
 * @returns {Object} Object containing lockout section and select elements
 */
function createLockoutSection(config) {
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

  // Hold duration settings
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

  // Code length settings
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

  // Visibility toggling
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

  return { lockoutSection, idleMethodSelect, activeMethodSelect };
}

/**
 * Create reminder settings section with daily and post-session subsections.
 * @param {Object} config - Configuration object
 * @param {HTMLElement} dialog - The dialog element
 * @returns {HTMLElement} Reminder section element
 */
function createReminderSettingsSection(config, dialog) {
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

  // Radio button group
  const reminderModeGroup = document.createElement('div');
  reminderModeGroup.style.marginBottom = '16px';

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

  // Daily Reminder Subsection
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

  const dailyReminderCooldownRow = createLabeledInputRow(
    'Skip cooldown (min):',
    'daily-reminder-skip-cooldown',
    { value: config.dailyReminderSkipCooldown, min: 1, max: 120 }
  );

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

  // Post-Session Subsection
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

  const postSessionIdleTimeRow = createLabeledInputRow(
    'Idle time before reminder (min):',
    'post-session-idle-time',
    { value: config.postSessionIdleTime, min: 1, max: 240 }
  );

  const postSessionCooldownRow = createLabeledInputRow(
    'Skip cooldown (min):',
    'post-session-skip-cooldown',
    { value: config.postSessionSkipCooldown, min: 1, max: 120 }
  );

  const postSessionFocusTimeRow = createLabeledInputRow(
    'Daily focus time goal (min):',
    'post-session-focus-time-goal',
    { value: config.postSessionFocusTimeGoal, min: 1, max: 600 }
  );

  const focusTimeHelpText = document.createElement('p');
  focusTimeHelpText.className = 'zen-pomodoro-help-text';
  focusTimeHelpText.textContent = 'Reminders stop after this much focus time is achieved.';

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

  const endTimeHelpText = document.createElement('p');
  endTimeHelpText.className = 'zen-pomodoro-help-text';
  endTimeHelpText.textContent =
    'Automatically disable reminders after this time (e.g., 00:30 for 12:30 AM).';

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

  const postSessionHoldDurationRow = createLabeledInputRow(
    'Initial hold time (sec):',
    'post-session-hold-duration',
    { value: config.postSessionSkipHoldDuration, min: 5, max: 120 }
  );

  const postSessionCodeLengthRow = createLabeledInputRow(
    'Initial code length:',
    'post-session-code-length',
    { value: config.postSessionSkipCodeLength, min: 16, max: 128 }
  );

  const escalationInfo = document.createElement('p');
  escalationInfo.className = 'zen-pomodoro-help-text top-margin';
  escalationInfo.textContent = 'Skip requirement increases by 50% each time.';

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

  const setElementDisplay = (element, visible) => {
    element.classList.toggle('hidden', !visible);
  };

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

  // Visibility management
  const updateReminderModeVisibility = () => {
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

    if (selectedMode === Constants.REMINDER_MODES.POST_SESSION) {
      updatePostSessionMethodVisibility();
    }
  };

  [offRadio.input, dailyRadio.input, postSessionRadio.input].forEach((radio) => {
    radio.addEventListener('change', updateReminderModeVisibility);
  });

  updateReminderModeVisibility();

  reminderSection.appendChild(reminderTitle);
  reminderSection.appendChild(reminderDescription);
  reminderSection.appendChild(reminderModeGroup);
  reminderSection.appendChild(dailyReminderSubsection);
  reminderSection.appendChild(postSessionSubsection);

  return reminderSection;
}

/**
 * Create timer reminders section for phase-based notifications.
 * @param {Object} config - Configuration object
 * @returns {HTMLElement} Timer reminders section element
 */
function createTimerRemindersSection(config) {
  const timerRemindersSection = document.createElement('div');
  timerRemindersSection.className = 'zen-pomodoro-config-section';

  const timerRemindersTitle = document.createElement('h3');
  timerRemindersTitle.textContent = 'Timer Reminders';

  const timerRemindersDescription = document.createElement('p');
  timerRemindersDescription.className = 'zen-pomodoro-help-text';
  timerRemindersDescription.textContent =
    'Get notified at specified times before focus or break phases end.';

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

  const focusRemindersSubsection = createReminderSubsection(
    config, 'focusPhaseReminders', 'Focus Phase Reminders',
    'Minutes before focus phase ends to show reminder:',
    'focus-reminders-list', 'add-focus-reminder-input', 1, 120
  );

  const breakRemindersSubsection = createReminderSubsection(
    config, 'breakPhaseReminders', 'Break Phase Reminders',
    'Minutes before break phase ends to show reminder:',
    'break-reminders-list', 'add-break-reminder-input', 1, 60
  );

  timerRemindersSection.appendChild(timerRemindersTitle);
  timerRemindersSection.appendChild(timerRemindersDescription);
  timerRemindersSection.appendChild(timerRemindersEnabledRow);
  timerRemindersSection.appendChild(focusRemindersSubsection);
  timerRemindersSection.appendChild(breakRemindersSubsection);

  return timerRemindersSection;
}

/**
 * Create dialog action buttons.
 * @param {Object} handler - The KeyboardShortcutHandler instance
 * @param {HTMLElement} dialog - The dialog element
 * @param {Object} config - Configuration object
 * @param {Object} elements - Object containing UI elements for save operations
 * @returns {HTMLElement} Button container
 */
function createActionButtons(handler, dialog, config, elements) {
  const { shortcutInput, toggleIndicatorInput, timerModeSelect, idleMethodSelect, activeMethodSelect } = elements;

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

  saveButton.addEventListener('click', () => {
    saveAllSettings();
    window.zenPomodoroApp?.showCustomAlert('Saved', 'Settings have been saved.');
  });

  saveCloseButton.addEventListener('click', () => {
    saveAllSettings();
    dialog.remove();
  });

  buttonDiv.appendChild(cancelButton);
  buttonDiv.appendChild(exportLogsButton);
  buttonDiv.appendChild(saveButton);
  buttonDiv.appendChild(saveCloseButton);

  return buttonDiv;
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

  // Header with back button and title
  const { backButton, title } = createHeaderSection(handler, dialog);

  // Undo/Redo manager
  handler.settingsUndoRedo = new UndoRedoManager();
  handler.settingsUndoRedo.pushState(JSON.parse(JSON.stringify(config)));
  const undoRedoButtons = handler.settingsUndoRedo.createButtons();

  // Create config section container
  const configSection = document.createElement('div');
  configSection.className = 'zen-pomodoro-config-section';

  // Create all UI sections
  const shortcuts = createShortcutRows(config);
  const timerMode = createTimerModeSection(config);
  const messageRow = createMotivationalMessageRow(config);
  const rulesetsSection = createRulesetsSection(handler, dialog);
  const lockout = createLockoutSection(config);
  const reminderSection = createReminderSettingsSection(config, dialog);
  const timerRemindersSection = createTimerRemindersSection(config);

  // Assemble config section
  configSection.appendChild(shortcuts.shortcutRow);
  configSection.appendChild(shortcuts.toggleIndicatorRow);
  configSection.appendChild(timerMode.timerModeRow);
  configSection.appendChild(timerMode.simpleDurationRow);
  configSection.appendChild(timerMode.focusRow);
  configSection.appendChild(timerMode.breakRow);
  configSection.appendChild(timerMode.cyclesRow);
  configSection.appendChild(messageRow);
  configSection.appendChild(rulesetsSection);
  configSection.appendChild(lockout.lockoutSection);
  configSection.appendChild(reminderSection);
  configSection.appendChild(timerRemindersSection);

  // Create action buttons
  const buttonDiv = createActionButtons(handler, dialog, config, {
    shortcutInput: shortcuts.shortcutInput,
    toggleIndicatorInput: shortcuts.toggleIndicatorInput,
    timerModeSelect: timerMode.timerModeSelect,
    idleMethodSelect: lockout.idleMethodSelect,
    activeMethodSelect: lockout.activeMethodSelect
  });

  // Assemble dialog header
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.alignItems = 'center';
  headerRow.style.marginBottom = '8px';
  backButton.style.marginBottom = '0';
  headerRow.appendChild(backButton);
  headerRow.appendChild(undoRedoButtons);

  // Assemble final dialog
  dialog.appendChild(headerRow);
  dialog.appendChild(title);
  dialog.appendChild(configSection);
  dialog.appendChild(buttonDiv);

  document.documentElement.appendChild(dialog);

  // Track changes for undo/redo
  configSection.addEventListener('change', () => {
    handler.settingsUndoRedo.pushState(JSON.parse(JSON.stringify(getConfig())));
  });

  // Set restore callback for undo/redo
  handler.settingsUndoRedo.onStateRestore = (state) => {
    saveConfig(state);
    saveDialogPosition(dialog);
    dialog.remove();
    handler.createSettingsDialog();
  };

  // Apply saved position and make draggable
  applyLastDialogPosition(dialog);
  setupDialogDrag(dialog);
}
