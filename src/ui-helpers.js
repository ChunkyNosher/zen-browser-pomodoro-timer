/**
 * UI Helper Functions - Utilities for dialog management and UI interactions.
 */

import { logger } from './log-manager.js';
import { lastDialogPosition, setLastDialogPosition } from './state.js';
import { formatTimeWithHours, clampToViewportBound, DATA_NO_POSITION_SAVE, LOG_CATEGORIES } from './helpers.js';

// ============================================
// Dialog Drag & Positioning Functions
// ============================================

/**
 * Initialize dialog position for drag by converting from CSS centering to absolute pixels.
 * @param {HTMLElement} dialog - The dialog element
 * @param {DOMRect} rect - The dialog's bounding client rect
 */
export function initializeDialogDragPosition(dialog, rect) {
  const computedStyle = window.getComputedStyle(dialog);
  if (computedStyle.transform !== 'none') {
    dialog.style.transform = 'none';
  }
  dialog.style.position = 'fixed';
  dialog.style.left = `${rect.left}px`;
  dialog.style.top = `${rect.top}px`;
}

/**
 * Check if an event is a valid touch event with active touches.
 * @param {Event} e - The event to check
 * @returns {boolean} True if the event is a touch event with touches
 */
export function isTouchEventWithTouches(e) {
  return e.type?.startsWith('touch') && e.touches?.length > 0;
}

/**
 * Get client coordinates from a mouse or touch event.
 * @param {Event} e - The mouse or touch event
 * @returns {{x: number, y: number}} The client coordinates
 */
export function getClientCoords(e) {
  if (isTouchEventWithTouches(e)) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

/**
 * Issue 8: Setup drag functionality for dialogs
 * Makes a dialog draggable by its header (h2 element).
 * The dialog can be moved within the viewport boundaries.
 *
 * @param {HTMLElement} dialog - The dialog element to make draggable.
 *                               Must contain an h2 element as the drag handle.
 * @returns {void}
 *
 * @example
 * const dialog = document.createElement('div');
 * dialog.className = 'zen-pomodoro-dialog active';
 * // ... add h2 and other content ...
 * document.documentElement.appendChild(dialog);
 * setupDialogDrag(dialog);
 */
export function setupDialogDrag(dialog) {
  const header = dialog.querySelector('h2');
  if (!header) {
    console.warn(
      '[ZenPomodoro] setupDialogDrag: No h2 found in dialog',
      dialog?.id || dialog?.tagName || 'unknown'
    );
    return;
  }

  // Mark header as drag handle for debugging and styling
  header.setAttribute('data-drag-handle', 'true');

  // Ensure h2 can receive pointer events and has proper cursor
  header.style.cursor = 'move';
  header.style.userSelect = 'none';
  header.style.pointerEvents = 'auto';

  let isDragging = false;
  let startX, startY;
  let startLeft, startTop;
  let dialogWidth, dialogHeight;

  // Helper to add/remove document-level drag listeners
  const addDragListeners = () => {
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const removeDragListeners = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };

  const startDrag = (e) => {
    // For mouse events, only start drag on left mouse button
    if (e.type === 'mousedown' && e.button !== 0) return;

    e.preventDefault();
    isDragging = true;

    const rect = dialog.getBoundingClientRect();
    const coords = getClientCoords(e);
    startX = coords.x;
    startY = coords.y;

    // Convert from CSS centering to absolute pixel positioning
    initializeDialogDragPosition(dialog, rect);

    startLeft = rect.left;
    startTop = rect.top;
    dialogWidth = rect.width;
    dialogHeight = rect.height;

    dialog.classList.add('dragging');
    header.style.cursor = 'grabbing';

    addDragListeners();
  };

  const onMove = (e) => {
    if (!isDragging) return;

    e.preventDefault();

    const coords = getClientCoords(e);
    const deltaX = coords.x - startX;
    const deltaY = coords.y - startY;

    // Clamp positions to viewport boundaries using helper
    const newLeft = clampToViewportBound(startLeft + deltaX, dialogWidth, window.innerWidth);
    const newTop = clampToViewportBound(startTop + deltaY, dialogHeight, window.innerHeight);

    dialog.style.left = `${newLeft}px`;
    dialog.style.top = `${newTop}px`;
  };

  const onEnd = () => {
    if (!isDragging) return;

    isDragging = false;
    dialog.classList.remove('dragging');
    header.style.cursor = 'move';

    // Only save position for dialogs that don't have the no-save attribute
    if (!dialog.hasAttribute(DATA_NO_POSITION_SAVE)) {
      saveDialogPosition(dialog);
    }

    removeDragListeners();
  };

  // Add event listeners to header for both mouse and touch
  header.addEventListener('mousedown', startDrag);
  header.addEventListener('touchstart', startDrag, { passive: false });

  // Store references for cleanup
  dialog._dragStartHandler = startDrag;
  dialog._dragHeader = header;

  // Use MutationObserver to clean up when dialog is removed from DOM
  _setupDragCleanupObserver(dialog, header, startDrag, removeDragListeners);
}

/**
 * Set up a MutationObserver to clean up drag listeners when dialog is removed from DOM.
 * @param {HTMLElement} dialog - The dialog element being observed
 * @param {HTMLElement} header - The drag handle header element
 * @param {function} startDrag - The drag start handler to remove
 * @param {function} removeDragListeners - Function to remove document-level listeners
 * @private
 */
export function _setupDragCleanupObserver(dialog, header, startDrag, removeDragListeners) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const removedNode of mutation.removedNodes) {
        if (removedNode === dialog) {
          removeDragListeners();
          header.removeEventListener('mousedown', startDrag);
          header.removeEventListener('touchstart', startDrag);
          observer.disconnect();
          return;
        }
      }
    }
  });

  // Observe a stable ancestor (documentElement) to ensure observer always sees dialog removal
  const targetNode = dialog.ownerDocument && dialog.ownerDocument.documentElement;
  if (targetNode) {
    observer.observe(targetNode, { childList: true, subtree: true });
  } else if (dialog.parentNode) {
    observer.observe(dialog.parentNode, { childList: true, subtree: false });
  }
}

