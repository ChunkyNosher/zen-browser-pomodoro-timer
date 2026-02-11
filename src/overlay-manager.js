import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import { formatTime, getShortPhaseLabel, sanitizeText, getPhaseLabel, getPref, setPref } from './helpers.js';
import { handlePauseResumeTimer, handleStopTimerWithLockout, isDistractionDumpBlocking } from './ui-helpers.js';

const { LOG_CATEGORIES, MAX_OVERLAY_Z_INDEX, MIN_CONTENT_AREA_DIMENSION, CONTENT_AREA_SELECTORS } =
  Constants;

// Backward compatibility helper
const getConfig = () => Storage.loadConfig();

class OverlayManager {
  constructor() {
    this.overlay = null;
    this.indicator = null;
    this.config = getConfig();
    this.isVisible = false;
    this.contentAreaObserver = null; // Issue 1: Observer for content area size changes
    this.indicatorWidth = 0; // Cached indicator width for drag operations
    this.indicatorHeight = 0; // Cached indicator height for drag operations
    this.indicatorMouseDownHandler = null; // Store for cleanup
    this.indicatorContextMenuHandler = null; // Store for cleanup (right-click pause/unpause)
    this.indicatorDidDrag = false; // Track if indicator was dragged (to suppress click events)
    this.contentArea = null; // Reference to content area element for bounds calculation and cleanup
    this._overlayUpdateScheduled = false; // Debounce flag for ResizeObserver
  }

  /**
   * Create the overlay content container with phase label, timer display, etc.
   * @returns {HTMLElement} The content container element
   * @private
   */
  _createOverlayContent() {
    const content = document.createElement('div');
    content.id = 'zen-pomodoro-content';

    // Phase label
    const phaseLabel = document.createElement('div');
    phaseLabel.id = 'zen-pomodoro-phase-label';
    phaseLabel.textContent = 'Focus Period';

    // Timer display
    const timerDisplay = document.createElement('div');
    timerDisplay.id = 'zen-pomodoro-timer-display';
    timerDisplay.textContent = '25:00';

    // Cycle progress - hidden initially, only shown for pomodoro mode
    const cycleProgress = document.createElement('div');
    cycleProgress.id = 'zen-pomodoro-cycle-progress';
    const timerMode = window.zenPomodoroApp?.timer?.mode;
    // Only show cycle progress for pomodoro mode (not simple mode or undefined)
    if (timerMode === 'pomodoro') {
      // Use configured cycle count instead of hardcoded value
      const totalCycles = this.config.cycles || 4;
      cycleProgress.textContent = `Cycle 1 of ${totalCycles}`;
    } else {
      // Hide for simple mode or when timer mode is not yet set
      cycleProgress.classList.add('zen-pomodoro-hidden');
    }

    // Motivational message - SECURITY FIX: Use textContent
    const message = document.createElement('div');
    message.id = 'zen-pomodoro-message';
    message.textContent = sanitizeText(this.config.motivationalMessage);

    // Controls
    const controls = this._createOverlayControls();

    content.appendChild(phaseLabel);
    content.appendChild(timerDisplay);
    content.appendChild(cycleProgress);
    content.appendChild(message);
    content.appendChild(controls);

    return content;
  }

  /**
   * Create the overlay controls section with buttons
   * @returns {HTMLElement} The controls container element
   * @private
   */
  _createOverlayControls() {
    const controls = document.createElement('div');
    controls.id = 'zen-pomodoro-controls';

    const pauseButton = document.createElement('button');
    pauseButton.className = 'zen-pomodoro-button';
    pauseButton.id = 'zen-pomodoro-pause-button';
    pauseButton.textContent = 'Pause';

    const stopButton = document.createElement('button');
    stopButton.className = 'zen-pomodoro-button';
    stopButton.id = 'zen-pomodoro-stop-button';
    stopButton.textContent = 'Stop Timer';

    controls.appendChild(pauseButton);
    controls.appendChild(stopButton);

    return controls;
  }

