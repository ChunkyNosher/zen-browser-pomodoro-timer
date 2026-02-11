import Constants from './constants.js';
import Storage from './storage.js';

/**
 * Utils Module - General utility functions used across the application.
 */

/**
 * Format time in MM:SS format
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time string (MM:SS)
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time with optional hours support.
 * When useHours is true, includes hours in format ONLY if hours > 0.
 * This provides automatic formatting (H:MM:SS for >= 1 hour, MM:SS otherwise).
 * @param {number} seconds - Total seconds to format
 * @param {boolean} useHours - Enable hours display (hours shown only when > 0)
 * @returns {string} Formatted time string (H:MM:SS when useHours && hours > 0, otherwise MM:SS)
 */
function formatTimeWithHours(seconds, useHours = false) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // Include hours only when useHours is enabled AND there are hours to display
  // This provides automatic format switching (H:MM:SS <-> MM:SS) for countdowns
  if (useHours && hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get phase display label from phase identifier.
 * @param {string} phase - Phase identifier ('focus', 'break', 'transition')
 * @returns {string} Human-readable phase label
 */
function getPhaseLabel(phase) {
  const labels = {
    focus: 'Focus Period',
    break: 'Break Time',
    'long-break': 'Break Time', // Keep for backwards compatibility with saved state
    transition: 'Transition',
  };
  return labels[phase] || 'Focus Period';
}

/**
 * Get short phase label for indicator.
 * @param {string} phase - Phase identifier
 * @returns {string} Short phase label
 */
function getShortPhaseLabel(phase) {
  if (phase === 'focus') return 'Focus';
  if (phase === 'transition') return 'Transition';
  return 'Break';
}

/**
 * Sanitize text content to prevent XSS attacks.
 * Removes HTML-like characters (<, >) that could be used for injection.
 * This is a defense-in-depth measure since we use textContent instead of innerHTML.
 * @param {string} text - The text to sanitize
 * @returns {string} Sanitized text with HTML characters removed
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[<>]/g, '');
}

/**
 * Validate integer input with min/max bounds.
 * LOGIC FIX: Input validation for settings.
 * @param {*} value - Value to validate
 * @param {number} min - Minimum valid value
 * @param {number} max - Maximum valid value
 * @param {number} defaultValue - Default value if validation fails
 * @returns {number} Validated value or defaultValue
 */
function validateIntegerInput(value, min, max, defaultValue) {
  const parsed = parseInt(value, 10);
  const isValidNumber = !isNaN(parsed);
  const isInRange = parsed >= min && parsed <= max;

  return isValidNumber && isInRange ? parsed : defaultValue;
}

/**
 * Check if a value is a non-empty array.
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a non-empty array
 */
function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Validate that a value is a valid positive integer within a range.
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {boolean} True if value is valid
 */
function isValidRangeValue(value, min, max) {
  return !isNaN(value) && value >= min && value <= max;
}

/**
 * Extract and validate integer input from a dialog.
 * This function is null-safe: returns null if element not found, returns defaultValue
 * if the input is empty or invalid.
 * @param {HTMLElement} dialog - The dialog element
 * @param {Object} options - Options object
 * @param {string} options.selector - CSS selector for the input
 * @param {number} options.min - Minimum valid value
 * @param {number} options.max - Maximum valid value
 * @param {number} options.defaultValue - Default value if validation fails or input is empty
 * @returns {number|null} Validated value, defaultValue for empty/invalid input, or null if element not found
 */
function getValidatedIntFromDialog(dialog, { selector, min, max, defaultValue }) {
  const input = dialog.querySelector(selector);
  if (!input) return null;

  const rawValue = typeof input.value === 'string' ? input.value.trim() : '';
  if (rawValue === '') {
    // Treat present-but-empty input as "use default" rather than "missing element"
    return defaultValue;
  }

  return validateIntegerInput(rawValue, min, max, defaultValue);
}

/**
 * Generate cryptographically secure random code for settings lock.
 * SECURITY FIX: Uses crypto.getRandomValues() instead of Math.random()
 * @param {number} length - Length of code to generate
 * @param {string} charset - Character set ('alphanumeric' or 'all-typeable')
 * @returns {string} Generated random code
 */
function generateRandomCode(length, charset) {
  const chars =
    charset === 'alphanumeric'
      ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Use crypto.getRandomValues for cryptographically secure random generation
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(randomValues[i] % chars.length);
  }
  return code;
}

/**
 * Clamp a position value within viewport bounds.
 * @param {number} position - Current position value
 * @param {number} size - Size of the element (width or height)
 * @param {number} viewportSize - Size of the viewport (innerWidth or innerHeight)
 * @returns {number} Clamped position value
 */
function clampToViewportBound(position, size, viewportSize) {
  const maxBound = viewportSize - size;
  if (maxBound >= 0) {
    return Math.max(0, Math.min(position, maxBound));
  }
  // Element larger than viewport: allow negative positions but keep part visible
  const overflow = size - viewportSize;
  return Math.max(-overflow, Math.min(position, 0));
}

