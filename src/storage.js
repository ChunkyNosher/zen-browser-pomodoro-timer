import Constants from './constants.js';
import { logger } from './log-manager.js';

/**
 * Storage Module - Handles all Firefox preferences (Services.prefs) operations.
 * No other module should directly call Services.prefs.
 */

/**
 * Get preference from Firefox Services
 * @param {string} key - Preference key (without prefix)
 * @param {*} defaultValue - Default value if preference not found
 * @returns {*} Preference value or defaultValue
 */
function getPref(key, defaultValue) {
  const prefKey = `${Constants.PREF_PREFIX}.${key}`;
  try {
    if (Services.prefs.prefHasUserValue(prefKey)) {
      const prefType = Services.prefs.getPrefType(prefKey);
      if (prefType === Services.prefs.PREF_STRING) {
        return Services.prefs.getCharPref(prefKey);
      } else if (prefType === Services.prefs.PREF_INT) {
        return Services.prefs.getIntPref(prefKey);
      } else if (prefType === Services.prefs.PREF_BOOL) {
        return Services.prefs.getBoolPref(prefKey);
      }
    }
  } catch (e) {
    console.error(`Failed to get pref ${prefKey}:`, e);
  }
  return defaultValue;
}

/**
 * Set preference in Firefox Services
 * @param {string} key - Preference key (without prefix)
 * @param {*} value - Value to set (string, number, or boolean)
 */
function setPref(key, value) {
  const prefKey = `${Constants.PREF_PREFIX}.${key}`;
  try {
    if (typeof value === 'string') {
      Services.prefs.setCharPref(prefKey, value);
    } else if (typeof value === 'number') {
      Services.prefs.setIntPref(prefKey, value);
    } else if (typeof value === 'boolean') {
      Services.prefs.setBoolPref(prefKey, value);
    }
  } catch (e) {
    console.error(`Failed to set pref ${prefKey}:`, e);
  }
}

/**
 * Load stored JSON config from preferences with error handling.
 * @param {Object} config - Config object to merge into
 * @returns {Object} Updated config object
 * @private
 */
function loadStoredConfigJson(config) {
  const configStr = getPref('config', null);
  if (!configStr) return config;

  try {
    const storedConfig = JSON.parse(configStr);
    return { ...config, ...storedConfig };
  } catch (e) {
    console.error('Failed to parse config:', e);
    return config;
  }
}

/**
 * Load a boolean preference and set it in config if present.
 * Handles both true boolean values and 'true' string values.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Config object to update
 * @param {string} configKey - Key in config to set
 */
function loadBooleanPref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  if (value !== null) {
    config[configKey] = value === true || value === 'true';
  }
}

/**
 * Load a positive integer preference and set it in config if present and valid.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Config object to update
 * @param {string} configKey - Key in config to set
 */
function loadPositiveIntPref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  if (value !== null) {
    const intValue = typeof value === 'number' ? value : parseInt(value, 10);
    if (!isNaN(intValue) && intValue > 0) {
      config[configKey] = intValue;
    }
  }
}

/**
 * Load a non-empty string preference and set it in config if present.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Config object to update
 * @param {string} configKey - Key in config to set
 */
function loadNonEmptyStringPref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  if (value !== null && value !== '') {
    config[configKey] = value;
  }
}

/**
 * Validate time format (HH:MM, 24-hour) with range checking.
 * @param {string} timeStr - Time string to validate
 * @returns {boolean} True if valid time format
 */
function isValidTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;

  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Load a time preference (HH:MM format) and set it in config if valid.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Config object to update
 * @param {string} configKey - Key in config to set
 */
function loadTimePref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  const hasValue = value !== null && value !== '';
  const isValidTimePref = hasValue && isValidTimeFormat(value);
  if (isValidTimePref) {
    config[configKey] = value;
  }
}

/**
 * Load a comma-separated time list preference and set it in config if valid.
 * Validates each time in HH:MM format and filters out invalid times.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Config object to update
 * @param {string} configKey - Key in config to set
 */
function loadTimeArrayPref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  if (value !== null && value !== '') {
    // Split by comma and trim whitespace
    const times = value.split(',').map((t) => t.trim());
    // Filter to only valid times
    const validTimes = times.filter((t) => isValidTimeFormat(t));
    if (validTimes.length > 0) {
      config[configKey] = validTimes;
    }
  }
}

/**
 * Load a comma-separated integer list preference and set it in config if valid.
 * Validates each integer as a positive number and filters out invalid values.
 * Supports empty strings to represent empty arrays.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Config object to update
 * @param {string} configKey - Key in config to set
 */
function loadIntArrayPref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  if (value !== null) {
    // Handle empty string as empty array
    if (value === '') {
      config[configKey] = [];
      return;
    }
    // Split by comma and trim whitespace
    const numbers = value
      .split(',')
      .map((n) => n.trim())
      .map((n) => parseInt(n, 10));
    // Filter to only valid positive integers
    const validNumbers = numbers.filter((n) => !isNaN(n) && n > 0);
    if (validNumbers.length > 0) {
      config[configKey] = validNumbers;
    }
  }
}

