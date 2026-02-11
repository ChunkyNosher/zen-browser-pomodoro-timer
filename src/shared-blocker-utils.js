/**
 * Shared Blocker Utilities - Functions used by both SineModBlocker and WebsiteBlocker.
 */

import Constants from './constants.js';
import { logger } from './log-manager.js';
import { formatTime, getShortPhaseLabel } from './helpers.js';

const { LOG_CATEGORIES } = Constants;

// ============================================
// Browser Listener Setup
// ============================================

/**
 * Create a shared progress listener for monitoring URL changes.
 * Used by both SineModBlocker and WebsiteBlocker.
 * @param {function} checkCallback - Callback to call on location change
 * @param {number} delayMs - Delay before calling callback
 * @returns {Object|null} Progress listener object or null on failure
 */
export function createProgressListener(checkCallback, delayMs) {
  try {
    return {
      QueryInterface: ChromeUtils.generateQI([
        'nsIWebProgressListener',
        'nsISupportsWeakReference',
      ]),

      // eslint-disable-next-line no-unused-vars
      onLocationChange: (webProgress, _request, _location) => {
        if (webProgress.isTopLevel) {
          setTimeout(checkCallback, delayMs);
        }
      },

      onStateChange: () => {},
      onProgressChange: () => {},
      onStatusChange: () => {},
      onSecurityChange: () => {},
      onContentBlockingEvent: () => {},
    };
  } catch (e) {
    logger.log(LOG_CATEGORIES.INIT, 'Failed to create progress listener', { error: e.message });
    return null;
  }
}

/**
 * Set up common gBrowser event listeners for URL monitoring.
 * @param {Object} context - The blocker instance (this)
 * @param {function} checkCallback - Callback to call on events
 * @param {number} delayMs - Delay for progress listener
 */
export function setupBrowserListeners(context, checkCallback, delayMs) {
  // Tab select listener - add delay to allow tab title to update before checking
  context.tabSelectHandler = () => {
    // Clear any pending check to avoid race conditions
    if (context._tabSelectDelayTimeout) {
      clearTimeout(context._tabSelectDelayTimeout);
    }
    // Small delay to let tab title update
    context._tabSelectDelayTimeout = setTimeout(checkCallback, 100);
  };
  // eslint-disable-next-line no-undef
  if (typeof gBrowser !== 'undefined' && gBrowser.tabContainer) {
    // eslint-disable-next-line no-undef
    gBrowser.tabContainer.addEventListener('TabSelect', context.tabSelectHandler);
  }

  // Page show listener
  context.pageShowHandler = () => {
    setTimeout(checkCallback, delayMs);
  };
  // eslint-disable-next-line no-undef
  if (typeof gBrowser !== 'undefined') {
    // eslint-disable-next-line no-undef
    gBrowser.addEventListener('pageshow', context.pageShowHandler);
  }

  // Progress listener
  // eslint-disable-next-line no-undef
  if (typeof gBrowser !== 'undefined') {
    context.progressListener = createProgressListener(checkCallback, delayMs);
    if (context.progressListener) {
      try {
        // eslint-disable-next-line no-undef
        gBrowser.addProgressListener(context.progressListener);
      } catch (e) {
        logger.log(LOG_CATEGORIES.INIT, 'Failed to add progress listener', { error: e.message });
      }
    }
  }
}

/**
 * Remove gBrowser event listeners.
 * @param {Object} context - The blocker instance (this)
 */
