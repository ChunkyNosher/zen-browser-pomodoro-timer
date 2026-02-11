import { logger } from './log-manager.js';
import { 
  generateRandomCode, LOG_CATEGORIES, LOCKOUT_METHODS, getConfig
} from './helpers.js';
import { setupHoldToUnlockHandlers } from './shared-blocker-utils.js';

// ============================================
// Security Module
// ============================================

class SecurityManager {
  constructor() {
    this.lockScreen = null;
    this.lockIntervalId = null; // Store interval for cleanup
    this.lockTimerElement = null; // PERFORMANCE FIX: Initialize timer element reference for caching
    this.holdDuration = 3000;
    this.holdToUnlockIntervalId = null; // Store hold-to-unlock interval (renamed for consistency)
    this._overlayPointerEventsDisabled = false; // Z-INDEX FIX: Track if overlay pointer-events were disabled
  }

  /**
   * Check if settings should be locked
   * Refactored to reduce "Bumpy Road" code smell with extracted helpers.
   */
  shouldLockSettings(timerActive) {
    const config = getConfig();
    return timerActive ? this._shouldLockActiveTimer(config) : this._shouldLockIdleTimer(config);
  }

  /**
   * Check lock settings for active timer state.
   * @param {Object} config - Configuration object
   * @returns {boolean} True if settings should be locked
   * @private
   */
  _shouldLockActiveTimer(config) {
    return config.settingsLockActiveMethod === LOCKOUT_METHODS.CODE
      ? config.settingsLockActiveCodeLength > 0
      : config.settingsLockActiveHoldDuration > 0;
  }

  /**
   * Check lock settings for idle timer state.
   * @param {Object} config - Configuration object
   * @returns {boolean} True if settings should be locked
   * @private
   */
  _shouldLockIdleTimer(config) {
    return config.settingsLockIdleMethod === LOCKOUT_METHODS.CODE
      ? config.settingsLockIdleCodeLength > 0
      : config.settingsLockIdleHoldDuration > 0;
  }

