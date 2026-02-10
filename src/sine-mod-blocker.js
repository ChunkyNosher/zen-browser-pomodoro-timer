import Constants from './constants.js';
import { logger } from './log-manager.js';
import { 
  formatTime, getShortPhaseLabel, LOG_CATEGORIES 
} from './helpers.js';
import { isInBreakPhase } from './break-phase-utils.js';
import { handleStopTimerWithLockout } from './ui-helpers.js';
import {
  createProgressListener, setupBrowserListeners, removeBrowserListeners,
  handleBlockerGoBack, updateBlockerTimerStatus, startBlockerTimerStatusUpdates,
  createBlockerButtons
} from './shared-blocker-utils.js';

// ============================================
// Sine Mod Blocker Module
// ============================================

/**
 * Delay (in ms) after page navigation before checking for Sine Mods page.
 * This allows the URL to be fully updated before checking.
 * @constant {number}
 */
const SINE_PAGE_CHECK_DELAY_MS = 50;

/**
 * Delay (in ms) before hiding the blocker overlay after navigation.
 * This ensures the navigation has completed before removing the overlay.
 * @constant {number}
 */
const SINE_BLOCKER_HIDE_DELAY_MS = 100;

/**
 * SineModBlocker class prevents users from disabling the Pomodoro mod
 * via the Sine Mod Menu (about:preferences#sineMods) while the timer is active.
 *
 * When the timer is running and the user navigates to the Sine Mods settings page,
 * a blocking overlay appears covering the entire window, offering options to
 * go back or stop the timer (with the same security lock as stopping the timer normally).
 */
class SineModBlocker {
  constructor() {
    this.blockerOverlay = null;
    this.isBlocking = false;
    this.tabSelectHandler = null;
    this.pageShowHandler = null;
    this.hashChangeHandler = null;
    this.progressListener = null;
  }

  /**
   * Initialize the Sine Mod Blocker.
   * Sets up listeners for tab changes and URL navigation.
   */
  init() {
    logger.log(LOG_CATEGORIES.INIT, 'Initializing Sine Mod Blocker');
    this._setupListeners();
    // Check immediately in case we're already on the page
    this._checkCurrentPage();
  }

  /**
   * Set up all event listeners for detecting navigation to Sine Mods page.
   * @private
   */
  _setupListeners() {
    setupBrowserListeners(this, () => this._checkCurrentPage(), SINE_PAGE_CHECK_DELAY_MS);

    // Hash change listener - specific to Sine (for about:preferences navigation)
    this.hashChangeHandler = () => this._checkCurrentPage();
    window.addEventListener('hashchange', this.hashChangeHandler);
  }

  /**
   * Check if the blocker should be shown based on timer state.
   * NOTE: SineModBlocker intentionally does NOT disable during break phases
   * because users should not be able to modify mod settings during any timer session.
   * @returns {boolean} True if timer is active
   * @private
   */
  _shouldShowBlocker() {
    return window.zenPomodoroApp?.timer?.isActive || false;
  }

  /**
   * Check if the current page is the Sine Mods settings page.
   * Shows or hides the blocker overlay based on timer state and current URL.
   * @private
   */
  _checkCurrentPage() {
    const isSineModsPage = this._isSineModsPage();
    const timerActive = this._shouldShowBlocker();

    logger.log(LOG_CATEGORIES.SECURITY, 'Sine Mod page check', {
      isSineModsPage: isSineModsPage,
      timerActive: timerActive,
      isBlocking: this.isBlocking,
    });

    const shouldBlock = isSineModsPage && timerActive;

    if (shouldBlock && !this.isBlocking) {
      this._showBlocker();
      return;
    }

    if (!shouldBlock && this.isBlocking) {
      this._hideBlocker();
    }
  }

  /**
   * Check if a URL contains the Sine Mods settings page pattern.
   * @param {string} url - The URL to check
   * @returns {boolean} True if URL is the Sine Mods page
   * @private
   */
  _containsSineModsURL(url) {
    return url.includes('about:preferences') && url.includes('sineMods');
  }

