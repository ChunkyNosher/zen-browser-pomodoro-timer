/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SecurityManager from '../src/security-manager.js';
import { LOCKOUT_METHODS } from '../src/constants.js';

// Mock helpers.js module
vi.mock('../src/helpers.js', async () => {
  const actual = await vi.importActual('../src/helpers.js');
  return {
    ...actual,
    getConfig: vi.fn(() => ({
      settingsLockActiveMethod: 'code',
      settingsLockActiveCodeLength: 32,
      settingsLockActiveHoldDuration: 15,
      settingsLockActiveCharacterSet: 'alphanumeric',
      settingsLockIdleMethod: 'hold',
      settingsLockIdleCodeLength: 16,
      settingsLockIdleHoldDuration: 10,
    })),
    generateRandomCode: vi.fn((length) => 'A'.repeat(length)),
  };
});

// Mock log-manager.js
vi.mock('../src/log-manager.js', () => ({
  logger: {
    log: vi.fn(),
  },
}));

// Mock shared-blocker-utils.js
vi.mock('../src/shared-blocker-utils.js', () => ({
  setupHoldToUnlockHandlers: vi.fn(() => vi.fn()), // Returns cleanup function
}));

// Import mocked modules
import { getConfig, generateRandomCode } from '../src/helpers.js';
import { logger } from '../src/log-manager.js';
import { setupHoldToUnlockHandlers } from '../src/shared-blocker-utils.js';

