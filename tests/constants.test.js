import { describe, it, expect } from 'vitest';
import Constants, {
  PREF_PREFIX,
  MOD_VERSION,
  LOG_CATEGORIES,
  LOCKOUT_METHODS,
  REMINDER_MODES,
  DEFAULT_CONFIG,
  SENSITIVE_KEYS,
  WORKSPACE_CONTAINER_SELECTORS,
  CONTENT_AREA_SELECTORS,
  WORKSPACE_NAME_ATTRIBUTES,
} from '../src/constants.js';

describe('Constants Module', () => {
  describe('Basic Constants', () => {
    it('should have correct PREF_PREFIX', () => {
      expect(Constants.PREF_PREFIX).toBe('zen-pomodoro');
      expect(PREF_PREFIX).toBe('zen-pomodoro');
    });

    it('should have correct MOD_VERSION', () => {
      expect(Constants.MOD_VERSION).toBe('1.4.4');
      expect(MOD_VERSION).toBe('1.4.4');
    });

    it('should have MODIFIER_KEYS array', () => {
      expect(Constants.MODIFIER_KEYS).toEqual(['Control', 'Alt', 'Shift', 'Meta']);
      expect(Array.isArray(Constants.MODIFIER_KEYS)).toBe(true);
      expect(Constants.MODIFIER_KEYS.length).toBe(4);
    });

    it('should have correct LOCKOUT_METHODS', () => {
      expect(Constants.LOCKOUT_METHODS).toEqual({
        CODE: 'code',
        HOLD: 'hold',
      });
      expect(LOCKOUT_METHODS.CODE).toBe('code');
      expect(LOCKOUT_METHODS.HOLD).toBe('hold');
    });

    it('should have correct REMINDER_MODES', () => {
      expect(Constants.REMINDER_MODES).toEqual({
        NONE: 'none',
        DAILY: 'daily',
        POST_SESSION: 'post-session',
      });
      expect(REMINDER_MODES.NONE).toBe('none');
      expect(REMINDER_MODES.DAILY).toBe('daily');
      expect(REMINDER_MODES.POST_SESSION).toBe('post-session');
    });

    it('should have numeric constants', () => {
      expect(Constants.TRANSITION_PHASE_DURATION_SECONDS).toBe(300);
      expect(Constants.SAVE_STATE_INTERVAL_SECONDS).toBe(10);
      expect(Constants.DOM_SETTLE_DELAY_MS).toBe(200);
      expect(Constants.RESTORATION_NOTIFICATION_DELAY_MS).toBe(500);
      expect(Constants.MAX_OVERLAY_Z_INDEX).toBe('2147483647');
      expect(Constants.MIN_CONTENT_AREA_DIMENSION).toBe(100);
      expect(Constants.CONTENT_OBSERVER_DEBOUNCE_DELAY_MS).toBe(500);
      expect(Constants.POST_SESSION_ESCALATION_FACTOR).toBe(1.5);
      expect(Constants.POST_SESSION_CHECK_INTERVAL_MS).toBe(60000);
      expect(Constants.DAILY_REMINDER_ESCALATION_FACTOR).toBe(1.5);
      expect(Constants.DAILY_REMINDER_CHECK_INTERVAL_MS).toBe(60000);
      expect(Constants.DAILY_REMINDER_STARTUP_DELAY_MS).toBe(3000);
      expect(Constants.EARLY_MORNING_CUTOFF_MINUTES).toBe(360);
      expect(Constants.WORKSPACE_MUTATION_DELAY_MS).toBe(50);
      expect(Constants.URL_REVOKE_DELAY_MS).toBe(200);
    });

    it('should have regex patterns', () => {
      expect(Constants.REGEX_ESCAPE_PATTERN).toBeInstanceOf(RegExp);
      expect(Constants.REGEX_ESCAPE_PATTERN_KEEP_ASTERISK).toBeInstanceOf(RegExp);
    });
  });

  describe('LOG_CATEGORIES', () => {
    it('should have all required log categories', () => {
      expect(LOG_CATEGORIES.TIMER).toBe('TIMER');
      expect(LOG_CATEGORIES.SETTINGS).toBe('SETTINGS');
      expect(LOG_CATEGORIES.MENU).toBe('MENU');
      expect(LOG_CATEGORIES.OVERLAY).toBe('OVERLAY');
      expect(LOG_CATEGORIES.WORKSPACE).toBe('WORKSPACE');
      expect(LOG_CATEGORIES.SECURITY).toBe('SECURITY');
      expect(LOG_CATEGORIES.INIT).toBe('INIT');
      expect(LOG_CATEGORIES.SYNC).toBe('SYNC');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(LOG_CATEGORIES)).toBe(true);
      expect(() => {
        LOG_CATEGORIES.NEW_CATEGORY = 'NEW';
      }).toThrow();
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all required timer properties', () => {
      expect(DEFAULT_CONFIG.timerMode).toBe('pomodoro');
      expect(DEFAULT_CONFIG.simpleDuration).toBe(25);
      expect(DEFAULT_CONFIG.focusDuration).toBe(25);
      expect(DEFAULT_CONFIG.breakDuration).toBe(5);
      expect(DEFAULT_CONFIG.cycles).toBe(4);
      expect(DEFAULT_CONFIG.phase).toBe('focus');
    });

    it('should have blocking configuration', () => {
      expect(Array.isArray(DEFAULT_CONFIG.blockedWorkspaces)).toBe(true);
      expect(DEFAULT_CONFIG.blockedWorkspaces.length).toBe(0);
      expect(DEFAULT_CONFIG.overlayColor).toBe('#808080');
      expect(DEFAULT_CONFIG.motivationalMessage).toBe('Get back to work.');
    });

    it('should have security settings', () => {
      expect(DEFAULT_CONFIG.settingsLockIdleMethod).toBe('hold');
      expect(DEFAULT_CONFIG.settingsLockActiveMethod).toBe('code');
      expect(DEFAULT_CONFIG.settingsLockIdleHoldDuration).toBe(10);
      expect(DEFAULT_CONFIG.settingsLockActiveHoldDuration).toBe(25);
      expect(DEFAULT_CONFIG.settingsLockIdleCodeLength).toBe(48);
      expect(DEFAULT_CONFIG.settingsLockActiveCodeLength).toBe(96);
      expect(DEFAULT_CONFIG.settingsLockActiveCharacterSet).toBe('all-typeable');
    });

    it('should have notification settings', () => {
      expect(DEFAULT_CONFIG.enableNotifications).toBe(true);
      expect(DEFAULT_CONFIG.enableAudioAlerts).toBe(false);
    });

    it('should have keyboard shortcuts', () => {
      expect(DEFAULT_CONFIG.keyboardShortcut).toBe('Alt+Shift+P');
      expect(DEFAULT_CONFIG.toggleIndicatorShortcut).toBe('Alt+Shift+H');
    });

    it('should have rulesets array', () => {
      expect(Array.isArray(DEFAULT_CONFIG.rulesets)).toBe(true);
      expect(DEFAULT_CONFIG.rulesets.length).toBe(1);
      expect(DEFAULT_CONFIG.rulesets[0].id).toBe('default');
      expect(DEFAULT_CONFIG.rulesets[0].name).toBe('Default Blocklist');
      expect(DEFAULT_CONFIG.rulesets[0].enabled).toBe(true);
      expect(Array.isArray(DEFAULT_CONFIG.rulesets[0].rules)).toBe(true);
      expect(DEFAULT_CONFIG.rulesets[0].checkTitleOnly).toBe(true);
      expect(Array.isArray(DEFAULT_CONFIG.rulesets[0].blockedWorkspaces)).toBe(true);
    });

    it('should have active rulesets', () => {
      expect(Array.isArray(DEFAULT_CONFIG.activeRulesets)).toBe(true);
      expect(DEFAULT_CONFIG.activeRulesets).toEqual(['default']);
    });

    it('should have reminder configuration', () => {
      expect(DEFAULT_CONFIG.reminderMode).toBe('post-session');
      expect(Array.isArray(DEFAULT_CONFIG.dailyReminderTimes)).toBe(true);
      expect(DEFAULT_CONFIG.dailyReminderTimes).toEqual(['11:15', '16:15']);
      expect(DEFAULT_CONFIG.dailyReminderSkipMethod).toBe('hold');
      expect(DEFAULT_CONFIG.dailyReminderSkipHoldDuration).toBe(15);
      expect(DEFAULT_CONFIG.dailyReminderSkipCodeLength).toBe(32);
      expect(DEFAULT_CONFIG.dailyReminderSkipCount).toBe(0);
      expect(DEFAULT_CONFIG.dailyReminderLastSkipTime).toBeNull();
      expect(DEFAULT_CONFIG.dailyReminderSkipCooldown).toBe(10);
      expect(DEFAULT_CONFIG.lastTimerStartTime).toBeNull();
      expect(Array.isArray(DEFAULT_CONFIG.dailyRemindersShownToday)).toBe(true);
    });

    it('should have post-session reminder configuration', () => {
      expect(DEFAULT_CONFIG.postSessionIdleTime).toBe(45);
      expect(DEFAULT_CONFIG.postSessionSkipCooldown).toBe(30);
      expect(DEFAULT_CONFIG.postSessionSkipMethod).toBe('hold');
      expect(DEFAULT_CONFIG.postSessionSkipHoldDuration).toBe(20);
      expect(DEFAULT_CONFIG.postSessionSkipCodeLength).toBe(48);
      expect(DEFAULT_CONFIG.postSessionFocusTimeGoal).toBe(150);
      expect(DEFAULT_CONFIG.totalFocusTimeToday).toBe(0);
      expect(DEFAULT_CONFIG.lastFocusTimeResetDate).toBe('');
      expect(DEFAULT_CONFIG.postSessionSkipCount).toBe(0);
      expect(DEFAULT_CONFIG.postSessionLastSkipTime).toBeNull();
      expect(DEFAULT_CONFIG.postSessionIdleStartTime).toBeNull();
      expect(DEFAULT_CONFIG.postSessionReminderEndTime).toBe('00:30');
      expect(DEFAULT_CONFIG.postSessionReminderDisabledForDay).toBe(false);
    });

    it('should have distraction dump configuration', () => {
      expect(DEFAULT_CONFIG.distractionDumpEnabled).toBe(true);
      expect(DEFAULT_CONFIG.distractionDumpDuration).toBe(25);
      expect(DEFAULT_CONFIG.distractionDumpMaxDuration).toBe(35);
    });

    it('should have custom cycles configuration', () => {
      expect(Array.isArray(DEFAULT_CONFIG.customCycles)).toBe(true);
      expect(DEFAULT_CONFIG.customCycles.length).toBe(0);
    });

    it('should have timer reminders configuration', () => {
      expect(DEFAULT_CONFIG.timerRemindersEnabled).toBe(true);
      expect(Array.isArray(DEFAULT_CONFIG.focusPhaseReminders)).toBe(true);
      expect(DEFAULT_CONFIG.focusPhaseReminders).toEqual([20, 10, 5, 1]);
      expect(Array.isArray(DEFAULT_CONFIG.breakPhaseReminders)).toBe(true);
      expect(DEFAULT_CONFIG.breakPhaseReminders).toEqual([5, 1]);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
      expect(() => {
        DEFAULT_CONFIG.newProperty = 'value';
      }).toThrow();
    });

    it('should have frozen nested objects', () => {
      expect(Object.isFrozen(DEFAULT_CONFIG.rulesets)).toBe(true);
      expect(Object.isFrozen(DEFAULT_CONFIG.rulesets[0])).toBe(true);
      expect(Object.isFrozen(DEFAULT_CONFIG.dailyReminderTimes)).toBe(true);
      expect(Object.isFrozen(DEFAULT_CONFIG.focusPhaseReminders)).toBe(true);
      expect(Object.isFrozen(DEFAULT_CONFIG.breakPhaseReminders)).toBe(true);
    });
  });

  describe('Other Nested Objects', () => {
    it('should have frozen LOCKOUT_METHODS', () => {
      expect(Object.isFrozen(Constants.LOCKOUT_METHODS)).toBe(true);
    });

    it('should have frozen DISTRACTION_DUMP_LOCK_ALERT', () => {
      expect(Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE).toBe('Timer Locked');
      expect(Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE).toBe('Timer is locked during Distraction Dump. End the dump first.');
      expect(Object.isFrozen(Constants.DISTRACTION_DUMP_LOCK_ALERT)).toBe(true);
    });

    it('should have frozen array constants', () => {
      expect(Object.isFrozen(WORKSPACE_CONTAINER_SELECTORS)).toBe(true);
      expect(Object.isFrozen(CONTENT_AREA_SELECTORS)).toBe(true);
      expect(Object.isFrozen(WORKSPACE_NAME_ATTRIBUTES)).toBe(true);
      expect(Object.isFrozen(SENSITIVE_KEYS)).toBe(true);
    });

    it('should have WORKSPACE_CONTAINER_SELECTORS array', () => {
      expect(Array.isArray(WORKSPACE_CONTAINER_SELECTORS)).toBe(true);
      expect(WORKSPACE_CONTAINER_SELECTORS.length).toBeGreaterThan(0);
      expect(WORKSPACE_CONTAINER_SELECTORS[0]).toBe('#tabbrowser-arrowscrollbox');
    });

    it('should have CONTENT_AREA_SELECTORS array', () => {
      expect(Array.isArray(CONTENT_AREA_SELECTORS)).toBe(true);
      expect(CONTENT_AREA_SELECTORS.length).toBeGreaterThan(0);
      expect(CONTENT_AREA_SELECTORS[0]).toBe('#tabbrowser-tabbox');
    });

    it('should have WORKSPACE_NAME_ATTRIBUTES array', () => {
      expect(Array.isArray(WORKSPACE_NAME_ATTRIBUTES)).toBe(true);
      expect(WORKSPACE_NAME_ATTRIBUTES.length).toBeGreaterThan(0);
      expect(WORKSPACE_NAME_ATTRIBUTES[0]).toBe('data-workspace-name');
    });

    it('should have SENSITIVE_KEYS array', () => {
      expect(Array.isArray(SENSITIVE_KEYS)).toBe(true);
      expect(SENSITIVE_KEYS.length).toBeGreaterThan(0);
      expect(SENSITIVE_KEYS).toContain('password');
      expect(SENSITIVE_KEYS).toContain('code');
    });
  });

  describe('Cross-window Sync Constants', () => {
    it('should have sync preference keys', () => {
      expect(Constants.SYNC_PREF_KEY).toBe('timer-sync');
      expect(Constants.OWNER_PREF_KEY).toBe('timer-owner');
    });

    it('should have sync timing constants', () => {
      expect(Constants.OWNER_HEARTBEAT_TIMEOUT_MS).toBe(30000);
      expect(Constants.HEARTBEAT_CHECK_INTERVAL_MS).toBe(5000);
      expect(Constants.HEARTBEAT_WRITE_INTERVAL_MS).toBe(5000);
    });

    it('should have observer topics', () => {
      expect(Constants.LOG_BROADCAST_TOPIC).toBe('zen-pomodoro-log');
      expect(Constants.LOG_REQUEST_TOPIC).toBe('zen-pomodoro-log-request');
    });
  });

  describe('Constants Object', () => {
    it('should be frozen at top level', () => {
      expect(Object.isFrozen(Constants)).toBe(true);
      expect(() => {
        Constants.NEW_CONSTANT = 'value';
      }).toThrow();
    });

    it('should export named constants', () => {
      expect(PREF_PREFIX).toBeDefined();
      expect(MOD_VERSION).toBeDefined();
      expect(LOG_CATEGORIES).toBeDefined();
      expect(LOCKOUT_METHODS).toBeDefined();
      expect(REMINDER_MODES).toBeDefined();
      expect(DEFAULT_CONFIG).toBeDefined();
    });
  });

  describe('Data Attributes and Misc', () => {
    it('should have DATA_NO_POSITION_SAVE constant', () => {
      expect(Constants.DATA_NO_POSITION_SAVE).toBe('data-no-position-save');
    });

    it('should have MAX_TITLE_LOG_LENGTH', () => {
      expect(Constants.MAX_TITLE_LOG_LENGTH).toBe(50);
    });
  });
});
