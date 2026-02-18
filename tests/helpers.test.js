import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearMockPrefs, setMockPref } from './setup.js';
import {
  formatTime,
  formatTimeWithHours,
  getPhaseLabel,
  getShortPhaseLabel,
  sanitizeText,
  isValidRangeValue,
  validateIntegerInput,
  getValidatedIntFromDialog,
  isPopupWindow,
  findRuleAndExecute,
  sendBrowserNotification,
  getPref,
  setPref,
  getConfig,
  saveConfig,
  isNonEmptyArray,
  generateRandomCode,
  clampToViewportBound,
  isValidWorkspaceArray,
  formatWorkspacesFromApi,
  extractWorkspaceNameFromButton,
  getActiveBlockedWorkspaces,
  MOD_VERSION,
  MODIFIER_KEYS,
  LOCKOUT_METHODS,
  LOG_CATEGORIES,
  URL_REVOKE_DELAY_MS,
} from '../src/helpers.js';

describe('Helpers Module', () => {
  beforeEach(() => {
    clearMockPrefs();
  });

  describe('Re-exported Constants', () => {
    it('should export MOD_VERSION', () => {
      expect(MOD_VERSION).toBe('1.4.8');
    });

    it('should export MODIFIER_KEYS', () => {
      expect(MODIFIER_KEYS).toEqual(['Control', 'Alt', 'Shift', 'Meta']);
      expect(Array.isArray(MODIFIER_KEYS)).toBe(true);
    });

    it('should export LOCKOUT_METHODS', () => {
      expect(LOCKOUT_METHODS).toEqual({
        CODE: 'code',
        HOLD: 'hold',
      });
    });

    it('should export LOG_CATEGORIES', () => {
      expect(LOG_CATEGORIES).toBeDefined();
      expect(LOG_CATEGORIES.TIMER).toBe('TIMER');
      expect(LOG_CATEGORIES.SETTINGS).toBe('SETTINGS');
    });

    it('should export URL_REVOKE_DELAY_MS', () => {
      expect(URL_REVOKE_DELAY_MS).toBe(200);
    });
  });

  describe('formatTime', () => {
    it('should format 0 seconds as "0:00"', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format 61 seconds as "1:01"', () => {
      expect(formatTime(61)).toBe('1:01');
    });

    it('should format 3600 seconds as "60:00"', () => {
      expect(formatTime(3600)).toBe('60:00');
    });

    it('should format 90 seconds as "1:30"', () => {
      expect(formatTime(90)).toBe('1:30');
    });

    it('should pad single-digit seconds with zero', () => {
      expect(formatTime(5)).toBe('0:05');
      expect(formatTime(65)).toBe('1:05');
    });

    it('should handle large values', () => {
      expect(formatTime(7200)).toBe('120:00');
      expect(formatTime(7265)).toBe('121:05');
    });
  });

  describe('formatTimeWithHours', () => {
    it('should format with hours when useHours=true and hours>0', () => {
      expect(formatTimeWithHours(3661, true)).toBe('1:01:01');
    });

    it('should format without hours when useHours=false', () => {
      expect(formatTimeWithHours(3661, false)).toBe('1:01');
    });

    it('should not show hours when useHours=true but hours=0', () => {
      expect(formatTimeWithHours(90, true)).toBe('1:30');
    });

    it('should format 2 hours correctly', () => {
      expect(formatTimeWithHours(7200, true)).toBe('2:00:00');
    });

    it('should pad minutes and seconds in hour format', () => {
      expect(formatTimeWithHours(3665, true)).toBe('1:01:05');
    });

    it('should handle default useHours parameter', () => {
      expect(formatTimeWithHours(90)).toBe('1:30');
    });
  });

  describe('getPhaseLabel', () => {
    it('should return "Focus Period" for "focus"', () => {
      expect(getPhaseLabel('focus')).toBe('Focus Period');
    });

    it('should return "Break Time" for "break"', () => {
      expect(getPhaseLabel('break')).toBe('Break Time');
    });

    it('should return "Transition" for "transition"', () => {
      expect(getPhaseLabel('transition')).toBe('Transition');
    });

    it('should return "Break Time" for "long-break"', () => {
      expect(getPhaseLabel('long-break')).toBe('Break Time');
    });

    it('should return "Focus Period" for unknown phase', () => {
      expect(getPhaseLabel('unknown')).toBe('Focus Period');
      expect(getPhaseLabel('')).toBe('Focus Period');
    });
  });

  describe('getShortPhaseLabel', () => {
    it('should return "Focus" for "focus"', () => {
      expect(getShortPhaseLabel('focus')).toBe('Focus');
    });

    it('should return "Transition" for "transition"', () => {
      expect(getShortPhaseLabel('transition')).toBe('Transition');
    });

    it('should return "Break" for "break"', () => {
      expect(getShortPhaseLabel('break')).toBe('Break');
    });

    it('should return "Break" for unknown phase', () => {
      expect(getShortPhaseLabel('unknown')).toBe('Break');
    });
  });

  describe('sanitizeText', () => {
    it('should remove < and > characters', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    it('should leave normal text unchanged', () => {
      expect(sanitizeText('Hello')).toBe('Hello');
      expect(sanitizeText('Hello World 123')).toBe('Hello World 123');
    });

    it('should handle empty string', () => {
      expect(sanitizeText('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(123)).toBe('');
    });

    it('should preserve other special characters', () => {
      expect(sanitizeText('Hello & goodbye!')).toBe('Hello & goodbye!');
    });
  });

  describe('isValidRangeValue', () => {
    it('should return true for value within range', () => {
      expect(isValidRangeValue(5, 1, 10)).toBe(true);
    });

    it('should return false for value below min', () => {
      expect(isValidRangeValue(0, 1, 10)).toBe(false);
    });

    it('should return false for value above max', () => {
      expect(isValidRangeValue(11, 1, 10)).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isValidRangeValue(NaN, 1, 10)).toBe(false);
    });

    it('should return true for boundary values', () => {
      expect(isValidRangeValue(1, 1, 10)).toBe(true);
      expect(isValidRangeValue(10, 1, 10)).toBe(true);
    });

    it('should handle negative ranges', () => {
      expect(isValidRangeValue(-5, -10, 0)).toBe(true);
      expect(isValidRangeValue(-11, -10, 0)).toBe(false);
    });
  });

  describe('validateIntegerInput', () => {
    it('should return parsed value when valid', () => {
      expect(validateIntegerInput('5', 1, 10, 3)).toBe(5);
    });

    it('should return default when value is not a number', () => {
      expect(validateIntegerInput('abc', 1, 10, 3)).toBe(3);
    });

    it('should return default when value is below min', () => {
      expect(validateIntegerInput('0', 1, 10, 3)).toBe(3);
    });

    it('should return default when value is above max', () => {
      expect(validateIntegerInput('11', 1, 10, 3)).toBe(3);
    });

    it('should handle numeric input', () => {
      expect(validateIntegerInput(5, 1, 10, 3)).toBe(5);
    });

    it('should handle boundary values', () => {
      expect(validateIntegerInput('1', 1, 10, 3)).toBe(1);
      expect(validateIntegerInput('10', 1, 10, 3)).toBe(10);
    });

    it('should handle negative numbers', () => {
      expect(validateIntegerInput('-5', -10, 0, -1)).toBe(-5);
      expect(validateIntegerInput('-11', -10, 0, -1)).toBe(-1);
    });

    it('should handle floating point strings', () => {
      expect(validateIntegerInput('5.7', 1, 10, 3)).toBe(5);
    });
  });

  describe('getValidatedIntFromDialog', () => {
    it('should return validated integer from dialog input', () => {
      const mockDialog = {
        querySelector: vi.fn().mockReturnValue({
          value: '5',
        }),
      };

      const result = getValidatedIntFromDialog(mockDialog, {
        selector: '#test-input',
        min: 1,
        max: 10,
        defaultValue: 3,
      });

      expect(result).toBe(5);
      expect(mockDialog.querySelector).toHaveBeenCalledWith('#test-input');
    });

    it('should return null when element not found', () => {
      const mockDialog = {
        querySelector: vi.fn().mockReturnValue(null),
      };

      const result = getValidatedIntFromDialog(mockDialog, {
        selector: '#test-input',
        min: 1,
        max: 10,
        defaultValue: 3,
      });

      expect(result).toBeNull();
    });

    it('should return default when value is invalid', () => {
      const mockDialog = {
        querySelector: vi.fn().mockReturnValue({
          value: 'invalid',
        }),
      };

      const result = getValidatedIntFromDialog(mockDialog, {
        selector: '#test-input',
        min: 1,
        max: 10,
        defaultValue: 3,
      });

      expect(result).toBe(3);
    });
  });

  describe('isPopupWindow', () => {
    it('should return true if document has chromehidden attribute', () => {
      const mockGetAttribute = vi.fn().mockReturnValue('menubar,toolbar');
      global.document = {
        documentElement: {
          getAttribute: mockGetAttribute,
        },
      };

      expect(isPopupWindow()).toBe(true);
      expect(mockGetAttribute).toHaveBeenCalledWith('chromehidden');
    });

    it('should return true if gBrowser is undefined', () => {
      const mockGetAttribute = vi.fn().mockReturnValue(null);
      global.document = {
        documentElement: {
          getAttribute: mockGetAttribute,
        },
      };
      const oldGBrowser = global.gBrowser;
      global.gBrowser = undefined;

      expect(isPopupWindow()).toBe(true);

      global.gBrowser = oldGBrowser;
    });

    it('should return true if gBrowser.tabContainer is missing', () => {
      const mockGetAttribute = vi.fn().mockReturnValue(null);
      global.document = {
        documentElement: {
          getAttribute: mockGetAttribute,
        },
      };
      const oldGBrowser = global.gBrowser;
      global.gBrowser = {};

      expect(isPopupWindow()).toBe(true);

      global.gBrowser = oldGBrowser;
    });

    it('should return false for normal browser window', () => {
      const mockGetAttribute = vi.fn().mockReturnValue(null);
      global.document = {
        documentElement: {
          getAttribute: mockGetAttribute,
        },
      };

      expect(isPopupWindow()).toBe(false);
    });

    it('should return false if error occurs', () => {
      const mockGetAttribute = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      global.document = {
        documentElement: {
          getAttribute: mockGetAttribute,
        },
      };

      expect(isPopupWindow()).toBe(false);
    });
  });

  describe('findRuleAndExecute', () => {
    it('should find rule and execute callback', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [
              { id: 'rule1', pattern: 'test' },
              { id: 'rule2', pattern: 'test2' },
            ],
          },
        ],
      };

      const callback = vi.fn();
      const result = findRuleAndExecute(config, 'ruleset1', 'rule1', callback);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        { id: 'rule1', pattern: 'test' },
        0,
        config.rulesets[0].rules
      );
    });

    it('should return false when ruleset not found', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [{ id: 'rule1', pattern: 'test' }],
          },
        ],
      };

      const callback = vi.fn();
      const result = findRuleAndExecute(config, 'nonexistent', 'rule1', callback);

      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should return false when rule not found', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [{ id: 'rule1', pattern: 'test' }],
          },
        ],
      };

      const callback = vi.fn();
      const result = findRuleAndExecute(config, 'ruleset1', 'nonexistent', callback);

      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should pass correct indices to callback', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [
              { id: 'rule1', pattern: 'test1' },
              { id: 'rule2', pattern: 'test2' },
              { id: 'rule3', pattern: 'test3' },
            ],
          },
        ],
      };

      const callback = vi.fn();
      findRuleAndExecute(config, 'ruleset1', 'rule3', callback);

      expect(callback).toHaveBeenCalledWith({ id: 'rule3', pattern: 'test3' }, 2, config.rulesets[0].rules);
    });
  });

  describe('sendBrowserNotification', () => {
    it('should send notification when permission granted', () => {
      const mockNotification = vi.fn();
      global.Notification = mockNotification;
      global.Notification.permission = 'granted';

      sendBrowserNotification('Test Title', 'Test Body');

      expect(mockNotification).toHaveBeenCalledWith('Test Title', {
        body: 'Test Body',
        icon: 'chrome://branding/content/about-logo.png',
      });
    });

    it('should log to console when permission not granted', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      global.Notification = { permission: 'denied' };

      sendBrowserNotification('Test Title', 'Test Body');

      expect(consoleSpy).toHaveBeenCalledWith('Test Title: Test Body');
      consoleSpy.mockRestore();
    });

    it('should log to console when Notification undefined', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const oldNotification = global.Notification;
      global.Notification = undefined;

      sendBrowserNotification('Test Title', 'Test Body');

      expect(consoleSpy).toHaveBeenCalledWith('Test Title: Test Body');
      consoleSpy.mockRestore();
      global.Notification = oldNotification;
    });

    it('should handle errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      global.Notification = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      global.Notification.permission = 'granted';

      sendBrowserNotification('Test Title', 'Test Body');

      expect(consoleSpy).toHaveBeenCalledWith('Test Title: Test Body');
      consoleSpy.mockRestore();
    });
  });

  describe('Storage Function Wrappers', () => {
    it('should call getPref and return value', () => {
      setMockPref('zen-pomodoro.test', 'value');
      expect(getPref('test', 'default')).toBe('value');
    });

    it('should call setPref and store value', () => {
      setPref('test', 'value');
      expect(getPref('test')).toBe('value');
    });

    it('should call getConfig and return config object', () => {
      const config = getConfig();
      expect(config).toBeDefined();
      expect(config.timerMode).toBeDefined();
    });

    it('should call saveConfig and store config', () => {
      const config = { timerMode: 'simple', simpleDuration: 30 };
      saveConfig(config);
      const stored = getPref('config');
      expect(stored).toContain('simple');
    });
  });

  describe('Utility Function Wrappers', () => {
    it('should call isNonEmptyArray', () => {
      expect(isNonEmptyArray([1, 2])).toBe(true);
      expect(isNonEmptyArray([])).toBe(false);
    });

    it('should call generateRandomCode', () => {
      const code = generateRandomCode(10, 'alphanumeric');
      expect(code.length).toBe(10);
    });

    it('should call clampToViewportBound', () => {
      expect(clampToViewportBound(100, 200, 800)).toBe(100);
    });

    it('should call isValidWorkspaceArray', () => {
      expect(isValidWorkspaceArray([1])).toBe(true);
      expect(isValidWorkspaceArray([])).toBe(false);
    });

    it('should call formatWorkspacesFromApi', () => {
      const workspaces = [
        { containerName: 'Work', uuid: '1' },
        { containerName: 'Personal', uuid: '2' },
      ];
      const result = formatWorkspacesFromApi(workspaces);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should call extractWorkspaceNameFromButton', () => {
      const mockBtn = {
        getAttribute: vi.fn().mockReturnValue('Work'),
      };
      const result = extractWorkspaceNameFromButton(mockBtn, '1');
      expect(result).toBe('Work');
    });

    it('should call getActiveBlockedWorkspaces', () => {
      // This function depends on loaded config, so just test it returns an array
      const result = getActiveBlockedWorkspaces();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