  /**
   * Create the persistent indicator element
   * @private
   */
  _createIndicator() {
    this.indicator = document.createElement('div');
    this.indicator.id = 'zen-pomodoro-indicator';

    const indicatorDot = document.createElement('div');
    indicatorDot.id = 'zen-pomodoro-indicator-dot';

    const indicatorText = document.createElement('span');
    indicatorText.id = 'zen-pomodoro-indicator-text';
    indicatorText.textContent = 'Focus: 25:00';

    this.indicator.appendChild(indicatorDot);
    this.indicator.appendChild(indicatorText);
  }

  /**
   * Attach overlay to content area or use fallback positioning.
   * Uses fixed positioning with explicit pixel bounds to properly cover browser content.
   * This approach ensures the overlay blocks interaction with web content
   * by positioning it above the browser rendering layer.
   * @private
   */
  _attachOverlayToContentArea() {
    // Issue 1: Position overlay within content area instead of full window
    // Try multiple Zen Browser and Firefox specific selectors
    // NOTE: We use a for-loop with early break instead of combined selector string
    // (document.querySelector('sel1, sel2, sel3')) because:
    // 1. We want to find the FIRST valid element in priority order defined by CONTENT_AREA_SELECTORS
    // 2. We need to know WHICH selector matched for logging/debugging purposes
    // A combined selector returns the first DOM element matching ANY selector,
    // not respecting our preference order and without indicating which selector matched.
    let contentArea = null;
    let usedSelector = null;

    for (const selector of CONTENT_AREA_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        contentArea = element;
        usedSelector = selector;
        break;
      }
    }

    // Use fixed positioning with explicit bounds to properly cover browser content
    // This ensures the overlay appears ABOVE web content rendered in the browser
    this.overlay.style.position = 'fixed';
    this.overlay.style.zIndex = MAX_OVERLAY_Z_INDEX;
    this.overlay.style.pointerEvents = 'all';
    this.overlay.style.boxSizing = 'border-box';