/**
 * Load and validate reminder mode from preferences.
 * Only accepts valid reminder mode values from REMINDER_MODES constant.
 * @param {string} prefName - Preference name (without prefix)
 * @param {Object} config - Configuration object to update
 * @param {string} configKey - Key to update in config object
 */
function loadReminderModePref(prefName, config, configKey) {
  const value = getPref(prefName, null);
  if (value !== null && value !== '') {
    // Validate that the value is one of the allowed reminder modes
    const validModes = Object.values(Constants.REMINDER_MODES);
    if (validModes.includes(value)) {
      config[configKey] = value;
    }
  }
}

/**
 * Get configuration object from preferences.
 * Loads default config, then merges stored JSON config, then applies individual preference overrides.
 * @returns {Object} Configuration object
 */
function loadConfig() {
  // Start with default config, then merge stored JSON config
  let config = loadStoredConfigJson({ ...Constants.DEFAULT_CONFIG });

  // MIGRATION: Convert old boolean flags to new reminderMode
  if (config.dailyReminderEnabled !== undefined || config.postSessionReminderEnabled !== undefined) {
    if (config.dailyReminderEnabled === true) {
      config.reminderMode = Constants.REMINDER_MODES.DAILY;
    } else if (config.postSessionReminderEnabled === true) {
      config.reminderMode = Constants.REMINDER_MODES.POST_SESSION;
    } else {
      config.reminderMode = Constants.REMINDER_MODES.NONE;
    }
    // Clean up old keys
    delete config.dailyReminderEnabled;
    delete config.postSessionReminderEnabled;
    logger.log(Constants.LOG_CATEGORIES.SETTINGS, 'Migrated reminder settings to new format', {
      reminderMode: config.reminderMode,
    });
  }

  // Override with individual preferences if set
  // Boolean preferences (handles both true and 'true' for legacy support)
  loadBooleanPref('enableNotifications', config, 'enableNotifications');
  loadBooleanPref('timerRemindersEnabled', config, 'timerRemindersEnabled');

  // Positive integer preferences
  loadPositiveIntPref('postSessionIdleTime', config, 'postSessionIdleTime');
  loadPositiveIntPref('postSessionSkipCooldown', config, 'postSessionSkipCooldown');
  loadPositiveIntPref('postSessionFocusTimeGoal', config, 'postSessionFocusTimeGoal');
  loadPositiveIntPref('dailyReminderSkipHoldDuration', config, 'dailyReminderSkipHoldDuration');
  loadPositiveIntPref('dailyReminderSkipCodeLength', config, 'dailyReminderSkipCodeLength');

  // String preferences (requires non-empty validation)
  loadNonEmptyStringPref('keyboardShortcut', config, 'keyboardShortcut');
  loadNonEmptyStringPref('toggleIndicatorShortcut', config, 'toggleIndicatorShortcut');

  // Reminder mode preference (enum validation)
  loadReminderModePref('reminderMode', config, 'reminderMode');

  // Time preferences (requires HH:MM format validation)
  loadTimePref('postSessionReminderEndTime', config, 'postSessionReminderEndTime');

  // Time array preferences (comma-separated HH:MM times)
  loadTimeArrayPref('dailyReminderTimes', config, 'dailyReminderTimes');

  // Integer array preferences (comma-separated positive integers)
  loadIntArrayPref('focusPhaseReminders', config, 'focusPhaseReminders');
  loadIntArrayPref('breakPhaseReminders', config, 'breakPhaseReminders');

  return config;
}

/**
 * Save configuration object to preferences.
 * @param {Object} config - Configuration object to save
 */
function saveConfig(config) {
  try {
    setPref('config', JSON.stringify(config));
    logger.log(Constants.LOG_CATEGORIES.SETTINGS, 'Configuration saved', {
      timerMode: config.timerMode,
      focusDuration: config.focusDuration,
      breakDuration: config.breakDuration,
      cycles: config.cycles,
      blockedWorkspacesCount: config.blockedWorkspaces?.length || 0,
    });
  } catch (e) {
    logger.log(Constants.LOG_CATEGORIES.SETTINGS, 'Failed to save config', { error: e.message });
    console.error('Failed to save config:', e);
  }
}

// Export all public functions
export {
  getPref,
  setPref,
  loadConfig,
  saveConfig,
  loadStoredConfigJson,
  loadBooleanPref,
  loadPositiveIntPref,
  loadNonEmptyStringPref,
  isValidTimeFormat,
  loadTimePref,
  loadTimeArrayPref,
  loadIntArrayPref,
  loadReminderModePref,
};

// Default export for backward compatibility
const Storage = {
  getPref,
  setPref,
  loadConfig,
  saveConfig,
  loadStoredConfigJson,
  loadBooleanPref,
  loadPositiveIntPref,
  loadNonEmptyStringPref,
  isValidTimeFormat,
  loadTimePref,
  loadTimeArrayPref,
  loadIntArrayPref,
  loadReminderModePref,
};

export default Storage;
