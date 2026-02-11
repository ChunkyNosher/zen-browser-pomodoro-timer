/**
 * Helpers module - Legacy wrapper functions and remaining helper utilities.
 * Provides backward compatibility with older code that uses these function names.
 */

import Constants from './constants.js';
import Storage from './storage.js';
import Utils from './utils.js';

// ============================================
// Storage Legacy Wrappers
// ============================================

export function getPref(key, defaultValue) {
  return Storage.getPref(key, defaultValue);
}

export function setPref(key, value) {
  Storage.setPref(key, value);
}

export function getConfig() {
  return Storage.loadConfig();
}

export function saveConfig(config) {
  Storage.saveConfig(config);
}

// ============================================
// Utils Legacy Wrappers
// ============================================

export function formatTime(seconds) {
  return Utils.formatTime(seconds);
}

export function formatTimeWithHours(seconds, useHours) {
  return Utils.formatTimeWithHours(seconds, useHours);
}

export function getPhaseLabel(phase) {
  return Utils.getPhaseLabel(phase);
}

export function getShortPhaseLabel(phase) {
  return Utils.getShortPhaseLabel(phase);
}

export function sanitizeText(text) {
  return Utils.sanitizeText(text);
}

export function validateIntegerInput(value, min, max, defaultValue) {
  return Utils.validateIntegerInput(value, min, max, defaultValue);
}

export function getValidatedIntFromDialog(dialog, options) {
  return Utils.getValidatedIntFromDialog(dialog, options);
}

export function isNonEmptyArray(value) {
  return Utils.isNonEmptyArray(value);
}

export function isValidRangeValue(value, min, max) {
  return Utils.isValidRangeValue(value, min, max);
}

export function generateRandomCode(length, charset) {
  return Utils.generateRandomCode(length, charset);
}

export function clampToViewportBound(position, size, viewportSize) {
  return Utils.clampToViewportBound(position, size, viewportSize);
}

export function isValidWorkspaceArray(workspaces) {
  return Utils.isValidWorkspaceArray(workspaces);
}

export function formatWorkspacesFromApi(workspaces) {
  return Utils.formatWorkspacesFromApi(workspaces);
}

export function extractWorkspaceNameFromButton(btn, id) {
  return Utils.extractWorkspaceNameFromButton(btn, id);
}

export function getActiveBlockedWorkspaces() {
  return Utils.getActiveBlockedWorkspaces();
}

export function findRuleAndExecute(config, rulesetId, ruleId, callback) {
  return Utils.findRuleAndExecute(config, rulesetId, ruleId, callback);
}

// ============================================
// Notification Helper
// ============================================

/**
 * Send a browser notification with fallback to console.log.
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 */
export function sendBrowserNotification(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: 'chrome://branding/content/about-logo.png',
      });
    } else {
      console.log(`${title}: ${body}`);
    }
  } catch (e) {
    console.log(`${title}: ${body}`);
  }
}

// ============================================
// Constants Legacy Accessors
// ============================================

export const PREF_PREFIX = Constants.PREF_PREFIX;
export const MOD_VERSION = Constants.MOD_VERSION;
export const MODIFIER_KEYS = Constants.MODIFIER_KEYS;
export const LOCKOUT_METHODS = Constants.LOCKOUT_METHODS;
export const DATA_NO_POSITION_SAVE = Constants.DATA_NO_POSITION_SAVE;
export const DEFAULT_CONFIG = Constants.DEFAULT_CONFIG;
export const SAVE_STATE_INTERVAL_SECONDS = Constants.SAVE_STATE_INTERVAL_SECONDS;
export const DOM_SETTLE_DELAY_MS = Constants.DOM_SETTLE_DELAY_MS;
export const RESTORATION_NOTIFICATION_DELAY_MS = Constants.RESTORATION_NOTIFICATION_DELAY_MS;
export const MAX_OVERLAY_Z_INDEX = Constants.MAX_OVERLAY_Z_INDEX;
export const MIN_CONTENT_AREA_DIMENSION = Constants.MIN_CONTENT_AREA_DIMENSION;
export const CONTENT_OBSERVER_DEBOUNCE_DELAY_MS = Constants.CONTENT_OBSERVER_DEBOUNCE_DELAY_MS;
export const TRANSITION_PHASE_DURATION_SECONDS = Constants.TRANSITION_PHASE_DURATION_SECONDS;
export const POST_SESSION_ESCALATION_FACTOR = Constants.POST_SESSION_ESCALATION_FACTOR;
export const POST_SESSION_CHECK_INTERVAL_MS = Constants.POST_SESSION_CHECK_INTERVAL_MS;
export const DAILY_REMINDER_ESCALATION_FACTOR = Constants.DAILY_REMINDER_ESCALATION_FACTOR;
export const DAILY_REMINDER_CHECK_INTERVAL_MS = Constants.DAILY_REMINDER_CHECK_INTERVAL_MS;
export const DAILY_REMINDER_STARTUP_DELAY_MS = Constants.DAILY_REMINDER_STARTUP_DELAY_MS;
export const EARLY_MORNING_CUTOFF_MINUTES = Constants.EARLY_MORNING_CUTOFF_MINUTES;
export const WORKSPACE_MUTATION_DELAY_MS = Constants.WORKSPACE_MUTATION_DELAY_MS;
export const REGEX_ESCAPE_PATTERN = Constants.REGEX_ESCAPE_PATTERN;
export const REGEX_ESCAPE_PATTERN_KEEP_ASTERISK = Constants.REGEX_ESCAPE_PATTERN_KEEP_ASTERISK;
export const LOG_CATEGORIES = Constants.LOG_CATEGORIES;
export const WORKSPACE_CONTAINER_SELECTORS = Constants.WORKSPACE_CONTAINER_SELECTORS;
export const CONTENT_AREA_SELECTORS = Constants.CONTENT_AREA_SELECTORS;
export const WORKSPACE_NAME_ATTRIBUTES = Constants.WORKSPACE_NAME_ATTRIBUTES;
export const URL_REVOKE_DELAY_MS = Constants.URL_REVOKE_DELAY_MS;

// ============================================
// Remaining Helper Functions
// ============================================

/**
 * Check if current window is a popup window (not the main browser window).
 * In Firefox/Zen Browser, popup windows have the 'chromehidden' attribute set
 * on the document element. This includes auth popups, sign-in dialogs, etc.
 *
 * This is used to prevent showing certain notifications (like timer restoration)
 * in popup windows where they would be inappropriate and confusing.
 *
 * @returns {boolean} True if this is a popup window, false if main browser window
 */
export function isPopupWindow() {
  try {
    // Check for chromehidden attribute (set on popup windows)
    const chromehidden = document.documentElement.getAttribute('chromehidden');
    if (chromehidden) {
      return true;
    }

    // Additional check: popup windows typically lack certain UI elements
    // gBrowser is the tab browser and is only present in main browser windows
    // eslint-disable-next-line no-undef
    if (typeof gBrowser === 'undefined' || !gBrowser.tabContainer) {
      return true;
    }

    return false;
  } catch (e) {
    // If we can't determine, assume it's not a popup to be safe
    return false;
  }
}
