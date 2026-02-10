import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import {
  getConfig, saveConfig, getPref, setPref,
  formatTime, formatTimeWithHours, sanitizeText, generateRandomCode,
  LOG_CATEGORIES, LOCKOUT_METHODS,
  POST_SESSION_ESCALATION_FACTOR, POST_SESSION_CHECK_INTERVAL_MS,
  EARLY_MORNING_CUTOFF_MINUTES
} from './helpers.js';
import { isValidTimeFormat } from './ui-helpers.js';
import { updateCountdownElement } from './ui-helpers.js';
import { setupHoldToUnlockHandlers } from './shared-blocker-utils.js';

// ============================================
// Post-Session Reminder Manager
// ============================================

/**
 * PostSessionReminderManager handles reminders to start a new timer
 * after a configurable idle time following timer completion.
 *
 * Features:
 * - Tracks idle time after timer/pomodoro cycle COMPLETES
 * - Shows blocking overlay after configured idle time
 * - User can start a new timer or skip the reminder
 * - Skip requires hold/code completion with escalating difficulty
 * - Skip count resets when a new timer is started
 * - Skip count persists across browser restarts
 * - Reminders stop after focus time goal is reached
 */
class PostSessionReminderManager {
  constructor() {
    this.reminderOverlay = null;
    this.isShowing = false;
    this.idleStartTime = null; // When the last timer completed
    this.skipCount = 0; // Number of times user has skipped
    this.lastSkipTime = null; // When the last skip occurred
    this.checkIntervalId = null; // Interval for checking if reminder should show
    this.onStartTimer = null; // Callback when user clicks "Start Timer"
    this._holdIntervalId = null; // Hold-to-unlock interval
    this._holdTimerElement = null; // Timer display element for hold mode
    this._pausedIdleStartTime = null; // Temporarily stored idleStartTime when paused by daily reminder
  }

  /**
   * Initialize the post-session reminder manager.
   * Loads persisted state from config.
   */
  init() {
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Post-Session Reminder Manager');
    this._loadState();
    this._startIdleCheck();
  }