  /**
   * Show settings lock screen
   * UI/UX FIX: Replace alert() with custom dialog
   * MEMORY LEAK FIX: Store and clear interval properly
   * NEW: Added cancel button, hold-to-unlock
   * NEW: Configurable lockout methods (hold vs code) for idle and active states
   * Z-INDEX FIX: Temporarily disable overlay pointer-events so lock screen can receive input
   */
  showLockScreen(timerActive, onUnlock) {
    const config = getConfig();
    const method = this._determineLockoutMethod(timerActive, config);

    logger.log(LOG_CATEGORIES.SECURITY, 'Lock screen shown', {
      timerActive: timerActive,
      method: method,
    });

    // Z-INDEX FIX: Temporarily disable pointer-events on overlay so lock screen can receive input.
    // Both lock screen and overlay use the CSS specification maximum z-index (2147483647).
    // Since we cannot use a higher z-index value, we disable pointer-events on the overlay
    // to allow the lock screen (which appears later in DOM order) to receive user interaction.
    const overlay =
      window.zenPomodoroApp?.overlay?.overlay || document.getElementById('zen-pomodoro-overlay');
    if (overlay) {
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
    // Store reference to restore later
    this._overlayPointerEventsDisabled = !!overlay;

    this._initializeLockScreen();
    const lockContent = this._createLockContent();

    if (method === LOCKOUT_METHODS.CODE) {
      this._setupCodeEntryMode(lockContent, config, timerActive, onUnlock);
    } else {
      this._setupHoldToUnlockMode(lockContent, config, timerActive, onUnlock);
    }

    this.lockScreen.appendChild(lockContent);
    document.documentElement.appendChild(this.lockScreen);
  }

  /**
   * Determine which lockout method to use based on timer state and config.
   * @param {boolean} timerActive - Whether timer is currently active
   * @param {Object} config - Configuration object
   * @returns {string} The lockout method to use
   * @private
   */
  _determineLockoutMethod(timerActive, config) {
    const requestedMethod = timerActive
      ? config.settingsLockActiveMethod
      : config.settingsLockIdleMethod;

    if (requestedMethod === LOCKOUT_METHODS.CODE || requestedMethod === LOCKOUT_METHODS.HOLD) {
      return requestedMethod;
    }

    // Fall back to defaults: code for active, hold for idle
    const defaultMethod = timerActive ? LOCKOUT_METHODS.CODE : LOCKOUT_METHODS.HOLD;
    console.warn(
      `Zen Pomodoro: Invalid lockout method "${requestedMethod}", using default "${defaultMethod}".`
    );
    return defaultMethod;
  }

  /**
   * Initialize the lock screen container element.
   * @private
   */
  _initializeLockScreen() {
    this.lockScreen = document.createElement('div');
    this.lockScreen.id = 'zen-pomodoro-lock-screen';
    this.lockScreen.className = 'active';
  }

  /**
   * Create the lock content container element.
   * @returns {HTMLElement} The lock content element
   * @private
   */
  _createLockContent() {
    const lockContent = document.createElement('div');
    lockContent.id = 'zen-pomodoro-lock-content';
    return lockContent;
  }

  /**
   * Create standard lock screen button row with cancel button.
   * @returns {{buttonDiv: HTMLElement, cancelButton: HTMLElement}}
   * @private
   */
  _createLockButtonRow() {
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.id = 'zen-pomodoro-lock-cancel';
    cancelButton.textContent = 'Cancel';

    // Attach event handler
    cancelButton.addEventListener('click', () => this.cleanupLockScreen());

    buttonDiv.appendChild(cancelButton);

    return { buttonDiv, cancelButton };
  }

  /**
   * Setup code entry lockout mode UI and handlers.
   * @param {HTMLElement} lockContent - Container for lock content
   * @param {Object} config - Configuration object
   * @param {boolean} timerActive - Whether timer is active
   * @param {Function} onUnlock - Callback when unlock succeeds
   * @private
   */
  _setupCodeEntryMode(lockContent, config, timerActive, onUnlock) {
    const codeLength = timerActive
      ? config.settingsLockActiveCodeLength
      : config.settingsLockIdleCodeLength;
    const code = generateRandomCode(codeLength, config.settingsLockActiveCharacterSet);

    logger.log(LOG_CATEGORIES.SECURITY, 'Code entry mode initialized', {
      codeLength: codeLength,
      timerActive: timerActive,
    });

    const h2 = document.createElement('h2');
    h2.textContent = 'Settings Locked';

    const p = document.createElement('p');
    p.textContent = timerActive
      ? 'Timer is active. Enter the code below to unlock settings:'
      : 'Enter the code below to unlock settings:';

    const codeContainer = document.createElement('div');
    codeContainer.className = 'zen-pomodoro-code-container';

    const codeDiv = document.createElement('div');
    codeDiv.className = 'zen-pomodoro-lock-code-display';
    codeDiv.textContent = code;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'zen-pomodoro-lock-code';
    input.placeholder = 'Enter code here';

    codeContainer.appendChild(codeDiv);
    codeContainer.appendChild(input);

    // Shared verification function
    const verifyCode = () => {
      if (input.value === code) {
        logger.log(LOG_CATEGORIES.SECURITY, 'Code verification successful');
        this.cleanupLockScreen();
        onUnlock();
      } else {
        logger.log(LOG_CATEGORIES.SECURITY, 'Code verification failed - incorrect code');
        window.zenPomodoroApp?.showCustomAlert('Incorrect Code', 'Please try again.');
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyCode();
    });

    const { buttonDiv } = this._createLockButtonRow();

    const unlockButton = document.createElement('button');
    unlockButton.className = 'zen-pomodoro-dialog-button';
    unlockButton.id = 'zen-pomodoro-lock-submit';
    unlockButton.textContent = 'Unlock';
    buttonDiv.appendChild(unlockButton);

    unlockButton.addEventListener('click', verifyCode);

    lockContent.appendChild(h2);
    lockContent.appendChild(p);
    lockContent.appendChild(codeContainer);
    lockContent.appendChild(buttonDiv);

    // Focus the input field for better UX
    setTimeout(() => input?.focus(), 0);
  }

  /**
   * Setup hold-to-unlock lockout mode UI and handlers.
   * @param {HTMLElement} lockContent - Container for lock content
   * @param {Object} config - Configuration object
   * @param {boolean} timerActive - Whether timer is active
   * @param {Function} onUnlock - Callback when unlock succeeds
   * @private
   */
  _setupHoldToUnlockMode(lockContent, config, timerActive, onUnlock) {
    const waitTime = timerActive
      ? config.settingsLockActiveHoldDuration
      : config.settingsLockIdleHoldDuration;

    const h2 = document.createElement('h2');
    h2.textContent = 'Settings Locked';

    const p = document.createElement('p');
    p.textContent = timerActive
      ? 'Timer is active. Hold the button below to unlock settings:'
      : 'Hold the button below to unlock settings:';

    const timerDiv = document.createElement('div');
    timerDiv.id = 'zen-pomodoro-lock-timer';
    timerDiv.textContent = waitTime.toString();

    const pSub = document.createElement('p');
    pSub.className = 'zen-pomodoro-lock-subtext';
    pSub.textContent = 'seconds remaining - hold button to count down';

    const { holdButton, holdProgress } = this._createHoldButton();
    const { buttonDiv } = this._createLockButtonRow();
    buttonDiv.appendChild(holdButton);

    lockContent.appendChild(h2);
    lockContent.appendChild(p);
    lockContent.appendChild(timerDiv);
    lockContent.appendChild(pSub);
    lockContent.appendChild(buttonDiv);

    // Cache timer element reference for updates
    this.lockTimerElement = timerDiv;

    // Setup hold logic
    this._setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock);
  }

