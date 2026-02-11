import { describe, it, expect, beforeEach, vi } from 'vitest';
import PomodoroTimer from '../src/pomodoro-timer.js';
import Constants from '../src/constants.js';

const { DEFAULT_CONFIG } = Constants;

// Mock window object
globalThis.window = {
  zenPomodoroApp: {
    windowSync: null,
    distractionDump: null,
  },
};

// Mock the dependencies
vi.mock('../src/storage.js', () => ({
  default: {
    loadConfig: vi.fn(() => ({ ...DEFAULT_CONFIG })),
    getPref: vi.fn(() => ''),
    setPref: vi.fn(),
    saveConfig: vi.fn(),
    clearState: vi.fn(),
  }
}));

vi.mock('../src/log-manager.js', () => ({
  logger: { 
    log: vi.fn(), 
    warn: vi.fn(), 
    error: vi.fn() 
  }
}));

vi.mock('../src/helpers.js', () => ({
  formatTime: vi.fn((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }),
  sendBrowserNotification: vi.fn(),
}));

describe('PomodoroTimer', () => {
  let timer;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Create new timer instance
    timer = new PomodoroTimer();
  });

  describe('Constructor', () => {
    it('should initialize with correct default values', () => {
      expect(timer.isActive).toBe(false);
      expect(timer.isPaused).toBe(false);
      expect(timer.pausedOnBlockedWorkspace).toBe(false);
      expect(timer.remainingTime).toBe(0);
      expect(timer.currentPhase).toBe('focus');
      expect(timer.currentCycle).toBe(1);
      expect(timer.totalCycles).toBe(4);
      expect(timer.mode).toBe('pomodoro');
      expect(timer.intervalId).toBeNull();
      expect(timer.tickCounter).toBe(0);
    });

    it('should load config from Storage', () => {
      expect(timer.config).toBeDefined();
      expect(timer.config.focusDuration).toBe(DEFAULT_CONFIG.focusDuration);
    });

    it('should initialize custom cycle properties', () => {
      expect(timer.customCycle).toBeNull();
      expect(timer.customCycleBlocks).toBeNull();
      expect(timer.currentBlockIndex).toBe(0);
    });

    it('should initialize callback properties as null', () => {
      expect(timer.onTick).toBeNull();
      expect(timer.onPhaseChange).toBeNull();
      expect(timer.onComplete).toBeNull();
    });

    it('should initialize reminder tracking set', () => {
      expect(timer.shownRemindersForCurrentPhase).toBeInstanceOf(Set);
      expect(timer.shownRemindersForCurrentPhase.size).toBe(0);
    });
  });

  describe('start() - Pomodoro Mode', () => {
    it('should set isActive to true', () => {
      timer.start('pomodoro', 4);
      expect(timer.isActive).toBe(true);
    });

    it('should set mode correctly', () => {
      timer.start('pomodoro', 4);
      expect(timer.mode).toBe('pomodoro');
    });

    it('should set totalCycles', () => {
      timer.start('pomodoro', 6);
      expect(timer.totalCycles).toBe(6);
    });

    it('should start from cycle 1', () => {
      timer.start('pomodoro', 4);
      expect(timer.currentCycle).toBe(1);
    });

    it('should start in focus phase', () => {
      timer.start('pomodoro', 4);
      expect(timer.currentPhase).toBe('focus');
    });

    it('should set remainingTime based on focusDuration', () => {
      timer.start('pomodoro', 4);
      expect(timer.remainingTime).toBe(DEFAULT_CONFIG.focusDuration * 60);
    });

    it('should reset isPaused to false', () => {
      timer.isPaused = true;
      timer.start('pomodoro', 4);
      expect(timer.isPaused).toBe(false);
    });

    it('should reset tickCounter', () => {
      timer.tickCounter = 99;
      timer.start('pomodoro', 4);
      expect(timer.tickCounter).toBe(0);
    });

    it('should clear shown reminders', () => {
      timer.shownRemindersForCurrentPhase.add(5);
      timer.start('pomodoro', 4);
      expect(timer.shownRemindersForCurrentPhase.size).toBe(0);
    });

    it('should store savedConfig', () => {
      timer.start('pomodoro', 4);
      expect(timer.savedConfig).toBeDefined();
      expect(timer.savedConfig.focusDuration).toBe(DEFAULT_CONFIG.focusDuration);
    });

    it('should apply session overrides to savedConfig', () => {
      timer.start('pomodoro', 4, { focusDuration: 30 });
      expect(timer.savedConfig.focusDuration).toBe(30);
      expect(timer.remainingTime).toBe(30 * 60);
    });

    it('should use default cycles if not specified', () => {
      timer.start('pomodoro');
      expect(timer.totalCycles).toBe(4);
    });
  });

  describe('start() - Simple Mode', () => {
    it('should set mode to simple', () => {
      timer.start('simple');
      expect(timer.mode).toBe('simple');
    });

    it('should set remainingTime based on simpleDuration', () => {
      timer.start('simple');
      expect(timer.remainingTime).toBe(DEFAULT_CONFIG.simpleDuration * 60);
    });

    it('should set isActive to true', () => {
      timer.start('simple');
      expect(timer.isActive).toBe(true);
    });

    it('should apply session overrides for simpleDuration', () => {
      timer.start('simple', 4, { simpleDuration: 45 });
      expect(timer.remainingTime).toBe(45 * 60);
    });
  });

  describe('startCustomCycle()', () => {
    const mockCustomCycle = {
      name: 'Test Cycle',
      blocks: [
        { type: 'focus', duration: 25 },
        { type: 'break', duration: 5 },
        { type: 'focus', duration: 25 },
      ]
    };

    it('should set mode to custom', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.mode).toBe('custom');
    });

    it('should store custom cycle configuration', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.customCycle).toBe(mockCustomCycle);
    });

    it('should copy blocks array', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.customCycleBlocks).toEqual(mockCustomCycle.blocks);
      expect(timer.customCycleBlocks).not.toBe(mockCustomCycle.blocks);
    });

    it('should start at block index 0', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.currentBlockIndex).toBe(0);
    });

    it('should count focus blocks for totalCycles', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.totalCycles).toBe(2); // Two focus blocks
    });

    it('should set currentCycle to 1 if first block is focus', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.currentCycle).toBe(1);
    });

    it('should set currentCycle to 0 if first block is break', () => {
      const cycleStartingWithBreak = {
        name: 'Break First',
        blocks: [
          { type: 'break', duration: 5 },
          { type: 'focus', duration: 25 },
        ]
      };
      timer.startCustomCycle(cycleStartingWithBreak);
      expect(timer.currentCycle).toBe(0);
    });

    it('should set isActive to true', () => {
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.isActive).toBe(true);
    });

    it('should reset isPaused', () => {
      timer.isPaused = true;
      timer.startCustomCycle(mockCustomCycle);
      expect(timer.isPaused).toBe(false);
    });

    it('should handle empty blocks array', () => {
      const emptyCycle = { name: 'Empty', blocks: [] };
      timer.startCustomCycle(emptyCycle);
      // Should not set isActive for invalid cycle
      expect(timer.customCycleBlocks.length).toBe(0);
    });
  });

  describe('pause()', () => {
    beforeEach(() => {
      timer.start('pomodoro', 4);
    });

    it('should set isPaused to true when timer is active', () => {
      timer.pause();
      expect(timer.isPaused).toBe(true);
    });

    it('should not pause when timer is not active', () => {
      timer.isActive = false;
      timer.pause();
      expect(timer.isPaused).toBe(false);
    });

    it('should stop the interval when pausing', () => {
      const stopIntervalSpy = vi.spyOn(timer, 'stopInterval');
      timer.pause();
      expect(stopIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('resume()', () => {
    beforeEach(() => {
      timer.start('pomodoro', 4);
      timer.pause();
    });

    it('should set isPaused to false when timer is active and paused', () => {
      timer.resume();
      expect(timer.isPaused).toBe(false);
    });

    it('should not resume when timer is not active', () => {
      timer.isActive = false;
      timer.isPaused = true;
      timer.resume();
      expect(timer.isPaused).toBe(true);
    });

    it('should not resume when timer is not paused', () => {
      timer.isPaused = false;
      const startIntervalSpy = vi.spyOn(timer, 'startInterval');
      timer.resume();
      expect(startIntervalSpy).not.toHaveBeenCalled();
    });

    it('should restart the interval when resuming', () => {
      const startIntervalSpy = vi.spyOn(timer, 'startInterval');
      timer.resume();
      expect(startIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    beforeEach(() => {
      timer.start('pomodoro', 4);
    });

    it('should set isActive to false', () => {
      timer.stop();
      expect(timer.isActive).toBe(false);
    });

    it('should set isPaused to false', () => {
      timer.pause();
      timer.stop();
      expect(timer.isPaused).toBe(false);
    });

    it('should reset pausedOnBlockedWorkspace flag', () => {
      timer.pausedOnBlockedWorkspace = true;
      timer.stop();
      expect(timer.pausedOnBlockedWorkspace).toBe(false);
    });

    it('should stop the interval', () => {
      const stopIntervalSpy = vi.spyOn(timer, 'stopInterval');
      timer.stop();
      expect(stopIntervalSpy).toHaveBeenCalled();
    });

    it('should call onComplete callback if registered', () => {
      const callback = vi.fn();
      timer.onComplete = callback;
      timer.stop();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not throw if onComplete is not set', () => {
      timer.onComplete = null;
      expect(() => timer.stop()).not.toThrow();
    });
  });

  describe('Phase Management', () => {
    it('should start with focus phase', () => {
      timer.start('pomodoro', 4);
      expect(timer.currentPhase).toBe('focus');
    });

    it('should clear reminders when starting new focus phase', () => {
      timer.start('pomodoro', 4);
      timer.shownRemindersForCurrentPhase.add(5);
      timer.startFocusPhase();
      expect(timer.shownRemindersForCurrentPhase.size).toBe(0);
    });

    it('should clear reminders when starting break phase', () => {
      timer.start('pomodoro', 4);
      timer.shownRemindersForCurrentPhase.add(5);
      timer.startBreakPhase();
      expect(timer.shownRemindersForCurrentPhase.size).toBe(0);
    });

    it('should use savedConfig for phase durations', () => {
      timer.start('pomodoro', 4, { focusDuration: 30, breakDuration: 10 });
      expect(timer.remainingTime).toBe(30 * 60);
      
      timer.startBreakPhase();
      expect(timer.remainingTime).toBe(10 * 60);
    });
  });

  describe('skipToNextCustomBlock()', () => {
    const mockCycle = {
      name: 'Test',
      blocks: [
        { type: 'focus', duration: 25 },
        { type: 'break', duration: 5 },
      ]
    };

    it('should advance to next block', () => {
      timer.startCustomCycle(mockCycle);
      const initialIndex = timer.currentBlockIndex;
      timer.skipToNextCustomBlock();
      expect(timer.currentBlockIndex).toBe(initialIndex + 1);
    });

    it('should stop timer when reaching end of blocks', () => {
      timer.startCustomCycle(mockCycle);
      timer.currentBlockIndex = mockCycle.blocks.length - 1;
      timer.skipToNextCustomBlock();
      expect(timer.isActive).toBe(false);
    });

    it('should not skip if timer is not active', () => {
      timer.startCustomCycle(mockCycle);
      timer.isActive = false;
      const initialIndex = timer.currentBlockIndex;
      timer.skipToNextCustomBlock();
      expect(timer.currentBlockIndex).toBe(initialIndex);
    });

    it('should not skip if not in custom mode', () => {
      timer.start('pomodoro', 4);
      const initialIndex = timer.currentBlockIndex;
      timer.skipToNextCustomBlock();
      expect(timer.currentBlockIndex).toBe(initialIndex);
    });
  });

  describe('Interval Management', () => {
    it('should have null intervalId initially', () => {
      expect(timer.intervalId).toBeNull();
    });

    it('should clear intervalId on stopInterval', () => {
      timer.intervalId = 123;
      timer.stopInterval();
      expect(timer.intervalId).toBeNull();
    });

    it('should not throw when stopping interval with null intervalId', () => {
      timer.intervalId = null;
      expect(() => timer.stopInterval()).not.toThrow();
    });
  });

  describe('isInBreakPhase()', () => {
    it('should return false for focus phase', () => {
      timer.currentPhase = 'focus';
      expect(timer.isInBreakPhase()).toBe(false);
    });

    it('should return true for break phase', () => {
      timer.currentPhase = 'break';
      expect(timer.isInBreakPhase()).toBe(true);
    });

    it('should return true for long-break phase', () => {
      timer.currentPhase = 'long-break';
      expect(timer.isInBreakPhase()).toBe(true);
    });

    it('should return true for transition phase', () => {
      timer.currentPhase = 'transition';
      expect(timer.isInBreakPhase()).toBe(true);
    });
  });

  describe('Configuration Handling', () => {
    it('should use fresh config from Storage on start', () => {
      timer.start('pomodoro', 4);
      expect(timer.config).toBeDefined();
    });

    it('should preserve session overrides separately from base config', () => {
      timer.start('pomodoro', 4, { focusDuration: 30 });
      expect(timer.savedConfig.focusDuration).toBe(30);
      // Base config should remain unchanged
      expect(timer.config.focusDuration).toBe(DEFAULT_CONFIG.focusDuration);
    });
  });
});