  /**
   * Load persisted state from config.
   * Restores skipCount, lastSkipTime, and idleStartTime across browser restarts.
   * @private
   */
  _loadState() {
    const config = getConfig();

    this.skipCount = config.postSessionSkipCount || 0;
    this.lastSkipTime = config.postSessionLastSkipTime || null;
    this.idleStartTime = config.postSessionIdleStartTime || null;

    logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Loaded persisted state', {
      skipCount: this.skipCount,
      lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
      idleStartTime: this.idleStartTime ? new Date(this.idleStartTime).toISOString() : null,
    });
  }

  /**
   * Save current state to config for persistence across browser restarts.
   * @private
   */
  _saveState() {
    const config = getConfig();

    config.postSessionSkipCount = this.skipCount;
    config.postSessionLastSkipTime = this.lastSkipTime;
    config.postSessionIdleStartTime = this.idleStartTime;

    saveConfig(config);

    logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Saved state', {
      skipCount: this.skipCount,
      lastSkipTime: this.lastSkipTime ? new Date(this.lastSkipTime).toISOString() : null,
      idleStartTime: this.idleStartTime ? new Date(this.idleStartTime).toISOString() : null,
    });
  }

  /**
   * Check if the focus time goal has been reached for today.
   * When the goal is reached, post-session reminders should stop.
   * @returns {boolean} True if focus time goal is reached
   * @private
   */
  _checkFocusTimeGoalReached() {
    const config = getConfig();

    const focusTimeGoal = config.postSessionFocusTimeGoal || 150; // Default 2h 30min
    const totalFocusTimeToday = config.totalFocusTimeToday || 0;

    const goalReached = totalFocusTimeToday >= focusTimeGoal;

    if (goalReached) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Focus time goal reached', {
        totalFocusTimeToday: Math.round(totalFocusTimeToday),
        focusTimeGoal: focusTimeGoal,
      });
    }

    return goalReached;
  }

  /**
   * Called when a timer completes naturally (not stopped manually).
   * Starts tracking idle time for post-session reminder.
   *
   * Also re-enables reminders if they were disabled for the day. This allows
   * reminders to work again immediately after finishing a session, encouraging
   * continued productivity. The disabled flag (postSessionReminderDisabledForDay)
   * is set when the auto-off time is reached, and reset here when a timer completes.
   */
  onTimerComplete() {
    const config = getConfig();
    if (config.reminderMode !== Constants.REMINDER_MODES.POST_SESSION) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Feature disabled (reminderMode not set to post-session)');
      return;
    }

    // Reset skip state when timer completes
    this.skipCount = 0;
    this.lastSkipTime = null;

    this.idleStartTime = Date.now();

    logger.log(
      LOG_CATEGORIES.TIMER,
      'Post-session reminder: Timer completed, starting idle tracking and resetting skip state',
      {
        idleStartTime: new Date(this.idleStartTime).toISOString(),
        resetSkipCount: this.skipCount,
        resetLastSkipTime: this.lastSkipTime,
      }
    );

    // Re-enable post-session reminders for the day (reset the disabled flag)
    if (config.postSessionReminderDisabledForDay) {
      config.postSessionReminderDisabledForDay = false;
      saveConfig(config);
      logger.log(
        LOG_CATEGORIES.TIMER,
        'Post-session reminder: Re-enabled for the day after timer completion'
      );
    }

    // Save state to persist idleStartTime and reset skip state across browser restarts
    this._saveState();
  }

  /**
   * Called when a new timer is started.
   * Resets idle tracking and skip count.
   */
  onTimerStart() {
    logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Timer started, resetting state', {
      previousIdleStartTime: this.idleStartTime
        ? new Date(this.idleStartTime).toISOString()
        : null,
      previousSkipCount: this.skipCount,
    });
    this.idleStartTime = null;
    this.skipCount = 0;
    this.lastSkipTime = null;
    this._saveState(); // Persist the reset state
    this.hideReminder();
  }

  /**
   * Pause idle tracking while daily reminder is showing.
   * Saves the current idleStartTime and temporarily nullifies it.
   */
  pauseIdleTracking() {
    if (this.idleStartTime) {
      this._pausedIdleStartTime = this.idleStartTime;
      this.idleStartTime = null;
      logger.log(
        LOG_CATEGORIES.TIMER,
        'Post-session reminder: Paused idle tracking (daily reminder showing)',
        {
          pausedIdleStartTime: this._pausedIdleStartTime
            ? new Date(this._pausedIdleStartTime).toISOString()
            : null,
        }
      );
    }
  }

  /**
   * Resume idle tracking after daily reminder is hidden.
   * Restores the previously paused idleStartTime.
   */
  resumeIdleTracking() {
    if (this._pausedIdleStartTime) {
      this.idleStartTime = this._pausedIdleStartTime;
      this._pausedIdleStartTime = null;
      logger.log(
        LOG_CATEGORIES.TIMER,
        'Post-session reminder: Resumed idle tracking (daily reminder hidden)',
        {
          idleStartTime: this.idleStartTime ? new Date(this.idleStartTime).toISOString() : null,
        }
      );
    }
  }

  /**
   * Start the periodic check for showing the reminder.
   * Also checks if current time is past the end time.
   * @private
   */
  _startIdleCheck() {
    // Clear any existing interval
    this._stopIdleCheck();

    // Check every minute
    this.checkIntervalId = setInterval(() => {
      this._checkAutoDisableTime();
      this._checkAndShowReminder();
    }, POST_SESSION_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the periodic idle check.
   * @private
   */
  _stopIdleCheck() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
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
   * Check if current time is past the configured end time and auto-disable reminder.
   * This automatically turns off post-session reminders after the configured time.
   * @private
   */
  _checkAutoDisableTime() {
    const config = getConfig();

    // Skip if feature is disabled or already disabled for the day
    if (config.reminderMode !== Constants.REMINDER_MODES.POST_SESSION || config.postSessionReminderDisabledForDay) {
      return;
    }

    const endTime = config.postSessionReminderEndTime;

    // Validate time format
    if (!isValidTimeFormat(endTime)) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Invalid end time format', {
        endTime: endTime,
      });
      return;
    }

    // Check if current time is past the end time
    if (this._isAfterEndTime(endTime)) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Auto-disabling for the day', {
        endTime: endTime,
        currentTime: new Date().toLocaleTimeString(),
      });

      config.postSessionReminderDisabledForDay = true;
      saveConfig(config);

      // Hide reminder if currently showing
      if (this.isShowing) {
        this.hideReminder();
      }
    }
  }

  /**
   * Check if a given time (in minutes since midnight) is in the early morning period.
   * Early morning is defined as 00:00-05:59 (0-359 minutes since midnight).
   *
   * @param {number} minutesSinceMidnight - Minutes since midnight (0-1439)
   * @returns {boolean} True if time is in early morning period
   * @private
   */
  _isEarlyMorning(minutesSinceMidnight) {
    return minutesSinceMidnight < EARLY_MORNING_CUTOFF_MINUTES;
  }

  /**
   * Check if current time is at or after the configured end time.
   * This method is designed for late-night auto-off times (e.g., 00:30 for 12:30 AM).
   * It correctly handles the early morning period by checking if we're past the end time
   * but still in the early morning hours (before the typical wake-up time).
   *
   * Logic:
   * - If endTime is early morning (00:00-05:59), we're only "after" it if current time
   *   is also in that early morning range AND past the end time.
   * - If endTime is later in day (06:00-23:59), standard comparison applies.
   *
   * Examples (with endTime = 00:30):
   * - Current: 23:00 → false (not yet reached early morning cutoff)
   * - Current: 00:45 → true (past 00:30 in early morning window)
   * - Current: 14:00 → false (outside early morning window, auto-off doesn't apply)
   *
   * @param {string} endTime - Time in HH:MM format (must be pre-validated by isValidTimeFormat)
   * @returns {boolean} True if current time is in the auto-off period
   * @private
   */
  _isAfterEndTime(endTime) {
    const [hours, minutes] = endTime.split(':').map(Number);

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();

    // Convert to minutes since midnight for comparison
    const currentMinutesSinceMidnight = currentHours * 60 + currentMinutes;
    const endMinutesSinceMidnight = hours * 60 + minutes;

    // If endTime is in early morning (00:00-05:59)
    if (this._isEarlyMorning(endMinutesSinceMidnight)) {
      // We're only "after" the end time if:
      // 1. Current time is also in early morning (00:00-05:59)
      // 2. AND current time >= end time
      return (
        this._isEarlyMorning(currentMinutesSinceMidnight) &&
        currentMinutesSinceMidnight >= endMinutesSinceMidnight
      );
    } else {
      // For non-early-morning end times, standard comparison
      return currentMinutesSinceMidnight >= endMinutesSinceMidnight;
    }
  }

  /**
   * Check if conditions are met to potentially show the reminder.
   * @returns {boolean} True if basic conditions for showing are met
   * @private
   */
  _canPotentiallyShowReminder() {
    return (
      this._isPostSessionFeatureEnabled() &&
      !this._isReminderCurrentlyShowing() &&
      !this._isTimerCurrentlyActive() &&
      this._hasIdleStartTime() &&
      !this._hasFocusTimeGoalBeenReached() &&
      !this._isReminderDisabledForDay() &&
      !this._isDailyReminderShowing()
    );
  }

  /**
   * Check if post-session reminder feature is enabled.
   * @returns {boolean} True if feature is enabled
   * @private
   */
  _isPostSessionFeatureEnabled() {
    const config = getConfig();
    return config.reminderMode === Constants.REMINDER_MODES.POST_SESSION;
  }

  /**
   * Check if reminder is currently showing.
   * @returns {boolean} True if reminder is currently being displayed
   * @private
   */
  _isReminderCurrentlyShowing() {
    return this.isShowing;
  }

  /**
   * Check if timer is currently active.
   * @returns {boolean} True if timer is running
   * @private
   */
  _isTimerCurrentlyActive() {
    return window.zenPomodoroApp?.timer?.isActive || false;
  }

  /**
   * Check if idle start time is set.
   * @returns {boolean} True if timer has completed and idle tracking started
   * @private
   */
  _hasIdleStartTime() {
    return !!this.idleStartTime;
  }

  /**
   * Check if focus time goal has been reached.
   * @returns {boolean} True if daily focus goal achieved
   * @private
   */
  _hasFocusTimeGoalBeenReached() {
    return this._checkFocusTimeGoalReached();
  }

  /**
   * Check if reminder has been disabled for the day.
   * @returns {boolean} True if disabled for today
   * @private
   */
  _isReminderDisabledForDay() {
    const config = getConfig();
    if (config.postSessionReminderDisabledForDay) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Disabled for the day');
      return true;
    }
    return false;
  }

  /**
   * Check if daily reminder is currently showing.
   * @returns {boolean} True if daily reminder is active (mutual exclusion)
   * @private
   */
  _isDailyReminderShowing() {
    if (window.zenPomodoroApp?.dailyReminder?.isShowing) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Daily reminder is showing');
      return true;
    }
    return false;
  }

  /**
   * Check if the reminder should be shown based on current state.
   * @private
   */
  _checkAndShowReminder() {
    // Check basic preconditions
    if (!this._canPotentiallyShowReminder()) return;

    const config = getConfig();
    const now = Date.now();
    const idleTimeMs = now - this.idleStartTime;
    const idleTimeMinutes = idleTimeMs / (60 * 1000);

    // If user has skipped before, check against cooldown
    if (this._isInCooldownPeriod(config.postSessionSkipCooldown)) {
      return;
    }

    // Check if enough idle time has passed
    if (idleTimeMinutes >= config.postSessionIdleTime) {
      logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Showing reminder', {
        idleTimeMinutes: Math.round(idleTimeMinutes),
        skipCount: this.skipCount,
      });
      this.showReminder();
    }
  }

  /**
   * Check if conditions are met to show a countdown for next reminder.
   * @returns {boolean} True if countdown should be shown
   * @private
   */
  _canShowReminderCountdown() {
    const config = getConfig();

    // Check basic conditions
    if (config.reminderMode !== Constants.REMINDER_MODES.POST_SESSION) return false;
    if (this.isShowing) return false;
    if (!this.idleStartTime) return false;
    if (window.zenPomodoroApp?.timer?.isActive) return false;
    if (this._checkFocusTimeGoalReached()) return false;

    return true;
  }

  /**
   * Get time remaining until next reminder (in seconds).
   * Returns null if reminder shouldn't show or conditions aren't met.
   * @returns {number|null} Seconds until reminder, or null if not applicable
   */
  getTimeUntilNextReminder() {
    if (!this._canShowReminderCountdown()) {
      return null;
    }

    const config = getConfig();
    const now = Date.now();

    // If in cooldown, calculate time until cooldown ends
    if (this._isInCooldownPeriod(config.postSessionSkipCooldown)) {
      const cooldownEndMs = this.lastSkipTime + config.postSessionSkipCooldown * 60 * 1000;
      const remainingMs = cooldownEndMs - now;
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    // Calculate time until first/next reminder
    const idleTimeMs = now - this.idleStartTime;
    const requiredIdleMs = config.postSessionIdleTime * 60 * 1000;
    const remainingMs = requiredIdleMs - idleTimeMs;

    // If reminder should already be shown, return 0
    if (remainingMs <= 0) return 0;

    return Math.ceil(remainingMs / 1000);
  }

  /**
   * Calculate the escalated skip requirement based on skip count.
   * @param {number} baseValue - Base value for the requirement
   * @returns {number} Escalated value
   * @private
   */
  _calculateEscalatedValue(baseValue) {
    return Math.ceil(baseValue * Math.pow(POST_SESSION_ESCALATION_FACTOR, this.skipCount));
  }

  /**
   * Show the post-session reminder overlay.
   */
  showReminder() {
    if (this.reminderOverlay || this.isShowing) return;

    // Don't show if timer is active
    if (window.zenPomodoroApp?.timer?.isActive) return;

    logger.log(LOG_CATEGORIES.TIMER, 'Showing post-session reminder overlay', {
      skipCount: this.skipCount,
    });

    this.isShowing = true;
    this._createOverlay();
    document.documentElement.appendChild(this.reminderOverlay);
  }

  /**
   * Hide the post-session reminder overlay.
   */
  hideReminder() {
    if (!this.reminderOverlay && !this.isShowing) return;

    logger.log(LOG_CATEGORIES.TIMER, 'Hiding post-session reminder overlay');
    this.isShowing = false;

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
   * Handle skip action - dismisses reminder for cooldown period.
   * Persists the skip state across browser restarts.
   * @private
   */
  _handleSkip() {
    this.skipCount++;
    this.lastSkipTime = Date.now();

    logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder skipped', {
      skipCount: this.skipCount,
      cooldownMinutes: getConfig().postSessionSkipCooldown,
    });

    // Save state to persist across browser restarts
    this._saveState();

    this.hideReminder();
  }

  /**
   * Create the blocking reminder overlay.
   * @private
   */
  _createOverlay() {
    const config = getConfig();

    this.reminderOverlay = document.createElement('div');
    this.reminderOverlay.id = 'zen-pomodoro-post-session-reminder';
    this.reminderOverlay.className = 'active';

    // Content container
    const content = document.createElement('div');
    content.id = 'zen-pomodoro-post-session-reminder-content';

    // Icon
    const icon = document.createElement('div');
    icon.id = 'zen-pomodoro-post-session-reminder-icon';
    icon.textContent = '⏱️';

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Time to Get Back to Work!';

    // Message
    const message = document.createElement('p');
    message.textContent =
      "It's been a while since your last focus session. Start a new timer to stay productive!";

    // Skip info (shows skip count and current requirement)
    const skipInfo = document.createElement('div');
    skipInfo.id = 'zen-pomodoro-post-session-skip-info';
    if (this.skipCount > 0) {
      const escalatedHold = this._calculateEscalatedValue(config.postSessionSkipHoldDuration);
      const escalatedCode = this._calculateEscalatedValue(config.postSessionSkipCodeLength);
      const requirementText =
        config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD
          ? `Hold for ${escalatedHold} seconds`
          : `Enter ${escalatedCode} characters`;
      skipInfo.textContent = `Skip #${this.skipCount + 1} - ${requirementText}`;
    } else {
      const requirementText =
        config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD
          ? `Hold for ${config.postSessionSkipHoldDuration} seconds`
          : `Enter ${config.postSessionSkipCodeLength} characters`;
      skipInfo.textContent = requirementText;
    }

    // Buttons container
    const buttons = document.createElement('div');
    buttons.id = 'zen-pomodoro-post-session-buttons';

    // Start Timer button
    const startButton = document.createElement('button');
    startButton.id = 'zen-pomodoro-post-session-start-btn';
    startButton.className = 'zen-pomodoro-post-session-start-btn';
    startButton.textContent = 'Start Timer';
    startButton.addEventListener('click', () => {
      this._handleStartTimerClick();
    });

    // Skip button (with hold/code requirement)
    const skipButton = document.createElement('button');
    skipButton.id = 'zen-pomodoro-post-session-skip-btn';
    skipButton.className = 'zen-pomodoro-post-session-skip-btn';
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
    const content = this.reminderOverlay.querySelector(
      '#zen-pomodoro-post-session-reminder-content'
    );
    const buttons = this.reminderOverlay.querySelector('#zen-pomodoro-post-session-buttons');
    const skipInfo = this.reminderOverlay.querySelector('#zen-pomodoro-post-session-skip-info');

    if (!content || !buttons) return;

    // Remove current buttons
    buttons.remove();
    if (skipInfo) skipInfo.remove();

    // Create challenge container
    const challengeContainer = document.createElement('div');
    challengeContainer.id = 'zen-pomodoro-post-session-challenge';

    if (config.postSessionSkipMethod === LOCKOUT_METHODS.HOLD) {
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
    const escalatedDuration = this._calculateEscalatedValue(config.postSessionSkipHoldDuration);

    // Timer display
    const timerDiv = document.createElement('div');
    timerDiv.id = 'zen-pomodoro-post-session-hold-timer';
    timerDiv.className = 'zen-pomodoro-post-session-hold-timer';
    timerDiv.textContent = escalatedDuration.toString();
    this._holdTimerElement = timerDiv;

    // Instructions
    const instructions = document.createElement('p');
    instructions.className = 'zen-pomodoro-post-session-instructions';
    instructions.textContent = 'seconds remaining - hold button to skip';

    // Hold button with progress bar
    const holdButton = document.createElement('button');
    holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
    holdButton.id = 'zen-pomodoro-post-session-hold-btn';
    holdButton.textContent = 'Hold to Skip';

    const holdProgress = document.createElement('div');
    holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
    holdProgress.id = 'zen-pomodoro-post-session-hold-progress';
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
   * Uses shared setupHoldToUnlockHandlers utility to reduce code duplication.
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
      logMessage: 'Post-session hold-to-skip completed',
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
    const escalatedLength = this._calculateEscalatedValue(config.postSessionSkipCodeLength);
    const code = generateRandomCode(escalatedLength, 'alphanumeric');

    // Instructions
    const instructions = document.createElement('p');
    instructions.className = 'zen-pomodoro-post-session-instructions';
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
    input.id = 'zen-pomodoro-post-session-code-input';
    input.className = 'zen-pomodoro-post-session-code-input';
    input.placeholder = 'Enter code here';

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
    verifyButton.textContent = 'Skip';

    const verifyCode = () => {
      if (input.value === code) {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session code verification successful');
        this._handleSkip();
      } else {
        logger.log(LOG_CATEGORIES.TIMER, 'Post-session code verification failed');
        window.zenPomodoroApp?.showCustomAlert('Incorrect Code', 'Please try again.');
      }
    };

    verifyButton.addEventListener('click', verifyCode);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyCode();
    });

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(verifyButton);

    container.appendChild(instructions);
    container.appendChild(codeContainer);
    container.appendChild(buttonRow);

    // Focus input
    setTimeout(() => input?.focus(), 0);
  }

  /**
   * Handle the "Start Timer" button click.
   * @private
   */
  _handleStartTimerClick() {
    logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Start Timer button clicked');

    // Don't hide reminder yet - wait for timer to actually start
    // The reminder will be hidden by onTimerStart() callback

    // Use callback if set, otherwise try to show start dialog directly
    if (this.onStartTimer) {
      this.onStartTimer();
    } else if (window.zenPomodoroApp?.keyboardShortcut) {
      window.zenPomodoroApp.keyboardShortcut.showConfigDialog();
    }
  }

  /**
   * Manually trigger the reminder for testing purposes.
   * Ignores idle time checks.
   */
  triggerReminderForTesting() {
    logger.log(LOG_CATEGORIES.TIMER, 'Post-session reminder: Manually triggered for testing');

    // Force show even if conditions aren't met
    if (this.reminderOverlay) {
      this.hideReminder();
    }

    this.showReminder();
  }

  /**
   * Clean up the reminder manager.
   */
  destroy() {
    this._stopIdleCheck();
    this._clearHoldInterval();

    if (this.reminderOverlay) {
      this.reminderOverlay.remove();
      this.reminderOverlay = null;
    }
    this.isShowing = false;
    this.idleStartTime = null;
    this.skipCount = 0;
    this.lastSkipTime = null;
  }
}

export default PostSessionReminderManager;
