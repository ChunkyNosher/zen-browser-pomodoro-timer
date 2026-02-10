import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import {
  getConfig, saveConfig, getPref, setPref,
  formatTime, sanitizeText, generateRandomCode,
  LOG_CATEGORIES, LOCKOUT_METHODS, DAILY_REMINDER_CHECK_INTERVAL_MS,
  DAILY_REMINDER_STARTUP_DELAY_MS, DAILY_REMINDER_ESCALATION_FACTOR,
  EARLY_MORNING_CUTOFF_MINUTES, isNonEmptyArray
} from './helpers.js';
import { isValidTimeFormat } from './ui-helpers.js';
import { setupHoldToUnlockHandlers } from './shared-blocker-utils.js';

// ============================================
// Daily Reminder Manager
// ============================================

/**
 * DailyReminderManager handles multiple daily reminders throughout the day.
 * When enabled, it shows a blocking overlay at configured times if:
 * - Current time is at or after a configured reminder time
 * - That specific reminder hasn't been shown today yet
 * - No timer is currently active
 *
 * Features:
 * - Multiple reminder times per day (configurable array)
 * - Skip with hold/code challenge (escalating difficulty)
 * - Skip count resets when timer starts
 * - Separate skip logic from post-session reminder
 * - Tracks which reminders shown today
 */
class DailyReminderManager {
  constructor() {
    this.reminderOverlay = null;
    this.isShowing = false;
    this.onStartTimer = null; // Callback when user clicks "Start Timer" button
    this._timeDisplayInterval = null; // Interval for updating time display
    this.checkIntervalId = null; // Interval for periodic reminder check
    this.skipCount = 0; // Number of times user has skipped
    this.lastSkipTime = null; // When the last skip occurred
    this.remindersShownToday = []; // Array of timestamps when reminders were shown today
    this._holdIntervalId = null; // Hold-to-unlock interval
    this._holdTimerElement = null; // Timer display element for hold mode
    this._holdHandlersCleanup = null; // Cleanup function for hold handlers
  }

  /**
   * Initialize the daily reminder manager.
   * Loads persisted state and checks if reminder should be shown on startup.
   */
  init() {
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Daily Reminder Manager');
    this._loadState();

    // Add startup delay before showing daily reminder to allow timer state restoration
    // This prevents the reminder from appearing immediately on browser start if timer
    // was active before a PC restart/crash
    setTimeout(() => {
      this._checkAndShowReminder();
    }, DAILY_REMINDER_STARTUP_DELAY_MS);

    this._startPeriodicCheck();
  }