/**
 * Save the current dialog position before it's closed.
 * Call this before removing a dialog that may have been dragged.
 * @param {HTMLElement} dialog - The dialog element to save position from
 */
export function saveDialogPosition(dialog) {
  if (!dialog) return;

  const rect = dialog.getBoundingClientRect();

  // Check if dialog has explicit pixel positioning (was dragged)
  // We check for both inline style values, as drag converts transform to pixel positioning
  const hasExplicitPosition = dialog.style.left && dialog.style.top;

  if (hasExplicitPosition) {
    // Dialog was dragged - use explicit position values
    setLastDialogPosition({
      left: parseFloat(dialog.style.left) || rect.left,
      top: parseFloat(dialog.style.top) || rect.top,
    });
  } else if (rect.width > 0 && rect.height > 0) {
    // Dialog hasn't been dragged but exists - save its current visual position
    setLastDialogPosition({ left: rect.left, top: rect.top });
  }
}

/**
 * Check if dialog can be positioned (has valid dimensions and viewport is available).
 * @param {Element} dialog - The dialog element
 * @param {DOMRect} rect - Dialog's bounding rect
 * @returns {{valid: boolean, viewportWidth: number, viewportHeight: number}}
 */
export function getViewportDimensions(dialog, rect) {
  // Validate dialog exists
  if (!dialog) {
    return { valid: false, viewportWidth: 0, viewportHeight: 0 };
  }

  // Check dialog has been rendered
  const hasValidDimensions = rect.width > 0 && rect.height > 0;
  if (!hasValidDimensions) {
    return { valid: false, viewportWidth: 0, viewportHeight: 0 };
  }

  // Get and validate viewport dimensions
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  const hasValidViewport = viewportWidth > 0 && viewportHeight > 0;

  return {
    valid: hasValidViewport,
    viewportWidth,
    viewportHeight,
  };
}

/**
 * Ensure a dialog is fully visible within the viewport.
 * Adjusts position if the dialog extends beyond viewport boundaries.
 * @param {HTMLElement} dialog - The dialog element to check and adjust
 */
export function ensureDialogInViewport(dialog) {
  if (!dialog) return;

  const rect = dialog.getBoundingClientRect();
  const viewport = getViewportDimensions(dialog, rect);
  if (!viewport.valid) return;

  // Calculate the position that keeps the dialog within viewport bounds
  const maxLeft = Math.max(0, viewport.viewportWidth - rect.width);
  const maxTop = Math.max(0, viewport.viewportHeight - rect.height);

  const currentLeft = parseFloat(dialog.style.left) || rect.left;
  const currentTop = parseFloat(dialog.style.top) || rect.top;

  const constrainedLeft = Math.max(0, Math.min(currentLeft, maxLeft));
  const constrainedTop = Math.max(0, Math.min(currentTop, maxTop));

  // Only update if position changed
  if (constrainedLeft !== currentLeft || constrainedTop !== currentTop) {
    dialog.style.left = `${constrainedLeft}px`;
    dialog.style.top = `${constrainedTop}px`;
  }
}