export function removeBrowserListeners(context) {
  // eslint-disable-next-line no-undef
  if (typeof gBrowser === 'undefined') return;

  // Clear pending tab select timeout
  if (context._tabSelectDelayTimeout) {
    clearTimeout(context._tabSelectDelayTimeout);
    context._tabSelectDelayTimeout = null;
  }

  // eslint-disable-next-line no-undef
  if (context.tabSelectHandler && gBrowser.tabContainer) {
    // eslint-disable-next-line no-undef
    gBrowser.tabContainer.removeEventListener('TabSelect', context.tabSelectHandler);
  }

  if (context.pageShowHandler) {
    // eslint-disable-next-line no-undef
    gBrowser.removeEventListener('pageshow', context.pageShowHandler);
  }

  if (context.progressListener) {
    try {
      // eslint-disable-next-line no-undef
      gBrowser.removeProgressListener(context.progressListener);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

// ============================================
// Blocker Overlay Utilities
// ============================================

/**
 * Handle "Go Back" navigation for blocker overlays.
 * @param {function} hideBlockerCallback - Callback to hide the blocker
 * @param {number} delayMs - Delay before hiding blocker
 */
export function handleBlockerGoBack(hideBlockerCallback, delayMs) {
  try {
    // eslint-disable-next-line no-undef
    if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
      // eslint-disable-next-line no-undef
      const webNav = gBrowser.selectedBrowser.webNavigation;
      if (webNav && webNav.canGoBack) {
        webNav.goBack();
        setTimeout(hideBlockerCallback, delayMs);
        return;
      }
    }

    // Fallback: Navigate to about:blank
    // eslint-disable-next-line no-undef
    if (typeof gBrowser !== 'undefined') {
      // eslint-disable-next-line no-undef
      gBrowser.selectedBrowser.loadURI(Services.io.newURI('about:blank'), {
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}),
      });
      setTimeout(hideBlockerCallback, delayMs);
      return;
    }

    // Last resort: Just hide the blocker
    hideBlockerCallback();
  } catch (e) {
    logger.log(LOG_CATEGORIES.SECURITY, 'Error navigating back', { error: e.message });
    hideBlockerCallback();
  }
}

/**
 * Update timer status display element for blocker overlays.
 * Shared utility to reduce code duplication between SineModBlocker and WebsiteBlocker.
 * @param {HTMLElement} statusElement - Element to update with timer status
 */