  /**
   * Create the hold-to-unlock button with progress bar.
   * @returns {{holdButton: HTMLElement, holdProgress: HTMLElement}}
   * @private
   */
  _createHoldButton() {
    const holdButton = document.createElement('button');
    holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
    holdButton.id = 'zen-pomodoro-hold-to-unlock';
    holdButton.textContent = 'Hold to Unlock';

    const holdProgress = document.createElement('div');
    holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
    holdProgress.id = 'zen-pomodoro-hold-unlock-progress';
    holdButton.appendChild(holdProgress);

    return { holdButton, holdProgress };
  }

  /**
   * Setup hold-to-unlock event handlers.
   * Uses shared setupHoldToUnlockHandlers utility to reduce code duplication.
   * @param {HTMLElement} holdButton - The hold button element
   * @param {HTMLElement} holdProgress - The progress bar element
   * @param {number} waitTime - Total wait time in seconds
   * @param {Function} onUnlock - Callback when unlock succeeds
   * @private
   */
  _setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock) {
    // Store cleanup function to prevent memory leaks
    this._holdHandlersCleanup = setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime,
      timerElement: this.lockTimerElement,
      onComplete: () => {
        this.cleanupLockScreen();
        onUnlock();
      },
      clearInterval: () => this._clearHoldInterval(),
      setIntervalId: (id) => {
        this.holdToUnlockIntervalId = id;
      },
      logCategory: LOG_CATEGORIES.SECURITY,
      logMessage: 'Hold-to-unlock completed successfully',
    });
  }

  /**
   * Clear the hold-to-unlock interval if active.
   * @private
   */
  _clearHoldInterval() {
    if (this.holdToUnlockIntervalId) {
      clearInterval(this.holdToUnlockIntervalId);
      this.holdToUnlockIntervalId = null;
    }
  }

  /**
   * Clear an interval and nullify its reference.
   * @param {string} intervalKey - Key of the interval property to clear
   * @private
   */
  _clearIntervalIfExists(intervalKey) {
    if (this[intervalKey]) {
      clearInterval(this[intervalKey]);
      this[intervalKey] = null;
    }
  }

  /**
   * Restore overlay pointer-events if they were disabled.
   * @private
   */
  _restoreOverlayPointerEvents() {
    if (!this._overlayPointerEventsDisabled) return;

    const overlay =
      window.zenPomodoroApp?.overlay?.overlay || document.getElementById('zen-pomodoro-overlay');
    if (overlay) {
      overlay.style.setProperty('pointer-events', 'all', 'important');
    }
    this._overlayPointerEventsDisabled = false;
  }

  /**
   * Cleanup lock screen
   * MEMORY LEAK FIX: Clear interval and cached element reference on cleanup
   * Z-INDEX FIX: Restore overlay pointer-events when lock screen is closed
   * Refactored to reduce cyclomatic complexity.
   */
  cleanupLockScreen() {
    this._clearIntervalIfExists('lockIntervalId');
    this._clearIntervalIfExists('holdToUnlockIntervalId');

    // Call cleanup function to remove event listeners
    if (this._holdHandlersCleanup) {
      this._holdHandlersCleanup();
      this._holdHandlersCleanup = null;
    }

    this.lockTimerElement = null;
    if (this.lockScreen) {
      this.lockScreen.remove();
      this.lockScreen = null;
    }

    this._restoreOverlayPointerEvents();
  }
}

export default SecurityManager;
