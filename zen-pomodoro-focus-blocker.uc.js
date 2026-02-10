/**
 * Zen Pomodoro Focus Blocker Mod
 * Version: 1.4.4
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
 * - Custom Pomodoro Cycles (NEW in 1.3.2)
 *
 * CODE QUALITY:
 * - Proper input validation
 * - Reduced save frequency
 * - Config stored with timer state
 * - Viewport boundary checks
 * - Accessibility improvements
 * - Settings consolidated to preferences.json
 *
 * ARCHITECTURE:
 * - Modular IIFE pattern for better code organization
 * - Clear module boundaries with public interfaces
 * - No global variable pollution
 */

(() => {
  'use strict';

  // ============================================
  // Constants Module
  // ============================================

  /**
   * Constants module - Plain object containing all application constants.
   * This module has no dependencies and is referenced by all other modules.
   */
  const Constants = {
    PREF_PREFIX: 'zen-pomodoro',
    MOD_VERSION: '1.4.4',

    /** Modifier keys used by the keyboard shortcut recorder */
    MODIFIER_KEYS: ['Control', 'Alt', 'Shift', 'Meta'],

    /** Valid lockout method types for settings access control */
    LOCKOUT_METHODS: {
      CODE: 'code',
      HOLD: 'hold',
    },

    /** Reminder mode types - only one can be active at a time */
    REMINDER_MODES: {
      NONE: 'none',
      DAILY: 'daily',
      POST_SESSION: 'post-session',
    },

    /** Data attribute name used to mark dialogs that should not save their position */
    DATA_NO_POSITION_SAVE: 'data-no-position-save',

    /** Save state interval in seconds (every 10 seconds for performance) */
    SAVE_STATE_INTERVAL_SECONDS: 10,

    /** Delay for DOM settling after timer start (in milliseconds) - 200ms provides more reliable settling */
    DOM_SETTLE_DELAY_MS: 200,

    /** Delay for showing restoration notification after DOM is ready (in milliseconds) */
    RESTORATION_NOTIFICATION_DELAY_MS: 500,

    /** Maximum z-index value for overlay (highest possible value for 32-bit signed integer) */
    MAX_OVERLAY_Z_INDEX: '2147483647',

    /** Minimum content area dimension for valid overlay bounds (in pixels) */
    MIN_CONTENT_AREA_DIMENSION: 100,

    /** Debounce delay for content observer checks (in milliseconds) */
    CONTENT_OBSERVER_DEBOUNCE_DELAY_MS: 500,

    /** Transition phase duration in seconds (5 minutes warning before focus resumes) */
    TRANSITION_PHASE_DURATION_SECONDS: 5 * 60,

    /** Post-session reminder escalation factor (50% increase per skip) */
    POST_SESSION_ESCALATION_FACTOR: 1.5,

    /** Post-session reminder check interval (1 minute in milliseconds) */
    POST_SESSION_CHECK_INTERVAL_MS: 60 * 1000,

    /** Daily reminder escalation factor (50% increase per skip) */
    DAILY_REMINDER_ESCALATION_FACTOR: 1.5,

    /** Daily reminder check interval (1 minute in milliseconds) */
    DAILY_REMINDER_CHECK_INTERVAL_MS: 60 * 1000,

    /** Startup delay before showing daily reminder (3 seconds to allow timer state restoration) */
    DAILY_REMINDER_STARTUP_DELAY_MS: 3 * 1000,

    /** Early morning cutoff time for auto-off detection (06:00 AM in minutes since midnight) */
    EARLY_MORNING_CUTOFF_MINUTES: 6 * 60,

    /** Delay for workspace mutation handling to allow DOM to settle (in milliseconds) */
    WORKSPACE_MUTATION_DELAY_MS: 50,

    /** Regex pattern for escaping all regex metacharacters (including backslashes) in strings */
    REGEX_ESCAPE_PATTERN: /[.*+?^${}()|[\]\\]/g,

    /** Regex pattern for escaping regex metacharacters except asterisk (for wildcard patterns) */
    REGEX_ESCAPE_PATTERN_KEEP_ASTERISK: /[.+?^${}()|[\]\\]/g,

    /** Log categories for different parts of the application */
    LOG_CATEGORIES: {
      TIMER: 'TIMER',
      SETTINGS: 'SETTINGS',
      MENU: 'MENU',
      OVERLAY: 'OVERLAY',
      WORKSPACE: 'WORKSPACE',
      SECURITY: 'SECURITY',
      INIT: 'INIT',
      SYNC: 'SYNC',
    },

    /** Alert messages for Distraction Dump timer locking */
    DISTRACTION_DUMP_LOCK_ALERT: {
      TITLE: 'Timer Locked',
      MESSAGE: 'Timer is locked during Distraction Dump. End the dump first.',
    },

    /** Delay (in ms) before revoking the URL after export download starts */
    URL_REVOKE_DELAY_MS: 200,

    /** Keys to filter out from logged data for security */
    SENSITIVE_KEYS: ['password', 'code', 'secret', 'token', 'credential', 'auth'],

    /** Selectors to try for workspace container for MutationObserver (order matters) */
    WORKSPACE_CONTAINER_SELECTORS: [
      '#tabbrowser-arrowscrollbox',
      '#zen-workspace-button-container',
      '#zen-workspaces-button-container',
      '[id*="workspace"]',
      '#navigator-toolbox',
    ],

    /** Selectors to try for content area to append overlay (order matters) */
    CONTENT_AREA_SELECTORS: [
      '#tabbrowser-tabbox',
      '#tabbrowser-tabpanels',
      '#appcontent',
      '#zen-main-view',
      '#browser',
      '#main-window',
    ],

    /** Attribute names to check for workspace name, in priority order */
    WORKSPACE_NAME_ATTRIBUTES: [
      'data-workspace-name',
      'data-name',
      'label',
      'tooltiptext',
      'aria-label',
      'title',
    ],

    /** Maximum length for page title in log messages */
    MAX_TITLE_LOG_LENGTH: 50,

    /** Default configuration object */
    DEFAULT_CONFIG: {
      timerMode: 'pomodoro',
      simpleDuration: 25,
      focusDuration: 25,
      breakDuration: 5,
      cycles: 4,
      blockedWorkspaces: [],
      overlayColor: '#808080',
      motivationalMessage: 'Get back to work.',
      settingsLockIdleMethod: 'hold',
      settingsLockActiveMethod: 'code',
      settingsLockIdleHoldDuration: 10,
      settingsLockActiveHoldDuration: 25,
      settingsLockIdleCodeLength: 48,
      settingsLockActiveCodeLength: 96,
      settingsLockActiveCharacterSet: 'all-typeable',
      enableNotifications: true,
      enableAudioAlerts: false,
      phase: 'focus',
      keyboardShortcut: 'Alt+Shift+P',
      rulesets: [
        {
          id: 'default',
          name: 'Default Blocklist',
          enabled: true,
          rules: [],
          checkTitleOnly: true,
          blockedWorkspaces: [],
        },
      ],
      activeRulesets: ['default'],
      reminderMode: 'post-session', // Options: 'none', 'daily', 'post-session'
      dailyReminderTimes: ['11:15', '16:15'],
      dailyReminderSkipMethod: 'hold',
      dailyReminderSkipHoldDuration: 15,
      dailyReminderSkipCodeLength: 32,
      dailyReminderSkipCount: 0,
      dailyReminderLastSkipTime: null,
      dailyReminderSkipCooldown: 10,
      lastTimerStartTime: null,
      dailyRemindersShownToday: [],
      postSessionIdleTime: 45,
      postSessionSkipCooldown: 30,
      postSessionSkipMethod: 'hold',
      postSessionSkipHoldDuration: 20,
      postSessionSkipCodeLength: 48,
      postSessionFocusTimeGoal: 150,
      totalFocusTimeToday: 0,
      lastFocusTimeResetDate: '',
      postSessionSkipCount: 0,
      postSessionLastSkipTime: null,
      postSessionIdleStartTime: null,
      postSessionReminderEndTime: '00:30',
      postSessionReminderDisabledForDay: false,
      /** Distraction Dump feature - allows users to capture distracting thoughts */
      distractionDumpEnabled: true,
      /** Default duration for distraction dump in minutes */
      distractionDumpDuration: 25,
      /** Maximum duration for distraction dump in minutes */
      distractionDumpMaxDuration: 35,
      /** Custom Pomodoro Cycles - user-defined custom timer sequences */
      customCycles: [],
      /** Timer reminders - notify user before phase ends */
      timerRemindersEnabled: true,
      /** Minutes before focus phase ends to show reminder (default: 20, 10, 5, 1) */
      focusPhaseReminders: [20, 10, 5, 1],
      /** Minutes before break phase ends to show reminder (default: 5, 1) */
      breakPhaseReminders: [5, 1],
      /** Keyboard shortcut to toggle timer indicator visibility (hide/show) */
      toggleIndicatorShortcut: 'Alt+Shift+H',
    },

    /** Cross-window sync: pref key for timer sync state */
    SYNC_PREF_KEY: 'timer-sync',
    /** Cross-window sync: pref key for timer owner */
    OWNER_PREF_KEY: 'timer-owner',
    /** Cross-window sync: heartbeat timeout in ms - if no heartbeat for this long, owner is dead */
    OWNER_HEARTBEAT_TIMEOUT_MS: 30000,
    /** Cross-window sync: Services.obs topic for log entry broadcasting */
    LOG_BROADCAST_TOPIC: 'zen-pomodoro-log',
    /** Cross-window sync: Services.obs topic for requesting logs from other windows */
    LOG_REQUEST_TOPIC: 'zen-pomodoro-log-request',
    /** Cross-window sync: interval for secondary windows to check owner heartbeat (ms) */
    HEARTBEAT_CHECK_INTERVAL_MS: 5000,
    /** Cross-window sync: how often owner writes heartbeat (ms, wall-clock) */
    HEARTBEAT_WRITE_INTERVAL_MS: 5000,
  };

  // Freeze Constants and nested objects to prevent accidental mutation
  Object.freeze(Constants.LOG_CATEGORIES);
  Object.freeze(Constants.LOCKOUT_METHODS);
  Object.freeze(Constants.DISTRACTION_DUMP_LOCK_ALERT);
  Object.freeze(Constants.WORKSPACE_CONTAINER_SELECTORS);
  Object.freeze(Constants.CONTENT_AREA_SELECTORS);
  Object.freeze(Constants.WORKSPACE_NAME_ATTRIBUTES);
  Object.freeze(Constants.SENSITIVE_KEYS);
  Object.freeze(Constants.DEFAULT_CONFIG.rulesets[0]);
  Object.freeze(Constants.DEFAULT_CONFIG.rulesets);
  Object.freeze(Constants.DEFAULT_CONFIG.dailyReminderTimes);
  Object.freeze(Constants.DEFAULT_CONFIG.focusPhaseReminders);
  Object.freeze(Constants.DEFAULT_CONFIG.breakPhaseReminders);
  Object.freeze(Constants.DEFAULT_CONFIG);
  Object.freeze(Constants);

  // ============================================
  // State Variables
  // ============================================

  /**
   * Stores the last dialog position for maintaining position across dialogs.
   * When a dialog is closed or a submenu is opened, the position is saved here.
   * New dialogs will open at this position instead of centering.
   * @type {{left: number, top: number}|null}
   */
  let lastDialogPosition = null;

  // ============================================
  // LogManager Class
  // ============================================

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
      this.windowId = null;
      this._logObserver = null;
      this._logRequestObserver = null;
    }

    /**
     * Set the window ID for cross-window log sync.
     * @param {string} id - Unique window identifier
     */
    setWindowId(id) {
      this.windowId = id;
    }

    /**
     * Initialize cross-window log sync using Services.obs.
     * Registers observers for log broadcasting and log requests.
     */
    initSync() {
      if (!this.windowId) return;

      // Observer for receiving log entries from other windows
      this._logObserver = {
        observe: (subject, topic, data) => {
          try {
            const entry = JSON.parse(data);
            if (entry._sourceWindowId !== this.windowId) {
              this._addEntryFromSync(entry);
            }
          } catch (e) {
            /* ignore parse errors from log sync */
          }
        },
      };
      Services.obs.addObserver(this._logObserver, Constants.LOG_BROADCAST_TOPIC);

      // Observer for responding to log requests from new windows
      this._logRequestObserver = {
        observe: (subject, topic, data) => {
          if (data !== this.windowId) {
            this._respondToLogRequest(data);
          }
        },
      };
      Services.obs.addObserver(this._logRequestObserver, Constants.LOG_REQUEST_TOPIC);
    }

    /**
     * Add a log entry received from another window via sync.
     * @param {Object} entry - Log entry with _sourceWindowId
     * @private
     */
    _addEntryFromSync(entry) {
      const cleaned = { ...entry };
      delete cleaned._sourceWindowId;
      this.logs.push(cleaned);
      if (this.logs.length > this.maxLogSize) {
        this.logs.shift();
      }
    }

    /**
     * Broadcast a log entry to all other windows via Services.obs.
     * @param {Object} entry - Log entry to broadcast
     * @private
     */
    _broadcastEntry(entry) {
      if (!this.windowId) return;
      try {
        const broadcastEntry = { ...entry, _sourceWindowId: this.windowId };
        Services.obs.notifyObservers(null, Constants.LOG_BROADCAST_TOPIC, JSON.stringify(broadcastEntry));
      } catch (e) {
        /* ignore broadcast errors - other windows may not be listening */
      }
    }

    /**
     * Request existing logs from other windows.
     * Called when a new window opens to get historical log entries.
     * Uses a temporary pref to exchange log data since Services.obs is synchronous.
     */
    requestExistingLogs() {
      if (!this.windowId) return;
      try {
        // Use per-request pref key to avoid race between multiple responders
        const prefKey = `shared-logs-${this.windowId}`;
        Services.obs.notifyObservers(null, Constants.LOG_REQUEST_TOPIC, this.windowId);
        const sharedLogsStr = Storage.getPref(prefKey, '');
        if (sharedLogsStr) {
          this._mergeSharedLogs(JSON.parse(sharedLogsStr));
          // Clear after reading to prevent stale data
          Storage.setPref(prefKey, '');
        }
      } catch (e) {
        /* ignore errors during log request */
      }
    }

    /**
     * Merge shared logs from another window into our local log array.
     * Deduplicates by timestamp+message key and sorts chronologically.
     * @param {Array} sharedLogs - Array of log entries from another window
     * @private
     */
    _mergeSharedLogs(sharedLogs) {
      if (!Array.isArray(sharedLogs) || sharedLogs.length === 0) return;

      const existingKeys = new Set(this.logs.map((l) => this._logDedupeKey(l)));
      for (const entry of sharedLogs) {
        if (!existingKeys.has(this._logDedupeKey(entry))) {
          this.logs.push(entry);
        }
      }
      this.logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      while (this.logs.length > this.maxLogSize) {
        this.logs.shift();
      }
    }

    /**
     * Generate a deduplication key for a log entry.
     * @param {Object} entry - Log entry with timestamp and message
     * @returns {string} Deduplication key
     * @private
     */
    _logDedupeKey(entry) {
      return `${entry.timestamp}||${entry.message}`;
    }

    /**
     * Respond to a log request from another window.
     * Writes logs to a per-requester pref key to avoid race conditions.
     * @param {string} requesterId - The window ID of the requesting window
     * @private
     */
    _respondToLogRequest(requesterId) {
      try {
        const prefKey = `shared-logs-${requesterId}`;
        Storage.setPref(prefKey, JSON.stringify(this.logs));
      } catch (e) {
        /* ignore errors during log response */
      }
    }

    /**
     * Clean up cross-window log sync observers.
     */
    destroySync() {
      if (this._logObserver) {
        try {
          Services.obs.removeObserver(this._logObserver, Constants.LOG_BROADCAST_TOPIC);
        } catch (e) {
          /* ignore */
        }
        this._logObserver = null;
      }
      if (this._logRequestObserver) {
        try {
          Services.obs.removeObserver(this._logRequestObserver, Constants.LOG_REQUEST_TOPIC);
        } catch (e) {
          /* ignore */
        }
        this._logRequestObserver = null;
      }
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

      // Broadcast to other windows for cross-window log sync
      this._broadcastEntry(entry);

      // Also output to console for real-time debugging
      const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
      console.log(`[Zen Pomodoro][${category}] ${message}${dataStr}`);
    }

    /**
     * Check if a key is sensitive and should be redacted.
     * @param {string} key - Key to check
     * @returns {boolean} True if key is sensitive
     * @private
     */
    _isSensitiveKey(key) {
      const lowerKey = key.toLowerCase();
      return Constants.SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));
    }

    /**
     * Sanitize an object by filtering sensitive keys.
     * @param {Object} data - Object to sanitize
     * @returns {Object} Sanitized object
     * @private
     */
    _sanitizeObject(data) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        if (this._isSensitiveKey(key)) {
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
     * Recursively sanitize data to remove sensitive information.
     * Handles null, undefined, primitives, arrays, and objects, filtering
     * keys matching sensitive patterns.
     * @param {*} data - Data to sanitize
     * @returns {*} Sanitized data
     * @private
     */
    _sanitizeData(data) {
      // Handle null/undefined
      if (data === null || data === undefined) return data;
      // Handle primitive types
      if (typeof data !== 'object') return data;
      // Handle arrays
      if (Array.isArray(data)) return data.map((item) => this._sanitizeData(item));
      // Handle objects
      return this._sanitizeObject(data);
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
      this.log(Constants.LOG_CATEGORIES.SETTINGS, 'Logs exported', { entryCount: this.logs.length });

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
      setTimeout(() => URL.revokeObjectURL(url), Constants.URL_REVOKE_DELAY_MS);
    }
  }

  // Create global logger instance
  const logger = new LogManager(1000);

  // ============================================
  // Window Sync Manager
  // ============================================

  /**
   * WindowSyncManager - Manages cross-window timer synchronization.
   * Uses a primary/secondary window pattern where only one window (the "owner")
   * runs the actual timer countdown interval. Other windows sync their UI state
   * by observing pref changes written by the owner window.
   *
   * Architecture:
   * - Owner window: runs setInterval, writes timer-sync pref every tick, updates heartbeat
   * - Secondary windows: observe timer-sync pref, update UI from sync data, no interval
   * - Ownership transfer: when user interacts in secondary, it claims ownership
   * - Dead owner detection: secondary checks heartbeat periodically, takes over if stale
   *
   * Communication:
   * - Timer state sync: via Services.prefs (zen-pomodoro.timer-sync)
   * - Owner heartbeat: via Services.prefs (zen-pomodoro.timer-owner)
   * - Log sync: via Services.obs (zen-pomodoro-log topic)
   */
  class WindowSyncManager {
    constructor() {
      /** Unique ID for this window instance */
      this.windowId =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `win-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      /** Whether this window is the timer owner (runs the countdown interval) */
      this.isTimerOwner = false;
      /** Pref observer for cross-window sync */
      this._prefObserver = null;
      /** Interval ID for heartbeat monitoring in secondary windows */
      this._heartbeatCheckInterval = null;
      /** Callback: called when sync state is received from owner (secondary only) */
      this.onSyncStateChanged = null;
      /** Callback: called when this window loses ownership to another window */
      this.onOwnershipLost = null;
      /** Callback: called when this window takes over from a dead owner */
      this.onOwnershipTaken = null;
    }

    /**
     * Initialize the sync manager - set up pref observer for cross-window communication.
     */
    init() {
      this._setupPrefObserver();
    }

    /**
     * Check if another window is currently actively managing the timer.
     * Uses heartbeat timestamp to determine if the owner is alive.
     * @returns {boolean} True if another window is the active timer owner
     */
    isAnotherWindowActive() {
      try {
        const ownerStr = Storage.getPref(Constants.OWNER_PREF_KEY, '');
        if (!ownerStr) return false;
        const owner = JSON.parse(ownerStr);
        return (
          owner.id !== this.windowId &&
          Date.now() - owner.heartbeat < Constants.OWNER_HEARTBEAT_TIMEOUT_MS
        );
      } catch (e) {
        return false;
      }
    }

    /**
     * Claim ownership of the timer - this window will run the countdown interval.
     */
    claimOwnership() {
      this.isTimerOwner = true;
      this._writeOwnership();
      this.stopHeartbeatMonitor();
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Claimed timer ownership', {
        windowId: this.windowId,
      });
    }

    /**
     * Release ownership of the timer (e.g., when window closes).
     * Only clears the owner pref if this window is still the registered owner.
     */
    releaseOwnership() {
      if (!this.isTimerOwner) return;
      this.isTimerOwner = false;
      try {
        const ownerStr = Storage.getPref(Constants.OWNER_PREF_KEY, '');
        if (ownerStr) {
          const owner = JSON.parse(ownerStr);
          if (owner.id === this.windowId) {
            Storage.setPref(Constants.OWNER_PREF_KEY, '');
          }
        }
      } catch (e) {
        /* ignore */
      }
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Released timer ownership');
    }

    /**
     * Update the heartbeat timestamp for this owner window.
     * Called on every timer tick to signal that the owner is alive.
     */
    updateHeartbeat() {
      if (this.isTimerOwner) {
        this._writeOwnership();
      }
    }

    /**
     * Write current timer state to the sync pref for secondary windows to read.
     * @param {Object} timerState - Timer state object to broadcast
     */
    writeSyncState(timerState) {
      Storage.setPref(
        Constants.SYNC_PREF_KEY,
        JSON.stringify({
          ownerId: this.windowId,
          timestamp: Date.now(),
          ...timerState,
        })
      );
    }

    /**
     * Read the current sync state from the pref.
     * @returns {Object|null} Parsed sync state or null
     */
    readSyncState() {
      try {
        const syncStr = Storage.getPref(Constants.SYNC_PREF_KEY, '');
        if (!syncStr) return null;
        return JSON.parse(syncStr);
      } catch (e) {
        return null;
      }
    }

    /**
     * Clear all sync-related prefs (timer-sync and timer-owner).
     * Called when the timer is stopped.
     */
    clearSyncState() {
      Storage.setPref(Constants.SYNC_PREF_KEY, '');
      Storage.setPref(Constants.OWNER_PREF_KEY, '');
    }

    /**
     * Start periodic heartbeat monitoring (for secondary windows).
     * Checks if the owner window is still alive and takes over if not.
     */
    startHeartbeatMonitor() {
      if (this._heartbeatCheckInterval) return;
      this._heartbeatCheckInterval = setInterval(() => {
        this._checkOwnerHeartbeat();
      }, Constants.HEARTBEAT_CHECK_INTERVAL_MS);
    }

    /**
     * Stop the heartbeat monitoring interval.
     */
    stopHeartbeatMonitor() {
      if (this._heartbeatCheckInterval) {
        clearInterval(this._heartbeatCheckInterval);
        this._heartbeatCheckInterval = null;
      }
    }

    /**
     * Write this window's ID and current timestamp to the owner pref.
     * @private
     */
    _writeOwnership() {
      Storage.setPref(
        Constants.OWNER_PREF_KEY,
        JSON.stringify({
          id: this.windowId,
          heartbeat: Date.now(),
        })
      );
    }

    /**
     * Check if the current owner is still alive by checking heartbeat.
     * If the owner's heartbeat is stale, this secondary window takes over.
     * @private
     */
    _checkOwnerHeartbeat() {
      if (this.isTimerOwner) return;

      const syncState = this.readSyncState();
      if (!syncState || !syncState.isActive) return;

      try {
        const ownerStr = Storage.getPref(Constants.OWNER_PREF_KEY, '');
        if (!ownerStr) {
          this._takeOverFromDeadOwner(syncState);
          return;
        }
        const owner = JSON.parse(ownerStr);
        if (owner.id === this.windowId) return;
        if (Date.now() - owner.heartbeat >= Constants.OWNER_HEARTBEAT_TIMEOUT_MS) {
          this._takeOverFromDeadOwner(syncState);
        }
      } catch (e) {
        /* ignore */
      }
    }

    /**
     * Take over timer ownership from a dead/crashed owner window.
     * Adjusts remaining time based on elapsed time since last heartbeat.
     * @param {Object} syncState - Last known sync state
     * @private
     */
    _takeOverFromDeadOwner(syncState) {
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Taking over from dead owner window', {
        remainingTime: syncState.remainingTime,
        phase: syncState.currentPhase,
      });

      // Create adjusted state without mutating the original object
      const adjustedState = { ...syncState };
      if (!adjustedState.isPaused && adjustedState.timestamp) {
        const rawElapsed = Math.floor((Date.now() - adjustedState.timestamp) / 1000);
        // Cap elapsed time to heartbeat timeout to prevent extreme drift
        const maxElapsed = Math.floor(Constants.OWNER_HEARTBEAT_TIMEOUT_MS / 1000);
        if (rawElapsed > maxElapsed) {
          logger.log(Constants.LOG_CATEGORIES.SYNC, 'Time drift exceeded heartbeat timeout during takeover', {
            rawElapsed,
            maxElapsed,
          });
        }
        const elapsed = Math.min(rawElapsed, maxElapsed);
        adjustedState.remainingTime = Math.max(0, adjustedState.remainingTime - elapsed);
      }

      this.claimOwnership();
      if (this.onOwnershipTaken) {
        this.onOwnershipTaken(adjustedState);
      }
    }

    /**
     * Set up pref observer for cross-window communication.
     * Watches for changes to timer-sync and timer-owner prefs.
     * @private
     */
    _setupPrefObserver() {
      const prefPrefix = Constants.PREF_PREFIX;
      this._prefObserver = {
        observe: (subject, topic, data) => {
          if (data === `${prefPrefix}.${Constants.SYNC_PREF_KEY}`) {
            this._handleSyncPrefChange();
          } else if (data === `${prefPrefix}.${Constants.OWNER_PREF_KEY}`) {
            this._handleOwnerPrefChange();
          }
        },
      };
      Services.prefs.addObserver(`${prefPrefix}.`, this._prefObserver);
    }

    /**
     * Handle changes to the timer-sync pref (timer state updates from owner).
     * Secondary windows use this to update their UI.
     * @private
     */
    _handleSyncPrefChange() {
      if (this.isTimerOwner) return;
      const syncState = this.readSyncState();
      if (!syncState) return;
      if (syncState.ownerId === this.windowId) return;

      if (this.onSyncStateChanged) {
        this.onSyncStateChanged(syncState);
      }
    }

    /**
     * Handle changes to the timer-owner pref.
     * If this window was the owner and another window claimed ownership, handle the transfer.
     * @private
     */
    _handleOwnerPrefChange() {
      if (!this.isTimerOwner) return;
      try {
        const ownerStr = Storage.getPref(Constants.OWNER_PREF_KEY, '');
        if (!ownerStr) return;
        const owner = JSON.parse(ownerStr);
        if (owner.id !== this.windowId) {
          this.isTimerOwner = false;
          logger.log(Constants.LOG_CATEGORIES.SYNC, 'Lost timer ownership to another window', {
            newOwnerId: owner.id,
          });
          if (this.onOwnershipLost) {
            this.onOwnershipLost();
          }
        }
      } catch (e) {
        /* ignore */
      }
    }

    /**
     * Clean up all resources - remove observers, stop heartbeat, release ownership.
     */
    destroy() {
      this.stopHeartbeatMonitor();
      if (this._prefObserver) {
        try {
          Services.prefs.removeObserver(`${Constants.PREF_PREFIX}.`, this._prefObserver);
        } catch (e) {
          /* ignore */
        }
        this._prefObserver = null;
      }
      this.releaseOwnership();
    }
  }

  // ============================================
  // Storage Module
  // ============================================

  /**
   * Storage Module - Handles all Firefox preferences (Services.prefs) operations.
   * No other module should directly call Services.prefs.
   * Public Interface:
   * - getPref(key, defaultValue)
   * - setPref(key, value)
   * - loadConfig()
   * - saveConfig(config)
   */
  const Storage = (() => {
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
     * @private
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
     * @private
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
     * @private
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
     * @private
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
     * @private
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
     * @private
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
     * @private
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
     * @private
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

    // Public interface
    return {
      getPref,
      setPref,
      loadConfig,
      saveConfig,
    };
  })();

  // ============================================
  // Utils Module
  // ============================================

  /**
   * Utils Module - General utility functions used across the application.
   * Public Interface:
   * - formatTime(seconds)
   * - formatTimeWithHours(seconds, useHours)
   * - getPhaseLabel(phase)
   * - getShortPhaseLabel(phase)
   * - sanitizeText(text)
   * - validateIntegerInput(value, min, max, defaultValue)
   * - getValidatedIntFromDialog(dialog, options)
   * - generateRandomCode(length, charset)
   * - clampToViewportBound(position, size, viewportSize)
   * - isValidWorkspaceArray(workspaces)
   * - formatWorkspacesFromApi(workspaces)
   * - extractWorkspaceNameFromButton(btn, id)
   * - getActiveBlockedWorkspaces()
   * - findRuleAndExecute(config, rulesetId, ruleId, callback)
   */
  const Utils = (() => {
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

    // Public interface
    return {
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
  })();

  // ============================================
  // Legacy Helper Functions (to be migrated)
  // ============================================

  /**
   * LEGACY WRAPPERS - These provide backward compatibility for existing code.
   * These should be gradually replaced with direct module calls throughout the codebase.
   */

  // Storage legacy wrappers
  function getPref(key, defaultValue) {
    return Storage.getPref(key, defaultValue);
  }
  function setPref(key, value) {
    Storage.setPref(key, value);
  }
  function getConfig() {
    return Storage.loadConfig();
  }
  function saveConfig(config) {
    Storage.saveConfig(config);
  }

  // Utils legacy wrappers
  function formatTime(seconds) {
    return Utils.formatTime(seconds);
  }
  function formatTimeWithHours(seconds, useHours) {
    return Utils.formatTimeWithHours(seconds, useHours);
  }
  function getPhaseLabel(phase) {
    return Utils.getPhaseLabel(phase);
  }
  function getShortPhaseLabel(phase) {
    return Utils.getShortPhaseLabel(phase);
  }
  function sanitizeText(text) {
    return Utils.sanitizeText(text);
  }
  function validateIntegerInput(value, min, max, defaultValue) {
    return Utils.validateIntegerInput(value, min, max, defaultValue);
  }
  function getValidatedIntFromDialog(dialog, options) {
    return Utils.getValidatedIntFromDialog(dialog, options);
  }
  function isNonEmptyArray(value) {
    return Utils.isNonEmptyArray(value);
  }
  function isValidRangeValue(value, min, max) {
    return Utils.isValidRangeValue(value, min, max);
  }
  function generateRandomCode(length, charset) {
    return Utils.generateRandomCode(length, charset);
  }
  function clampToViewportBound(position, size, viewportSize) {
    return Utils.clampToViewportBound(position, size, viewportSize);
  }
  function isValidWorkspaceArray(workspaces) {
    return Utils.isValidWorkspaceArray(workspaces);
  }
  function formatWorkspacesFromApi(workspaces) {
    return Utils.formatWorkspacesFromApi(workspaces);
  }
  function extractWorkspaceNameFromButton(btn, id) {
    return Utils.extractWorkspaceNameFromButton(btn, id);
  }
  function getActiveBlockedWorkspaces() {
    return Utils.getActiveBlockedWorkspaces();
  }
  function findRuleAndExecute(config, rulesetId, ruleId, callback) {
    return Utils.findRuleAndExecute(config, rulesetId, ruleId, callback);
  }

  /**
   * Send a browser notification with fallback to console.log.
   * @param {string} title - Notification title
   * @param {string} body - Notification body text
   */
  function sendBrowserNotification(title, body) {
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

  // Constants legacy accessors (for backward compatibility)
  const PREF_PREFIX = Constants.PREF_PREFIX;
  const MOD_VERSION = Constants.MOD_VERSION;
  const MODIFIER_KEYS = Constants.MODIFIER_KEYS;
  const LOCKOUT_METHODS = Constants.LOCKOUT_METHODS;
  const DATA_NO_POSITION_SAVE = Constants.DATA_NO_POSITION_SAVE;
  const DEFAULT_CONFIG = Constants.DEFAULT_CONFIG;
  const SAVE_STATE_INTERVAL_SECONDS = Constants.SAVE_STATE_INTERVAL_SECONDS;
  const DOM_SETTLE_DELAY_MS = Constants.DOM_SETTLE_DELAY_MS;
  const RESTORATION_NOTIFICATION_DELAY_MS = Constants.RESTORATION_NOTIFICATION_DELAY_MS;
  const MAX_OVERLAY_Z_INDEX = Constants.MAX_OVERLAY_Z_INDEX;
  const MIN_CONTENT_AREA_DIMENSION = Constants.MIN_CONTENT_AREA_DIMENSION;
  const CONTENT_OBSERVER_DEBOUNCE_DELAY_MS = Constants.CONTENT_OBSERVER_DEBOUNCE_DELAY_MS;
  const TRANSITION_PHASE_DURATION_SECONDS = Constants.TRANSITION_PHASE_DURATION_SECONDS;
  const POST_SESSION_ESCALATION_FACTOR = Constants.POST_SESSION_ESCALATION_FACTOR;
  const POST_SESSION_CHECK_INTERVAL_MS = Constants.POST_SESSION_CHECK_INTERVAL_MS;
  const DAILY_REMINDER_ESCALATION_FACTOR = Constants.DAILY_REMINDER_ESCALATION_FACTOR;
  const DAILY_REMINDER_CHECK_INTERVAL_MS = Constants.DAILY_REMINDER_CHECK_INTERVAL_MS;
  const DAILY_REMINDER_STARTUP_DELAY_MS = Constants.DAILY_REMINDER_STARTUP_DELAY_MS;
  const EARLY_MORNING_CUTOFF_MINUTES = Constants.EARLY_MORNING_CUTOFF_MINUTES;
  const WORKSPACE_MUTATION_DELAY_MS = Constants.WORKSPACE_MUTATION_DELAY_MS;
  const REGEX_ESCAPE_PATTERN = Constants.REGEX_ESCAPE_PATTERN;
  const REGEX_ESCAPE_PATTERN_KEEP_ASTERISK = Constants.REGEX_ESCAPE_PATTERN_KEEP_ASTERISK;
  const LOG_CATEGORIES = Constants.LOG_CATEGORIES;
  const WORKSPACE_CONTAINER_SELECTORS = Constants.WORKSPACE_CONTAINER_SELECTORS;
  const CONTENT_AREA_SELECTORS = Constants.CONTENT_AREA_SELECTORS;
  const WORKSPACE_NAME_ATTRIBUTES = Constants.WORKSPACE_NAME_ATTRIBUTES;
  const URL_REVOKE_DELAY_MS = Constants.URL_REVOKE_DELAY_MS;

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
  function isPopupWindow() {
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

  /**
   * Initialize dialog position for drag by converting from CSS centering to absolute pixels.
   * @param {HTMLElement} dialog - The dialog element
   * @param {DOMRect} rect - The dialog's bounding client rect
   */
  function initializeDialogDragPosition(dialog, rect) {
    const computedStyle = window.getComputedStyle(dialog);
    if (computedStyle.transform !== 'none') {
      dialog.style.transform = 'none';
    }
    dialog.style.position = 'fixed';
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
  }

  /**
   * Issue 8: Setup drag functionality for dialogs
   * Makes a dialog draggable by its header (h2 element).
   * The dialog can be moved within the viewport boundaries.
   *
   * NOTE: Cyclomatic complexity (cc=9) is acceptable for this function since it provides
   * unified drag handling for both mouse and touch events, coordinate transform conversion,
   * and viewport boundary clamping. Helper functions (isTouchEventWithTouches, getClientCoords,
   * cleanupDrag) have already been extracted to reduce complexity where practical.
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

    // Helper to check if event is a valid touch event with touches
    const isTouchEventWithTouches = (e) => e.type?.startsWith('touch') && e.touches?.length > 0;

    // Helper to get client coordinates from mouse or touch event
    const getClientCoords = (e) => {
      if (isTouchEventWithTouches(e)) {
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

      // Convert from CSS centering to absolute pixel positioning
      initializeDialogDragPosition(dialog, rect);

      startLeft = rect.left;
      startTop = rect.top;
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

      // Clamp positions to viewport boundaries using helper
      const newLeft = clampToViewportBound(startLeft + deltaX, dialogWidth, window.innerWidth);
      const newTop = clampToViewportBound(startTop + deltaY, dialogHeight, window.innerHeight);

      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
    };

    const onEnd = () => {
      if (!isDragging) return;

      isDragging = false;
      dialog.classList.remove('dragging');
      header.style.cursor = 'move';

      // Only save position for dialogs that don't have the no-save attribute
      // This prevents the transition popup position from affecting the settings menu position
      if (!dialog.hasAttribute(DATA_NO_POSITION_SAVE)) {
        saveDialogPosition(dialog);
      }

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
   * Save the current dialog position before it's closed.
   * Call this before removing a dialog that may have been dragged.
   * @param {HTMLElement} dialog - The dialog element to save position from
   */
  function saveDialogPosition(dialog) {
    if (!dialog) return;

    const rect = dialog.getBoundingClientRect();

    // Check if dialog has explicit pixel positioning (was dragged)
    // We check for both inline style values, as drag converts transform to pixel positioning
    const hasExplicitPosition = dialog.style.left && dialog.style.top;

    if (hasExplicitPosition) {
      // Dialog was dragged - use explicit position values
      lastDialogPosition = {
        left: parseFloat(dialog.style.left) || rect.left,
        top: parseFloat(dialog.style.top) || rect.top,
      };
    } else if (rect.width > 0 && rect.height > 0) {
      // Dialog hasn't been dragged but exists - save its current visual position
      lastDialogPosition = { left: rect.left, top: rect.top };
    }
  }

  /**
   * Check if dialog can be positioned (has valid dimensions and viewport is available).
   * @param {Element} dialog - The dialog element
   * @param {DOMRect} rect - Dialog's bounding rect
   * @returns {{valid: boolean, viewportWidth: number, viewportHeight: number}}
   */
  function getViewportDimensions(dialog, rect) {
    // Validate dialog exists
    if (!dialog) {
      return { valid: false, viewportWidth: 0, viewportHeight: 0 };
    }

    // Check dialog has been rendered
    const hasValidDimensions = rect.width > 0 && rect.height > 0;
    if (!hasValidDimensions) {
      return { valid: false, viewportWidth: 0, viewportHeight: 0 };
    }

    // Get and validate viewport dimensions
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const hasValidViewport = viewportWidth > 0 && viewportHeight > 0;

    return {
      valid: hasValidViewport,
      viewportWidth,
      viewportHeight,
    };
  }

  /**
   * Ensure a dialog is fully visible within the viewport.
   * Adjusts position if the dialog extends beyond viewport boundaries.
   * @param {HTMLElement} dialog - The dialog element to check and adjust
   */
  function ensureDialogInViewport(dialog) {
    if (!dialog) return;

    const rect = dialog.getBoundingClientRect();
    const viewport = getViewportDimensions(dialog, rect);
    if (!viewport.valid) return;

    // Calculate the position that keeps the dialog within viewport bounds
    const maxLeft = Math.max(0, viewport.viewportWidth - rect.width);
    const maxTop = Math.max(0, viewport.viewportHeight - rect.height);

    const currentLeft = parseFloat(dialog.style.left) || rect.left;
    const currentTop = parseFloat(dialog.style.top) || rect.top;

    const constrainedLeft = Math.max(0, Math.min(currentLeft, maxLeft));
    const constrainedTop = Math.max(0, Math.min(currentTop, maxTop));

    // Only update if position changed
    if (constrainedLeft !== currentLeft || constrainedTop !== currentTop) {
      dialog.style.left = `${constrainedLeft}px`;
      dialog.style.top = `${constrainedTop}px`;
    }
  }

  /**
   * Apply saved position to a dialog if available.
   * This allows submenus to open at the same position as the parent dialog.
   * Call this after appending the dialog to the DOM but before setupDialogDrag.
   * @param {HTMLElement} dialog - The dialog element to position
   */
  function applyLastDialogPosition(dialog) {
    if (!dialog || !lastDialogPosition) return;

    const { left, top } = lastDialogPosition;

    // Apply pixel positioning directly (override CSS centering)
    dialog.style.position = 'fixed';
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
    dialog.style.transform = 'none';

    // Use requestAnimationFrame to ensure CSS is applied before checking bounds
    // This allows the browser to render the dialog with its actual dimensions
    // before we check if it extends beyond the viewport
    requestAnimationFrame(() => {
      ensureDialogInViewport(dialog);
    });
  }

  /**
   * Validate time format (HH:MM, 24-hour) with range checking.
   * This function is used widely throughout the codebase for time validation.
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
   * Update a countdown element with time until next reminder.
   * Safely handles null/undefined elements by returning early without errors.
   * @param {HTMLElement|null} element - The countdown element to update (returns early if null/undefined)
   * @param {number|null} secondsUntil - Seconds until reminder (null if not applicable)
   * @param {Object} options - Configuration options
   * @param {string} options.readyText - Text to show when countdown reaches 0
   * @param {string} options.prefixText - Prefix text for countdown display
   * @param {boolean} [options.useHours=false] - Whether to format time with hours
   * @returns {void}
   */
  function updateCountdownElement(element, secondsUntil, options) {
    if (!element) {
      return;
    }

    if (secondsUntil === null) {
      element.classList.add('zen-pomodoro-hidden');
      return;
    }

    element.classList.remove('zen-pomodoro-hidden');

    if (secondsUntil === 0) {
      element.textContent = options.readyText;
      return;
    }

    const timeStr = formatTimeWithHours(secondsUntil, options.useHours || false);
    element.textContent = `${options.prefixText}${timeStr}`;
  }

  /**
   * Get detailed phase label for menu display.
   * Differentiates between 'break' and 'long-break' phases.
   * @param {string} phase - Phase identifier
   * @returns {string} Detailed phase label
   */
  function getMenuPhaseLabel(phase) {
    const labels = {
      focus: 'Focus',
      break: 'Break',
      'long-break': 'Long Break',
      transition: 'Transition',
    };
    return labels[phase] || 'Focus';
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
   * Render an empty list message or items from an array.
   * Shared utility to reduce code duplication between _renderRulesets and _renderRules.
   * @param {Object} options - Options object
   * @param {HTMLElement} options.container - Container to populate
   * @param {Array} options.items - Array of items to check
   * @param {string} options.emptyClass - CSS class for empty message
   * @param {string} options.emptyText - Text for empty message
   * @param {Function} options.renderItem - Function to render each item
   */
  function renderListOrEmptyMessage({ container, items, emptyClass, emptyText, renderItem }) {
    container.innerHTML = '';

    if (!items || items.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = emptyClass;
      emptyMsg.textContent = emptyText;
      container.appendChild(emptyMsg);
      return;
    }

    items.forEach(renderItem);
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

  /**
   * Helper function to skip the current focus phase with lockout protection.
   * Used to allow users to skip to break early with anti-cheating protection.
   *
   * @param {Function} onSkip - Callback function to execute after lockout verification
   */
  function handleSkipFocusWithLockout(onSkip) {
    if (!window.zenPomodoroApp) return;

    const timerActive = window.zenPomodoroApp.timer && window.zenPomodoroApp.timer.isActive;

    const showSkipConfirmation = () => {
      window.zenPomodoroApp.showCustomConfirm(
        'Skip Focus',
        'Skip current focus phase and start break early? Your focus time will not be counted.',
        onSkip
      );
    };

    // Always require lockout when skipping focus (same as stopping timer)
    if (timerActive) {
      window.zenPomodoroApp.security.showLockScreen(true, showSkipConfirmation);
    } else {
      showSkipConfirmation();
    }
  }

  /**
   * Check if Distraction Dump is currently blocking timer control actions.
   * This helper function provides a centralized check to avoid code duplication.
   *
   * @returns {boolean} True if Distraction Dump is active and blocking timer actions
   */
  function isDistractionDumpBlocking() {
    return Boolean(window.zenPomodoroApp?.distractionDump?.isActive);
  }

  /**
   * Handle timer pause/resume logic with overlay and indicator updates.
   * This helper function consolidates the pause/resume logic to eliminate code duplication.
   *
   * PAUSE FIX: When pausing, checks if currently on a blocked workspace using
   * isWorkspaceInBlockedList() which checks raw workspace membership without break
   * phase interference (break phase handling is separate).
   *
   * NOTE: This function handles core timer state and visual indicator updates only.
   * Callers are responsible for updating their own UI elements (e.g., button text).
   *
   * @returns {void}
   */
  function handlePauseResumeTimer() {
    // Null safety checks for all required objects
    if (!window.zenPomodoroApp) return;
    if (!window.zenPomodoroApp.timer) return;
    if (!window.zenPomodoroApp.workspace) return;
    if (!window.zenPomodoroApp.overlay) return;

    // Check if Distraction Dump is active - don't allow pause/resume during dump
    if (isDistractionDumpBlocking()) {
      logger.log(LOG_CATEGORIES.TIMER, 'Cannot pause/resume timer - Distraction Dump is active');
      return;
    }

    const timer = window.zenPomodoroApp.timer;

    // CROSS-WINDOW SYNC: Claim ownership if this is a secondary window
    window.zenPomodoroApp._claimOwnershipForAction();

    if (timer.isPaused) {
      timer.resume();
    } else {
      // PAUSE FIX: Track whether we're pausing on a blocked workspace
      // Use isWorkspaceInBlockedList() to check raw workspace membership
      // without break phase interference (break phase already handled separately)
      const isOnBlockedWorkspace = window.zenPomodoroApp.workspace.isWorkspaceInBlockedList();
      timer.pause(isOnBlockedWorkspace);
    }

    // Update overlay visibility after pause/resume state change
    window.zenPomodoroApp.updateOverlayVisibility();

    // PAUSE FIX: Update indicator paused state for visual feedback
    // This ensures the indicator shows orange color when paused
    window.zenPomodoroApp.overlay.updateIndicatorPausedState(timer.isPaused);
  }

  // ============================================
  // Break Phase Detection Utility
  // ============================================

  /**
   * Check if the Pomodoro timer is currently in a break phase.
   * During break phases, workspace and website blocking should be disabled
   * to allow the user to freely browse during their break.
   *
   * The 'transition' phase is also treated as a break phase because during
   * the transition (break ending soon warning), blocking should remain disabled
   * to allow users to finish up their break activities.
   *
   * @returns {boolean} True if timer is active AND in a break phase (including transition)
   */
  function isInBreakPhase() {
    const timer = window.zenPomodoroApp?.timer;
    if (!timer || !timer.isActive) return false;
    // Handle 'long-break' for backwards compatibility with saved state
    // Include 'transition' because blocking should remain disabled during the break-ending warning
    return (
      timer.currentPhase === 'break' ||
      timer.currentPhase === 'long-break' ||
      timer.currentPhase === 'transition'
    );
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
    // Tab select listener - add delay to allow tab title to update before checking
    context.tabSelectHandler = () => {
      // Clear any pending check to avoid race conditions
      if (context._tabSelectDelayTimeout) {
        clearTimeout(context._tabSelectDelayTimeout);
      }
      // Small delay to let tab title update
      context._tabSelectDelayTimeout = setTimeout(checkCallback, 100);
    };
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

    // Clear pending tab select timeout
    if (context._tabSelectDelayTimeout) {
      clearTimeout(context._tabSelectDelayTimeout);
      context._tabSelectDelayTimeout = null;
    }

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

  /**
   * Update timer status display element for blocker overlays.
   * Shared utility to reduce code duplication between SineModBlocker and WebsiteBlocker.
   * @param {HTMLElement} statusElement - Element to update with timer status
   */
  function updateBlockerTimerStatus(statusElement) {
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
    statusElement.textContent =
      status.mode === 'simple'
        ? `${phaseLabel}: ${timeStr}`
        : `${phaseLabel}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
  }

  /**
   * Start interval to update timer status display for blocker overlays.
   * Shared utility to reduce code duplication between SineModBlocker and WebsiteBlocker.
   * @param {Object} context - The blocker instance (this) - must have isBlocking, _timerStatusInterval, _hideBlocker
   * @param {HTMLElement} statusElement - Element to update
   */
  function startBlockerTimerStatusUpdates(context, statusElement) {
    // Update immediately
    updateBlockerTimerStatus(statusElement);

    // Update every second
    context._timerStatusInterval = setInterval(() => {
      if (context.isBlocking && statusElement) {
        updateBlockerTimerStatus(statusElement);

        // Also check if timer is still active
        if (!window.zenPomodoroApp?.timer?.isActive) {
          context._hideBlocker();
        }
      }
    }, 1000);
  }

  /**
   * Create a blocker overlay button element.
   * @param {string} className - CSS class name
   * @param {string} text - Button text
   * @param {Function} onClick - Click handler
   * @returns {HTMLButtonElement} Button element
   */
  function createBlockerButton(className, text, onClick) {
    const button = document.createElement('button');
    button.className = `zen-pomodoro-dialog-button ${className}`;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Create the buttons container for blocker overlays.
   * Shared utility to reduce code duplication.
   * @param {string} buttonsId - ID for the buttons container
   * @param {Function} onGoBack - Go Back button click handler
   * @param {Function} onStopTimer - Stop Timer button click handler
   * @returns {HTMLElement} Buttons container element
   */
  function createBlockerButtons(buttonsId, onGoBack, onStopTimer) {
    const buttons = document.createElement('div');
    buttons.id = buttonsId;

    buttons.appendChild(createBlockerButton('secondary', 'Go Back', onGoBack));
    buttons.appendChild(createBlockerButton('', 'Stop Timer', onStopTimer));

    return buttons;
  }

  /**
   * Setup hold-to-unlock event handlers for buttons.
   * Shared utility to reduce code duplication between SecurityManager and PostSessionReminderManager.
   * @param {Object} options - Options object
   * @param {HTMLElement} options.holdButton - The hold button element
   * @param {HTMLElement} options.holdProgress - The progress bar element
   * @param {number} options.waitTime - Total wait time in seconds
   * @param {HTMLElement} options.timerElement - Element to display countdown
   * @param {Function} options.onComplete - Callback when hold completes
   * @param {Function} options.getIntervalId - Function to get current interval ID
   * @param {Function} options.setIntervalId - Function to set interval ID
   * @param {Function} options.clearInterval - Function to clear interval
   * @param {string} [options.logCategory] - Log category for logging (default: SECURITY)
   * @param {string} [options.logMessage] - Log message on completion (default: 'Hold-to-unlock completed')
   */
  function setupHoldToUnlockHandlers(options) {
    const {
      holdButton,
      holdProgress,
      waitTime,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
      logCategory = LOG_CATEGORIES.SECURITY,
      logMessage = 'Hold-to-unlock completed',
    } = options;

    let currentWaitTime = waitTime;

    const startHold = (e) => {
      if (e.type === 'touchstart') e.preventDefault();

      clearIntervalFn();

      const intervalId = setInterval(() => {
        currentWaitTime--;
        if (timerElement) {
          timerElement.textContent = currentWaitTime.toString();
        }

        const percent = ((waitTime - currentWaitTime) / waitTime) * 100;
        if (holdProgress?.style) {
          holdProgress.style.width = `${percent}%`;
        }

        if (currentWaitTime <= 0) {
          logger.log(logCategory, logMessage);
          clearIntervalFn();
          onComplete();
        }
      }, 1000);

      setIntervalId(intervalId);
    };

    const stopHold = () => {
      clearIntervalFn();
      currentWaitTime = waitTime;
      if (timerElement) {
        timerElement.textContent = waitTime.toString();
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

    // Keyboard accessibility - named functions for cleanup
    const keydownHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        startHold(e);
      }
    };
    const keyupHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter') stopHold();
    };

    holdButton.addEventListener('keydown', keydownHandler);
    holdButton.addEventListener('keyup', keyupHandler);

    // Return cleanup function to prevent memory leaks
    return function cleanup() {
      holdButton.removeEventListener('mousedown', startHold);
      holdButton.removeEventListener('mouseup', stopHold);
      holdButton.removeEventListener('mouseleave', stopHold);
      holdButton.removeEventListener('touchstart', startHold);
      holdButton.removeEventListener('touchend', stopHold);
      holdButton.removeEventListener('touchcancel', stopHold);
      holdButton.removeEventListener('keydown', keydownHandler);
      holdButton.removeEventListener('keyup', keyupHandler);
    };
  }

  // ============================================
  // Timer Engine Module
  // ============================================

  class PomodoroTimer {
    constructor() {
      this.isActive = false;
      this.isPaused = false;
      this.pausedOnBlockedWorkspace = false; // Track if paused while on blocked workspace
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
      // Custom cycle properties
      this.customCycle = null; // Current custom cycle configuration
      this.customCycleBlocks = null; // Array of blocks from custom cycle
      this.currentBlockIndex = 0; // Current block index in custom cycle
      /** Track which reminders have been shown for current phase to avoid duplicates */
      this.shownRemindersForCurrentPhase = new Set();
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

      // Clear shown reminders for new session
      this.shownRemindersForCurrentPhase.clear();

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

      // CROSS-WINDOW SYNC: Claim ownership and write sync state after saveState
      const sync = window.zenPomodoroApp?.windowSync;
      if (sync) {
        sync.claimOwnership();
        this._writeSyncState();
      }
    }

    /**
     * Start a custom cycle timer
     * @param {Object} customCycle - Custom cycle configuration
     */
    startCustomCycle(customCycle) {
      this.mode = 'custom';
      this.customCycle = customCycle;
      this.customCycleBlocks = [...customCycle.blocks]; // Make a copy
      this.currentBlockIndex = 0;
      // Count focus blocks to determine total cycles
      this.totalCycles = customCycle.blocks.filter(b => b.type === 'focus').length;

      // Validate that cycle has at least one block
      if (this.customCycleBlocks.length === 0) {
        logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle has no blocks, cannot start');
        return;
      }

      // Set initial cycle based on first block type - if first block is focus, we're on cycle 1
      // If first block is a break, we haven't started any focus cycle yet (0)
      const firstBlock = this.customCycleBlocks[0];
      this.currentCycle = firstBlock.type === 'focus' ? 1 : 0;
      this.isActive = true;
      this.isPaused = false;
      this.tickCounter = 0;

      // Clear shown reminders for new session
      this.shownRemindersForCurrentPhase.clear();

      // Get base config from preferences
      this.config = getConfig();
      this.savedConfig = { ...this.config };

      // Set up first block
      this.currentPhase = firstBlock.type;
      this.remainingTime = firstBlock.duration * 60;

      logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle started', {
        cycleName: customCycle.name,
        blockCount: this.customCycleBlocks.length,
        firstBlock: firstBlock,
      });

      this.startInterval();
      this.saveState();

      // CROSS-WINDOW SYNC: Claim ownership and write sync state after saveState
      const sync = window.zenPomodoroApp?.windowSync;
      if (sync) {
        sync.claimOwnership();
        this._writeSyncState();
      }
    }

    /**
     * Start the countdown interval
     */
    startInterval() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      this.intervalId = setInterval(() => {
        // CROSS-WINDOW SYNC: Check if we lost ownership (another window claimed it)
        if (this._hasLostOwnership()) {
          clearInterval(this.intervalId);
          this.intervalId = null;
          logger.log(LOG_CATEGORIES.SYNC, 'Stopped interval - no longer timer owner');
          return;
        }

        if (!this.isPaused && this.isActive) {
          this._processActiveTick();
        }

        // CROSS-WINDOW SYNC: Write sync state on every tick for secondary windows
        this._writeSyncState();
      }, 1000);
    }

    /**
     * Check if this window has lost timer ownership to another window.
     * @returns {boolean} True if a sync manager exists and this window is not the owner
     * @private
     */
    _hasLostOwnership() {
      const sync = window.zenPomodoroApp?.windowSync;
      return sync && !sync.isTimerOwner;
    }

    /**
     * Process a single active timer tick - decrement time, fire callbacks, check completion.
     * @private
     */
    _processActiveTick() {
      this.remainingTime--;

      if (this.currentPhase === 'focus') {
        this._trackFocusTime();
      }

      if (this.onTick) {
        this.onTick(this.remainingTime, this.currentPhase, this.currentCycle, this.totalCycles);
      }

      this._checkTimerReminders();

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

    /**
     * Write current timer state to the sync pref for cross-window synchronization.
     * Called on every timer tick by the owner window.
     * @private
     */
    _writeSyncState() {
      const sync = window.zenPomodoroApp?.windowSync;
      if (!sync || !sync.isTimerOwner) return;

      this._maybeUpdateHeartbeat(sync);
      sync.writeSyncState(this._buildSyncPayload());
    }

    /**
     * Update heartbeat if enough wall-clock time has passed.
     * @param {Object} sync - WindowSyncManager instance
     * @private
     */
    _maybeUpdateHeartbeat(sync) {
      const now = Date.now();
      if (!this._lastHeartbeatWriteTs || now - this._lastHeartbeatWriteTs >= Constants.HEARTBEAT_WRITE_INTERVAL_MS) {
        sync.updateHeartbeat();
        this._lastHeartbeatWriteTs = now;
      }
    }

    /**
     * Build the sync payload object with current timer state.
     * @returns {Object} Sync payload to broadcast to secondary windows
     * @private
     */
    _buildSyncPayload() {
      const payload = {
        isActive: this.isActive,
        isPaused: this.isPaused,
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode,
        pausedOnBlockedWorkspace: this.pausedOnBlockedWorkspace,
      };
      if (this.mode === 'custom' && this.customCycleBlocks) {
        payload.customCycleBlocks = this.customCycleBlocks;
        payload.currentBlockIndex = this.currentBlockIndex;
      }
      const dumpMgr = window.zenPomodoroApp?.distractionDump;
      if (dumpMgr) {
        payload.dumpActive = dumpMgr.isActive || false;
      }
      return payload;
    }

    /**
     * Update timer state from cross-window sync data.
     * Used by secondary windows to update their state without running an interval.
     * Does NOT trigger phase change callbacks - only updates state and UI.
     * @param {Object} syncState - Timer state received from the owner window
     */
    syncFromState(syncState) {
      this.isActive = syncState.isActive;
      this.isPaused = syncState.isPaused;
      this.remainingTime = syncState.remainingTime;
      this.currentPhase = syncState.currentPhase;
      this.currentCycle = syncState.currentCycle;
      this.totalCycles = syncState.totalCycles;
      if (syncState.mode) {
        this.mode = syncState.mode;
      }
      if (syncState.pausedOnBlockedWorkspace !== undefined) {
        this.pausedOnBlockedWorkspace = syncState.pausedOnBlockedWorkspace;
      }
      // Sync custom cycle state
      if (syncState.customCycleBlocks) {
        this.customCycleBlocks = syncState.customCycleBlocks;
        this.currentBlockIndex = syncState.currentBlockIndex ?? 0;
      }
    }

    /**
     * Track focus time for post-session reminder feature.
     * Adds 1 second of focus time and checks if daily reset is needed.
     * Focus time resets at the configured first daily reminder time, not midnight.
     * @private
     */
    _trackFocusTime() {
      const config = getConfig();

      // Check if we need to reset focus time based on daily reminder time
      if (this._shouldResetFocusTime(config)) {
        this._resetFocusTime(config);
      }

      // Add 1 second to focus time (tracked in seconds for precision, converted to minutes when needed)
      // We track in the config as minutes for readability, so add 1/60 minute per tick
      config.totalFocusTimeToday = (config.totalFocusTimeToday || 0) + 1 / 60;

      // Only save periodically to avoid excessive writes (already handled by saveState interval)
      // But we need to save the config since totalFocusTimeToday is in config, not timer state
      // To minimize writes, we'll piggyback on the saveState interval check
      if (this.tickCounter === 0) {
        saveConfig(config);
      }
    }

    /**
     * Check if focus time should be reset based on the daily reminder time.
     * Resets when:
     * - It's a new calendar day compared to lastFocusTimeResetDate
     * - AND the current time is at or after the configured first daily reminder time
     * @param {Object} config - Configuration object
     * @returns {boolean} True if focus time should be reset
     * @private
     */
    _shouldResetFocusTime(config) {
      const now = new Date();
      const today = this._getDateString(now);

      // If no reset date stored, we should reset
      if (!config.lastFocusTimeResetDate) {
        return true;
      }

      // If same day, no reset needed
      if (config.lastFocusTimeResetDate === today) {
        return false;
      }

      // Different day - check if we're past the first reminder time
      const reminderTime = this._getEarliestReminderTime(config);

      // Use shared validation function
      if (!isValidTimeFormat(reminderTime)) {
        // Invalid format, default to immediate reset on new day
        return true;
      }

      const [hours, minutes] = reminderTime.split(':').map(Number);
      const reminderDate = new Date();
      reminderDate.setHours(hours, minutes, 0, 0);

      return now >= reminderDate;
    }

    /**
     * Get the earliest daily reminder time from config.
     * @param {Object} config - Configuration object
     * @returns {string} Earliest reminder time in HH:MM format
     * @private
     */
    _getEarliestReminderTime(config) {
      const times = config.dailyReminderTimes;
      if (!isNonEmptyArray(times)) {
        return '10:00';
      }

      // Sort times numerically by hours and minutes
      const sortedTimes = times.slice().sort((a, b) => {
        const [aHours, aMinutes] = a.split(':').map(Number);
        const [bHours, bMinutes] = b.split(':').map(Number);
        return aHours - bHours || aMinutes - bMinutes;
      });
      return sortedTimes[0];
    }

    /**
     * Reset the daily focus time tracker.
     * Also resets the postSessionReminderDisabledForDay flag.
     * @param {Object} config - Configuration object
     * @private
     */
    _resetFocusTime(config) {
      const today = this._getDateString(new Date());

      logger.log(LOG_CATEGORIES.TIMER, 'Resetting daily focus time', {
        previousTotal: config.totalFocusTimeToday,
        previousResetDate: config.lastFocusTimeResetDate,
        newResetDate: today,
      });

      config.totalFocusTimeToday = 0;
      config.lastFocusTimeResetDate = today;

      // Also reset the post-session reminder disabled flag at daily reset time
      if (config.postSessionReminderDisabledForDay) {
        logger.log(LOG_CATEGORIES.TIMER, 'Resetting post-session reminder disabled flag');
        config.postSessionReminderDisabledForDay = false;
      }

      saveConfig(config);
    }

    /**
     * Get date string in YYYY-MM-DD format.
     * @param {Date} date - Date object
     * @returns {string} Date string
     * @private
     */
    _getDateString(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    /**
     * Check if a timer reminder should be shown based on remaining time.
     * Shows browser notification if all conditions are met:
     * - Feature is enabled (timerRemindersEnabled)
     * - Notifications are enabled (enableNotifications)
     * - Not in transition phase (already a warning phase)
     * - Remaining time matches a configured reminder time at exact minute boundary
     * - This reminder hasn't been shown yet for the current phase
     * @private
     */
    /**
     * Get the appropriate reminder list for the current phase.
     * @param {Object} config - Configuration object
     * @returns {{reminders: Array<number>, isFocusPhase: boolean}} Reminder list and phase flag
     * @private
     */
    _getPhaseReminders(config) {
      const isFocusPhase = this.currentPhase === 'focus';
      const reminders = isFocusPhase
        ? config.focusPhaseReminders || []
        : config.breakPhaseReminders || [];
      return { reminders, isFocusPhase };
    }

    _checkTimerReminders() {
      const config = getConfig();

      // Early exits for disabled states
      if (!config.timerRemindersEnabled) return;
      if (this.currentPhase === 'transition') return;
      if (this.remainingTime % 60 !== 0) return;

      const { reminders, isFocusPhase } = this._getPhaseReminders(config);
      const remainingMinutes = Math.floor(this.remainingTime / 60);

      // Check if current time matches a reminder that hasn't been shown
      const matchingReminder = reminders.find(
        (minutes) => remainingMinutes === minutes && !this.shownRemindersForCurrentPhase.has(minutes)
      );
      
      if (matchingReminder !== undefined) {
        this.shownRemindersForCurrentPhase.add(matchingReminder);
        this._showTimerReminder(matchingReminder, isFocusPhase);
      }
    }

    /**
     * Show a timer reminder notification.
     * @param {number} minutes - Minutes remaining
     * @param {boolean} isFocusPhase - True if focus phase, false if break phase
     * @private
     */
    _showTimerReminder(minutes, isFocusPhase) {
      const config = getConfig();
      if (!config.enableNotifications) return;

      const minuteText = minutes === 1 ? 'minute' : 'minutes';
      const message = isFocusPhase
        ? `⏰ ${minutes} ${minuteText} left in your focus session!`
        : `☕ ${minutes} ${minuteText} left in your break!`;
      const title = isFocusPhase ? 'Focus Reminder' : 'Break Reminder';

      sendBrowserNotification(title, message);

      logger.log(LOG_CATEGORIES.TIMER, 'Timer reminder shown', {
        minutes: minutes,
        phase: isFocusPhase ? 'focus' : 'break',
      });
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

      // Handle custom cycle mode
      if (this.mode === 'custom') {
        this._handleCustomCycleBlockComplete();
        return;
      }

      // Handle transition phase completion - starts actual focus phase
      if (this.currentPhase === 'transition') {
        this._handleTransitionPhaseComplete();
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
     * Count focus blocks up to and including the given index.
     * @param {number} upToIndex - Index to count up to (inclusive)
     * @returns {number} Number of focus blocks
     * @private
     */
    _countFocusBlocksUpTo(upToIndex) {
      let count = 0;
      for (let i = 0; i <= upToIndex && i < this.customCycleBlocks.length; i++) {
        if (this.customCycleBlocks[i].type === 'focus') {
          count++;
        }
      }
      return count;
    }

    /**
     * Check if transition to break→focus requires a transition phase.
     * @param {Object} completedBlock - The block that just completed
     * @param {Object} nextBlock - The next block to start
     * @returns {boolean} True if transition phase is needed
     * @private
     */
    _needsTransitionPhase(completedBlock, nextBlock) {
      return completedBlock.type === 'break' && nextBlock.type === 'focus';
    }

    /**
     * Enter the transition phase for custom cycles.
     * @param {Object} nextBlock - The focus block that will start after transition
     * @private
     */
    _enterCustomCycleTransition(nextBlock) {
      this.currentCycle = this._countFocusBlocksUpTo(this.currentBlockIndex);
      this.currentPhase = 'transition';
      this.remainingTime = Constants.TRANSITION_PHASE_DURATION_SECONDS;
      this.shownRemindersForCurrentPhase.clear();

      logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle entering transition phase', {
        blockIndex: this.currentBlockIndex,
        nextBlockType: nextBlock.type,
        currentCycle: this.currentCycle,
      });

      if (this.onTransitionStart) {
        this.onTransitionStart();
      }
      this.saveState();
    }

    /**
     * Start the next block directly (no transition phase).
     * @param {Object} nextBlock - The block to start
     * @private
     */
    _startNextCustomBlock(nextBlock) {
      this.currentPhase = nextBlock.type;
      this.remainingTime = nextBlock.duration * 60;

      if (nextBlock.type === 'focus') {
        this.currentCycle = this._countFocusBlocksUpTo(this.currentBlockIndex);
      }

      this.shownRemindersForCurrentPhase.clear();

      logger.log(LOG_CATEGORIES.TIMER, 'Starting next custom cycle block', {
        blockIndex: this.currentBlockIndex,
        blockType: nextBlock.type,
        duration: nextBlock.duration,
        currentCycle: this.currentCycle,
      });

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
    }

    /**
     * Handle completion of a block in custom cycle mode.
     * @private
     */
    _handleCustomCycleBlockComplete() {
      const completedBlock = this.customCycleBlocks[this.currentBlockIndex];
      logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle block complete', {
        blockIndex: this.currentBlockIndex,
        blockType: completedBlock.type,
        blocksRemaining: this.customCycleBlocks.length - this.currentBlockIndex - 1,
      });

      this.currentBlockIndex++;

      if (this.currentBlockIndex >= this.customCycleBlocks.length) {
        logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle complete');
        this.completeTimer();
        return;
      }

      const nextBlock = this.customCycleBlocks[this.currentBlockIndex];

      if (this._needsTransitionPhase(completedBlock, nextBlock)) {
        this._enterCustomCycleTransition(nextBlock);
        return;
      }

      this._startNextCustomBlock(nextBlock);
    }

    /**
     * Handle completion of the transition phase.
     * This is called when the transition timer runs out.
     * Triggers the callback to hide the popup and start focus.
     * @private
     */
    _handleTransitionPhaseComplete() {
      logger.log(LOG_CATEGORIES.TIMER, 'Transition phase timer complete');

      // Trigger the transition end callback if set
      // This will hide the popup and call startFocusFromTransition
      if (this.onTransitionEnd) {
        this.onTransitionEnd();
      } else {
        // Fallback: directly start focus if no callback set
        this.startFocusFromTransition();
      }
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

      // All breaks use the same duration
      this.currentPhase = 'break';
      this.remainingTime = this.config.breakDuration * 60;

      // Clear shown reminders for new phase
      this.shownRemindersForCurrentPhase.clear();

      return false;
    }

    /**
     * Handle completion of a break phase.
     * Instead of immediately starting the focus phase, we enter a "transition" phase
     * which shows a popup to warn the user that their break is ending.
     * @returns {boolean} True if timer should complete, false to continue
     * @private
     */
    _handleBreakPhaseComplete() {
      this.currentCycle++;

      if (this.currentCycle > this.totalCycles) {
        this.completeTimer();
        return true;
      }

      // Enter transition phase instead of immediately starting focus
      // The transition popup will handle starting the actual focus phase
      this.currentPhase = 'transition';
      this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;

      // Clear shown reminders for new phase
      this.shownRemindersForCurrentPhase.clear();

      // Trigger the transition popup callback if set
      if (this.onTransitionStart) {
        this.onTransitionStart();
      }

      return false;
    }

    /**
     * Check if currently in a custom cycle with valid block.
     * @returns {boolean} True if in custom cycle mode with valid block index
     * @private
     */
    _isValidCustomCycleState() {
      return this.mode === 'custom' && 
             this.customCycleBlocks && 
             this.currentBlockIndex < this.customCycleBlocks.length;
    }

    /**
     * Get the current custom cycle block's duration.
     * @returns {number|null} Duration in minutes, or null if not in custom cycle
     * @private
     */
    _getCurrentCustomBlockDuration() {
      if (!this._isValidCustomCycleState()) return null;
      return this.customCycleBlocks[this.currentBlockIndex].duration;
    }

    /**
     * Called when the transition phase ends (either by timer or user action).
     * Starts the actual focus phase.
     */
    startFocusFromTransition() {
      logger.log(LOG_CATEGORIES.TIMER, 'Starting focus from transition phase');

      this.currentPhase = 'focus';
      const customDuration = this._getCurrentCustomBlockDuration();

      if (customDuration !== null) {
        this.remainingTime = customDuration * 60;
        logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle: Using block duration', {
          blockIndex: this.currentBlockIndex,
          duration: customDuration,
        });
      } else {
        this.remainingTime = this.config.focusDuration * 60;
      }

      this.shownRemindersForCurrentPhase.clear();

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
    }

    /**
     * Skip the current focus phase and move to break.
     * Works for both regular Pomodoro and custom cycle modes.
     * @returns {boolean} True if skip was successful
     */
    skipFocusToBreak() {
      if (!this.isActive) {
        logger.log(LOG_CATEGORIES.TIMER, 'skipFocusToBreak: Timer not active');
        return false;
      }

      if (this.currentPhase !== 'focus') {
        logger.log(LOG_CATEGORIES.TIMER, 'skipFocusToBreak: Not in focus phase');
        return false;
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Skipping focus phase to break', {
        mode: this.mode,
        currentCycle: this.currentCycle,
      });

      if (this.mode === 'custom') {
        // Custom cycle mode: advance to next block (which should be a break)
        return this._skipFocusInCustomMode();
      }

      if (this.mode === 'simple') {
        // Simple mode has no break, so complete the timer
        this.completeTimer();
        return true;
      }

      // Regular Pomodoro mode: always skip to break phase
      // Even on last cycle, user should get their break before timer completes
      this.currentPhase = 'break';
      this.remainingTime = this.config.breakDuration * 60;

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
      return true;
    }

    /**
     * Skip focus to next break block in custom cycle mode.
     * @returns {boolean} True if skip was successful
     * @private
     */
    _skipFocusInCustomMode() {
      if (!this.customCycleBlocks || this.currentBlockIndex >= this.customCycleBlocks.length) {
        logger.log(LOG_CATEGORIES.TIMER, '_skipFocusInCustomMode: No more blocks');
        this.completeTimer();
        return true;
      }

      // Find next break block
      let nextIndex = this.currentBlockIndex + 1;
      while (nextIndex < this.customCycleBlocks.length) {
        if (this.customCycleBlocks[nextIndex].type === 'break') {
          break;
        }
        nextIndex++;
      }

      if (nextIndex >= this.customCycleBlocks.length) {
        // No more break blocks, complete timer
        logger.log(LOG_CATEGORIES.TIMER, '_skipFocusInCustomMode: No break blocks remaining');
        this.completeTimer();
        return true;
      }

      // Move to the break block
      this.currentBlockIndex = nextIndex;
      const block = this.customCycleBlocks[nextIndex];
      this.currentPhase = 'break';
      this.remainingTime = block.duration * 60;

      logger.log(LOG_CATEGORIES.TIMER, '_skipFocusInCustomMode: Moved to break block', {
        blockIndex: nextIndex,
        duration: block.duration,
      });

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
      return true;
    }

    /**
     * Check if the timer can skip to next custom cycle block.
     * @returns {boolean} True if skip is allowed
     * @private
     */
    _canSkipCustomBlock() {
      if (this.mode !== 'custom' || !this.customCycleBlocks) {
        logger.log(LOG_CATEGORIES.TIMER, 'skipToNextCustomBlock: Not in custom mode');
        return false;
      }

      if (this.currentPhase !== 'break' && this.currentPhase !== 'transition') {
        logger.log(LOG_CATEGORIES.TIMER, 'skipToNextCustomBlock: Not in break or transition phase, cannot skip');
        return false;
      }

      return true;
    }

    /**
     * Find the next non-break block index, skipping consecutive break blocks.
     * @param {number} startIndex - Starting index
     * @returns {number} Index of next non-break block, or blocks.length if none found
     * @private
     */
    _findNextNonBreakBlockIndex(startIndex) {
      let index = startIndex;
      while (
        index < this.customCycleBlocks.length &&
        this.customCycleBlocks[index]?.type === 'break'
      ) {
        index++;
      }
      return index;
    }

    /**
     * Skip to the next block in custom cycle mode (for cutting break early).
     * Skips over any consecutive break blocks to reach the next focus block.
     * If there's no next block, completes the timer.
     * @returns {boolean} True if successfully skipped, false if timer completed or not in custom mode
     */
    skipToNextCustomBlock() {
      if (!this._canSkipCustomBlock()) return false;

      // Move to next block index
      const originalIndex = this.currentBlockIndex;
      this.currentBlockIndex++;

      // If we're already past the end, the cycle is complete
      if (this.currentBlockIndex >= this.customCycleBlocks.length) {
        logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle complete (cut break early)');
        this.completeTimer();
        return false;
      }

      // Skip over any consecutive break blocks; user likely expects to jump to next focus block
      this.currentBlockIndex = this._findNextNonBreakBlockIndex(this.currentBlockIndex);

      // If we ran out of blocks while skipping breaks, the cycle is complete
      if (this.currentBlockIndex >= this.customCycleBlocks.length) {
        logger.log(LOG_CATEGORIES.TIMER, 'Custom cycle complete while skipping consecutive breaks (cut break early)');
        this.completeTimer();
        return false;
      }

      // Set up next non-break block (typically a focus block)
      const nextBlock = this.customCycleBlocks[this.currentBlockIndex];
      this.currentPhase = nextBlock.type;
      this.remainingTime = nextBlock.duration * 60;

      logger.log(LOG_CATEGORIES.TIMER, 'Cut break early: Skipping to next custom cycle block', {
        fromIndex: originalIndex,
        toIndex: this.currentBlockIndex,
        blockType: nextBlock.type,
        duration: nextBlock.duration,
      });

      // Notify phase change
      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
      return true;
    }

    /**
     * Pause the timer
     * @param {boolean} isOnBlockedWorkspace - Whether the timer is being paused on a blocked workspace
     */
    pause(isOnBlockedWorkspace = false) {
      this.isPaused = true;
      this.pausedOnBlockedWorkspace = isOnBlockedWorkspace;
      logger.log(LOG_CATEGORIES.TIMER, 'Timer paused', {
        remainingTime: this.remainingTime,
        phase: this.currentPhase,
        pausedOnBlockedWorkspace: isOnBlockedWorkspace,
      });
      this.saveState();

      // CROSS-WINDOW SYNC: Claim ownership on pause if not already owner
      const sync = window.zenPomodoroApp?.windowSync;
      if (sync && !sync.isTimerOwner) {
        sync.claimOwnership();
        if (!this.intervalId && this.isActive) {
          this.startInterval();
        }
      }
      this._writeSyncState();
    }

    /**
     * Resume the timer
     * BROWSER RESTART FIX: Start interval if not already running (restored from restart)
     */
    resume() {
      this.isPaused = false;
      this.pausedOnBlockedWorkspace = false; // Reset paused workspace tracking
      logger.log(LOG_CATEGORIES.TIMER, 'Timer resumed', {
        remainingTime: this.remainingTime,
        phase: this.currentPhase,
      });

      // BROWSER RESTART FIX: Start interval if not running
      // After browser restart, loadState() restores timer in paused state WITHOUT starting interval.
      // When user clicks resume, we need to start the interval to get UI updates.
      // Conditions: interval not running (!intervalId) AND timer was actually restored (isActive)
      if (!this.intervalId && this.isActive) {
        logger.log(LOG_CATEGORIES.TIMER, 'Starting interval on resume (was not running)');
        this.startInterval();
      }

      this.saveState();

      // CROSS-WINDOW SYNC: Claim ownership on resume if not already owner
      const sync = window.zenPomodoroApp?.windowSync;
      if (sync && !sync.isTimerOwner) {
        sync.claimOwnership();
      }
      this._writeSyncState();
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
      this.pausedOnBlockedWorkspace = false; // Reset paused workspace tracking
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.savedConfig = null;
      this.clearState();

      // CROSS-WINDOW SYNC: Clear sync state, write final state, and release ownership
      const sync = window.zenPomodoroApp?.windowSync;
      if (sync) {
        sync.writeSyncState({ isActive: false, isPaused: false, remainingTime: 0 });
        sync.clearSyncState();
        sync.releaseOwnership();
      }
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
        pausedOnBlockedWorkspace: this.pausedOnBlockedWorkspace, // Track pause workspace state
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode,
        savedConfig: this.savedConfig, // Store config with state
        // Custom cycle state
        customCycle: this.customCycle,
        customCycleBlocks: this.customCycleBlocks,
        currentBlockIndex: this.currentBlockIndex,
        // Distraction dump state
        distractionDump: window.zenPomodoroApp?.distractionDump?.getStateForPersistence() || null,
      };
      setPref('timer-state', JSON.stringify(state));
    }

    /**
     * Restore basic timer state from saved state object.
     * @param {Object} state - Saved state object
     * @private
     */
    _restoreBasicState(state) {
      this.isActive = state.isActive;
      // AUTO-PAUSE FIX: Always pause timer on restoration (user requirement)
      this.isPaused = true;
      this.pausedOnBlockedWorkspace = state.pausedOnBlockedWorkspace || false;
      this.remainingTime = state.remainingTime;
      // Backwards compatibility: treat 'long-break' as 'break'
      this.currentPhase = state.currentPhase === 'long-break' ? 'break' : state.currentPhase;
      this.currentCycle = state.currentCycle;
      this.totalCycles = state.totalCycles;
      this.mode = state.mode;
    }

    /**
     * Restore custom cycle specific state.
     * @param {Object} state - Saved state object
     * @private
     */
    _restoreCustomCycleState(state) {
      if (state.mode === 'custom') {
        this.customCycle = state.customCycle;
        this.customCycleBlocks = state.customCycleBlocks;
        this.currentBlockIndex = state.currentBlockIndex || 0;
      }
    }

    /**
     * Load timer state from preferences
     * LOGIC FIX: Restore config from saved state
     * AUTO-PAUSE FIX: Timer is paused on browser restart
     */
    loadState() {
      const stateStr = getPref('timer-state', null);
      if (!stateStr) return false;

      try {
        const state = JSON.parse(stateStr);
        if (!state.isActive) return false;

        this._restoreBasicState(state);
        this._restoreCustomCycleState(state);

        // Restore saved config
        if (state.savedConfig) {
          this.savedConfig = state.savedConfig;
          this.config = state.savedConfig;
        }

        // Store dump state for later restoration
        this.pendingDumpState = state.distractionDump || null;

        // Set flag to indicate this was restored from restart
        this.restoredFromRestart = true;
        return true;
      } catch (e) {
        console.error('Failed to load timer state:', e);
        return false;
      }
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
      this.mutationDebounceTimer = null; // Timer for debouncing workspace mutations
    }

    /**
     * Get the currently active workspace
     */
    getActiveWorkspace() {
      try {
        // BUG FIX: Workspace blocking stopped working correctly on newer Zen Browser versions
        // because the DOM structure for workspaces changed. Modern Zen builds expose the active
        // workspace as a <zen-workspace> element, while older versions and some custom setups
        // still rely on toolbarbutton[zen-workspace-id][active="true"]. To remain compatible
        // across Zen Browser versions and themes, we first try the modern zen-workspace selector
        // and then fall back to the legacy toolbarbutton-based selector.
        let activeElement = document.querySelector('zen-workspace[active="true"][id]');
        if (activeElement) {
          return activeElement.id;
        }

        // Fallback to toolbarbutton selector (legacy approach for older Zen versions/themes)
        activeElement = document.querySelector('toolbarbutton[zen-workspace-id][active="true"]');
        if (activeElement) {
          return activeElement.getAttribute('zen-workspace-id');
        }
      } catch (e) {
        console.error('Failed to get active workspace:', e);
      }
      return null;
    }

    /**
     * Validate and clean up deleted workspaces from blocked list.
     * Now validates across all rulesets' blockedWorkspaces arrays.
     * Only called when workspace changes are detected.
     */
    validateBlockedWorkspaces() {
      if (!this.needsValidation) {
        return;
      }

      const existingWorkspaces = this.getAllWorkspaces();
      const existingWorkspaceIds = existingWorkspaces.map((ws) => ws.id);
      let configChanged = false;

      // Validate global blockedWorkspaces (deprecated but kept for backwards compatibility)
      const originalGlobalLength = this.config.blockedWorkspaces.length;
      this.config.blockedWorkspaces = this.config.blockedWorkspaces.filter((wsId) =>
        existingWorkspaceIds.includes(wsId)
      );
      if (this.config.blockedWorkspaces.length !== originalGlobalLength) {
        configChanged = true;
      }

      // Validate blockedWorkspaces in each ruleset
      (this.config.rulesets || []).forEach((ruleset) => {
        if (ruleset.blockedWorkspaces && Array.isArray(ruleset.blockedWorkspaces)) {
          const originalRulesetLength = ruleset.blockedWorkspaces.length;
          ruleset.blockedWorkspaces = ruleset.blockedWorkspaces.filter((wsId) =>
            existingWorkspaceIds.includes(wsId)
          );
          if (ruleset.blockedWorkspaces.length !== originalRulesetLength) {
            configChanged = true;
          }
        }
      });

      // Save config only if we removed any deleted workspaces
      if (configChanged) {
        console.log('Removed deleted workspaces from blocked lists');
        saveConfig(this.config);
      }

      // Cache the combined blocked workspaces from active rulesets
      this.validatedWorkspaces = getActiveBlockedWorkspaces();
      this.needsValidation = false;
    }

    /**
     * Check if current workspace is blocked
     * PERFORMANCE FIX: Validation only runs on workspace change, not every call
     * BREAK PHASE FIX: Returns false during break phases to allow free browsing
     */
    isCurrentWorkspaceBlocked() {
      // During break phases, workspaces are not blocked to allow free browsing
      if (isInBreakPhase()) {
        logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace blocking disabled during break phase');
        return false;
      }

      return this._checkWorkspaceBlocked('Workspace blocked check');
    }

    /**
     * Check if current workspace is in the blocked list.
     * Unlike isCurrentWorkspaceBlocked(), this does NOT check for break phase.
     * Originally designed for paused state logic where break/transition phases
     * are already handled separately, but safe for general use when you need
     * to check raw workspace membership without phase filtering.
     * @returns {boolean} True if current workspace is in the blocked list
     */
    isWorkspaceInBlockedList() {
      return this._checkWorkspaceBlocked('Workspace in blocked list check (no phase check)');
    }

    /**
     * Private helper to check if current workspace is in the blocked list.
     * Reloads config and checks against combined blocked workspaces from active rulesets.
     * Returns false if no active workspace can be detected.
     * @param {string} logMessage - Description for logging purposes
     * @returns {boolean} True if current workspace is in the blocked list, false otherwise
     * @private
     */
    _checkWorkspaceBlocked(logMessage) {
      // Reload config to get latest blocked workspaces
      this.config = getConfig();

      const activeWorkspace = this.getActiveWorkspace();
      if (!activeWorkspace) {
        return false;
      }

      // Get blocked workspaces from all active rulesets
      const activeBlockedWorkspaces = getActiveBlockedWorkspaces();
      const isBlocked = activeBlockedWorkspaces.includes(activeWorkspace);

      logger.log(LOG_CATEGORIES.WORKSPACE, logMessage, {
        workspaceId: activeWorkspace,
        isBlocked: isBlocked,
        blockedCount: activeBlockedWorkspaces.length,
      });
      return isBlocked;
    }

    /**
     * Check if a specific workspace ID is in the blocked list.
     * Uses cached config when available, reducing repeated config parsing.
     * @param {string} workspaceId - The workspace ID to check
     * @returns {boolean} True if the workspace is in the blocked list
     */
    isWorkspaceIdBlocked(workspaceId) {
      // Use cached config if available, otherwise reload
      if (!this.config) {
        this.config = getConfig();
      }
      // Get blocked workspaces from all active rulesets
      const activeBlockedWorkspaces = getActiveBlockedWorkspaces();
      return activeBlockedWorkspaces.includes(workspaceId);
    }

    /**
     * Handle workspace mutation observer callback
     * @private
     */
    _handleWorkspaceMutation() {
      // Clear any pending timeout to implement proper debouncing
      if (this.mutationDebounceTimer) {
        clearTimeout(this.mutationDebounceTimer);
        this.mutationDebounceTimer = null;
      }

      // Use a small delay to ensure DOM has fully updated before checking workspace
      this.mutationDebounceTimer = setTimeout(() => {
        const newWorkspace = this.getActiveWorkspace();

        // BUG FIX: Log mutation handler execution to debug workspace change detection
        logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace mutation detected', {
          oldWorkspace: this.activeWorkspace,
          newWorkspace: newWorkspace,
          changed: newWorkspace !== this.activeWorkspace,
        });

        if (newWorkspace === this.activeWorkspace) return;

        this.activeWorkspace = newWorkspace;
        this.needsValidation = true;
        this.validateBlockedWorkspaces();

        if (this.onWorkspaceChange) {
          // WORKSPACE BLOCKING FIX: Use isWorkspaceIdBlocked() to get raw workspace membership
          // (not phase-filtered) so overlay visibility works correctly when paused or during breaks.
          // Phase filtering is handled in updateOverlayVisibility().
          const isBlocked = newWorkspace ? this.isWorkspaceIdBlocked(newWorkspace) : false;
          this.onWorkspaceChange(newWorkspace, isBlocked);
        }

        this.mutationDebounceTimer = null;
      }, WORKSPACE_MUTATION_DELAY_MS);
    }

    /**
     * Start monitoring workspace changes
     * MEMORY LEAK FIX: Store observer for cleanup
     * PERFORMANCE FIX: Validate workspaces on change, not on every check
     */
    startMonitoring() {
      this.activeWorkspace = this.getActiveWorkspace();

      logger.log(LOG_CATEGORIES.WORKSPACE, 'Starting workspace monitoring', {
        initialWorkspace: this.activeWorkspace,
      });

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
      let workspaceContainerSelector = null;
      for (const selector of WORKSPACE_CONTAINER_SELECTORS) {
        const element = document.querySelector(selector);
        if (element) {
          workspaceContainer = element;
          workspaceContainerSelector = selector;
          break;
        }
      }

      // Set up observer on the workspace container if found
      if (workspaceContainer) {
        this.workspaceObserver.observe(workspaceContainer, {
          attributes: true,
          attributeFilter: ['active', 'selected', 'zen-workspace-id'],
          subtree: true,
          // Observes childList changes to detect when workspace buttons/elements
          // are added or removed (e.g., new workspaces created), ensuring
          // _handleWorkspaceMutation() keeps the active workspace state in sync.
          childList: true,
        });
        logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace observer configured', {
          container: workspaceContainerSelector,
          observingAttributes: ['active', 'selected', 'zen-workspace-id'],
        });
      } else {
        console.warn('[Pomodoro Focus Blocker] No workspace container found for monitoring');
        logger.log(LOG_CATEGORIES.WORKSPACE, 'No workspace container found for monitoring');
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
      // Clear any pending debounce timer
      if (this.mutationDebounceTimer) {
        clearTimeout(this.mutationDebounceTimer);
        this.mutationDebounceTimer = null;
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
      // BUG FIX: Try the modern zen-workspace elements first (for newer Zen Browser versions)
      const modernWorkspaces = this._tryModernWorkspaceElements();
      if (modernWorkspaces) return modernWorkspaces;

      // Fallback to legacy selectors
      return this._tryLegacyContainerWorkspaces();
    }

    /**
     * Try to get workspaces from modern zen-workspace elements.
     * @returns {Array|null} Workspaces array or null if none found
     * @private
     */
    _tryModernWorkspaceElements() {
      const items = document.querySelectorAll('zen-workspace');
      if (items.length === 0) return null;

      logger.log(
        LOG_CATEGORIES.WORKSPACE,
        'Workspace detection: Using modern zen-workspace elements',
        {
          count: items.length,
        }
      );
      console.log(`Zen Pomodoro: Got ${items.length} workspaces from zen-workspace elements`);

      return Array.from(items).map((item) => this._extractWorkspaceFromModernElement(item));
    }

    /**
     * Extract workspace data from a modern zen-workspace element.
     * @param {Element} item - The zen-workspace element
     * @returns {Object} Workspace object with id and name
     * @private
     */
    _extractWorkspaceFromModernElement(item) {
      const id = item.id;
      const name =
        item.getAttribute('label') ||
        item.querySelector('.zen-current-workspace-indicator-name')?.textContent?.trim() ||
        `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
      return { id, name };
    }

    /**
     * Try to get workspaces from legacy container selectors.
     * @returns {Array|null} Workspaces array or null if none found
     * @private
     */
    _tryLegacyContainerWorkspaces() {
      const container = this._findLegacyWorkspaceContainer();
      if (!container) return null;

      const items = container.querySelectorAll('[zen-workspace-id], [data-workspace-id]');
      if (items.length === 0) return null;

      console.log(`Zen Pomodoro: Got ${items.length} workspaces from container`);
      return Array.from(items).map((item) => this._extractWorkspaceFromLegacyElement(item));
    }

    /**
     * Find the legacy workspace container element.
     * @returns {Element|null} Container element or null
     * @private
     */
    _findLegacyWorkspaceContainer() {
      return document.querySelector(
        '#zen-workspaces-button-container, #zen-workspace-button-container, [id*="workspace"]'
      );
    }

    /**
     * Extract workspace data from a legacy container element.
     * @param {Element} item - The workspace element
     * @returns {Object} Workspace object with id and name
     * @private
     */
    _extractWorkspaceFromLegacyElement(item) {
      const id = item.getAttribute('zen-workspace-id') || item.getAttribute('data-workspace-id');
      const name =
        item.getAttribute('label') ||
        item.getAttribute('data-name') ||
        item.textContent?.trim() ||
        `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
      return { id, name };
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
      this.indicatorContextMenuHandler = null; // Store for cleanup (right-click pause/unpause)
      this.indicatorDidDrag = false; // Track if indicator was dragged (to suppress click events)
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
        cycleProgress.classList.add('zen-pomodoro-hidden');
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
        this.indicatorDidDrag = false; // Reset drag state on new mousedown

        const rect = this.indicator.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        // Cache dimensions at start of drag to avoid repeated getBoundingClientRect calls
        this.indicatorWidth = rect.width;
        this.indicatorHeight = rect.height;

        // Add dragging class to disable CSS transitions during drag
        if (this.indicator?.classList) {
          this.indicator.classList.add('dragging');
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Mark as dragged if movement exceeds threshold (5 pixels)
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          this.indicatorDidDrag = true;
        }

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

        // Remove dragging class to re-enable CSS transitions
        if (this.indicator?.classList) {
          this.indicator.classList.remove('dragging');
        }

        // Save position to preferences
        const rect = this.indicator.getBoundingClientRect();
        setPref('indicatorPosX', Math.round(rect.left));
        setPref('indicatorPosY', Math.round(rect.top));

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Reset drag flag after a delay to allow click event to check it
        // 100ms is sufficient since click events fire immediately after mouseup
        setTimeout(() => {
          this.indicatorDidDrag = false;
        }, 100);
      };

      // Store reference for cleanup
      this.indicatorMouseDownHandler = onMouseDown;
      this.indicator.addEventListener('mousedown', onMouseDown);

      // RIGHT-CLICK TO PAUSE/UNPAUSE: Add contextmenu event handler
      // This allows users to quickly pause/resume timer without opening menu
      const onContextMenu = (e) => {
        // Prevent the default context menu from showing
        e.preventDefault();
        // Stop propagation to prevent affecting the webpage below
        e.stopPropagation();

        // Check if timer is active
        if (!window.zenPomodoroApp?.timer?.isActive) {
          return;
        }

        // Check if Distraction Dump is active - don't allow pause during dump
        if (isDistractionDumpBlocking()) {
          window.zenPomodoroApp.showCustomAlert(
            Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
            Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
          );
          return;
        }

        // Toggle pause/resume
        handlePauseResumeTimer();

        logger.log(LOG_CATEGORIES.TIMER, 'Timer toggled via indicator right-click', {
          isPaused: window.zenPomodoroApp.timer.isPaused,
        });
      };

      // Store reference for cleanup
      this.indicatorContextMenuHandler = onContextMenu;
      this.indicator.addEventListener('contextmenu', onContextMenu);
    }

    /**
     * Set up overlay button handlers
     * RACE CONDITION FIX: Called immediately after overlay creation
     */
    setupOverlayHandlers() {
      const pauseButton = this.overlay?.querySelector('#zen-pomodoro-pause-button');
      const stopButton = this.overlay?.querySelector('#zen-pomodoro-stop-button');

      if (pauseButton) {
        pauseButton.addEventListener('click', () => this._handlePauseClick(pauseButton));
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
     * Handle pause button click on overlay.
     * @param {HTMLElement} pauseButton - The pause button element
     * @private
     */
    _handlePauseClick(pauseButton) {
      if (!window.zenPomodoroApp || !window.zenPomodoroApp.timer) return;

      // Check if Distraction Dump is active - provide user feedback
      if (isDistractionDumpBlocking()) {
        window.zenPomodoroApp.showCustomAlert(
          Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
          Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
        );
        return;
      }
      handlePauseResumeTimer();
      pauseButton.textContent = window.zenPomodoroApp.timer.isPaused ? 'Resume' : 'Pause';
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

      // Log every 30 seconds to avoid log spam
      if (remainingTime % 30 === 0) {
        logger.log(LOG_CATEGORIES.OVERLAY, 'Display updated', {
          time: timeStr,
          phase,
          cycle: currentCycle,
          totalCycles,
        });
      }
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

      // Only show cycle progress for pomodoro and custom modes during focus phase
      const timerMode = window.zenPomodoroApp?.timer?.mode;
      const shouldShow = phase === 'focus' && (timerMode === 'pomodoro' || timerMode === 'custom');
      cycleProgress.classList.toggle('zen-pomodoro-hidden', !shouldShow);
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

        // PAUSED INDICATOR FIX: keep paused state in sync during normal updates,
        // not just on explicit pause/resume actions, using the centralized handler.
        const timer = window.zenPomodoroApp?.timer;
        if (timer) {
          this.updateIndicatorPausedState(timer.isPaused);
        }
      }
    }

    /**
     * Update phase color
     */
    updatePhaseColor(phase) {
      if (!this.overlay) return;

      this.overlay.setAttribute('data-phase', phase);
      logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay phase color updated', { phase });

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
      logger.log(LOG_CATEGORIES.OVERLAY, 'Timer indicator shown');
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

      // Note: Paused state is set by actual pause/resume handlers in handlePauseResumeTimer(),
      // not here during indicator initialization. This prevents incorrect initial state.
    }

    /**
     * Hide persistent indicator
     */
    hideIndicator() {
      if (this.indicator) {
        this.indicator.classList.remove('active');
        logger.log(LOG_CATEGORIES.OVERLAY, 'Timer indicator hidden');
      }
    }

    /**
     * Update the indicator's paused state attribute for visual feedback.
     * This method should be called when the timer is paused or resumed
     * to ensure the indicator shows orange color when paused and normal color when not paused.
     * @param {boolean} isPaused - Whether the timer is currently paused
     */
    updateIndicatorPausedState(isPaused) {
      if (!this.indicator) return;

      this.indicator.setAttribute('data-paused', isPaused ? 'true' : 'false');
      logger.log(LOG_CATEGORIES.OVERLAY, 'Indicator paused state attribute updated', {
        isPaused: isPaused,
      });
    }

    /**
     * Switch indicator to dump mode - purple styling and dump timer display.
     * Applies the 'dump-active' CSS class which triggers purple gradient background,
     * purple dot color, and clickable cursor. Shows the indicator if not already visible.
     * @param {number} timeInSeconds - Time remaining in dump in seconds
     */
    showDumpIndicator(timeInSeconds) {
      if (!this.indicator) this.createOverlay();

      // Add dump-active class for purple styling
      this.indicator.classList.add('dump-active');

      // Update text to show dump time (no emoji for accessibility)
      const indicatorText = this.indicator.querySelector('#zen-pomodoro-indicator-text');
      if (indicatorText) {
        indicatorText.textContent = `Dump: ${formatTime(timeInSeconds)}`;
      }

      // Show indicator if not already visible
      if (!this.indicator.classList.contains('active')) {
        this.indicator.classList.add('active');
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Dump indicator shown', { timeInSeconds });
    }

    /**
     * Update dump indicator time display.
     * Updates only the text content to show remaining dump time.
     * Does not change styling or visibility.
     * @param {number} timeInSeconds - Time remaining in dump in seconds
     */
    updateDumpIndicator(timeInSeconds) {
      if (!this.indicator) return;

      const indicatorText = this.indicator.querySelector('#zen-pomodoro-indicator-text');
      if (indicatorText) {
        indicatorText.textContent = `Dump: ${formatTime(timeInSeconds)}`;
      }
    }

    /**
     * Switch indicator back to normal timer mode.
     * Removes the 'dump-active' class and restores normal timer display.
     * If the timer is active, shows current phase and time.
     * If the timer is not active, hides the indicator completely.
     */
    hideDumpIndicator() {
      if (!this.indicator) return;

      // Remove dump-active class
      this.indicator.classList.remove('dump-active');

      // Restore normal timer display
      const timer = window.zenPomodoroApp?.timer;
      if (timer && timer.isActive) {
        const timeStr = formatTime(timer.remainingTime);
        const phase = timer.currentPhase || 'focus';
        this._updateIndicator(phase, timeStr);
      } else {
        // If timer is not active, hide the indicator
        this.hideIndicator();
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Dump indicator hidden, normal indicator restored');
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
      // Clean up contextmenu handler for right-click pause/unpause
      if (this.indicator && this.indicatorContextMenuHandler) {
        this.indicator.removeEventListener('contextmenu', this.indicatorContextMenuHandler);
        this.indicatorContextMenuHandler = null;
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
     * Refactored to reduce "Bumpy Road" code smell with extracted helpers.
     */
    shouldLockSettings(timerActive) {
      const config = getConfig();
      return timerActive ? this._shouldLockActiveTimer(config) : this._shouldLockIdleTimer(config);
    }

    /**
     * Check lock settings for active timer state.
     * @param {Object} config - Configuration object
     * @returns {boolean} True if settings should be locked
     * @private
     */
    _shouldLockActiveTimer(config) {
      return config.settingsLockActiveMethod === LOCKOUT_METHODS.CODE
        ? config.settingsLockActiveCodeLength > 0
        : config.settingsLockActiveHoldDuration > 0;
    }

    /**
     * Check lock settings for idle timer state.
     * @param {Object} config - Configuration object
     * @returns {boolean} True if settings should be locked
     * @private
     */
    _shouldLockIdleTimer(config) {
      return config.settingsLockIdleMethod === LOCKOUT_METHODS.CODE
        ? config.settingsLockIdleCodeLength > 0
        : config.settingsLockIdleHoldDuration > 0;
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

      const codeContainer = document.createElement('div');
      codeContainer.className = 'zen-pomodoro-code-container';

      const codeDiv = document.createElement('div');
      codeDiv.className = 'zen-pomodoro-lock-code-display';
      codeDiv.textContent = code;

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'zen-pomodoro-lock-code';
      input.placeholder = 'Enter code here';

      codeContainer.appendChild(codeDiv);
      codeContainer.appendChild(input);

      // Shared verification function
      const verifyCode = () => {
        if (input.value === code) {
          logger.log(LOG_CATEGORIES.SECURITY, 'Code verification successful');
          this.cleanupLockScreen();
          onUnlock();
        } else {
          logger.log(LOG_CATEGORIES.SECURITY, 'Code verification failed - incorrect code');
          window.zenPomodoroApp?.showCustomAlert('Incorrect Code', 'Please try again.');
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCode();
      });

      const { buttonDiv } = this._createLockButtonRow();

      const unlockButton = document.createElement('button');
      unlockButton.className = 'zen-pomodoro-dialog-button';
      unlockButton.id = 'zen-pomodoro-lock-submit';
      unlockButton.textContent = 'Unlock';
      buttonDiv.appendChild(unlockButton);

      unlockButton.addEventListener('click', verifyCode);

      lockContent.appendChild(h2);
      lockContent.appendChild(p);
      lockContent.appendChild(codeContainer);
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
     * Uses shared setupHoldToUnlockHandlers utility to reduce code duplication.
     * @param {HTMLElement} holdButton - The hold button element
     * @param {HTMLElement} holdProgress - The progress bar element
     * @param {number} waitTime - Total wait time in seconds
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock) {
      // Store cleanup function to prevent memory leaks
      this._holdHandlersCleanup = setupHoldToUnlockHandlers({
        holdButton,
        holdProgress,
        waitTime,
        timerElement: this.lockTimerElement,
        onComplete: () => {
          this.cleanupLockScreen();
          onUnlock();
        },
        clearInterval: () => this._clearHoldInterval(),
        setIntervalId: (id) => {
          this.holdToUnlockIntervalId = id;
        },
        logCategory: LOG_CATEGORIES.SECURITY,
        logMessage: 'Hold-to-unlock completed successfully',
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
     * Clear an interval and nullify its reference.
     * @param {string} intervalKey - Key of the interval property to clear
     * @private
     */
    _clearIntervalIfExists(intervalKey) {
      if (this[intervalKey]) {
        clearInterval(this[intervalKey]);
        this[intervalKey] = null;
      }
    }

    /**
     * Restore overlay pointer-events if they were disabled.
     * @private
     */
    _restoreOverlayPointerEvents() {
      if (!this._overlayPointerEventsDisabled) return;

      const overlay =
        window.zenPomodoroApp?.overlay?.overlay || document.getElementById('zen-pomodoro-overlay');
      if (overlay) {
        overlay.style.setProperty('pointer-events', 'all', 'important');
      }
      this._overlayPointerEventsDisabled = false;
    }

    /**
     * Cleanup lock screen
     * MEMORY LEAK FIX: Clear interval and cached element reference on cleanup
     * Z-INDEX FIX: Restore overlay pointer-events when lock screen is closed
     * Refactored to reduce cyclomatic complexity.
     */
    cleanupLockScreen() {
      this._clearIntervalIfExists('lockIntervalId');
      this._clearIntervalIfExists('holdToUnlockIntervalId');

      // Call cleanup function to remove event listeners
      if (this._holdHandlersCleanup) {
        this._holdHandlersCleanup();
        this._holdHandlersCleanup = null;
      }

      this.lockTimerElement = null;
      if (this.lockScreen) {
        this.lockScreen.remove();
        this.lockScreen = null;
      }

      this._restoreOverlayPointerEvents();
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
     * NOTE: SineModBlocker intentionally does NOT disable during break phases
     * because users should not be able to modify mod settings during any timer session.
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
     * Uses shared utilities to reduce code duplication.
     * NOTE: SineModBlocker does NOT hide on break phase because mod settings
     * should remain locked throughout any timer session.
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

      // Buttons using shared utility
      // NOTE: Sine Mod blocker does NOT hide on break phase (mod settings stay locked)
      const buttons = createBlockerButtons(
        'zen-pomodoro-sine-blocker-buttons',
        () => this._handleGoBack(),
        () => this._handleStopTimer()
      );

      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(timerStatus);
      content.appendChild(buttons);

      this.blockerOverlay.appendChild(content);

      // Set up timer status updates using shared utility
      startBlockerTimerStatusUpdates(this, timerStatus);
    }

    /**
     * Update the timer status display.
     * Delegates to shared utility to reduce code duplication.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _updateTimerStatus(statusElement) {
      updateBlockerTimerStatus(statusElement);
    }

    /**
     * Start interval to update timer status display.
     * Delegates to shared utility to reduce code duplication.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _startTimerStatusUpdates(statusElement) {
      startBlockerTimerStatusUpdates(this, statusElement);
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
   * Cooldown duration (in ms) after "Go Back" button is clicked.
   * During this period, _checkCurrentPage() is skipped to prevent the blocker
   * from re-appearing before navigation completes.
   * Uses 800ms to handle slower page loads and network conditions.
   * @constant {number}
   */
  const WEBSITE_BLOCKER_GO_BACK_COOLDOWN_MS = 800;

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
      this._goBackCooldownActive = false; // Cooldown flag to prevent re-blocking after "Go Back"
      this._goBackCooldownTimeout = null; // Timeout ID for cooldown cleanup
      this.distractionDumpActive = false; // Flag to disable blocking during distraction dump
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
     * BREAK PHASE FIX: Returns false during break phases to allow free browsing
     * DISTRACTION DUMP: Returns false during distraction dump to allow capturing thoughts
     * @returns {boolean} True if timer is active and NOT in break phase or dump
     * @private
     */
    _shouldShowBlocker() {
      // During distraction dump, website blocking is disabled to allow capturing thoughts
      if (this.distractionDumpActive) {
        return false;
      }
      // During break phases, website blocking is disabled to allow free browsing
      if (isInBreakPhase()) {
        return false;
      }
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
     * Try to setup content observer for the current page.
     * @private
     */
    _trySetupContentObserver() {
      try {
        // eslint-disable-next-line no-undef
        if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
          // eslint-disable-next-line no-undef
          const contentDoc = gBrowser.selectedBrowser.contentDocument;
          if (contentDoc?.body) {
            this._setupContentObserver(contentDoc);
          }
        }
      } catch (e) {
        // Log content access denied errors for debugging
        logger.log(LOG_CATEGORIES.SECURITY, 'Content document access denied', { error: e.message });
      }
    }

    /**
     * Evaluate URL against rulesets and update blocker state.
     * @param {string} url - URL to evaluate
     * @private
     */
    _evaluateUrlAndUpdateBlocker(url) {
      this.config = getConfig();
      const blockResult = this._checkUrlAgainstActiveRulesets(
        url,
        this.config.activeRulesets || ['default'],
        this.config.rulesets || []
      );

      logger.log(LOG_CATEGORIES.SECURITY, 'Website blocker page check', {
        url: url,
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
     * Check if current page should be blocked.
     * Shows or hides the blocker overlay based on timer state and current URL.
     * Refactored to reduce cyclomatic complexity.
     * @private
     */
    _checkCurrentPage() {
      // Skip check if go-back cooldown is active to prevent re-blocking during navigation
      if (this._goBackCooldownActive) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Page check skipped - go-back cooldown active');
        return;
      }

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
      this._trySetupContentObserver();

      // Evaluate URL against rulesets and update blocker
      this._evaluateUrlAndUpdateBlocker(currentUrl);

      // Schedule a delayed re-check for keyword blocking
      // This handles cases where tab title updates after the initial check
      this._scheduleKeywordRecheck();
    }

    /**
     * Schedule a delayed re-check for keyword blocking.
     * Handles cases where tab title updates after the initial page check.
     * @private
     */
    _scheduleKeywordRecheck() {
      if (!this._hasActiveKeywordRules()) return;

      if (this._keywordRecheckTimeout) {
        clearTimeout(this._keywordRecheckTimeout);
      }
      this._keywordRecheckTimeout = setTimeout(() => {
        if (!this._shouldShowBlocker()) return;
        const url = this._getCurrentUrl();
        if (url && !this._isInternalBrowserPage(url)) {
          this._evaluateUrlAndUpdateBlocker(url);
        }
      }, 500);
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
     * Refactored to reduce cyclomatic complexity by extracting helper methods.
     *
     * @param {Document} contentDoc - Content document to observe
     * @private
     */
    _setupContentObserver(contentDoc) {
      this._cleanupExistingObserver();

      if (!contentDoc?.body) return;

      if (!this._hasActiveKeywordRules()) {
        logger.log(
          LOG_CATEGORIES.SECURITY,
          'Skipping content observer - no keyword rules configured'
        );
        return;
      }

      this._createContentObserver(contentDoc);
    }

    /**
     * Clean up any existing content observer and debounce timeout.
     * @private
     */
    _cleanupExistingObserver() {
      if (this.contentObserver) {
        this.contentObserver.disconnect();
        this.contentObserver = null;
      }

      if (this._contentObserverDebounceTimeout) {
        clearTimeout(this._contentObserverDebounceTimeout);
        this._contentObserverDebounceTimeout = null;
      }
    }

    /**
     * Check if any active ruleset has keyword rules configured.
     * @returns {boolean} True if keyword rules exist in active rulesets
     * @private
     */
    _hasActiveKeywordRules() {
      const config = getConfig();
      const activeRulesets = config.activeRulesets || ['default'];
      const rulesets = config.rulesets || [];

      for (const rulesetId of activeRulesets) {
        const ruleset = rulesets.find((r) => r.id === rulesetId);
        if (ruleset?.rules?.some((r) => r.type === 'keyword' && r.pattern)) {
          return true;
        }
      }
      return false;
    }

    /**
     * Create and attach a MutationObserver to the content document.
     * @param {Document} contentDoc - Content document to observe
     * @private
     */
    _createContentObserver(contentDoc) {
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
      const filterRules = (type, condition) =>
        rules.filter((r) => r.type === type && r.condition === condition && r.pattern);

      return {
        websiteAllow: filterRules('website', 'allow'),
        keywordAllow: filterRules('keyword', 'allow'),
        websiteBlock: filterRules('website', 'block'),
        keywordBlock: filterRules('keyword', 'block'),
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
     * Get the current tab title from available browser sources.
     * Due to cross-origin security restrictions, we cannot access contentDocument.body.
     * Only the tab title is accessible from the browser chrome context.
     * @returns {string} The current tab title, or empty string if unavailable
     * @private
     */
    _getTabTitle() {
      /* eslint-disable no-undef */
      return (
        gBrowser.selectedTab?.label ||
        gBrowser.selectedBrowser?.contentTitle ||
        gBrowser.contentTitle ||
        ''
      );
      /* eslint-enable no-undef */
    }

    // eslint-disable-next-line no-unused-vars
    _getPageText(_titleOnly = true) {
      try {
        // eslint-disable-next-line no-undef
        if (typeof gBrowser === 'undefined') {
          logger.log(LOG_CATEGORIES.SECURITY, 'gBrowser not available for title check');
          return '';
        }

        const title = this._getTabTitle();
        if (title) {
          const maxLen = Constants.MAX_TITLE_LOG_LENGTH;
          const truncatedTitle = title.length > maxLen ? title.substring(0, maxLen) + '...' : title;
          logger.log(LOG_CATEGORIES.SECURITY, 'Page title retrieved for keyword check', {
            title: truncatedTitle,
          });
        }

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
      message.textContent = reason?.includes('keyword')
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

      // Buttons using shared utility
      const buttons = createBlockerButtons(
        'zen-pomodoro-website-blocker-buttons',
        () => this._handleGoBack(),
        () => this._handleStopTimer()
      );

      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(rulesetInfo);
      content.appendChild(timerStatus);
      content.appendChild(buttons);

      this.blockerOverlay.appendChild(content);

      // Set up timer status updates using shared utility
      startBlockerTimerStatusUpdates(this, timerStatus);
    }

    /**
     * Update the timer status display.
     * Delegates to shared utility to reduce code duplication.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _updateTimerStatus(statusElement) {
      updateBlockerTimerStatus(statusElement);
    }

    /**
     * Start interval to update timer status display.
     * Delegates to shared utility to reduce code duplication.
     * @param {HTMLElement} statusElement - Element to update
     * @private
     */
    _startTimerStatusUpdates(statusElement) {
      startBlockerTimerStatusUpdates(this, statusElement);
    }

    /**
     * Handle the "Go Back" button click.
     * Navigates the user away from the blocked website.
     * Uses shared utility for common navigation logic.
     * Sets a cooldown flag to prevent the blocker from re-appearing
     * before navigation completes.
     * @private
     */
    _handleGoBack() {
      logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Go Back on website blocker');

      // Clear any existing cooldown timeout to handle rapid successive clicks
      if (this._goBackCooldownTimeout) {
        clearTimeout(this._goBackCooldownTimeout);
      }

      // Set cooldown flag to prevent _checkCurrentPage() from re-triggering
      // the blocker while navigation is in progress
      this._goBackCooldownActive = true;

      handleBlockerGoBack(() => this._hideBlocker(), WEBSITE_BLOCKER_HIDE_DELAY_MS);

      // Clear the cooldown flag after navigation should be complete
      this._goBackCooldownTimeout = setTimeout(() => {
        this._goBackCooldownActive = false;
        this._goBackCooldownTimeout = null;
        logger.log(LOG_CATEGORIES.SECURITY, 'Go-back cooldown cleared');
      }, WEBSITE_BLOCKER_GO_BACK_COOLDOWN_MS);
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
      this._clearGoBackCooldown();
      this._clearKeywordRecheckTimeout();
      this._removeBlockerOverlay();
      this.isBlocking = false;
    }

    /**
     * Clear the keyword recheck timeout if active.
     * @private
     */
    _clearKeywordRecheckTimeout() {
      if (this._keywordRecheckTimeout) {
        clearTimeout(this._keywordRecheckTimeout);
        this._keywordRecheckTimeout = null;
      }
    }

    /**
     * Clear the go-back cooldown timeout if active.
     * @private
     */
    _clearGoBackCooldown() {
      if (this._goBackCooldownTimeout) {
        clearTimeout(this._goBackCooldownTimeout);
        this._goBackCooldownTimeout = null;
      }
      this._goBackCooldownActive = false;
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
  // Transition Phase Manager
  // ============================================

  /**
   * TransitionPhaseManager handles the "break ending" transition popup.
   * When a break phase ends, this popup appears to warn the user
   * that their break is ending and they should prepare to focus.
   *
   * Features:
   * - Movable floating popup (does NOT block browser interaction)
   * - 5-minute countdown timer
   * - "I'm Ready to Focus" button to close early
   * - No X button or click-outside-to-close
   * - When closed (timer or button): re-enables blocking and starts focus phase
   */
  class TransitionPhaseManager {
    constructor() {
      this.popup = null;
      this.timerInterval = null;
      this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;
      this.onTransitionComplete = null; // Callback when transition ends
    }

    /**
     * Show the transition popup.
     * Called when break phase ends and before focus phase begins.
     */
    showTransitionPopup() {
      // Don't show if already showing
      if (this.popup) {
        return;
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Transition popup displayed');

      this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;
      this._createPopup();
      document.documentElement.appendChild(this.popup);

      // Make popup draggable
      setupDialogDrag(this.popup);

      // Start countdown
      this._startCountdown();
    }

    /**
     * Hide the transition popup and trigger the completion callback.
     * Called when timer reaches zero or user clicks the "Ready" button.
     * Includes guard against race conditions where this could be called twice
     * (e.g., timer reaching zero at the same moment user clicks the button).
     */
    hideTransitionPopup() {
      // Guard against double-execution (race condition between timer and button click)
      if (!this.popup && !this.timerInterval) {
        return;
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Transition popup hidden');

      // Clear countdown interval
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      // Remove popup
      if (this.popup) {
        this.popup.remove();
        this.popup = null;
      }

      // Reset remainingTime for next use to ensure clean state
      this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;

      // Trigger completion callback (starts focus phase and re-enables blocking)
      if (this.onTransitionComplete) {
        this.onTransitionComplete();
      }
    }

    /**
     * Create the transition popup element.
     * @private
     */
    _createPopup() {
      this.popup = document.createElement('div');
      this.popup.id = 'zen-pomodoro-transition-popup';
      this.popup.className = 'zen-pomodoro-transition-popup active';

      // Mark this popup so its position won't be saved to lastDialogPosition
      // This prevents the settings menu from appearing in the top-right corner
      // where the transition popup was shown
      this.popup.setAttribute(DATA_NO_POSITION_SAVE, 'true');

      // Title (also serves as drag handle)
      const title = document.createElement('h2');
      title.textContent = 'Break Ending Soon';

      // Message
      const message = document.createElement('p');
      message.className = 'zen-pomodoro-transition-message';
      message.textContent = 'Your break is ending. Finish up and prepare to focus.';

      // Countdown timer display
      const timerDisplay = document.createElement('div');
      timerDisplay.id = 'zen-pomodoro-transition-timer';
      timerDisplay.className = 'zen-pomodoro-transition-timer';
      timerDisplay.textContent = `Focus resumes in: ${formatTime(this.remainingTime)}`;

      // "I'm Ready to Focus" button
      const readyButton = document.createElement('button');
      readyButton.id = 'zen-pomodoro-transition-ready-btn';
      readyButton.className = 'zen-pomodoro-transition-ready-btn';
      readyButton.textContent = "I'm Ready to Focus";
      readyButton.addEventListener('click', () => {
        this.hideTransitionPopup();
      });

      // Assemble popup
      this.popup.appendChild(title);
      this.popup.appendChild(message);
      this.popup.appendChild(timerDisplay);
      this.popup.appendChild(readyButton);
    }

    /**
     * Check if the popup has been detached from the DOM.
     * Cleans up the timer interval if popup is gone.
     * @returns {boolean} True if popup is detached and timer was cleaned up
     * @private
     */
    _isPopupDetached() {
      if (!this.popup || !document.documentElement.contains(this.popup)) {
        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }
        return true;
      }
      return false;
    }

    /**
     * Start the countdown timer.
     * Updates the display every second and closes popup when timer reaches zero.
     * Includes DOM detachment check to stop timer if popup is removed externally.
     * @private
     */
    _startCountdown() {
      logger.log(LOG_CATEGORIES.TIMER, 'Transition countdown started', {
        remainingSeconds: this.remainingTime,
      });

      this.timerInterval = setInterval(() => {
        if (this._isPopupDetached()) return;

        // Respect main timer's pause state - do not decrement if paused
        if (window.zenPomodoroApp?.timer?.isPaused) return;

        this.remainingTime--;

        // Update display
        const timerDisplay = this.popup.querySelector('#zen-pomodoro-transition-timer');
        if (timerDisplay) {
          timerDisplay.textContent = `Focus resumes in: ${formatTime(this.remainingTime)}`;
        }

        // Timer reached zero - close popup and start focus
        if (this.remainingTime <= 0) {
          this.hideTransitionPopup();
        }
      }, 1000);
    }

    /**
     * Clean up the transition manager.
     * Called when the application is being destroyed.
     */
    destroy() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      if (this.popup) {
        this.popup.remove();
        this.popup = null;
      }
    }
  }

  // ============================================
  // Daily Reminder Manager
  // ============================================

  /**
   * DailyReminderManager handles multiple daily reminders throughout the day.
   * When enabled, it shows a blocking overlay at configured times if:
   * - Current time is at or after a configured reminder time
   * - That specific reminder hasn't been shown today yet
   * - No timer is currently active
   *
   * Features:
   * - Multiple reminder times per day (configurable array)
   * - Skip with hold/code challenge (escalating difficulty)
   * - Skip count resets when timer starts
   * - Separate skip logic from post-session reminder
   * - Tracks which reminders shown today
   */
  class DailyReminderManager {
    constructor() {
      this.reminderOverlay = null;
      this.isShowing = false;
      this.onStartTimer = null; // Callback when user clicks "Start Timer" button
      this._timeDisplayInterval = null; // Interval for updating time display
      this.checkIntervalId = null; // Interval for periodic reminder check
      this.skipCount = 0; // Number of times user has skipped
      this.lastSkipTime = null; // When the last skip occurred
      this.remindersShownToday = []; // Array of timestamps when reminders were shown today
      this._holdIntervalId = null; // Hold-to-unlock interval
      this._holdTimerElement = null; // Timer display element for hold mode
      this._holdHandlersCleanup = null; // Cleanup function for hold handlers
    }

    /**
     * Initialize the daily reminder manager.
     * Loads persisted state and checks if reminder should be shown on startup.
     */
    init() {
      logger.log(LOG_CATEGORIES.INIT, 'Initializing Daily Reminder Manager');
      this._loadState();

      // Add startup delay before showing daily reminder to allow timer state restoration
      // This prevents the reminder from appearing immediately on browser start if timer
      // was active before a PC restart/crash
      setTimeout(() => {
        this._checkAndShowReminder();
      }, DAILY_REMINDER_STARTUP_DELAY_MS);

      this._startPeriodicCheck();
    }

    /**
     * Load persisted state from config.
     * @private
     */
    _loadState() {
      const config = getConfig();
      this.skipCount = config.dailyReminderSkipCount || 0;
      this.lastSkipTime = config.dailyReminderLastSkipTime || null;
      this.remindersShownToday = config.dailyRemindersShownToday || [];

      // Reset reminders shown today if it's a new day
      this._resetIfNewDay();

      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Loaded persisted state', {
        skipCount: this.skipCount,
        lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
        remindersShownCount: this.remindersShownToday.length,
      });
    }

    /**
     * Save current state to config for persistence.
     * @private
     */
    _saveState() {
      const config = getConfig();
      config.dailyReminderSkipCount = this.skipCount;
      config.dailyReminderLastSkipTime = this.lastSkipTime;
      config.dailyRemindersShownToday = this.remindersShownToday;
      saveConfig(config);

      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Saved state', {
        skipCount: this.skipCount,
        lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
        remindersShownCount: this.remindersShownToday.length,
      });
    }

    /**
     * Reset reminders shown today if it's a new day.
     * Uses the first daily reminder time as the reset boundary.
     * @private
     */
    _resetIfNewDay() {
      // Check if we have any reminders shown - exit early if none
      if (this.remindersShownToday.length === 0) {
        return;
      }

      const today = this._getTodayDateString();
      const lastShownTimestamp = Math.max(...this.remindersShownToday);
      const lastShownDate = new Date(lastShownTimestamp);
      const lastShownDateStr = this._getDateString(lastShownDate);

      // Same day - no reset needed
      if (lastShownDateStr === today) {
        return;
      }

      // Different day - check if we should reset based on first reminder time
      const resetTime = this._getFirstReminderTime();
      if (!isValidTimeFormat(resetTime)) {
        return;
      }

      const now = new Date();
      const resetDate = this._createTimeOnToday(resetTime);

      // Only reset if we're past the reset time on the new day
      if (now >= resetDate) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Resetting shown reminders for new day');
        this.remindersShownToday = [];
        this._saveState();
      }
    }

    /**
     * Get the first reminder time from config, or default to '10:00'.
     * @returns {string} The earliest reminder time in HH:MM format
     * @private
     */
    _getFirstReminderTime() {
      const config = getConfig();
      const times = config.dailyReminderTimes;
      
      if (!isNonEmptyArray(times)) {
        return '10:00';
      }
      
      return times.slice().sort((a, b) => {
        const [aHours, aMinutes] = a.split(':').map(Number);
        const [bHours, bMinutes] = b.split(':').map(Number);
        return aHours - bHours || aMinutes - bMinutes;
      })[0];
    }

    /**
     * Create a Date object for the given time on today's date.
     * @param {string} timeStr - Time in HH:MM format
     * @returns {Date} Date object with today's date and the given time
     * @private
     */
    _createTimeOnToday(timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    }

    /**
     * Check if the reminder should be shown and show it if conditions are met.
     * Conditions:
     * 1. Feature is enabled
     * 2. Current time >= one of the configured reminder times
     * 3. That reminder hasn't been shown today yet
     * 4. No timer is currently active
     * @private
     */
    _checkAndShowReminder() {
      // Check basic preconditions
      if (!this._canShowDailyReminder()) {
        return;
      }

      // Reset reminders shown if new day
      this._resetIfNewDay();

      // Check and show reminder if time matches
      this._checkReminderTimes();
    }

    /**
     * Check if daily reminder can be shown based on feature state and timer status.
     * @returns {boolean} True if daily reminder can potentially be shown
     * @private
     */
    _canShowDailyReminder() {
      const config = getConfig();

      // Check if feature is enabled via reminderMode
      if (config.reminderMode !== Constants.REMINDER_MODES.DAILY) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Feature disabled (reminderMode not set to daily)');
        return false;
      }

      // Check if timer is already active
      if (window.zenPomodoroApp?.timer?.isActive) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer already active');
        return false;
      }

      // Get reminder times array
      const reminderTimes = config.dailyReminderTimes;
      if (!Array.isArray(reminderTimes) || reminderTimes.length === 0) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: No reminder times configured');
        return false;
      }

      return true;
    }

    /**
     * Check all configured reminder times and show reminder if conditions met.
     * @private
     */
    _checkReminderTimes() {
      const config = getConfig();
      const now = new Date();
      const currentTimeMinutes = this._getCurrentTimeInMinutes(now);

      for (const timeStr of config.dailyReminderTimes) {
        if (!isValidTimeFormat(timeStr)) continue;

        const [hours, minutes] = timeStr.split(':').map(Number);

        if (this._shouldShowReminderForTime(currentTimeMinutes, hours, minutes, timeStr)) {
          return; // Only show one reminder at a time
        }
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: No reminder to show at current time');
    }

    /**
     * Get current time in minutes since midnight.
     * @param {Date} now - Current date/time
     * @returns {number} Minutes since midnight
     * @private
     */
    _getCurrentTimeInMinutes(now) {
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      return currentHours * 60 + currentMinutes;
    }

    /**
     * Check if we're still in the cooldown period after a skip.
     * @param {number} cooldownMinutes - The cooldown period in minutes
     * @returns {boolean} True if still in cooldown
     * @private
     */
    _isInCooldownPeriod(cooldownMinutes) {
      if (!this.lastSkipTime) return false;

      const timeSinceSkipMs = Date.now() - this.lastSkipTime;
      const timeSinceSkipMinutes = timeSinceSkipMs / (60 * 1000);
      return timeSinceSkipMinutes < cooldownMinutes;
    }

    /**
     * Check if reminder should be shown for a specific time.
     * @param {number} currentTimeMinutes - Current time in minutes since midnight
     * @param {number} hours - Reminder hour
     * @param {number} minutes - Reminder minute
     * @param {string} timeStr - Time string for logging
     * @returns {boolean} True if reminder was shown
     * @private
     */
    _shouldShowReminderForTime(currentTimeMinutes, hours, minutes, timeStr) {
      const reminderTimeMinutes = hours * 60 + minutes;
      const config = getConfig();

      // Check if we're at or past this reminder time
      if (currentTimeMinutes >= reminderTimeMinutes) {
        // Check if a timer was started today AFTER this reminder time
        // If so, don't show the reminder again (user already responded by starting a timer)
        if (this._wasTimerStartedAfterReminderTime(hours, minutes)) {
          logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer already started after this time', {
            reminderTime: timeStr,
            lastTimerStartTime: config.lastTimerStartTime
              ? new Date(config.lastTimerStartTime).toISOString()
              : null,
          });
          return false;
        }

        // Check if in cooldown period after skip
        if (this._isInCooldownPeriod(config.dailyReminderSkipCooldown)) {
          logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Skip cooldown active', {
            reminderTime: timeStr,
            lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
            cooldownMinutes: config.dailyReminderSkipCooldown,
          });
          return false;
        }

        // Check if this reminder was already shown today.
        // If user previously skipped and cooldown passed (checked above), allow re-showing.
        const wasShownToday = this._wasReminderShownToday(hours, minutes);
        const hasPreviouslySkipped = this.lastSkipTime !== null;

        // Show if: (1) not shown yet today, OR (2) user previously skipped (cooldown already verified above)
        if (!wasShownToday || hasPreviouslySkipped) {
          logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Showing reminder', {
            reminderTime: timeStr,
            wasShownToday: wasShownToday,
            showingAfterSkip: hasPreviouslySkipped,
          });
          this.showReminder();
          return true;
        }
      }

      return false;
    }

    /**
     * Check if a timer was started today after the specified reminder time.
     * This prevents showing the reminder again after user started a timer.
     * @param {number} reminderHours - Reminder hour (0-23)
     * @param {number} reminderMinutes - Reminder minute (0-59)
     * @returns {boolean} True if timer was started after the reminder time today
     * @private
     */
    _wasTimerStartedAfterReminderTime(reminderHours, reminderMinutes) {
      const config = getConfig();
      const lastTimerStartTime = config.lastTimerStartTime;

      if (!lastTimerStartTime) {
        return false;
      }

      const startDate = new Date(lastTimerStartTime);
      const today = this._getTodayDateString();
      const startDateStr = this._getDateString(startDate);

      // Only consider timer starts from today
      if (startDateStr !== today) {
        return false;
      }

      // Check if timer was started at or after the reminder time
      const startHours = startDate.getHours();
      const startMinutes = startDate.getMinutes();
      const startTimeMinutes = startHours * 60 + startMinutes;
      const reminderTimeMinutes = reminderHours * 60 + reminderMinutes;

      return startTimeMinutes >= reminderTimeMinutes;
    }

    /**
     * Check if a reminder for the given time was already shown today.
     * Checks within a 2-minute window to account for the periodic check interval.
     * @param {number} hours - Reminder hour (0-23)
     * @param {number} minutes - Reminder minute (0-59)
     * @returns {boolean} True if reminder was shown today
     * @private
     */
    _wasReminderShownToday(hours, minutes) {
      const today = this._getTodayDateString();

      for (const shownTimestamp of this.remindersShownToday) {
        const shownDate = new Date(shownTimestamp);
        const shownDateStr = this._getDateString(shownDate);

        // Only check reminders from today
        if (shownDateStr === today) {
          // Compare hours and minutes directly instead of timestamp difference
          const shownHours = shownDate.getHours();
          const shownMinutes = shownDate.getMinutes();

          // If the shown reminder matches this reminder's hour and minute (±1 minute tolerance)
          if (shownHours === hours && Math.abs(shownMinutes - minutes) <= 1) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Get today's date in YYYY-MM-DD format.
     * @returns {string} Today's date
     * @private
     */
    _getTodayDateString() {
      const now = new Date();
      return this._getDateString(now);
    }

    /**
     * Get date string in YYYY-MM-DD format.
     * @param {Date} date - Date object
     * @returns {string} Date string
     * @private
     */
    _getDateString(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    /**
     * Check if daily reminder overlay is currently visible.
     * @returns {boolean} True if reminder is visible
     * @private
     */
    _isDailyReminderVisible() {
      return this.reminderOverlay || this.isShowing;
    }

    /**
     * Check if timer is currently active.
     * @returns {boolean} True if timer is active
     * @private
     */
    _isTimerActive() {
      return window.zenPomodoroApp?.timer?.isActive ?? false;
    }

    /**
     * Check if post-session reminder is visible.
     * @returns {boolean} True if post-session reminder is visible
     * @private
     */
    _isPostSessionReminderVisible() {
      return window.zenPomodoroApp?.postSessionReminder?.isShowing ?? false;
    }

    /**
     * Check if daily reminder should be blocked from showing.
     * @returns {boolean} True if reminder should not be shown
     * @private
     */
    _shouldBlockDailyReminder() {
      if (this._isDailyReminderVisible()) return true;
      if (this._isTimerActive()) return true;
      if (this._isPostSessionReminderVisible()) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Post-session reminder is showing');
        return true;
      }
      return false;
    }

    /**
     * Show the daily reminder overlay.
     * This blocks browser interaction until user starts a timer or skips.
     */
    showReminder() {
      if (this._shouldBlockDailyReminder()) return;

      logger.log(LOG_CATEGORIES.TIMER, 'Showing daily reminder overlay');
      this.isShowing = true;

      // Record that this reminder was shown
      this.remindersShownToday.push(Date.now());
      this._saveState();

      // Pause post-session reminder while daily reminder is showing
      window.zenPomodoroApp?.postSessionReminder?.pauseIdleTracking();

      this._createOverlay();
      document.documentElement.appendChild(this.reminderOverlay);
    }

    /**
     * Hide the daily reminder overlay.
     * Called when user starts a timer or successfully skips.
     */
    hideReminder() {
      if (!this.reminderOverlay && !this.isShowing) {
        return;
      }

      logger.log(LOG_CATEGORIES.TIMER, 'Hiding daily reminder overlay');
      this.isShowing = false;

      // Resume post-session reminder idle tracking
      window.zenPomodoroApp?.postSessionReminder?.resumeIdleTracking();

      // Clear time display interval
      this._clearTimeDisplayInterval();

      // Clear hold interval if active
      this._clearHoldInterval();

      // Call cleanup function to remove event listeners
      if (this._holdHandlersCleanup) {
        this._holdHandlersCleanup();
        this._holdHandlersCleanup = null;
      }

      if (this.reminderOverlay) {
        this.reminderOverlay.remove();
        this.reminderOverlay = null;
      }
    }

    /**
     * Clear the time display interval if it exists.
     * @private
     */
    _clearTimeDisplayInterval() {
      if (this._timeDisplayInterval) {
        clearInterval(this._timeDisplayInterval);
        this._timeDisplayInterval = null;
      }
    }

    /**
     * Start the periodic check for showing the reminder.
     * Checks every minute if conditions are met to show the reminder.
     * @private
     */
    _startPeriodicCheck() {
      // Clear any existing interval
      this._stopPeriodicCheck();

      // Check every minute
      this.checkIntervalId = setInterval(() => {
        // Stop checking if reminder is already showing
        if (this.isShowing) {
          return;
        }

        this._checkAndShowReminder();
      }, DAILY_REMINDER_CHECK_INTERVAL_MS);
    }

    /**
     * Stop the periodic reminder check.
     * @private
     */
    _stopPeriodicCheck() {
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
    }

    /**
     * Record that a timer was started.
     * Saves timestamp and resets skip count.
     */
    recordTimerStarted() {
      const config = getConfig();
      config.lastTimerStartTime = Date.now();

      // Reset skip count when timer starts
      this.skipCount = 0;
      this.lastSkipTime = null;

      saveConfig(config);
      this._saveState();

      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer started, resetting skip count', {
        lastTimerStartTime: new Date(config.lastTimerStartTime).toISOString(),
      });
    }

    /**
     * Called when timer completes a full session.
     * Resets skip count and cooldown to ensure clean state.
     * Note: We do NOT clear lastTimerStartTime here - it's used to prevent
     * showing the reminder again after timer completion for that time slot.
     */
    onTimerComplete() {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer completed, resetting skip state', {
        previousSkipCount: this.skipCount,
        previousLastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
      });

      this.skipCount = 0;
      this.lastSkipTime = null;
      this._saveState();
    }

    /**
     * Create the blocking reminder overlay.
     * @private
     */
    _createOverlay() {
      const config = getConfig();

      this.reminderOverlay = document.createElement('div');
      this.reminderOverlay.id = 'zen-pomodoro-daily-reminder';
      this.reminderOverlay.className = 'active';

      // Content container
      const content = document.createElement('div');
      content.id = 'zen-pomodoro-daily-reminder-content';

      // Icon
      const icon = document.createElement('div');
      icon.id = 'zen-pomodoro-daily-reminder-icon';
      icon.textContent = '⏰';

      // Title
      const title = document.createElement('h2');
      title.textContent = 'Time to Start Your Focus Session!';

      // Message
      const message = document.createElement('p');
      message.textContent =
        "It's time to begin your daily focus session. Start a timer to begin working productively.";

      // Skip info (shows skip count and current requirement)
      const skipInfo = document.createElement('div');
      skipInfo.id = 'zen-pomodoro-daily-reminder-skip-info';
      if (this.skipCount > 0) {
        const escalatedHold = this._calculateEscalatedValue(config.dailyReminderSkipHoldDuration);
        const escalatedCode = this._calculateEscalatedValue(config.dailyReminderSkipCodeLength);
        const requirementText =
          config.dailyReminderSkipMethod === LOCKOUT_METHODS.HOLD
            ? `Hold for ${escalatedHold} seconds`
            : `Enter ${escalatedCode} characters`;
        skipInfo.textContent = `Skip #${this.skipCount + 1} - ${requirementText}`;
      } else {
        const requirementText =
          config.dailyReminderSkipMethod === LOCKOUT_METHODS.HOLD
            ? `Hold for ${config.dailyReminderSkipHoldDuration} seconds`
            : `Enter ${config.dailyReminderSkipCodeLength} characters`;
        skipInfo.textContent = requirementText;
      }

      // Buttons container
      const buttons = document.createElement('div');
      buttons.id = 'zen-pomodoro-daily-reminder-buttons';

      // Start Timer button
      const startButton = document.createElement('button');
      startButton.id = 'zen-pomodoro-daily-reminder-start-btn';
      startButton.className = 'zen-pomodoro-daily-reminder-start-btn';
      startButton.textContent = 'Start Timer';
      startButton.addEventListener('click', () => {
        this._handleStartTimerClick();
      });

      // Skip button (with hold/code requirement)
      const skipButton = document.createElement('button');
      skipButton.id = 'zen-pomodoro-daily-reminder-skip-btn';
      skipButton.className = 'zen-pomodoro-daily-reminder-skip-btn';
      skipButton.textContent = 'Skip for Now';
      skipButton.addEventListener('click', () => {
        this._showSkipChallenge(config);
      });

      buttons.appendChild(startButton);
      buttons.appendChild(skipButton);

      // Assemble content
      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(skipInfo);
      content.appendChild(buttons);

      this.reminderOverlay.appendChild(content);
    }

    /**
     * Show the skip challenge (hold or code entry).
     * @param {Object} config - Configuration object
     * @private
     */
    _showSkipChallenge(config) {
      // Remove the buttons and replace with challenge UI
      const content = this.reminderOverlay.querySelector('#zen-pomodoro-daily-reminder-content');
      const buttons = this.reminderOverlay.querySelector('#zen-pomodoro-daily-reminder-buttons');
      const skipInfo = this.reminderOverlay.querySelector('#zen-pomodoro-daily-reminder-skip-info');

      if (!content || !buttons) return;

      // Remove current buttons
      buttons.remove();
      if (skipInfo) skipInfo.remove();

      // Create challenge container
      const challengeContainer = document.createElement('div');
      challengeContainer.id = 'zen-pomodoro-daily-reminder-challenge';

      if (config.dailyReminderSkipMethod === LOCKOUT_METHODS.HOLD) {
        this._createHoldChallenge(challengeContainer, config);
      } else {
        this._createCodeChallenge(challengeContainer, config);
      }

      content.appendChild(challengeContainer);
    }

    /**
     * Create hold-to-unlock challenge UI.
     * @param {HTMLElement} container - Container element
     * @param {Object} config - Configuration object
     * @private
     */
    _createHoldChallenge(container, config) {
      const escalatedDuration = this._calculateEscalatedValue(config.dailyReminderSkipHoldDuration);

      // Timer display
      const timerDiv = document.createElement('div');
      timerDiv.id = 'zen-pomodoro-daily-reminder-hold-timer';
      timerDiv.className = 'zen-pomodoro-daily-reminder-hold-timer';
      timerDiv.textContent = escalatedDuration.toString();
      this._holdTimerElement = timerDiv;

      // Instructions
      const instructions = document.createElement('p');
      instructions.className = 'zen-pomodoro-daily-reminder-instructions';
      instructions.textContent = 'seconds remaining - hold button to skip';

      // Hold button with progress bar
      const holdButton = document.createElement('button');
      holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
      holdButton.id = 'zen-pomodoro-daily-reminder-hold-btn';
      holdButton.textContent = 'Hold to Skip';

      const holdProgress = document.createElement('div');
      holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
      holdProgress.id = 'zen-pomodoro-daily-reminder-hold-progress';
      holdButton.appendChild(holdProgress);

      // Button row
      const buttonRow = document.createElement('div');
      buttonRow.className = 'zen-pomodoro-dialog-buttons';

      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        this._clearHoldInterval();
        this.hideReminder();
        // Immediately re-show to reset the UI
        setTimeout(() => this.showReminder(), 100);
      });

      buttonRow.appendChild(cancelButton);
      buttonRow.appendChild(holdButton);

      container.appendChild(timerDiv);
      container.appendChild(instructions);
      container.appendChild(buttonRow);

      // Setup hold handlers
      this._setupHoldHandlers(holdButton, holdProgress, escalatedDuration);
    }

    /**
     * Setup hold-to-unlock event handlers.
     * @param {HTMLElement} holdButton - The hold button element
     * @param {HTMLElement} holdProgress - The progress bar element
     * @param {number} waitTime - Total wait time in seconds
     * @private
     */
    _setupHoldHandlers(holdButton, holdProgress, waitTime) {
      // Store cleanup function to prevent memory leaks
      this._holdHandlersCleanup = setupHoldToUnlockHandlers({
        holdButton,
        holdProgress,
        waitTime,
        timerElement: this._holdTimerElement,
        onComplete: () => this._handleSkip(),
        clearInterval: () => this._clearHoldInterval(),
        setIntervalId: (id) => {
          this._holdIntervalId = id;
        },
        logCategory: LOG_CATEGORIES.TIMER,
        logMessage: 'Daily reminder hold-to-skip completed',
      });
    }

    /**
     * Clear the hold interval if active.
     * @private
     */
    _clearHoldInterval() {
      if (this._holdIntervalId) {
        clearInterval(this._holdIntervalId);
        this._holdIntervalId = null;
      }
    }

    /**
     * Create code entry challenge UI.
     * @param {HTMLElement} container - Container element
     * @param {Object} config - Configuration object
     * @private
     */
    _createCodeChallenge(container, config) {
      const escalatedLength = this._calculateEscalatedValue(config.dailyReminderSkipCodeLength);
      const code = generateRandomCode(escalatedLength, 'alphanumeric');

      // Instructions
      const instructions = document.createElement('p');
      instructions.className = 'zen-pomodoro-daily-reminder-instructions';
      instructions.textContent = `Enter the ${escalatedLength}-character code below to skip:`;

      // Code container
      const codeContainer = document.createElement('div');
      codeContainer.className = 'zen-pomodoro-code-container';

      // Code display
      const codeDiv = document.createElement('div');
      codeDiv.className = 'zen-pomodoro-lock-code-display';
      codeDiv.textContent = code;

      // Input field
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'zen-pomodoro-lock-code-input';
      input.placeholder = 'Enter code...';
      input.autocomplete = 'off';
      input.spellcheck = false;

      codeContainer.appendChild(codeDiv);
      codeContainer.appendChild(input);

      // Button row
      const buttonRow = document.createElement('div');
      buttonRow.className = 'zen-pomodoro-dialog-buttons';

      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        this.hideReminder();
        // Immediately re-show to reset the UI
        setTimeout(() => this.showReminder(), 100);
      });

      // Verify button
      const verifyButton = document.createElement('button');
      verifyButton.className = 'zen-pomodoro-dialog-button';
      verifyButton.textContent = 'Verify';
      verifyButton.addEventListener('click', () => {
        if (input.value === code) {
          this._handleSkip();
        } else {
          input.value = '';
          input.placeholder = 'Incorrect - try again...';
          setTimeout(() => {
            input.placeholder = 'Enter code...';
          }, 2000);
        }
      });

      // Enter key support
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          verifyButton.click();
        }
      });

      buttonRow.appendChild(cancelButton);
      buttonRow.appendChild(verifyButton);

      container.appendChild(instructions);
      container.appendChild(codeContainer);
      container.appendChild(buttonRow);

      // Focus input
      setTimeout(() => input.focus(), 100);
    }

    /**
     * Calculate the escalated skip requirement based on skip count.
     * @param {number} baseValue - Base value for the requirement
     * @returns {number} Escalated value
     * @private
     */
    _calculateEscalatedValue(baseValue) {
      return Math.ceil(baseValue * Math.pow(DAILY_REMINDER_ESCALATION_FACTOR, this.skipCount));
    }

    /**
     * Handle skip action - dismisses reminder and increments skip count.
     * @private
     */
    _handleSkip() {
      this.skipCount++;
      this.lastSkipTime = Date.now();

      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder skipped', {
        skipCount: this.skipCount,
      });

      // Save state to persist across browser restarts
      this._saveState();

      this.hideReminder();
    }

    /**
     * Handle the "Start Timer" button click.
     * Opens the start timer dialog and hides the reminder when timer starts.
     * @private
     */
    _handleStartTimerClick() {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Start Timer button clicked');

      // Don't hide reminder yet - wait for timer to actually start
      // The reminder will be hidden by onTimerStart() callback

      // Use callback if set, otherwise try to show start dialog directly
      if (this.onStartTimer) {
        this.onStartTimer();
      } else if (window.zenPomodoroApp?.keyboardShortcut) {
        // Fallback: use keyboard shortcut handler to show start dialog
        // This is a fallback - normally the callback is set in ZenPomodoroApp
        window.zenPomodoroApp.keyboardShortcut.showConfigDialog();
      }
    }

    /**
     * Manually trigger the reminder for testing purposes.
     * Ignores time and date checks.
     */
    triggerReminderForTesting() {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Manually triggered for testing');

      // Force show even if conditions aren't met
      if (this.reminderOverlay) {
        this.hideReminder();
      }

      this.showReminder();
    }

    /**
     * Get time remaining until next daily reminder will appear (in seconds).
     * Returns null if reminder shouldn't show or conditions aren't met.
     * @returns {number|null} Seconds until reminder, or null if not applicable
     */
    /**
     * Convert a time string (HH:MM) to minutes since midnight.
     * Expects pre-validated input from isValidTimeFormat() filter.
     * @param {string} timeStr - Time string in HH:MM format
     * @returns {number} Minutes since midnight
     * @private
     */
    _timeToMinutes(timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    }

    /**
     * Find the next unshown reminder from sorted times.
     * @param {Array<string>} sortedTimes - Sorted time strings
     * @param {number} currentTimeMinutes - Current time in minutes since midnight
     * @returns {{hours: number, minutes: number}|null} Next reminder time, or null
     * @private
     */
    _findNextUnshownReminder(sortedTimes, currentTimeMinutes) {
      for (const timeStr of sortedTimes) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const reminderTimeMinutes = hours * 60 + minutes;
        const wasShown = this._wasReminderShownToday(hours, minutes);

        if (wasShown) continue;

        if (reminderTimeMinutes > currentTimeMinutes) {
          return { hours, minutes };
        }
        if (reminderTimeMinutes === currentTimeMinutes) {
          return { hours: -1, minutes: 0 }; // Signal: show now
        }
      }
      return null;
    }

    getTimeUntilDailyReminder() {
      const config = getConfig();

      if (config.reminderMode !== Constants.REMINDER_MODES.DAILY) return null;

      const reminderTimes = config.dailyReminderTimes;
      if (!isNonEmptyArray(reminderTimes)) return null;

      this._resetIfNewDay();

      const now = new Date();
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

      const sortedTimes = reminderTimes
        .filter((timeStr) => isValidTimeFormat(timeStr))
        .slice()
        .sort((a, b) => this._timeToMinutes(a) - this._timeToMinutes(b));

      const nextReminder = this._findNextUnshownReminder(sortedTimes, currentTimeMinutes);
      if (!nextReminder) return null;
      if (nextReminder.hours === -1) return 0; // Show now

      const reminderDate = new Date();
      reminderDate.setHours(nextReminder.hours, nextReminder.minutes, 0, 0);
      return Math.ceil((reminderDate - now) / 1000);
    }

    /**
     * Clean up the reminder manager.
     */
    destroy() {
      // Clear periodic check interval
      this._stopPeriodicCheck();

      // Clear time display interval
      this._clearTimeDisplayInterval();

      // Clear hold interval
      this._clearHoldInterval();

      // Call cleanup function to remove event listeners
      if (this._holdHandlersCleanup) {
        this._holdHandlersCleanup();
        this._holdHandlersCleanup = null;
      }

      if (this.reminderOverlay) {
        this.reminderOverlay.remove();
        this.reminderOverlay = null;
      }
      this.isShowing = false;
    }
  }

  // ============================================
  // Post-Session Reminder Manager
  // ============================================

  /**
   * PostSessionReminderManager handles reminders to start a new timer
   * after a configurable idle time following timer completion.
   *
   * Features:
   * - Tracks idle time after timer/pomodoro cycle COMPLETES
   * - Shows blocking overlay after configured idle time
   * - User can start a new timer or skip the reminder
   * - Skip requires hold/code completion with escalating difficulty
   * - Skip count resets when a new timer is started
   * - Skip count persists across browser restarts
   * - Reminders stop after focus time goal is reached
   */
  class PostSessionReminderManager {
    constructor() {
      this.reminderOverlay = null;
      this.isShowing = false;
      this.idleStartTime = null; // When the last timer completed
      this.skipCount = 0; // Number of times user has skipped
      this.lastSkipTime = null; // When the last skip occurred
      this.checkIntervalId = null; // Interval for checking if reminder should show
      this.onStartTimer = null; // Callback when user clicks "Start Timer"
      this._holdIntervalId = null; // Hold-to-unlock interval
      this._holdTimerElement = null; // Timer display element for hold mode
      this._pausedIdleStartTime = null; // Temporarily stored idleStartTime when paused by daily reminder
    }

    /**
     * Initialize the post-session reminder manager.
     * Loads persisted state from config.
     */
    init() {
      logger.log(LOG_CATEGORIES.INIT, 'Initializing Post-Session Reminder Manager');
      this._loadState();
      this._startIdleCheck();
    }

    /**
     * Load persisted state from config.
     * Restores skipCount, lastSkipTime, and idleStartTime across browser restarts.
     * @private
     */
    _loadState() {
      const config = getConfig();

      this.skipCount = config.postSessionSkipCount || 0;
      this.lastSkipTime = config.postSessionLastSkipTime || null;
      this.idleStartTime = config.postSessionIdleStartTime || null;

      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Loaded persisted state', {
        skipCount: this.skipCount,
        lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
        idleStartTime: this.idleStartTime ? new Date(this.idleStartTime).toISOString() : null,
      });
    }

    /**
     * Save current state to config for persistence across browser restarts.
     * @private
     */
    _saveState() {
      const config = getConfig();

      config.postSessionSkipCount = this.skipCount;
      config.postSessionLastSkipTime = this.lastSkipTime;
      config.postSessionIdleStartTime = this.idleStartTime;

      saveConfig(config);

      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Saved state', {
        skipCount: this.skipCount,
        lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
        idleStartTime: this.idleStartTime ? new Date(this.idleStartTime).toISOString() : null,
      });
    }

    /**
     * Check if the focus time goal has been reached for today.
     * When the goal is reached, post-session reminders should stop.
     * @returns {boolean} True if focus time goal is reached
     * @private
     */
    _checkFocusTimeGoalReached() {
      const config = getConfig();

      const focusTimeGoal = config.postSessionFocusTimeGoal || 150; // Default 2h 30min
      const totalFocusTimeToday = config.totalFocusTimeToday || 0;

      const goalReached = totalFocusTimeToday >= focusTimeGoal;

      if (goalReached) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Focus time goal reached', {
          totalFocusTimeToday: Math.round(totalFocusTimeToday),
          focusTimeGoal: focusTimeGoal,
        });
      }

      return goalReached;
    }

    /**
     * Called when a timer completes naturally (not stopped manually).
     * Starts tracking idle time for post-session reminder.
     *
     * Also re-enables reminders if they were disabled for the day. This allows
     * reminders to work again immediately after finishing a session, encouraging
     * continued productivity. The disabled flag (postSessionReminderDisabledForDay)
     * is set when the auto-off time is reached, and reset here when a timer completes.
     */
    onTimerComplete() {
      const config = getConfig();
      if (config.reminderMode !== Constants.REMINDER_MODES.POST_SESSION) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Feature disabled (reminderMode not set to post-session)');
        return;
      }

      // Reset skip state when timer completes
      this.skipCount = 0;
      this.lastSkipTime = null;

      this.idleStartTime = Date.now();

      logger.log(
        LOG_CATEGORIES.TIMER,
        'Post-session reminder: Timer completed, starting idle tracking and resetting skip state',
        {
          idleStartTime: new Date(this.idleStartTime).toISOString(),
          resetSkipCount: this.skipCount,
          resetLastSkipTime: this.lastSkipTime,
        }
      );

      // Re-enable post-session reminders for the day (reset the disabled flag)
      if (config.postSessionReminderDisabledForDay) {
        config.postSessionReminderDisabledForDay = false;
        saveConfig(config);
        logger.log(
          LOG_CATEGORIES.TIMER,
          'Post-session reminder: Re-enabled for the day after timer completion'
        );
      }

      // Save state to persist idleStartTime and reset skip state across browser restarts
      this._saveState();
    }

    /**
     * Called when a new timer is started.
     * Resets idle tracking and skip count.
     */
    onTimerStart() {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Timer started, resetting state', {
        previousIdleStartTime: this.idleStartTime
          ? new Date(this.idleStartTime).toISOString()
          : null,
        previousSkipCount: this.skipCount,
      });
      this.idleStartTime = null;
      this.skipCount = 0;
      this.lastSkipTime = null;
      this._saveState(); // Persist the reset state
      this.hideReminder();
    }

    /**
     * Pause idle tracking while daily reminder is showing.
     * Saves the current idleStartTime and temporarily nullifies it.
     */
    pauseIdleTracking() {
      if (this.idleStartTime) {
        this._pausedIdleStartTime = this.idleStartTime;
        this.idleStartTime = null;
        logger.log(
          LOG_CATEGORIES.TIMER,
          'Post-session reminder: Paused idle tracking (daily reminder showing)',
          {
            pausedIdleStartTime: this._pausedIdleStartTime
              ? new Date(this._pausedIdleStartTime).toISOString()
              : null,
          }
        );
      }
    }

    /**
     * Resume idle tracking after daily reminder is hidden.
     * Restores the previously paused idleStartTime.
     */
    resumeIdleTracking() {
      if (this._pausedIdleStartTime) {
        this.idleStartTime = this._pausedIdleStartTime;
        this._pausedIdleStartTime = null;
        logger.log(
          LOG_CATEGORIES.TIMER,
          'Post-session reminder: Resumed idle tracking (daily reminder hidden)',
          {
            idleStartTime: this.idleStartTime ? new Date(this.idleStartTime).toISOString() : null,
          }
        );
      }
    }

    /**
     * Start the periodic check for showing the reminder.
     * Also checks if current time is past the end time.
     * @private
     */
    _startIdleCheck() {
      // Clear any existing interval
      this._stopIdleCheck();

      // Check every minute
      this.checkIntervalId = setInterval(() => {
        this._checkAutoDisableTime();
        this._checkAndShowReminder();
      }, POST_SESSION_CHECK_INTERVAL_MS);
    }

    /**
     * Stop the periodic idle check.
     * @private
     */
    _stopIdleCheck() {
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
    }

    /**
     * Check if we're still in the cooldown period after a skip.
     * @param {number} cooldownMinutes - The cooldown period in minutes
     * @returns {boolean} True if still in cooldown
     * @private
     */
    _isInCooldownPeriod(cooldownMinutes) {
      if (!this.lastSkipTime) return false;

      const timeSinceSkipMs = Date.now() - this.lastSkipTime;
      const timeSinceSkipMinutes = timeSinceSkipMs / (60 * 1000);
      return timeSinceSkipMinutes < cooldownMinutes;
    }

    /**
     * Check if current time is past the configured end time and auto-disable reminder.
     * This automatically turns off post-session reminders after the configured time.
     * @private
     */
    _checkAutoDisableTime() {
      const config = getConfig();

      // Skip if feature is disabled or already disabled for the day
      if (config.reminderMode !== Constants.REMINDER_MODES.POST_SESSION || config.postSessionReminderDisabledForDay) {
        return;
      }

      const endTime = config.postSessionReminderEndTime;

      // Validate time format
      if (!isValidTimeFormat(endTime)) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Invalid end time format', {
          endTime: endTime,
        });
        return;
      }

      // Check if current time is past the end time
      if (this._isAfterEndTime(endTime)) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Auto-disabling for the day', {
          endTime: endTime,
          currentTime: new Date().toLocaleTimeString(),
        });

        config.postSessionReminderDisabledForDay = true;
        saveConfig(config);

        // Hide reminder if currently showing
        if (this.isShowing) {
          this.hideReminder();
        }
      }
    }

    /**
     * Check if a given time (in minutes since midnight) is in the early morning period.
     * Early morning is defined as 00:00-05:59 (0-359 minutes since midnight).
     *
     * @param {number} minutesSinceMidnight - Minutes since midnight (0-1439)
     * @returns {boolean} True if time is in early morning period
     * @private
     */
    _isEarlyMorning(minutesSinceMidnight) {
      return minutesSinceMidnight < EARLY_MORNING_CUTOFF_MINUTES;
    }

    /**
     * Check if current time is at or after the configured end time.
     * This method is designed for late-night auto-off times (e.g., 00:30 for 12:30 AM).
     * It correctly handles the early morning period by checking if we're past the end time
     * but still in the early morning hours (before the typical wake-up time).
     *
     * Logic:
     * - If endTime is early morning (00:00-05:59), we're only "after" it if current time
     *   is also in that early morning range AND past the end time.
     * - If endTime is later in day (06:00-23:59), standard comparison applies.
     *
     * Examples (with endTime = 00:30):
     * - Current: 23:00 → false (not yet reached early morning cutoff)
     * - Current: 00:45 → true (past 00:30 in early morning window)
     * - Current: 14:00 → false (outside early morning window, auto-off doesn't apply)
     *
     * @param {string} endTime - Time in HH:MM format (must be pre-validated by isValidTimeFormat)
     * @returns {boolean} True if current time is in the auto-off period
     * @private
     */
    _isAfterEndTime(endTime) {
      const [hours, minutes] = endTime.split(':').map(Number);

      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      // Convert to minutes since midnight for comparison
      const currentMinutesSinceMidnight = currentHours * 60 + currentMinutes;
      const endMinutesSinceMidnight = hours * 60 + minutes;

      // If endTime is in early morning (00:00-05:59)
      if (this._isEarlyMorning(endMinutesSinceMidnight)) {
        // We're only "after" the end time if:
        // 1. Current time is also in early morning (00:00-05:59)
        // 2. AND current time >= end time
        return (
          this._isEarlyMorning(currentMinutesSinceMidnight) &&
          currentMinutesSinceMidnight >= endMinutesSinceMidnight
        );
      } else {
        // For non-early-morning end times, standard comparison
        return currentMinutesSinceMidnight >= endMinutesSinceMidnight;
      }
    }

    /**
     * Check if conditions are met to potentially show the reminder.
     * @returns {boolean} True if basic conditions for showing are met
     * @private
     */
    _canPotentiallyShowReminder() {
      return (
        this._isPostSessionFeatureEnabled() &&
        !this._isReminderCurrentlyShowing() &&
        !this._isTimerCurrentlyActive() &&
        this._hasIdleStartTime() &&
        !this._hasFocusTimeGoalBeenReached() &&
        !this._isReminderDisabledForDay() &&
        !this._isDailyReminderShowing()
      );
    }

    /**
     * Check if post-session reminder feature is enabled.
     * @returns {boolean} True if feature is enabled
     * @private
     */
    _isPostSessionFeatureEnabled() {
      const config = getConfig();
      return config.reminderMode === Constants.REMINDER_MODES.POST_SESSION;
    }

    /**
     * Check if reminder is currently showing.
     * @returns {boolean} True if reminder is currently being displayed
     * @private
     */
    _isReminderCurrentlyShowing() {
      return this.isShowing;
    }

    /**
     * Check if timer is currently active.
     * @returns {boolean} True if timer is running
     * @private
     */
    _isTimerCurrentlyActive() {
      return window.zenPomodoroApp?.timer?.isActive || false;
    }

    /**
     * Check if idle start time is set.
     * @returns {boolean} True if timer has completed and idle tracking started
     * @private
     */
    _hasIdleStartTime() {
      return !!this.idleStartTime;
    }

    /**
     * Check if focus time goal has been reached.
     * @returns {boolean} True if daily focus goal achieved
     * @private
     */
    _hasFocusTimeGoalBeenReached() {
      return this._checkFocusTimeGoalReached();
    }

    /**
     * Check if reminder has been disabled for the day.
     * @returns {boolean} True if disabled for today
     * @private
     */
    _isReminderDisabledForDay() {
      const config = getConfig();
      if (config.postSessionReminderDisabledForDay) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Disabled for the day');
        return true;
      }
      return false;
    }

    /**
     * Check if daily reminder is currently showing.
     * @returns {boolean} True if daily reminder is active (mutual exclusion)
     * @private
     */
    _isDailyReminderShowing() {
      if (window.zenPomodoroApp?.dailyReminder?.isShowing) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Daily reminder is showing');
        return true;
      }
      return false;
    }

    /**
     * Check if the reminder should be shown based on current state.
     * @private
     */
    _checkAndShowReminder() {
      // Check basic preconditions
      if (!this._canPotentiallyShowReminder()) return;

      const config = getConfig();
      const now = Date.now();
      const idleTimeMs = now - this.idleStartTime;
      const idleTimeMinutes = idleTimeMs / (60 * 1000);

      // If user has skipped before, check against cooldown
      if (this._isInCooldownPeriod(config.postSessionSkipCooldown)) {
        return;
      }

      // Check if enough idle time has passed
      if (idleTimeMinutes >= config.postSessionIdleTime) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Showing reminder', {
          idleTimeMinutes: Math.round(idleTimeMinutes),
          skipCount: this.skipCount,
        });
        this.showReminder();
      }
    }

    /**
     * Check if conditions are met to show a countdown for next reminder.
     * @returns {boolean} True if countdown should be shown
     * @private
     */
    _canShowReminderCountdown() {
      const config = getConfig();

      // Check basic conditions
      if (config.reminderMode !== Constants.REMINDER_MODES.POST_SESSION) return false;
      if (this.isShowing) return false;
      if (!this.idleStartTime) return false;
      if (window.zenPomodoroApp?.timer?.isActive) return false;
      if (this._checkFocusTimeGoalReached()) return false;

      return true;
    }

    /**
     * Get time remaining until next reminder (in seconds).
     * Returns null if reminder shouldn't show or conditions aren't met.
     * @returns {number|null} Seconds until reminder, or null if not applicable
     */
    getTimeUntilNextReminder() {
      if (!this._canShowReminderCountdown()) {
        return null;
      }

      const config = getConfig();
      const now = Date.now();

      // If in cooldown, calculate time until cooldown ends
      if (this._isInCooldownPeriod(config.postSessionSkipCooldown)) {
        const cooldownEndMs = this.lastSkipTime + config.postSessionSkipCooldown * 60 * 1000;
        const remainingMs = cooldownEndMs - now;
        return Math.max(0, Math.ceil(remainingMs / 1000));
      }

      // Calculate time until first/next reminder
      const idleTimeMs = now - this.idleStartTime;
      const requiredIdleMs = config.postSessionIdleTime * 60 * 1000;
      const remainingMs = requiredIdleMs - idleTimeMs;

      // If reminder should already be shown, return 0
      if (remainingMs <= 0) return 0;

      return Math.ceil(remainingMs / 1000);
    }

    /**
     * Calculate the escalated skip requirement based on skip count.
     * @param {number} baseValue - Base value for the requirement
     * @returns {number} Escalated value
     * @private
     */
    _calculateEscalatedValue(baseValue) {
      return Math.ceil(baseValue * Math.pow(POST_SESSION_ESCALATION_FACTOR, this.skipCount));
    }

    /**
     * Show the post-session reminder overlay.
     */
    showReminder() {
      if (this.reminderOverlay || this.isShowing) return;

      // Don't show if timer is active
      if (window.zenPomodoroApp?.timer?.isActive) return;

      logger.log(LOG_CATEGORIES.TIMER, 'Showing post-session reminder overlay', {
        skipCount: this.skipCount,
      });

      this.isShowing = true;
      this._createOverlay();
      document.documentElement.appendChild(this.reminderOverlay);
    }

    /**
     * Hide the post-session reminder overlay.
     */
    hideReminder() {
      if (!this.reminderOverlay && !this.isShowing) return;

      logger.log(LOG_CATEGORIES.TIMER, 'Hiding post-session reminder overlay');
      this.isShowing = false;

      // Clear hold interval if active
      this._clearHoldInterval();

      // Call cleanup function to remove event listeners
      if (this._holdHandlersCleanup) {
        this._holdHandlersCleanup();
        this._holdHandlersCleanup = null;
      }

      if (this.reminderOverlay) {
        this.reminderOverlay.remove();
        this.reminderOverlay = null;
      }
    }

    /**
     * Handle skip action - dismisses reminder for cooldown period.
     * Persists the skip state across browser restarts.
     * @private
     */
    _handleSkip() {
      this.skipCount++;
      this.lastSkipTime = Date.now();

      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder skipped', {
        skipCount: this.skipCount,
        cooldownMinutes: getConfig().postSessionSkipCooldown,
      });

      // Save state to persist across browser restarts
      this._saveState();

      this.hideReminder();
    }

    /**
     * Create the blocking reminder overlay.
     * @private
     */
    _createOverlay() {
      const config = getConfig();

      this.reminderOverlay = document.createElement('div');
      this.reminderOverlay.id = 'zen-pomodoro-post-session-reminder';
      this.reminderOverlay.className = 'active';

      // Content container
      const content = document.createElement('div');
      content.id = 'zen-pomodoro-post-session-reminder-content';

      // Icon
      const icon = document.createElement('div');
      icon.id = 'zen-pomodoro-post-session-reminder-icon';
      icon.textContent = '⏱️';

      // Title
      const title = document.createElement('h2');
      title.textContent = 'Time to Get Back to Work!';

      // Message
      const message = document.createElement('p');
      message.textContent =
        "It's been a while since your last focus session. Start a new timer to stay productive!";

      // Skip info (shows skip count and current requirement)
      const skipInfo = document.createElement('div');
      skipInfo.id = 'zen-pomodoro-post-session-skip-info';
      if (this.skipCount > 0) {
        const escalatedHold = this._calculateEscalatedValue(config.postSessionSkipHoldDuration);
        const escalatedCode = this._calculateEscalatedValue(config.postSessionSkipCodeLength);
        const requirementText =
          config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD
            ? `Hold for ${escalatedHold} seconds`
            : `Enter ${escalatedCode} characters`;
        skipInfo.textContent = `Skip #${this.skipCount + 1} - ${requirementText}`;
      } else {
        const requirementText =
          config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD
            ? `Hold for ${config.postSessionSkipHoldDuration} seconds`
            : `Enter ${config.postSessionSkipCodeLength} characters`;
        skipInfo.textContent = requirementText;
      }

      // Buttons container
      const buttons = document.createElement('div');
      buttons.id = 'zen-pomodoro-post-session-buttons';

      // Start Timer button
      const startButton = document.createElement('button');
      startButton.id = 'zen-pomodoro-post-session-start-btn';
      startButton.className = 'zen-pomodoro-post-session-start-btn';
      startButton.textContent = 'Start Timer';
      startButton.addEventListener('click', () => {
        this._handleStartTimerClick();
      });

      // Skip button (with hold/code requirement)
      const skipButton = document.createElement('button');
      skipButton.id = 'zen-pomodoro-post-session-skip-btn';
      skipButton.className = 'zen-pomodoro-post-session-skip-btn';
      skipButton.textContent = 'Skip for Now';
      skipButton.addEventListener('click', () => {
        this._showSkipChallenge(config);
      });

      buttons.appendChild(startButton);
      buttons.appendChild(skipButton);

      // Assemble content
      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(skipInfo);
      content.appendChild(buttons);

      this.reminderOverlay.appendChild(content);
    }

    /**
     * Show the skip challenge (hold or code entry).
     * @param {Object} config - Configuration object
     * @private
     */
    _showSkipChallenge(config) {
      // Remove the buttons and replace with challenge UI
      const content = this.reminderOverlay.querySelector(
        '#zen-pomodoro-post-session-reminder-content'
      );
      const buttons = this.reminderOverlay.querySelector('#zen-pomodoro-post-session-buttons');
      const skipInfo = this.reminderOverlay.querySelector('#zen-pomodoro-post-session-skip-info');

      if (!content || !buttons) return;

      // Remove current buttons
      buttons.remove();
      if (skipInfo) skipInfo.remove();

      // Create challenge container
      const challengeContainer = document.createElement('div');
      challengeContainer.id = 'zen-pomodoro-post-session-challenge';

      if (config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD) {
        this._createHoldChallenge(challengeContainer, config);
      } else {
        this._createCodeChallenge(challengeContainer, config);
      }

      content.appendChild(challengeContainer);
    }

    /**
     * Create hold-to-unlock challenge UI.
     * @param {HTMLElement} container - Container element
     * @param {Object} config - Configuration object
     * @private
     */
    _createHoldChallenge(container, config) {
      const escalatedDuration = this._calculateEscalatedValue(config.postSessionSkipHoldDuration);

      // Timer display
      const timerDiv = document.createElement('div');
      timerDiv.id = 'zen-pomodoro-post-session-hold-timer';
      timerDiv.className = 'zen-pomodoro-post-session-hold-timer';
      timerDiv.textContent = escalatedDuration.toString();
      this._holdTimerElement = timerDiv;

      // Instructions
      const instructions = document.createElement('p');
      instructions.className = 'zen-pomodoro-post-session-instructions';
      instructions.textContent = 'seconds remaining - hold button to skip';

      // Hold button with progress bar
      const holdButton = document.createElement('button');
      holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
      holdButton.id = 'zen-pomodoro-post-session-hold-btn';
      holdButton.textContent = 'Hold to Skip';

      const holdProgress = document.createElement('div');
      holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
      holdProgress.id = 'zen-pomodoro-post-session-hold-progress';
      holdButton.appendChild(holdProgress);

      // Button row
      const buttonRow = document.createElement('div');
      buttonRow.className = 'zen-pomodoro-dialog-buttons';

      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        this._clearHoldInterval();
        this.hideReminder();
        // Immediately re-show to reset the UI
        setTimeout(() => this.showReminder(), 100);
      });

      buttonRow.appendChild(cancelButton);
      buttonRow.appendChild(holdButton);

      container.appendChild(timerDiv);
      container.appendChild(instructions);
      container.appendChild(buttonRow);

      // Setup hold handlers
      this._setupHoldHandlers(holdButton, holdProgress, escalatedDuration);
    }

    /**
     * Setup hold-to-unlock event handlers.
     * Uses shared setupHoldToUnlockHandlers utility to reduce code duplication.
     * @param {HTMLElement} holdButton - The hold button element
     * @param {HTMLElement} holdProgress - The progress bar element
     * @param {number} waitTime - Total wait time in seconds
     * @private
     */
    _setupHoldHandlers(holdButton, holdProgress, waitTime) {
      // Store cleanup function to prevent memory leaks
      this._holdHandlersCleanup = setupHoldToUnlockHandlers({
        holdButton,
        holdProgress,
        waitTime,
        timerElement: this._holdTimerElement,
        onComplete: () => this._handleSkip(),
        clearInterval: () => this._clearHoldInterval(),
        setIntervalId: (id) => {
          this._holdIntervalId = id;
        },
        logCategory: LOG_CATEGORIES.TIMER,
        logMessage: 'Post-session hold-to-skip completed',
      });
    }

    /**
     * Clear the hold interval if active.
     * @private
     */
    _clearHoldInterval() {
      if (this._holdIntervalId) {
        clearInterval(this._holdIntervalId);
        this._holdIntervalId = null;
      }
    }

    /**
     * Create code entry challenge UI.
     * @param {HTMLElement} container - Container element
     * @param {Object} config - Configuration object
     * @private
     */
    _createCodeChallenge(container, config) {
      const escalatedLength = this._calculateEscalatedValue(config.postSessionSkipCodeLength);
      const code = generateRandomCode(escalatedLength, 'alphanumeric');

      // Instructions
      const instructions = document.createElement('p');
      instructions.className = 'zen-pomodoro-post-session-instructions';
      instructions.textContent = `Enter the ${escalatedLength}-character code below to skip:`;

      // Code container
      const codeContainer = document.createElement('div');
      codeContainer.className = 'zen-pomodoro-code-container';

      // Code display
      const codeDiv = document.createElement('div');
      codeDiv.className = 'zen-pomodoro-lock-code-display';
      codeDiv.textContent = code;

      // Input field
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'zen-pomodoro-post-session-code-input';
      input.className = 'zen-pomodoro-post-session-code-input';
      input.placeholder = 'Enter code here';

      codeContainer.appendChild(codeDiv);
      codeContainer.appendChild(input);

      // Button row
      const buttonRow = document.createElement('div');
      buttonRow.className = 'zen-pomodoro-dialog-buttons';

      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        this.hideReminder();
        // Immediately re-show to reset the UI
        setTimeout(() => this.showReminder(), 100);
      });

      // Verify button
      const verifyButton = document.createElement('button');
      verifyButton.className = 'zen-pomodoro-dialog-button';
      verifyButton.textContent = 'Skip';

      const verifyCode = () => {
        if (input.value === code) {
          logger.log(LOG_CATEGORIES.TIMER, 'Post-session code verification successful');
          this._handleSkip();
        } else {
          logger.log(LOG_CATEGORIES.TIMER, 'Post-session code verification failed');
          window.zenPomodoroApp?.showCustomAlert('Incorrect Code', 'Please try again.');
        }
      };

      verifyButton.addEventListener('click', verifyCode);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCode();
      });

      buttonRow.appendChild(cancelButton);
      buttonRow.appendChild(verifyButton);

      container.appendChild(instructions);
      container.appendChild(codeContainer);
      container.appendChild(buttonRow);

      // Focus input
      setTimeout(() => input?.focus(), 0);
    }

    /**
     * Handle the "Start Timer" button click.
     * @private
     */
    _handleStartTimerClick() {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Start Timer button clicked');

      // Don't hide reminder yet - wait for timer to actually start
      // The reminder will be hidden by onTimerStart() callback

      // Use callback if set, otherwise try to show start dialog directly
      if (this.onStartTimer) {
        this.onStartTimer();
      } else if (window.zenPomodoroApp?.keyboardShortcut) {
        window.zenPomodoroApp.keyboardShortcut.showConfigDialog();
      }
    }

    /**
     * Manually trigger the reminder for testing purposes.
     * Ignores idle time checks.
     */
    triggerReminderForTesting() {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Manually triggered for testing');

      // Force show even if conditions aren't met
      if (this.reminderOverlay) {
        this.hideReminder();
      }

      this.showReminder();
    }

    /**
     * Clean up the reminder manager.
     */
    destroy() {
      this._stopIdleCheck();
      this._clearHoldInterval();

      if (this.reminderOverlay) {
        this.reminderOverlay.remove();
        this.reminderOverlay = null;
      }
      this.isShowing = false;
      this.idleStartTime = null;
      this.skipCount = 0;
      this.lastSkipTime = null;
    }
  }

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
      };
    }

    /**
     * Restore dump state from persistence.
     * @param {Object} state - Saved dump state
     * @returns {boolean} True if dump was active and restored
     */
    restoreState(state) {
      if (!state) return false;
      this.isActive = state.isActive || false;
      this.dumpTimeRemaining = state.dumpTimeRemaining || 0;
      this.savedTimerState = state.savedTimerState || null;
      this.dumpUsedThisFocusPhase = state.dumpUsedThisFocusPhase || false;
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
     * Show the configuration dialog to set dump duration before starting.
     */
    showDumpConfigDialog() {
      const config = getConfig();

      if (!config.distractionDumpEnabled) {
        logger.log(LOG_CATEGORIES.TIMER, 'Distraction dump feature is disabled');
        return;
      }

      // Check if dump is available for this focus phase
      if (this.dumpUsedThisFocusPhase) {
        logger.log(LOG_CATEGORIES.TIMER, 'Distraction dump already used this focus phase');
        return;
      }

      // Create dialog
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-dump-config-dialog';
      dialog.className = 'zen-pomodoro-dialog active';

      // Title
      const title = document.createElement('h2');
      title.className = 'zen-pomodoro-dialog-title';
      title.textContent = '🧠 Distraction Dump';
      dialog.appendChild(title);

      // Description
      const description = document.createElement('p');
      description.className = 'zen-pomodoro-dialog-description';
      description.textContent = 
        'Take a break to capture distracting thoughts without using your focus time. ' +
        'Your timer will pause and all blocks will be temporarily lifted.';
      dialog.appendChild(description);

      // Duration input section
      const durationSection = document.createElement('div');
      durationSection.className = 'zen-pomodoro-dialog-section';

      const durationLabel = document.createElement('label');
      durationLabel.className = 'zen-pomodoro-dialog-label';
      durationLabel.textContent = 'Dump Duration (minutes):';
      durationSection.appendChild(durationLabel);

      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.className = 'zen-pomodoro-dialog-input';
      durationInput.min = '1';
      durationInput.max = config.distractionDumpMaxDuration.toString();
      durationInput.value = config.distractionDumpDuration.toString();
      durationSection.appendChild(durationInput);

      dialog.appendChild(durationSection);

      // Buttons
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';

      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        dialog.remove();
      });

      const startButton = document.createElement('button');
      startButton.className = 'zen-pomodoro-dialog-button';
      startButton.textContent = 'Start Dump';
      startButton.addEventListener('click', () => {
        const duration = validateIntegerInput(
          parseInt(durationInput.value, 10),
          1,
          config.distractionDumpMaxDuration,
          config.distractionDumpDuration
        );
        dialog.remove();
        this.startDump(duration);
      });

      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(startButton);
      dialog.appendChild(buttonDiv);

      // Add to DOM first
      document.documentElement.appendChild(dialog);

      // Position dialog
      applyLastDialogPosition(dialog);

      // Make dialog draggable
      setupDialogDrag(dialog);

      logger.log(LOG_CATEGORIES.TIMER, 'Distraction dump config dialog shown');
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
     * Start a distraction dump session.
     * @param {number} duration - Duration in minutes
     */
    startDump(duration) {
      if (!this._canStartDump()) return;

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

      // Start countdown
      this.dumpInterval = setInterval(() => {
        this.dumpTimeRemaining--;
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

  // ============================================
  // Undo/Redo Manager Module
  // ============================================

  /**
   * UndoRedoManager - Generic undo/redo state management for dialog menus.
   * Tracks state snapshots and provides undo/redo navigation.
   * Uses JSON serialization for deep state comparison and cloning.
   */
  class UndoRedoManager {
    constructor() {
      this.undoStack = [];
      this.redoStack = [];
      this.buttonContainer = null;
      this.undoButton = null;
      this.redoButton = null;
      this.onStateRestore = null; // Callback when state is restored
    }

    /**
     * Push a new state snapshot onto the undo stack.
     * Clears the redo stack since a new action invalidates future states.
     * @param {Object} state - The state to save (will be deep-cloned)
     */
    pushState(state) {
      this.undoStack.push(JSON.stringify(state));
      this.redoStack = [];
      this._updateButtons();
    }

    /**
     * Undo the last action and return the previous state.
     * @returns {Object|null} The restored state, or null if nothing to undo
     */
    undo() {
      if (this.undoStack.length <= 1) return null; // Keep at least initial state
      const current = this.undoStack.pop();
      this.redoStack.push(current);
      const previousState = JSON.parse(this.undoStack[this.undoStack.length - 1]);
      this._updateButtons();
      if (this.onStateRestore) this.onStateRestore(previousState);
      return previousState;
    }

    /**
     * Redo the last undone action and return the next state.
     * @returns {Object|null} The restored state, or null if nothing to redo
     */
    redo() {
      if (this.redoStack.length === 0) return null;
      const nextStateStr = this.redoStack.pop();
      this.undoStack.push(nextStateStr);
      const nextState = JSON.parse(nextStateStr);
      this._updateButtons();
      if (this.onStateRestore) this.onStateRestore(nextState);
      return nextState;
    }

    /**
     * Check if undo is available.
     * @returns {boolean}
     */
    canUndo() {
      return this.undoStack.length > 1;
    }

    /**
     * Check if redo is available.
     * @returns {boolean}
     */
    canRedo() {
      return this.redoStack.length > 0;
    }

    /**
     * Create the undo/redo button container UI element.
     * @returns {HTMLElement} Container with undo and redo buttons
     */
    createButtons() {
      this.buttonContainer = document.createElement('div');
      this.buttonContainer.className = 'zen-pomodoro-undo-redo-container';

      this.undoButton = document.createElement('button');
      this.undoButton.className = 'zen-pomodoro-undo-redo-button';
      this.undoButton.textContent = '↩ Undo';
      this.undoButton.title = 'Undo last change';
      this.undoButton.disabled = true;
      this.undoButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.undo();
      });

      this.redoButton = document.createElement('button');
      this.redoButton.className = 'zen-pomodoro-undo-redo-button';
      this.redoButton.textContent = 'Redo ↪';
      this.redoButton.title = 'Redo last undone change';
      this.redoButton.disabled = true;
      this.redoButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.redo();
      });

      this.buttonContainer.appendChild(this.undoButton);
      this.buttonContainer.appendChild(this.redoButton);

      return this.buttonContainer;
    }

    /**
     * Update button disabled states based on stack contents.
     * @private
     */
    _updateButtons() {
      if (this.undoButton) this.undoButton.disabled = !this.canUndo();
      if (this.redoButton) this.redoButton.disabled = !this.canRedo();
    }

    /**
     * Reset the undo/redo stacks.
     */
    reset() {
      this.undoStack = [];
      this.redoStack = [];
      this._updateButtons();
    }
  }

  // ============================================
  // Custom Cycle Manager
  // ============================================

  /**
   * Manages custom Pomodoro cycles.
   * Allows users to create, edit, and manage custom timer sequences
   * with different durations for each focus and break phase.
   */
  class CustomCycleManager {
    constructor() {
      this.currentEditingCycle = null;
      this.editingCycleDialog = null;
      this.draggedBlockIndex = null;
      this.selectedBlockIndices = new Set(); // Track selected block indices
      this.isDuplicating = false; // Flag for Alt+Drag duplication
      this.isDragging = false;
      this.dragCleanup = null;
      this._lastIndicatorRef = null; // Cached drop indicator position
    }

    /**
     * Create empty message element for cycles list.
     * @returns {HTMLElement} The empty message element
     * @private
     */
    _createEmptyMessage() {
      const emptyMessage = document.createElement('p');
      emptyMessage.style.color = '#888';
      emptyMessage.style.fontSize = '13px';
      emptyMessage.style.textAlign = 'center';
      emptyMessage.style.padding = '20px';
      emptyMessage.textContent = 'No custom cycles yet. Create one to get started!';
      return emptyMessage;
    }

    /**
     * Render cycles list into container.
     * @param {HTMLElement} container - Container element
     * @param {Array} cycles - Array of cycle objects
     * @param {Object} config - Configuration object
     * @param {HTMLElement} dialog - Parent dialog element
     * @private
     */
    _renderCyclesList(container, cycles, config, dialog) {
      if (cycles.length === 0) {
        container.appendChild(this._createEmptyMessage());
      } else {
        cycles.forEach((cycle, index) => {
          const cycleItem = this._createCycleListItem(cycle, config, dialog, index, cycles.length);
          container.appendChild(cycleItem);
        });
      }
    }

    /**
     * Show the main custom cycles menu listing all saved cycles.
     */
    showCustomCyclesMenu() {
      logger.log(LOG_CATEGORIES.MENU, 'Opening custom cycles menu');

      const config = getConfig();
      const savedCycles = config.customCycles || [];

      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-custom-cycles-dialog';
      dialog.className = 'zen-pomodoro-dialog active';

      // Back button
      const backButton = document.createElement('button');
      backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
      backButton.textContent = '← Back';
      backButton.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        // Return to main menu
        if (window.zenPomodoroApp?.keyboardShortcut) {
          window.zenPomodoroApp.keyboardShortcut.showPomodoroMenu();
        }
      });

      // Title
      const title = document.createElement('h2');
      title.className = 'zen-pomodoro-dialog-title';
      title.textContent = 'Custom Cycles';
      
      // Description
      const description = document.createElement('p');
      description.className = 'zen-pomodoro-dialog-description';
      description.textContent = 
        'Create custom timer sequences with different durations for each phase.';
      description.style.fontSize = '13px';
      description.style.color = '#888';
      description.style.margin = '0 0 16px 0';

      // Cycles list container
      const cyclesContainer = document.createElement('div');
      cyclesContainer.className = 'zen-pomodoro-cycles-list';
      cyclesContainer.style.marginBottom = '16px';

      this._renderCyclesList(cyclesContainer, savedCycles, config, dialog);

      // Create New button
      const createButton = document.createElement('button');
      createButton.className = 'zen-pomodoro-dialog-button';
      createButton.textContent = '+ Create New Cycle';
      createButton.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.showCycleEditor(null);
      });

      // Close button
      const closeButton = document.createElement('button');
      closeButton.className = 'zen-pomodoro-dialog-button secondary';
      closeButton.textContent = 'Close';
      closeButton.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
      });

      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      buttonDiv.appendChild(createButton);
      buttonDiv.appendChild(closeButton);

      dialog.appendChild(backButton);
      dialog.appendChild(title);
      dialog.appendChild(description);
      dialog.appendChild(cyclesContainer);
      dialog.appendChild(buttonDiv);

      applyLastDialogPosition(dialog);
      document.documentElement.appendChild(dialog);
      setupDialogDrag(dialog);
    }

    /**
     * Create a list item for a single saved cycle.
     * @param {Object} cycle - The cycle object
     * @param {Object} config - Current configuration
     * @param {HTMLElement} parentDialog - Parent dialog element
     * @param {number} index - Index of the cycle in the list
     * @param {number} totalCount - Total number of cycles
     * @returns {HTMLElement} The cycle list item element
     * @private
     */
    _createCycleListItem(cycle, config, parentDialog, index, totalCount) {
      const item = document.createElement('div');
      item.className = 'zen-pomodoro-cycle-list-item';

      // Cycle name and info
      const nameDiv = document.createElement('div');
      nameDiv.className = 'zen-pomodoro-cycle-name';
      nameDiv.textContent = cycle.name;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'zen-pomodoro-cycle-info';
      const blockCount = cycle.blocks.length;
      const totalMinutes = cycle.blocks.reduce((sum, block) => sum + block.duration, 0);
      infoDiv.textContent = `${blockCount} blocks • ${totalMinutes} minutes total`;

      const leftContent = document.createElement('div');
      leftContent.style.flex = '1';
      leftContent.appendChild(nameDiv);
      leftContent.appendChild(infoDiv);

      // Button container
      const buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'zen-pomodoro-cycle-buttons';

      // Move Up button
      const moveUpButton = document.createElement('button');
      moveUpButton.className = 'zen-pomodoro-dialog-button secondary small';
      moveUpButton.textContent = '▲';
      moveUpButton.title = 'Move up';
      moveUpButton.disabled = index === 0;
      moveUpButton.style.padding = '4px 8px';
      moveUpButton.style.minWidth = 'auto';
      moveUpButton.addEventListener('click', () => {
        this._reorderCycle(config, index, index - 1, parentDialog);
      });

      // Move Down button
      const moveDownButton = document.createElement('button');
      moveDownButton.className = 'zen-pomodoro-dialog-button secondary small';
      moveDownButton.textContent = '▼';
      moveDownButton.title = 'Move down';
      moveDownButton.disabled = index >= totalCount - 1;
      moveDownButton.style.padding = '4px 8px';
      moveDownButton.style.minWidth = 'auto';
      moveDownButton.addEventListener('click', () => {
        this._reorderCycle(config, index, index + 1, parentDialog);
      });

      // Edit button
      const editButton = document.createElement('button');
      editButton.className = 'zen-pomodoro-dialog-button secondary small';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => {
        saveDialogPosition(parentDialog);
        parentDialog.remove();
        this.showCycleEditor(cycle.id);
      });

      // Delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'zen-pomodoro-dialog-button secondary small';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => {
        this._confirmDeleteCycle(cycle, config, parentDialog);
      });

      buttonsDiv.appendChild(moveUpButton);
      buttonsDiv.appendChild(moveDownButton);
      buttonsDiv.appendChild(editButton);
      buttonsDiv.appendChild(deleteButton);

      item.appendChild(leftContent);
      item.appendChild(buttonsDiv);

      return item;
    }

    /**
     * Show confirmation dialog before deleting a cycle.
     * @param {Object} cycle - The cycle to delete
     * @param {Object} config - Current configuration
     * @param {HTMLElement} parentDialog - Parent dialog to refresh
     * @private
     */
    _confirmDeleteCycle(cycle, config, parentDialog) {
      const confirmDialog = document.createElement('div');
      confirmDialog.className = 'zen-pomodoro-dialog active';
      confirmDialog.setAttribute(DATA_NO_POSITION_SAVE, 'true');

      const title = document.createElement('h2');
      title.textContent = 'Delete Cycle?';

      const message = document.createElement('p');
      message.textContent = `Are you sure you want to delete "${cycle.name}"? This cannot be undone.`;
      message.style.marginBottom = '20px';

      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';

      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        confirmDialog.remove();
      });

      const deleteButton = document.createElement('button');
      deleteButton.className = 'zen-pomodoro-dialog-button';
      deleteButton.textContent = 'Delete';
      deleteButton.style.backgroundColor = '#e74c3c';
      deleteButton.addEventListener('click', () => {
        this.deleteCycle(cycle.id);
        confirmDialog.remove();
        // Refresh the cycles list
        saveDialogPosition(parentDialog);
        parentDialog.remove();
        this.showCustomCyclesMenu();
      });

      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(deleteButton);

      confirmDialog.appendChild(title);
      confirmDialog.appendChild(message);
      confirmDialog.appendChild(buttonDiv);

      applyLastDialogPosition(confirmDialog);
      document.documentElement.appendChild(confirmDialog);
    }

    /**
     * Reorder a cycle in the saved cycles list.
     * @param {Object} config - Current configuration
     * @param {number} fromIndex - Current index
     * @param {number} toIndex - Target index
     * @param {HTMLElement} parentDialog - Parent dialog to refresh
     * @private
     */
    _reorderCycle(config, fromIndex, toIndex, parentDialog) {
      const savedCycles = config.customCycles || [];
      if (fromIndex < 0 || fromIndex >= savedCycles.length) return;
      if (toIndex < 0 || toIndex >= savedCycles.length) return;

      const cycle = savedCycles[fromIndex];
      if (!cycle) return;
      savedCycles.splice(fromIndex, 1);
      savedCycles.splice(toIndex, 0, cycle);

      config.customCycles = savedCycles;
      saveConfig(config);

      logger.log(LOG_CATEGORIES.MENU, `Reordered cycle from position ${fromIndex} to ${toIndex}`, { cycleName: cycle.name || 'Unknown' });

      // Refresh the dialog
      saveDialogPosition(parentDialog);
      parentDialog.remove();
      this.showCustomCyclesMenu();
    }

    /**
     * Show the cycle editor for creating or editing a cycle.
     * @param {string|null} cycleId - ID of cycle to edit, or null to create new
     */
    showCycleEditor(cycleId = null) {
      logger.log(LOG_CATEGORIES.MENU, cycleId ? 'Editing custom cycle' : 'Creating new custom cycle');

      const config = getConfig();
      const savedCycles = config.customCycles || [];
      
      // Load existing cycle or create new one
      if (cycleId) {
        this.currentEditingCycle = savedCycles.find((c) => c.id === cycleId);
        if (!this.currentEditingCycle) {
          logger.log(LOG_CATEGORIES.MENU, `Cycle ${cycleId} not found`);
          return;
        }
        // Make a deep copy to avoid modifying the original until save
        this.currentEditingCycle = JSON.parse(JSON.stringify(this.currentEditingCycle));
        // Add default durations if not present (backward compatibility)
        if (!this.currentEditingCycle.defaultFocusDuration) {
          this.currentEditingCycle.defaultFocusDuration = 25;
        }
        if (!this.currentEditingCycle.defaultBreakDuration) {
          this.currentEditingCycle.defaultBreakDuration = 5;
        }
        if (!this.currentEditingCycle.defaultTransitionDuration) {
          this.currentEditingCycle.defaultTransitionDuration = 5;
        }
      } else {
        // Create new cycle with default values
        this.currentEditingCycle = {
          id: this._generateCycleId(),
          name: 'New Custom Cycle',
          defaultFocusDuration: 25,
          defaultBreakDuration: 5,
          defaultTransitionDuration: 5,
          blocks: [
            { type: 'focus', duration: 25 },
            { type: 'break', duration: 5 },
          ],
        };
      }

      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-cycle-editor-dialog';
      dialog.className = 'zen-pomodoro-dialog active zen-pomodoro-cycle-editor-dialog';
      this.editingCycleDialog = dialog;

      // Back button
      const backButton = document.createElement('button');
      backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
      backButton.textContent = '← Back';
      backButton.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.editingCycleDialog = null;
        this.showCustomCyclesMenu();
      });

      // Title
      const title = document.createElement('h2');
      title.className = 'zen-pomodoro-dialog-title';
      title.textContent = cycleId ? 'Edit Custom Cycle' : 'Create Custom Cycle';

      // Undo/Redo for cycle editing
      const cycleUndoRedo = new UndoRedoManager();
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      const undoRedoButtons = cycleUndoRedo.createButtons();
      this.currentUndoRedo = cycleUndoRedo;

      // Cycle name input
      const nameRow = document.createElement('div');
      nameRow.className = 'zen-pomodoro-config-row';
      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Cycle Name:';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'zen-pomodoro-dialog-input';
      nameInput.value = this.currentEditingCycle.name;
      nameInput.placeholder = 'e.g., Deep Work Session';
      nameInput.addEventListener('input', () => {
        this.currentEditingCycle.name = nameInput.value;
      });
      nameInput.addEventListener('change', () => {
        // Push undo state after name change
        cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      });
      nameRow.appendChild(nameLabel);
      nameRow.appendChild(nameInput);

      // Default duration inputs row
      const durationRow = document.createElement('div');
      durationRow.className = 'zen-pomodoro-config-row';
      durationRow.style.display = 'flex';
      durationRow.style.gap = '16px';
      durationRow.style.alignItems = 'center';
      durationRow.style.marginTop = '12px';

      // Focus block duration
      const focusDurationContainer = document.createElement('div');
      focusDurationContainer.style.display = 'flex';
      focusDurationContainer.style.flexDirection = 'column';
      focusDurationContainer.style.flex = '1';
      
      const focusDurationLabel = document.createElement('label');
      focusDurationLabel.textContent = 'Focus Block Duration (min):';
      focusDurationLabel.style.fontSize = '12px';
      focusDurationLabel.style.marginBottom = '4px';
      
      const focusDurationInput = document.createElement('input');
      focusDurationInput.type = 'number';
      focusDurationInput.className = 'zen-pomodoro-dialog-input';
      focusDurationInput.min = '1';
      focusDurationInput.max = '120';
      focusDurationInput.value = this.currentEditingCycle.defaultFocusDuration;
      focusDurationInput.style.width = '100%';
      focusDurationInput.addEventListener('change', () => {
        const validated = validateIntegerInput(
          focusDurationInput.value,
          1,
          120,
          this.currentEditingCycle.defaultFocusDuration
        );
        this.currentEditingCycle.defaultFocusDuration = validated;
        focusDurationInput.value = validated;
        // Push undo state after duration change
        cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      });
      
      focusDurationContainer.appendChild(focusDurationLabel);
      focusDurationContainer.appendChild(focusDurationInput);

      // Break block duration
      const breakDurationContainer = document.createElement('div');
      breakDurationContainer.style.display = 'flex';
      breakDurationContainer.style.flexDirection = 'column';
      breakDurationContainer.style.flex = '1';
      
      const breakDurationLabel = document.createElement('label');
      breakDurationLabel.textContent = 'Break Block Duration (min):';
      breakDurationLabel.style.fontSize = '12px';
      breakDurationLabel.style.marginBottom = '4px';
      
      const breakDurationInput = document.createElement('input');
      breakDurationInput.type = 'number';
      breakDurationInput.className = 'zen-pomodoro-dialog-input';
      breakDurationInput.min = '1';
      breakDurationInput.max = '120';
      breakDurationInput.value = this.currentEditingCycle.defaultBreakDuration;
      breakDurationInput.style.width = '100%';
      breakDurationInput.addEventListener('change', () => {
        const validated = validateIntegerInput(
          breakDurationInput.value,
          1,
          120,
          this.currentEditingCycle.defaultBreakDuration
        );
        this.currentEditingCycle.defaultBreakDuration = validated;
        breakDurationInput.value = validated;
        // Push undo state after duration change
        cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      });
      
      breakDurationContainer.appendChild(breakDurationLabel);
      breakDurationContainer.appendChild(breakDurationInput);

      // Transition block duration
      const transitionDurationContainer = document.createElement('div');
      transitionDurationContainer.style.display = 'flex';
      transitionDurationContainer.style.flexDirection = 'column';
      transitionDurationContainer.style.flex = '1';

      const transitionDurationLabel = document.createElement('label');
      transitionDurationLabel.textContent = 'Transition Duration (min):';
      transitionDurationLabel.style.fontSize = '12px';
      transitionDurationLabel.style.marginBottom = '4px';

      const transitionDurationInput = document.createElement('input');
      transitionDurationInput.type = 'number';
      transitionDurationInput.className = 'zen-pomodoro-dialog-input';
      transitionDurationInput.min = '1';
      transitionDurationInput.max = '15';
      transitionDurationInput.value = this.currentEditingCycle.defaultTransitionDuration;
      transitionDurationInput.style.width = '100%';
      transitionDurationInput.addEventListener('change', () => {
        const validated = validateIntegerInput(
          transitionDurationInput.value,
          1,
          15,
          this.currentEditingCycle.defaultTransitionDuration
        );
        this.currentEditingCycle.defaultTransitionDuration = validated;
        transitionDurationInput.value = validated;
        // Push undo state after duration change
        cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      });

      transitionDurationContainer.appendChild(transitionDurationLabel);
      transitionDurationContainer.appendChild(transitionDurationInput);

      durationRow.appendChild(focusDurationContainer);
      durationRow.appendChild(breakDurationContainer);
      durationRow.appendChild(transitionDurationContainer);

      // Blocks container
      const blocksLabel = document.createElement('label');
      blocksLabel.textContent = 'Timer Blocks:';
      blocksLabel.style.display = 'block';
      blocksLabel.style.marginTop = '20px';
      blocksLabel.style.marginBottom = '8px';
      blocksLabel.style.fontWeight = 'bold';

      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'zen-pomodoro-cycle-blocks-container';
      blocksContainer.id = 'zen-pomodoro-cycle-blocks';

      // Render blocks
      this._renderBlocks(blocksContainer);

      // Add Block controls row (dropdown + button)
      const addBlockRow = document.createElement('div');
      addBlockRow.style.display = 'flex';
      addBlockRow.style.gap = '8px';
      addBlockRow.style.alignItems = 'center';
      addBlockRow.style.marginTop = '12px';

      const blockTypeSelect = document.createElement('select');
      blockTypeSelect.className = 'zen-pomodoro-dialog-input';
      
      const focusOption = document.createElement('option');
      focusOption.value = 'focus';
      focusOption.textContent = '🎯 Focus';
      
      const breakOption = document.createElement('option');
      breakOption.value = 'break';
      breakOption.textContent = '☕ Break';
      
      const transitionOption = document.createElement('option');
      transitionOption.value = 'transition';
      transitionOption.textContent = '⏰ Transition';
      
      blockTypeSelect.appendChild(focusOption);
      blockTypeSelect.appendChild(breakOption);
      blockTypeSelect.appendChild(transitionOption);

      const addBlockButton = document.createElement('button');
      addBlockButton.className = 'zen-pomodoro-dialog-button secondary';
      addBlockButton.textContent = '+ Add Block';
      addBlockButton.style.width = 'auto';
      addBlockButton.style.padding = '8px 16px';
      addBlockButton.addEventListener('click', () => {
        const selectedType = blockTypeSelect.value;
        let duration;
        if (selectedType === 'focus') {
          duration = this.currentEditingCycle.defaultFocusDuration;
        } else if (selectedType === 'break') {
          duration = this.currentEditingCycle.defaultBreakDuration;
        } else {
          // Transition: use the cycle's default transition duration with fallback
          duration = this.currentEditingCycle.defaultTransitionDuration || 5;
        }
        this.addBlock(selectedType, duration);
        this._renderBlocks(blocksContainer);
        // Push undo state after adding block
        cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      });

      addBlockRow.appendChild(blockTypeSelect);
      addBlockRow.appendChild(addBlockButton);

      // Save and Cancel buttons
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';

      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        saveDialogPosition(dialog);
        dialog.remove();
        this.editingCycleDialog = null;
        this.showCustomCyclesMenu();
      });

      const saveButton = document.createElement('button');
      saveButton.className = 'zen-pomodoro-dialog-button';
      saveButton.textContent = 'Save Cycle';
      saveButton.addEventListener('click', () => {
        if (this._validateCycle()) {
          this.saveCycle();
          saveDialogPosition(dialog);
          dialog.remove();
          this.editingCycleDialog = null;
          this.showCustomCyclesMenu();
        }
      });

      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(saveButton);

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
      dialog.appendChild(title);
      dialog.appendChild(nameRow);
      dialog.appendChild(durationRow);
      dialog.appendChild(blocksLabel);
      dialog.appendChild(blocksContainer);
      dialog.appendChild(addBlockRow);
      dialog.appendChild(buttonDiv);

      // Track changes for undo/redo
      blocksContainer.addEventListener('change', () => {
        cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      });

      // Set restore callback for undo/redo
      cycleUndoRedo.onStateRestore = (state) => {
        this.currentEditingCycle = state;
        // Update inputs
        if (nameInput) nameInput.value = state.name;
        if (focusDurationInput) focusDurationInput.value = state.defaultFocusDuration;
        if (breakDurationInput) breakDurationInput.value = state.defaultBreakDuration;
        if (transitionDurationInput) transitionDurationInput.value = state.defaultTransitionDuration || 5;
        this._renderBlocks(blocksContainer);
      };

      applyLastDialogPosition(dialog);
      document.documentElement.appendChild(dialog);
      setupDialogDrag(dialog);
    }

    /**
     * Clear all block selections.
     * @param {HTMLElement} container - Container element for blocks
     * @private
     */
    _clearBlockSelection(container) {
      this.selectedBlockIndices.clear();
      if (container) {
        container.querySelectorAll('.zen-pomodoro-cycle-block.selected')
          .forEach(el => el.classList.remove('selected'));
      }
    }

    /**
     * Duplicate blocks at specified indices and insert at target position.
     * @param {Array<number>} sourceIndices - Indices of blocks to duplicate (sorted)
     * @param {number} targetIndex - Target insertion index
     * @private
     */
    _duplicateBlocks(sourceIndices, targetIndex) {
      if (sourceIndices.length === 0) return;

      // Create deep copies of the blocks
      const blocksToDuplicate = sourceIndices.map(idx => ({
        type: this.currentEditingCycle.blocks[idx].type,
        duration: this.currentEditingCycle.blocks[idx].duration
      }));

      // Insert duplicated blocks at target position
      this.currentEditingCycle.blocks.splice(targetIndex, 0, ...blocksToDuplicate);
      
      logger.log(LOG_CATEGORIES.MENU, `Duplicated ${sourceIndices.length} block(s) to index ${targetIndex}`);
    }

    /**
     * Move multiple blocks to a target position, preserving their relative order.
     * @param {Array<number>} sourceIndices - Indices of blocks to move (sorted)
     * @param {number} targetIndex - Target insertion index
     * @private
     */
    _moveMultipleBlocks(sourceIndices, targetIndex) {
      if (sourceIndices.length === 0) return;

      // Extract the blocks to move
      const blocksToMove = sourceIndices.map(idx => this.currentEditingCycle.blocks[idx]);
      
      // Remove blocks from the array (in reverse order to maintain indices)
      for (let i = sourceIndices.length - 1; i >= 0; i--) {
        this.currentEditingCycle.blocks.splice(sourceIndices[i], 1);
      }

      // Adjust target index based on how many blocks before it were removed
      const removedBefore = sourceIndices.filter(idx => idx < targetIndex).length;
      const adjustedTarget = targetIndex - removedBefore;

      // Insert blocks at adjusted target position
      this.currentEditingCycle.blocks.splice(adjustedTarget, 0, ...blocksToMove);
      
      logger.log(LOG_CATEGORIES.MENU, `Moved ${sourceIndices.length} block(s) to index ${adjustedTarget}`);
    }

    /**
     * Handle a block drop operation.
     * Extracts the complex drop logic into a dedicated method to reduce handler complexity.
     * @param {number} targetIndex - Target insertion index
     * @private
     */
    _handleBlockDrop(targetIndex) {
      const isMultiSelect = this.selectedBlockIndices.has(this.draggedBlockIndex);
      const sourceIndices = isMultiSelect 
        ? Array.from(this.selectedBlockIndices).sort((a, b) => a - b)
        : [this.draggedBlockIndex];
      
      if (this.isDuplicating) {
        this._duplicateBlocks(sourceIndices, targetIndex);
      } else if (this.draggedBlockIndex !== targetIndex) {
        if (isMultiSelect) {
          this._moveMultipleBlocks(sourceIndices, targetIndex);
        } else {
          this.reorderBlocks(this.draggedBlockIndex, targetIndex);
        }
      }
      
      // Re-render blocks
      const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
      if (blocksContainer) {
        this._renderBlocks(blocksContainer);
      }
    }

    /**
     * Render the blocks in the editor.
     * @param {HTMLElement} container - Container element for blocks
     * @private
     */
    _renderBlocks(container) {
      // Clear selection when re-rendering
      this._clearBlockSelection(container);
      
      container.innerHTML = '';

      if (this.currentEditingCycle.blocks.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.style.color = '#888';
        emptyMessage.style.fontSize = '13px';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '20px';
        emptyMessage.textContent = 'No blocks yet. Add your first block to get started!';
        container.appendChild(emptyMessage);
        return;
      }

      this.currentEditingCycle.blocks.forEach((block, index) => {
        const blockElement = this._createBlockElement(block, index);
        container.appendChild(blockElement);
      });
    }

    /**
     * Create a block element for the editor.
     * @param {Object} block - Block object
     * @param {number} index - Block index
     * @returns {HTMLElement} Block element
     * @private
     */
    _createBlockElement(block, index) {
      const blockDiv = document.createElement('div');
      blockDiv.className = `zen-pomodoro-cycle-block zen-pomodoro-cycle-block-${block.type}`;
      blockDiv.dataset.index = index;

      // Drag handle
      const dragHandle = document.createElement('div');
      dragHandle.className = 'zen-pomodoro-cycle-block-handle';
      dragHandle.textContent = '⋮⋮';
      dragHandle.title = 'Drag to reorder';

      // Block type icon
      const typeIcon = document.createElement('div');
      typeIcon.className = 'zen-pomodoro-cycle-block-type';
      const typeIcons = { focus: '🎯', break: '☕', transition: '⏰' };
      typeIcon.textContent = typeIcons[block.type] || '❓';

      // Block info
      const infoDiv = document.createElement('div');
      infoDiv.className = 'zen-pomodoro-cycle-block-info';
      
      const typeLabel = document.createElement('div');
      typeLabel.className = 'zen-pomodoro-cycle-block-label';
      const typeLabels = { focus: 'Focus', break: 'Break', transition: 'Transition' };
      typeLabel.textContent = typeLabels[block.type] || 'Unknown';
      
      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.min = '1';
      durationInput.max = block.type === 'transition' ? '15' : '120';
      durationInput.value = block.duration;
      durationInput.className = 'zen-pomodoro-cycle-block-duration';
      durationInput.addEventListener('change', () => {
        const maxDuration = block.type === 'transition' ? 15 : 120;
        const newDuration = validateIntegerInput(durationInput.value, 1, maxDuration, block.duration);
        durationInput.value = newDuration;
        this.currentEditingCycle.blocks[index].duration = newDuration;
      });
      
      const minutesLabel = document.createElement('span');
      minutesLabel.textContent = ' minutes';
      minutesLabel.style.fontSize = '12px';
      minutesLabel.style.color = '#888';

      infoDiv.appendChild(typeLabel);
      infoDiv.appendChild(durationInput);
      infoDiv.appendChild(minutesLabel);

      // Delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'zen-pomodoro-cycle-block-delete';
      deleteButton.textContent = '✕';
      deleteButton.title = 'Delete block';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering block click
        
        // If this block is selected, delete all selected blocks
        if (this.selectedBlockIndices.has(index)) {
          this._deleteSelectedBlocks();
        } else {
          // Single block deletion
          this.removeBlock(index);
          this._pushUndoState();
        }
      });

      blockDiv.appendChild(dragHandle);
      blockDiv.appendChild(typeIcon);
      blockDiv.appendChild(infoDiv);
      blockDiv.appendChild(deleteButton);

      // Shift+Click handler for multi-select
      blockDiv.addEventListener('click', (e) => {
        // Don't handle click if it's on the input or delete button
        if (e.target === durationInput || e.target === deleteButton) {
          return;
        }
        
        if (e.shiftKey) {
          e.preventDefault();
          if (this.selectedBlockIndices.has(index)) {
            this.selectedBlockIndices.delete(index);
            blockDiv.classList.remove('selected');
          } else {
            this.selectedBlockIndices.add(index);
            blockDiv.classList.add('selected');
          }
        } else {
          // Clear all selections on normal click
          const container = blockDiv.parentElement;
          this._clearBlockSelection(container);
        }
      });

      // Custom pointer-based drag on entire block (supports mouse and touch)
      blockDiv.addEventListener('pointerdown', (e) => {
        // Don't start drag if clicking on input, delete button, or their children
        if (durationInput.contains(e.target) || deleteButton.contains(e.target)) {
          return;
        }
        if (e.shiftKey) return; // allow Shift+Click multi-select without drag
        // Allow left mouse button (button 0) or touch/pen input
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this._startBlockDrag(e, blockDiv, index);
      });

      return blockDiv;
    }

    /**
     * Start a custom pointer-based block drag operation.
     * @param {MouseEvent} e - The mousedown event
     * @param {HTMLElement} blockDiv - The block element being dragged
     * @param {number} index - The index of the block being dragged
     * @private
     */
    _startBlockDrag(e, blockDiv, index) {
      // Safety: cleanup any existing drag state before starting new drag
      if (this.isDragging) {
        if (this.dragCleanup) {
          this.dragCleanup();
          this.dragCleanup = null;
        }
        this.isDragging = false;
      }

      this.isDragging = true;
      this.draggedBlockIndex = index;
      this.isDuplicating = e.altKey;

      const container = blockDiv.parentElement;
      if (!container) return;

      // Determine which indices are being dragged
      const isMultiSelect = this.selectedBlockIndices.has(index);
      const dragIndices = isMultiSelect
        ? Array.from(this.selectedBlockIndices).sort((a, b) => a - b)
        : [index];

      logger.log(Constants.LOG_CATEGORIES.MENU, 'Block drag started', {
        index,
        isMultiSelect,
        isDuplicating: this.isDuplicating,
        dragIndices
      });

      // Capture dimensions BEFORE adding dragging class
      const allBlocks = Array.from(container.querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)'));
      const { dragPreview, offsetY } = this._createDragPreview(e, blockDiv, allBlocks, dragIndices);

      // Mark all dragged blocks
      dragIndices.forEach(idx => {
        if (allBlocks[idx]) allBlocks[idx].classList.add('dragging');
      });

      // Add transition class to non-dragged blocks for smooth shifting
      allBlocks.forEach((block, idx) => {
        if (!dragIndices.includes(idx)) {
          block.classList.add('drag-transition');
        }
      });

      // Create drop indicator
      const dropIndicator = document.createElement('div');
      dropIndicator.className = 'zen-pomodoro-cycle-drop-indicator';
      dropIndicator.style.display = 'none';
      container.appendChild(dropIndicator);

      // Create ghost blocks for duplication mode
      let ghostBlocks = [];
      if (this.isDuplicating) {
        ghostBlocks = dragIndices.map(idx => {
          const ghost = allBlocks[idx].cloneNode(true);
          ghost.className = allBlocks[idx].className.replace('dragging', '').trim() + ' zen-pomodoro-cycle-block-ghost';
          ghost.style.display = 'none';
          return ghost;
        });
      }

      let lastTargetIndex = -1;
      let rafId = null;
      let lastPointerY = e.clientY; // Track pointer Y for auto-scroll target recalculation
      
      // Reset cached indicator position for new drag
      this._lastIndicatorRef = null;
      
      // Auto-scroll variables for dragging near container edges
      const scrollContainer = container;
      const SCROLL_ZONE = 40; // px from edge to trigger auto-scroll
      const SCROLL_SPEED = 4; // px per frame
      const scrollState = { rafId: null, direction: null };

      // Shared function to update drop target position based on pointer Y
      const updateDropTarget = (clientY) => {
        const targetIndex = this._getDropTargetIndex(container, clientY, dragIndices);
        
        if (targetIndex === lastTargetIndex) return;
        lastTargetIndex = targetIndex;

        const nonDraggedBlocks = allBlocks.filter((_, idx) => !dragIndices.includes(idx));
        
        if (targetIndex < 0) return;

        this._positionDropIndicator(container, dropIndicator, nonDraggedBlocks, targetIndex);

        if (this.isDuplicating && ghostBlocks.length > 0) {
          this._showGhostBlocks(container, dropIndicator, ghostBlocks);
        }

      };

      const onPointerMove = (pointerMoveEvent) => {
        lastPointerY = pointerMoveEvent.clientY;
        
        // Update floating drag preview position
        dragPreview.style.top = `${lastPointerY - offsetY}px`;
        
        // Handle auto-scroll near container edges (not throttled by rAF)
        this._updateAutoScroll(lastPointerY, scrollContainer, SCROLL_ZONE, SCROLL_SPEED, scrollState, updateDropTarget);
        
        if (rafId) return; // Throttle updateDropTarget with rAF
        rafId = requestAnimationFrame(() => {
          rafId = null;
          updateDropTarget(lastPointerY);
        });
      };

      const cleanup = () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', cleanup);
        document.removeEventListener('pointercancel', cleanup);
        
        // Remove floating drag preview
        if (dragPreview.parentElement) dragPreview.remove();
        
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        
        // Stop auto-scroll
        if (scrollState.rafId) {
          cancelAnimationFrame(scrollState.rafId);
          scrollState.rafId = null;
        }

        this._cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks);
        const didApply = this._applyDragOperation(lastTargetIndex, dragIndices, isMultiSelect);

        logger.log(Constants.LOG_CATEGORIES.MENU, 'Block drag completed', {
          from: dragIndices,
          to: lastTargetIndex
        });

        // Only re-render and push undo state if an actual operation occurred
        if (didApply) {
          const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
          if (blocksContainer) {
            this._renderBlocks(blocksContainer);
          }
          if (this.currentUndoRedo) {
            this.currentUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
          }
        }

        this.isDragging = false;
        this.draggedBlockIndex = null;
        this.isDuplicating = false;
        this.dragCleanup = null;
      };


      this.dragCleanup = cleanup;

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', cleanup);
      document.addEventListener('pointercancel', cleanup);
    }

    /**
     * Create a floating drag preview element that follows the cursor.
     * Must be called BEFORE blocks are collapsed with the dragging class.
     * @param {PointerEvent} e - The pointer event
     * @param {HTMLElement} blockDiv - The primary block being dragged
     * @param {Array<HTMLElement>} allBlocks - All block elements
     * @param {Array<number>} dragIndices - Indices of blocks being dragged
     * @returns {{ dragPreview: HTMLElement, offsetY: number }}
     * @private
     */
    _createDragPreview(e, blockDiv, allBlocks, dragIndices) {
      const blockWidth = blockDiv.offsetWidth;
      const blockRect = blockDiv.getBoundingClientRect();
      const startY = e.clientY;
      const offsetY = startY - blockRect.top;

      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'fixed';
      dragPreview.style.pointerEvents = 'none';
      dragPreview.style.zIndex = '2147483647';
      dragPreview.style.opacity = '0.85';
      dragPreview.style.width = `${blockWidth}px`;
      dragPreview.style.transition = 'none';
      dragPreview.className = 'zen-pomodoro-drag-preview';

      dragIndices.forEach(idx => {
        if (allBlocks[idx]) {
          const clone = allBlocks[idx].cloneNode(true);
          clone.classList.remove('selected');
          clone.style.margin = '0';
          clone.style.pointerEvents = 'none';
          dragPreview.appendChild(clone);
        }
      });

      dragPreview.style.left = `${blockRect.left}px`;
      dragPreview.style.top = `${startY - offsetY}px`;
      document.documentElement.appendChild(dragPreview);

      return { dragPreview, offsetY };
    }

    /**
     * Apply the drag/drop operation (move or duplicate) based on target index.
     * @param {number} lastTargetIndex - Drop target index relative to non-dragged blocks
     * @param {Array<number>} dragIndices - Indices of dragged blocks
     * @param {boolean} isMultiSelect - Whether multiple blocks were selected
     * @returns {boolean} True if an operation was applied, false if no-op
     * @private
     */
    _applyDragOperation(lastTargetIndex, dragIndices, isMultiSelect) {
      if (lastTargetIndex < 0) return false;

      const absoluteTarget = this._computeAbsoluteTarget(lastTargetIndex, dragIndices);

      // Check if single-block move would result in no change
      if (this._isSamePositionMove(absoluteTarget, isMultiSelect)) return false;

      if (this.isDuplicating) {
        this._duplicateBlocks(dragIndices, absoluteTarget);
      } else if (isMultiSelect) {
        this._moveMultipleBlocks(dragIndices, absoluteTarget);
      } else {
        this.reorderBlocks(this.draggedBlockIndex, absoluteTarget);
      }
      return true;
    }

    /**
     * Compute the absolute target index from a relative drop position.
     * @param {number} relativeTarget - Target index among non-dragged blocks
     * @param {Array<number>} dragIndices - Indices of blocks being dragged
     * @returns {number} Absolute target index in the full blocks array
     * @private
     */
    _computeAbsoluteTarget(relativeTarget, dragIndices) {
      const nonDraggedIndices = [];
      for (let i = 0; i < this.currentEditingCycle.blocks.length; i++) {
        if (!dragIndices.includes(i)) {
          nonDraggedIndices.push(i);
        }
      }
      return relativeTarget >= nonDraggedIndices.length
        ? this.currentEditingCycle.blocks.length
        : nonDraggedIndices[relativeTarget];
    }

    /**
     * Check if a single-block drag would result in no position change.
     * @param {number} absoluteTarget - Target index in the full blocks array
     * @param {boolean} isMultiSelect - Whether multiple blocks are selected
     * @returns {boolean} True if the move is a no-op
     * @private
     */
    _isSamePositionMove(absoluteTarget, isMultiSelect) {
      if (this.isDuplicating || isMultiSelect) return false;
      const from = this.draggedBlockIndex;
      return absoluteTarget === from || absoluteTarget === from + 1;
    }

    /**
     * Clean up visual state after a drag operation ends.
     * @param {Array<HTMLElement>} allBlocks - All block DOM elements
     * @param {HTMLElement} dropIndicator - Drop indicator element
     * @param {Array<HTMLElement>} ghostBlocks - Ghost block elements
     * @private
     */
    _cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks) {
      if (dropIndicator && dropIndicator.parentElement) {
        dropIndicator.remove();
      }
      ghostBlocks.forEach((g) => {
        if (g && g.parentElement) {
          g.remove();
        }
      });
      
      // Remove any orphaned indicators or ghosts from container
      const container = allBlocks[0]?.parentElement;
      if (container) {
        container.querySelectorAll('.zen-pomodoro-cycle-drop-indicator').forEach((el) => {
          el.remove();
        });
        container.querySelectorAll('.zen-pomodoro-cycle-block-ghost').forEach((el) => {
          el.remove();
        });
      }
      
      allBlocks.forEach(block => {
        block.classList.remove('dragging', 'drag-transition');
      });
    }

    /**
     * Compute the reference element for drop indicator positioning.
     * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
     * @param {number} targetIndex - Target insertion index
     * @returns {HTMLElement|null} Reference element to insert before, or null to append
     * @private
     */
    _getDropIndicatorRef(nonDraggedBlocks, targetIndex) {
      if (targetIndex < nonDraggedBlocks.length) {
        return nonDraggedBlocks[targetIndex];
      }
      const lastNonDragged = nonDraggedBlocks[nonDraggedBlocks.length - 1];
      return (lastNonDragged && lastNonDragged.nextSibling) || null;
    }

    /**
     * Position the drop indicator at the correct location in the container.
     * @param {HTMLElement} container - Blocks container element
     * @param {HTMLElement} dropIndicator - Drop indicator element
     * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
     * @param {number} targetIndex - Target insertion index
     * @private
     */
    _positionDropIndicator(container, dropIndicator, nonDraggedBlocks, targetIndex) {
      dropIndicator.style.display = 'block';
      const newRef = this._getDropIndicatorRef(nonDraggedBlocks, targetIndex);

      // Only update DOM if position changed (prevents flickering)
      if (newRef !== this._lastIndicatorRef) {
        this._lastIndicatorRef = newRef;
        if (newRef) {
          container.insertBefore(dropIndicator, newRef);
        } else {
          container.appendChild(dropIndicator);
        }
      }
    }

    /**
     * Show ghost blocks at the drop indicator position for duplication preview.
     * @param {HTMLElement} container - Blocks container
     * @param {HTMLElement} dropIndicator - Drop indicator element
     * @param {Array<HTMLElement>} ghostBlocks - Ghost block elements
     * @private
     */
    _showGhostBlocks(container, dropIndicator, ghostBlocks) {
      ghostBlocks.forEach((g) => {
        g.remove();
      });
      ghostBlocks.forEach((ghost) => {
        ghost.style.display = '';
        container.insertBefore(ghost, dropIndicator);
      });
    }

    /**
     * Update auto-scroll state based on pointer position relative to container edges.
     * @param {number} clientY - Current pointer Y position
     * @param {HTMLElement} scrollContainer - Scrollable container element
     * @param {number} scrollZone - Distance from edge to trigger scrolling (px)
     * @param {number} scrollSpeed - Scroll speed per animation frame (px)
     * @param {Object} scrollState - Mutable state object with rafId and direction
     * @param {Function} onScroll - Callback to update drop target during scroll
     * @private
     */
    _updateAutoScroll(clientY, scrollContainer, scrollZone, scrollSpeed, scrollState, onScroll) {
      const containerRect = scrollContainer.getBoundingClientRect();
      let newScrollDir = null;
      if (clientY < containerRect.top + scrollZone) {
        newScrollDir = 'up';
      } else if (clientY > containerRect.bottom - scrollZone) {
        newScrollDir = 'down';
      }

      if (newScrollDir === scrollState.direction) return;

      // Stop any existing scroll
      if (scrollState.rafId) {
        cancelAnimationFrame(scrollState.rafId);
        scrollState.rafId = null;
      }
      scrollState.direction = newScrollDir;
      if (scrollState.direction) {
        logger.log(Constants.LOG_CATEGORIES.MENU, `Auto-scroll activated (${scrollState.direction})`);
        const speed = scrollState.direction === 'up' ? -scrollSpeed : scrollSpeed;
        const doScroll = () => {
          scrollContainer.scrollTop += speed;
          // Recalculate drop target as scroll position changes
          if (onScroll) {
            onScroll(clientY);
          }
          scrollState.rafId = requestAnimationFrame(doScroll);
        };
        scrollState.rafId = requestAnimationFrame(doScroll);
      }
    }

    /**
     * Push current cycle state to undo stack.
     * @private
     */
    _pushUndoState() {
      if (this.currentUndoRedo) {
        this.currentUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
      }
    }

    /**
     * Delete all currently selected blocks, with validation.
     * Shows an error dialog if all blocks would be deleted.
     * @private
     */
    _deleteSelectedBlocks() {
      const indicesToDelete = Array.from(this.selectedBlockIndices).sort((a, b) => b - a);

      // Check if we'd delete all blocks
      if (indicesToDelete.length >= this.currentEditingCycle.blocks.length) {
        this._showValidationError('A cycle must have at least one block.');
        return;
      }

      // Delete in reverse order to maintain indices
      for (const idx of indicesToDelete) {
        this.currentEditingCycle.blocks.splice(idx, 1);
      }

      logger.log(LOG_CATEGORIES.MENU, `Deleted ${indicesToDelete.length} selected block(s)`);

      // Clear selection and re-render
      this.selectedBlockIndices.clear();
      const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
      if (blocksContainer) {
        this._renderBlocks(blocksContainer);
      }
      this._pushUndoState();
    }

    /**
     * Calculate the drop target index based on mouse Y position.
     * Returns the index among non-dragged blocks where the drop should occur.
     * @param {HTMLElement} container - The blocks container
     * @param {number} clientY - Mouse Y position
     * @param {Array<number>} dragIndices - Indices of blocks being dragged
     * @returns {number} Target insertion index among non-dragged blocks
     * @private
     */
    _getDropTargetIndex(container, clientY, dragIndices) {
      const allBlocks = Array.from(container.querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)'));
      const nonDraggedBlocks = allBlocks.filter((_, idx) => !dragIndices.includes(idx));

      // Find the position among non-dragged blocks
      for (let i = 0; i < nonDraggedBlocks.length; i++) {
        const rect = nonDraggedBlocks[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (clientY < midY) {
          return i;
        }
      }
      
      return nonDraggedBlocks.length; // After all blocks
    }

    /**
     * Get the element after which the dragged element should be inserted.
     * @param {HTMLElement} container - Container element
     * @param {number} y - Mouse Y position
     * @returns {HTMLElement|null} Element after which to insert
     * @private
     */
    _getDragAfterElement(container, y) {
      const draggableElements = [
        ...container.querySelectorAll('.zen-pomodoro-cycle-block:not(.dragging)'),
      ];

      return draggableElements.reduce(
        (closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;

          if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
          } else {
            return closest;
          }
        },
        { offset: Number.NEGATIVE_INFINITY }
      ).element;
    }

    /**
     * Show menu to add a new block.
     * @param {HTMLElement} blocksContainer - Container for blocks
     * @private
     */
    _showAddBlockMenu(blocksContainer) {
      const menu = document.createElement('div');
      menu.className = 'zen-pomodoro-dialog active zen-pomodoro-add-block-menu';
      menu.setAttribute(DATA_NO_POSITION_SAVE, 'true');

      const title = document.createElement('h2');
      title.textContent = 'Add Block';

      const description = document.createElement('p');
      description.textContent = 'Choose the type of block to add:';
      description.style.marginBottom = '16px';
      description.style.fontSize = '13px';

      // Block type buttons
      const buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'zen-pomodoro-dialog-buttons';
      buttonsDiv.style.flexDirection = 'column';
      buttonsDiv.style.gap = '8px';

      const focusButton = document.createElement('button');
      focusButton.className = 'zen-pomodoro-dialog-button';
      focusButton.textContent = '🎯 Focus Block (25 min)';
      focusButton.addEventListener('click', () => {
        this.addBlock('focus', 25);
        menu.remove();
        this._renderBlocks(blocksContainer);
      });

      const breakButton = document.createElement('button');
      breakButton.className = 'zen-pomodoro-dialog-button';
      breakButton.textContent = '☕ Break Block (5 min)';
      breakButton.addEventListener('click', () => {
        this.addBlock('break', 5);
        menu.remove();
        this._renderBlocks(blocksContainer);
      });

      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => {
        menu.remove();
      });

      buttonsDiv.appendChild(focusButton);
      buttonsDiv.appendChild(breakButton);
      buttonsDiv.appendChild(cancelButton);

      menu.appendChild(title);
      menu.appendChild(description);
      menu.appendChild(buttonsDiv);

      applyLastDialogPosition(menu);
      document.documentElement.appendChild(menu);
    }

    /**
     * Add a new block to the current editing cycle.
     * @param {string} type - Block type ('focus' or 'break')
     * @param {number} duration - Duration in minutes
     */
    addBlock(type, duration) {
      this.currentEditingCycle.blocks.push({ type, duration });
      logger.log(LOG_CATEGORIES.MENU, `Added ${type} block (${duration} min)`);
    }

    /**
     * Remove a block from the current editing cycle.
     * @param {number} index - Index of block to remove
     */
    removeBlock(index) {
      if (this.currentEditingCycle.blocks.length <= 1) {
        // Show error - must have at least one block
        const errorDialog = document.createElement('div');
        errorDialog.className = 'zen-pomodoro-dialog active';
        errorDialog.setAttribute(DATA_NO_POSITION_SAVE, 'true');

        const title = document.createElement('h2');
        title.textContent = 'Cannot Delete';

        const message = document.createElement('p');
        message.textContent = 'A cycle must have at least one block.';
        message.style.marginBottom = '20px';

        const okButton = document.createElement('button');
        okButton.className = 'zen-pomodoro-dialog-button';
        okButton.textContent = 'OK';
        okButton.addEventListener('click', () => {
          errorDialog.remove();
        });

        errorDialog.appendChild(title);
        errorDialog.appendChild(message);
        errorDialog.appendChild(okButton);

        applyLastDialogPosition(errorDialog);
        document.documentElement.appendChild(errorDialog);
        return;
      }

      this.currentEditingCycle.blocks.splice(index, 1);
      logger.log(LOG_CATEGORIES.MENU, `Removed block at index ${index}`);
      
      // Re-render blocks
      const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
      if (blocksContainer) {
        this._renderBlocks(blocksContainer);
      }
    }

    /**
     * Reorder blocks by moving a block from one index to another.
     * @param {number} fromIndex - Source index
     * @param {number} toIndex - Target index
     */
    reorderBlocks(fromIndex, toIndex) {
      if (fromIndex === toIndex) return;

      const block = this.currentEditingCycle.blocks[fromIndex];
      this.currentEditingCycle.blocks.splice(fromIndex, 1);
      // Adjust target index: after removing the block at fromIndex,
      // all indices above it shift down by 1
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      this.currentEditingCycle.blocks.splice(adjustedIndex, 0, block);
      
      logger.log(LOG_CATEGORIES.MENU, `Reordered block from ${fromIndex} to ${adjustedIndex}`);
      
      // Re-render blocks to update indices
      const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
      if (blocksContainer) {
        this._renderBlocks(blocksContainer);
      }
    }

    /**
     * Validate the current editing cycle.
     * @returns {boolean} True if valid
     * @private
     */
    _validateCycle() {
      if (!this.currentEditingCycle.name || this.currentEditingCycle.name.trim() === '') {
        this._showValidationError('Please enter a name for the cycle.');
        return false;
      }

      if (this.currentEditingCycle.blocks.length === 0) {
        this._showValidationError('A cycle must have at least one block.');
        return false;
      }

      // Check that all blocks have valid durations
      for (const block of this.currentEditingCycle.blocks) {
        if (!isValidRangeValue(block.duration, 1, 120)) {
          this._showValidationError('All blocks must have a duration between 1 and 120 minutes.');
          return false;
        }
      }

      return true;
    }

    /**
     * Show a validation error dialog.
     * @param {string} message - Error message
     * @private
     */
    _showValidationError(message) {
      const errorDialog = document.createElement('div');
      errorDialog.className = 'zen-pomodoro-dialog active';
      errorDialog.setAttribute(DATA_NO_POSITION_SAVE, 'true');

      const title = document.createElement('h2');
      title.textContent = 'Validation Error';

      const messageP = document.createElement('p');
      messageP.textContent = message;
      messageP.style.marginBottom = '20px';

      const okButton = document.createElement('button');
      okButton.className = 'zen-pomodoro-dialog-button';
      okButton.textContent = 'OK';
      okButton.addEventListener('click', () => {
        errorDialog.remove();
      });

      errorDialog.appendChild(title);
      errorDialog.appendChild(messageP);
      errorDialog.appendChild(okButton);

      applyLastDialogPosition(errorDialog);
      document.documentElement.appendChild(errorDialog);
    }

    /**
     * Save the current editing cycle.
     */
    saveCycle() {
      const config = getConfig();
      const savedCycles = config.customCycles || [];
      
      // Find if cycle already exists
      const existingIndex = savedCycles.findIndex((c) => c.id === this.currentEditingCycle.id);
      
      if (existingIndex !== -1) {
        // Update existing cycle
        savedCycles[existingIndex] = this.currentEditingCycle;
        logger.log(LOG_CATEGORIES.MENU, `Updated custom cycle: ${this.currentEditingCycle.name}`);
      } else {
        // Add new cycle
        savedCycles.push(this.currentEditingCycle);
        logger.log(LOG_CATEGORIES.MENU, `Created new custom cycle: ${this.currentEditingCycle.name}`);
      }
      
      config.customCycles = savedCycles;
      saveConfig(config);
      
      this.currentEditingCycle = null;
    }

    /**
     * Delete a saved cycle.
     * @param {string} cycleId - ID of cycle to delete
     */
    deleteCycle(cycleId) {
      const config = getConfig();
      const savedCycles = config.customCycles || [];
      
      const index = savedCycles.findIndex((c) => c.id === cycleId);
      if (index !== -1) {
        const cycleName = savedCycles[index].name;
        savedCycles.splice(index, 1);
        config.customCycles = savedCycles;
        saveConfig(config);
        logger.log(LOG_CATEGORIES.MENU, `Deleted custom cycle: ${cycleName}`);
      }
    }

    /**
     * Get all saved custom cycles.
     * @returns {Array} Array of saved cycles
     */
    getSavedCycles() {
      const config = getConfig();
      return config.customCycles || [];
    }

    /**
     * Generate a unique ID for a new cycle.
     * @returns {string} Unique cycle ID
     * @private
     */
    _generateCycleId() {
      return `cycle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  // ============================================
  // Main Application Class
  // ============================================

  class ZenPomodoroApp {
    constructor() {
      this.timer = new PomodoroTimer();
      this.windowSync = new WindowSyncManager(); // Cross-window timer sync
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

      // CROSS-WINDOW SYNC: Initialize sync manager and log sync
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

      // Migrate global blockedWorkspaces to default ruleset if needed
      this._migrateBlockedWorkspacesToRulesets();

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

      // Try to restore timer state
      const restored = this.timer.loadState();
      if (restored) {
        // CROSS-WINDOW SYNC: Check if another window is actively managing the timer
        const isAnotherWindowActive = this.windowSync.isAnotherWindowActive();

        if (isAnotherWindowActive) {
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
        } else {
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

          // Restore distraction dump state if it was active
          if (this.timer.pendingDumpState) {
            const dumpRestored = this.distractionDump.restoreState(this.timer.pendingDumpState);
            if (dumpRestored) {
              logger.log(LOG_CATEGORIES.INIT, 'Distraction dump state restored');
              // Re-enable dump mode (pause timer, lift blocks)
              this.distractionDump._enableDumpMode();
              this.distractionDump._setupDumpIndicator();
              // Restart the dump countdown
              this.distractionDump.dumpInterval = setInterval(() => {
                this.distractionDump.dumpTimeRemaining--;
                this.distractionDump._updateDisplay(this.distractionDump.dumpTimeRemaining);
                if (this.distractionDump.dumpTimeRemaining <= 0) {
                  this.distractionDump.endDump();
                }
              }, 1000);
            }
            this.timer.pendingDumpState = null;
          }

          // If restored into transition phase, show the popup
          if (this.timer.currentPhase === 'transition') {
            this.transitionManager.showTransitionPopup();
          }

          // AUTO-PAUSE FIX: Show notification that timer was paused
          // POPUP FIX: Only show restoration notification in main browser window, not popups
          if (this.timer.restoredFromRestart && !isPopupWindow()) {
            setTimeout(() => {
              this.showRestorationNotification();
            }, RESTORATION_NOTIFICATION_DELAY_MS);
            this.timer.restoredFromRestart = false;
          } else if (this.timer.restoredFromRestart) {
            logger.log(LOG_CATEGORIES.INIT, 'Skipping restoration notification in popup window');
            this.timer.restoredFromRestart = false;
          }
        }
      }

      // MISSING FEATURE: Request notification permission
      this.requestNotificationPermission();

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
      if (syncState.dumpActive === undefined || !this.websiteBlocker) return;
      const wasInDump = this.distractionDump?.isActive || false;
      if (syncState.dumpActive && !wasInDump) {
        this.websiteBlocker.distractionDumpActive = true;
      } else if (!syncState.dumpActive && wasInDump) {
        this.websiteBlocker.distractionDumpActive = false;
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
        this.timer.stop();
      }
      if (this.security && typeof this.security.cleanupLockScreen === 'function') {
        this.security.cleanupLockScreen();
      }
    }
  }

  // ============================================
  // Initialize Application
  // ============================================

  // Create and store the app instance for cleanup
  const app = new ZenPomodoroApp();

  // TIMER STATE PERSISTENCE FIX: Save timer state before browser closes
  // This ensures state is saved even on sudden browser/PC shutdown
  window.addEventListener(
    'beforeunload',
    () => {
      if (app?.timer?.isActive) {
        app.timer.saveState();
        logger.log(LOG_CATEGORIES.TIMER, 'Timer state saved before browser close');
      }
      // CROSS-WINDOW SYNC: Release ownership so other windows can take over
      if (app?.windowSync) {
        app.windowSync.releaseOwnership();
      }
    }
  );

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
