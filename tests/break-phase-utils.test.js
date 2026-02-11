import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isInBreakPhase } from '../src/break-phase-utils.js';

describe('Break Phase Utils Module', () => {
  let originalZenPomodoroApp;

  beforeEach(() => {
    // Save original state
    originalZenPomodoroApp = globalThis.window?.zenPomodoroApp;
  });

  afterEach(() => {
    // Restore original state
    if (originalZenPomodoroApp !== undefined) {
      globalThis.window = globalThis.window || {};
      globalThis.window.zenPomodoroApp = originalZenPomodoroApp;
    }
  });

  describe('isInBreakPhase', () => {
    it('should return false when zenPomodoroApp is not defined', () => {
      globalThis.window = {};
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return false when timer is not defined', () => {
      globalThis.window = { zenPomodoroApp: {} };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return false when timer is not active', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: false,
            currentPhase: 'break',
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return true for break phase when timer is active', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: 'break',
          },
        },
      };
      expect(isInBreakPhase()).toBe(true);
    });

    it('should return true for long-break phase (backwards compatibility)', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: 'long-break',
          },
        },
      };
      expect(isInBreakPhase()).toBe(true);
    });

    it('should return true for transition phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: 'transition',
          },
        },
      };
      expect(isInBreakPhase()).toBe(true);
    });

    it('should return false for focus phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: 'focus',
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return false for null phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: null,
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return false for undefined phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: undefined,
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return false for empty string phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: '',
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should return false for unknown phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: true,
            currentPhase: 'unknown',
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should handle timer with isActive false and break phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: false,
            currentPhase: 'break',
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

    it('should handle timer with isActive false and transition phase', () => {
      globalThis.window = {
        zenPomodoroApp: {
          timer: {
            isActive: false,
            currentPhase: 'transition',
          },
        },
      };
      expect(isInBreakPhase()).toBe(false);
    });

  });
});
