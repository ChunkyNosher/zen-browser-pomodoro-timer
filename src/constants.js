/**
 * Constants module - Plain object containing all application constants.
 * This module has no dependencies and is referenced by all other modules.
 */
const Constants = {
  PREF_PREFIX: 'zen-pomodoro',
  MOD_VERSION: '1.4.6',

  /** Modifier keys used by the keyboard shortcut recorder */
  MODIFIER_KEYS: ['Control', 'Alt', 'Shift', 'Meta'],

  /** Valid lockout method types for settings access control */
  LOCKOUT_METHODS: {
    CODE: 'code',
    HOLD: 'hold',
  },

  /** Reminder mode types - only one can be active at a time */
  REMINDER_MODES: {
    NONE: 'none',
    DAILY: 'daily',
    POST_SESSION: 'post-session',
  },

  /** Data attribute name used to mark dialogs that should not save their position */
  DATA_NO_POSITION_SAVE: 'data-no-position-save',

  /** Save state interval in seconds (every 10 seconds for performance) */
  SAVE_STATE_INTERVAL_SECONDS: 10,

  /** Delay for DOM settling after timer start (in milliseconds) - 200ms provides more reliable settling */
  DOM_SETTLE_DELAY_MS: 200,

  /** Delay for showing restoration notification after DOM is ready (in milliseconds) */
  RESTORATION_NOTIFICATION_DELAY_MS: 500,

  /** Maximum z-index value for overlay (highest possible value for 32-bit signed integer) */
  MAX_OVERLAY_Z_INDEX: '2147483647',

  /** Minimum content area dimension for valid overlay bounds (in pixels) */
  MIN_CONTENT_AREA_DIMENSION: 100,

  /** Debounce delay for content observer checks (in milliseconds) */
  CONTENT_OBSERVER_DEBOUNCE_DELAY_MS: 500,

  /** Transition phase duration in seconds (5 minutes warning before focus resumes) */
  TRANSITION_PHASE_DURATION_SECONDS: 5 * 60,

  /** Post-session reminder escalation factor (50% increase per skip) */
  POST_SESSION_ESCALATION_FACTOR: 1.5,

  /** Post-session reminder check interval (1 minute in milliseconds) */
  POST_SESSION_CHECK_INTERVAL_MS: 60 * 1000,

  /** Daily reminder escalation factor (50% increase per skip) */
  DAILY_REMINDER_ESCALATION_FACTOR: 1.5,

  /** Daily reminder check interval (1 minute in milliseconds) */
  DAILY_REMINDER_CHECK_INTERVAL_MS: 60 * 1000,

  /** Startup delay before showing daily reminder (3 seconds to allow timer state restoration) */
  DAILY_REMINDER_STARTUP_DELAY_MS: 3 * 1000,

  /** Early morning cutoff time for auto-off detection (06:00 AM in minutes since midnight) */
  EARLY_MORNING_CUTOFF_MINUTES: 6 * 60,

  /** Delay for workspace mutation handling to allow DOM to settle (in milliseconds) */
  WORKSPACE_MUTATION_DELAY_MS: 50,

  /** Regex pattern for escaping all regex metacharacters (including backslashes) in strings */
  REGEX_ESCAPE_PATTERN: /[.*+?^${}()|[\]\\]/g,

  /** Regex pattern for escaping regex metacharacters except asterisk (for wildcard patterns) */
  REGEX_ESCAPE_PATTERN_KEEP_ASTERISK: /[.+?^${}()|[\]\\]/g,

  /** Log categories for different parts of the application */
  LOG_CATEGORIES: {
    TIMER: 'TIMER',
    SETTINGS: 'SETTINGS',
    MENU: 'MENU',
    OVERLAY: 'OVERLAY',
    WORKSPACE: 'WORKSPACE',
    SECURITY: 'SECURITY',
    INIT: 'INIT',
    SYNC: 'SYNC',
  },

  /** Alert messages for Distraction Dump timer locking */
  DISTRACTION_DUMP_LOCK_ALERT: {
    TITLE: 'Timer Locked',
    MESSAGE: 'Timer is locked during Distraction Dump. End the dump first.',
  },

  /** Delay (in ms) before revoking the URL after export download starts */
  URL_REVOKE_DELAY_MS: 200,

  /** Keys to filter out from logged data for security */
  SENSITIVE_KEYS: ['password', 'code', 'secret', 'token', 'credential', 'auth'],

  /** Selectors to try for workspace container for MutationObserver (order matters) */
  WORKSPACE_CONTAINER_SELECTORS: [
    '#tabbrowser-arrowscrollbox',
    '#zen-workspace-button-container',
    '#zen-workspaces-button-container',
    '[id*="workspace"]',
    '#navigator-toolbox',
  ],

  /** Selectors to try for content area to append overlay (order matters) */
  CONTENT_AREA_SELECTORS: [
    '#tabbrowser-tabbox',
    '#tabbrowser-tabpanels',
    '#appcontent',
    '#zen-main-view',
    '#browser',
    '#main-window',
  ],

  /** Attribute names to check for workspace name, in priority order */
  WORKSPACE_NAME_ATTRIBUTES: [
    'data-workspace-name',
    'data-name',
    'label',
    'tooltiptext',
    'aria-label',
    'title',
  ],

  /** Maximum length for page title in log messages */
  MAX_TITLE_LOG_LENGTH: 50,

  /** Default configuration object */
  DEFAULT_CONFIG: {
    timerMode: 'pomodoro',
    simpleDuration: 25,
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    cycles: 4,
    blockedWorkspaces: [],
    overlayColor: '#808080',
    motivationalMessage: 'Get back to work.',
    settingsLockIdleMethod: 'hold',
    settingsLockActiveMethod: 'code',
    settingsLockIdleHoldDuration: 10,
    settingsLockActiveHoldDuration: 25,
    settingsLockIdleCodeLength: 48,
    settingsLockActiveCodeLength: 96,
    settingsLockActiveCharacterSet: 'all-typeable',
    enableNotifications: true,
    enableAudioAlerts: false,
    phase: 'focus',
    keyboardShortcut: 'Alt+Shift+P',
    rulesets: [
      {
        id: 'default',
        name: 'Default Blocklist',
        enabled: true,
        rules: [],
        checkTitleOnly: true,
        blockedWorkspaces: [],
      },
    ],
    activeRulesets: ['default'],
    reminderMode: 'post-session', // Options: 'none', 'daily', 'post-session'
    dailyReminderTimes: ['11:15', '16:15'],
    dailyReminderSkipMethod: 'hold',
    dailyReminderSkipHoldDuration: 15,
    dailyReminderSkipCodeLength: 32,
    dailyReminderSkipCount: 0,
    dailyReminderLastSkipTime: null,
    dailyReminderSkipCooldown: 10,
    lastTimerStartTime: null,
    dailyRemindersShownToday: [],
    postSessionIdleTime: 45,
    postSessionSkipCooldown: 30,
    postSessionSkipMethod: 'hold',
    postSessionSkipHoldDuration: 20,
    postSessionSkipCodeLength: 48,
    postSessionFocusTimeGoal: 150,
    totalFocusTimeToday: 0,
    lastFocusTimeResetDate: '',
    postSessionSkipCount: 0,
    postSessionLastSkipTime: null,
    postSessionIdleStartTime: null,
    postSessionReminderEndTime: '00:30',
    postSessionReminderDisabledForDay: false,
    /** Distraction Dump feature - allows users to capture distracting thoughts */
    distractionDumpEnabled: true,
    /** Default duration for distraction dump in minutes */
    distractionDumpDuration: 25,
    /** Maximum duration for distraction dump in minutes */
    distractionDumpMaxDuration: 35,
    /** Custom Pomodoro Cycles - user-defined custom timer sequences */
    customCycles: [],
    /** Timer reminders - notify user before phase ends */
    timerRemindersEnabled: true,
    /** Minutes before focus phase ends to show reminder (default: 20, 10, 5, 1) */
    focusPhaseReminders: [20, 10, 5, 1],
    /** Minutes before break phase ends to show reminder (default: 5, 1) */
    breakPhaseReminders: [5, 1],
    /** Keyboard shortcut to toggle timer indicator visibility (hide/show) */
    toggleIndicatorShortcut: 'Alt+Shift+H',
  },

  /** Cross-window sync: pref key for timer sync state */
  SYNC_PREF_KEY: 'timer-sync',
  /** Cross-window sync: pref key for timer owner */
  OWNER_PREF_KEY: 'timer-owner',
  /** Cross-window sync: pref key for reminder sync state */
  REMINDER_SYNC_PREF_KEY: 'reminder-sync',
  /** Cross-window sync: heartbeat timeout in ms - if no heartbeat for this long, owner is dead */
  OWNER_HEARTBEAT_TIMEOUT_MS: 30000,
  /** Cross-window sync: Services.obs topic for log entry broadcasting */
  LOG_BROADCAST_TOPIC: 'zen-pomodoro-log',
  /** Cross-window sync: Services.obs topic for requesting logs from other windows */
  LOG_REQUEST_TOPIC: 'zen-pomodoro-log-request',
  /** Cross-window sync: interval for secondary windows to check owner heartbeat (ms) */
  HEARTBEAT_CHECK_INTERVAL_MS: 5000,
  /** Cross-window sync: how often owner writes heartbeat (ms, wall-clock) */
  HEARTBEAT_WRITE_INTERVAL_MS: 5000,
};

// Freeze Constants and nested objects to prevent accidental mutation
Object.freeze(Constants.LOG_CATEGORIES);
Object.freeze(Constants.LOCKOUT_METHODS);
Object.freeze(Constants.DISTRACTION_DUMP_LOCK_ALERT);
Object.freeze(Constants.WORKSPACE_CONTAINER_SELECTORS);
Object.freeze(Constants.CONTENT_AREA_SELECTORS);
Object.freeze(Constants.WORKSPACE_NAME_ATTRIBUTES);
Object.freeze(Constants.SENSITIVE_KEYS);
Object.freeze(Constants.DEFAULT_CONFIG.rulesets[0]);
Object.freeze(Constants.DEFAULT_CONFIG.rulesets);
Object.freeze(Constants.DEFAULT_CONFIG.dailyReminderTimes);
Object.freeze(Constants.DEFAULT_CONFIG.focusPhaseReminders);
Object.freeze(Constants.DEFAULT_CONFIG.breakPhaseReminders);
Object.freeze(Constants.DEFAULT_CONFIG);
Object.freeze(Constants);

export default Constants;

// Export commonly used constants individually for convenience
export const {
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
} = Constants;