  /**
   * Load persisted state from config.
   * @private
   */
  _loadState() {
    const config = getConfig();
    this.skipCount = config.dailyReminderSkipCount || 0;
    this.lastSkipTime = config.dailyReminderLastSkipTime || null;
    this.remindersShownToday = config.dailyRemindersShownToday || [];

    // Reset reminders shown today if it's a new day
    this._resetIfNewDay();

    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Loaded persisted state', {
      skipCount: this.skipCount,
      lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
      remindersShownCount: this.remindersShownToday.length,
    });
  }

  /**
   * Save current state to config for persistence.
   * @private
   */
  _saveState() {
    const config = getConfig();
    config.dailyReminderSkipCount = this.skipCount;
    config.dailyReminderLastSkipTime = this.lastSkipTime;
    config.dailyRemindersShownToday = this.remindersShownToday;
    saveConfig(config);

    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Saved state', {
      skipCount: this.skipCount,
      lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
      remindersShownCount: this.remindersShownToday.length,
    });
  }

  /**
   * Reset reminders shown today if it's a new day.
   * Uses the first daily reminder time as the reset boundary.
   * @private
   */
  _resetIfNewDay() {
    // Check if we have any reminders shown - exit early if none
    if (this.remindersShownToday.length === 0) {
      return;
    }

    const today = this._getTodayDateString();
    const lastShownTimestamp = Math.max(...this.remindersShownToday);
    const lastShownDate = new Date(lastShownTimestamp);
    const lastShownDateStr = this._getDateString(lastShownDate);

    // Same day - no reset needed
    if (lastShownDateStr === today) {
      return;
    }

    // Different day - check if we should reset based on first reminder time
    const resetTime = this._getFirstReminderTime();
    if (!isValidTimeFormat(resetTime)) {
      return;
    }

    const now = new Date();
    const resetDate = this._createTimeOnToday(resetTime);

    // Only reset if we're past the reset time on the new day
    if (now >= resetDate) {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Resetting shown reminders for new day');
      this.remindersShownToday = [];
      this._saveState();
    }
  }

  /**
   * Get the first reminder time from config, or default to '10:00'.
   * @returns {string} The earliest reminder time in HH:MM format
   * @private
   */
  _getFirstReminderTime() {
    const config = getConfig();
    const times = config.dailyReminderTimes;
    
    if (!isNonEmptyArray(times)) {
      return '10:00';
    }
    
    return times.slice().sort((a, b) => {
      const [aHours, aMinutes] = a.split(':').map(Number);
      const [bHours, bMinutes] = b.split(':').map(Number);
      return aHours - bHours || aMinutes - bMinutes;
    })[0];
  }

  /**
   * Create a Date object for the given time on today's date.
   * @param {string} timeStr - Time in HH:MM format
   * @returns {Date} Date object with today's date and the given time
   * @private
   */
  _createTimeOnToday(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  /**
   * Check if the reminder should be shown and show it if conditions are met.
   * Conditions:
   * 1. Feature is enabled
   * 2. Current time >= one of the configured reminder times
   * 3. That reminder hasn't been shown today yet
   * 4. No timer is currently active
   * @private
   */
  _checkAndShowReminder() {
    // Check basic preconditions
    if (!this._canShowDailyReminder()) {
      return;
    }

    // Reset reminders shown if new day
    this._resetIfNewDay();

    // Check and show reminder if time matches
    this._checkReminderTimes();
  }

  /**
   * Check if daily reminder can be shown based on feature state and timer status.
   * @returns {boolean} True if daily reminder can potentially be shown
   * @private
   */
  _canShowDailyReminder() {
    const config = getConfig();

    // Check if feature is enabled via reminderMode
    if (config.reminderMode !== Constants.REMINDER_MODES.DAILY) {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Feature disabled (reminderMode not set to daily)');
      return false;
    }

    // Check if timer is already active
    if (window.zenPomodoroApp?.timer?.isActive) {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer already active');
      return false;
    }

    // Get reminder times array
    const reminderTimes = config.dailyReminderTimes;
    if (!Array.isArray(reminderTimes) || reminderTimes.length === 0) {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: No reminder times configured');
      return false;
    }

    return true;
  }

  /**
   * Check all configured reminder times and show reminder if conditions met.
   * @private
   */
  _checkReminderTimes() {
    const config = getConfig();
    const now = new Date();
    const currentTimeMinutes = this._getCurrentTimeInMinutes(now);

    for (const timeStr of config.dailyReminderTimes) {
      if (!isValidTimeFormat(timeStr)) continue;

      const [hours, minutes] = timeStr.split(':').map(Number);

      if (this._shouldShowReminderForTime(currentTimeMinutes, hours, minutes, timeStr)) {
        return; // Only show one reminder at a time
      }
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: No reminder to show at current time');
  }

  /**
   * Get current time in minutes since midnight.
   * @param {Date} now - Current date/time
   * @returns {number} Minutes since midnight
   * @private
   */
  _getCurrentTimeInMinutes(now) {
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    return currentHours * 60 + currentMinutes;
  }

  /**
   * Check if we're still in the cooldown period after a skip.
   * @param {number} cooldownMinutes - The cooldown period in minutes
   * @returns {boolean} True if still in cooldown
   * @private
   */
  _isInCooldownPeriod(cooldownMinutes) {
    if (!this.lastSkipTime) return false;

    const timeSinceSkipMs = Date.now() - this.lastSkipTime;
    const timeSinceSkipMinutes = timeSinceSkipMs / (60 * 1000);
    return timeSinceSkipMinutes < cooldownMinutes;
  }

  /**
   * Check if reminder should be shown for a specific time.
   * @param {number} currentTimeMinutes - Current time in minutes since midnight
   * @param {number} hours - Reminder hour
   * @param {number} minutes - Reminder minute
   * @param {string} timeStr - Time string for logging
   * @returns {boolean} True if reminder was shown
   * @private
   */
  _shouldShowReminderForTime(currentTimeMinutes, hours, minutes, timeStr) {
    const reminderTimeMinutes = hours * 60 + minutes;
    const config = getConfig();

    // Check if we're at or past this reminder time
    if (currentTimeMinutes >= reminderTimeMinutes) {
      // Check if a timer was started today AFTER this reminder time
      // If so, don't show the reminder again (user already responded by starting a timer)
      if (this._wasTimerStartedAfterReminderTime(hours, minutes)) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer already started after this time', {
          reminderTime: timeStr,
          lastTimerStartTime: config.lastTimerStartTime
            ? new Date(config.lastTimerStartTime).toISOString()
            : null,
        });
        return false;
      }

      // Check if in cooldown period after skip
      if (this._isInCooldownPeriod(config.dailyReminderSkipCooldown)) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Skip cooldown active', {
          reminderTime: timeStr,
          lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
          cooldownMinutes: config.dailyReminderSkipCooldown,
        });
        return false;
      }

      // Check if this reminder was already shown today.
      // If user previously skipped and cooldown passed (checked above), allow re-showing.
      const wasShownToday = this._wasReminderShownToday(hours, minutes);
      const hasPreviouslySkipped = this.lastSkipTime !== null;

      // Show if: (1) not shown yet today, OR (2) user previously skipped (cooldown already verified above)
      if (!wasShownToday || hasPreviouslySkipped) {
        logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Showing reminder', {
          reminderTime: timeStr,
          wasShownToday: wasShownToday,
          showingAfterSkip: hasPreviouslySkipped,
        });
        this.showReminder();
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a timer was started today after the specified reminder time.
   * This prevents showing the reminder again after user started a timer.
   * @param {number} reminderHours - Reminder hour (0-23)
   * @param {number} reminderMinutes - Reminder minute (0-59)
   * @returns {boolean} True if timer was started after the reminder time today
   * @private
   */
  _wasTimerStartedAfterReminderTime(reminderHours, reminderMinutes) {
    const config = getConfig();
    const lastTimerStartTime = config.lastTimerStartTime;

    if (!lastTimerStartTime) {
      return false;
    }

    const startDate = new Date(lastTimerStartTime);
    const today = this._getTodayDateString();
    const startDateStr = this._getDateString(startDate);

    // Only consider timer starts from today
    if (startDateStr !== today) {
      return false;
    }

    // Check if timer was started at or after the reminder time
    const startHours = startDate.getHours();
    const startMinutes = startDate.getMinutes();
    const startTimeMinutes = startHours * 60 + startMinutes;
    const reminderTimeMinutes = reminderHours * 60 + reminderMinutes;

    return startTimeMinutes >= reminderTimeMinutes;
  }

  /**
   * Check if a reminder for the given time was already shown today.
   * Checks within a 2-minute window to account for the periodic check interval.
   * @param {number} hours - Reminder hour (0-23)
   * @param {number} minutes - Reminder minute (0-59)
   * @returns {boolean} True if reminder was shown today
   * @private
   */
  _wasReminderShownToday(hours, minutes) {
    const today = this._getTodayDateString();

    for (const shownTimestamp of this.remindersShownToday) {
      const shownDate = new Date(shownTimestamp);
      const shownDateStr = this._getDateString(shownDate);

      // Only check reminders from today
      if (shownDateStr === today) {
        // Compare hours and minutes directly instead of timestamp difference
        const shownHours = shownDate.getHours();
        const shownMinutes = shownDate.getMinutes();

        // If the shown reminder matches this reminder's hour and minute (±1 minute tolerance)
        if (shownHours === hours && Math.abs(shownMinutes - minutes) <= 1) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get today's date in YYYY-MM-DD format.
   * @returns {string} Today's date
   * @private
   */
  _getTodayDateString() {
    const now = new Date();
    return this._getDateString(now);
  }

  /**
   * Get date string in YYYY-MM-DD format.
   * @param {Date} date - Date object
   * @returns {string} Date string
   * @private
   */
  _getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Check if daily reminder overlay is currently visible.
   * @returns {boolean} True if reminder is visible
   * @private
   */
  _isDailyReminderVisible() {
    return this.reminderOverlay || this.isShowing;
  }

  /**
   * Check if timer is currently active.
   * @returns {boolean} True if timer is active
   * @private
   */
  _isTimerActive() {
    return window.zenPomodoroApp?.timer?.isActive ?? false;
  }

  /**
   * Check if post-session reminder is visible.
   * @returns {boolean} True if post-session reminder is visible
   * @private
   */
  _isPostSessionReminderVisible() {
    return window.zenPomodoroApp?.postSessionReminder?.isShowing ?? false;
  }

  /**
   * Check if daily reminder should be blocked from showing.
   * @returns {boolean} True if reminder should not be shown
   * @private
   */
  _shouldBlockDailyReminder() {
    if (this._isDailyReminderVisible()) return true;
    if (this._isTimerActive()) return true;
    if (this._isPostSessionReminderVisible()) {
      logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Post-session reminder is showing');
      return true;
    }
    return false;
  }

  /**
   * Show the daily reminder overlay.
   * This blocks browser interaction until user starts a timer or skips.
   */
  showReminder() {
    if (this._shouldBlockDailyReminder()) return;

    logger.log(LOG_CATEGORIES.TIMER, 'Showing daily reminder overlay');
    this.isShowing = true;

    // Record that this reminder was shown
    this.remindersShownToday.push(Date.now());
    this._saveState();

    // Pause post-session reminder while daily reminder is showing
    window.zenPomodoroApp?.postSessionReminder?.pauseIdleTracking();

    this._createOverlay();
    document.documentElement.appendChild(this.reminderOverlay);
  }

  /**
   * Hide the daily reminder overlay.
   * Called when user starts a timer or successfully skips.
   */
  hideReminder() {
    if (!this.reminderOverlay && !this.isShowing) {
      return;
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Hiding daily reminder overlay');
    this.isShowing = false;

    // Resume post-session reminder idle tracking
    window.zenPomodoroApp?.postSessionReminder?.resumeIdleTracking();

    // Clear time display interval
    this._clearTimeDisplayInterval();

    // Clear hold interval if active
    this._clearHoldInterval();

    // Call cleanup function to remove event listeners
    if (this._holdHandlersCleanup) {
      this._holdHandlersCleanup();
      this._holdHandlersCleanup = null;
    }

    if (this.reminderOverlay) {
      this.reminderOverlay.remove();
      this.reminderOverlay = null;
    }
  }

  /**
   * Clear the time display interval if it exists.
   * @private
   */
  _clearTimeDisplayInterval() {
    if (this._timeDisplayInterval) {
      clearInterval(this._timeDisplayInterval);
      this._timeDisplayInterval = null;
    }
  }

  /**
   * Start the periodic check for showing the reminder.
   * Checks every minute if conditions are met to show the reminder.
   * @private
   */
  _startPeriodicCheck() {
    // Clear any existing interval
    this._stopPeriodicCheck();

    // Check every minute
    this.checkIntervalId = setInterval(() => {
      // Stop checking if reminder is already showing
      if (this.isShowing) {
        return;
      }

      this._checkAndShowReminder();
    }, DAILY_REMINDER_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the periodic reminder check.
   * @private
   */
  _stopPeriodicCheck() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  /**
   * Record that a timer was started.
   * Saves timestamp and resets skip count.
   */
  recordTimerStarted() {
    const config = getConfig();
    config.lastTimerStartTime = Date.now();

    // Reset skip count when timer starts
    this.skipCount = 0;
    this.lastSkipTime = null;

    saveConfig(config);
    this._saveState();

    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer started, resetting skip count', {
      lastTimerStartTime: new Date(config.lastTimerStartTime).toISOString(),
    });
  }

  /**
   * Called when timer completes a full session.
   * Resets skip count and cooldown to ensure clean state.
   * Note: We do NOT clear lastTimerStartTime here - it's used to prevent
   * showing the reminder again after timer completion for that time slot.
   */
  onTimerComplete() {
    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Timer completed, resetting skip state', {
      previousSkipCount: this.skipCount,
      previousLastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
    });

    this.skipCount = 0;
    this.lastSkipTime = null;
    this._saveState();
  }

  /**
   * Create the blocking reminder overlay.
   * @private
   */
  _createOverlay() {
    const config = getConfig();

    this.reminderOverlay = document.createElement('div');
    this.reminderOverlay.id = 'zen-pomodoro-daily-reminder';
    this.reminderOverlay.className = 'active';

    // Content container
    const content = document.createElement('div');
    content.id = 'zen-pomodoro-daily-reminder-content';

    // Icon
    const icon = document.createElement('div');
    icon.id = 'zen-pomodoro-daily-reminder-icon';
    icon.textContent = '⏰';

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Time to Start Your Focus Session!';

    // Message
    const message = document.createElement('p');
    message.textContent =
      "It's time to begin your daily focus session. Start a timer to begin working productively.";

    // Skip info (shows skip count and current requirement)
    const skipInfo = document.createElement('div');
    skipInfo.id = 'zen-pomodoro-daily-reminder-skip-info';
    if (this.skipCount > 0) {
      const escalatedHold = this._calculateEscalatedValue(config.dailyReminderSkipHoldDuration);
      const escalatedCode = this._calculateEscalatedValue(config.dailyReminderSkipCodeLength);
      const requirementText =
        config.dailyReminderSkipMethod === LOCKOUT_METHODS.HOLD
          ? `Hold for ${escalatedHold} seconds`
          : `Enter ${escalatedCode} characters`;
      skipInfo.textContent = `Skip #${this.skipCount + 1} - ${requirementText}`;
    } else {
      const requirementText =
        config.dailyReminderSkipMethod === LOCKOUT_METHODS.HOLD
          ? `Hold for ${config.dailyReminderSkipHoldDuration} seconds`
          : `Enter ${config.dailyReminderSkipCodeLength} characters`;
      skipInfo.textContent = requirementText;
    }

    // Buttons container
    const buttons = document.createElement('div');
    buttons.id = 'zen-pomodoro-daily-reminder-buttons';

    // Start Timer button
    const startButton = document.createElement('button');
    startButton.id = 'zen-pomodoro-daily-reminder-start-btn';
    startButton.className = 'zen-pomodoro-daily-reminder-start-btn';
    startButton.textContent = 'Start Timer';
    startButton.addEventListener('click', () => {
      this._handleStartTimerClick();
    });

    // Skip button (with hold/code requirement)
    const skipButton = document.createElement('button');
    skipButton.id = 'zen-pomodoro-daily-reminder-skip-btn';
    skipButton.className = 'zen-pomodoro-daily-reminder-skip-btn';
    skipButton.textContent = 'Skip for Now';
    skipButton.addEventListener('click', () => {
      this._showSkipChallenge(config);
    });

    buttons.appendChild(startButton);
    buttons.appendChild(skipButton);

    // Assemble content
    content.appendChild(icon);
    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(skipInfo);
    content.appendChild(buttons);

    this.reminderOverlay.appendChild(content);
  }

  /**
   * Show the skip challenge (hold or code entry).
   * @param {Object} config - Configuration object
   * @private
   */
  _showSkipChallenge(config) {
    // Remove the buttons and replace with challenge UI
    const content = this.reminderOverlay.querySelector('#zen-pomodoro-daily-reminder-content');
    const buttons = this.reminderOverlay.querySelector('#zen-pomodoro-daily-reminder-buttons');
    const skipInfo = this.reminderOverlay.querySelector('#zen-pomodoro-daily-reminder-skip-info');

    if (!content || !buttons) return;

    // Remove current buttons
    buttons.remove();
    if (skipInfo) skipInfo.remove();

    // Create challenge container
    const challengeContainer = document.createElement('div');
    challengeContainer.id = 'zen-pomodoro-daily-reminder-challenge';

    if (config.dailyReminderSkipMethod === LOCKOUT_METHODS.HOLD) {
      this._createHoldChallenge(challengeContainer, config);
    } else {
      this._createCodeChallenge(challengeContainer, config);
    }

    content.appendChild(challengeContainer);
  }

  /**
   * Create hold-to-unlock challenge UI.
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration object
   * @private
   */
  _createHoldChallenge(container, config) {
    const escalatedDuration = this._calculateEscalatedValue(config.dailyReminderSkipHoldDuration);

    // Timer display
    const timerDiv = document.createElement('div');
    timerDiv.id = 'zen-pomodoro-daily-reminder-hold-timer';
    timerDiv.className = 'zen-pomodoro-daily-reminder-hold-timer';
    timerDiv.textContent = escalatedDuration.toString();
    this._holdTimerElement = timerDiv;

    // Instructions
    const instructions = document.createElement('p');
    instructions.className = 'zen-pomodoro-daily-reminder-instructions';
    instructions.textContent = 'seconds remaining - hold button to skip';

    // Hold button with progress bar
    const holdButton = document.createElement('button');
    holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
    holdButton.id = 'zen-pomodoro-daily-reminder-hold-btn';
    holdButton.textContent = 'Hold to Skip';

    const holdProgress = document.createElement('div');
    holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
    holdProgress.id = 'zen-pomodoro-daily-reminder-hold-progress';
    holdButton.appendChild(holdProgress);

    // Button row
    const buttonRow = document.createElement('div');
    buttonRow.className = 'zen-pomodoro-dialog-buttons';

    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      this._clearHoldInterval();
      this.hideReminder();
      // Immediately re-show to reset the UI
      setTimeout(() => this.showReminder(), 100);
    });

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(holdButton);

    container.appendChild(timerDiv);
    container.appendChild(instructions);
    container.appendChild(buttonRow);

    // Setup hold handlers
    this._setupHoldHandlers(holdButton, holdProgress, escalatedDuration);
  }

  /**
   * Setup hold-to-unlock event handlers.
   * @param {HTMLElement} holdButton - The hold button element
   * @param {HTMLElement} holdProgress - The progress bar element
   * @param {number} waitTime - Total wait time in seconds
   * @private
   */
  _setupHoldHandlers(holdButton, holdProgress, waitTime) {
    // Store cleanup function to prevent memory leaks
    this._holdHandlersCleanup = setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime,
      timerElement: this._holdTimerElement,
      onComplete: () => this._handleSkip(),
      clearInterval: () => this._clearHoldInterval(),
      setIntervalId: (id) => {
        this._holdIntervalId = id;
      },
      logCategory: LOG_CATEGORIES.TIMER,
      logMessage: 'Daily reminder hold-to-skip completed',
    });
  }

  /**
   * Clear the hold interval if active.
   * @private
   */
  _clearHoldInterval() {
    if (this._holdIntervalId) {
      clearInterval(this._holdIntervalId);
      this._holdIntervalId = null;
    }
  }

  /**
   * Create code entry challenge UI.
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration object
   * @private
   */
  _createCodeChallenge(container, config) {
    const escalatedLength = this._calculateEscalatedValue(config.dailyReminderSkipCodeLength);
    const code = generateRandomCode(escalatedLength, 'alphanumeric');

    // Instructions
    const instructions = document.createElement('p');
    instructions.className = 'zen-pomodoro-daily-reminder-instructions';
    instructions.textContent = `Enter the ${escalatedLength}-character code below to skip:`;

    // Code container
    const codeContainer = document.createElement('div');
    codeContainer.className = 'zen-pomodoro-code-container';

    // Code display
    const codeDiv = document.createElement('div');
    codeDiv.className = 'zen-pomodoro-lock-code-display';
    codeDiv.textContent = code;

    // Input field
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'zen-pomodoro-lock-code-input';
    input.placeholder = 'Enter code...';
    input.autocomplete = 'off';
    input.spellcheck = false;

    codeContainer.appendChild(codeDiv);
    codeContainer.appendChild(input);

    // Button row
    const buttonRow = document.createElement('div');
    buttonRow.className = 'zen-pomodoro-dialog-buttons';

    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      this.hideReminder();
      // Immediately re-show to reset the UI
      setTimeout(() => this.showReminder(), 100);
    });

    // Verify button
    const verifyButton = document.createElement('button');
    verifyButton.className = 'zen-pomodoro-dialog-button';
    verifyButton.textContent = 'Verify';
    verifyButton.addEventListener('click', () => {
      if (input.value === code) {
        this._handleSkip();
      } else {
        input.value = '';
        input.placeholder = 'Incorrect - try again...';
        setTimeout(() => {
          input.placeholder = 'Enter code...';
        }, 2000);
      }
    });

    // Enter key support
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        verifyButton.click();
      }
    });

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(verifyButton);

    container.appendChild(instructions);
    container.appendChild(codeContainer);
    container.appendChild(buttonRow);

    // Focus input
    setTimeout(() => input.focus(), 100);
  }

  /**
   * Calculate the escalated skip requirement based on skip count.
   * @param {number} baseValue - Base value for the requirement
   * @returns {number} Escalated value
   * @private
   */
  _calculateEscalatedValue(baseValue) {
    return Math.ceil(baseValue * Math.pow(DAILY_REMINDER_ESCALATION_FACTOR, this.skipCount));
  }

  /**
   * Handle skip action - dismisses reminder and increments skip count.
   * @private
   */
  _handleSkip() {
    this.skipCount++;
    this.lastSkipTime = Date.now();

    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder skipped', {
      skipCount: this.skipCount,
    });

    // Save state to persist across browser restarts
    this._saveState();

    this.hideReminder();
  }

  /**
   * Handle the "Start Timer" button click.
   * Opens the start timer dialog and hides the reminder when timer starts.
   * @private
   */
  _handleStartTimerClick() {
    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Start Timer button clicked');

    // Don't hide reminder yet - wait for timer to actually start
    // The reminder will be hidden by onTimerStart() callback

    // Use callback if set, otherwise try to show start dialog directly
    if (this.onStartTimer) {
      this.onStartTimer();
    } else if (window.zenPomodoroApp?.keyboardShortcut) {
      // Fallback: use keyboard shortcut handler to show start dialog
      // This is a fallback - normally the callback is set in ZenPomodoroApp
      window.zenPomodoroApp.keyboardShortcut.showConfigDialog();
    }
  }

  /**
   * Manually trigger the reminder for testing purposes.
   * Ignores time and date checks.
   */
  triggerReminderForTesting() {
    logger.log(LOG_CATEGORIES.TIMER, 'Daily reminder: Manually triggered for testing');

    // Force show even if conditions aren't met
    if (this.reminderOverlay) {
      this.hideReminder();
    }

    this.showReminder();
  }

  /**
   * Get time remaining until next daily reminder will appear (in seconds).
   * Returns null if reminder shouldn't show or conditions aren't met.
   * @returns {number|null} Seconds until reminder, or null if not applicable
   */
  /**
   * Convert a time string (HH:MM) to minutes since midnight.
   * Expects pre-validated input from isValidTimeFormat() filter.
   * @param {string} timeStr - Time string in HH:MM format
   * @returns {number} Minutes since midnight
   * @private
   */
  _timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Find the next unshown reminder from sorted times.
   * @param {Array<string>} sortedTimes - Sorted time strings
   * @param {number} currentTimeMinutes - Current time in minutes since midnight
   * @returns {{hours: number, minutes: number}|null} Next reminder time, or null
   * @private
   */
  _findNextUnshownReminder(sortedTimes, currentTimeMinutes) {
    for (const timeStr of sortedTimes) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const reminderTimeMinutes = hours * 60 + minutes;
      const wasShown = this._wasReminderShownToday(hours, minutes);

      if (wasShown) continue;

      if (reminderTimeMinutes > currentTimeMinutes) {
        return { hours, minutes };
      }
      if (reminderTimeMinutes === currentTimeMinutes) {
        return { hours: -1, minutes: 0 }; // Signal: show now
      }
    }
    return null;
  }

  getTimeUntilDailyReminder() {
    const config = getConfig();

    if (config.reminderMode !== Constants.REMINDER_MODES.DAILY) return null;

    const reminderTimes = config.dailyReminderTimes;
    if (!isNonEmptyArray(reminderTimes)) return null;

    this._resetIfNewDay();

    const now = new Date();
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

    const sortedTimes = reminderTimes
      .filter((timeStr) => isValidTimeFormat(timeStr))
      .slice()
      .sort((a, b) => this._timeToMinutes(a) - this._timeToMinutes(b));

    const nextReminder = this._findNextUnshownReminder(sortedTimes, currentTimeMinutes);
    if (!nextReminder) return null;
    if (nextReminder.hours === -1) return 0; // Show now

    const reminderDate = new Date();
    reminderDate.setHours(nextReminder.hours, nextReminder.minutes, 0, 0);
    return Math.ceil((reminderDate - now) / 1000);
  }

  /**
   * Clean up the reminder manager.
   */
  destroy() {
    // Clear periodic check interval
    this._stopPeriodicCheck();

    // Clear time display interval
    this._clearTimeDisplayInterval();

    // Clear hold interval
    this._clearHoldInterval();

    // Call cleanup function to remove event listeners
    if (this._holdHandlersCleanup) {
      this._holdHandlersCleanup();
      this._holdHandlersCleanup = null;
    }

    if (this.reminderOverlay) {
      this.reminderOverlay.remove();
      this.reminderOverlay = null;
    }
    this.isShowing = false;
  }
}

export default DailyReminderManager;