    if (contentArea) {
      // Store reference for cleanup and bounds updates
      this.contentArea = contentArea;

      // Calculate and set explicit bounds from content area
      this.updateOverlayBounds();

      // Append to document root to ensure it's above all browser chrome
      document.documentElement.appendChild(this.overlay);

      logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay attached with fixed positioning', {
        selector: usedSelector || 'unknown',
        bounds: this._getContentAreaBounds(),
      });

      // Set up observer for content area size changes
      this.setupContentAreaObserver(contentArea);
    } else {
      // Fallback: Use viewport dimensions
      logger.log(
        LOG_CATEGORIES.OVERLAY,
        'Warning: No content area found, using viewport fallback'
      );

      this.overlay.style.top = '0';
      this.overlay.style.left = '0';
      this.overlay.style.width = '100vw';
      this.overlay.style.height = '100vh';

      document.documentElement.appendChild(this.overlay);
    }
  }

  /**
   * Update overlay bounds to match content area position and size.
   * Uses explicit pixel values from getBoundingClientRect() to ensure
   * the overlay properly covers the browser content area.
   *
   * Note: This method is called from debounced resize observer callbacks
   * via the chain: _scheduleOverlayUpdate() → updateOverlayPosition() → updateOverlayBounds().
   * The debouncing mechanism uses requestAnimationFrame to batch layout
   * calculations and avoid performance issues during rapid resize events.
   */
  updateOverlayBounds() {
    if (!this.overlay || !this.contentArea) return;

    const rect = this.contentArea.getBoundingClientRect();

    // Validate bounds to ensure they are reasonable
    // Use the module constant for minimum dimension to prevent invisible overlays
    if (rect.width < MIN_CONTENT_AREA_DIMENSION || rect.height < MIN_CONTENT_AREA_DIMENSION) {
      logger.log(
        LOG_CATEGORIES.OVERLAY,
        'Warning: Content area bounds too small, using fallback',
        {
          width: rect.width,
          height: rect.height,
        }
      );
      // Fall back to viewport dimensions
      this.overlay.style.top = '0';
      this.overlay.style.left = '0';
      this.overlay.style.width = '100vw';
      this.overlay.style.height = '100vh';
      return;
    }

    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;

    logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay bounds updated', {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }

  /**
   * Get current content area bounds for logging.
   * @returns {Object|null} Bounds object or null if no content area
   * @private
   */
  _getContentAreaBounds() {
    if (!this.contentArea) return null;
    const rect = this.contentArea.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }

  /**
   * Create overlay elements
   * SECURITY FIX: Use textContent instead of innerHTML for user content
   */
  createOverlay() {
    if (this.overlay) return;

    // Main overlay
    this.overlay = document.createElement('div');
    this.overlay.id = 'zen-pomodoro-overlay';

    // Create and append content
    const content = this._createOverlayContent();
    this.overlay.appendChild(content);

    // Create persistent indicator
    this._createIndicator();

    // Attach overlay to content area
    this._attachOverlayToContentArea();

    document.documentElement.appendChild(this.indicator);

    // Issue 8: Set up drag functionality for indicator
    this.setupIndicatorDrag();

    // Set up button handlers after elements are created
    // RACE CONDITION FIX: Set up handlers immediately after creation
    this.setupOverlayHandlers();
  }

  /**
   * Issue 1: Set up observer for content area size changes
   * Watches for size/position changes when sidebars are toggled or resized
   */
  setupContentAreaObserver(contentArea) {
    this._cleanupContentAreaObserver();

    const browser = document.querySelector('#browser');

    this.contentAreaObserver = new ResizeObserver((entries) => {
      if (this._shouldUpdateOverlay(entries, contentArea, browser)) {
        this._scheduleOverlayUpdate(contentArea);
      }
    });

    this.contentAreaObserver.observe(contentArea);

    if (browser && browser !== contentArea) {
      this.contentAreaObserver.observe(browser);
    }

    this.updateOverlayPosition(contentArea);
  }

  /**
   * Clean up existing content area observer.
   * @private
   */
  _cleanupContentAreaObserver() {
    if (this.contentAreaObserver) {
      this.contentAreaObserver.disconnect();
      this.contentAreaObserver = null;
    }
  }

  /**
   * Check if overlay should be updated based on resize entries.
   * @param {ResizeObserverEntry[]} entries - Resize observer entries
   * @param {Element} contentArea - The content area element
   * @param {Element|null} browser - The browser element
   * @returns {boolean} True if overlay should update
   * @private
   */
  _shouldUpdateOverlay(entries, contentArea, browser) {
    return entries.some(
      (entry) => entry.target === contentArea || (browser && entry.target === browser)
    );
  }

  /**
   * Schedule a debounced overlay position update.
   * @param {Element} contentArea - The content area element
   * @private
   */
  _scheduleOverlayUpdate(contentArea) {
    if (this._overlayUpdateScheduled) return;

    this._overlayUpdateScheduled = true;
    requestAnimationFrame(() => {
      this._overlayUpdateScheduled = false;
      this.updateOverlayPosition(contentArea);
    });
  }

  /**
   * Issue 1: Update overlay position to match content area.
   * Ensures the overlay continues to cover the visible content area when it resizes.
   * Now delegates to updateOverlayBounds() for fixed positioning with explicit pixel values.
   *
   * Note: This method updates this.contentArea to the passed parameter to ensure
   * bounds are always calculated for the correct element.
   *
   * @param {Element} contentArea - The content area element to match bounds to
   */
  updateOverlayPosition(contentArea) {
    if (!this.overlay || !contentArea) {
      return;
    }

    // Always update content area reference to use the passed parameter
    // This ensures bounds are calculated for the correct element
    this.contentArea = contentArea;

    // Update bounds using fixed positioning with explicit pixel values
    this.updateOverlayBounds();
  }

  /**
   * Issue 8: Set up drag functionality for indicator
   */
  setupIndicatorDrag() {
    if (!this.indicator) return;

    let isDragging = false;
    let startX, startY;
    let startLeft, startTop;

    // Load saved position from preferences and validate against viewport bounds
    const savedPosX = getPref('indicatorPosX', null);
    const savedPosY = getPref('indicatorPosY', null);
    if (savedPosX !== null && savedPosY !== null) {
      // Ensure saved position is within current viewport bounds
      const rect = this.indicator.getBoundingClientRect();
      const indicatorWidth = rect.width;
      const indicatorHeight = rect.height;

      const rawX = Number(savedPosX);
      const rawY = Number(savedPosY);

      if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
        const maxX = Math.max(0, window.innerWidth - indicatorWidth);
        const maxY = Math.max(0, window.innerHeight - indicatorHeight);

        const clampedX = Math.max(0, Math.min(rawX, maxX));
        const clampedY = Math.max(0, Math.min(rawY, maxY));

        this.indicator.style.right = 'auto';
        this.indicator.style.left = `${clampedX}px`;
        this.indicator.style.top = `${clampedY}px`;
      }
    }

    const onMouseDown = (e) => {
      // Only start drag on left mouse button
      if (e.button !== 0) return;

      e.preventDefault();
      isDragging = true;
      this.indicatorDidDrag = false; // Reset drag state on new mousedown

      const rect = this.indicator.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      // Cache dimensions at start of drag to avoid repeated getBoundingClientRect calls
      this.indicatorWidth = rect.width;
      this.indicatorHeight = rect.height;

      // Add dragging class to disable CSS transitions during drag
      if (this.indicator?.classList) {
        this.indicator.classList.add('dragging');
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Mark as dragged if movement exceeds threshold (5 pixels)
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        this.indicatorDidDrag = true;
      }

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Keep within viewport boundaries using cached dimensions
      const maxX = window.innerWidth - this.indicatorWidth;
      const maxY = window.innerHeight - this.indicatorHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxX));
      newTop = Math.max(0, Math.min(newTop, maxY));

      // Use left positioning instead of right
      this.indicator.style.right = 'auto';
      this.indicator.style.left = `${newLeft}px`;
      this.indicator.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;

      isDragging = false;

      // Remove dragging class to re-enable CSS transitions
      if (this.indicator?.classList) {
        this.indicator.classList.remove('dragging');
      }

      // Save position to preferences
      const rect = this.indicator.getBoundingClientRect();
      setPref('indicatorPosX', Math.round(rect.left));
      setPref('indicatorPosY', Math.round(rect.top));

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Reset drag flag after a delay to allow click event to check it
      // 100ms is sufficient since click events fire immediately after mouseup
      setTimeout(() => {
        this.indicatorDidDrag = false;
      }, 100);
    };

    // Store reference for cleanup
    this.indicatorMouseDownHandler = onMouseDown;
    this.indicator.addEventListener('mousedown', onMouseDown);

    // RIGHT-CLICK TO PAUSE/UNPAUSE: Add contextmenu event handler
    // This allows users to quickly pause/resume timer without opening menu
    const onContextMenu = (e) => {
      // Prevent the default context menu from showing
      e.preventDefault();
      // Stop propagation to prevent affecting the webpage below
      e.stopPropagation();

      // Check if timer is active
      if (!window.zenPomodoroApp?.timer?.isActive) {
        return;
      }

      // Check if Distraction Dump is active - don't allow pause during dump
      if (isDistractionDumpBlocking()) {
        window.zenPomodoroApp.showCustomAlert(
          Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
          Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
        );
        return;
      }

      // Toggle pause/resume
      handlePauseResumeTimer();

      logger.log(LOG_CATEGORIES.TIMER, 'Timer toggled via indicator right-click', {
        isPaused: window.zenPomodoroApp.timer.isPaused,
      });
    };

    // Store reference for cleanup
    this.indicatorContextMenuHandler = onContextMenu;
    this.indicator.addEventListener('contextmenu', onContextMenu);
  }

  /**
   * Set up overlay button handlers
   * RACE CONDITION FIX: Called immediately after overlay creation
   */
  setupOverlayHandlers() {
    const pauseButton = this.overlay?.querySelector('#zen-pomodoro-pause-button');
    const stopButton = this.overlay?.querySelector('#zen-pomodoro-stop-button');

    if (pauseButton) {
      pauseButton.addEventListener('click', () => this._handlePauseClick(pauseButton));
    }

    if (stopButton) {
      stopButton.addEventListener('click', () => {
        // Issue 6: Require lockout before stopping timer using helper function
        handleStopTimerWithLockout(() => {
          window.zenPomodoroApp.stopTimer();
        });
      });
    }
  }

  /**
   * Handle pause button click on overlay.
   * @param {HTMLElement} pauseButton - The pause button element
   * @private
   */
  _handlePauseClick(pauseButton) {
    if (!window.zenPomodoroApp || !window.zenPomodoroApp.timer) return;

    // Check if Distraction Dump is active - provide user feedback
    if (isDistractionDumpBlocking()) {
      window.zenPomodoroApp.showCustomAlert(
        Constants.DISTRACTION_DUMP_LOCK_ALERT.TITLE,
        Constants.DISTRACTION_DUMP_LOCK_ALERT.MESSAGE
      );
      return;
    }
    handlePauseResumeTimer();
    pauseButton.textContent = window.zenPomodoroApp.timer.isPaused ? 'Resume' : 'Pause';
  }

  /**
   * Show overlay
   *
   * FLICKERING FIX (Issue 2): The overlay was flickering because the CSS animation
   * was re-triggering every second when updateOverlayVisibility() called show().
   *
   * Solution: Use two-class approach:
   * 1. 'active' class controls display (flex/none)
   * 2. 'zen-pomodoro-animate-in' class triggers the fade-in animation
   *
   * CSS selector requires BOTH classes: .active.zen-pomodoro-animate-in
   * This ensures animation only runs once when overlay first appears.
   * The animation class is removed in hide() so it can re-trigger next time.
   */
  show(phase = 'focus') {
    if (!this.overlay) this.createOverlay();

    // Only add classes and trigger animation if not already showing
    if (!this.isVisible) {
      logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay shown', { phase: phase });
      this.overlay.classList.add('active');
      // Animation class triggers CSS animation (removed in hide() for re-trigger)
      this.overlay.classList.add('zen-pomodoro-animate-in');

      // Re-setup ResizeObserver if content area exists (was disconnected in hide())
      if (this.contentArea) {
        this.setupContentAreaObserver(this.contentArea);
      }

      // Update overlay bounds to ensure proper positioning
      this.updateOverlayBounds();

      // Backup: Apply inline styles to ensure visibility
      this.overlay.style.setProperty('display', 'flex', 'important');
      this.overlay.style.setProperty('visibility', 'visible', 'important');
      this.overlay.style.setProperty('opacity', '1', 'important');
      this.overlay.style.setProperty('pointer-events', 'all', 'important');
      this.overlay.style.setProperty('z-index', MAX_OVERLAY_Z_INDEX, 'important');

      this.isVisible = true;

      // Deferred visibility check - runs once per show() after next paint
      // Using getComputedStyle inside rAF is appropriate as it's after layout
      requestAnimationFrame(() => {
        const computedStyle = window.getComputedStyle(this.overlay);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
          logger.log(
            LOG_CATEGORIES.OVERLAY,
            'Warning: Overlay not visible after show, forcing styles'
          );
          this.overlay.style.setProperty('display', 'flex', 'important');
          this.overlay.style.setProperty('visibility', 'visible', 'important');
        }
      });
    }

    // Only update phase color when phase actually changes
    const currentPhase = this.overlay.getAttribute('data-phase');
    if (currentPhase !== phase) {
      this.overlay.setAttribute('data-phase', phase);
      this.updatePhaseColor(phase);
    }
  }

  /**
   * Hide overlay
   * Removes both active and animation classes.
   * Animation class removal allows re-triggering when show() is called again.
   * Bug Fix: Clear all inline styles that were set in show() to prevent UI artifacts
   *
   * Note: After removing inline styles, the CSS rules take over:
   * - #zen-pomodoro-overlay (without .active) has display:none, visibility:hidden
   * - The !important flags in CSS ensure proper hiding
   */
  hide() {
    if (this.overlay) {
      // Only log when actually hiding (transitioning from visible to hidden)
      if (this.isVisible) {
        logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay hidden');
      }
      this.overlay.classList.remove('active');
      this.overlay.classList.remove('zen-pomodoro-animate-in');

      // Clear ALL inline styles that were set in show() with setProperty()
      // This allows the CSS rules for the base #zen-pomodoro-overlay selector
      // to take effect (display:none, visibility:hidden, pointer-events:all)
      this.overlay.style.removeProperty('display');
      this.overlay.style.removeProperty('visibility');
      this.overlay.style.removeProperty('opacity');
      this.overlay.style.removeProperty('pointer-events');
      this.overlay.style.removeProperty('z-index');

      // BUG FIX: Clear bounds styles set by updateOverlayBounds()
      // These inline styles (top, left, width, height) can cause the overlay
      // to still affect layout even when hidden, potentially blocking UI elements
      // like the Zen Sidebar and toolbar
      this.overlay.style.removeProperty('top');
      this.overlay.style.removeProperty('left');
      this.overlay.style.removeProperty('width');
      this.overlay.style.removeProperty('height');

      // BUG FIX: Disconnect ResizeObserver when hiding to prevent
      // unnecessary reflows and potential UI blocking issues
      this._cleanupContentAreaObserver();

      this.isVisible = false;
    }
  }

  /**
   * Update timer display
   * SECURITY FIX: Use textContent instead of innerHTML
   */
  updateDisplay(remainingTime, phase, currentCycle, totalCycles) {
    if (!this.overlay) return;

    const timeStr = formatTime(remainingTime);

    this._updateTimerText(timeStr);
    this._updatePhaseLabel(phase);
    this._updateCycleProgress(phase, currentCycle, totalCycles);
    this._updateIndicator(phase, timeStr);

    // Log every 30 seconds to avoid log spam
    if (remainingTime % 30 === 0) {
      logger.log(LOG_CATEGORIES.OVERLAY, 'Display updated', {
        time: timeStr,
        phase,
        cycle: currentCycle,
        totalCycles,
      });
    }
  }

  /**
   * Update the main timer text display.
   * @param {string} timeStr - Formatted time string
   * @private
   */
  _updateTimerText(timeStr) {
    const timerDisplay = this.overlay.querySelector('#zen-pomodoro-timer-display');
    if (timerDisplay) timerDisplay.textContent = timeStr;
  }

  /**
   * Update the phase label display.
   * @param {string} phase - Current phase identifier
   * @private
   */
  _updatePhaseLabel(phase) {
    const phaseLabel = this.overlay.querySelector('#zen-pomodoro-phase-label');
    if (phaseLabel) {
      phaseLabel.textContent = getPhaseLabel(phase);
    }
  }

  /**
   * Update the cycle progress display.
   * @param {string} phase - Current phase identifier
   * @param {number} currentCycle - Current cycle number
   * @param {number} totalCycles - Total number of cycles
   * @private
   */
  _updateCycleProgress(phase, currentCycle, totalCycles) {
    const cycleProgress = this.overlay.querySelector('#zen-pomodoro-cycle-progress');
    if (!cycleProgress) return;

    // Only show cycle progress for pomodoro and custom modes during focus phase
    const timerMode = window.zenPomodoroApp?.timer?.mode;
    const shouldShow = phase === 'focus' && (timerMode === 'pomodoro' || timerMode === 'custom');
    cycleProgress.classList.toggle('zen-pomodoro-hidden', !shouldShow);
    if (shouldShow) {
      cycleProgress.textContent = `Cycle ${currentCycle} of ${totalCycles}`;
    }
  }

  /**
   * Update the corner indicator.
   * @param {string} phase - Current phase identifier
   * @param {string} timeStr - Formatted time string
   * @private
   */
  _updateIndicator(phase, timeStr) {
    const indicatorText = this.indicator?.querySelector('#zen-pomodoro-indicator-text');
    if (indicatorText) {
      indicatorText.textContent = `${getShortPhaseLabel(phase)}: ${timeStr}`;
    }
    if (this.indicator) {
      this.indicator.setAttribute('data-phase', phase);

      // PAUSED INDICATOR FIX: keep paused state in sync during normal updates,
      // not just on explicit pause/resume actions, using the centralized handler.
      const timer = window.zenPomodoroApp?.timer;
      if (timer) {
        this.updateIndicatorPausedState(timer.isPaused);
      }
    }
  }

  /**
   * Update phase color
   */
  updatePhaseColor(phase) {
    if (!this.overlay) return;

    this.overlay.setAttribute('data-phase', phase);
    logger.log(LOG_CATEGORIES.OVERLAY, 'Overlay phase color updated', { phase });

    // Trigger transition animation
    this.overlay.setAttribute('data-transitioning', 'true');
    setTimeout(() => {
      if (this.overlay) {
        this.overlay.removeAttribute('data-transitioning');
      }
    }, 500);
  }

  /**
   * Show persistent indicator
   * Bug Fix: Reset indicator display before showing to prevent flash of previous timer duration
   */
  showIndicator() {
    if (!this.indicator) this.createOverlay();

    // Reset indicator text and phase before showing to prevent flash of previous timer data
    this._resetIndicatorDisplay();

    this.indicator.classList.add('active');
    logger.log(LOG_CATEGORIES.OVERLAY, 'Timer indicator shown');
  }

  /**
   * Reset the indicator display with current timer data.
   * Prevents the flash of previous timer duration when starting a new timer.
   * @private
   */
  _resetIndicatorDisplay() {
    const indicatorText = this.indicator?.querySelector('#zen-pomodoro-indicator-text');
    if (!indicatorText) return;

    const timer = window.zenPomodoroApp?.timer;
    if (!timer || timer.remainingTime === undefined) return;

    const timeStr = formatTime(timer.remainingTime);
    const phase = timer.currentPhase || 'focus';
    const phaseLabel = getShortPhaseLabel(phase);

    indicatorText.textContent = `${phaseLabel}: ${timeStr}`;
    this.indicator.setAttribute('data-phase', phase);

    // Note: Paused state is set by actual pause/resume handlers in handlePauseResumeTimer(),
    // not here during indicator initialization. This prevents incorrect initial state.
  }

  /**
   * Hide persistent indicator
   */
  hideIndicator() {
    if (this.indicator) {
      this.indicator.classList.remove('active');
      logger.log(LOG_CATEGORIES.OVERLAY, 'Timer indicator hidden');
    }
  }

  /**
   * Update the indicator's paused state attribute for visual feedback.
   * This method should be called when the timer is paused or resumed
   * to ensure the indicator shows orange color when paused and normal color when not paused.
   * @param {boolean} isPaused - Whether the timer is currently paused
   */
  updateIndicatorPausedState(isPaused) {
    if (!this.indicator) return;

    this.indicator.setAttribute('data-paused', isPaused ? 'true' : 'false');
    logger.log(LOG_CATEGORIES.OVERLAY, 'Indicator paused state attribute updated', {
      isPaused: isPaused,
    });
  }

  /**
   * Switch indicator to dump mode - purple styling and dump timer display.
   * Applies the 'dump-active' CSS class which triggers purple gradient background,
   * purple dot color, and clickable cursor. Shows the indicator if not already visible.
   * @param {number} timeInSeconds - Time remaining in dump in seconds
   */
  showDumpIndicator(timeInSeconds) {
    if (!this.indicator) this.createOverlay();

    // Add dump-active class for purple styling
    this.indicator.classList.add('dump-active');

    // Update text to show dump time (no emoji for accessibility)
    const indicatorText = this.indicator.querySelector('#zen-pomodoro-indicator-text');
    if (indicatorText) {
      indicatorText.textContent = `Dump: ${formatTime(timeInSeconds)}`;
    }

    // Show indicator if not already visible
    if (!this.indicator.classList.contains('active')) {
      this.indicator.classList.add('active');
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Dump indicator shown', { timeInSeconds });
  }

  /**
   * Update dump indicator time display.
   * Updates only the text content to show remaining dump time.
   * Does not change styling or visibility.
   * @param {number} timeInSeconds - Time remaining in dump in seconds
   */
  updateDumpIndicator(timeInSeconds) {
    if (!this.indicator) return;

    const indicatorText = this.indicator.querySelector('#zen-pomodoro-indicator-text');
    if (indicatorText) {
      indicatorText.textContent = `Dump: ${formatTime(timeInSeconds)}`;
    }
  }

  /**
   * Switch indicator back to normal timer mode.
   * Removes the 'dump-active' class and restores normal timer display.
   * If the timer is active, shows current phase and time.
   * If the timer is not active, hides the indicator completely.
   */
  hideDumpIndicator() {
    if (!this.indicator) return;

    // Remove dump-active class
    this.indicator.classList.remove('dump-active');

    // Restore normal timer display
    const timer = window.zenPomodoroApp?.timer;
    if (timer && timer.isActive) {
      const timeStr = formatTime(timer.remainingTime);
      const phase = timer.currentPhase || 'focus';
      this._updateIndicator(phase, timeStr);
    } else {
      // If timer is not active, hide the indicator
      this.hideIndicator();
    }

    logger.log(LOG_CATEGORIES.TIMER, 'Dump indicator hidden, normal indicator restored');
  }

  /**
   * Remove overlay elements and cleanup
   * MEMORY LEAK FIX: Clean up ResizeObserver and event listeners on destroy
   */
  destroy() {
    this._cleanupContentAreaObserver();
    this._cleanupContentAreaReference();
    this._cleanupIndicatorEventListener();
    this._removeOverlayElements();
  }

  /**
   * Clean up content area reference.
   * Clears the stored reference to the content area element.
   * @private
   */
  _cleanupContentAreaReference() {
    this.contentArea = null;
  }

  /**
   * Clean up indicator mouse event listener.
   * @private
   */
  _cleanupIndicatorEventListener() {
    if (this.indicator && this.indicatorMouseDownHandler) {
      this.indicator.removeEventListener('mousedown', this.indicatorMouseDownHandler);
      this.indicatorMouseDownHandler = null;
    }
    // Clean up contextmenu handler for right-click pause/unpause
    if (this.indicator && this.indicatorContextMenuHandler) {
      this.indicator.removeEventListener('contextmenu', this.indicatorContextMenuHandler);
      this.indicatorContextMenuHandler = null;
    }
  }

  /**
   * Remove overlay and indicator elements from DOM.
   * @private
   */
  _removeOverlayElements() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.indicator) {
      this.indicator.remove();
      this.indicator = null;
    }
  }
}

export default OverlayManager;
