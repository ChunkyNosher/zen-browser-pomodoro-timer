import Constants from './constants.js';

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
    this._storage = null; // Will be injected to avoid circular dependency
  }

  /**
   * Set the Storage module reference (dependency injection to avoid circular dependency).
   * @param {Object} storage - Storage module with getPref/setPref methods
   */
  setStorage(storage) {
    this._storage = storage;
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
          // Log parse errors to console (cannot use logger to avoid recursion)
          console.warn('[Zen Pomodoro] Log sync parse error:', e.message);
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
      // Log to console only (cannot use logger to avoid recursion)
      console.warn('[Zen Pomodoro] Log broadcast error:', e.message);
    }
  }

  /**
   * Request existing logs from other windows.
   * Called when a new window opens to get historical log entries.
   * Uses a temporary pref to exchange log data since Services.obs is synchronous.
   */
  requestExistingLogs() {
    if (!this.windowId || !this._storage) return;
    try {
      // Use per-request pref key to avoid race between multiple responders
      const prefKey = `shared-logs-${this.windowId}`;
      Services.obs.notifyObservers(null, Constants.LOG_REQUEST_TOPIC, this.windowId);
      const sharedLogsStr = this._storage.getPref(prefKey, '');
      if (sharedLogsStr) {
        this._mergeSharedLogs(JSON.parse(sharedLogsStr));
        // Clear after reading to prevent stale data
        this._storage.setPref(prefKey, '');
      }
    } catch (e) {
      console.warn('[Zen Pomodoro] Log request error:', e.message);
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
    if (!this._storage) return;
    try {
      const prefKey = `shared-logs-${requesterId}`;
      this._storage.setPref(prefKey, JSON.stringify(this.logs));
    } catch (e) {
      console.warn('[Zen Pomodoro] Log response error:', e.message);
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
        console.warn('[Zen Pomodoro] Failed to remove log observer:', e.message);
      }
      this._logObserver = null;
    }
    if (this._logRequestObserver) {
      try {
        Services.obs.removeObserver(this._logRequestObserver, Constants.LOG_REQUEST_TOPIC);
      } catch (e) {
        console.warn('[Zen Pomodoro] Failed to remove log request observer:', e.message);
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
    console.log(`[Zen Pomodoro][${entry.category}] ${entry.message}${dataStr}`);
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

export { LogManager, logger };
