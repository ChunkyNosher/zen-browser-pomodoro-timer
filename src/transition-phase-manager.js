import Constants from './constants.js';
import { logger } from './log-manager.js';
import { LOG_CATEGORIES, TRANSITION_PHASE_DURATION_SECONDS, formatTime, sanitizeText, DATA_NO_POSITION_SAVE } from './helpers.js';
import { setupDialogDrag } from './ui-helpers.js';

// ============================================
// Transition Phase Manager
// ============================================

/**
 * TransitionPhaseManager handles the "break ending" transition popup.
 * When a break phase ends, this popup appears to warn the user
 * that their break is ending and they should prepare to focus.
 *
 * Features:
 * - Movable floating popup (does NOT block browser interaction)
 * - 5-minute countdown timer
 * - "I'm Ready to Focus" button to close early
 * - No X button or click-outside-to-close
 * - When closed (timer or button): re-enables blocking and starts focus phase
 */
class TransitionPhaseManager {
  constructor() {
    this.popup = null;
    this.timerInterval = null;
    this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;
    this.onTransitionComplete = null; // Callback when transition ends
  }

  /**
   * Show the transition popup.
   * Called when break phase ends and before focus phase begins.
   */
  showTransitionPopup() {
    // Don't show if already showing
    if (this.popup) {
      return;
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Transition popup displayed');

    this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;
    this._createPopup();
    document.documentElement.appendChild(this.popup);

    // Make popup draggable
    setupDialogDrag(this.popup);

    // Start countdown
    this._startCountdown();
  }

  /**
   * Hide the transition popup and trigger the completion callback.
   * Called when timer reaches zero or user clicks the "Ready" button.
   * Includes guard against race conditions where this could be called twice
   * (e.g., timer reaching zero at the same moment user clicks the button).
   */
  hideTransitionPopup() {
    // Guard against double-execution (race condition between timer and button click)
    if (!this.popup && !this.timerInterval) {
      return;
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Transition popup hidden');

    // Clear countdown interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Remove popup
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }

    // Reset remainingTime for next use to ensure clean state
    this.remainingTime = TRANSITION_PHASE_DURATION_SECONDS;

    // Trigger completion callback (starts focus phase and re-enables blocking)
    if (this.onTransitionComplete) {
      this.onTransitionComplete();
    }
  }

  /**
   * Create the transition popup element.
   * @private
   */
  _createPopup() {
    this.popup = document.createElement('div');
    this.popup.id = 'zen-pomodoro-transition-popup';
    this.popup.className = 'zen-pomodoro-transition-popup active';

    // Mark this popup so its position won't be saved to lastDialogPosition
    // This prevents the settings menu from appearing in the top-right corner
    // where the transition popup was shown
    this.popup.setAttribute(DATA_NO_POSITION_SAVE, 'true');

    // Title (also serves as drag handle)
    const title = document.createElement('h2');
    title.textContent = 'Break Ending Soon';

    // Message
    const message = document.createElement('p');
    message.className = 'zen-pomodoro-transition-message';
    message.textContent = 'Your break is ending. Finish up and prepare to focus.';

    // Countdown timer display
    const timerDisplay = document.createElement('div');
    timerDisplay.id = 'zen-pomodoro-transition-timer';
    timerDisplay.className = 'zen-pomodoro-transition-timer';
    timerDisplay.textContent = `Focus resumes in: ${formatTime(this.remainingTime)}`;

    // "I'm Ready to Focus" button
    const readyButton = document.createElement('button');
    readyButton.id = 'zen-pomodoro-transition-ready-btn';
    readyButton.className = 'zen-pomodoro-transition-ready-btn';
    readyButton.textContent = "I'm Ready to Focus";
    readyButton.addEventListener('click', () => {
      this.hideTransitionPopup();
    });

    // Assemble popup
    this.popup.appendChild(title);
    this.popup.appendChild(message);
    this.popup.appendChild(timerDisplay);
    this.popup.appendChild(readyButton);
  }

  /**
   * Check if the popup has been detached from the DOM.
   * Cleans up the timer interval if popup is gone.
   * @returns {boolean} True if popup is detached and timer was cleaned up
   * @private
   */
  _isPopupDetached() {
    if (!this.popup || !document.documentElement.contains(this.popup)) {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      return true;
    }
    return false;
  }

  /**
   * Start the countdown timer.
   * Updates the display every second and closes popup when timer reaches zero.
   * Includes DOM detachment check to stop timer if popup is removed externally.
   * @private
   */
  _startCountdown() {
    logger.log(LOG_CATEGORIES.TIMER, 'Transition countdown started', {
      remainingSeconds: this.remainingTime,
    });

    this.timerInterval = setInterval(() => {
      if (this._isPopupDetached()) return;

      // Respect main timer's pause state - do not decrement if paused
      if (window.zenPomodoroApp?.timer?.isPaused) return;

      this.remainingTime--;

      // Update display
      const timerDisplay = this.popup.querySelector('#zen-pomodoro-transition-timer');
      if (timerDisplay) {
        timerDisplay.textContent = `Focus resumes in: ${formatTime(this.remainingTime)}`;
      }

      // Timer reached zero - close popup and start focus
      if (this.remainingTime <= 0) {
        this.hideTransitionPopup();
      }
    }, 1000);
  }

  /**
   * Clean up the transition manager.
   * Called when the application is being destroyed.
   */
  destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }
}

export default TransitionPhaseManager;
