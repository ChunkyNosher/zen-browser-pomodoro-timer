/**
 * Drag utility functions for custom cycle block drag-and-drop.
 * Extracted from CustomCycleManager to reduce module complexity.
 */

import Constants from './constants.js';
import { logger } from './log-manager.js';

/**
 * Create a floating drag preview for dragged blocks.
 * @param {PointerEvent} e - The pointer event
 * @param {HTMLElement} blockDiv - The block element being dragged
 * @param {Array<HTMLElement>} allBlocks - All block elements
 * @param {Array<number>} dragIndices - Indices of blocks being dragged
 * @returns {{ dragPreview: HTMLElement, offsetY: number }} Drag preview element and offset
 */
export function createDragPreview(e, blockDiv, allBlocks, dragIndices) {
  const blockWidth = blockDiv.offsetWidth;
  const blockRect = blockDiv.getBoundingClientRect();
  const startY = e.clientY;
  const offsetY = startY - blockRect.top;

  const dragPreview = document.createElement('div');
  dragPreview.style.position = 'fixed';
  dragPreview.style.pointerEvents = 'none';
  dragPreview.style.zIndex = '2147483647';
  dragPreview.style.opacity = '0.85';
  dragPreview.style.width = `${blockWidth}px`;
  dragPreview.style.transition = 'none';
  dragPreview.className = 'zen-pomodoro-drag-preview';

  dragIndices.forEach(idx => {
    if (allBlocks[idx]) {
      const clone = allBlocks[idx].cloneNode(true);
      clone.classList.remove('selected');
      clone.style.margin = '0';
      clone.style.pointerEvents = 'none';
      dragPreview.appendChild(clone);
    }
  });

  dragPreview.style.left = `${blockRect.left}px`;
  dragPreview.style.top = `${startY - offsetY}px`;
  document.documentElement.appendChild(dragPreview);

  return { dragPreview, offsetY };
}

/**
 * Clean up visual state after a drag operation ends.
 * @param {Array<HTMLElement>} allBlocks - All block DOM elements
 * @param {HTMLElement} dropIndicator - Drop indicator element
 * @param {Array<HTMLElement>} ghostBlocks - Ghost block elements
 */
export function cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks) {
  if (dropIndicator && dropIndicator.parentElement) {
    dropIndicator.remove();
  }
  ghostBlocks.forEach((g) => {
    if (g && g.parentElement) {
      g.remove();
    }
  });
  
  // Remove any orphaned indicators or ghosts from container
  const container = allBlocks[0]?.parentElement;
  if (container) {
    container.querySelectorAll('.zen-pomodoro-cycle-drop-indicator').forEach((el) => {
      el.remove();
    });
    container.querySelectorAll('.zen-pomodoro-cycle-block-ghost').forEach((el) => {
      el.remove();
    });
  }
  
  allBlocks.forEach(block => {
    block.classList.remove('dragging', 'drag-transition');
  });
}

/**
 * Compute the reference element for drop indicator positioning.
 * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
 * @param {number} targetIndex - Target insertion index
 * @returns {HTMLElement|null} Reference element to insert before, or null to append
 */
export function getDropIndicatorRef(nonDraggedBlocks, targetIndex) {
  if (targetIndex < nonDraggedBlocks.length) {
    return nonDraggedBlocks[targetIndex];
  }
  const lastNonDragged = nonDraggedBlocks[nonDraggedBlocks.length - 1];
  return (lastNonDragged && lastNonDragged.nextSibling) || null;
}

/**
 * Show ghost blocks at the drop indicator position for duplication preview.
 * @param {HTMLElement} container - Blocks container
 * @param {HTMLElement} dropIndicator - Drop indicator element
 * @param {Array<HTMLElement>} ghostBlocks - Ghost block elements
 */
export function showGhostBlocks(container, dropIndicator, ghostBlocks) {
  ghostBlocks.forEach((g) => {
    g.remove();
  });
  ghostBlocks.forEach((ghost) => {
    ghost.style.display = '';
    container.insertBefore(ghost, dropIndicator);
  });
}

