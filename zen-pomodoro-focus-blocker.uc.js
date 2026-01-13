/**
 * Zen Pomodoro Focus Blocker Mod
 * Version: 1.1.7
 * License: MIT
 *
 * A productivity mod that implements customizable Pomodoro timer with workspace blocking
 *
 * SECURITY FIXES:
 * - Uses textContent/createElement instead of innerHTML for user content
 * - Uses crypto.getRandomValues() for security codes
 * - Proper cleanup of observers and intervals
 * - Memory leak fixes
 *
 * FEATURES IMPLEMENTED:
 * - Native context menu integration (XUL-based)
 * - Workspace selection UI in settings
 * - Security lock screens with cancel buttons
 * - Hold-to-unlock for settings access
 * - Notification permission requests
 * - Custom confirmation dialogs
 *
 * CODE QUALITY:
 * - Proper input validation
 * - Reduced save frequency
 * - Config stored with timer state
 * - Viewport boundary checks
 * - Accessibility improvements
 * - Settings consolidated to preferences.json
 */

(() => {
  'use strict';

  // ============================================
  // Constants and Configuration
  // ============================================

  const PREF_PREFIX = 'zen-pomodoro';

  /**
   * Modifier keys used by the keyboard shortcut recorder.
   * These are the keys that can be combined with a regular key to form a shortcut.
   * @constant {string[]}
   */
  const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];

  /**
   * Valid lockout method types for settings access control.
   * @constant {Object}
   * @property {string} CODE - Requires entering a randomly generated code
   * @property {string} HOLD - Requires holding a button for a duration
   */
  const LOCKOUT_METHODS = {
    CODE: 'code',
    HOLD: 'hold',
  };

  const DEFAULT_CONFIG = {
    timerMode: 'pomodoro',
    simpleDuration: 25,
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    cycles: 4,
    blockedWorkspaces: [],
    overlayColor: '#808080',
    motivationalMessage: 'Get back to work.',
    /** @type {'hold'|'code'} Method to use when timer is idle */
    settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
    /** @type {'hold'|'code'} Method to use when timer is active */
    settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
    /** Hold duration in seconds when timer is idle */
    settingsLockIdleHoldDuration: 10,
    /** Hold duration in seconds when timer is active */
    settingsLockActiveHoldDuration: 25,
    /** Code length when timer is idle */
    settingsLockIdleCodeLength: 48,
    /** Code length when timer is active */
    settingsLockActiveCodeLength: 96,
    settingsLockActiveCharacterSet: 'all-typeable',
    enableNotifications: true,
    enableAudioAlerts: false,
    phase: 'focus',
    keyboardShortcut: 'Alt+Shift+P',
    /** Website blocking rulesets (LeechBlock-style) */
    rulesets: [
      {
        id: 'default',
        name: 'Default Blocklist',
        enabled: true,
        rules: [], // Array of rule objects: { id, pattern, type: 'website'|'keyword', condition: 'block'|'allow' }
        // Keywords only check tab titles due to browser security restrictions (cross-origin)
        checkTitleOnly: true,
      },
    ],
    /** Rulesets to enable when timer starts */
    activeRulesets: ['default'],
  };

  // Save state every 10 seconds instead of every second for performance (in seconds)
  const SAVE_STATE_INTERVAL_SECONDS = 10;

  // Delay for DOM settling after timer start (in milliseconds)
  const DOM_SETTLE_DELAY_MS = 100;

  // Maximum z-index value for overlay (highest possible value for 32-bit signed integer)
  const MAX_OVERLAY_Z_INDEX = '2147483647';

  // Minimum content area dimension for valid overlay bounds (in pixels)
  const MIN_CONTENT_AREA_DIMENSION = 100;

  // Debounce delay for content observer checks (in milliseconds)
  const CONTENT_OBSERVER_DEBOUNCE_DELAY_MS = 500;

  /**
   * Regex pattern for escaping all regex metacharacters (including backslashes) in strings.
   * Used to safely include literal strings in dynamically constructed regular expressions.
   * @constant {RegExp}
   */
  const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;

  /**
   * Regex pattern for escaping regex metacharacters except asterisk (for wildcard patterns).
   * Asterisk (*) is preserved so it can be converted to .* for glob-style matching.
   * @constant {RegExp}
   */
  const REGEX_ESCAPE_PATTERN_KEEP_ASTERISK = /[.+?^${}()|[\]\\]/g;

  // ============================================
  // LogManager Class
  // ============================================

  /**
   * Log categories for different parts of the application.
   * @constant {Object}
   */
  const LOG_CATEGORIES = {
    TIMER: 'TIMER',
    SETTINGS: 'SETTINGS',
    MENU: 'MENU',
    OVERLAY: 'OVERLAY',
    WORKSPACE: 'WORKSPACE',
    SECURITY: 'SECURITY',
    INIT: 'INIT',
  };

  /**
   * Delay (in ms) before revoking the URL after export download starts.
   * Should be long enough to ensure download initiates but short enough to avoid memory leaks.
   * @constant {number}
   */
  const URL_REVOKE_DELAY_MS = 200;

  /**
   * Keys to filter out from logged data for security.
   * Only filters top-level object keys; nested sensitive data may still be logged.
   * If stricter filtering is needed, consider deep-scanning string values for patterns
   * or implementing a whitelist approach instead.
   * @constant {string[]}
   */
  const SENSITIVE_KEYS = ['password', 'code', 'secret', 'token', 'credential', 'auth'];

  /**
   * Selectors to try for workspace container for MutationObserver.
   * Order matters - earlier selectors are preferred.
   * @constant {string[]}
   */
  const WORKSPACE_CONTAINER_SELECTORS = [
    '#zen-workspace-button-container',
    '#zen-workspaces-button-container',
    '[id*="workspace"]',
    '#navigator-toolbox',
  ];

  /**
   * Selectors to try for content area to append overlay.
   * Order matters - earlier selectors are preferred.
   * '#tabbrowser-tabbox' is first as it contains all tab panels and works best
   * for properly covering browser content in Firefox/Zen browsers.
   * @constant {string[]}
   */
  const CONTENT_AREA_SELECTORS = [
    '#tabbrowser-tabbox',
    '#tabbrowser-tabpanels',
    '#appcontent',
    '#zen-main-view',
    '#browser',
    '#main-window',
  ];

  /**
   * LogManager class for comprehensive logging with export functionality.
   * Stores log entries in memory with timestamps and provides export capabilities.
   */
  class LogManager {
    /**
     * Create a LogManager instance.
     * @param {number} maxLogSize - Maximum number of log entries to store (default: 1000)
     */
    constructor(maxLogSize = 1000) {
      this.logs = [];
      this.maxLogSize = maxLogSize;
    }

    /**
     * Log an entry with category, message, and optional data.
     * @param {string} category - Log category (e.g., 'TIMER', 'SETTINGS')
     * @param {string} message - Log message
     * @param {Object} [data] - Optional additional data (sensitive data will be filtered)
     */
    log(category, message, data = null) {
      const entry = {
        timestamp: new Date().toISOString(),
        category: category || 'GENERAL',
        message: message,
      };

      // Filter out sensitive data before logging
      // Note: This only filters top-level sensitive keys and may not catch nested sensitive data patterns
      if (data !== null && data !== undefined) {
        entry.data = this._sanitizeData(data);
      }

      this.logs.push(entry);

      // Enforce max log size by removing oldest entries
      if (this.logs.length > this.maxLogSize) {
        this.logs.shift();
      }

      // Also output to console for real-time debugging
      const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
      console.log(`[Zen Pomodoro][${category}] ${message}${dataStr}`);
    }

    /**
     * Sanitize data to remove sensitive information.
     * @param {*} data - Data to sanitize
     * @returns {*} Sanitized data
     * @private
     */
    // NOTE: Cyclomatic complexity (cc=9) is acceptable for this recursive sanitization logic
    // that handles multiple data types (null, primitive, array, object) and sensitive key filtering
    _sanitizeData(data) {
      if (data === null || data === undefined) {
        return data;
      }

      // Handle primitive types
      if (typeof data !== 'object') {
        return data;
      }

      // Handle arrays
      if (Array.isArray(data)) {
        return data.map((item) => this._sanitizeData(item));
      }

      // Handle objects - filter out sensitive keys using module-level constant
      const sanitized = {};

      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));

        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this._sanitizeData(value);
        } else {
          sanitized[key] = value;
        }
      }

      return sanitized;
    }

    /**
     * Get all stored log entries.
     * @returns {Array} Array of log entries
     */
    getLogs() {
      return [...this.logs];
    }

    /**
     * Clear all stored log entries.
     */
    clearLogs() {
      this.logs = [];
      console.log('[Zen Pomodoro][LOGGER] Logs cleared');
    }

    /**
     * Export logs as a downloadable JSON file.
     * Creates a Blob with JSON data and triggers a download.
     */
    exportLogs() {
      // Log the export event before creating export data for accurate count
      this.log(LOG_CATEGORIES.SETTINGS, 'Logs exported', { entryCount: this.logs.length });

      const exportData = {
        exportedAt: new Date().toISOString(),
        totalEntries: this.logs.length,
        logs: this.logs,
      };

      const data = JSON.stringify(exportData, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zen-pomodoro-logs-${Date.now()}.json`;
      a.click();

      // Revoke URL after a brief delay to ensure download has started
      setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);
    }
  }

  // Create global logger instance
  const logger = new LogManager(1000);

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Get preference from Firefox Services
   */
  function getPref(key, defaultValue) {
    const prefKey = `${PREF_PREFIX}.${key}`;
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
   */
  function setPref(key, value) {
    const prefKey = `${PREF_PREFIX}.${key}`;
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
   * Get configuration object from preferences
   */
  function getConfig() {
    // Start with default config
    let config = { ...DEFAULT_CONFIG };

    // Load from stored JSON config (legacy support)
    const configStr = getPref('config', null);
    if (configStr) {
      try {
        const storedConfig = JSON.parse(configStr);
        config = { ...config, ...storedConfig };
      } catch (e) {
        console.error('Failed to parse config:', e);
      }
    }

    // Override with individual preferences if set
    // Only keyboardShortcut and enableNotifications are in preferences.json now
    const enableNotifications = getPref('enableNotifications', null);
    if (enableNotifications !== null) {
      // Sine checkbox preferences normally return a boolean. The string check ('true')
      // is kept for robustness/legacy cases where values may have been stored as strings.
      config.enableNotifications = enableNotifications === true || enableNotifications === 'true';
    }

    // Keyboard shortcut
    const keyboardShortcut = getPref('keyboardShortcut', null);
    if (keyboardShortcut !== null && keyboardShortcut !== '') {
      config.keyboardShortcut = keyboardShortcut;
    }

    return config;
  }

  /**
   * Save configuration object to preferences
   */
  function saveConfig(config) {
    try {
      setPref('config', JSON.stringify(config));
      logger.log(LOG_CATEGORIES.SETTINGS, 'Configuration saved', {
        timerMode: config.timerMode,
        focusDuration: config.focusDuration,
        breakDuration: config.breakDuration,
        cycles: config.cycles,
        blockedWorkspacesCount: config.blockedWorkspaces?.length || 0,
      });
    } catch (e) {
      logger.log(LOG_CATEGORIES.SETTINGS, 'Failed to save config', { error: e.message });
      console.error('Failed to save config:', e);
    }
  }

  /**
   * Format time in MM:SS format
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Issue 8: Setup drag functionality for dialogs
   * Makes a dialog draggable by its header (h2 element).
   * The dialog can be moved within the viewport boundaries.
   *
   * @param {HTMLElement} dialog - The dialog element to make draggable.
   *                               Must contain an h2 element as the drag handle.
   * @returns {void}
   *
   * @example
   * const dialog = document.createElement('div');
   * dialog.className = 'zen-pomodoro-dialog active';
   * // ... add h2 and other content ...
   * document.documentElement.appendChild(dialog);
   * setupDialogDrag(dialog);
   */
  function setupDialogDrag(dialog) {
    const header = dialog.querySelector('h2');
    if (!header) {
      console.warn(
        '[ZenPomodoro] setupDialogDrag: No h2 found in dialog',
        dialog?.id || dialog?.tagName || 'unknown'
      );
      return;
    }

    // Mark header as drag handle for debugging and styling
    header.setAttribute('data-drag-handle', 'true');

    // Ensure h2 can receive pointer events and has proper cursor
    header.style.cursor = 'move';
    header.style.userSelect = 'none';
    header.style.pointerEvents = 'auto';

    let isDragging = false;
    let startX, startY;
    let startLeft, startTop;
    let dialogWidth, dialogHeight;

    // Helper to get client coordinates from mouse or touch event
    const getClientCoords = (e) => {
      // Use type checking for more robust touch detection
      if (e.type && e.type.startsWith('touch') && e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    };

    // Clean up function to remove document-level listeners
    const cleanupDrag = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      isDragging = false;
    };

    const startDrag = (e) => {
      // For mouse events, only start drag on left mouse button
      if (e.type === 'mousedown' && e.button !== 0) return;

      e.preventDefault();
      isDragging = true;

      const rect = dialog.getBoundingClientRect();
      const coords = getClientCoords(e);
      startX = coords.x;
      startY = coords.y;

      // Convert from CSS centering (transform + percentage top/left) to absolute pixel positioning
      // Store the actual position from getBoundingClientRect before making changes
      const actualLeft = rect.left;
      const actualTop = rect.top;

      // Clear transform-based centering if present
      const computedStyle = window.getComputedStyle(dialog);
      if (computedStyle.transform !== 'none') {
        dialog.style.transform = 'none';
      }

      // Always set position to fixed and use pixel values to override CSS percentage positioning
      dialog.style.position = 'fixed';
      dialog.style.left = `${actualLeft}px`;
      dialog.style.top = `${actualTop}px`;

      startLeft = actualLeft;
      startTop = actualTop;
      dialogWidth = rect.width;
      dialogHeight = rect.height;

      dialog.classList.add('dragging');
      header.style.cursor = 'grabbing';

      // Add document-level event listeners for drag tracking
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    };

    const onMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      const coords = getClientCoords(e);
      const deltaX = coords.x - startX;
      const deltaY = coords.y - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Keep within viewport boundaries
      const maxX = window.innerWidth - dialogWidth;
      const maxY = window.innerHeight - dialogHeight;

      if (maxX >= 0) {
        newLeft = Math.max(0, Math.min(newLeft, maxX));
      } else {
        // Dialog wider than viewport: allow negative positions but ensure some part stays visible
        const overflowX = dialogWidth - window.innerWidth;
        const minLeft = -overflowX;
        const maxLeftVal = 0;
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeftVal));
      }

      if (maxY >= 0) {
        newTop = Math.max(0, Math.min(newTop, maxY));
      } else {
        // Dialog taller than viewport
        const overflowY = dialogHeight - window.innerHeight;
        const minTop = -overflowY;
        const maxTopVal = 0;
        newTop = Math.max(minTop, Math.min(newTop, maxTopVal));
      }

      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
    };

    const onEnd = () => {
      if (!isDragging) return;

      isDragging = false;
      dialog.classList.remove('dragging');
      header.style.cursor = 'move';

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    // Add event listeners to header for both mouse and touch
    // Note: Not using capture phase as it can interfere with event handling in Firefox/Zen
    header.addEventListener('mousedown', startDrag);
    header.addEventListener('touchstart', startDrag, { passive: false });

    // Store references for cleanup
    dialog._dragStartHandler = startDrag;
    dialog._dragHeader = header;

    // Use MutationObserver to clean up when dialog is removed from DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode === dialog) {
            cleanupDrag();
            header.removeEventListener('mousedown', startDrag);
            header.removeEventListener('touchstart', startDrag);
            observer.disconnect();
            return;
          }
        }
      }
    });

    // Observe a stable ancestor (documentElement) to ensure observer always sees dialog removal
    const targetNode = dialog.ownerDocument && dialog.ownerDocument.documentElement;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    } else if (dialog.parentNode) {
      observer.observe(dialog.parentNode, { childList: true, subtree: false });
    }
  }

  /**
   * Generate cryptographically secure random code for settings lock
   * SECURITY FIX: Uses crypto.getRandomValues() instead of Math.random()
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
   * Validate integer input with min/max bounds
   * LOGIC FIX: Input validation for settings
   */
  function validateIntegerInput(value, min, max, defaultValue) {
    const parsed = parseInt(value, 10);
    const isValidNumber = !isNaN(parsed);
    const isInRange = parsed >= min && parsed <= max;

    return isValidNumber && isInRange ? parsed : defaultValue;
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
   * Attribute names to check for workspace name, in priority order.
   * @constant {string[]}
   */
  const WORKSPACE_NAME_ATTRIBUTES = [
    'data-workspace-name',
    'data-name',
    'label',
    'tooltiptext',
    'aria-label',
    'title',
  ];

  /**
   * Extract workspace name from a DOM button element.
   * Tries multiple attributes in priority order.
   * @param {Element} btn - The button element
   * @param {string} id - The workspace ID (for fallback name)
   * @returns {string} The workspace name
   */
  function extractWorkspaceNameFromButton(btn, id) {
    // Try each attribute in priority order
    for (const attr of WORKSPACE_NAME_ATTRIBUTES) {
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
   * Check if a workspace name is valid (non-empty and not 'undefined').
   * @param {*} name - The name to check
   * @returns {boolean} True if valid
   */
  function isValidName(name) {
    return Boolean(name) && name !== 'undefined' && name !== '';
  }

  /**
   * Create a fallback workspace name from an ID.
   * @param {string} id - The workspace ID
   * @returns {string} Fallback name
   */
  function createFallbackWorkspaceName(id) {
    const idPrefix = id?.substring(0, 8) || 'Unknown';
    return `Workspace ${idPrefix}`;
  }

  /**
   * Get phase display label from phase identifier.
   * @param {string} phase - Phase identifier ('focus', 'break', 'long-break')
   * @returns {string} Human-readable phase label
   */
  function getPhaseLabel(phase) {
    const labels = {
      focus: 'Focus Period',
      break: 'Break Time',
      'long-break': 'Long Break',
    };
    return labels[phase] || 'Focus Period';
  }

  /**
   * Get short phase label for indicator.
   * @param {string} phase - Phase identifier
   * @returns {string} Short phase label
   */
  function getShortPhaseLabel(phase) {
    return phase === 'focus' ? 'Focus' : 'Break';
  }

  /**
   * Create a labeled input row for dialog forms.
   * @param {string} labelText - Label text
   * @param {string} inputId - Input element ID
   * @param {Object} inputAttrs - Input attributes (type, value, min, max)
   * @returns {HTMLElement} The row element
   */
  function createLabeledInputRow(labelText, inputId, inputAttrs = {}) {
    const row = document.createElement('div');
    row.className = 'zen-pomodoro-config-row';
    row.id = `${inputId}-row`;

    const label = document.createElement('label');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = inputAttrs.type || 'number';
    input.id = inputId;
    if (inputAttrs.value !== undefined) input.value = inputAttrs.value;
    if (inputAttrs.min !== undefined) input.min = inputAttrs.min;
    if (inputAttrs.max !== undefined) input.max = inputAttrs.max;

    row.appendChild(label);
    row.appendChild(input);

    return row;
  }

  /**
   * Create a labeled select row for dialog forms.
   * @param {string} labelText - Label text
   * @param {string} selectId - Select element ID
   * @param {Array<{value: string, text: string, selected?: boolean}>} options - Select options
   * @returns {{row: HTMLElement, select: HTMLSelectElement}} The row and select elements
   */
  function createLabeledSelectRow(labelText, selectId, options) {
    const row = document.createElement('div');
    row.className = 'zen-pomodoro-config-row';

    const label = document.createElement('label');
    label.textContent = labelText;

    const select = document.createElement('select');
    select.id = selectId;

    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.selected) option.selected = true;
      select.appendChild(option);
    });

    row.appendChild(label);
    row.appendChild(select);

    return { row, select };
  }

  /**
   * Helper to handle stop timer with lockout.
   * Reduces code duplication for stop timer logic.
   *
   * When timer is active, ALWAYS shows the lockout screen before allowing
   * the timer to be stopped. The lockout method (code entry or hold button)
   * is determined by the user's settingsLockActiveMethod configuration.
   *
   * When timer is not active, shows confirmation directly without lockout.
   *
   * @param {() => void} onStop - Callback to execute after successful stop confirmation
   */
  function handleStopTimerWithLockout(onStop) {
    if (!window.zenPomodoroApp) return;

    const timerActive = window.zenPomodoroApp.timer && window.zenPomodoroApp.timer.isActive;

    const showStopConfirmation = () => {
      window.zenPomodoroApp.showCustomConfirm(
        'Stop Timer',
        'Are you sure you want to stop the timer?',
        onStop
      );
    };

    // Issue 6: Always require lockout when stopping an active timer.
    // This prevents accidental or impulsive timer stops during focus sessions.
    // The lockout uses the user's configured settingsLockActiveMethod.
    if (timerActive) {
      window.zenPomodoroApp.security.showLockScreen(true, showStopConfirmation);
    } else {
      showStopConfirmation();
    }
  }

  // ============================================
  // Shared Blocker Utilities
  // ============================================

  /**
   * Create a shared progress listener for monitoring URL changes.
   * Used by both SineModBlocker and WebsiteBlocker.
   * @param {function} checkCallback - Callback to call on location change
   * @param {number} delayMs - Delay before calling callback
   * @returns {Object|null} Progress listener object or null on failure
   */
  function createProgressListener(checkCallback, delayMs) {
    try {
      return {
        QueryInterface: ChromeUtils.generateQI([
          'nsIWebProgressListener',
          'nsISupportsWeakReference',
        ]),

        // eslint-disable-next-line no-unused-vars
        onLocationChange: (webProgress, _request, _location) => {
          if (webProgress.isTopLevel) {
            setTimeout(checkCallback, delayMs);
          }
        },

        onStateChange: () => {},
        onProgressChange: () => {},
        onStatusChange: () => {},
        onSecurityChange: () => {},
        onContentBlockingEvent: () => {},
      };
    } catch (e) {
      logger.log(LOG_CATEGORIES.INIT, 'Failed to create progress listener', { error: e.message });
      return null;
    }
  }

  /**
   * Set up common gBrowser event listeners for URL monitoring.
   * @param {Object} context - The blocker instance (this)
   * @param {function} checkCallback - Callback to call on events
   * @param {number} delayMs - Delay for progress listener
   */
  function setupBrowserListeners(context, checkCallback, delayMs) {
    // Tab select listener
    context.tabSelectHandler = () => checkCallback();
    // eslint-disable-next-line no-undef
    if (typeof gBrowser !== 'undefined' && gBrowser.tabContainer) {
      // eslint-disable-next-line no-undef
      gBrowser.tabContainer.addEventListener('TabSelect', context.tabSelectHandler);
    }

    // Page show listener
    context.pageShowHandler = () => {
      setTimeout(checkCallback, delayMs);
    };
    // eslint-disable-next-line no-undef
    if (typeof gBrowser !== 'undefined') {
      // eslint-disable-next-line no-undef
      gBrowser.addEventListener('pageshow', context.pageShowHandler);
    }

    // Progress listener
    // eslint-disable-next-line no-undef
    if (typeof gBrowser !== 'undefined') {
      context.progressListener = createProgressListener(checkCallback, delayMs);
      if (context.progressListener) {
        try {
          // eslint-disable-next-line no-undef
          gBrowser.addProgressListener(context.progressListener);
        } catch (e) {
          logger.log(LOG_CATEGORIES.INIT, 'Failed to add progress listener', { error: e.message });
        }
      }
    }
  }

  /**
   * Remove gBrowser event listeners.
   * @param {Object} context - The blocker instance (this)
   */
  function removeBrowserListeners(context) {
    // eslint-disable-next-line no-undef
    if (typeof gBrowser === 'undefined') return;

    // eslint-disable-next-line no-undef
    if (context.tabSelectHandler && gBrowser.tabContainer) {
      // eslint-disable-next-line no-undef
      gBrowser.tabContainer.removeEventListener('TabSelect', context.tabSelectHandler);
    }

    if (context.pageShowHandler) {
      // eslint-disable-next-line no-undef
      gBrowser.removeEventListener('pageshow', context.pageShowHandler);
    }

    if (context.progressListener) {
      try {
        // eslint-disable-next-line no-undef
        gBrowser.removeProgressListener(context.progressListener);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Handle "Go Back" navigation for blocker overlays.
   * @param {function} hideBlockerCallback - Callback to hide the blocker
   * @param {number} delayMs - Delay before hiding blocker
   */
  function handleBlockerGoBack(hideBlockerCallback, delayMs) {
    try {
      // eslint-disable-next-line no-undef
      if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
        // eslint-disable-next-line no-undef
        const webNav = gBrowser.selectedBrowser.webNavigation;
        if (webNav && webNav.canGoBack) {
          webNav.goBack();
          setTimeout(hideBlockerCallback, delayMs);
          return;
        }
      }

      // Fallback: Navigate to about:blank
      // eslint-disable-next-line no-undef
      if (typeof gBrowser !== 'undefined') {
        // eslint-disable-next-line no-undef
        gBrowser.selectedBrowser.loadURI(Services.io.newURI('about:blank'), {
          triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}),
        });
        setTimeout(hideBlockerCallback, delayMs);
        return;
      }

      // Last resort: Just hide the blocker
      hideBlockerCallback();
    } catch (e) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Error navigating back', { error: e.message });
      hideBlockerCallback();
    }
  }

  // ============================================
  // Timer Engine Module
  // ============================================

  class PomodoroTimer {
    constructor() {
      this.isActive = false;
      this.isPaused = false;
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
    }

    /**
     * Start the countdown interval
     */
    startInterval() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      this.intervalId = setInterval(() => {
        if (!this.isPaused && this.isActive) {
          this.remainingTime--;

          if (this.onTick) {
            this.onTick(this.remainingTime, this.currentPhase, this.currentCycle, this.totalCycles);
          }

          if (this.remainingTime <= 0) {
            this.handlePhaseComplete();
          }

          // PERFORMANCE FIX: Save state every 10 seconds instead of every second
          this.tickCounter++;
          if (this.tickCounter >= SAVE_STATE_INTERVAL_SECONDS) {
            this.saveState();
            this.tickCounter = 0;
          }
        }
      }, 1000);
    }

    /**
     * Handle phase completion
     */
    handlePhaseComplete() {
      logger.log(LOG_CATEGORIES.TIMER, 'Phase complete', {
        phase: this.currentPhase,
        cycle: this.currentCycle,
        mode: this.mode,
      });

      if (this.mode === 'simple') {
        this.completeTimer();
        return;
      }

      // Pomodoro mode phase transitions
      const shouldComplete =
        this.currentPhase === 'focus'
          ? this._handleFocusPhaseComplete()
          : this._handleBreakPhaseComplete();

      if (shouldComplete) return;

      logger.log(LOG_CATEGORIES.TIMER, 'Phase changed', {
        newPhase: this.currentPhase,
        cycle: this.currentCycle,
        remainingTime: this.remainingTime,
      });

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
    }

    /**
     * Handle completion of a focus phase.
     * @returns {boolean} True if timer should complete, false to continue
     * @private
     */
    _handleFocusPhaseComplete() {
      const isLastCycle = this.currentCycle >= this.totalCycles;

      if (isLastCycle) {
        this.completeTimer();
        return true;
      }

      // Determine break type
      const isLongBreakCycle = this.currentCycle % this.config.longBreakInterval === 0;

      if (isLongBreakCycle) {
        this.currentPhase = 'long-break';
        this.remainingTime = this.config.longBreakDuration * 60;
      } else {
        this.currentPhase = 'break';
        this.remainingTime = this.config.breakDuration * 60;
      }

      return false;
    }

    /**
     * Handle completion of a break phase.
     * @returns {boolean} True if timer should complete, false to continue
     * @private
     */
    _handleBreakPhaseComplete() {
      this.currentCycle++;

      if (this.currentCycle > this.totalCycles) {
        this.completeTimer();
        return true;
      }

      // Start next focus period
      this.currentPhase = 'focus';
      this.remainingTime = this.config.focusDuration * 60;

      return false;
    }

    /**
     * Pause the timer
     */
    pause() {
      this.isPaused = true;
      logger.log(LOG_CATEGORIES.TIMER, 'Timer paused', {
        remainingTime: this.remainingTime,
        phase: this.currentPhase,
      });
      this.saveState();
    }

    /**
     * Resume the timer
     */
    resume() {
      this.isPaused = false;
      logger.log(LOG_CATEGORIES.TIMER, 'Timer resumed', {
        remainingTime: this.remainingTime,
        phase: this.currentPhase,
      });
      this.saveState();
    }

    /**
     * Stop the timer
     */
    stop() {
      logger.log(LOG_CATEGORIES.TIMER, 'Timer stopped', {
        wasActive: this.isActive,
        remainingTime: this.remainingTime,
        phase: this.currentPhase,
        cycle: this.currentCycle,
      });
      this.isActive = false;
      this.isPaused = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.savedConfig = null;
      this.clearState();
    }

    /**
     * Complete the timer
     * RENAMED: From 'complete' to 'completeTimer' for clarity
     */
    completeTimer() {
      logger.log(LOG_CATEGORIES.TIMER, 'Timer completed', {
        mode: this.mode,
        totalCycles: this.totalCycles,
      });
      this.stop();
      if (this.onComplete) {
        this.onComplete();
      }
    }

    /**
     * Save timer state to preferences with config
     * LOGIC FIX: Store config with timer state
     */
    saveState() {
      const state = {
        isActive: this.isActive,
        isPaused: this.isPaused,
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode,
        savedConfig: this.savedConfig, // Store config with state
      };
      setPref('timer-state', JSON.stringify(state));
    }

    /**
     * Load timer state from preferences
     * LOGIC FIX: Restore config from saved state
     */
    loadState() {
      const stateStr = getPref('timer-state', null);
      if (stateStr) {
        try {
          const state = JSON.parse(stateStr);
          if (state.isActive) {
            this.isActive = state.isActive;
            this.isPaused = state.isPaused;
            this.remainingTime = state.remainingTime;
            this.currentPhase = state.currentPhase;
            this.currentCycle = state.currentCycle;
            this.totalCycles = state.totalCycles;
            this.mode = state.mode;

            // Restore saved config
            if (state.savedConfig) {
              this.savedConfig = state.savedConfig;
              this.config = state.savedConfig;
            }

            if (!this.isPaused) {
              this.startInterval();
            }

            return true;
          }
        } catch (e) {
          console.error('Failed to load timer state:', e);
        }
      }
      return false;
    }

    /**
     * Clear timer state from preferences
     */
    clearState() {
      setPref('timer-state', '');
    }

    /**
     * Get current timer status
     */
    getStatus() {
      return {
        isActive: this.isActive,
        isPaused: this.isPaused,
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode,
      };
    }
  }

  // ============================================
  // Workspace Detector Module
  // ============================================

  class WorkspaceDetector {
    constructor() {
      this.activeWorkspace = null;
      this.config = getConfig();
      this.onWorkspaceChange = null;
      this.workspaceObserver = null; // Store observer for cleanup
      this.validatedWorkspaces = null; // Cache validated workspace list
      this.needsValidation = true; // Flag to track if validation is needed
    }

    /**
     * Get the currently active workspace
     */
    getActiveWorkspace() {
      try {
        const activeButton = document.querySelector(
          'toolbarbutton[zen-workspace-id][active="true"]'
        );
        if (activeButton) {
          return activeButton.getAttribute('zen-workspace-id');
        }
      } catch (e) {
        console.error('Failed to get active workspace:', e);
      }
      return null;
    }

    /**
     * Validate and clean up deleted workspaces from blocked list
     * Only called when workspace changes are detected
     */
    validateBlockedWorkspaces() {
      if (!this.needsValidation) {
        return;
      }

      const existingWorkspaces = this.getAllWorkspaces();
      const existingWorkspaceIds = existingWorkspaces.map((ws) => ws.id);
      const originalLength = this.config.blockedWorkspaces.length;

      // Filter out deleted workspaces
      this.config.blockedWorkspaces = this.config.blockedWorkspaces.filter((wsId) =>
        existingWorkspaceIds.includes(wsId)
      );

      // Save config only if we removed any deleted workspaces
      if (this.config.blockedWorkspaces.length !== originalLength) {
        console.log('Removed deleted workspaces from blocked list');
        saveConfig(this.config);
      }

      this.validatedWorkspaces = [...this.config.blockedWorkspaces];
      this.needsValidation = false;
    }

    /**
     * Check if current workspace is blocked
     * PERFORMANCE FIX: Validation only runs on workspace change, not every call
     */
    isCurrentWorkspaceBlocked() {
      // Reload config to get latest blocked workspaces
      this.config = getConfig();

      const activeWorkspace = this.getActiveWorkspace();
      if (!activeWorkspace) {
        return false;
      }

      const isBlocked = this.config.blockedWorkspaces.includes(activeWorkspace);
      logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace blocked check', {
        workspaceId: activeWorkspace,
        isBlocked: isBlocked,
        blockedCount: this.config.blockedWorkspaces.length,
      });
      return isBlocked;
    }

    /**
     * Handle workspace mutation observer callback
     * @private
     */
    _handleWorkspaceMutation() {
      const newWorkspace = this.getActiveWorkspace();
      if (newWorkspace === this.activeWorkspace) return;

      this.activeWorkspace = newWorkspace;
      this.needsValidation = true;
      this.validateBlockedWorkspaces();

      if (this.onWorkspaceChange) {
        this.onWorkspaceChange(newWorkspace, this.isCurrentWorkspaceBlocked());
      }
    }

    /**
     * Start monitoring workspace changes
     * MEMORY LEAK FIX: Store observer for cleanup
     * PERFORMANCE FIX: Validate workspaces on change, not on every check
     */
    startMonitoring() {
      this.activeWorkspace = this.getActiveWorkspace();

      // Clean up existing observer if any
      if (this.workspaceObserver) {
        this.workspaceObserver.disconnect();
      }

      // Use MutationObserver to detect workspace changes
      // PERFORMANCE FIX: Use attributeFilter to only observe 'active' attribute changes
      this.workspaceObserver = new MutationObserver(() => this._handleWorkspaceMutation());

      // Try multiple containers for more reliable detection
      // NOTE: We use a for-loop with early break instead of combined selector string
      // (document.querySelector('sel1, sel2, sel3')) because we want to find the FIRST
      // valid element in priority order defined by WORKSPACE_CONTAINER_SELECTORS.
      // A combined selector returns the first DOM element matching ANY selector,
      // not respecting our preference order.
      let workspaceContainer = null;
      for (const selector of WORKSPACE_CONTAINER_SELECTORS) {
        const element = document.querySelector(selector);
        if (element) {
          workspaceContainer = element;
          break;
        }
      }

      // Set up observer on the workspace container if found
      if (workspaceContainer) {
        this.workspaceObserver.observe(workspaceContainer, {
          attributes: true,
          attributeFilter: ['active', 'selected', 'zen-workspace-id'],
          subtree: true,
          childList: true,
        });
      } else {
        console.warn('[Pomodoro Focus Blocker] No workspace container found for monitoring');
      }
    }

    /**
     * Stop monitoring and cleanup
     * MEMORY LEAK FIX: Disconnect observer
     */
    stopMonitoring() {
      if (this.workspaceObserver) {
        this.workspaceObserver.disconnect();
        this.workspaceObserver = null;
      }
    }

    /**
     * Get all available workspaces
     * Uses multiple methods to retrieve workspace names:
     * 1. Try to get from ZenWorkspaces API (multiple possible APIs)
     * 2. Fall back to DOM attributes (label, tooltiptext, aria-label)
     * 3. Try to extract from workspace panel if available
     */
    getAllWorkspaces() {
      try {
        // Method 1: Try ZenWorkspaces API (most reliable)
        const zenResult = this._tryZenWorkspacesApi();
        if (zenResult) return zenResult;

        // Method 2: Try legacy gZenWorkspaces API
        const legacyResult = this._tryLegacyWorkspacesApi();
        if (legacyResult) return legacyResult;

        // Method 3: Query DOM buttons
        const domResult = this._tryDomWorkspaceButtons();
        if (domResult) return domResult;

        // Method 4: Try workspace container elements
        const containerResult = this._tryWorkspaceContainer();
        if (containerResult) return containerResult;

        console.log('Zen Pomodoro: No workspaces found');
        return [];
      } catch (e) {
        console.error('Failed to get workspaces:', e);
        return [];
      }
    }

    /**
     * Try to get workspaces from ZenWorkspaces API.
     * @returns {Array|null} Workspaces array or null if not available
     * @private
     */
    _tryZenWorkspacesApi() {
      // eslint-disable-next-line no-undef
      if (typeof ZenWorkspaces === 'undefined') return null;

      // eslint-disable-next-line no-undef
      const workspaces = this._getWorkspacesFromObject(ZenWorkspaces);

      if (isValidWorkspaceArray(workspaces)) {
        console.log('Zen Pomodoro: Got workspaces from ZenWorkspaces API');
        return formatWorkspacesFromApi(workspaces);
      }
      return null;
    }

    /**
     * Try to get workspaces from legacy gZenWorkspaces API.
     * @returns {Array|null} Workspaces array or null if not available
     * @private
     */
    _tryLegacyWorkspacesApi() {
      // eslint-disable-next-line no-undef
      if (typeof gZenWorkspaces === 'undefined') return null;

      // eslint-disable-next-line no-undef
      const workspaces = this._getWorkspacesFromObject(gZenWorkspaces);

      if (isValidWorkspaceArray(workspaces)) {
        console.log('Zen Pomodoro: Got workspaces from gZenWorkspaces API');
        return formatWorkspacesFromApi(workspaces);
      }
      return null;
    }

    /**
     * Extract workspaces from a workspace API object.
     * Tries multiple property/method names.
     * @param {Object} wsObject - The workspace API object
     * @returns {Array|null} Workspaces array or null
     * @private
     */
    _getWorkspacesFromObject(wsObject) {
      if (typeof wsObject.getWorkspaces === 'function') {
        return wsObject.getWorkspaces();
      }
      if (wsObject._workspaces !== undefined) {
        return wsObject._workspaces;
      }
      if (wsObject.workspaces !== undefined) {
        return wsObject.workspaces;
      }
      return null;
    }

    /**
     * Try to get workspaces from DOM toolbar buttons.
     * @returns {Array|null} Workspaces array or null if none found
     * @private
     */
    _tryDomWorkspaceButtons() {
      const buttons = document.querySelectorAll('toolbarbutton[zen-workspace-id]');
      if (buttons.length === 0) return null;

      console.log(`Zen Pomodoro: Got ${buttons.length} workspaces from DOM`);
      return Array.from(buttons).map((btn) => {
        const id = btn.getAttribute('zen-workspace-id');
        return { id, name: extractWorkspaceNameFromButton(btn, id) };
      });
    }

    /**
     * Try to get workspaces from container elements.
     * @returns {Array|null} Workspaces array or null if none found
     * @private
     */
    _tryWorkspaceContainer() {
      const container = document.querySelector(
        '#zen-workspaces-button-container, #zen-workspace-button-container, [id*="workspace"]'
      );
      if (!container) return null;

      const items = container.querySelectorAll('[zen-workspace-id], [data-workspace-id]');
      if (items.length === 0) return null;

      console.log(`Zen Pomodoro: Got ${items.length} workspaces from container`);
      return Array.from(items).map((item) => {
        const id = item.getAttribute('zen-workspace-id') || item.getAttribute('data-workspace-id');
        const name =
          item.getAttribute('label') ||
          item.getAttribute('data-name') ||
          item.textContent?.trim() ||
          `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
        return { id, name };
      });
    }
  }

  // ============================================
  // Overlay Manager Module
  // ============================================

  class OverlayManager {
    constructor() {
      this.overlay = null;
      this.indicator = null;
      this.config = getConfig();
      this.isVisible = false;
      this.contentAreaObserver = null; // Issue 1: Observer for content area size changes
      this.indicatorWidth = 0; // Cached indicator width for drag operations
      this.indicatorHeight = 0; // Cached indicator height for drag operations
      this.indicatorMouseDownHandler = null; // Store for cleanup
      this.contentArea = null; // Reference to content area element for bounds calculation and cleanup
      this._overlayUpdateScheduled = false; // Debounce flag for ResizeObserver
    }

    /**
     * Create the overlay content container with phase label, timer display, etc.
     * @returns {HTMLElement} The content container element
     * @private
     */
    _createOverlayContent() {
      const content = document.createElement('div');
      content.id = 'zen-pomodoro-content';

      // Phase label
      const phaseLabel = document.createElement('div');
      phaseLabel.id = 'zen-pomodoro-phase-label';
      phaseLabel.textContent = 'Focus Period';

      // Timer display
      const timerDisplay = document.createElement('div');
      timerDisplay.id = 'zen-pomodoro-timer-display';
      timerDisplay.textContent = '25:00';

      // Cycle progress - hidden initially, only shown for pomodoro mode
      const cycleProgress = document.createElement('div');
      cycleProgress.id = 'zen-pomodoro-cycle-progress';
      const timerMode = window.zenPomodoroApp?.timer?.mode;
      // Only show cycle progress for pomodoro mode (not simple mode or undefined)
      if (timerMode === 'pomodoro') {
        // Use configured cycle count instead of hardcoded value
        const totalCycles = this.config.cycles || 4;
        cycleProgress.textContent = `Cycle 1 of ${totalCycles}`;
      } else {
        // Hide for simple mode or when timer mode is not yet set
        cycleProgress.style.display = 'none';
      }

      // Motivational message - SECURITY FIX: Use textContent
      const message = document.createElement('div');
      message.id = 'zen-pomodoro-message';
      message.textContent = sanitizeText(this.config.motivationalMessage);

      // Controls
      const controls = this._createOverlayControls();

      content.appendChild(phaseLabel);
      content.appendChild(timerDisplay);
      content.appendChild(cycleProgress);
      content.appendChild(message);
      content.appendChild(controls);

      return content;
    }

    /**
     * Create the overlay controls section with buttons
     * @returns {HTMLElement} The controls container element
     * @private
     */
    _createOverlayControls() {
      const controls = document.createElement('div');
      controls.id = 'zen-pomodoro-controls';

      const pauseButton = document.createElement('button');
      pauseButton.className = 'zen-pomodoro-button';
      pauseButton.id = 'zen-pomodoro-pause-button';
      pauseButton.textContent = 'Pause';

      const stopButton = document.createElement('button');
      stopButton.className = 'zen-pomodoro-button';
      stopButton.id = 'zen-pomodoro-stop-button';
      stopButton.textContent = 'Stop Timer';

      controls.appendChild(pauseButton);
      controls.appendChild(stopButton);

      return controls;
    }

    /**
     * Create the persistent indicator element
     * @private
     */
    _createIndicator() {
      this.indicator = document.createElement('div');
      this.indicator.id = 'zen-pomodoro-indicator';

      const indicatorDot = document.createElement('div');
      indicatorDot.id = 'zen-pomodoro-indicator-dot';

      const indicatorText = document.createElement('span');
      indicatorText.id = 'zen-pomodoro-indicator-text';
      indicatorText.textContent = 'Focus: 25:00';

      this.indicator.appendChild(indicatorDot);
      this.indicator.appendChild(indicatorText);
    }

    /**
     * Attach overlay to content area or use fallback positioning.
     * Uses fixed positioning with explicit pixel bounds to properly cover browser content.
     * This approach ensures the overlay blocks interaction with web content
     * by positioning it above the browser rendering layer.
     * @private
     */
    _attachOverlayToContentArea() {
      // Issue 1: Position overlay within content area instead of full window
      // Try multiple Zen Browser and Firefox specific selectors
      // NOTE: We use a for-loop with early break instead of combined selector string
      // (document.querySelector('sel1, sel2, sel3')) because:
      // 1. We want to find the FIRST valid element in priority order defined by CONTENT_AREA_SELECTORS
      // 2. We need to know WHICH selector matched for logging/debugging purposes
      // A combined selector returns the first DOM element matching ANY selector,
      // not respecting our preference order and without indicating which selector matched.
      let contentArea = null;
      let usedSelector = null;

      for (const selector of CONTENT_AREA_SELECTORS) {
        const element = document.querySelector(selector);
        if (element) {
          contentArea = element;
          usedSelector = selector;
          break;
        }
      }

      // Use fixed positioning with explicit bounds to properly cover browser content
      // This ensures the overlay appears ABOVE web content rendered in the browser
      this.overlay.style.position = 'fixed';
      this.overlay.style.zIndex = MAX_OVERLAY_Z_INDEX;
      this.overlay.style.pointerEvents = 'all';
      this.overlay.style.boxSizing = 'border-box';

      if (contentArea) {
        // Store reference for cleanup and bounds updates
        this.contentArea = contentArea;

        // Calculate and set explicit bounds from content area
        this.updateOverlayBounds();

        // Append to document root to ensure it's above all browser chrome
        document.documentElement.appendChild(this.overlay);

        logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay attached with fixed positioning', {
          selector: usedSelector || 'unknown',
          bounds: this._getContentAreaBounds(),
        });

        // Set up observer for content area size changes
        this.setupContentAreaObserver(contentArea);
      } else {
        // Fallback: Use viewport dimensions
        logger.log(
          LOG_CATEGORIES.OVERLAY,
          'Warning: No content area found, using viewport fallback'
        );

        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100vw';
        this.overlay.style.height = '100vh';

        document.documentElement.appendChild(this.overlay);
      }
    }

    /**
     * Update overlay bounds to match content area position and size.
     * Uses explicit pixel values from getBoundingClientRect() to ensure
     * the overlay properly covers the browser content area.
     *
     * Note: This method is called from debounced resize observer callbacks
     * via the chain: _scheduleOverlayUpdate() → updateOverlayPosition() → updateOverlayBounds().
     * The debouncing mechanism uses requestAnimationFrame to batch layout
     * calculations and avoid performance issues during rapid resize events.
     */
    updateOverlayBounds() {
      if (!this.overlay || !this.contentArea) return;

      const rect = this.contentArea.getBoundingClientRect();

      // Validate bounds to ensure they are reasonable
      // Use the module constant for minimum dimension to prevent invisible overlays
      if (rect.width < MIN_CONTENT_AREA_DIMENSION || rect.height < MIN_CONTENT_AREA_DIMENSION) {
        logger.log(
          LOG_CATEGORIES.OVERLAY,
          'Warning: Content area bounds too small, using fallback',
          {
            width: rect.width,
            height: rect.height,
          }
        );
        // Fall back to viewport dimensions
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100vw';
        this.overlay.style.height = '100vh';
        return;
      }

      this.overlay.style.top = `${rect.top}px`;
      this.overlay.style.left = `${rect.left}px`;
      this.overlay.style.width = `${rect.width}px`;
      this.overlay.style.height = `${rect.height}px`;

      logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay bounds updated', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }

    /**
     * Get current content area bounds for logging.
     * @returns {Object|null} Bounds object or null if no content area
     * @private
     */
    _getContentAreaBounds() {
      if (!this.contentArea) return null;
      const rect = this.contentArea.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }

    /**
     * Create overlay elements
     * SECURITY FIX: Use textContent instead of innerHTML for user content
     */
    createOverlay() {
      if (this.overlay) return;

      // Main overlay
      this.overlay = document.createElement('div');
      this.overlay.id = 'zen-pomodoro-overlay';

      // Create and append content
      const content = this._createOverlayContent();
      this.overlay.appendChild(content);

      // Create persistent indicator
      this._createIndicator();

      // Attach overlay to content area
      this._attachOverlayToContentArea();

      document.documentElement.appendChild(this.indicator);

      // Issue 8: Set up drag functionality for indicator
      this.setupIndicatorDrag();

      // Set up button handlers after elements are created
      // RACE CONDITION FIX: Set up handlers immediately after creation
      this.setupOverlayHandlers();
    }

    /**
     * Issue 1: Set up observer for content area size changes
     * Watches for size/position changes when sidebars are toggled or resized
     */
    setupContentAreaObserver(contentArea) {
      this._cleanupContentAreaObserver();

      const browser = document.querySelector('#browser');

      this.contentAreaObserver = new ResizeObserver((entries) => {
        if (this._shouldUpdateOverlay(entries, contentArea, browser)) {
          this._scheduleOverlayUpdate(contentArea);
        }
      });

      this.contentAreaObserver.observe(contentArea);

      if (browser && browser !== contentArea) {
        this.contentAreaObserver.observe(browser);
      }

      this.updateOverlayPosition(contentArea);
    }

    /**
     * Clean up existing content area observer.
     * @private
     */
    _cleanupContentAreaObserver() {
      if (this.contentAreaObserver) {
        this.contentAreaObserver.disconnect();
        this.contentAreaObserver = null;
      }
    }

    /**
     * Check if overlay should be updated based on resize entries.
     * @param {ResizeObserverEntry[]} entries - Resize observer entries
     * @param {Element} contentArea - The content area element
     * @param {Element|null} browser - The browser element
     * @returns {boolean} True if overlay should update
     * @private
     */
    _shouldUpdateOverlay(entries, contentArea, browser) {
      return entries.some(
        (entry) => entry.target === contentArea || (browser && entry.target === browser)
      );
    }

    /**
     * Schedule a debounced overlay position update.
     * @param {Element} contentArea - The content area element
     * @private
     */
    _scheduleOverlayUpdate(contentArea) {
      if (this._overlayUpdateScheduled) return;

      this._overlayUpdateScheduled = true;
      requestAnimationFrame(() => {
        this._overlayUpdateScheduled = false;
        this.updateOverlayPosition(contentArea);
      });
    }

    /**
     * Issue 1: Update overlay position to match content area.
     * Ensures the overlay continues to cover the visible content area when it resizes.
     * Now delegates to updateOverlayBounds() for fixed positioning with explicit pixel values.
     *
     * Note: This method updates this.contentArea to the passed parameter to ensure
     * bounds are always calculated for the correct element.
     *
     * @param {Element} contentArea - The content area element to match bounds to
     */
    updateOverlayPosition(contentArea) {
      if (!this.overlay || !contentArea) {
        return;
      }

      // Always update content area reference to use the passed parameter
      // This ensures bounds are calculated for the correct element
      this.contentArea = contentArea;

      // Update bounds using fixed positioning with explicit pixel values
      this.updateOverlayBounds();
    }

    /**
     * Issue 8: Set up drag functionality for indicator
     */
    setupIndicatorDrag() {
      if (!this.indicator) return;

      let isDragging = false;
      let startX, startY;
      let startLeft, startTop;

      // Load saved position from preferences and validate against viewport bounds
      const savedPosX = getPref('indicatorPosX', null);
      const savedPosY = getPref('indicatorPosY', null);
      if (savedPosX !== null && savedPosY !== null) {
        // Ensure saved position is within current viewport bounds
        const rect = this.indicator.getBoundingClientRect();
        const indicatorWidth = rect.width;
        const indicatorHeight = rect.height;

        const rawX = Number(savedPosX);
        const rawY = Number(savedPosY);

        if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
          const maxX = Math.max(0, window.innerWidth - indicatorWidth);
          const maxY = Math.max(0, window.innerHeight - indicatorHeight);

          const clampedX = Math.max(0, Math.min(rawX, maxX));
          const clampedY = Math.max(0, Math.min(rawY, maxY));

          this.indicator.style.right = 'auto';
          this.indicator.style.left = `${clampedX}px`;
          this.indicator.style.top = `${clampedY}px`;
        }
      }

      const onMouseDown = (e) => {
        // Only start drag on left mouse button
        if (e.button !== 0) return;

        e.preventDefault();
        isDragging = true;

        const rect = this.indicator.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        // Cache dimensions at start of drag to avoid repeated getBoundingClientRect calls
        this.indicatorWidth = rect.width;
        this.indicatorHeight = rect.height;

        this.indicator.style.cursor = 'grabbing';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;

        // Keep within viewport boundaries using cached dimensions
        const maxX = window.innerWidth - this.indicatorWidth;
        const maxY = window.innerHeight - this.indicatorHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));

        // Use left positioning instead of right
        this.indicator.style.right = 'auto';
        this.indicator.style.left = `${newLeft}px`;
        this.indicator.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        if (!isDragging) return;

        isDragging = false;
        this.indicator.style.cursor = '';

        // Save position to preferences
        const rect = this.indicator.getBoundingClientRect();
        setPref('indicatorPosX', Math.round(rect.left));
        setPref('indicatorPosY', Math.round(rect.top));

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      // Store reference for cleanup
      this.indicatorMouseDownHandler = onMouseDown;
      this.indicator.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Set up overlay button handlers
     * RACE CONDITION FIX: Called immediately after overlay creation
     */
    setupOverlayHandlers() {
      const pauseButton = this.overlay?.querySelector('#zen-pomodoro-pause-button');
      const stopButton = this.overlay?.querySelector('#zen-pomodoro-stop-button');

      if (pauseButton) {
        pauseButton.addEventListener('click', () => {
          if (window.zenPomodoroApp && window.zenPomodoroApp.timer) {
            if (window.zenPomodoroApp.timer.isPaused) {
              window.zenPomodoroApp.timer.resume();
              pauseButton.textContent = 'Pause';
            } else {
              window.zenPomodoroApp.timer.pause();
              pauseButton.textContent = 'Resume';
            }
          }
        });
      }

      if (stopButton) {
        stopButton.addEventListener('click', () => {
          // Issue 6: Require lockout before stopping timer using helper function
          handleStopTimerWithLockout(() => {
            window.zenPomodoroApp.stopTimer();
          });
        });
      }
    }

    /**
     * Show overlay
     *
     * FLICKERING FIX (Issue 2): The overlay was flickering because the CSS animation
     * was re-triggering every second when updateOverlayVisibility() called show().
     *
     * Solution: Use two-class approach:
     * 1. 'active' class controls display (flex/none)
     * 2. 'zen-pomodoro-animate-in' class triggers the fade-in animation
     *
     * CSS selector requires BOTH classes: .active.zen-pomodoro-animate-in
     * This ensures animation only runs once when overlay first appears.
     * The animation class is removed in hide() so it can re-trigger next time.
     */
    show(phase = 'focus') {
      if (!this.overlay) this.createOverlay();

      // Only add classes and trigger animation if not already showing
      if (!this.isVisible) {
        logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay shown', { phase: phase });
        this.overlay.classList.add('active');
        // Animation class triggers CSS animation (removed in hide() for re-trigger)
        this.overlay.classList.add('zen-pomodoro-animate-in');

        // Re-setup ResizeObserver if content area exists (was disconnected in hide())
        if (this.contentArea) {
          this.setupContentAreaObserver(this.contentArea);
        }

        // Update overlay bounds to ensure proper positioning
        this.updateOverlayBounds();

        // Backup: Apply inline styles to ensure visibility
        this.overlay.style.setProperty('display', 'flex', 'important');
        this.overlay.style.setProperty('visibility', 'visible', 'important');
        this.overlay.style.setProperty('opacity', '1', 'important');
        this.overlay.style.setProperty('pointer-events', 'all', 'important');
        this.overlay.style.setProperty('z-index', MAX_OVERLAY_Z_INDEX, 'important');

        this.isVisible = true;

        // Deferred visibility check - runs once per show() after next paint
        // Using getComputedStyle inside rAF is appropriate as it's after layout
        requestAnimationFrame(() => {
          const computedStyle = window.getComputedStyle(this.overlay);
          if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
            logger.log(
              LOG_CATEGORIES.OVERLAY,
              'Warning: Overlay not visible after show, forcing styles'
            );
            this.overlay.style.setProperty('display', 'flex', 'important');
            this.overlay.style.setProperty('visibility', 'visible', 'important');
          }
        });
      }

      // Only update phase color when phase actually changes
      const currentPhase = this.overlay.getAttribute('data-phase');
      if (currentPhase !== phase) {
        this.overlay.setAttribute('data-phase', phase);
        this.updatePhaseColor(phase);
      }
    }

    /**
     * Hide overlay
     * Removes both active and animation classes.
     * Animation class removal allows re-triggering when show() is called again.
     * Bug Fix: Clear all inline styles that were set in show() to prevent UI artifacts
     *
     * Note: After removing inline styles, the CSS rules take over:
     * - #zen-pomodoro-overlay (without .active) has display:none, visibility:hidden
     * - The !important flags in CSS ensure proper hiding
     */
    hide() {
      if (this.overlay) {
        // Only log when actually hiding (transitioning from visible to hidden)
        if (this.isVisible) {
          logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay hidden');
        }
        this.overlay.classList.remove('active');
        this.overlay.classList.remove('zen-pomodoro-animate-in');

        // Clear ALL inline styles that were set in show() with setProperty()
        // This allows the CSS rules for the base #zen-pomodoro-overlay selector
        // to take effect (display:none, visibility:hidden, pointer-events:all)
        this.overlay.style.removeProperty('display');
        this.overlay.style.removeProperty('visibility');
        this.overlay.style.removeProperty('opacity');
        this.overlay.style.removeProperty('pointer-events');
        this.overlay.style.removeProperty('z-index');

        // BUG FIX: Clear bounds styles set by updateOverlayBounds()
        // These inline styles (top, left, width, height) can cause the overlay
        // to still affect layout even when hidden, potentially blocking UI elements
        // like the Zen Sidebar and toolbar
        this.overlay.style.removeProperty('top');
        this.overlay.style.removeProperty('left');
        this.overlay.style.removeProperty('width');
        this.overlay.style.removeProperty('height');

        // BUG FIX: Disconnect ResizeObserver when hiding to prevent
        // unnecessary reflows and potential UI blocking issues
        this._cleanupContentAreaObserver();

        this.isVisible = false;
      }
    }

    /**
     * Update timer display
     * SECURITY FIX: Use textContent instead of innerHTML
     */
    updateDisplay(remainingTime, phase, currentCycle, totalCycles) {
      if (!this.overlay) return;

      const timeStr = formatTime(remainingTime);

      this._updateTimerText(timeStr);
      this._updatePhaseLabel(phase);
      this._updateCycleProgress(phase, currentCycle, totalCycles);
      this._updateIndicator(phase, timeStr);
    }

    /**
     * Update the main timer text display.
     * @param {string} timeStr - Formatted time string
     * @private
     */
    _updateTimerText(timeStr) {
      const timerDisplay = this.overlay.querySelector('#zen-pomodoro-timer-display');
      if (timerDisplay) timerDisplay.textContent = timeStr;
    }

    /**
     * Update the phase label display.
     * @param {string} phase - Current phase identifier
     * @private
     */
    _updatePhaseLabel(phase) {
      const phaseLabel = this.overlay.querySelector('#zen-pomodoro-phase-label');
      if (phaseLabel) {
        phaseLabel.textContent = getPhaseLabel(phase);
      }
    }

    /**
     * Update the cycle progress display.
     * @param {string} phase - Current phase identifier
     * @param {number} currentCycle - Current cycle number
     * @param {number} totalCycles - Total number of cycles
     * @private
     */
    _updateCycleProgress(phase, currentCycle, totalCycles) {
      const cycleProgress = this.overlay.querySelector('#zen-pomodoro-cycle-progress');
      if (!cycleProgress) return;

      // Only show cycle progress for pomodoro mode during focus phase
      const timerMode = window.zenPomodoroApp?.timer?.mode;
      const shouldShow = phase === 'focus' && timerMode === 'pomodoro';
      cycleProgress.style.display = shouldShow ? 'block' : 'none';
      if (shouldShow) {
        cycleProgress.textContent = `Cycle ${currentCycle} of ${totalCycles}`;
      }
    }

    /**
     * Update the corner indicator.
     * @param {string} phase - Current phase identifier
     * @param {string} timeStr - Formatted time string
     * @private
     */
    _updateIndicator(phase, timeStr) {
      const indicatorText = this.indicator?.querySelector('#zen-pomodoro-indicator-text');
      if (indicatorText) {
        indicatorText.textContent = `${getShortPhaseLabel(phase)}: ${timeStr}`;
      }
      if (this.indicator) {
        this.indicator.setAttribute('data-phase', phase);
      }
    }

    /**
     * Update phase color
     */
    updatePhaseColor(phase) {
      if (!this.overlay) return;

      this.overlay.setAttribute('data-phase', phase);

      // Trigger transition animation
      this.overlay.setAttribute('data-transitioning', 'true');
      setTimeout(() => {
        if (this.overlay) {
          this.overlay.removeAttribute('data-transitioning');
        }
      }, 500);
    }

    /**
     * Show persistent indicator
     * Bug Fix: Reset indicator display before showing to prevent flash of previous timer duration
     */
    showIndicator() {
      if (!this.indicator) this.createOverlay();

      // Reset indicator text and phase before showing to prevent flash of previous timer data
      this._resetIndicatorDisplay();

      this.indicator.classList.add('active');
    }

    /**
     * Reset the indicator display with current timer data.
     * Prevents the flash of previous timer duration when starting a new timer.
     * @private
     */
    _resetIndicatorDisplay() {
      const indicatorText = this.indicator?.querySelector('#zen-pomodoro-indicator-text');
      if (!indicatorText) return;

      const timer = window.zenPomodoroApp?.timer;
      if (!timer || timer.remainingTime === undefined) return;

      const timeStr = formatTime(timer.remainingTime);
      const phase = timer.currentPhase || 'focus';
      const phaseLabel = getShortPhaseLabel(phase);

      indicatorText.textContent = `${phaseLabel}: ${timeStr}`;
      this.indicator.setAttribute('data-phase', phase);
    }

    /**
     * Hide persistent indicator
     */
    hideIndicator() {
      if (this.indicator) {
        this.indicator.classList.remove('active');
      }
    }

    /**
     * Remove overlay elements and cleanup
     * MEMORY LEAK FIX: Clean up ResizeObserver and event listeners on destroy
     */
    destroy() {
      this._cleanupContentAreaObserver();
      this._cleanupContentAreaReference();
      this._cleanupIndicatorEventListener();
      this._removeOverlayElements();
    }

    /**
     * Clean up content area reference.
     * Clears the stored reference to the content area element.
     * @private
     */
    _cleanupContentAreaReference() {
      this.contentArea = null;
    }

    /**
     * Clean up indicator mouse event listener.
     * @private
     */
    _cleanupIndicatorEventListener() {
      if (this.indicator && this.indicatorMouseDownHandler) {
        this.indicator.removeEventListener('mousedown', this.indicatorMouseDownHandler);
        this.indicatorMouseDownHandler = null;
      }
    }

    /**
     * Remove overlay and indicator elements from DOM.
     * @private
     */
    _removeOverlayElements() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      if (this.indicator) {
        this.indicator.remove();
        this.indicator = null;
      }
    }
  }

  // ============================================
  // Keyboard Shortcut Module
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
      this.menuDialog = null;
    }

    /**
     * Issue 3: Close all existing dialogs to prevent duplicates
     * MEMORY LEAK FIX: Clean up associated resources for dialogs that manage state
     */
    closeAllDialogs() {
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
        const phaseStr =
          status.currentPhase === 'focus'
            ? 'Focus'
            : status.currentPhase === 'break'
              ? 'Break'
              : 'Long Break';

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

        const pauseResumeBtn = document.createElement('button');
        pauseResumeBtn.className = 'zen-pomodoro-dialog-button';
        pauseResumeBtn.textContent = status.isPaused ? 'Resume Timer' : 'Pause Timer';
        pauseResumeBtn.addEventListener('click', () => {
          if (window.zenPomodoroApp.timer.isPaused) {
            window.zenPomodoroApp.timer.resume();
          } else {
            window.zenPomodoroApp.timer.pause();
          }
          dialog.remove();
          this.menuDialog = null;
        });

        const stopBtn = document.createElement('button');
        stopBtn.className = 'zen-pomodoro-dialog-button secondary';
        stopBtn.textContent = 'Stop Timer';
        stopBtn.addEventListener('click', () => {
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
          dialog.remove();
          this.menuDialog = null;
          this.showSettingsDialog();
        });

        const rulesetBtn = document.createElement('button');
        rulesetBtn.className = 'zen-pomodoro-dialog-button secondary';
        rulesetBtn.textContent = 'Ruleset Settings';
        rulesetBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showRulesetSettingsDialog();
        });

        menuSection.appendChild(statusRow);
        menuSection.appendChild(pauseResumeBtn);
        menuSection.appendChild(stopBtn);
        menuSection.appendChild(settingsBtn);
        menuSection.appendChild(rulesetBtn);
      } else {
        // Timer not running - show start options
        const startBtn = document.createElement('button');
        startBtn.className = 'zen-pomodoro-dialog-button';
        startBtn.textContent = 'Start Pomodoro Timer';
        startBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showConfigDialog();
        });

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'zen-pomodoro-dialog-button secondary';
        settingsBtn.textContent = 'Timer Settings';
        settingsBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showSettingsDialog();
        });

        const rulesetBtn = document.createElement('button');
        rulesetBtn.className = 'zen-pomodoro-dialog-button secondary';
        rulesetBtn.textContent = 'Ruleset Settings';
        rulesetBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showRulesetSettingsDialog();
        });

        menuSection.appendChild(startBtn);
        menuSection.appendChild(settingsBtn);
        menuSection.appendChild(rulesetBtn);
      }

      // Buttons section
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';

      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Close';
      cancelButton.addEventListener('click', () => {
        dialog.remove();
        this.menuDialog = null;
      });

      buttonDiv.appendChild(cancelButton);

      dialog.appendChild(h2);
      dialog.appendChild(menuSection);
      dialog.appendChild(buttonDiv);

      document.documentElement.appendChild(dialog);

      // Issue 8: Make dialog draggable
      setupDialogDrag(dialog);

      // Focus the dialog
      dialog.focus();

      // Close on Escape key
      const escHandler = (e) => {
        if (e.key === 'Escape') {
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
      if (this.keydownHandler) {
        document.removeEventListener('keydown', this.keydownHandler, true);
        this.keydownHandler = null;
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
      logger.log(LOG_CATEGORIES.MENU, 'Opening start timer dialog');

      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-start-dialog';
      dialog.className = 'zen-pomodoro-dialog active';

      const config = getConfig();
      const isSimpleMode = config.timerMode === 'simple';

      // Create dialog structure
      const backButton = this._createBackButton(dialog);
      const h2 = this._createDialogTitle('Start Timer');
      const configSection = document.createElement('div');
      configSection.className = 'zen-pomodoro-config-section';

      // Mode selection using helper
      const { row: modeRow, select: modeSelect } = createLabeledSelectRow(
        'Timer Mode:',
        'zen-pomodoro-mode-select',
        [
          { value: 'simple', text: 'Simple Timer', selected: isSimpleMode },
          { value: 'pomodoro', text: 'Pomodoro Mode', selected: !isSimpleMode },
        ]
      );

      // Duration inputs using helper
      const simpleDurationRow = createLabeledInputRow(
        'Duration (min):',
        'zen-pomodoro-simple-duration-input',
        { value: config.simpleDuration, min: '1', max: '180' }
      );
      simpleDurationRow.style.display = isSimpleMode ? 'flex' : 'none';

      const focusDurationRow = createLabeledInputRow(
        'Focus (min):',
        'zen-pomodoro-focus-duration-input',
        { value: config.focusDuration, min: '1', max: '120' }
      );
      focusDurationRow.style.display = isSimpleMode ? 'none' : 'flex';

      const breakDurationRow = createLabeledInputRow(
        'Break (min):',
        'zen-pomodoro-break-duration-input',
        { value: config.breakDuration, min: '1', max: '30' }
      );
      breakDurationRow.style.display = isSimpleMode ? 'none' : 'flex';

      const cyclesRow = createLabeledInputRow('Number of Cycles:', 'zen-pomodoro-cycles-input', {
        value: config.cycles,
        min: '1',
        max: '20',
      });
      cyclesRow.style.display = isSimpleMode ? 'none' : 'flex';

      // Ruleset selection for start timer dialog
      const activeRulesetsRow = document.createElement('div');
      activeRulesetsRow.className = 'zen-pomodoro-config-row zen-pomodoro-workspace-row';
      activeRulesetsRow.id = 'zen-pomodoro-active-rulesets-row';

      const activeRulesetsLabel = document.createElement('label');
      activeRulesetsLabel.textContent = 'Active Blocking Rulesets:';

      const activeRulesetsContainer = document.createElement('div');
      activeRulesetsContainer.className = 'zen-pomodoro-workspace-list';
      activeRulesetsContainer.id = 'zen-pomodoro-active-rulesets-container';

      // Render ruleset checkboxes
      const rulesets = config.rulesets || [];
      if (rulesets.length === 0) {
        const noRulesets = document.createElement('p');
        noRulesets.style.color = '#888';
        noRulesets.style.fontSize = '12px';
        noRulesets.textContent = 'No rulesets configured. Add rulesets in Settings.';
        activeRulesetsContainer.appendChild(noRulesets);
      } else {
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
          activeRulesetsContainer.appendChild(checkboxRow);
        });
      }

      activeRulesetsRow.appendChild(activeRulesetsLabel);
      activeRulesetsRow.appendChild(activeRulesetsContainer);

      // Add to config section
      [
        modeRow,
        simpleDurationRow,
        focusDurationRow,
        breakDurationRow,
        cyclesRow,
        activeRulesetsRow,
      ].forEach((row) => configSection.appendChild(row));

      // Buttons
      const { buttonDiv, cancelButton, startButton } = this._createStartDialogButtons();

      // Assemble dialog
      [backButton, h2, configSection, buttonDiv].forEach((el) => dialog.appendChild(el));
      document.documentElement.appendChild(dialog);
      setupDialogDrag(dialog);

      // Event handlers
      this._setupModeToggleHandler(modeSelect, {
        simpleDurationRow,
        focusDurationRow,
        breakDurationRow,
        cyclesRow,
      });
      cancelButton.addEventListener('click', () => dialog.remove());
      this._setupStartHandler(dialog, config, modeSelect, startButton);
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
          dialog.remove();
        }
        this.showPomodoroMenu();
      });
      return backButton;
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
     * @param {HTMLElement} rows.simpleDurationRow - Simple duration row
     * @param {HTMLElement} rows.focusDurationRow - Focus duration row
     * @param {HTMLElement} rows.breakDurationRow - Break duration row
     * @param {HTMLElement} rows.cyclesRow - Cycles row
     * @private
     */
    _setupModeToggleHandler(modeSelect, rows) {
      modeSelect.addEventListener('change', () => {
        const isSimple = modeSelect.value === 'simple';
        rows.simpleDurationRow.style.display = isSimple ? 'flex' : 'none';
        rows.focusDurationRow.style.display = isSimple ? 'none' : 'flex';
        rows.breakDurationRow.style.display = isSimple ? 'none' : 'flex';
        rows.cyclesRow.style.display = isSimple ? 'none' : 'flex';
      });
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
          window.zenPomodoroApp.startTimer(mode, cycles, sessionOverrides);
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
      } else {
        const focusDurationInput = dialog.querySelector('#zen-pomodoro-focus-duration-input');
        const breakDurationInput = dialog.querySelector('#zen-pomodoro-break-duration-input');
        sessionOverrides.focusDuration = focusDurationInput
          ? validateIntegerInput(focusDurationInput.value, 1, 120, config.focusDuration)
          : config.focusDuration;
        sessionOverrides.breakDuration = breakDurationInput
          ? validateIntegerInput(breakDurationInput.value, 1, 30, config.breakDuration)
          : config.breakDuration;
      }

      return sessionOverrides;
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
        dialog.remove();
        this.showPomodoroMenu();
      });

      const h2 = document.createElement('h2');
      h2.textContent = 'Pomodoro Timer Settings';

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
        max: 30,
      });
      if (config.timerMode === 'simple') {
        breakRow.classList.add('hidden');
      }

      const longBreakRow = createLabeledInputRow('Long Break (min):', 'long-break-duration', {
        value: config.longBreakDuration,
        min: 5,
        max: 60,
      });
      if (config.timerMode === 'simple') {
        longBreakRow.classList.add('hidden');
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
        longBreakRow.classList.toggle('hidden', isSimple);
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
      // Workspace selection UI
      // ========================================
      const workspaceRow = document.createElement('div');
      workspaceRow.className = 'zen-pomodoro-config-row zen-pomodoro-workspace-row';

      const workspaceLabel = document.createElement('label');
      workspaceLabel.textContent = 'Blocked Workspaces:';

      const workspaceContainer = document.createElement('div');
      workspaceContainer.className = 'zen-pomodoro-workspace-list';

      const workspaces = window.zenPomodoroApp
        ? window.zenPomodoroApp.workspace.getAllWorkspaces()
        : [];

      if (workspaces.length === 0) {
        const noWorkspacesMsg = document.createElement('div');
        noWorkspacesMsg.textContent = 'No workspaces found';
        noWorkspacesMsg.style.fontStyle = 'italic';
        noWorkspacesMsg.style.opacity = '0.7';
        workspaceContainer.appendChild(noWorkspacesMsg);
      } else {
        workspaces.forEach((workspace) => {
          const checkboxWrapper = document.createElement('div');
          checkboxWrapper.className = 'zen-pomodoro-checkbox-row';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `workspace-${workspace.id}`;
          checkbox.value = workspace.id;
          checkbox.checked = config.blockedWorkspaces.includes(workspace.id);

          const label = document.createElement('label');
          label.setAttribute('for', `workspace-${workspace.id}`);
          label.textContent = workspace.name;

          checkboxWrapper.appendChild(checkbox);
          checkboxWrapper.appendChild(label);
          workspaceContainer.appendChild(checkboxWrapper);
        });
      }

      workspaceRow.appendChild(workspaceLabel);
      workspaceRow.appendChild(workspaceContainer);

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
        dialog.style.display = 'none';
        // Show ruleset settings dialog, pass callback to show settings again when done
        this.showRulesetSettingsDialog(() => {
          // Re-show settings dialog when returning
          dialog.style.display = 'flex';
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

        idleHoldDurationRow.style.display = idleUsesHold ? '' : 'none';
        activeHoldDurationRow.style.display = activeUsesHold ? '' : 'none';
        idleCodeLengthRow.style.display = idleUsesCode ? '' : 'none';
        activeCodeLengthRow.style.display = activeUsesCode ? '' : 'none';
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
      // Assemble config section
      // ========================================
      configSection.appendChild(shortcutRow);
      configSection.appendChild(timerModeRow);
      configSection.appendChild(simpleDurationRow);
      configSection.appendChild(focusRow);
      configSection.appendChild(breakRow);
      configSection.appendChild(longBreakRow);
      configSection.appendChild(cyclesRow);
      configSection.appendChild(messageRow);
      configSection.appendChild(workspaceRow);
      configSection.appendChild(rulesetsSection);
      configSection.appendChild(lockoutSection);

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

      const saveButton = document.createElement('button');
      saveButton.className = 'zen-pomodoro-dialog-button';
      saveButton.id = 'zen-pomodoro-settings-save';
      saveButton.textContent = 'Save';

      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(exportLogsButton);
      buttonDiv.appendChild(saveButton);

      dialog.appendChild(backButton);
      dialog.appendChild(h2);
      dialog.appendChild(configSection);
      dialog.appendChild(buttonDiv);

      document.documentElement.appendChild(dialog);

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

      saveButton.addEventListener('click', () => {
        logger.log(LOG_CATEGORIES.SETTINGS, 'Saving settings');
        this._saveKeyboardShortcut(shortcutInput, config);
        this._saveTimerSettings(dialog, config, timerModeSelect);
        this._saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect);
        this._saveBlockedWorkspaces(workspaceContainer, config);

        saveConfig(config);
        dialog.remove();

        this._updateOverlayMessage(config);
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
          30,
          config.breakDuration
        );
      }
      const longBreakDurationInput = dialog.querySelector('#long-break-duration');
      if (longBreakDurationInput) {
        config.longBreakDuration = validateIntegerInput(
          longBreakDurationInput.value,
          5,
          60,
          config.longBreakDuration
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
        dialog.remove();
        if (onClose) {
          onClose();
        } else {
          this.showPomodoroMenu();
        }
      });

      const h2 = document.createElement('h2');
      h2.textContent = 'Ruleset Settings';

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
      saveButton.className = 'zen-pomodoro-dialog-button';
      saveButton.id = 'zen-pomodoro-ruleset-save';
      saveButton.textContent = 'Save';

      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(saveButton);

      dialog.appendChild(backButton);
      dialog.appendChild(h2);
      dialog.appendChild(configSection);
      dialog.appendChild(buttonDiv);

      document.documentElement.appendChild(dialog);

      // Make dialog draggable
      setupDialogDrag(dialog);

      cancelButton.addEventListener('click', () => {
        logger.log(LOG_CATEGORIES.MENU, 'Ruleset settings dialog cancelled');
        dialog.remove();
        if (onClose) {
          onClose();
        }
      });

      saveButton.addEventListener('click', () => {
        logger.log(LOG_CATEGORIES.SETTINGS, 'Saving ruleset settings');
        saveConfig(config);
        dialog.remove();

        if (onClose) {
          onClose();
        } else {
          window.zenPomodoroApp?.showCustomAlert('Saved', 'Ruleset settings have been saved.');
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
      container.innerHTML = '';
      const rulesets = config.rulesets || [];

      if (rulesets.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'zen-pomodoro-empty-rulesets';
        emptyMsg.textContent = 'No rulesets configured. Add one to start blocking websites.';
        container.appendChild(emptyMsg);
        return;
      }

      rulesets.forEach((ruleset, index) => {
        const rulesetItem = this._createRulesetItem(ruleset, index, container, config);
        container.appendChild(rulesetItem);
      });
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
        if (details.style.display === 'none') {
          details.style.display = 'block';
          expandBtn.textContent = '▲';
        } else {
          details.style.display = 'none';
          expandBtn.textContent = '▼';
        }
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
      details.className = 'zen-pomodoro-ruleset-details';
      details.style.display = 'none';

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
      titleOnlyCheckbox.title = 'Keywords match tab titles only due to browser security restrictions.';

      const titleOnlyLabel = document.createElement('label');
      titleOnlyLabel.htmlFor = `title-only-${ruleset.id}`;
      titleOnlyLabel.textContent = 'Keywords match tab title only (browser security limitation)';
      titleOnlyLabel.title = 'Keywords match tab titles only due to browser security restrictions.';
      titleOnlyLabel.style.cursor = 'help';

      titleOnlyRow.appendChild(titleOnlyCheckbox);
      titleOnlyRow.appendChild(titleOnlyLabel);

      // Assemble details
      details.appendChild(rulesContainer);
      details.appendChild(addRuleBtn);
      details.appendChild(titleOnlyRow);

      item.appendChild(headerRow);
      item.appendChild(details);

      return item;
    }

    /**
     * Render individual rules in a container
     * @param {HTMLElement} container - Rules container
     * @param {Object} ruleset - Parent ruleset
     * @param {Object} config - Configuration object
     * @private
     */
    _renderRules(container, ruleset, config) {
      container.innerHTML = '';
      const rules = ruleset.rules || [];

      if (rules.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'zen-pomodoro-empty-rules';
        emptyMsg.textContent = 'No rules configured. Click "Add Rule/Condition" to add one.';
        container.appendChild(emptyMsg);
        return;
      }

      rules.forEach((rule) => {
        const ruleEl = this._createRuleElement(rule, ruleset, config, container);
        container.appendChild(ruleEl);
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
        const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
        if (rulesetIndex !== -1) {
          const ruleIndex = config.rulesets[rulesetIndex].rules.findIndex((r) => r.id === rule.id);
          if (ruleIndex !== -1) {
            config.rulesets[rulesetIndex].rules[ruleIndex].pattern = patternInput.value.trim();
          }
        }
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
        const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
        if (rulesetIndex !== -1) {
          const ruleIndex = config.rulesets[rulesetIndex].rules.findIndex((r) => r.id === rule.id);
          if (ruleIndex !== -1) {
            config.rulesets[rulesetIndex].rules[ruleIndex].type = typeSelect.value;
            // Update placeholder
            patternInput.placeholder =
              typeSelect.value === 'keyword' ? 'Enter keyword...' : 'site.com or *.site.com';
          }
        }
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
        const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
        if (rulesetIndex !== -1) {
          const ruleIndex = config.rulesets[rulesetIndex].rules.findIndex((r) => r.id === rule.id);
          if (ruleIndex !== -1) {
            config.rulesets[rulesetIndex].rules[ruleIndex].condition = conditionSelect.value;
          }
        }
      });

      // Delete rule button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'zen-pomodoro-dialog-button secondary small';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete rule';
      deleteBtn.addEventListener('click', () => {
        const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
        if (rulesetIndex !== -1) {
          const ruleIndex = config.rulesets[rulesetIndex].rules.findIndex((r) => r.id === rule.id);
          if (ruleIndex !== -1) {
            config.rulesets[rulesetIndex].rules.splice(ruleIndex, 1);
            this._renderRules(container, config.rulesets[rulesetIndex], config);
          }
        }
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
     * Import rulesets from JSON file
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
            const importData = JSON.parse(event.target.result);

            if (!importData.rulesets || !Array.isArray(importData.rulesets)) {
              throw new Error('Invalid rulesets format');
            }

            // Validate and add rulesets
            const importedCount = importData.rulesets.length;
            importData.rulesets.forEach((ruleset) => {
              // Generate new ID to avoid conflicts
              ruleset.id = 'imported-' + this._generateRulesetId().replace('ruleset-', '');
              ruleset.name = ruleset.name || 'Imported Ruleset';
              ruleset.enabled = ruleset.enabled !== false;
              ruleset.checkTitleOnly = !!ruleset.checkTitleOnly;

              // Convert old format (sites/blockKeywords/allowKeywords) to new format (rules array)
              if (
                Array.isArray(ruleset.sites) ||
                Array.isArray(ruleset.blockKeywords) ||
                Array.isArray(ruleset.allowKeywords)
              ) {
                ruleset.rules = this._convertOldFormatToRules(ruleset);
                // Clean up old format properties
                delete ruleset.sites;
                delete ruleset.blockKeywords;
                delete ruleset.allowKeywords;
              }

              // Ensure rules array exists and is valid
              if (!Array.isArray(ruleset.rules)) {
                ruleset.rules = [];
              }

              // Validate each rule in the rules array
              ruleset.rules = ruleset.rules.filter((rule) => {
                if (!rule || typeof rule !== 'object') return false;
                // Ensure required properties exist
                rule.id = rule.id || this._generateRuleId();
                rule.pattern = typeof rule.pattern === 'string' ? rule.pattern : '';
                rule.type = ['website', 'keyword'].includes(rule.type) ? rule.type : 'website';
                rule.condition = ['block', 'allow'].includes(rule.condition)
                  ? rule.condition
                  : 'block';
                return true;
              });
            });

            config.rulesets = [...(config.rulesets || []), ...importData.rulesets];
            this._renderRulesets(container, config);

            logger.log(LOG_CATEGORIES.SETTINGS, 'Rulesets imported', { count: importedCount });
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

  // ============================================
  // Security Module
  // ============================================

  class SecurityManager {
    constructor() {
      this.lockScreen = null;
      this.lockIntervalId = null; // Store interval for cleanup
      this.lockTimerElement = null; // PERFORMANCE FIX: Initialize timer element reference for caching
      this.holdDuration = 3000;
      this.holdToUnlockIntervalId = null; // Store hold-to-unlock interval (renamed for consistency)
      this._overlayPointerEventsDisabled = false; // Z-INDEX FIX: Track if overlay pointer-events were disabled
    }

    /**
     * Check if settings should be locked
     */
    shouldLockSettings(timerActive) {
      const config = getConfig();

      if (timerActive) {
        // Check based on active method
        if (config.settingsLockActiveMethod === LOCKOUT_METHODS.CODE) {
          return config.settingsLockActiveCodeLength > 0;
        } else {
          return config.settingsLockActiveHoldDuration > 0;
        }
      } else {
        // Check based on idle method
        if (config.settingsLockIdleMethod === LOCKOUT_METHODS.CODE) {
          return config.settingsLockIdleCodeLength > 0;
        } else {
          return config.settingsLockIdleHoldDuration > 0;
        }
      }
    }

    /**
     * Show settings lock screen
     * UI/UX FIX: Replace alert() with custom dialog
     * MEMORY LEAK FIX: Store and clear interval properly
     * NEW: Added cancel button, hold-to-unlock
     * NEW: Configurable lockout methods (hold vs code) for idle and active states
     * Z-INDEX FIX: Temporarily disable overlay pointer-events so lock screen can receive input
     */
    showLockScreen(timerActive, onUnlock) {
      const config = getConfig();
      const method = this._determineLockoutMethod(timerActive, config);

      logger.log(LOG_CATEGORIES.SECURITY, 'Lock screen shown', {
        timerActive: timerActive,
        method: method,
      });

      // Z-INDEX FIX: Temporarily disable pointer-events on overlay so lock screen can receive input.
      // Both lock screen and overlay use the CSS specification maximum z-index (2147483647).
      // Since we cannot use a higher z-index value, we disable pointer-events on the overlay
      // to allow the lock screen (which appears later in DOM order) to receive user interaction.
      const overlay =
        window.zenPomodoroApp?.overlay?.overlay || document.getElementById('zen-pomodoro-overlay');
      if (overlay) {
        overlay.style.setProperty('pointer-events', 'none', 'important');
      }
      // Store reference to restore later
      this._overlayPointerEventsDisabled = !!overlay;

      this._initializeLockScreen();
      const lockContent = this._createLockContent();

      if (method === LOCKOUT_METHODS.CODE) {
        this._setupCodeEntryMode(lockContent, config, timerActive, onUnlock);
      } else {
        this._setupHoldToUnlockMode(lockContent, config, timerActive, onUnlock);
      }

      this.lockScreen.appendChild(lockContent);
      document.documentElement.appendChild(this.lockScreen);
    }

    /**
     * Determine which lockout method to use based on timer state and config.
     * @param {boolean} timerActive - Whether timer is currently active
     * @param {Object} config - Configuration object
     * @returns {string} The lockout method to use
     * @private
     */
    _determineLockoutMethod(timerActive, config) {
      const requestedMethod = timerActive
        ? config.settingsLockActiveMethod
        : config.settingsLockIdleMethod;

      if (requestedMethod === LOCKOUT_METHODS.CODE || requestedMethod === LOCKOUT_METHODS.HOLD) {
        return requestedMethod;
      }

      // Fall back to defaults: code for active, hold for idle
      const defaultMethod = timerActive ? LOCKOUT_METHODS.CODE : LOCKOUT_METHODS.HOLD;
      console.warn(
        `Zen Pomodoro: Invalid lockout method "${requestedMethod}", using default "${defaultMethod}".`
      );
      return defaultMethod;
    }

    /**
     * Initialize the lock screen container element.
     * @private
     */
    _initializeLockScreen() {
      this.lockScreen = document.createElement('div');
      this.lockScreen.id = 'zen-pomodoro-lock-screen';
      this.lockScreen.className = 'active';
    }

    /**
     * Create the lock content container element.
     * @returns {HTMLElement} The lock content element
     * @private
     */
    _createLockContent() {
      const lockContent = document.createElement('div');
      lockContent.id = 'zen-pomodoro-lock-content';
      return lockContent;
    }

    /**
     * Create standard lock screen button row with cancel button.
     * @returns {{buttonDiv: HTMLElement, cancelButton: HTMLElement}}
     * @private
     */
    _createLockButtonRow() {
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';

      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.id = 'zen-pomodoro-lock-cancel';
      cancelButton.textContent = 'Cancel';

      // Attach event handler
      cancelButton.addEventListener('click', () => this.cleanupLockScreen());

      buttonDiv.appendChild(cancelButton);

      return { buttonDiv, cancelButton };
    }

    /**
     * Setup code entry lockout mode UI and handlers.
     * @param {HTMLElement} lockContent - Container for lock content
     * @param {Object} config - Configuration object
     * @param {boolean} timerActive - Whether timer is active
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupCodeEntryMode(lockContent, config, timerActive, onUnlock) {
      const codeLength = timerActive
        ? config.settingsLockActiveCodeLength
        : config.settingsLockIdleCodeLength;
      const code = generateRandomCode(codeLength, config.settingsLockActiveCharacterSet);

      logger.log(LOG_CATEGORIES.SECURITY, 'Code entry mode initialized', {
        codeLength: codeLength,
        timerActive: timerActive,
      });

      const h2 = document.createElement('h2');
      h2.textContent = 'Settings Locked';

      const p = document.createElement('p');
      p.textContent = timerActive
        ? 'Timer is active. Enter the code below to unlock settings:'
        : 'Enter the code below to unlock settings:';

      const codeDiv = document.createElement('div');
      codeDiv.className = 'zen-pomodoro-lock-code-display';
      codeDiv.textContent = code;

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'zen-pomodoro-lock-code';
      input.placeholder = 'Enter code here';

      // Add Enter key support for code entry
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (input.value === code) {
            logger.log(LOG_CATEGORIES.SECURITY, 'Code verification successful');
            this.cleanupLockScreen();
            onUnlock();
          } else if (window.zenPomodoroApp) {
            logger.log(LOG_CATEGORIES.SECURITY, 'Code verification failed - incorrect code');
            window.zenPomodoroApp.showCustomAlert('Incorrect Code', 'Please try again.');
          }
        }
      });

      const { buttonDiv } = this._createLockButtonRow();

      const unlockButton = document.createElement('button');
      unlockButton.className = 'zen-pomodoro-dialog-button';
      unlockButton.id = 'zen-pomodoro-lock-submit';
      unlockButton.textContent = 'Unlock';
      buttonDiv.appendChild(unlockButton);

      unlockButton.addEventListener('click', () => {
        if (input.value === code) {
          logger.log(LOG_CATEGORIES.SECURITY, 'Code verification successful');
          this.cleanupLockScreen();
          onUnlock();
        } else if (window.zenPomodoroApp) {
          logger.log(LOG_CATEGORIES.SECURITY, 'Code verification failed - incorrect code');
          window.zenPomodoroApp.showCustomAlert('Incorrect Code', 'Please try again.');
        }
      });

      lockContent.appendChild(h2);
      lockContent.appendChild(p);
      lockContent.appendChild(codeDiv);
      lockContent.appendChild(input);
      lockContent.appendChild(buttonDiv);

      // Focus the input field for better UX
      setTimeout(() => input?.focus(), 0);
    }

    /**
     * Setup hold-to-unlock lockout mode UI and handlers.
     * @param {HTMLElement} lockContent - Container for lock content
     * @param {Object} config - Configuration object
     * @param {boolean} timerActive - Whether timer is active
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupHoldToUnlockMode(lockContent, config, timerActive, onUnlock) {
      const waitTime = timerActive
        ? config.settingsLockActiveHoldDuration
        : config.settingsLockIdleHoldDuration;

      const h2 = document.createElement('h2');
      h2.textContent = 'Settings Locked';

      const p = document.createElement('p');
      p.textContent = timerActive
        ? 'Timer is active. Hold the button below to unlock settings:'
        : 'Hold the button below to unlock settings:';

      const timerDiv = document.createElement('div');
      timerDiv.id = 'zen-pomodoro-lock-timer';
      timerDiv.textContent = waitTime.toString();

      const pSub = document.createElement('p');
      pSub.className = 'zen-pomodoro-lock-subtext';
      pSub.textContent = 'seconds remaining - hold button to count down';

      const { holdButton, holdProgress } = this._createHoldButton();
      const { buttonDiv } = this._createLockButtonRow();
      buttonDiv.appendChild(holdButton);

      lockContent.appendChild(h2);
      lockContent.appendChild(p);
      lockContent.appendChild(timerDiv);
      lockContent.appendChild(pSub);
      lockContent.appendChild(buttonDiv);

      // Cache timer element reference for updates
      this.lockTimerElement = timerDiv;

      // Setup hold logic
      this._setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock);
    }

    /**
     * Create the hold-to-unlock button with progress bar.
     * @returns {{holdButton: HTMLElement, holdProgress: HTMLElement}}
     * @private
     */
    _createHoldButton() {
      const holdButton = document.createElement('button');
      holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
      holdButton.id = 'zen-pomodoro-hold-to-unlock';
      holdButton.textContent = 'Hold to Unlock';

      const holdProgress = document.createElement('div');
      holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
      holdProgress.id = 'zen-pomodoro-hold-unlock-progress';
      holdButton.appendChild(holdProgress);

      return { holdButton, holdProgress };
    }

    /**
     * Setup hold-to-unlock event handlers.
     * @param {HTMLElement} holdButton - The hold button element
     * @param {HTMLElement} holdProgress - The progress bar element
     * @param {number} waitTime - Total wait time in seconds
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock) {
      let currentWaitTime = waitTime;

      const startHold = (e) => {
        if (e.type === 'touchstart') e.preventDefault();

        this._clearHoldInterval();

        this.holdToUnlockIntervalId = setInterval(() => {
          currentWaitTime--;
          if (this.lockTimerElement) {
            this.lockTimerElement.textContent = currentWaitTime.toString();
          }

          const percent = ((waitTime - currentWaitTime) / waitTime) * 100;
          if (holdProgress?.style) {
            holdProgress.style.width = `${percent}%`;
          }

          if (currentWaitTime <= 0) {
            logger.log(LOG_CATEGORIES.SECURITY, 'Hold-to-unlock completed successfully');
            this._clearHoldInterval();
            this.cleanupLockScreen();
            onUnlock();
          }
        }, 1000);
      };

      const stopHold = () => {
        this._clearHoldInterval();
        currentWaitTime = waitTime;
        if (this.lockTimerElement) {
          this.lockTimerElement.textContent = waitTime.toString();
        }
        if (holdProgress) {
          holdProgress.style.width = '0%';
        }
      };

      // Mouse events
      holdButton.addEventListener('mousedown', startHold);
      holdButton.addEventListener('mouseup', stopHold);
      holdButton.addEventListener('mouseleave', stopHold);

      // Touch events (passive: false to allow preventDefault)
      holdButton.addEventListener('touchstart', startHold, { passive: false });
      holdButton.addEventListener('touchend', stopHold);
      holdButton.addEventListener('touchcancel', stopHold);

      // Keyboard accessibility
      holdButton.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          startHold(e);
        }
      });
      holdButton.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') stopHold();
      });
    }

    /**
     * Clear the hold-to-unlock interval if active.
     * @private
     */
    _clearHoldInterval() {
      if (this.holdToUnlockIntervalId) {
        clearInterval(this.holdToUnlockIntervalId);
        this.holdToUnlockIntervalId = null;
      }
    }

    /**
     * Cleanup lock screen
     * MEMORY LEAK FIX: Clear interval and cached element reference on cleanup
     * Z-INDEX FIX: Restore overlay pointer-events when lock screen is closed
     */
    cleanupLockScreen() {
      if (this.lockIntervalId) {
        clearInterval(this.lockIntervalId);
        this.lockIntervalId = null;
      }
      if (this.holdToUnlockIntervalId) {
        clearInterval(this.holdToUnlockIntervalId);
        this.holdToUnlockIntervalId = null;
      }
      this.lockTimerElement = null;
      if (this.lockScreen) {
        this.lockScreen.remove();
        this.lockScreen = null;
      }

      // Z-INDEX FIX: Restore overlay pointer-events if they were disabled
      if (this._overlayPointerEventsDisabled) {
        const overlay =
          window.zenPomodoroApp?.overlay?.overlay ||
          document.getElementById('zen-pomodoro-overlay');
        if (overlay) {
          overlay.style.setProperty('pointer-events', 'all', 'important');
        }
        this._overlayPointerEventsDisabled = false;
      }
    }
  }

  // ============================================
  // Sine Mod Blocker Module
  // ============================================

  /**
   * Delay (in ms) after page navigation before checking for Sine Mods page.
   * This allows the URL to be fully updated before checking.
   * @constant {number}
   */
  const SINE_PAGE_CHECK_DELAY_MS = 50;

  /**
   * Delay (in ms) before hiding the blocker overlay after navigation.
   * This ensures the navigation has completed before removing the overlay.
   * @constant {number}
   */
  const SINE_BLOCKER_HIDE_DELAY_MS = 100;

  /**
   * SineModBlocker class prevents users from disabling the Pomodoro mod
   * via the Sine Mod Menu (about:preferences#sineMods) while the timer is active.
   *
   * When the timer is running and the user navigates to the Sine Mods settings page,
   * a blocking overlay appears covering the entire window, offering options to
   * go back or stop the timer (with the same security lock as stopping the timer normally).
   */
  class SineModBlocker {
    constructor() {
      this.blockerOverlay = null;
      this.isBlocking = false;
      this.tabSelectHandler = null;
      this.pageShowHandler = null;
      this.hashChangeHandler = null;
      this.progressListener = null;
    }

    /**
     * Initialize the Sine Mod Blocker.
     * Sets up listeners for tab changes and URL navigation.
     */
    init() {
      logger.log(LOG_CATEGORIES.INIT, 'Initializing Sine Mod Blocker');
      this._setupListeners();
      // Check immediately in case we're already on the page
      this._checkCurrentPage();
    }

    /**
     * Set up all event listeners for detecting navigation to Sine Mods page.
     * @private
     */
    _setupListeners() {
      setupBrowserListeners(this, () => this._checkCurrentPage(), SINE_PAGE_CHECK_DELAY_MS);

      // Hash change listener - specific to Sine (for about:preferences navigation)
      this.hashChangeHandler = () => this._checkCurrentPage();
      window.addEventListener('hashchange', this.hashChangeHandler);
    }

    /**
     * Check if the blocker should be shown based on timer state.
     * @returns {boolean} True if timer is active
     * @private
     */
    _shouldShowBlocker() {
      return window.zenPomodoroApp?.timer?.isActive || false;
    }

    /**
     * Check if the current page is the Sine Mods settings page.
     * Shows or hides the blocker overlay based on timer state and current URL.
     * @private
     */
    _checkCurrentPage() {
      const isSineModsPage = this._isSineModsPage();
      const timerActive = this._shouldShowBlocker();

      logger.log(LOG_CATEGORIES.SECURITY, 'Sine Mod page check', {
        isSineModsPage: isSineModsPage,
        timerActive: timerActive,
        isBlocking: this.isBlocking,
      });

      const shouldBlock = isSineModsPage && timerActive;

      if (shouldBlock && !this.isBlocking) {
        this._showBlocker();
        return;
      }

      if (!shouldBlock && this.isBlocking) {
        this._hideBlocker();
      }
    }

    /**
     * Check if a URL contains the Sine Mods settings page pattern.
     * @param {string} url - The URL to check
     * @returns {boolean} True if URL is the Sine Mods page
     * @private
     */
    _containsSineModsURL(url) {
      return url.includes('about:preferences') && url.includes('sineMods');
    }

    /**
     * Get the current URI spec from gBrowser.
     * @returns {string} The current URI spec or empty string
     * @private
     */
    _getCurrentURISpec() {
      // eslint-disable-next-line no-undef
      if (typeof gBrowser === 'undefined' || !gBrowser.currentURI) {
        return '';
      }
      // eslint-disable-next-line no-undef
      return gBrowser.currentURI.spec || '';
    }

    /**
     * Get the selected browser's current URI spec.
     * @returns {string} The browser URI spec or empty string
     * @private
     */
    _getSelectedBrowserURISpec() {
      // eslint-disable-next-line no-undef
      if (typeof gBrowser === 'undefined' || !gBrowser.selectedBrowser) {
        return '';
      }
      // eslint-disable-next-line no-undef
      return gBrowser.selectedBrowser.currentURI?.spec || '';
    }

    /**
     * Get the content document location href.
     * @returns {string} The document location href or empty string
     * @private
     */
    _getContentDocumentHref() {
      // eslint-disable-next-line no-undef
      const contentDoc = gBrowser?.selectedBrowser?.contentDocument;
      if (!contentDoc) {
        return '';
      }
      return contentDoc.location?.href || '';
    }

    /**
     * Check if the current URL is the Sine Mods settings page.
     * @returns {boolean} True if on the Sine Mods page
     * @private
     */
    _isSineModsPage() {
      try {
        const urlsToCheck = [
          this._getCurrentURISpec(),
          this._getSelectedBrowserURISpec(),
          this._getContentDocumentHref(),
        ];

        return urlsToCheck.some((url) => this._containsSineModsURL(url));
      } catch (e) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Error checking Sine Mods page', { error: e.message });
        return false;
      }
    }

    /**
     * Show the blocker overlay.
     * @private
     */
    _showBlocker() {
      if (this.blockerOverlay) return;

      logger.log(LOG_CATEGORIES.SECURITY, 'Showing Sine Mod blocker overlay');
      this.isBlocking = true;

      this._createBlockerOverlay();
      document.documentElement.appendChild(this.blockerOverlay);
    }

    /**
     * Create the blocker overlay element with all its content.
     * @private
     */
    _createBlockerOverlay() {
      this.blockerOverlay = document.createElement('div');
      this.blockerOverlay.id = 'zen-pomodoro-sine-blocker';
      this.blockerOverlay.className = 'active';

      // Content container
      const content = document.createElement('div');
      content.id = 'zen-pomodoro-sine-blocker-content';

      // Icon (lock symbol)
      const icon = document.createElement('div');
      icon.id = 'zen-pomodoro-sine-blocker-icon';
      icon.textContent = '🔒';

      // Title
      const title = document.createElement('h2');
      title.id = 'zen-pomodoro-sine-blocker-title';
      title.textContent = 'Mod Settings Locked';

      // Message
      const message = document.createElement('p');
      message.id = 'zen-pomodoro-sine-blocker-message';
      message.textContent =
        'The Pomodoro timer is currently active. Mod settings are locked to prevent disabling the focus session.';

      // Timer status
      const timerStatus = document.createElement('div');
      timerStatus.id = 'zen-pomodoro-sine-blocker-timer';
      this._updateTimerStatus(timerStatus);

      // Buttons container
      const buttons = document.createElement('div');
      buttons.id = 'zen-pomodoro-sine-blocker-buttons';

      // Go Back button
      const goBackButton = document.createElement('button');
      goBackButton.className = 'zen-pomodoro-dialog-button secondary';
      goBackButton.textContent = 'Go Back';
      goBackButton.addEventListener('click', () => this._handleGoBack());

      // Stop Timer button
      const stopTimerButton = document.createElement('button');
      stopTimerButton.className = 'zen-pomodoro-dialog-button';
      stopTimerButton.textContent = 'Stop Timer';
      stopTimerButton.addEventListener('click', () => this._handleStopTimer());

      buttons.appendChild(goBackButton);
      buttons.appendChild(stopTimerButton);

      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(timerStatus);
      content.appendChild(buttons);

      this.blockerOverlay.appendChild(content);

      // Set up timer status updates
      this._startTimerStatusUpdates(timerStatus);
    }

    /**
     * Update the timer status display.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _updateTimerStatus(statusElement) {
      const timer = window.zenPomodoroApp?.timer;
      if (!timer) {
        statusElement.textContent = '';
        return;
      }

      const status = timer.getStatus();
      if (!status) {
        statusElement.textContent = '';
        return;
      }

      const timeStr = formatTime(status.remainingTime);
      const phaseLabel = getShortPhaseLabel(status.currentPhase);

      // Don't show cycle info for simple timer mode - only pomodoro mode has cycles
      if (status.mode === 'simple') {
        statusElement.textContent = `${phaseLabel}: ${timeStr}`;
      } else {
        statusElement.textContent = `${phaseLabel}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
      }
    }

    /**
     * Start interval to update timer status display.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _startTimerStatusUpdates(statusElement) {
      // Update immediately
      this._updateTimerStatus(statusElement);

      // Update every second
      this._timerStatusInterval = setInterval(() => {
        if (this.isBlocking && statusElement) {
          this._updateTimerStatus(statusElement);

          // Also check if timer is still active
          if (!window.zenPomodoroApp?.timer?.isActive) {
            this._hideBlocker();
          }
        }
      }, 1000);
    }

    /**
     * Handle the "Go Back" button click.
     * Navigates the user away from the Sine Mods page.
     * Uses shared utility for common navigation logic, but has Sine-specific fallback.
     * @private
     */
    _handleGoBack() {
      logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Go Back on Sine Mod blocker');

      try {
        // Try to go back in history
        // eslint-disable-next-line no-undef
        if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
          // eslint-disable-next-line no-undef
          const webNav = gBrowser.selectedBrowser.webNavigation;
          if (webNav && webNav.canGoBack) {
            webNav.goBack();
            // Hide blocker after navigation
            setTimeout(() => this._hideBlocker(), SINE_BLOCKER_HIDE_DELAY_MS);
            return;
          }
        }

        // Sine-specific fallback: Navigate to main preferences page without hash
        // eslint-disable-next-line no-undef
        if (typeof gBrowser !== 'undefined') {
          // eslint-disable-next-line no-undef
          gBrowser.selectedBrowser.loadURI(Services.io.newURI('about:preferences'), {
            triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
          });
          setTimeout(() => this._hideBlocker(), SINE_BLOCKER_HIDE_DELAY_MS);
          return;
        }

        // Last resort: Just hide the blocker
        this._hideBlocker();
      } catch (e) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Error navigating back', { error: e.message });
        this._hideBlocker();
      }
    }

    /**
     * Handle the "Stop Timer" button click.
     * Uses the same security lockout as stopping the timer normally.
     * @private
     */
    _handleStopTimer() {
      logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Stop Timer on Sine Mod blocker');

      // Use the existing handleStopTimerWithLockout utility function
      // which shows the security lock screen before allowing timer stop
      handleStopTimerWithLockout(() => {
        if (window.zenPomodoroApp) {
          window.zenPomodoroApp.stopTimer();
          // Hide the blocker after timer is stopped
          this._hideBlocker();
        }
      });
    }

    /**
     * Hide the blocker overlay.
     * @private
     */
    _hideBlocker() {
      logger.log(LOG_CATEGORIES.SECURITY, 'Hiding Sine Mod blocker overlay');
      this.isBlocking = false;

      // Clear timer status update interval
      if (this._timerStatusInterval) {
        clearInterval(this._timerStatusInterval);
        this._timerStatusInterval = null;
      }

      if (this.blockerOverlay) {
        this.blockerOverlay.remove();
        this.blockerOverlay = null;
      }
    }

    /**
     * Called when the timer starts.
     * Re-checks if we need to show the blocker.
     */
    onTimerStart() {
      this._checkCurrentPage();
    }

    /**
     * Called when the timer stops.
     * Hides the blocker if it's showing.
     */
    onTimerStop() {
      if (this.isBlocking) {
        this._hideBlocker();
      }
    }

    /**
     * Clean up and destroy the blocker.
     */
    destroy() {
      this._removeGBrowserListeners();
      this._removeWindowListeners();
      this._clearIntervals();
      this._removeBlockerOverlay();
      this.isBlocking = false;
    }

    /**
     * Remove gBrowser event listeners.
     * @private
     */
    _removeGBrowserListeners() {
      removeBrowserListeners(this);
    }

    /**
     * Remove window event listeners.
     * @private
     */
    _removeWindowListeners() {
      if (this.hashChangeHandler) {
        window.removeEventListener('hashchange', this.hashChangeHandler);
      }
    }

    /**
     * Clear any active intervals.
     * @private
     */
    _clearIntervals() {
      if (this._timerStatusInterval) {
        clearInterval(this._timerStatusInterval);
        this._timerStatusInterval = null;
      }
    }

    /**
     * Remove the blocker overlay from the DOM.
     * @private
     */
    _removeBlockerOverlay() {
      if (this.blockerOverlay) {
        this.blockerOverlay.remove();
        this.blockerOverlay = null;
      }
    }
  }

  // ============================================
  // Website Blocker Module (LeechBlock-Style)
  // ============================================

  /**
   * Delay (in ms) after page navigation before checking for blocked websites.
   * This allows the URL to be fully updated before checking.
   * @constant {number}
   */
  const WEBSITE_BLOCKER_CHECK_DELAY_MS = 100;

  /**
   * Delay (in ms) before hiding the blocker overlay after navigation.
   * This ensures the navigation has completed before removing the overlay.
   * @constant {number}
   */
  const WEBSITE_BLOCKER_HIDE_DELAY_MS = 100;

  /**
   * WebsiteBlocker class implements LeechBlock-style website blocking
   * during Pomodoro focus sessions. Supports URL pattern matching with wildcards,
   * exceptions, and keyword-based blocking.
   *
   * Features:
   * - Domain blocking: "youtube.com" - blocks entire domain
   * - Wildcard subdomains: "*.youtube.com" - blocks all subdomains
   * - Path-specific blocking: "youtube.com/watch" - blocks specific paths
   * - Exceptions with + prefix: "+docs.google.com" - allows specific sites
   * - Multiple named rulesets with independent configurations
   */
  class WebsiteBlocker {
    constructor() {
      this.config = getConfig();
      this.blockerOverlay = null;
      this.isBlocking = false;
      this.currentlyBlockedReason = null;
      this.tabSelectHandler = null;
      this.pageShowHandler = null;
      this.progressListener = null;
      this._timerStatusInterval = null;
      this.contentObserver = null; // MutationObserver for dynamic page content
      this._contentObserverDebounceTimeout = null; // Debounce timeout for content observer
    }

    /**
     * Initialize the website blocker.
     * Sets up listeners for tab changes and URL navigation.
     */
    init() {
      logger.log(LOG_CATEGORIES.INIT, 'Initializing Website Blocker');
      this._setupListeners();
      // Check immediately in case we're already on a blocked page
      this._checkCurrentPage();
    }

    /**
     * Set up all event listeners for detecting navigation to blocked websites.
     * @private
     */
    _setupListeners() {
      setupBrowserListeners(this, () => this._checkCurrentPage(), WEBSITE_BLOCKER_CHECK_DELAY_MS);
    }

    /**
     * Check if the blocker should be shown based on timer state.
     * @returns {boolean} True if timer is active
     * @private
     */
    _shouldShowBlocker() {
      return window.zenPomodoroApp?.timer?.isActive || false;
    }

    /**
     * Get the current page URL from gBrowser.
     * @returns {string|null} Current URL or null if unavailable
     * @private
     */
    _getCurrentUrl() {
      try {
        // eslint-disable-next-line no-undef
        if (typeof gBrowser !== 'undefined' && gBrowser.currentURI) {
          // eslint-disable-next-line no-undef
          return gBrowser.currentURI.spec;
        }
      } catch (e) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Error getting current URL', { error: e.message });
      }
      return null;
    }

    /**
     * Check if a URL is an internal browser page that should be skipped.
     * @param {string} url - URL to check
     * @returns {boolean} True if URL is an internal browser page
     * @private
     */
    _isInternalBrowserPage(url) {
      const internalPrefixes = ['about:', 'chrome:', 'moz-extension:'];
      return internalPrefixes.some((prefix) => url.startsWith(prefix));
    }

    /**
     * Hide blocker if currently showing.
     * @private
     */
    _hideBlockerIfShowing() {
      if (this.isBlocking) this._hideBlocker();
    }

    /**
     * Check if current page should be blocked.
     * Shows or hides the blocker overlay based on timer state and current URL.
     * @private
     */
    _checkCurrentPage() {
      // If timer is not active, hide any existing blocker
      if (!this._shouldShowBlocker()) {
        this._hideBlockerIfShowing();
        return;
      }

      const currentUrl = this._getCurrentUrl();
      if (!currentUrl) return;

      // Skip internal browser pages
      if (this._isInternalBrowserPage(currentUrl)) {
        this._hideBlockerIfShowing();
        return;
      }

      // Setup content observer for dynamic pages (keyword checking)
      try {
        // eslint-disable-next-line no-undef
        if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
          // eslint-disable-next-line no-undef
          const contentDoc = gBrowser.selectedBrowser.contentDocument;
          if (contentDoc && contentDoc.body) {
            this._setupContentObserver(contentDoc);
          }
        }
      } catch (e) {
        // Log content access denied errors for debugging
        logger.log(LOG_CATEGORIES.SECURITY, 'Content document access denied', { error: e.message });
      }

      // Reload config and check against active rulesets
      this.config = getConfig();
      const blockResult = this._checkUrlAgainstActiveRulesets(
        currentUrl,
        this.config.activeRulesets || ['default'],
        this.config.rulesets || []
      );

      logger.log(LOG_CATEGORIES.SECURITY, 'Website blocker page check', {
        url: currentUrl,
        blocked: blockResult.blocked,
        isBlocking: this.isBlocking,
      });

      if (blockResult.blocked) {
        this._showBlocker(blockResult.reason, blockResult.rulesetName);
      } else {
        this._hideBlockerIfShowing();
      }
    }

    /**
     * Setup content observer for dynamic pages.
     * Re-checks keywords when page content changes significantly.
     *
     * NOTE: Due to browser security restrictions (cross-origin), this observer
     * can only monitor DOM changes for URL-based blocking. Keyword content scanning
     * is limited to tab titles only (see _getPageText). The observer still triggers
     * re-checks which will verify the tab title against keyword rules.
     *
     * @param {Document} contentDoc - Content document to observe
     * @private
     */
    _setupContentObserver(contentDoc) {
      // Clean up any existing observer
      if (this.contentObserver) {
        this.contentObserver.disconnect();
        this.contentObserver = null;
      }

      // Clear any existing debounce timeout
      if (this._contentObserverDebounceTimeout) {
        clearTimeout(this._contentObserverDebounceTimeout);
        this._contentObserverDebounceTimeout = null;
      }

      if (!contentDoc || !contentDoc.body) return;

      // Only observe if there are keyword rules configured (performance optimization)
      const config = getConfig();
      const activeRulesets = config.activeRulesets || ['default'];
      const rulesets = config.rulesets || [];

      let hasKeywordRules = false;
      for (const rulesetId of activeRulesets) {
        const ruleset = rulesets.find((r) => r.id === rulesetId);
        if (ruleset && ruleset.rules) {
          hasKeywordRules = ruleset.rules.some((r) => r.type === 'keyword' && r.pattern);
          if (hasKeywordRules) break;
        }
      }

      if (!hasKeywordRules) {
        logger.log(
          LOG_CATEGORIES.SECURITY,
          'Skipping content observer - no keyword rules configured'
        );
        return;
      }

      this.contentObserver = new MutationObserver(() => {
        // Debounce to avoid excessive checks
        if (this._contentObserverDebounceTimeout) {
          clearTimeout(this._contentObserverDebounceTimeout);
        }
        this._contentObserverDebounceTimeout = setTimeout(() => {
          if (window.zenPomodoroApp?.timer?.isActive) {
            this._checkCurrentPage();
          }
        }, CONTENT_OBSERVER_DEBOUNCE_DELAY_MS);
      });

      this.contentObserver.observe(contentDoc.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    /**
     * Check URL against all active rulesets.
     * @param {string} url - URL to check
     * @param {string[]} activeRulesets - List of active ruleset IDs
     * @param {Object[]} rulesets - All available rulesets
     * @returns {{blocked: boolean, reason: string|null, rulesetName: string|null}} Block result
     * @private
     */
    _checkUrlAgainstActiveRulesets(url, activeRulesets, rulesets) {
      for (const rulesetId of activeRulesets) {
        const ruleset = rulesets.find((r) => r.id === rulesetId);
        if (!ruleset || !ruleset.enabled) continue;

        const blockResult = this._checkUrlAgainstRuleset(url, ruleset);
        if (blockResult.blocked) {
          return { blocked: true, reason: blockResult.reason, rulesetName: ruleset.name };
        }
      }
      return { blocked: false, reason: null, rulesetName: null };
    }

    /**
     * Check if a pattern is an exception pattern (starts with +).
     * @param {string} pattern - Pattern to check
     * @returns {boolean} True if pattern is an exception
     * @private
     */
    _isExceptionPattern(pattern) {
      return pattern.startsWith('+');
    }

    /**
     * Check if a pattern is a block pattern (not + or ~ prefix).
     * @param {string} pattern - Pattern to check
     * @returns {boolean} True if pattern is a block pattern
     * @private
     */
    _isBlockPattern(pattern) {
      return !pattern.startsWith('+') && !pattern.startsWith('~');
    }

    /**
     * Check if URL matches any exception pattern in the sites list.
     * @param {string} url - URL to check
     * @param {string[]} sites - List of site patterns
     * @returns {boolean} True if URL matches an exception pattern
     * @private
     */
    _urlMatchesException(url, sites) {
      for (const pattern of sites) {
        if (!this._isExceptionPattern(pattern)) continue;

        const exceptionPattern = pattern.substring(1);
        if (this._matchesUrlPattern(url, exceptionPattern)) {
          logger.log(LOG_CATEGORIES.SECURITY, 'URL matches exception pattern', {
            url: url,
            pattern: exceptionPattern,
          });
          return true;
        }
      }
      return false;
    }

    /**
     * Find a blocking pattern that matches the URL.
     * @param {string} url - URL to check
     * @param {string[]} sites - List of site patterns
     * @returns {string|null} Matching block pattern or null
     * @private
     */
    _findBlockingPattern(url, sites) {
      for (const pattern of sites) {
        if (this._isBlockPattern(pattern) && this._matchesUrlPattern(url, pattern)) {
          return pattern;
        }
      }
      return null;
    }

    /**
     * Check URL against a ruleset (includes keyword checking).
     *
     * PRECEDENCE RULES (allow conditions ALWAYS take precedence over block conditions):
     * 1. Check if URL matches any ALLOW website pattern → if yes, return NOT blocked
     * 2. Check if tab title contains any ALLOW keyword → if yes, return NOT blocked
     * 3. Check if URL matches any BLOCK website pattern → if yes, return blocked
     * 4. Check if tab title contains any BLOCK keyword → if yes, return blocked
     * 5. Otherwise return NOT blocked
     *
     * Example: If youtube.com is blocked but "studying" is an allow keyword,
     * visiting a YouTube page with "studying" in the tab title will NOT be blocked.
     *
     * NOTE: Keyword checking only matches against tab titles due to browser
     * security restrictions that prevent access to page body content.
     *
     * @param {string} url - URL to check
     * @param {Object} ruleset - Ruleset configuration
     * @returns {{blocked: boolean, reason: string|null}} Block result
     * @private
     */
    _checkUrlAgainstRuleset(url, ruleset) {
      const rules = ruleset.rules || [];
      // checkTitleOnly is always effectively true due to browser security restrictions
      // but we keep the setting for backward compatibility with saved configs
      const checkTitleOnly = ruleset.checkTitleOnly !== false;

      // Separate rules by type and condition for precedence checking
      const rulesByCategory = this._categorizeRules(rules);

      // ========================================
      // STEP 1: Check URL allow rules (highest priority)
      // Allow rules ALWAYS take precedence over block rules
      // ========================================
      if (this._urlMatchesAnyRule(url, rulesByCategory.websiteAllow)) {
        logger.log(LOG_CATEGORIES.SECURITY, 'URL allowed by website allow rule', { url: url });
        return { blocked: false, reason: null };
      }

      // Get page title once for all keyword checks (performance optimization)
      // NOTE: Only tab title is accessible due to cross-origin security restrictions
      let pageText = null;
      const getPageTextOnce = () => {
        if (pageText === null) {
          pageText = this._getPageText(checkTitleOnly);
        }
        return pageText;
      };

      // ========================================
      // STEP 2: Check allow keywords (second highest priority)
      // Allow keywords override ALL block conditions
      // ========================================
      const allowKeywordMatch = this._findMatchingKeyword(
        rulesByCategory.keywordAllow,
        getPageTextOnce
      );
      if (allowKeywordMatch) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Page allowed by keyword allow rule', {
          keyword: allowKeywordMatch,
          pageTitle: getPageTextOnce(),
        });
        return { blocked: false, reason: null };
      }

      // ========================================
      // STEP 3: Check URL block rules
      // Only checked after all allow conditions have passed
      // ========================================
      const blockingUrlRule = this._findMatchingUrlRule(url, rulesByCategory.websiteBlock);
      if (blockingUrlRule) {
        return { blocked: true, reason: `URL matches pattern: ${blockingUrlRule.pattern}` };
      }

      // ========================================
      // STEP 4: Check keyword block rules
      // Lowest priority - only blocks if no allow rules matched
      // ========================================
      const blockKeywordMatch = this._findMatchingKeyword(
        rulesByCategory.keywordBlock,
        getPageTextOnce
      );
      if (blockKeywordMatch) {
        return { blocked: true, reason: `Page contains blocked keyword: "${blockKeywordMatch}"` };
      }

      // ========================================
      // STEP 5: Default - not blocked
      // ========================================
      return { blocked: false, reason: null };
    }

    /**
     * Categorize rules into groups by type (website/keyword) and condition (block/allow).
     *
     * This separation enables the precedence logic in _checkUrlAgainstRuleset:
     * - websiteAllow: URL patterns that should NEVER be blocked (highest priority)
     * - keywordAllow: Keywords in tab titles that override all blocks (second priority)
     * - websiteBlock: URL patterns to block (third priority)
     * - keywordBlock: Keywords in tab titles to block (lowest priority)
     *
     * @param {Array} rules - Array of rule objects with {type, condition, pattern}
     * @returns {Object} Categorized rules: {websiteBlock, websiteAllow, keywordBlock, keywordAllow}
     * @private
     */
    _categorizeRules(rules) {
      return {
        // Allow rules (checked first - highest priority)
        websiteAllow: rules.filter(
          (r) => r.type === 'website' && r.condition === 'allow' && r.pattern
        ),
        keywordAllow: rules.filter(
          (r) => r.type === 'keyword' && r.condition === 'allow' && r.pattern
        ),
        // Block rules (checked after allows - lower priority)
        websiteBlock: rules.filter(
          (r) => r.type === 'website' && r.condition === 'block' && r.pattern
        ),
        keywordBlock: rules.filter(
          (r) => r.type === 'keyword' && r.condition === 'block' && r.pattern
        ),
      };
    }

    /**
     * Check if URL matches any rule in the list
     * @param {string} url - URL to check
     * @param {Array} rules - Array of rules to check against
     * @returns {boolean} True if URL matches any rule
     * @private
     */
    _urlMatchesAnyRule(url, rules) {
      return rules.some((rule) => this._matchesUrlPattern(url, rule.pattern));
    }

    /**
     * Find the first URL rule that matches
     * @param {string} url - URL to check
     * @param {Array} rules - Array of rules to check against
     * @returns {Object|null} Matching rule or null
     * @private
     */
    _findMatchingUrlRule(url, rules) {
      return rules.find((rule) => this._matchesUrlPattern(url, rule.pattern)) || null;
    }

    /**
     * Find the first matching keyword in page text
     * @param {Array} rules - Array of keyword rules
     * @param {Function} getPageText - Function to get page text (lazy evaluation)
     * @returns {string|null} Matching keyword or null
     * @private
     */
    _findMatchingKeyword(rules, getPageText) {
      for (const rule of rules) {
        const text = getPageText();
        if (this._keywordMatches(text, rule.pattern)) {
          return rule.pattern;
        }
      }
      return null;
    }

    /**
     * Check if keyword matches in text using word boundary matching
     * to avoid false positives like "king" matching "working"
     * @param {string} text - Page text to search
     * @param {string} keyword - Keyword to find
     * @returns {boolean} True if keyword matches
     * @private
     */
    _keywordMatches(text, keyword) {
      if (!text || !keyword) return false;
      // Use word boundary matching to avoid false positives
      // $& in replacement string refers to the matched character
      const escapedKeyword = keyword.replace(REGEX_ESCAPE_PATTERN, '\\$&');
      const regex = new RegExp('\\b' + escapedKeyword + '\\b', 'i');
      return regex.test(text);
    }

    /**
     * Get page title for keyword matching.
     * NOTE: Due to browser security restrictions (cross-origin), Zen Browser mods
     * running in the chrome context cannot access webpage body content (innerText).
     * Only the tab title is accessible, so keywords are matched against titles only.
     * @param {boolean} _titleOnly - Ignored; always returns title only due to security restrictions
     * @returns {string} Page title text
     * @private
     */
    // eslint-disable-next-line no-unused-vars
    _getPageText(_titleOnly = true) {
      try {
        // eslint-disable-next-line no-undef
        if (typeof gBrowser === 'undefined') {
          return '';
        }

        // Get tab title from multiple sources for reliability
        // Due to cross-origin security restrictions, we cannot access contentDocument.body
        // Only the tab title is accessible from the browser chrome context
        /* eslint-disable no-undef */
        const title =
          gBrowser.selectedTab?.label ||
          gBrowser.selectedBrowser?.contentTitle ||
          gBrowser.contentTitle ||
          '';
        /* eslint-enable no-undef */

        return title;
      } catch (e) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Failed to get page title', { error: e.message });
        return '';
      }
    }

    /**
     * Normalize a URL pattern by removing protocol and www prefix.
     * @param {string} pattern - Pattern to normalize
     * @returns {string} Normalized pattern
     * @private
     */
    _normalizePattern(pattern) {
      return pattern
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '');
    }

    /**
     * Check if URL matches a wildcard pattern.
     * @param {string} hostname - URL hostname
     * @param {string} fullUrl - Full URL (hostname + pathname)
     * @param {string} normalizedPattern - Normalized pattern with wildcards
     * @returns {boolean} True if URL matches wildcard pattern
     * @private
     */
    _matchesWildcardPattern(hostname, fullUrl, normalizedPattern) {
      // $& in replacement string refers to the matched character
      const regexPattern = normalizedPattern
        .replace(REGEX_ESCAPE_PATTERN_KEEP_ASTERISK, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp('^' + regexPattern, 'i');
      return regex.test(hostname) || regex.test(fullUrl);
    }

    /**
     * Check if URL matches a simple (non-wildcard) pattern.
     * @param {string} hostname - URL hostname (without www)
     * @param {string} pathname - URL pathname
     * @param {string} normalizedPattern - Normalized pattern
     * @returns {boolean} True if URL matches simple pattern
     * @private
     */
    _matchesSimplePattern(hostname, pathname, normalizedPattern) {
      const normalizedHostname = hostname.replace(/^www\./, '');
      const fullPath = normalizedHostname + pathname;

      return (
        normalizedHostname === normalizedPattern ||
        normalizedHostname.endsWith('.' + normalizedPattern) ||
        fullPath.startsWith(normalizedPattern)
      );
    }

    /**
     * Match URL against pattern (supports wildcards).
     * @param {string} url - URL to check
     * @param {string} pattern - Pattern to match (supports * wildcard)
     * @returns {boolean} True if URL matches pattern
     * @private
     */
    _matchesUrlPattern(url, pattern) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const pathname = urlObj.pathname.toLowerCase();
        const fullUrl = hostname + pathname;
        const normalizedPattern = this._normalizePattern(pattern);

        // Handle wildcard patterns
        if (normalizedPattern.includes('*')) {
          return this._matchesWildcardPattern(hostname, fullUrl, normalizedPattern);
        }

        // Simple domain/path matching
        return this._matchesSimplePattern(hostname, pathname, normalizedPattern);
      } catch (e) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Error matching URL pattern', {
          url: url,
          pattern: pattern,
          error: e.message,
        });
        return false;
      }
    }

    /**
     * Show the blocker overlay.
     * @param {string} reason - Reason for blocking
     * @param {string} rulesetName - Name of the ruleset that triggered the block
     * @private
     */
    _showBlocker(reason, rulesetName) {
      if (this.blockerOverlay) return;

      logger.log(LOG_CATEGORIES.SECURITY, 'Website blocker triggered', {
        reason: reason,
        rulesetName: rulesetName,
      });
      this.isBlocking = true;
      this.currentlyBlockedReason = reason;

      this._createBlockerOverlay(reason, rulesetName);
      document.documentElement.appendChild(this.blockerOverlay);
    }

    /**
     * Create the blocker overlay element with all its content.
     * @param {string} reason - Reason for blocking
     * @param {string} rulesetName - Name of the ruleset that triggered the block
     * @private
     */
    _createBlockerOverlay(reason, rulesetName) {
      this.blockerOverlay = document.createElement('div');
      this.blockerOverlay.id = 'zen-pomodoro-website-blocker';
      this.blockerOverlay.className = 'active';

      // Content container
      const content = document.createElement('div');
      content.id = 'zen-pomodoro-website-blocker-content';

      // Icon (block symbol)
      const icon = document.createElement('div');
      icon.id = 'zen-pomodoro-website-blocker-icon';
      icon.textContent = '🚫';

      // Title
      const title = document.createElement('h2');
      title.textContent = 'Website Blocked';

      // Message - show keyword info if blocked by keyword
      const message = document.createElement('p');
      message.textContent =
        reason && reason.includes('keyword')
          ? `Blocked: ${reason}`
          : 'This website is blocked during your focus session.';

      // Ruleset info
      const rulesetInfo = document.createElement('p');
      rulesetInfo.className = 'zen-pomodoro-blocker-ruleset';
      rulesetInfo.textContent = `Ruleset: ${rulesetName}`;

      // Timer status
      const timerStatus = document.createElement('div');
      timerStatus.id = 'zen-pomodoro-website-blocker-timer';
      this._updateTimerStatus(timerStatus);

      // Buttons container
      const buttons = document.createElement('div');
      buttons.id = 'zen-pomodoro-website-blocker-buttons';

      // Go Back button
      const goBackButton = document.createElement('button');
      goBackButton.className = 'zen-pomodoro-dialog-button secondary';
      goBackButton.textContent = 'Go Back';
      goBackButton.addEventListener('click', () => this._handleGoBack());

      // Stop Timer button
      const stopTimerButton = document.createElement('button');
      stopTimerButton.className = 'zen-pomodoro-dialog-button';
      stopTimerButton.textContent = 'Stop Timer';
      stopTimerButton.addEventListener('click', () => this._handleStopTimer());

      buttons.appendChild(goBackButton);
      buttons.appendChild(stopTimerButton);

      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(rulesetInfo);
      content.appendChild(timerStatus);
      content.appendChild(buttons);

      this.blockerOverlay.appendChild(content);

      // Set up timer status updates
      this._startTimerStatusUpdates(timerStatus);
    }

    /**
     * Update the timer status display.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _updateTimerStatus(statusElement) {
      const timer = window.zenPomodoroApp?.timer;
      if (!timer) {
        statusElement.textContent = '';
        return;
      }

      const status = timer.getStatus();
      if (!status) {
        statusElement.textContent = '';
        return;
      }

      const timeStr = formatTime(status.remainingTime);
      const phaseLabel = getShortPhaseLabel(status.currentPhase);

      // Don't show cycle info for simple timer mode - only pomodoro mode has cycles
      if (status.mode === 'simple') {
        statusElement.textContent = `${phaseLabel}: ${timeStr}`;
      } else {
        statusElement.textContent = `${phaseLabel}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
      }
    }

    /**
     * Start interval to update timer status display.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _startTimerStatusUpdates(statusElement) {
      // Update immediately
      this._updateTimerStatus(statusElement);

      // Update every second
      this._timerStatusInterval = setInterval(() => {
        if (this.isBlocking && statusElement) {
          this._updateTimerStatus(statusElement);

          // Also check if timer is still active
          if (!window.zenPomodoroApp?.timer?.isActive) {
            this._hideBlocker();
          }
        }
      }, 1000);
    }

    /**
     * Handle the "Go Back" button click.
     * Navigates the user away from the blocked website.
     * Uses shared utility for common navigation logic.
     * @private
     */
    _handleGoBack() {
      logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Go Back on website blocker');
      handleBlockerGoBack(() => this._hideBlocker(), WEBSITE_BLOCKER_HIDE_DELAY_MS);
    }

    /**
     * Handle the "Stop Timer" button click.
     * Uses the same security lockout as stopping the timer normally.
     * @private
     */
    _handleStopTimer() {
      logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Stop Timer on website blocker');

      // Use the existing handleStopTimerWithLockout utility function
      // which shows the security lock screen before allowing timer stop
      handleStopTimerWithLockout(() => {
        if (window.zenPomodoroApp) {
          window.zenPomodoroApp.stopTimer();
          // Hide the blocker after timer is stopped
          this._hideBlocker();
        }
      });
    }

    /**
     * Hide the blocker overlay.
     * @private
     */
    _hideBlocker() {
      logger.log(LOG_CATEGORIES.SECURITY, 'Hiding website blocker overlay');
      this.isBlocking = false;
      this.currentlyBlockedReason = null;

      // Clear timer status update interval
      if (this._timerStatusInterval) {
        clearInterval(this._timerStatusInterval);
        this._timerStatusInterval = null;
      }

      // Disconnect content observer
      if (this.contentObserver) {
        this.contentObserver.disconnect();
        this.contentObserver = null;
      }

      if (this.blockerOverlay) {
        this.blockerOverlay.remove();
        this.blockerOverlay = null;
      }
    }

    /**
     * Called when the timer starts.
     * Re-checks if we need to show the blocker.
     */
    onTimerStart() {
      this._checkCurrentPage();
    }

    /**
     * Called when the timer stops.
     * Hides the blocker if it's showing.
     */
    onTimerStop() {
      if (this.isBlocking) {
        this._hideBlocker();
      }
    }

    /**
     * Clean up and destroy the blocker.
     */
    destroy() {
      this._removeGBrowserListeners();
      this._clearIntervals();
      this._disconnectContentObserver();
      this._removeBlockerOverlay();
      this.isBlocking = false;
    }

    /**
     * Disconnect the content observer if active.
     * @private
     */
    _disconnectContentObserver() {
      if (this.contentObserver) {
        this.contentObserver.disconnect();
        this.contentObserver = null;
      }
    }

    /**
     * Remove gBrowser event listeners.
     * @private
     */
    _removeGBrowserListeners() {
      removeBrowserListeners(this);
    }

    /**
     * Clear any active intervals.
     * @private
     */
    _clearIntervals() {
      if (this._timerStatusInterval) {
        clearInterval(this._timerStatusInterval);
        this._timerStatusInterval = null;
      }
    }

    /**
     * Remove the blocker overlay from the DOM.
     * @private
     */
    _removeBlockerOverlay() {
      if (this.blockerOverlay) {
        this.blockerOverlay.remove();
        this.blockerOverlay = null;
      }
    }
  }

  // ============================================
  // Main Application Class
  // ============================================

  class ZenPomodoroApp {
    constructor() {
      this.timer = new PomodoroTimer();
      this.workspace = new WorkspaceDetector();
      this.overlay = new OverlayManager();
      this.keyboardShortcut = new KeyboardShortcutHandler();
      this.security = new SecurityManager();
      this.sineModBlocker = new SineModBlocker(); // NEW: Sine Mod settings blocker
      this.websiteBlocker = new WebsiteBlocker(); // NEW: LeechBlock-style website blocker
      this.logger = logger; // Expose logger instance
      this.notificationPermissionRequested = false;
      this.initialized = false; // DUPLICATE FIX: Track initialization to prevent duplicate setup

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

      // Initialize modules
      logger.log(LOG_CATEGORIES.INIT, 'Initializing keyboard shortcut handler');
      this.keyboardShortcut.init();

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

      // Setup workspace change callback
      this.workspace.onWorkspaceChange = (workspaceId, isBlocked) => {
        this.onWorkspaceChange(workspaceId, isBlocked);
      };

      // Try to restore timer state
      const restored = this.timer.loadState();
      if (restored) {
        logger.log(LOG_CATEGORIES.INIT, 'Timer state restored from previous session');
        console.log('Restored timer state from previous session');
        this.updateOverlayVisibility();
      }

      // MISSING FEATURE: Request notification permission
      this.requestNotificationPermission();

      // Expose app globally for debugging and keyboard shortcut
      window.zenPomodoroApp = this;

      logger.log(LOG_CATEGORIES.INIT, 'Application initialization complete');
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

      // Notify Sine Mod Blocker that timer started
      this.sineModBlocker.onTimerStart();

      // Notify Website Blocker that timer started
      this.websiteBlocker.onTimerStart();

      // Double-check overlay visibility after a short delay
      // This ensures the DOM has settled after timer start
      setTimeout(() => {
        this.updateOverlayVisibility();
      }, DOM_SETTLE_DELAY_MS);
    }

    /**
     * Stop the timer
     */
    stopTimer() {
      logger.log(LOG_CATEGORIES.TIMER, 'Stop timer requested by user');

      this.timer.stop();
      this.overlay.hide();
      this.overlay.hideIndicator();

      // Notify Sine Mod Blocker that timer stopped
      this.sineModBlocker.onTimerStop();

      // Notify Website Blocker that timer stopped
      this.websiteBlocker.onTimerStop();
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
    }

    /**
     * Handle workspace change
     */
    onWorkspaceChange(workspaceId, isBlocked) {
      logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace changed', {
        workspaceId: workspaceId,
        isBlocked: isBlocked,
      });

      this.updateOverlayVisibility();
    }

    /**
     * Update overlay visibility based on current state
     * Bug Fix: Also hide indicator when timer is not active
     */
    updateOverlayVisibility() {
      if (!this.timer.isActive) {
        this.overlay.hide();
        this.overlay.hideIndicator();
        return;
      }

      const isBlocked = this.workspace.isCurrentWorkspaceBlocked();

      if (isBlocked) {
        const status = this.timer.getStatus();
        this.overlay.show(status.currentPhase);
        this.overlay.updateDisplay(
          status.remainingTime,
          status.currentPhase,
          status.currentCycle,
          status.totalCycles
        );
      } else {
        this.overlay.hide();
      }
    }

    /**
     * Show notification
     * SECURITY FIX: Simplified nested try-catch with conditional icon property
     */
    showNotification(phase) {
      const messages = {
        focus: 'Time to focus! 💪',
        break: 'Take a break! ☕',
        'long-break': 'Long break time! 🌟',
        complete: 'Pomodoro session complete! 🎉',
      };

      const message = messages[phase] || 'Pomodoro timer';

      // Browser notification with permission check
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          // Use chrome:// URI for icon (internal browser resource)
          // Falls back gracefully if path doesn't exist in some Zen Browser versions
          new Notification('Zen Pomodoro Timer', {
            body: message,
            icon: 'chrome://branding/content/about-logo.png',
          });
        } else {
          console.log('Notification:', message);
        }
      } catch (e) {
        console.log('Notification:', message);
      }
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
     * Clean up and destroy the application.
     * MEMORY LEAK FIX: Properly cleanup all modules when browser shuts down.
     * This method is called when the browser window is unloading.
     */
    destroy() {
      logger.log(LOG_CATEGORIES.INIT, 'Application shutting down, cleaning up resources');

      // Clean up all modules that have destroy methods
      if (this.sineModBlocker) {
        this.sineModBlocker.destroy();
      }

      if (this.websiteBlocker) {
        this.websiteBlocker.destroy();
      }

      if (this.keyboardShortcut) {
        this.keyboardShortcut.destroy();
      }

      if (this.overlay) {
        this.overlay.destroy();
      }

      if (this.workspace) {
        this.workspace.stopMonitoring();
      }

      if (this.timer) {
        this.timer.stop();
      }

      if (this.security) {
        this.security.cleanupLockScreen();
      }

      this.initialized = false;

      logger.log(LOG_CATEGORIES.INIT, 'Application cleanup complete');
    }
  }

  // ============================================
  // Initialize Application
  // ============================================

  // Create and store the app instance for cleanup
  const app = new ZenPomodoroApp();

  // MEMORY LEAK FIX: Register shutdown handler to cleanup resources
  // This ensures SineModBlocker and other modules are properly destroyed
  window.addEventListener(
    'unload',
    () => {
      if (app) {
        app.destroy();
      }
    },
    { once: true }
  );
})();