/**
 * Check if a workspace array is valid and non-empty.
 * @param {*} workspaces - The workspaces value to check
 * @returns {boolean} True if valid non-empty array
 */
function isValidWorkspaceArray(workspaces) {
  return workspaces && Array.isArray(workspaces) && workspaces.length > 0;
}

/**
 * Format workspace data from API response to standard format.
 * @param {Array} workspaces - Raw workspace array from API
 * @returns {Array<{id: string, name: string}>} Formatted workspace array
 */
function formatWorkspacesFromApi(workspaces) {
  return workspaces.map((ws) => ({
    id: ws.uuid || ws.id,
    name: ws.name || ws.title || 'Unnamed Workspace',
  }));
}

/**
 * Check if a workspace name is valid (non-empty and not 'undefined').
 * @param {*} name - The name to check
 * @returns {boolean} True if valid
 * @private
 */
function isValidName(name) {
  return Boolean(name) && name !== 'undefined' && name !== '';
}

/**
 * Create a fallback workspace name from an ID.
 * @param {string} id - The workspace ID
 * @returns {string} Fallback name
 * @private
 */
function createFallbackWorkspaceName(id) {
  const idPrefix = id?.substring(0, 8) || 'Unknown';
  return `Workspace ${idPrefix}`;
}

/**
 * Extract workspace name from a DOM button element.
 * Tries multiple attributes in priority order.
 * @param {Element} btn - The button element
 * @param {string} id - The workspace ID (for fallback name)
 * @returns {string} The workspace name
 */
function extractWorkspaceNameFromButton(btn, id) {
  // Try each attribute in priority order
  for (const attr of Constants.WORKSPACE_NAME_ATTRIBUTES) {
    const name = btn.getAttribute(attr);
    if (isValidName(name)) return name;
  }

  // Try to find a label element
  const labelEl = btn.querySelector('.tab-label, .tab-text, .workspace-label, label');
  const labelName = labelEl?.textContent?.trim();
  if (isValidName(labelName)) return labelName;

  // Try button text content
  const textName = btn.textContent?.trim();
  if (isValidName(textName)) return textName;

  // Fallback name using truncated ID
  return createFallbackWorkspaceName(id);
}

/**
 * Get all blocked workspaces from active rulesets.
 * Combines blocked workspaces from all enabled and active rulesets.
 * @returns {string[]} Array of unique blocked workspace IDs
 */
function getActiveBlockedWorkspaces() {
  const config = Storage.loadConfig();
  const activeBlockedWorkspaces = new Set();

  // Get active rulesets
  const activeRulesetIds = config.activeRulesets || ['default'];

  // Iterate through all rulesets
  (config.rulesets || []).forEach((ruleset) => {
    // Check if this ruleset is active and enabled
    if (ruleset.enabled && activeRulesetIds.includes(ruleset.id)) {
      // Add blocked workspaces from this ruleset
      const rulesetWorkspaces = ruleset.blockedWorkspaces || [];
      rulesetWorkspaces.forEach((wsId) => activeBlockedWorkspaces.add(wsId));
    }
  });

  return Array.from(activeBlockedWorkspaces);
}

/**
 * Find rule in config and execute callback if found.
 * Reduces code duplication in rule event handlers.
 * @param {Object} config - Configuration object
 * @param {string} rulesetId - Ruleset ID to find
 * @param {string} ruleId - Rule ID to find
 * @param {function} callback - Callback with (rule, ruleIndex, rulesArray) params
 * @returns {boolean} True if rule was found and callback was executed
 */
function findRuleAndExecute(config, rulesetId, ruleId, callback) {
  const rulesetIndex = config.rulesets.findIndex((r) => r.id === rulesetId);
  if (rulesetIndex === -1) return false;

  const rulesArray = config.rulesets[rulesetIndex].rules;
  const ruleIndex = rulesArray.findIndex((r) => r.id === ruleId);
  if (ruleIndex === -1) return false;

  callback(rulesArray[ruleIndex], ruleIndex, rulesArray);
  return true;
}

// Export all public functions
export {
  formatTime,
  formatTimeWithHours,
  getPhaseLabel,
  getShortPhaseLabel,
  sanitizeText,
  validateIntegerInput,
  getValidatedIntFromDialog,
  generateRandomCode,
  clampToViewportBound,
  isValidWorkspaceArray,
  formatWorkspacesFromApi,
  extractWorkspaceNameFromButton,
  getActiveBlockedWorkspaces,
  findRuleAndExecute,
  isNonEmptyArray,
  isValidRangeValue,
};

// Default export for backward compatibility
const Utils = {
  formatTime,
  formatTimeWithHours,
  getPhaseLabel,
  getShortPhaseLabel,
  sanitizeText,
  validateIntegerInput,
  getValidatedIntFromDialog,
  generateRandomCode,
  clampToViewportBound,
  isValidWorkspaceArray,
  formatWorkspacesFromApi,
  extractWorkspaceNameFromButton,
  getActiveBlockedWorkspaces,
  findRuleAndExecute,
  isNonEmptyArray,
  isValidRangeValue,
};

export default Utils;
