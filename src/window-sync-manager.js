import Constants from './constants.js';
import { logger } from './log-manager.js';

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
    /** Callback: called when reminder sync is received from another window */
    this.onReminderSyncChanged = null;
    /** Storage module reference (injected to avoid circular dependency) */
    this._storage = null;
    /** Persistent profile scope id for cross-window isolation */
    this.profileScopeId = null;
  }

  /**
   * Set the Storage module reference (dependency injection to avoid circular dependency).
   * @param {Object} storage - Storage module with getPref/setPref methods
   */
  setStorage(storage) {
    this._storage = storage;
  }

  /**
   * Initialize the sync manager - set up pref observer for cross-window communication.
   */
  init() {
    this._ensureProfileScopeId();
    this._setupPrefObserver();
  }

  /**
   * Check if another window is currently actively managing the timer.
   * Uses heartbeat timestamp to determine if the owner is alive.
   * @returns {boolean} True if another window is the active timer owner
   */
  isAnotherWindowActive() {
    if (!this._storage) return false;
    const owner = this._readOwnerState();
    if (!owner || owner.id === this.windowId) return false;
    return Date.now() - owner.heartbeat < Constants.OWNER_HEARTBEAT_TIMEOUT_MS;
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
    if (!this.isTimerOwner || !this._storage) return;
    this.isTimerOwner = false;
    const owner = this._readOwnerState();
    if (owner && owner.id === this.windowId) {
      this._storage.setPref(Constants.OWNER_PREF_KEY, '');
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
    this._writePref(Constants.SYNC_PREF_KEY, {
      ownerId: this.windowId,
      scopeId: this._ensureProfileScopeId(),
      timestamp: Date.now(),
      ...timerState,
    });
  }

  /**
   * Read the current sync state from the pref.
   * @returns {Object|null} Parsed sync state or null
   */
  readSyncState() {
    if (!this._storage) return null;
    try {
      const syncStr = this._storage.getPref(Constants.SYNC_PREF_KEY, '');
      if (!syncStr) return null;
      const syncState = JSON.parse(syncStr);
      if (!this._isPayloadInScope(syncState)) return null;
      return syncState;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear all sync-related prefs (timer-sync and timer-owner).
   * Called when the timer is stopped.
   */
  clearSyncState() {
    if (!this._storage) return;
    this._storage.setPref(Constants.SYNC_PREF_KEY, '');
    this._storage.setPref(Constants.OWNER_PREF_KEY, '');
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
    this._writePref(Constants.OWNER_PREF_KEY, {
      id: this.windowId,
      scopeId: this._ensureProfileScopeId(),
      heartbeat: Date.now(),
    });
  }

  /**
   * Check if the current owner is still alive by checking heartbeat.
   * If the owner's heartbeat is stale, this secondary window takes over.
   * @private
   */
  _checkOwnerHeartbeat() {
    if (this.isTimerOwner || !this._storage) return;

    const syncState = this.readSyncState();
    if (!syncState || !syncState.isActive) return;

    if (this._isOwnerHeartbeatStale()) {
      this._takeOverFromDeadOwner(syncState);
    }
  }

  /**
   * Check if the owner's heartbeat is stale (missing or too old).
   * @returns {boolean} True if owner is missing or heartbeat is stale
   * @private
   */
  _isOwnerHeartbeatStale() {
    const owner = this._readOwnerState();
    if (!owner) {
      return true;
    }
    if (owner.id === this.windowId) {
      return false;
    }
    return Date.now() - owner.heartbeat >= Constants.OWNER_HEARTBEAT_TIMEOUT_MS;
  }

  /**
   * Write data to a preference key with timestamp.
   * @param {string} key - Preference key (without prefix)
   * @param {Object} data - Data object to serialize and store
   * @private
   */
  _writePref(key, data) {
    if (!this._storage) return;
    this._storage.setPref(key, JSON.stringify(data));
  }

  /**
   * Get or create the persistent profile scope ID used for cross-window isolation.
   * @returns {string|null} Profile scope ID, or null if storage is unavailable
   * @private
   */
  _ensureProfileScopeId() {
    if (this.profileScopeId) return this.profileScopeId;
    if (!this._storage) return null;
    try {
      const storedScopeId = this._storage.getPref(Constants.PROFILE_SCOPE_PREF_KEY, '');
      if (typeof storedScopeId === 'string' && storedScopeId) {
        this.profileScopeId = storedScopeId;
      } else {
        this.profileScopeId =
          typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : typeof Services?.uuid?.generateUUID === 'function'
              ? String(Services.uuid.generateUUID())
            : `scope-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this._storage.setPref(Constants.PROFILE_SCOPE_PREF_KEY, this.profileScopeId);
      }
      return this.profileScopeId;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check whether a sync/reminder payload belongs to this profile scope.
   * @param {Object} payload - Parsed payload object
   * @returns {boolean} True if payload is in current scope
   * @private
   */
  _isPayloadInScope(payload) {
    const scopeId = this._ensureProfileScopeId();
    return (
      payload &&
      typeof payload === 'object' &&
      typeof payload.scopeId === 'string' &&
      scopeId &&
      payload.scopeId === scopeId
    );
  }

  /**
   * Read and validate owner payload for this profile scope.
   * @returns {Object|null} Valid owner state or null
   * @private
   */
  _readOwnerState() {
    if (!this._storage) return null;
    try {
      const ownerStr = this._storage.getPref(Constants.OWNER_PREF_KEY, '');
      if (!ownerStr) return null;
      const owner = JSON.parse(ownerStr);
      if (!this._isPayloadInScope(owner)) return null;
      if (typeof owner.id !== 'string' || !owner.id) return null;
      if (!Number.isFinite(owner.heartbeat)) return null;
      return owner;
    } catch (e) {
      return null;
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
   * Watches for changes to timer-sync, timer-owner, and reminder-sync prefs.
   * @private
   */
  _setupPrefObserver() {
    const prefPrefix = Constants.PREF_PREFIX;
    const syncPrefFull = `${prefPrefix}.${Constants.SYNC_PREF_KEY}`;
    const ownerPrefFull = `${prefPrefix}.${Constants.OWNER_PREF_KEY}`;
    const reminderSyncPrefFull = `${prefPrefix}.${Constants.REMINDER_SYNC_PREF_KEY}`;
    this._prefObserver = {
      observe: (subject, topic, data) => {
        if (data === syncPrefFull) {
          this._handleSyncPrefChange();
        } else if (data === ownerPrefFull) {
          this._handleOwnerPrefChange();
        } else if (data === reminderSyncPrefFull) {
          this._handleReminderSyncPrefChange();
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
    if (!this.isTimerOwner || !this._storage) return;
    const owner = this._readOwnerState();
    if (!owner) return;
    if (owner.id !== this.windowId) {
      this.isTimerOwner = false;
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Lost timer ownership to another window', {
        newOwnerId: owner.id,
      });
      if (this.onOwnershipLost) {
        this.onOwnershipLost();
      }
    }
  }

  /**
   * Write reminder sync action to the reminder-sync pref for other windows to read.
   * @param {Object} actionData - Action data object (must contain 'action' property)
   */
  writeReminderSync(actionData) {
    // Validate actionData structure
    if (!actionData) {
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Invalid reminder sync - actionData is null/undefined');
      return;
    }
    if (typeof actionData !== 'object') {
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Invalid reminder sync - actionData is not an object', {
        type: typeof actionData,
      });
      return;
    }
    if (!actionData.action) {
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Invalid reminder sync - missing required action property', {
        actionData,
      });
      return;
    }
    if (typeof actionData.action !== 'string') {
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Invalid reminder sync - action must be a string', {
        action: actionData.action,
        type: typeof actionData.action,
      });
      return;
    }

    // Validate action value matches expected types
    const validActions = [
      'daily-dismissed',
      'daily-skipped',
      'post-session-dismissed',
      'post-session-skipped',
      'timer-started',
    ];
    if (!validActions.includes(actionData.action)) {
      logger.log(Constants.LOG_CATEGORIES.SYNC, 'Invalid reminder sync - unknown action type', {
        action: actionData.action,
        validActions,
      });
      return;
    }

    this._writePref(Constants.REMINDER_SYNC_PREF_KEY, {
      windowId: this.windowId,
      scopeId: this._ensureProfileScopeId(),
      timestamp: Date.now(),
      ...actionData,
    });
  }

  /**
   * Handle changes to the reminder-sync pref (reminder actions from other windows).
   * @private
   */
  _handleReminderSyncPrefChange() {
    if (!this._storage) return;
    try {
      const syncStr = this._storage.getPref(Constants.REMINDER_SYNC_PREF_KEY, '');
      if (!syncStr) return;
      const syncData = JSON.parse(syncStr);
      if (!this._isPayloadInScope(syncData)) return;
      // Ignore if the action came from this window
      if (syncData.windowId === this.windowId) return;
      if (this.onReminderSyncChanged) {
        this.onReminderSyncChanged(syncData);
      }
    } catch (e) {
      console.warn('Zen Pomodoro: Failed to parse reminder sync data', e);
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

export default WindowSyncManager;
