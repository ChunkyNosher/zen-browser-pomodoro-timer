/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DistractionDumpManager from '../src/distraction-dump-manager.js';

// Mock logger
vi.mock('../src/log-manager.js', () => ({
  logger: {
    log: vi.fn(),
  },
}));

// Mock helpers
vi.mock('../src/helpers.js', () => ({
  getConfig: vi.fn(),
  LOG_CATEGORIES: {
    TIMER: 'TIMER',
  },
}));

import { getConfig } from '../src/helpers.js';

describe('DistractionDumpManager', () => {
  let dumpManager;
  let mockTimer;
  let mockOverlay;
  let mockWebsiteBlocker;
  let mockConfig;

  beforeEach(() => {
    // Reset DOM
    document.documentElement.innerHTML = '';

    // Reset all mocks
    vi.clearAllMocks();

    // Mock setInterval/clearInterval
    vi.useFakeTimers();

    // Create mock objects
    mockTimer = {
      isActive: true,
      isPaused: false,
      currentPhase: 'focus',
      remainingTime: 1500,
      pause: vi.fn(),
      resume: vi.fn(),
    };

    mockOverlay = {
      hide: vi.fn(),
      showDumpIndicator: vi.fn(),
      updateDumpIndicator: vi.fn(),
      hideDumpIndicator: vi.fn(),
      indicator: document.createElement('div'),
      indicatorDidDrag: false,
    };

    mockWebsiteBlocker = {
      distractionDumpActive: false,
      _checkCurrentPage: vi.fn(),
    };

    mockConfig = {
      distractionDumpEnabled: true,
      distractionDumpDuration: 25,
      distractionDumpMaxDuration: 35,
    };

    // Setup getConfig mock
    getConfig.mockReturnValue(mockConfig);

    // Setup global mocks
    global.window = {
      zenPomodoroApp: {
        timer: mockTimer,
        overlay: mockOverlay,
        websiteBlocker: mockWebsiteBlocker,
        updateOverlayVisibility: vi.fn(),
        _claimOwnershipForAction: vi.fn(),
      },
    };

    // Create fresh instance
    dumpManager = new DistractionDumpManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('startDump', () => {
    it('should start dump using configured duration', () => {
      dumpManager.startDump();

      expect(dumpManager.isActive).toBe(true);
      expect(dumpManager.dumpUsedThisFocusPhase).toBe(true);
      expect(dumpManager.dumpTimeRemaining).toBe(mockConfig.distractionDumpDuration * 60);
      expect(mockTimer.pause).toHaveBeenCalled();
      expect(mockWebsiteBlocker.distractionDumpActive).toBe(true);
    });

    it('should not start dump if feature is disabled', () => {
      mockConfig.distractionDumpEnabled = false;

      dumpManager.startDump();

      expect(mockTimer.pause).not.toHaveBeenCalled();
      expect(dumpManager.isActive).toBe(false);
    });

    it('should not start dump if already active', () => {
      dumpManager.isActive = true;

      dumpManager.startDump();

      expect(mockTimer.pause).not.toHaveBeenCalled();
    });

    it('should not start dump if already used in this focus phase', () => {
      dumpManager.dumpUsedThisFocusPhase = true;

      dumpManager.startDump();

      expect(mockTimer.pause).not.toHaveBeenCalled();
      expect(dumpManager.isActive).toBe(false);
    });

    it('should not start dump if timer is not active', () => {
      mockTimer.isActive = false;

      dumpManager.startDump();

      expect(mockTimer.pause).not.toHaveBeenCalled();
      expect(dumpManager.isActive).toBe(false);
    });

    it('should not start dump if not in focus phase', () => {
      mockTimer.currentPhase = 'break';

      dumpManager.startDump();

      expect(mockTimer.pause).not.toHaveBeenCalled();
      expect(dumpManager.isActive).toBe(false);
    });

    it('should save timer state before starting', () => {
      dumpManager.startDump();

      expect(dumpManager.savedTimerState).toEqual({
        remainingTime: mockTimer.remainingTime,
        isPaused: mockTimer.isPaused,
      });
    });

    it('should setup dump indicator', () => {
      dumpManager.startDump();

      expect(mockOverlay.showDumpIndicator).toHaveBeenCalledWith(
        mockConfig.distractionDumpDuration * 60
      );
    });

    it('should countdown and end dump when time expires', () => {
      dumpManager.startDump();

      // Fast-forward time to end of dump
      vi.advanceTimersByTime((mockConfig.distractionDumpDuration * 60 + 1) * 1000);

      expect(dumpManager.isActive).toBe(false);
      expect(mockOverlay.hideDumpIndicator).toHaveBeenCalled();
    });
  });

  describe('isDumpAvailable', () => {
    it('should return true when dump has not been used', () => {
      expect(dumpManager.isDumpAvailable()).toBe(true);
    });

    it('should return false when dump is already active', () => {
      dumpManager.isActive = true;
      expect(dumpManager.isDumpAvailable()).toBe(false);
    });

    it('should return false when dump was used this focus phase', () => {
      dumpManager.dumpUsedThisFocusPhase = true;
      expect(dumpManager.isDumpAvailable()).toBe(false);
    });
  });

  describe('resetForNewFocusPhase', () => {
    it('should reset dump usage flag', () => {
      dumpManager.dumpUsedThisFocusPhase = true;

      dumpManager.resetForNewFocusPhase();

      expect(dumpManager.dumpUsedThisFocusPhase).toBe(false);
    });
  });

  describe('endDump', () => {
    beforeEach(() => {
      dumpManager.startDump();
    });

    it('should restore website blocker', () => {
      dumpManager.endDump();

      expect(mockWebsiteBlocker.distractionDumpActive).toBe(false);
      expect(mockWebsiteBlocker._checkCurrentPage).toHaveBeenCalled();
    });

    it('should resume timer if it was not paused before dump', () => {
      // Simulate that timer is now paused (after startDump called pause)
      mockTimer.isPaused = true;
      
      dumpManager.endDump();

      expect(mockTimer.resume).toHaveBeenCalled();
    });

    it('should not resume timer if it was paused before dump', () => {
      mockTimer.isPaused = true;
      dumpManager.savedTimerState.isPaused = true;

      dumpManager.endDump();

      expect(mockTimer.resume).not.toHaveBeenCalled();
    });

    it('should clean up dump UI', () => {
      dumpManager.endDump();

      expect(mockOverlay.hideDumpIndicator).toHaveBeenCalled();
      expect(dumpManager.dumpIndicatorClickHandler).toBeNull();
      expect(dumpManager.isActive).toBe(false);
    });

    it('should claim ownership when ending dump', () => {
      const claimSpy = global.window.zenPomodoroApp._claimOwnershipForAction;
      
      dumpManager.endDump();

      expect(claimSpy).toHaveBeenCalled();
    });
  });

  describe('cross-window ownership', () => {
    it('should claim ownership when starting dump', () => {
      const claimSpy = global.window.zenPomodoroApp._claimOwnershipForAction;
      
      dumpManager.startDump();

      expect(claimSpy).toHaveBeenCalled();
      expect(dumpManager.isActive).toBe(true);
    });

    it('should claim ownership before ending dump', () => {
      const claimSpy = global.window.zenPomodoroApp._claimOwnershipForAction;
      
      // Start dump first
      dumpManager.startDump();
      claimSpy.mockClear(); // Clear the call from startDump
      
      // End dump
      dumpManager.endDump();

      expect(claimSpy).toHaveBeenCalled();
      expect(dumpManager.isActive).toBe(false);
    });

    it('should work correctly when _claimOwnershipForAction is not available', () => {
      // Recreate global.window without _claimOwnershipForAction
      global.window = {
        zenPomodoroApp: {
          timer: mockTimer,
          overlay: mockOverlay,
          websiteBlocker: mockWebsiteBlocker,
          updateOverlayVisibility: vi.fn(),
          // _claimOwnershipForAction intentionally omitted
        },
      };
      
      dumpManager.startDump();

      expect(dumpManager.isActive).toBe(true);
      expect(mockTimer.pause).toHaveBeenCalled();
    });
  });

  describe('state persistence', () => {
    it('should export state for persistence', () => {
      dumpManager.isActive = true;
      dumpManager.dumpTimeRemaining = 300;
      dumpManager.dumpUsedThisFocusPhase = true;
      dumpManager.savedTimerState = { remainingTime: 1500, isPaused: false };

      const state = dumpManager.getStateForPersistence();

      expect(state).toEqual({
        isActive: true,
        dumpTimeRemaining: 300,
        savedTimerState: { remainingTime: 1500, isPaused: false },
        dumpUsedThisFocusPhase: true,
      });
    });

    it('should restore state from persistence', () => {
      const state = {
        isActive: true,
        dumpTimeRemaining: 300,
        savedTimerState: { remainingTime: 1500, isPaused: false },
        dumpUsedThisFocusPhase: true,
      };

      const restored = dumpManager.restoreState(state);

      expect(restored).toBe(true);
      expect(dumpManager.isActive).toBe(true);
      expect(dumpManager.dumpTimeRemaining).toBe(300);
      expect(dumpManager.savedTimerState).toEqual({ remainingTime: 1500, isPaused: false });
      expect(dumpManager.dumpUsedThisFocusPhase).toBe(true);
    });

    it('should support countdown continuation after restore', () => {
      // Simulate crash recovery scenario
      const state = {
        isActive: true,
        dumpTimeRemaining: 60, // 1 minute remaining when browser crashed
        savedTimerState: { remainingTime: 1500, isPaused: false },
        dumpUsedThisFocusPhase: true,
      };

      dumpManager.restoreState(state);

      // Simulate app calling _enableDumpMode and _setupDumpIndicator (as in onReady)
      dumpManager._enableDumpMode();
      dumpManager._setupDumpIndicator();

      // Simulate app restarting countdown (as in onReady)
      dumpManager.dumpInterval = setInterval(() => {
        dumpManager.dumpTimeRemaining--;
        dumpManager._updateDisplay(dumpManager.dumpTimeRemaining);
        if (dumpManager.dumpTimeRemaining <= 0) {
          dumpManager.endDump();
        }
      }, 1000);

      // Verify countdown continues from restored time
      expect(dumpManager.dumpTimeRemaining).toBe(60);
      expect(dumpManager.isActive).toBe(true);

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(30000);
      expect(dumpManager.dumpTimeRemaining).toBe(30);
      expect(dumpManager.isActive).toBe(true);

      // Fast-forward to end
      vi.advanceTimersByTime(31000);
      expect(dumpManager.isActive).toBe(false);
      expect(mockOverlay.hideDumpIndicator).toHaveBeenCalled();
    });
  });
});