export function updateBlockerTimerStatus(statusElement) {
  if (!statusElement) {
    return;
  }

  const timer = window.zenPomodoroApp?.timer;
  if (!timer) {
    statusElement.textContent = '';
    return;
  }

  const status = timer.getStatus();
  if (!status) {
    statusElement.textContent = '';
    return;
  }

  const timeStr = formatTime(status.remainingTime);
  const phaseLabel = getShortPhaseLabel(status.currentPhase);

  // Don't show cycle info for simple timer mode - only pomodoro mode has cycles
  statusElement.textContent =
    status.mode === 'simple'
      ? `${phaseLabel}: ${timeStr}`
      : `${phaseLabel}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
}

/**
 * Start interval to update timer status display for blocker overlays.
 * Shared utility to reduce code duplication between SineModBlocker and WebsiteBlocker.
 * @param {Object} context - The blocker instance (this) - must have isBlocking, _timerStatusInterval, _hideBlocker
 * @param {HTMLElement} statusElement - Element to update
 */
export function startBlockerTimerStatusUpdates(context, statusElement) {
  // Update immediately
  updateBlockerTimerStatus(statusElement);

  // Update every second
  context._timerStatusInterval = setInterval(() => {
    if (context.isBlocking && statusElement) {
      updateBlockerTimerStatus(statusElement);

      // Also check if timer is still active
      if (!window.zenPomodoroApp?.timer?.isActive) {
        context._hideBlocker();
      }
    }
  }, 1000);
}

/**
 * Create a blocker overlay button element.
 * @param {string} className - CSS class name
 * @param {string} text - Button text
 * @param {Function} onClick - Click handler
 * @returns {HTMLButtonElement} Button element
 */
export function createBlockerButton(className, text, onClick) {
  const button = document.createElement('button');
  button.className = `zen-pomodoro-dialog-button ${className}`;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Create the buttons container for blocker overlays.
 * Shared utility to reduce code duplication.
 * @param {string} buttonsId - ID for the buttons container
 * @param {Function} onGoBack - Go Back button click handler
 * @param {Function} onStopTimer - Stop Timer button click handler
 * @returns {HTMLElement} Buttons container element
 */
export function createBlockerButtons(buttonsId, onGoBack, onStopTimer) {
  const buttons = document.createElement('div');
  buttons.id = buttonsId;

  buttons.appendChild(createBlockerButton('secondary', 'Go Back', onGoBack));
  buttons.appendChild(createBlockerButton('', 'Stop Timer', onStopTimer));

  return buttons;
}

// ============================================
// Hold-to-Unlock Handlers
// ============================================

/**
 * Setup hold-to-unlock event handlers for buttons.
 * Shared utility to reduce code duplication between SecurityManager and PostSessionReminderManager.
 * @param {Object} options - Options object
 * @param {HTMLElement} options.holdButton - The hold button element
 * @param {HTMLElement} options.holdProgress - The progress bar element
 * @param {number} options.waitTime - Total wait time in seconds
 * @param {HTMLElement} options.timerElement - Element to display countdown
 * @param {Function} options.onComplete - Callback when hold completes
 * @param {Function} options.getIntervalId - Function to get current interval ID
 * @param {Function} options.setIntervalId - Function to set interval ID
 * @param {Function} options.clearInterval - Function to clear interval
 * @param {string} [options.logCategory] - Log category for logging (default: SECURITY)
 * @param {string} [options.logMessage] - Log message on completion (default: 'Hold-to-unlock completed')
 */
export function setupHoldToUnlockHandlers(options) {
  const {
    holdButton,
    holdProgress,
    waitTime,
    timerElement,
    onComplete,
    clearInterval: clearIntervalFn,
    setIntervalId,
    logCategory = LOG_CATEGORIES.SECURITY,
    logMessage = 'Hold-to-unlock completed',
  } = options;

  let currentWaitTime = waitTime;

  const startHold = (e) => {
    if (e.type === 'touchstart') e.preventDefault();

    clearIntervalFn();

    const intervalId = setInterval(() => {
      currentWaitTime--;
      if (timerElement) {
        timerElement.textContent = currentWaitTime.toString();
      }

      const percent = ((waitTime - currentWaitTime) / waitTime) * 100;
      if (holdProgress?.style) {
        holdProgress.style.width = `${percent}%`;
      }

      if (currentWaitTime <= 0) {
        logger.log(logCategory, logMessage);
        clearIntervalFn();
        onComplete();
      }
    }, 1000);

    setIntervalId(intervalId);
  };

  const stopHold = () => {
    clearIntervalFn();
    currentWaitTime = waitTime;
    if (timerElement) {
      timerElement.textContent = waitTime.toString();
    }
    if (holdProgress) {
      holdProgress.style.width = '0%';
    }
  };

  // Mouse events
  holdButton.addEventListener('mousedown', startHold);
  holdButton.addEventListener('mouseup', stopHold);
  holdButton.addEventListener('mouseleave', stopHold);

  // Touch events (passive: false to allow preventDefault)
  holdButton.addEventListener('touchstart', startHold, { passive: false });
  holdButton.addEventListener('touchend', stopHold);
  holdButton.addEventListener('touchcancel', stopHold);

  // Keyboard accessibility - named functions for cleanup
  const keydownHandler = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      startHold(e);
    }
  };
  const keyupHandler = (e) => {
    if (e.key === ' ' || e.key === 'Enter') stopHold();
  };

  holdButton.addEventListener('keydown', keydownHandler);
  holdButton.addEventListener('keyup', keyupHandler);

  // Return cleanup function to prevent memory leaks
  return function cleanup() {
    holdButton.removeEventListener('mousedown', startHold);
    holdButton.removeEventListener('mouseup', stopHold);
    holdButton.removeEventListener('mouseleave', stopHold);
    holdButton.removeEventListener('touchstart', startHold);
    holdButton.removeEventListener('touchend', stopHold);
    holdButton.removeEventListener('touchcancel', stopHold);
    holdButton.removeEventListener('keydown', keydownHandler);
    holdButton.removeEventListener('keyup', keyupHandler);
  };
}
