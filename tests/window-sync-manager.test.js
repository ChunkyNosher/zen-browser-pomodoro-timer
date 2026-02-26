import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { clearMockPrefs, setMockPref } from './setup.js';
import WindowSyncManager from '../src/window-sync-manager.js';
import Constants from '../src/constants.js';

/**
 * Create a mock storage object for testing WindowSyncManager.
 * @returns {Object} Mock storage with getPref/setPref methods
 */
function createMockStorage() {
  const prefs = new Map();
  return {
    getPref: vi.fn((key, defaultValue) => prefs.get(key) ?? defaultValue),
    setPref: vi.fn((key, value) => prefs.set(key, value)),
    _prefs: prefs,
  };
}

describe('WindowSyncManager', () => {
  let manager;
  let mockStorage;
  let scopeId;

  beforeEach(() => {
    clearMockPrefs();
    vi.useFakeTimers();
    manager = new WindowSyncManager();
    mockStorage = createMockStorage();
    manager.setStorage(mockStorage);
    scopeId = manager._ensureProfileScopeId();
    mockStorage.setPref.mockClear();
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with unique windowId', () => {
      expect(manager.windowId).toBeDefined();
      expect(typeof manager.windowId).toBe('string');
      expect(manager.windowId.length).toBeGreaterThan(0);
    });

    it('should initialize with isTimerOwner false', () => {
      expect(manager.isTimerOwner).toBe(false);
    });

    it('should initialize with null _prefObserver', () => {
      expect(manager._prefObserver).toBeNull();
    });

    it('should initialize with null _heartbeatCheckInterval', () => {
      expect(manager._heartbeatCheckInterval).toBeNull();
    });

    it('should initialize with null callbacks', () => {
      expect(manager.onSyncStateChanged).toBeNull();
      expect(manager.onOwnershipLost).toBeNull();
      expect(manager.onOwnershipTaken).toBeNull();
    });

    it('should initialize with null _storage', () => {
      const newManager = new WindowSyncManager();
      expect(newManager._storage).toBeNull();
      newManager.destroy();
    });

    it('should generate different windowIds for multiple instances', () => {
      const manager1 = new WindowSyncManager();
      const manager2 = new WindowSyncManager();
      expect(manager1.windowId).not.toBe(manager2.windowId);
      manager1.destroy();
      manager2.destroy();
    });
  });

  describe('setStorage', () => {
    it('should set storage reference', () => {
      const newManager = new WindowSyncManager();
      const storage = createMockStorage();
      newManager.setStorage(storage);
      expect(newManager._storage).toBe(storage);
      newManager.destroy();
    });

    it('should allow changing storage reference', () => {
      const storage1 = createMockStorage();
      const storage2 = createMockStorage();
      manager.setStorage(storage1);
      expect(manager._storage).toBe(storage1);
      manager.setStorage(storage2);
      expect(manager._storage).toBe(storage2);
    });
  });

  describe('profile scope isolation', () => {
    it('should persist and reuse profile scope ID across manager instances', () => {
      const firstScope = manager._ensureProfileScopeId();
      const anotherManager = new WindowSyncManager();
      anotherManager.setStorage(mockStorage);
      const secondScope = anotherManager._ensureProfileScopeId();

      expect(secondScope).toBe(firstScope);
      expect(mockStorage._prefs.get(Constants.PROFILE_SCOPE_PREF_KEY)).toBe(firstScope);

      anotherManager.destroy();
    });
  });

  describe('init', () => {
    it('should set up pref observer', () => {
      const addObserverSpy = vi.spyOn(Services.prefs, 'addObserver');
      manager.init();
      expect(manager._prefObserver).not.toBeNull();
      expect(addObserverSpy).toHaveBeenCalledWith(
        `${Constants.PREF_PREFIX}.`,
        manager._prefObserver
      );
    });

    it('should create pref observer with observe method', () => {
      manager.init();
      expect(manager._prefObserver).toBeDefined();
      expect(typeof manager._prefObserver.observe).toBe('function');
    });
  });

  describe('isAnotherWindowActive', () => {
    beforeEach(() => {
      manager.setStorage(mockStorage);
    });

    it('should return false when no storage is set', () => {
      manager.setStorage(null);
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return false when no owner pref is set', () => {
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return false when owner is same window', () => {
      const ownerData = {
        id: manager.windowId,
        scopeId,
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return false when owner heartbeat is stale', () => {
      const ownerData = {
        id: 'other-window-id',
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS - 1000,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return true when another window has fresh heartbeat', () => {
      const ownerData = {
        id: 'other-window-id',
        scopeId,
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager.isAnotherWindowActive()).toBe(true);
    });

    it('should return true when heartbeat is at threshold boundary', () => {
      const ownerData = {
        id: 'other-window-id',
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS + 1000,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager.isAnotherWindowActive()).toBe(true);
    });

    it('should return false when owner pref is not valid JSON', () => {
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, 'invalid-json');
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return false when owner pref is empty string', () => {
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, '');
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return false for owner payload from another profile scope', () => {
      const ownerData = {
        id: 'other-window-id',
        scopeId: 'foreign-scope',
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager.isAnotherWindowActive()).toBe(false);
    });

    it('should return false for malformed owner payload missing heartbeat', () => {
      const ownerData = {
        id: 'other-window-id',
        scopeId,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager.isAnotherWindowActive()).toBe(false);
    });
  });

  describe('claimOwnership', () => {
    it('should set isTimerOwner to true', () => {
      manager.claimOwnership();
      expect(manager.isTimerOwner).toBe(true);
    });

    it('should write ownership to pref', () => {
      manager.claimOwnership();
      expect(mockStorage.setPref).toHaveBeenCalled();
      const ownerData = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(ownerData.id).toBe(manager.windowId);
      expect(ownerData.scopeId).toBe(scopeId);
      expect(ownerData.heartbeat).toBeGreaterThan(0);
    });

    it('should stop heartbeat monitor', () => {
      manager.startHeartbeatMonitor();
      expect(manager._heartbeatCheckInterval).not.toBeNull();
      manager.claimOwnership();
      expect(manager._heartbeatCheckInterval).toBeNull();
    });

    it('should write heartbeat timestamp', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      manager.claimOwnership();
      const ownerData = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(ownerData.heartbeat).toBe(now);
    });
  });

  describe('releaseOwnership', () => {
    it('should do nothing when not owner', () => {
      manager.isTimerOwner = false;
      manager.releaseOwnership();
      expect(mockStorage.setPref).not.toHaveBeenCalled();
    });

    it('should do nothing when no storage is set', () => {
      manager.isTimerOwner = true;
      manager.setStorage(null);
      manager.releaseOwnership();
      expect(mockStorage.setPref).not.toHaveBeenCalled();
    });

    it('should set isTimerOwner to false when owner', () => {
      manager.isTimerOwner = true;
      manager.releaseOwnership();
      expect(manager.isTimerOwner).toBe(false);
    });

    it('should clear owner pref when this window is the registered owner', () => {
      manager.claimOwnership();
      manager.releaseOwnership();
      expect(mockStorage._prefs.get(Constants.OWNER_PREF_KEY)).toBe('');
    });

    it('should not clear owner pref when another window is the registered owner', () => {
      const otherOwnerData = {
        id: 'other-window-id',
        scopeId,
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(otherOwnerData));
      manager.isTimerOwner = true;
      manager.releaseOwnership();
      expect(mockStorage._prefs.get(Constants.OWNER_PREF_KEY)).toBe(
        JSON.stringify(otherOwnerData)
      );
    });

    it('should handle invalid JSON in owner pref gracefully', () => {
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, 'invalid-json');
      manager.isTimerOwner = true;
      expect(() => manager.releaseOwnership()).not.toThrow();
      expect(manager.isTimerOwner).toBe(false);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat when owner', () => {
      manager.claimOwnership();
      mockStorage.setPref.mockClear();
      const now = Date.now();
      vi.setSystemTime(now);
      manager.updateHeartbeat();
      expect(mockStorage.setPref).toHaveBeenCalled();
      const ownerData = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(ownerData.heartbeat).toBe(now);
    });

    it('should not update heartbeat when not owner', () => {
      manager.isTimerOwner = false;
      mockStorage.setPref.mockClear();
      manager.updateHeartbeat();
      expect(mockStorage.setPref).not.toHaveBeenCalled();
    });

    it('should update heartbeat with current timestamp', () => {
      manager.claimOwnership();
      const time1 = Date.now();
      vi.setSystemTime(time1);
      manager.updateHeartbeat();
      const data1 = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(data1.heartbeat).toBe(time1);

      const time2 = Date.now() + 5000;
      vi.setSystemTime(time2);
      manager.updateHeartbeat();
      const data2 = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(data2.heartbeat).toBe(time2);
    });
  });

  describe('writeSyncState', () => {
    it('should write sync state with ownerId and timestamp', () => {
      const timerState = {
        isActive: true,
        remainingTime: 1500,
        currentPhase: 'focus',
        isPaused: false,
      };
      const now = Date.now();
      vi.setSystemTime(now);
      manager.writeSyncState(timerState);

      const syncData = JSON.parse(mockStorage._prefs.get(Constants.SYNC_PREF_KEY));
      expect(syncData.ownerId).toBe(manager.windowId);
      expect(syncData.scopeId).toBe(scopeId);
      expect(syncData.timestamp).toBe(now);
      expect(syncData.isActive).toBe(true);
      expect(syncData.remainingTime).toBe(1500);
      expect(syncData.currentPhase).toBe('focus');
      expect(syncData.isPaused).toBe(false);
    });

    it('should merge timer state with ownerId and timestamp', () => {
      const timerState = { phase: 'break', time: 300 };
      manager.writeSyncState(timerState);
      const syncData = JSON.parse(mockStorage._prefs.get(Constants.SYNC_PREF_KEY));
      expect(syncData.ownerId).toBe(manager.windowId);
      expect(syncData.scopeId).toBe(scopeId);
      expect(syncData.timestamp).toBeDefined();
      expect(syncData.phase).toBe('break');
      expect(syncData.time).toBe(300);
    });

    it('should not mutate original timer state', () => {
      const timerState = { isActive: true };
      const originalState = { ...timerState };
      manager.writeSyncState(timerState);
      expect(timerState).toEqual(originalState);
      expect(timerState.ownerId).toBeUndefined();
      expect(timerState.timestamp).toBeUndefined();
    });
  });

  describe('readSyncState', () => {
    it('should return null when no storage is set', () => {
      manager.setStorage(null);
      expect(manager.readSyncState()).toBeNull();
    });

    it('should return null when no sync pref is set', () => {
      expect(manager.readSyncState()).toBeNull();
    });

    it('should return parsed sync state', () => {
      const syncData = {
        ownerId: 'test-window',
        scopeId,
        timestamp: Date.now(),
        isActive: true,
        remainingTime: 1200,
      };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      const result = manager.readSyncState();
      expect(result).toEqual(syncData);
    });

    it('should return null for invalid JSON', () => {
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, 'invalid-json');
      expect(manager.readSyncState()).toBeNull();
    });

    it('should return null for empty string', () => {
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, '');
      expect(manager.readSyncState()).toBeNull();
    });

    it('should return null for sync state from another profile scope', () => {
      const syncData = {
        ownerId: 'test-window',
        scopeId: 'foreign-scope',
        timestamp: Date.now(),
        isActive: true,
      };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      expect(manager.readSyncState()).toBeNull();
    });
  });

  describe('clearSyncState', () => {
    it('should clear both sync and owner prefs', () => {
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, 'sync-data');
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, 'owner-data');
      manager.clearSyncState();
      expect(mockStorage._prefs.get(Constants.SYNC_PREF_KEY)).toBe('');
      expect(mockStorage._prefs.get(Constants.OWNER_PREF_KEY)).toBe('');
    });

    it('should do nothing when no storage is set', () => {
      manager.setStorage(null);
      expect(() => manager.clearSyncState()).not.toThrow();
    });

    it('should call setPref with empty strings', () => {
      manager.clearSyncState();
      expect(mockStorage.setPref).toHaveBeenCalledWith(Constants.SYNC_PREF_KEY, '');
      expect(mockStorage.setPref).toHaveBeenCalledWith(Constants.OWNER_PREF_KEY, '');
    });
  });

  describe('startHeartbeatMonitor', () => {
    it('should start heartbeat check interval', () => {
      manager.startHeartbeatMonitor();
      expect(manager._heartbeatCheckInterval).not.toBeNull();
    });

    it('should not start multiple intervals', () => {
      manager.startHeartbeatMonitor();
      const firstInterval = manager._heartbeatCheckInterval;
      manager.startHeartbeatMonitor();
      expect(manager._heartbeatCheckInterval).toBe(firstInterval);
    });

    it('should call _checkOwnerHeartbeat periodically', () => {
      const checkSpy = vi.spyOn(manager, '_checkOwnerHeartbeat');
      manager.startHeartbeatMonitor();

      expect(checkSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(Constants.HEARTBEAT_CHECK_INTERVAL_MS);
      expect(checkSpy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(Constants.HEARTBEAT_CHECK_INTERVAL_MS);
      expect(checkSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopHeartbeatMonitor', () => {
    it('should clear heartbeat check interval', () => {
      manager.startHeartbeatMonitor();
      manager.stopHeartbeatMonitor();
      expect(manager._heartbeatCheckInterval).toBeNull();
    });

    it('should do nothing when no interval is running', () => {
      expect(() => manager.stopHeartbeatMonitor()).not.toThrow();
      expect(manager._heartbeatCheckInterval).toBeNull();
    });

    it('should stop periodic calls to _checkOwnerHeartbeat', () => {
      const checkSpy = vi.spyOn(manager, '_checkOwnerHeartbeat');
      manager.startHeartbeatMonitor();
      manager.stopHeartbeatMonitor();

      vi.advanceTimersByTime(Constants.HEARTBEAT_CHECK_INTERVAL_MS * 3);
      expect(checkSpy).not.toHaveBeenCalled();
    });
  });

  describe('_checkOwnerHeartbeat', () => {
    it('should do nothing when this window is owner', () => {
      manager.claimOwnership();
      const takeOverSpy = vi.spyOn(manager, '_takeOverFromDeadOwner');
      manager._checkOwnerHeartbeat();
      expect(takeOverSpy).not.toHaveBeenCalled();
    });

    it('should do nothing when no storage is set', () => {
      manager.setStorage(null);
      const takeOverSpy = vi.spyOn(manager, '_takeOverFromDeadOwner');
      manager._checkOwnerHeartbeat();
      expect(takeOverSpy).not.toHaveBeenCalled();
    });

    it('should do nothing when no sync state exists', () => {
      const takeOverSpy = vi.spyOn(manager, '_takeOverFromDeadOwner');
      manager._checkOwnerHeartbeat();
      expect(takeOverSpy).not.toHaveBeenCalled();
    });

    it('should do nothing when timer is not active', () => {
      const syncData = { isActive: false, remainingTime: 1000 };
      syncData.scopeId = scopeId;
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      const takeOverSpy = vi.spyOn(manager, '_takeOverFromDeadOwner');
      manager._checkOwnerHeartbeat();
      expect(takeOverSpy).not.toHaveBeenCalled();
    });

    it('should take over when owner heartbeat is stale', () => {
      const syncData = {
        isActive: true,
        scopeId,
        remainingTime: 1000,
        currentPhase: 'focus',
        timestamp: Date.now(),
      };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));

      const staleOwnerData = {
        id: 'other-window',
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS - 1000,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(staleOwnerData));

      const takeOverSpy = vi.spyOn(manager, '_takeOverFromDeadOwner');
      manager._checkOwnerHeartbeat();
      expect(takeOverSpy).toHaveBeenCalledWith(syncData);
    });

    it('should not take over when owner heartbeat is fresh', () => {
      const syncData = { isActive: true, scopeId, remainingTime: 1000 };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));

      const freshOwnerData = {
        id: 'other-window',
        scopeId,
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(freshOwnerData));

      const takeOverSpy = vi.spyOn(manager, '_takeOverFromDeadOwner');
      manager._checkOwnerHeartbeat();
      expect(takeOverSpy).not.toHaveBeenCalled();
    });
  });

  describe('_isOwnerHeartbeatStale', () => {
    it('should return true when no owner pref exists', () => {
      expect(manager._isOwnerHeartbeatStale()).toBe(true);
    });

    it('should return false when this window is the owner', () => {
      const ownerData = {
        id: manager.windowId,
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS - 1000,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager._isOwnerHeartbeatStale()).toBe(false);
    });

    it('should return true when owner heartbeat is stale', () => {
      const ownerData = {
        id: 'other-window',
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS - 1000,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager._isOwnerHeartbeatStale()).toBe(true);
    });

    it('should return false when owner heartbeat is fresh', () => {
      const ownerData = {
        id: 'other-window',
        scopeId,
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager._isOwnerHeartbeatStale()).toBe(false);
    });

    it('should return true when owner heartbeat is exactly at timeout', () => {
      const ownerData = {
        id: 'other-window',
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager._isOwnerHeartbeatStale()).toBe(true);
    });

    it('should return false when owner heartbeat is just before timeout', () => {
      const ownerData = {
        id: 'other-window',
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS + 1,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager._isOwnerHeartbeatStale()).toBe(false);
    });

    it('should return true when owner pref has invalid JSON', () => {
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, 'invalid-json');
      // Invalid/foreign owner payloads are treated as missing owner so takeover can proceed.
      expect(manager._isOwnerHeartbeatStale()).toBe(true);
    });

    it('should return true when owner pref is empty string', () => {
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, '');
      expect(manager._isOwnerHeartbeatStale()).toBe(true);
    });

    it('should return true when owner payload is from another profile scope', () => {
      const ownerData = {
        id: 'other-window',
        scopeId: 'foreign-scope',
        heartbeat: Date.now(),
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      expect(manager._isOwnerHeartbeatStale()).toBe(true);
    });
  });

  describe('_takeOverFromDeadOwner', () => {
    it('should claim ownership', () => {
      const syncState = { remainingTime: 1000, currentPhase: 'focus' };
      manager._takeOverFromDeadOwner(syncState);
      expect(manager.isTimerOwner).toBe(true);
    });

    it('should call onOwnershipTaken callback with adjusted state', () => {
      const callback = vi.fn();
      manager.onOwnershipTaken = callback;
      const syncState = {
        remainingTime: 1000,
        currentPhase: 'focus',
        isPaused: false,
        timestamp: Date.now() - 10000,
      };
      manager._takeOverFromDeadOwner(syncState);
      expect(callback).toHaveBeenCalledTimes(1);
      const adjustedState = callback.mock.calls[0][0];
      expect(adjustedState.remainingTime).toBeLessThanOrEqual(1000);
    });

    it('should adjust remaining time when not paused', () => {
      const callback = vi.fn();
      manager.onOwnershipTaken = callback;
      const now = Date.now();
      const syncState = {
        remainingTime: 1000,
        isPaused: false,
        timestamp: now - 10000, // 10 seconds ago
      };
      manager._takeOverFromDeadOwner(syncState);
      const adjustedState = callback.mock.calls[0][0];
      expect(adjustedState.remainingTime).toBe(990); // 1000 - 10
    });

    it('should not adjust remaining time when paused', () => {
      const callback = vi.fn();
      manager.onOwnershipTaken = callback;
      const syncState = {
        remainingTime: 1000,
        isPaused: true,
        timestamp: Date.now() - 10000,
      };
      manager._takeOverFromDeadOwner(syncState);
      const adjustedState = callback.mock.calls[0][0];
      expect(adjustedState.remainingTime).toBe(1000);
    });

    it('should cap elapsed time to heartbeat timeout', () => {
      const callback = vi.fn();
      manager.onOwnershipTaken = callback;
      const now = Date.now();
      const syncState = {
        remainingTime: 1000,
        isPaused: false,
        timestamp: now - 60000, // 60 seconds ago (exceeds 30s timeout)
      };
      manager._takeOverFromDeadOwner(syncState);
      const adjustedState = callback.mock.calls[0][0];
      const maxElapsed = Math.floor(Constants.OWNER_HEARTBEAT_TIMEOUT_MS / 1000);
      expect(adjustedState.remainingTime).toBe(1000 - maxElapsed); // 1000 - 30
    });

    it('should not allow negative remaining time', () => {
      const callback = vi.fn();
      manager.onOwnershipTaken = callback;
      const syncState = {
        remainingTime: 5,
        isPaused: false,
        timestamp: Date.now() - 10000,
      };
      manager._takeOverFromDeadOwner(syncState);
      const adjustedState = callback.mock.calls[0][0];
      expect(adjustedState.remainingTime).toBe(0);
    });

    it('should not mutate original sync state', () => {
      const syncState = {
        remainingTime: 1000,
        isPaused: false,
        timestamp: Date.now() - 10000,
      };
      const originalState = { ...syncState };
      manager._takeOverFromDeadOwner(syncState);
      expect(syncState).toEqual(originalState);
    });

    it('should handle missing timestamp gracefully', () => {
      const callback = vi.fn();
      manager.onOwnershipTaken = callback;
      const syncState = { remainingTime: 1000, isPaused: false };
      expect(() => manager._takeOverFromDeadOwner(syncState)).not.toThrow();
      const adjustedState = callback.mock.calls[0][0];
      expect(adjustedState.remainingTime).toBe(1000);
    });
  });

  describe('_handleSyncPrefChange', () => {
    beforeEach(() => {
      manager.init();
    });

    it('should do nothing when this window is owner', () => {
      manager.claimOwnership();
      const callback = vi.fn();
      manager.onSyncStateChanged = callback;

      const syncData = { ownerId: 'other-window', scopeId, isActive: true };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      manager._handleSyncPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when no sync state exists', () => {
      const callback = vi.fn();
      manager.onSyncStateChanged = callback;
      manager._handleSyncPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when sync state is from this window', () => {
      const callback = vi.fn();
      manager.onSyncStateChanged = callback;

      const syncData = { ownerId: manager.windowId, scopeId, isActive: true };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      manager._handleSyncPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should call onSyncStateChanged when sync state is from another window', () => {
      const callback = vi.fn();
      manager.onSyncStateChanged = callback;

      const syncData = {
        ownerId: 'other-window',
        scopeId,
        isActive: true,
        remainingTime: 1000,
      };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      manager._handleSyncPrefChange();
      expect(callback).toHaveBeenCalledWith(syncData);
    });

    it('should not call callback when callback is null', () => {
      manager.onSyncStateChanged = null;
      const syncData = { ownerId: 'other-window', scopeId, isActive: true };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      expect(() => manager._handleSyncPrefChange()).not.toThrow();
    });

    it('should ignore sync updates from another profile scope', () => {
      const callback = vi.fn();
      manager.onSyncStateChanged = callback;
      const syncData = { ownerId: 'other-window', scopeId: 'foreign-scope', isActive: true };
      mockStorage._prefs.set(Constants.SYNC_PREF_KEY, JSON.stringify(syncData));
      manager._handleSyncPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('_handleOwnerPrefChange', () => {
    beforeEach(() => {
      manager.init();
    });

    it('should do nothing when this window is not owner', () => {
      manager.isTimerOwner = false;
      const callback = vi.fn();
      manager.onOwnershipLost = callback;

      const ownerData = { id: 'other-window', scopeId, heartbeat: Date.now() };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(ownerData));
      manager._handleOwnerPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when no storage is set', () => {
      manager.isTimerOwner = true;
      manager.setStorage(null);
      const callback = vi.fn();
      manager.onOwnershipLost = callback;
      expect(() => manager._handleOwnerPrefChange()).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when no owner pref exists', () => {
      manager.isTimerOwner = true;
      const callback = vi.fn();
      manager.onOwnershipLost = callback;
      manager._handleOwnerPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when this window is still the owner', () => {
      manager.claimOwnership();
      const callback = vi.fn();
      manager.onOwnershipLost = callback;
      manager._handleOwnerPrefChange();
      expect(callback).not.toHaveBeenCalled();
      expect(manager.isTimerOwner).toBe(true);
    });

    it('should lose ownership when another window claims it', () => {
      manager.claimOwnership();
      const callback = vi.fn();
      manager.onOwnershipLost = callback;

      const newOwnerData = { id: 'other-window', scopeId, heartbeat: Date.now() };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(newOwnerData));
      manager._handleOwnerPrefChange();

      expect(manager.isTimerOwner).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid JSON in owner pref gracefully', () => {
      manager.isTimerOwner = true;
      const callback = vi.fn();
      manager.onOwnershipLost = callback;
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, 'invalid-json');
      expect(() => manager._handleOwnerPrefChange()).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not call callback when callback is null', () => {
      manager.claimOwnership();
      manager.onOwnershipLost = null;
      const newOwnerData = { id: 'other-window', scopeId, heartbeat: Date.now() };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(newOwnerData));
      expect(() => manager._handleOwnerPrefChange()).not.toThrow();
    });

    it('should ignore ownership changes from another profile scope', () => {
      manager.claimOwnership();
      const callback = vi.fn();
      manager.onOwnershipLost = callback;
      const newOwnerData = { id: 'other-window', scopeId: 'foreign-scope', heartbeat: Date.now() };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(newOwnerData));
      manager._handleOwnerPrefChange();
      expect(manager.isTimerOwner).toBe(true);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('reminder sync scope isolation', () => {
    it('should include profile scope ID in reminder payload writes', () => {
      manager.writeReminderSync({ action: 'timer-started' });
      const reminderData = JSON.parse(mockStorage._prefs.get(Constants.REMINDER_SYNC_PREF_KEY));
      expect(reminderData.scopeId).toBe(scopeId);
      expect(reminderData.windowId).toBe(manager.windowId);
    });

    it('should ignore reminder sync payloads from another profile scope', () => {
      const callback = vi.fn();
      manager.onReminderSyncChanged = callback;
      const reminderData = {
        windowId: 'other-window',
        scopeId: 'foreign-scope',
        action: 'timer-started',
        timestamp: Date.now(),
      };
      mockStorage._prefs.set(Constants.REMINDER_SYNC_PREF_KEY, JSON.stringify(reminderData));
      manager._handleReminderSyncPrefChange();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should stop heartbeat monitor', () => {
      manager.startHeartbeatMonitor();
      manager.destroy();
      expect(manager._heartbeatCheckInterval).toBeNull();
    });

    it('should remove pref observer', () => {
      const removeObserverSpy = vi.spyOn(Services.prefs, 'removeObserver');
      manager.init();
      const observer = manager._prefObserver;
      manager.destroy();
      expect(removeObserverSpy).toHaveBeenCalledWith(
        `${Constants.PREF_PREFIX}.`,
        observer
      );
      expect(manager._prefObserver).toBeNull();
    });

    it('should release ownership', () => {
      manager.claimOwnership();
      manager.destroy();
      expect(manager.isTimerOwner).toBe(false);
    });

    it('should handle missing pref observer gracefully', () => {
      manager._prefObserver = null;
      expect(() => manager.destroy()).not.toThrow();
    });

    it('should handle removeObserver errors gracefully', () => {
      manager.init();
      vi.spyOn(Services.prefs, 'removeObserver').mockImplementation(() => {
        throw new Error('Observer removal failed');
      });
      expect(() => manager.destroy()).not.toThrow();
      expect(manager._prefObserver).toBeNull();
    });

    it('should clean up all resources', () => {
      manager.init();
      manager.claimOwnership();
      manager.startHeartbeatMonitor();
      manager.destroy();

      expect(manager._heartbeatCheckInterval).toBeNull();
      expect(manager._prefObserver).toBeNull();
      expect(manager.isTimerOwner).toBe(false);
    });
  });

  describe('Pref Observer Integration', () => {
    it('should trigger _handleSyncPrefChange on sync pref change', () => {
      manager.init();
      const handleSpy = vi.spyOn(manager, '_handleSyncPrefChange');
      const fullSyncPref = `${Constants.PREF_PREFIX}.${Constants.SYNC_PREF_KEY}`;

      manager._prefObserver.observe(null, 'nsPref:changed', fullSyncPref);
      expect(handleSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger _handleOwnerPrefChange on owner pref change', () => {
      manager.init();
      const handleSpy = vi.spyOn(manager, '_handleOwnerPrefChange');
      const fullOwnerPref = `${Constants.PREF_PREFIX}.${Constants.OWNER_PREF_KEY}`;

      manager._prefObserver.observe(null, 'nsPref:changed', fullOwnerPref);
      expect(handleSpy).toHaveBeenCalledTimes(1);
    });

    it('should not trigger handlers for unrelated pref changes', () => {
      manager.init();
      const syncSpy = vi.spyOn(manager, '_handleSyncPrefChange');
      const ownerSpy = vi.spyOn(manager, '_handleOwnerPrefChange');
      const unrelatedPref = `${Constants.PREF_PREFIX}.unrelated-pref`;

      manager._prefObserver.observe(null, 'nsPref:changed', unrelatedPref);
      expect(syncSpy).not.toHaveBeenCalled();
      expect(ownerSpy).not.toHaveBeenCalled();
    });
  });

  describe('End-to-End Scenarios', () => {
    it('should allow window to claim ownership and write sync state', () => {
      manager.claimOwnership();
      const timerState = {
        isActive: true,
        remainingTime: 1500,
        currentPhase: 'focus',
      };
      manager.writeSyncState(timerState);

      const ownerData = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(ownerData.id).toBe(manager.windowId);
      expect(ownerData.scopeId).toBe(scopeId);

      const syncData = JSON.parse(mockStorage._prefs.get(Constants.SYNC_PREF_KEY));
      expect(syncData.ownerId).toBe(manager.windowId);
      expect(syncData.scopeId).toBe(scopeId);
      expect(syncData.remainingTime).toBe(1500);
    });

    it('should allow secondary window to read sync state from owner', () => {
      const ownerManager = new WindowSyncManager();
      ownerManager.setStorage(mockStorage);
      ownerManager.claimOwnership();

      const timerState = { isActive: true, remainingTime: 1000 };
      ownerManager.writeSyncState(timerState);

      const secondaryManager = new WindowSyncManager();
      secondaryManager.setStorage(mockStorage);
      const syncState = secondaryManager.readSyncState();

      expect(syncState.ownerId).toBe(ownerManager.windowId);
      expect(syncState.remainingTime).toBe(1000);

      ownerManager.destroy();
      secondaryManager.destroy();
    });

    it('should transfer ownership when current owner releases', () => {
      const owner1 = new WindowSyncManager();
      owner1.setStorage(mockStorage);
      owner1.claimOwnership();

      const owner2 = new WindowSyncManager();
      owner2.setStorage(mockStorage);

      expect(owner2.isAnotherWindowActive()).toBe(true);

      owner1.releaseOwnership();
      owner2.claimOwnership();

      const ownerData = JSON.parse(mockStorage._prefs.get(Constants.OWNER_PREF_KEY));
      expect(ownerData.id).toBe(owner2.windowId);

      owner1.destroy();
      owner2.destroy();
    });

    it('should detect and take over from dead owner window', () => {
      const deadOwner = new WindowSyncManager();
      deadOwner.setStorage(mockStorage);
      deadOwner.claimOwnership();

      const timerState = {
        isActive: true,
        scopeId,
        remainingTime: 1000,
        isPaused: false,
        timestamp: Date.now() - 10000,
      };
      deadOwner.writeSyncState(timerState);

      // Simulate dead owner by making heartbeat stale
      const staleOwnerData = {
        id: deadOwner.windowId,
        scopeId,
        heartbeat: Date.now() - Constants.OWNER_HEARTBEAT_TIMEOUT_MS - 1000,
      };
      mockStorage._prefs.set(Constants.OWNER_PREF_KEY, JSON.stringify(staleOwnerData));

      const secondaryManager = new WindowSyncManager();
      secondaryManager.setStorage(mockStorage);
      const takeoverCallback = vi.fn();
      secondaryManager.onOwnershipTaken = takeoverCallback;

      secondaryManager._checkOwnerHeartbeat();

      expect(secondaryManager.isTimerOwner).toBe(true);
      expect(takeoverCallback).toHaveBeenCalled();

      deadOwner.destroy();
      secondaryManager.destroy();
    });
  });
});