/**
 * Apply saved position to a dialog if available.
 * This allows submenus to open at the same position as the parent dialog.
 * Call this after appending the dialog to the DOM but before setupDialogDrag.
 * @param {HTMLElement} dialog - The dialog element to position
 */
export function applyLastDialogPosition(dialog) {
  if (!dialog || !lastDialogPosition) return;

  const { left, top } = lastDialogPosition;

  // Apply pixel positioning directly (override CSS centering)
  dialog.style.position = 'fixed';
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
  dialog.style.transform = 'none';

  // Use requestAnimationFrame to ensure CSS is applied before checking bounds
  // This allows the browser to render the dialog with its actual dimensions
  // before we check if it extends beyond the viewport
  requestAnimationFrame(() => {
    ensureDialogInViewport(dialog);
  });
}

// ============================================
// UI Helper Functions
// ============================================

/**
 * Validate time format (HH:MM, 24-hour) with range checking.
 * This function is used widely throughout the codebase for time validation.
 * @param {string} timeStr - Time string to validate
 * @returns {boolean} True if valid time format
 */
export function isValidTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;

  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Update a countdown element with time until next reminder.
 * Safely handles null/undefined elements by returning early without errors.
 * @param {HTMLElement|null} element - The countdown element to update (returns early if null/undefined)
 * @param {number|null} secondsUntil - Seconds until reminder (null if not applicable)
 * @param {Object} options - Configuration options
 * @param {string} options.readyText - Text to show when countdown reaches 0
 * @param {string} options.prefixText - Prefix text for countdown display
 * @param {boolean} [options.useHours=false] - Whether to format time with hours
 * @returns {void}
 */
export function updateCountdownElement(element, secondsUntil, options) {
  if (!element) {
    return;
  }

  if (secondsUntil === null) {
    element.classList.add('zen-pomodoro-hidden');
    return;
  }

  element.classList.remove('zen-pomodoro-hidden');

  if (secondsUntil === 0) {
    element.textContent = options.readyText;
    return;
  }

  const timeStr = formatTimeWithHours(secondsUntil, options.useHours || false);
  element.textContent = `${options.prefixText}${timeStr}`;
}

/**
 * Get detailed phase label for menu display.
 * Differentiates between 'break' and 'long-break' phases.
 * @param {string} phase - Phase identifier
 * @returns {string} Detailed phase label
 */
export function getMenuPhaseLabel(phase) {
  const labels = {
    focus: 'Focus',
    break: 'Break',
    'long-break': 'Long Break',
    transition: 'Transition',
  };
  return labels[phase] || 'Focus';
}

/**
 * Create a labeled input row for dialog forms.
 * @param {string} labelText - Label text
 * @param {string} inputId - Input element ID
 * @param {Object} inputAttrs - Input attributes (type, value, min, max)
 * @returns {HTMLElement} The row element
 */
export function createLabeledInputRow(labelText, inputId, inputAttrs = {}) {
  const row = document.createElement('div');
  row.className = 'zen-pomodoro-config-row';
  row.id = `${inputId}-row`;

  const label = document.createElement('label');
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = inputAttrs.type || 'number';
  input.id = inputId;
  if (inputAttrs.value !== undefined) input.value = inputAttrs.value;
  if (inputAttrs.min !== undefined) input.min = inputAttrs.min;
  if (inputAttrs.max !== undefined) input.max = inputAttrs.max;

  row.appendChild(label);
  row.appendChild(input);

  return row;
}

/**
 * Create a labeled select row for dialog forms.
 * @param {string} labelText - Label text
 * @param {string} selectId - Select element ID
 * @param {Array<{value: string, text: string, selected?: boolean}>} options - Select options
 * @returns {{row: HTMLElement, select: HTMLSelectElement}} The row and select elements
 */
export function createLabeledSelectRow(labelText, selectId, options) {
  const row = document.createElement('div');
  row.className = 'zen-pomodoro-config-row';

  const label = document.createElement('label');
  label.textContent = labelText;

  const select = document.createElement('select');
  select.id = selectId;

  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (opt.selected) option.selected = true;
    select.appendChild(option);
  });

  row.appendChild(label);
  row.appendChild(select);

  return { row, select };
}

