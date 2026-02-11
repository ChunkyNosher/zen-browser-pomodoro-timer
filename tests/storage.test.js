import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearMockPrefs, setMockPref } from './setup.js';
import Storage, {
  getPref,
  setPref,
  loadConfig,
  saveConfig,
  loadBooleanPref,
  loadPositiveIntPref,
  loadStoredConfigJson,
  isValidTimeFormat,
  loadTimePref,
  loadTimeArrayPref,
  loadIntArrayPref,
  loadReminderModePref,
} from '../src/storage.js';
import { PREF_PREFIX, DEFAULT_CONFIG, REMINDER_MODES } from '../src/constants.js';

describe('Storage Module', () => {
  beforeEach(() => {
    clearMockPrefs();
  });

  describe('getPref', () => {
    it('should get string preference with prefix', () => {
      setMockPref(`${PREF_PREFIX}.test`, 'value');
      expect(getPref('test')).toBe('value');
    });

    it('should get integer preference with prefix', () => {
      setMockPref(`${PREF_PREFIX}.count`, 42);
      expect(getPref('count')).toBe(42);
    });

    it('should get boolean preference with prefix', () => {
      setMockPref(`${PREF_PREFIX}.enabled`, true);
      expect(getPref('enabled')).toBe(true);
    });

    it('should return default value when preference not set', () => {
      expect(getPref('nonexistent', 'default')).toBe('default');
    });

    it('should return default value when preference is null', () => {
      expect(getPref('nonexistent', null)).toBeNull();
    });

    it('should handle missing default value', () => {
      expect(getPref('nonexistent')).toBeUndefined();
    });

    it('should use correct getter based on pref type', () => {
      setMockPref(`${PREF_PREFIX}.str`, 'text');
      setMockPref(`${PREF_PREFIX}.num`, 123);
      setMockPref(`${PREF_PREFIX}.bool`, false);

      expect(getPref('str')).toBe('text');
      expect(getPref('num')).toBe(123);
      expect(getPref('bool')).toBe(false);
    });
  });

  describe('setPref', () => {
    it('should set string preference with prefix', () => {
      setPref('test', 'value');
      expect(Services.prefs.getCharPref(`${PREF_PREFIX}.test`)).toBe('value');
    });

    it('should set integer preference with prefix', () => {
      setPref('count', 42);
      expect(Services.prefs.getIntPref(`${PREF_PREFIX}.count`)).toBe(42);
    });

    it('should set boolean preference with prefix', () => {
      setPref('enabled', true);
      expect(Services.prefs.getBoolPref(`${PREF_PREFIX}.enabled`)).toBe(true);
    });

    it('should handle setting multiple preferences', () => {
      setPref('key1', 'value1');
      setPref('key2', 123);
      setPref('key3', false);

      expect(getPref('key1')).toBe('value1');
      expect(getPref('key2')).toBe(123);
      expect(getPref('key3')).toBe(false);
    });
  });

  describe('loadStoredConfigJson', () => {
    it('should merge stored config with base config', () => {
      const storedConfig = { timerMode: 'simple', simpleDuration: 30 };
      setPref('config', JSON.stringify(storedConfig));

      const config = loadStoredConfigJson({ ...DEFAULT_CONFIG });

      expect(config.timerMode).toBe('simple');
      expect(config.simpleDuration).toBe(30);
      expect(config.focusDuration).toBe(DEFAULT_CONFIG.focusDuration);
    });

    it('should return base config when no stored config exists', () => {
      const baseConfig = { ...DEFAULT_CONFIG };
      const config = loadStoredConfigJson(baseConfig);

      expect(config).toEqual(baseConfig);
    });

    it('should handle invalid JSON gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setPref('config', 'invalid json {');

      const config = loadStoredConfigJson({ ...DEFAULT_CONFIG });

      expect(config).toEqual(DEFAULT_CONFIG);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle empty string', () => {
      setPref('config', '');
      const config = loadStoredConfigJson({ ...DEFAULT_CONFIG });

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should override nested properties', () => {
      const storedConfig = { focusDuration: 50, breakDuration: 10 };
      setPref('config', JSON.stringify(storedConfig));

      const config = loadStoredConfigJson({ ...DEFAULT_CONFIG });

      expect(config.focusDuration).toBe(50);
      expect(config.breakDuration).toBe(10);
    });
  });

  describe('loadBooleanPref', () => {
    it('should load true boolean value', () => {
      setPref('testBool', true);
      const config = {};
      loadBooleanPref('testBool', config, 'testKey');

      expect(config.testKey).toBe(true);
    });

    it('should load false boolean value', () => {
      setPref('testBool', false);
      const config = {};
      loadBooleanPref('testBool', config, 'testKey');

      expect(config.testKey).toBe(false);
    });

    it('should load "true" string as boolean', () => {
      setPref('testBool', 'true');
      const config = {};
      loadBooleanPref('testBool', config, 'testKey');

      expect(config.testKey).toBe(true);
    });

    it('should not modify config when preference not set', () => {
      const config = { testKey: 'original' };
      loadBooleanPref('nonexistent', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should handle "false" string as false', () => {
      setPref('testBool', 'false');
      const config = {};
      loadBooleanPref('testBool', config, 'testKey');

      expect(config.testKey).toBe(false);
    });

    it('should handle non-boolean values as false', () => {
      setPref('testBool', 'other');
      const config = {};
      loadBooleanPref('testBool', config, 'testKey');

      expect(config.testKey).toBe(false);
    });
  });

  describe('loadPositiveIntPref', () => {
    it('should load positive integer value', () => {
      setPref('testInt', 42);
      const config = {};
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe(42);
    });

    it('should load string integer value', () => {
      setPref('testInt', '100');
      const config = {};
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe(100);
    });

    it('should ignore zero value', () => {
      setPref('testInt', 0);
      const config = { testKey: 'original' };
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should ignore negative value', () => {
      setPref('testInt', -5);
      const config = { testKey: 'original' };
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should ignore NaN value', () => {
      setPref('testInt', 'not a number');
      const config = { testKey: 'original' };
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should not modify config when preference not set', () => {
      const config = { testKey: 'original' };
      loadPositiveIntPref('nonexistent', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should handle large positive integers', () => {
      setPref('testInt', 999999);
      const config = {};
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe(999999);
    });
  });

  describe('isValidTimeFormat', () => {
    it('should validate correct HH:MM format', () => {
      expect(isValidTimeFormat('00:00')).toBe(true);
      expect(isValidTimeFormat('12:30')).toBe(true);
      expect(isValidTimeFormat('23:59')).toBe(true);
    });

    it('should reject invalid hours', () => {
      expect(isValidTimeFormat('24:00')).toBe(false);
      expect(isValidTimeFormat('25:30')).toBe(false);
      expect(isValidTimeFormat('-1:30')).toBe(false);
    });

    it('should reject invalid minutes', () => {
      expect(isValidTimeFormat('12:60')).toBe(false);
      expect(isValidTimeFormat('12:99')).toBe(false);
      expect(isValidTimeFormat('12:-1')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(isValidTimeFormat('1:30')).toBe(false); // Missing leading zero
      expect(isValidTimeFormat('12:3')).toBe(false); // Missing leading zero
      expect(isValidTimeFormat('12-30')).toBe(false); // Wrong separator
      expect(isValidTimeFormat('1230')).toBe(false); // No separator
    });

    it('should reject non-string values', () => {
      expect(isValidTimeFormat(null)).toBe(false);
      expect(isValidTimeFormat(undefined)).toBe(false);
      expect(isValidTimeFormat(1230)).toBe(false);
      expect(isValidTimeFormat({})).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidTimeFormat('')).toBe(false);
    });

    it('should reject time with seconds', () => {
      expect(isValidTimeFormat('12:30:00')).toBe(false);
    });
  });

  describe('loadTimePref', () => {
    it('should load valid time preference', () => {
      setPref('testTime', '14:30');
      const config = {};
      loadTimePref('testTime', config, 'testKey');

      expect(config.testKey).toBe('14:30');
    });

    it('should ignore invalid time format', () => {
      setPref('testTime', '25:00');
      const config = { testKey: 'original' };
      loadTimePref('testTime', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should ignore empty string', () => {
      setPref('testTime', '');
      const config = { testKey: 'original' };
      loadTimePref('testTime', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should not modify config when preference not set', () => {
      const config = { testKey: 'original' };
      loadTimePref('nonexistent', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should handle midnight time', () => {
      setPref('testTime', '00:00');
      const config = {};
      loadTimePref('testTime', config, 'testKey');

      expect(config.testKey).toBe('00:00');
    });

    it('should handle end of day time', () => {
      setPref('testTime', '23:59');
      const config = {};
      loadTimePref('testTime', config, 'testKey');

      expect(config.testKey).toBe('23:59');
    });
  });

  describe('loadTimeArrayPref', () => {
    it('should load comma-separated time values', () => {
      setPref('testTimes', '09:00,13:30,18:45');
      const config = {};
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toEqual(['09:00', '13:30', '18:45']);
    });

    it('should trim whitespace around times', () => {
      setPref('testTimes', ' 09:00 , 13:30 , 18:45 ');
      const config = {};
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toEqual(['09:00', '13:30', '18:45']);
    });

    it('should filter out invalid times', () => {
      setPref('testTimes', '09:00,25:00,13:30,invalid,18:45');
      const config = {};
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toEqual(['09:00', '13:30', '18:45']);
    });

    it('should not modify config when all times invalid', () => {
      setPref('testTimes', '25:00,invalid,99:99');
      const config = { testKey: 'original' };
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should handle empty string', () => {
      setPref('testTimes', '');
      const config = { testKey: 'original' };
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should not modify config when preference not set', () => {
      const config = { testKey: 'original' };
      loadTimeArrayPref('nonexistent', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should handle single time value', () => {
      setPref('testTimes', '14:30');
      const config = {};
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toEqual(['14:30']);
    });
  });

  describe('loadIntArrayPref', () => {
    it('should load comma-separated integer values', () => {
      setPref('testInts', '10,20,30');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([10, 20, 30]);
    });

    it('should trim whitespace around numbers', () => {
      setPref('testInts', ' 10 , 20 , 30 ');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([10, 20, 30]);
    });

    it('should filter out zero and negative values', () => {
      setPref('testInts', '10,0,-5,20,30');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([10, 20, 30]);
    });

    it('should filter out NaN values', () => {
      setPref('testInts', '10,invalid,20,abc,30');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([10, 20, 30]);
    });

    it('should handle empty string as empty array', () => {
      setPref('testInts', '');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([]);
    });

    it('should not modify config when all values invalid', () => {
      setPref('testInts', '0,-5,invalid');
      const config = { testKey: 'original' };
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should not modify config when preference not set', () => {
      const config = { testKey: 'original' };
      loadIntArrayPref('nonexistent', config, 'testKey');

      expect(config.testKey).toBe('original');
    });

    it('should handle single integer value', () => {
      setPref('testInts', '42');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([42]);
    });

    it('should handle large positive integers', () => {
      setPref('testInts', '100,1000,10000');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([100, 1000, 10000]);
    });
  });

  describe('loadReminderModePref', () => {
    it('should load valid "none" reminder mode', () => {
      setPref('reminderMode', REMINDER_MODES.NONE);
      const config = {};
      loadReminderModePref('reminderMode', config, 'reminderMode');

      expect(config.reminderMode).toBe(REMINDER_MODES.NONE);
    });

    it('should load valid "daily" reminder mode', () => {
      setPref('reminderMode', REMINDER_MODES.DAILY);
      const config = {};
      loadReminderModePref('reminderMode', config, 'reminderMode');

      expect(config.reminderMode).toBe(REMINDER_MODES.DAILY);
    });

    it('should load valid "post-session" reminder mode', () => {
      setPref('reminderMode', REMINDER_MODES.POST_SESSION);
      const config = {};
      loadReminderModePref('reminderMode', config, 'reminderMode');

      expect(config.reminderMode).toBe(REMINDER_MODES.POST_SESSION);
    });

    it('should ignore invalid reminder mode', () => {
      setPref('reminderMode', 'invalid-mode');
      const config = { reminderMode: 'original' };
      loadReminderModePref('reminderMode', config, 'reminderMode');

      expect(config.reminderMode).toBe('original');
    });

    it('should ignore empty string', () => {
      setPref('reminderMode', '');
      const config = { reminderMode: 'original' };
      loadReminderModePref('reminderMode', config, 'reminderMode');

      expect(config.reminderMode).toBe('original');
    });

    it('should not modify config when preference not set', () => {
      const config = { reminderMode: 'original' };
      loadReminderModePref('nonexistent', config, 'reminderMode');

      expect(config.reminderMode).toBe('original');
    });
  });

  describe('loadConfig', () => {
    it('should load default config when no preferences set', () => {
      const config = loadConfig();

      expect(config.timerMode).toBe(DEFAULT_CONFIG.timerMode);
      expect(config.focusDuration).toBe(DEFAULT_CONFIG.focusDuration);
      expect(config.breakDuration).toBe(DEFAULT_CONFIG.breakDuration);
    });

    it('should merge stored JSON config', () => {
      const storedConfig = { timerMode: 'simple', simpleDuration: 30 };
      setPref('config', JSON.stringify(storedConfig));

      const config = loadConfig();

      expect(config.timerMode).toBe('simple');
      expect(config.simpleDuration).toBe(30);
    });

    it('should apply individual preference overrides', () => {
      const storedConfig = { timerMode: 'simple' };
      setPref('config', JSON.stringify(storedConfig));
      setPref('enableNotifications', false);
      setPref('postSessionIdleTime', 60);

      const config = loadConfig();

      expect(config.timerMode).toBe('simple');
      expect(config.enableNotifications).toBe(false);
      expect(config.postSessionIdleTime).toBe(60);
    });

    it('should load keyboard shortcuts', () => {
      setPref('keyboardShortcut', 'Ctrl+Alt+P');
      setPref('toggleIndicatorShortcut', 'Ctrl+Alt+H');

      const config = loadConfig();

      expect(config.keyboardShortcut).toBe('Ctrl+Alt+P');
      expect(config.toggleIndicatorShortcut).toBe('Ctrl+Alt+H');
    });

    it('should load reminder settings', () => {
      setPref('reminderMode', REMINDER_MODES.DAILY);
      setPref('dailyReminderTimes', '09:00,17:00');

      const config = loadConfig();

      expect(config.reminderMode).toBe(REMINDER_MODES.DAILY);
      expect(config.dailyReminderTimes).toEqual(['09:00', '17:00']);
    });

    it('should load timer reminder arrays', () => {
      setPref('focusPhaseReminders', '25,15,10,5');
      setPref('breakPhaseReminders', '3,1');

      const config = loadConfig();

      expect(config.focusPhaseReminders).toEqual([25, 15, 10, 5]);
      expect(config.breakPhaseReminders).toEqual([3, 1]);
    });

    it('should handle partial configuration', () => {
      setPref('postSessionIdleTime', 90);
      setPref('postSessionSkipCooldown', 45);

      const config = loadConfig();

      expect(config.postSessionIdleTime).toBe(90);
      expect(config.postSessionSkipCooldown).toBe(45);
      expect(config.timerMode).toBe(DEFAULT_CONFIG.timerMode); // Default value preserved
    });

    it('should migrate old reminder settings to new format', () => {
      const storedConfig = {
        dailyReminderEnabled: true,
        postSessionReminderEnabled: false,
      };
      setPref('config', JSON.stringify(storedConfig));

      const config = loadConfig();

      expect(config.reminderMode).toBe(REMINDER_MODES.DAILY);
      expect(config.dailyReminderEnabled).toBeUndefined();
      expect(config.postSessionReminderEnabled).toBeUndefined();
    });

    it('should migrate post-session reminder setting', () => {
      const storedConfig = {
        dailyReminderEnabled: false,
        postSessionReminderEnabled: true,
      };
      setPref('config', JSON.stringify(storedConfig));

      const config = loadConfig();

      expect(config.reminderMode).toBe(REMINDER_MODES.POST_SESSION);
    });

    it('should migrate both disabled to none', () => {
      const storedConfig = {
        dailyReminderEnabled: false,
        postSessionReminderEnabled: false,
      };
      setPref('config', JSON.stringify(storedConfig));

      const config = loadConfig();

      expect(config.reminderMode).toBe(REMINDER_MODES.NONE);
    });

    it('should handle empty reminder arrays', () => {
      setPref('focusPhaseReminders', '');
      setPref('breakPhaseReminders', '');

      const config = loadConfig();

      expect(config.focusPhaseReminders).toEqual([]);
      expect(config.breakPhaseReminders).toEqual([]);
    });
  });

  describe('saveConfig', () => {
    it('should save config as JSON string', () => {
      const config = {
        timerMode: 'simple',
        simpleDuration: 30,
        focusDuration: 25,
      };

      saveConfig(config);

      const saved = getPref('config');
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved);
      expect(parsed.timerMode).toBe('simple');
      expect(parsed.simpleDuration).toBe(30);
    });

    it('should preserve all config properties', () => {
      const config = {
        timerMode: 'pomodoro',
        focusDuration: 25,
        breakDuration: 5,
        cycles: 4,
        blockedWorkspaces: ['Work', 'Personal'],
        enableNotifications: true,
      };

      saveConfig(config);

      const saved = getPref('config');
      const parsed = JSON.parse(saved);
      expect(parsed).toEqual(config);
    });

    it('should handle empty config', () => {
      const config = {};

      saveConfig(config);

      const saved = getPref('config');
      expect(saved).toBe('{}');
    });

    it('should handle nested objects and arrays', () => {
      const config = {
        rulesets: [
          { id: 'ruleset1', name: 'Test', rules: [{ id: 'rule1', pattern: 'test' }] },
        ],
        blockedWorkspaces: ['Work'],
      };

      saveConfig(config);

      const saved = getPref('config');
      const parsed = JSON.parse(saved);
      expect(parsed.rulesets).toEqual(config.rulesets);
      expect(parsed.blockedWorkspaces).toEqual(config.blockedWorkspaces);
    });

    it('should handle error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a config that can't be stringified
      const config = {};
      config.circular = config; // Circular reference

      saveConfig(config);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Default Export', () => {
    it('should export Storage object with all methods', () => {
      expect(Storage.getPref).toBe(getPref);
      expect(Storage.setPref).toBe(setPref);
      expect(Storage.loadConfig).toBe(loadConfig);
      expect(Storage.saveConfig).toBe(saveConfig);
      expect(Storage.loadBooleanPref).toBe(loadBooleanPref);
      expect(Storage.loadPositiveIntPref).toBe(loadPositiveIntPref);
      expect(Storage.isValidTimeFormat).toBe(isValidTimeFormat);
      expect(Storage.loadTimePref).toBe(loadTimePref);
      expect(Storage.loadTimeArrayPref).toBe(loadTimeArrayPref);
      expect(Storage.loadIntArrayPref).toBe(loadIntArrayPref);
      expect(Storage.loadReminderModePref).toBe(loadReminderModePref);
    });
  });

  describe('Edge Cases', () => {
    it('should handle preference with special characters in key', () => {
      setPref('test-key.value', 'special');
      expect(getPref('test-key.value')).toBe('special');
    });

    it('should handle very long string values', () => {
      const longString = 'a'.repeat(10000);
      setPref('longString', longString);
      expect(getPref('longString')).toBe(longString);
    });

    it('should handle config with null values', () => {
      const config = { testKey: null };
      saveConfig(config);

      const saved = getPref('config');
      const parsed = JSON.parse(saved);
      expect(parsed.testKey).toBeNull();
    });

    it('should handle config with undefined values', () => {
      const config = { testKey: undefined, otherKey: 'value' };
      saveConfig(config);

      const saved = getPref('config');
      const parsed = JSON.parse(saved);
      // JSON.stringify removes undefined values
      expect(parsed.testKey).toBeUndefined();
      expect(parsed.otherKey).toBe('value');
    });

    it('should handle multiple rapid save/load cycles', () => {
      for (let i = 0; i < 10; i++) {
        const config = { iteration: i };
        saveConfig(config);

        const loaded = loadConfig();
        expect(loaded.iteration).toBe(i);
      }
    });

    it('should handle time arrays with duplicate times', () => {
      setPref('testTimes', '09:00,09:00,13:30,09:00');
      const config = {};
      loadTimeArrayPref('testTimes', config, 'testKey');

      expect(config.testKey).toEqual(['09:00', '09:00', '13:30', '09:00']);
    });

    it('should handle int arrays with duplicate numbers', () => {
      setPref('testInts', '10,10,20,10');
      const config = {};
      loadIntArrayPref('testInts', config, 'testKey');

      expect(config.testKey).toEqual([10, 10, 20, 10]);
    });

    it('should handle boolean pref set to non-boolean value', () => {
      setPref('testBool', 'yes');
      const config = {};
      loadBooleanPref('testBool', config, 'testKey');

      expect(config.testKey).toBe(false);
    });

    it('should handle integer pref set to decimal string', () => {
      setPref('testInt', '42.7');
      const config = {};
      loadPositiveIntPref('testInt', config, 'testKey');

      expect(config.testKey).toBe(42);
    });
  });

  describe('Integration Tests', () => {
    it('should handle full save and load cycle', () => {
      const originalConfig = {
        timerMode: 'pomodoro',
        focusDuration: 25,
        breakDuration: 5,
        cycles: 4,
        blockedWorkspaces: ['Work', 'Personal'],
        enableNotifications: true,
        reminderMode: REMINDER_MODES.POST_SESSION,
        postSessionIdleTime: 45,
        dailyReminderTimes: ['09:00', '17:00'],
        focusPhaseReminders: [20, 10, 5, 1],
        breakPhaseReminders: [3, 1],
      };

      saveConfig(originalConfig);

      // loadConfig reads from the stored JSON config pref
      const loadedConfig = loadConfig();

      expect(loadedConfig.timerMode).toBe(originalConfig.timerMode);
      expect(loadedConfig.focusDuration).toBe(originalConfig.focusDuration);
      expect(loadedConfig.breakDuration).toBe(originalConfig.breakDuration);
      expect(loadedConfig.cycles).toBe(originalConfig.cycles);
      expect(loadedConfig.blockedWorkspaces).toEqual(originalConfig.blockedWorkspaces);
      expect(loadedConfig.enableNotifications).toBe(originalConfig.enableNotifications);
    });

    it('should prioritize individual prefs over stored config', () => {
      const storedConfig = {
        enableNotifications: true,
        postSessionIdleTime: 45,
      };
      setPref('config', JSON.stringify(storedConfig));

      // Override with individual preferences
      setPref('enableNotifications', false);
      setPref('postSessionIdleTime', 60);

      const config = loadConfig();

      expect(config.enableNotifications).toBe(false); // Individual pref wins
      expect(config.postSessionIdleTime).toBe(60); // Individual pref wins
    });

    it('should handle mixed valid and invalid preferences', () => {
      setPref('enableNotifications', true); // Valid boolean
      setPref('postSessionIdleTime', -5); // Invalid (negative)
      setPref('dailyReminderTimes', '09:00,25:00,17:00'); // Partially valid
      setPref('focusPhaseReminders', '20,0,10,invalid'); // Partially valid

      const config = loadConfig();

      expect(config.enableNotifications).toBe(true);
      expect(config.postSessionIdleTime).toBe(DEFAULT_CONFIG.postSessionIdleTime); // Default preserved
      expect(config.dailyReminderTimes).toEqual(['09:00', '17:00']); // Invalid filtered out
      expect(config.focusPhaseReminders).toEqual([20, 10]); // Invalid filtered out
    });
  });
});