/**
 * Update auto-scroll state based on pointer position relative to container edges.
 * @param {number} clientY - Current pointer Y position
 * @param {HTMLElement} scrollContainer - Scrollable container element
 * @param {Object} scrollState - Mutable state object with rafId and direction
 * @param {Object} options - Auto-scroll options
 * @param {number} options.zone - Distance from edge to trigger scrolling (px)
 * @param {number} options.scrollSpeed - Scroll speed per animation frame (px)
 * @param {Function} options.onScroll - Callback to update drop target during scroll
 */
export function updateAutoScroll(clientY, scrollContainer, scrollState, { zone, scrollSpeed, onScroll }) {
  const containerRect = scrollContainer.getBoundingClientRect();
  let newScrollDir = null;
  if (clientY < containerRect.top + zone) {
    newScrollDir = 'up';
  } else if (clientY > containerRect.bottom - zone) {
    newScrollDir = 'down';
  }

  if (newScrollDir === scrollState.direction) return;

  // Stop any existing scroll
  if (scrollState.rafId) {
    cancelAnimationFrame(scrollState.rafId);
    scrollState.rafId = null;
  }
  scrollState.direction = newScrollDir;
  if (scrollState.direction) {
    logger.log(Constants.LOG_CATEGORIES.MENU, `Auto-scroll activated (${scrollState.direction})`);
    const scrollDelta = scrollState.direction === 'up' ? -scrollSpeed : scrollSpeed;
    const doScroll = () => {
      scrollContainer.scrollTop += scrollDelta;
      // Recalculate drop target as scroll position changes
      if (onScroll) {
        onScroll(clientY);
      }
      scrollState.rafId = requestAnimationFrame(doScroll);
    };
    scrollState.rafId = requestAnimationFrame(doScroll);
  }
}

/**
 * Calculate the drop target index based on pointer Y position.
 * Returns the index among non-dragged blocks where the drop should occur.
 * @param {HTMLElement} container - The blocks container
 * @param {number} clientY - Pointer Y position
 * @param {Array<number>} dragIndices - Indices of blocks being dragged
 * @returns {number} Target insertion index among non-dragged blocks
 */
export function getDropTargetIndex(container, clientY, dragIndices) {
  const allBlocks = Array.from(container.querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)'));
  const nonDraggedBlocks = allBlocks.filter((_, idx) => !dragIndices.includes(idx));

  // Find the position among non-dragged blocks
  for (let i = 0; i < nonDraggedBlocks.length; i++) {
    const rect = nonDraggedBlocks[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) {
      return i;
    }
  }
  
  return nonDraggedBlocks.length; // After all blocks
}

/**
 * Convert a relative drop target index (among non-dragged blocks) to an absolute
 * index in the full blocks array.
 * @param {number} relativeTarget - Target index among non-dragged blocks
 * @param {Array<number>} dragIndices - Indices of blocks being dragged
 * @param {number} blocksLength - Total number of blocks in the cycle
 * @returns {number} Absolute index in the full blocks array
 */
export function computeAbsoluteTarget(relativeTarget, dragIndices, blocksLength) {
  const nonDraggedIndices = [];
  for (let i = 0; i < blocksLength; i++) {
    if (!dragIndices.includes(i)) {
      nonDraggedIndices.push(i);
    }
  }
  return relativeTarget >= nonDraggedIndices.length
    ? blocksLength
    : nonDraggedIndices[relativeTarget];
}

/**
 * Position the drop indicator at the correct location in the container.
 * Returns the new reference element for caching (to prevent DOM flickering).
 * @param {HTMLElement} container - Blocks container element
 * @param {HTMLElement} dropIndicator - Drop indicator element
 * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
 * @param {number} targetIndex - Target insertion index
 * @param {HTMLElement|null} lastIndicatorRef - Previously cached reference element
 * @returns {HTMLElement|null} New reference element for the indicator
 */
export function positionDropIndicator(container, dropIndicator, nonDraggedBlocks, targetIndex, lastIndicatorRef) {
  dropIndicator.style.display = 'block';
  const newRef = getDropIndicatorRef(nonDraggedBlocks, targetIndex);

  // Only update DOM if position changed (prevents flickering)
  if (newRef !== lastIndicatorRef) {
    if (newRef) {
      container.insertBefore(dropIndicator, newRef);
    } else {
      container.appendChild(dropIndicator);
    }
    return newRef;
  }
  return lastIndicatorRef;
}