/**
 * Render an empty list message or items from an array.
 * Shared utility to reduce code duplication between _renderRulesets and _renderRules.
 * @param {Object} options - Options object
 * @param {HTMLElement} options.container - Container to populate
 * @param {Array} options.items - Array of items to check
 * @param {string} options.emptyClass - CSS class for empty message
 * @param {string} options.emptyText - Text for empty message
 * @param {Function} options.renderItem - Function to render each item
 */
export function renderListOrEmptyMessage({ container, items, emptyClass, emptyText, renderItem }) {
  container.innerHTML = '';

  if (!items || items.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = emptyClass;
    emptyMsg.textContent = emptyText;
    container.appendChild(emptyMsg);
    return;
  }

  items.forEach(renderItem);
}

// ============================================
// Timer Control Helpers
// ============================================

/**
 * Helper to handle stop timer with lockout.
 * Reduces code duplication for stop timer logic.
 *
 * When timer is active, ALWAYS shows the lockout screen before allowing
 * the timer to be stopped. The lockout method (code entry or hold button)
 * is determined by the user's settingsLockActiveMethod configuration.
 *
 * When timer is not active, shows confirmation directly without lockout.
 *
 * @param {() => void} onStop - Callback to execute after successful stop confirmation
 */
/**
 * Show a lockout-protected confirmation dialog for timer actions.
 * @param {string} title - Confirmation dialog title
 * @param {string} message - Confirmation dialog message
 * @param {Function} onConfirm - Callback on confirmation
 * @private
 */
function showLockoutProtectedConfirm(title, message, onConfirm) {
  const app = window.zenPomodoroApp;
  if (!app) return;

  const showConfirm = () => app.showCustomConfirm(title, message, onConfirm);
  const timerActive = app.timer?.isActive;

  if (timerActive) {
    app.security.showLockScreen(true, showConfirm);
  } else {
    showConfirm();
  }
}

export function handleStopTimerWithLockout(onStop) {
  showLockoutProtectedConfirm('Stop Timer', 'Are you sure you want to stop the timer?', onStop);
}

/**
 * Helper function to skip the current focus phase with lockout protection.
 * Used to allow users to skip to break early with anti-cheating protection.
 *
 * @param {Function} onSkip - Callback function to execute after lockout verification
 */
export function handleSkipFocusWithLockout(onSkip) {
  showLockoutProtectedConfirm(
    'Skip Focus',
    'Skip current focus phase and start break early? Your focus time will not be counted.',
    onSkip
  );
}

/**
 * Check if Distraction Dump is currently blocking timer control actions.
 * This helper function provides a centralized check to avoid code duplication.
 *
 * @returns {boolean} True if Distraction Dump is active and blocking timer actions
 */
export function isDistractionDumpBlocking() {
  return Boolean(window.zenPomodoroApp?.distractionDump?.isActive);
}

/**
 * Handle timer pause/resume logic with overlay and indicator updates.
 * This helper function consolidates the pause/resume logic to eliminate code duplication.
 *
 * PAUSE FIX: When pausing, checks if currently on a blocked workspace using
 * isWorkspaceInBlockedList() which checks raw workspace membership without break
 * phase interference (break phase handling is separate).
 *
 * NOTE: This function handles core timer state and visual indicator updates only.
 * Callers are responsible for updating their own UI elements (e.g., button text).
 *
 * @returns {void}
 */
export function handlePauseResumeTimer() {
  const app = window.zenPomodoroApp;
  if (!app?.timer || !app.workspace || !app.overlay) return;

  // Check if Distraction Dump is active - don't allow pause/resume during dump
  if (isDistractionDumpBlocking()) {
    logger.log(LOG_CATEGORIES.TIMER, 'Cannot pause/resume timer - Distraction Dump is active');
    return;
  }

  const timer = app.timer;

  // CROSS-WINDOW SYNC: Claim ownership if this is a secondary window
  app._claimOwnershipForAction();

  if (timer.isPaused) {
    timer.resume();
  } else {
    // Use isWorkspaceInBlockedList() to check raw workspace membership
    const isOnBlockedWorkspace = app.workspace.isWorkspaceInBlockedList();
    timer.pause(isOnBlockedWorkspace);
  }

  // Update overlay visibility and indicator paused state
  app.updateOverlayVisibility();
  app.overlay.updateIndicatorPausedState(timer.isPaused);
}