  /**
   * Get the current URI spec from gBrowser.
   * @returns {string} The current URI spec or empty string
   * @private
   */
  _getCurrentURISpec() {
    // eslint-disable-next-line no-undef
    if (typeof gBrowser === 'undefined' || !gBrowser.currentURI) {
      return '';
    }
    // eslint-disable-next-line no-undef
    return gBrowser.currentURI.spec || '';
  }

  /**
   * Get the selected browser's current URI spec.
   * @returns {string} The browser URI spec or empty string
   * @private
   */
  _getSelectedBrowserURISpec() {
    // eslint-disable-next-line no-undef
    if (typeof gBrowser === 'undefined' || !gBrowser.selectedBrowser) {
      return '';
    }
    // eslint-disable-next-line no-undef
    return gBrowser.selectedBrowser.currentURI?.spec || '';
  }

  /**
   * Get the content document location href.
   * @returns {string} The document location href or empty string
   * @private
   */
  _getContentDocumentHref() {
    // eslint-disable-next-line no-undef
    const contentDoc = gBrowser?.selectedBrowser?.contentDocument;
    if (!contentDoc) {
      return '';
    }
    return contentDoc.location?.href || '';
  }

  /**
   * Check if the current URL is the Sine Mods settings page.
   * @returns {boolean} True if on the Sine Mods page
   * @private
   */
  _isSineModsPage() {
    try {
      const urlsToCheck = [
        this._getCurrentURISpec(),
        this._getSelectedBrowserURISpec(),
        this._getContentDocumentHref(),
      ];

      return urlsToCheck.some((url) => this._containsSineModsURL(url));
    } catch (e) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Error checking Sine Mods page', { error: e.message });
      return false;
    }
  }

  /**
   * Show the blocker overlay.
   * @private
   */
  _showBlocker() {
    if (this.blockerOverlay) return;

    logger.log(LOG_CATEGORIES.SECURITY, 'Showing Sine Mod blocker overlay');
    this.isBlocking = true;

    this._createBlockerOverlay();
    document.documentElement.appendChild(this.blockerOverlay);
  }

  /**
   * Create the blocker overlay element with all its content.
   * Uses shared utilities to reduce code duplication.
   * NOTE: SineModBlocker does NOT hide on break phase because mod settings
   * should remain locked throughout any timer session.
   * @private
   */
  _createBlockerOverlay() {
    this.blockerOverlay = document.createElement('div');
    this.blockerOverlay.id = 'zen-pomodoro-sine-blocker';
    this.blockerOverlay.className = 'active';

    // Content container
    const content = document.createElement('div');
    content.id = 'zen-pomodoro-sine-blocker-content';

    // Icon (lock symbol)
    const icon = document.createElement('div');
    icon.id = 'zen-pomodoro-sine-blocker-icon';
    icon.textContent = '🔒';

    // Title
    const title = document.createElement('h2');
    title.id = 'zen-pomodoro-sine-blocker-title';
    title.textContent = 'Mod Settings Locked';

    // Message
    const message = document.createElement('p');
    message.id = 'zen-pomodoro-sine-blocker-message';
    message.textContent =
      'The Pomodoro timer is currently active. Mod settings are locked to prevent disabling the focus session.';

    // Timer status
    const timerStatus = document.createElement('div');
    timerStatus.id = 'zen-pomodoro-sine-blocker-timer';
    this._updateTimerStatus(timerStatus);

    // Buttons using shared utility
    // NOTE: Sine Mod blocker does NOT hide on break phase (mod settings stay locked)
    const buttons = createBlockerButtons(
      'zen-pomodoro-sine-blocker-buttons',
      () => this._handleGoBack(),
      () => this._handleStopTimer()
    );

    content.appendChild(icon);
    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(timerStatus);
    content.appendChild(buttons);

    this.blockerOverlay.appendChild(content);

    // Set up timer status updates using shared utility
    startBlockerTimerStatusUpdates(this, timerStatus);
  }

  /**
   * Update the timer status display.
   * Delegates to shared utility to reduce code duplication.
   * @param {HTMLElement} statusElement - Element to update
   * @private
   */
  _updateTimerStatus(statusElement) {
    updateBlockerTimerStatus(statusElement);
  }

  /**
   * Start interval to update timer status display.
   * Delegates to shared utility to reduce code duplication.
   * @param {HTMLElement} statusElement - Element to update
   * @private
   */
  _startTimerStatusUpdates(statusElement) {
    startBlockerTimerStatusUpdates(this, statusElement);
  }

  /**
   * Handle the "Go Back" button click.
   * Navigates the user away from the Sine Mods page.
   * Uses shared utility for common navigation logic, but has Sine-specific fallback.
   * @private
   */
  _handleGoBack() {
    logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Go Back on Sine Mod blocker');

    try {
      // Try to go back in history
      // eslint-disable-next-line no-undef
      if (typeof gBrowser !== 'undefined' && gBrowser.selectedBrowser) {
        // eslint-disable-next-line no-undef
        const webNav = gBrowser.selectedBrowser.webNavigation;
        if (webNav && webNav.canGoBack) {
          webNav.goBack();
          // Hide blocker after navigation
          setTimeout(() => this._hideBlocker(), SINE_BLOCKER_HIDE_DELAY_MS);
          return;
        }
      }

      // Sine-specific fallback: Navigate to main preferences page without hash
      // eslint-disable-next-line no-undef
      if (typeof gBrowser !== 'undefined') {
        // eslint-disable-next-line no-undef
        gBrowser.selectedBrowser.loadURI(Services.io.newURI('about:preferences'), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        setTimeout(() => this._hideBlocker(), SINE_BLOCKER_HIDE_DELAY_MS);
        return;
      }

      // Last resort: Just hide the blocker
      this._hideBlocker();
    } catch (e) {
      logger.log(LOG_CATEGORIES.SECURITY, 'Error navigating back', { error: e.message });
      this._hideBlocker();
    }
  }

  /**
   * Handle the "Stop Timer" button click.
   * Uses the same security lockout as stopping the timer normally.
   * @private
   */
  _handleStopTimer() {
    logger.log(LOG_CATEGORIES.SECURITY, 'User clicked Stop Timer on Sine Mod blocker');

    // Use the existing handleStopTimerWithLockout utility function
    // which shows the security lock screen before allowing timer stop
    handleStopTimerWithLockout(() => {
      if (window.zenPomodoroApp) {
        window.zenPomodoroApp.stopTimer();
        // Hide the blocker after timer is stopped
        this._hideBlocker();
      }
    });
  }

  /**
   * Hide the blocker overlay.
   * @private
   */
  _hideBlocker() {
    logger.log(LOG_CATEGORIES.SECURITY, 'Hiding Sine Mod blocker overlay');
    this.isBlocking = false;

    // Clear timer status update interval
    if (this._timerStatusInterval) {
      clearInterval(this._timerStatusInterval);
      this._timerStatusInterval = null;
    }

    if (this.blockerOverlay) {
      this.blockerOverlay.remove();
      this.blockerOverlay = null;
    }
  }

  /**
   * Called when the timer starts.
   * Re-checks if we need to show the blocker.
   */
  onTimerStart() {
    this._checkCurrentPage();
  }

  /**
   * Called when the timer stops.
   * Hides the blocker if it's showing.
   */
  onTimerStop() {
    if (this.isBlocking) {
      this._hideBlocker();
    }
  }

  /**
   * Clean up and destroy the blocker.
   */
  destroy() {
    this._removeGBrowserListeners();
    this._removeWindowListeners();
    this._clearIntervals();
    this._removeBlockerOverlay();
    this.isBlocking = false;
  }

  /**
   * Remove gBrowser event listeners.
   * @private
   */
  _removeGBrowserListeners() {
    removeBrowserListeners(this);
  }

  /**
   * Remove window event listeners.
   * @private
   */
  _removeWindowListeners() {
    if (this.hashChangeHandler) {
      window.removeEventListener('hashchange', this.hashChangeHandler);
    }
  }

  /**
   * Clear any active intervals.
   * @private
   */
  _clearIntervals() {
    if (this._timerStatusInterval) {
      clearInterval(this._timerStatusInterval);
      this._timerStatusInterval = null;
    }
  }

  /**
   * Remove the blocker overlay from the DOM.
   * @private
   */
  _removeBlockerOverlay() {
    if (this.blockerOverlay) {
      this.blockerOverlay.remove();
      this.blockerOverlay = null;
    }
  }
}

export default SineModBlocker;
