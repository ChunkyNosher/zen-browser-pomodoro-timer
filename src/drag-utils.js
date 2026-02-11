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
    block.style.transform = '';
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

/**
 * Calculate CSS translateY transforms for all blocks during a drag operation.
 * Creates a smooth visual reorder by moving blocks to their target visual positions.
 * @param {Array<number>} dragIndices - Sorted indices of blocks being dragged
 * @param {number} relativeTarget - Target index among non-dragged blocks
 * @param {Array<number>} blockHeights - Array of heights (including gaps) for each block
 * @returns {Array<number>} Array of translateY pixel values for each block
 */
export function calculateBlockTransforms(dragIndices, relativeTarget, blockHeights) {
  const totalBlocks = blockHeights.length;
  const transforms = new Array(totalBlocks).fill(0);

  // Build non-dragged indices in original order
  const nonDraggedIndices = [];
  for (let i = 0; i < totalBlocks; i++) {
    if (!dragIndices.includes(i)) {
      nonDraggedIndices.push(i);
    }
  }

  // Clamp target
  const clampedTarget = Math.max(0, Math.min(relativeTarget, nonDraggedIndices.length));

  // Build visual order: non-dragged before target, then dragged, then non-dragged after target
  const visualOrder = [
    ...nonDraggedIndices.slice(0, clampedTarget),
    ...dragIndices,
    ...nonDraggedIndices.slice(clampedTarget),
  ];

  // Calculate DOM tops (cumulative heights in DOM order: 0, 1, 2, ...)
  const domTops = new Array(totalBlocks);
  let cumTop = 0;
  for (let i = 0; i < totalBlocks; i++) {
    domTops[i] = cumTop;
    cumTop += blockHeights[i];
  }

  // Calculate visual tops (cumulative heights in visual order)
  const visualTops = {};
  let visCumTop = 0;
  for (const idx of visualOrder) {
    visualTops[idx] = visCumTop;
    visCumTop += blockHeights[idx];
  }

  // Transform = desired visual position - actual DOM position
  for (let i = 0; i < totalBlocks; i++) {
    transforms[i] = visualTops[i] - domTops[i];
  }

  return transforms;
}

/**
 * Calculate the absolute Y position for the drop indicator within the container.
 * The indicator should appear at the gap boundary (top edge of where dragged blocks will land).
 * @param {Array<number>} dragIndices - Sorted indices of dragged blocks
 * @param {number} relativeTarget - Target index among non-dragged blocks
 * @param {Array<number>} blockHeights - Heights of all blocks
 * @returns {number} Y offset in pixels from container top for the indicator
 */
export function calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights) {
  const totalBlocks = blockHeights.length;
  const nonDraggedIndices = [];
  for (let i = 0; i < totalBlocks; i++) {
    if (!dragIndices.includes(i)) {
      nonDraggedIndices.push(i);
    }
  }

  const clampedTarget = Math.max(0, Math.min(relativeTarget, nonDraggedIndices.length));

  // Sum up heights of all blocks that appear BEFORE the gap in visual order
  const beforeGap = nonDraggedIndices.slice(0, clampedTarget);
  let offset = 0;
  for (const idx of beforeGap) {
    offset += blockHeights[idx];
  }

  return offset;
}