describe('SecurityManager', () => {
  let manager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Reset getConfig to default mock implementation
    getConfig.mockReturnValue({
      settingsLockActiveMethod: 'code',
      settingsLockActiveCodeLength: 32,
      settingsLockActiveHoldDuration: 15,
      settingsLockActiveCharacterSet: 'alphanumeric',
      settingsLockIdleMethod: 'hold',
      settingsLockIdleCodeLength: 16,
      settingsLockIdleHoldDuration: 10,
    });
    
    // Create fresh instance
    manager = new SecurityManager();
  });

  afterEach(() => {
    // Cleanup any active lock screens
    if (manager) {
      manager.cleanupLockScreen();
    }
  });

  describe('Constructor', () => {
    it('should initialize lockScreen to null', () => {
      expect(manager.lockScreen).toBeNull();
    });

    it('should initialize lockIntervalId to null', () => {
      expect(manager.lockIntervalId).toBeNull();
    });

    it('should initialize holdToUnlockIntervalId to null', () => {
      expect(manager.holdToUnlockIntervalId).toBeNull();
    });

    it('should initialize lockTimerElement to null', () => {
      expect(manager.lockTimerElement).toBeNull();
    });

    it('should initialize holdDuration to 3000', () => {
      expect(manager.holdDuration).toBe(3000);
    });

    it('should initialize _overlayPointerEventsDisabled to false', () => {
      expect(manager._overlayPointerEventsDisabled).toBe(false);
    });
  });

  describe('shouldLockSettings', () => {
    describe('active timer with code method', () => {
      it('should return true when active timer uses code method with length > 0', () => {
        getConfig.mockReturnValue({
          settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
          settingsLockActiveCodeLength: 32,
          settingsLockActiveHoldDuration: 15,
        });
        expect(manager.shouldLockSettings(true)).toBe(true);
      });

      it('should return false when active timer uses code method with length = 0', () => {
        getConfig.mockReturnValue({
          settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
          settingsLockActiveCodeLength: 0,
          settingsLockActiveHoldDuration: 15,
        });
        expect(manager.shouldLockSettings(true)).toBe(false);
      });
    });

    describe('active timer with hold method', () => {
      it('should return true when active timer uses hold method with duration > 0', () => {
        getConfig.mockReturnValue({
          settingsLockActiveMethod: LOCKOUT_METHODS.HOLD,
          settingsLockActiveCodeLength: 32,
          settingsLockActiveHoldDuration: 15,
        });
        expect(manager.shouldLockSettings(true)).toBe(true);
      });

      it('should return false when active timer uses hold method with duration = 0', () => {
        getConfig.mockReturnValue({
          settingsLockActiveMethod: LOCKOUT_METHODS.HOLD,
          settingsLockActiveCodeLength: 32,
          settingsLockActiveHoldDuration: 0,
        });
        expect(manager.shouldLockSettings(true)).toBe(false);
      });
    });

    describe('idle timer with code method', () => {
      it('should return true when idle timer uses code method with length > 0', () => {
        getConfig.mockReturnValue({
          settingsLockIdleMethod: LOCKOUT_METHODS.CODE,
          settingsLockIdleCodeLength: 16,
          settingsLockIdleHoldDuration: 10,
        });
        expect(manager.shouldLockSettings(false)).toBe(true);
      });

      it('should return false when idle timer uses code method with length = 0', () => {
        getConfig.mockReturnValue({
          settingsLockIdleMethod: LOCKOUT_METHODS.CODE,
          settingsLockIdleCodeLength: 0,
          settingsLockIdleHoldDuration: 10,
        });
        expect(manager.shouldLockSettings(false)).toBe(false);
      });
    });

    describe('idle timer with hold method', () => {
      it('should return true when idle timer uses hold method with duration > 0', () => {
        getConfig.mockReturnValue({
          settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
          settingsLockIdleCodeLength: 16,
          settingsLockIdleHoldDuration: 10,
        });
        expect(manager.shouldLockSettings(false)).toBe(true);
      });

      it('should return false when idle timer uses hold method with duration = 0', () => {
        getConfig.mockReturnValue({
          settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
          settingsLockIdleCodeLength: 16,
          settingsLockIdleHoldDuration: 0,
        });
        expect(manager.shouldLockSettings(false)).toBe(false);
      });
    });
  });

  describe('_shouldLockActiveTimer', () => {
    it('should return true for code method with length > 0', () => {
      const config = {
        settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
        settingsLockActiveCodeLength: 32,
        settingsLockActiveHoldDuration: 15,
      };
      expect(manager._shouldLockActiveTimer(config)).toBe(true);
    });

    it('should return false for code method with length = 0', () => {
      const config = {
        settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
        settingsLockActiveCodeLength: 0,
        settingsLockActiveHoldDuration: 15,
      };
      expect(manager._shouldLockActiveTimer(config)).toBe(false);
    });

    it('should return true for hold method with duration > 0', () => {
      const config = {
        settingsLockActiveMethod: LOCKOUT_METHODS.HOLD,
        settingsLockActiveCodeLength: 32,
        settingsLockActiveHoldDuration: 15,
      };
      expect(manager._shouldLockActiveTimer(config)).toBe(true);
    });

    it('should return false for hold method with duration = 0', () => {
      const config = {
        settingsLockActiveMethod: LOCKOUT_METHODS.HOLD,
        settingsLockActiveCodeLength: 32,
        settingsLockActiveHoldDuration: 0,
      };
      expect(manager._shouldLockActiveTimer(config)).toBe(false);
    });
  });

  describe('_shouldLockIdleTimer', () => {
    it('should return true for code method with length > 0', () => {
      const config = {
        settingsLockIdleMethod: LOCKOUT_METHODS.CODE,
        settingsLockIdleCodeLength: 16,
        settingsLockIdleHoldDuration: 10,
      };
      expect(manager._shouldLockIdleTimer(config)).toBe(true);
    });

    it('should return false for code method with length = 0', () => {
      const config = {
        settingsLockIdleMethod: LOCKOUT_METHODS.CODE,
        settingsLockIdleCodeLength: 0,
        settingsLockIdleHoldDuration: 10,
      };
      expect(manager._shouldLockIdleTimer(config)).toBe(false);
    });

    it('should return true for hold method with duration > 0', () => {
      const config = {
        settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
        settingsLockIdleCodeLength: 16,
        settingsLockIdleHoldDuration: 10,
      };
      expect(manager._shouldLockIdleTimer(config)).toBe(true);
    });

    it('should return false for hold method with duration = 0', () => {
      const config = {
        settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
        settingsLockIdleCodeLength: 16,
        settingsLockIdleHoldDuration: 0,
      };
      expect(manager._shouldLockIdleTimer(config)).toBe(false);
    });
  });

  describe('_determineLockoutMethod', () => {
    it('should return code method for active timer when config specifies code', () => {
      const config = {
        settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
      };
      expect(manager._determineLockoutMethod(true, config)).toBe(LOCKOUT_METHODS.CODE);
    });

    it('should return hold method for active timer when config specifies hold', () => {
      const config = {
        settingsLockActiveMethod: LOCKOUT_METHODS.HOLD,
      };
      expect(manager._determineLockoutMethod(true, config)).toBe(LOCKOUT_METHODS.HOLD);
    });

    it('should return code method for idle timer when config specifies code', () => {
      const config = {
        settingsLockIdleMethod: LOCKOUT_METHODS.CODE,
      };
      expect(manager._determineLockoutMethod(false, config)).toBe(LOCKOUT_METHODS.CODE);
    });

    it('should return hold method for idle timer when config specifies hold', () => {
      const config = {
        settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
      };
      expect(manager._determineLockoutMethod(false, config)).toBe(LOCKOUT_METHODS.HOLD);
    });

    it('should fallback to code method for active timer with invalid method', () => {
      const config = {
        settingsLockActiveMethod: 'invalid-method',
      };
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(manager._determineLockoutMethod(true, config)).toBe(LOCKOUT_METHODS.CODE);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid lockout method "invalid-method"')
      );
      consoleWarnSpy.mockRestore();
    });

    it('should fallback to hold method for idle timer with invalid method', () => {
      const config = {
        settingsLockIdleMethod: 'invalid-method',
      };
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(manager._determineLockoutMethod(false, config)).toBe(LOCKOUT_METHODS.HOLD);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid lockout method "invalid-method"')
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('_initializeLockScreen', () => {
    it('should create div element with correct id', () => {
      manager._initializeLockScreen();
      expect(manager.lockScreen).toBeDefined();
      expect(manager.lockScreen.tagName).toBe('DIV');
      expect(manager.lockScreen.id).toBe('zen-pomodoro-lock-screen');
    });

    it('should create div element with active class', () => {
      manager._initializeLockScreen();
      expect(manager.lockScreen.className).toBe('active');
    });

    it('should replace existing lockScreen if called multiple times', () => {
      manager._initializeLockScreen();
      const firstLockScreen = manager.lockScreen;
      manager._initializeLockScreen();
      expect(manager.lockScreen).not.toBe(firstLockScreen);
    });
  });

  describe('_createLockContent', () => {
    it('should create div element', () => {
      const lockContent = manager._createLockContent();
      expect(lockContent).toBeDefined();
      expect(lockContent.tagName).toBe('DIV');
    });

    it('should create div element with correct id', () => {
      const lockContent = manager._createLockContent();
      expect(lockContent.id).toBe('zen-pomodoro-lock-content');
    });

    it('should return different elements on multiple calls', () => {
      const content1 = manager._createLockContent();
      const content2 = manager._createLockContent();
      expect(content1).not.toBe(content2);
    });
  });

  describe('_createLockButtonRow', () => {
    it('should create button div with correct class', () => {
      const { buttonDiv } = manager._createLockButtonRow();
      expect(buttonDiv).toBeDefined();
      expect(buttonDiv.tagName).toBe('DIV');
      expect(buttonDiv.className).toBe('zen-pomodoro-dialog-buttons');
    });

    it('should create cancel button with correct properties', () => {
      const { cancelButton } = manager._createLockButtonRow();
      expect(cancelButton).toBeDefined();
      expect(cancelButton.tagName).toBe('BUTTON');
      expect(cancelButton.className).toBe('zen-pomodoro-dialog-button secondary');
      expect(cancelButton.id).toBe('zen-pomodoro-lock-cancel');
      expect(cancelButton.textContent).toBe('Cancel');
    });

    it('should append cancel button to button div', () => {
      const { buttonDiv, cancelButton } = manager._createLockButtonRow();
      expect(buttonDiv.children).toContain(cancelButton);
    });

    it('should attach click handler to cancel button that calls cleanupLockScreen', () => {
      const cleanupSpy = vi.spyOn(manager, 'cleanupLockScreen').mockImplementation(() => {});
      const { cancelButton } = manager._createLockButtonRow();
      cancelButton.click();
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      cleanupSpy.mockRestore();
    });
  });

  describe('_createHoldButton', () => {
    it('should create hold button with correct properties', () => {
      const { holdButton } = manager._createHoldButton();
      expect(holdButton).toBeDefined();
      expect(holdButton.tagName).toBe('BUTTON');
      expect(holdButton.className).toBe('zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn');
      expect(holdButton.id).toBe('zen-pomodoro-hold-to-unlock');
      expect(holdButton.textContent).toBe('Hold to Unlock');
    });

    it('should create hold progress element with correct properties', () => {
      const { holdProgress } = manager._createHoldButton();
      expect(holdProgress).toBeDefined();
      expect(holdProgress.tagName).toBe('DIV');
      expect(holdProgress.className).toBe('zen-pomodoro-hold-unlock-progress');
      expect(holdProgress.id).toBe('zen-pomodoro-hold-unlock-progress');
    });

    it('should append progress bar to hold button', () => {
      const { holdButton, holdProgress } = manager._createHoldButton();
      expect(holdButton.children).toContain(holdProgress);
    });
  });

  describe('cleanupLockScreen', () => {
    it('should clear lockIntervalId if set', () => {
      manager.lockIntervalId = 123;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager.cleanupLockScreen();
      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
      expect(manager.lockIntervalId).toBeNull();
    });

    it('should clear holdToUnlockIntervalId if set', () => {
      manager.holdToUnlockIntervalId = 456;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager.cleanupLockScreen();
      expect(clearIntervalSpy).toHaveBeenCalledWith(456);
      expect(manager.holdToUnlockIntervalId).toBeNull();
    });

    it('should not throw if intervals are null', () => {
      manager.lockIntervalId = null;
      manager.holdToUnlockIntervalId = null;
      expect(() => manager.cleanupLockScreen()).not.toThrow();
    });

    it('should call hold handlers cleanup function if set', () => {
      const cleanupFn = vi.fn();
      manager._holdHandlersCleanup = cleanupFn;
      manager.cleanupLockScreen();
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(manager._holdHandlersCleanup).toBeNull();
    });

    it('should not throw if hold handlers cleanup is null', () => {
      manager._holdHandlersCleanup = null;
      expect(() => manager.cleanupLockScreen()).not.toThrow();
    });

    it('should set lockTimerElement to null', () => {
      manager.lockTimerElement = document.createElement('div');
      manager.cleanupLockScreen();
      expect(manager.lockTimerElement).toBeNull();
    });

    it('should remove lockScreen from DOM if set', () => {
      manager.lockScreen = document.createElement('div');
      const removeSpy = vi.spyOn(manager.lockScreen, 'remove');
      manager.cleanupLockScreen();
      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(manager.lockScreen).toBeNull();
    });

    it('should not throw if lockScreen is null', () => {
      manager.lockScreen = null;
      expect(() => manager.cleanupLockScreen()).not.toThrow();
    });

    it('should call _restoreOverlayPointerEvents', () => {
      const restoreSpy = vi.spyOn(manager, '_restoreOverlayPointerEvents');
      manager.cleanupLockScreen();
      expect(restoreSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('_clearHoldInterval', () => {
    it('should clear holdToUnlockIntervalId if set', () => {
      manager.holdToUnlockIntervalId = 789;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager._clearHoldInterval();
      expect(clearIntervalSpy).toHaveBeenCalledWith(789);
      expect(manager.holdToUnlockIntervalId).toBeNull();
    });

    it('should not throw if holdToUnlockIntervalId is null', () => {
      manager.holdToUnlockIntervalId = null;
      expect(() => manager._clearHoldInterval()).not.toThrow();
    });

    it('should not call clearInterval if holdToUnlockIntervalId is null', () => {
      manager.holdToUnlockIntervalId = null;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager._clearHoldInterval();
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe('_clearIntervalIfExists', () => {
    it('should clear interval and nullify property if interval exists', () => {
      manager.lockIntervalId = 999;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager._clearIntervalIfExists('lockIntervalId');
      expect(clearIntervalSpy).toHaveBeenCalledWith(999);
      expect(manager.lockIntervalId).toBeNull();
    });

    it('should handle holdToUnlockIntervalId property', () => {
      manager.holdToUnlockIntervalId = 888;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager._clearIntervalIfExists('holdToUnlockIntervalId');
      expect(clearIntervalSpy).toHaveBeenCalledWith(888);
      expect(manager.holdToUnlockIntervalId).toBeNull();
    });

    it('should not throw if property is null', () => {
      manager.lockIntervalId = null;
      expect(() => manager._clearIntervalIfExists('lockIntervalId')).not.toThrow();
    });

    it('should not call clearInterval if property is null', () => {
      manager.lockIntervalId = null;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager._clearIntervalIfExists('lockIntervalId');
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe('_restoreOverlayPointerEvents', () => {
    beforeEach(() => {
      // Create mock overlay element
      const overlay = document.createElement('div');
      overlay.id = 'zen-pomodoro-overlay';
      overlay.style.setProperty = vi.fn();
      document.body.appendChild(overlay);
    });

    afterEach(() => {
      // Clean up mock overlay
      const overlay = document.getElementById('zen-pomodoro-overlay');
      if (overlay) {
        overlay.remove();
      }
    });

    it('should not restore pointer-events if _overlayPointerEventsDisabled is false', () => {
      manager._overlayPointerEventsDisabled = false;
      const overlay = document.getElementById('zen-pomodoro-overlay');
      const setPropertySpy = overlay.style.setProperty;
      manager._restoreOverlayPointerEvents();
      expect(setPropertySpy).not.toHaveBeenCalled();
    });

    it('should restore pointer-events if _overlayPointerEventsDisabled is true', () => {
      manager._overlayPointerEventsDisabled = true;
      const overlay = document.getElementById('zen-pomodoro-overlay');
      const setPropertySpy = overlay.style.setProperty;
      manager._restoreOverlayPointerEvents();
      expect(setPropertySpy).toHaveBeenCalledWith('pointer-events', 'all', 'important');
    });

    it('should set _overlayPointerEventsDisabled to false after restore', () => {
      manager._overlayPointerEventsDisabled = true;
      manager._restoreOverlayPointerEvents();
      expect(manager._overlayPointerEventsDisabled).toBe(false);
    });

    it('should handle missing overlay element gracefully', () => {
      const overlay = document.getElementById('zen-pomodoro-overlay');
      if (overlay) overlay.remove();
      manager._overlayPointerEventsDisabled = true;
      expect(() => manager._restoreOverlayPointerEvents()).not.toThrow();
    });

    it('should check window.zenPomodoroApp.overlay.overlay first', () => {
      const mockOverlay = document.createElement('div');
      mockOverlay.style.setProperty = vi.fn();
      window.zenPomodoroApp = {
        overlay: {
          overlay: mockOverlay,
        },
      };
      manager._overlayPointerEventsDisabled = true;
      manager._restoreOverlayPointerEvents();
      expect(mockOverlay.style.setProperty).toHaveBeenCalledWith('pointer-events', 'all', 'important');
      delete window.zenPomodoroApp;
    });
  });
});
