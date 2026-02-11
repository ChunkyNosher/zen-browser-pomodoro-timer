# Custom Cycle Block Drag-and-Drop UX Overhaul

## Summary

Successfully overhauled the custom cycle block drag-and-drop system to use a **transform-based visual reordering** approach instead of the previous collapse-based method. This provides smooth, animated block movements with a clear visual preview of where blocks will land.

## Key Changes

### 1. CSS Updates (`chrome.css`)

#### `.zen-pomodoro-cycle-block.dragging` (Line 2197)
**BEFORE:**
```css
.zen-pomodoro-cycle-block.dragging {
  height: 0 !important;
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin: 0 !important;
  border-width: 0 !important;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
```

**AFTER:**
```css
.zen-pomodoro-cycle-block.dragging {
  opacity: 0.3;
  pointer-events: none;
}
```

**Impact:** Dragged blocks now maintain their height at reduced opacity (0.3) instead of collapsing to zero height. This creates a visual "gap" where the blocks originated.

#### `.zen-pomodoro-cycle-drop-indicator` (Line 2222)
**BEFORE:**
```css
.zen-pomodoro-cycle-drop-indicator {
  position: relative;
  z-index: 5;
  height: 3px;
  background: #4a9eff;
  border-radius: 2px;
  margin: 2px 0;
  box-shadow: 0 0 8px rgb(74 158 255 / 50%);
  pointer-events: none;
  animation: drop-indicator-pulse 1.5s ease-in-out infinite;
}
```

**AFTER:**
```css
.zen-pomodoro-cycle-drop-indicator {
  z-index: 5;
  height: 3px;
  background: #4a9eff;
  border-radius: 2px;
  margin: 0;
  box-shadow: 0 0 8px rgb(74 158 255 / 50%);
  pointer-events: none;
  animation: drop-indicator-pulse 1.5s ease-in-out infinite;
}
```

**Impact:** Removed `position: relative` and changed `margin: 2px 0` to `margin: 0`. The position is now set dynamically in JavaScript (`position: absolute`), allowing precise pixel-based positioning within the container.

### 2. New Functions in `drag-utils.js`

#### `calculateBlockTransforms(dragIndices, relativeTarget, blockHeights)`
- Calculates CSS `translateY` transforms for all blocks during a drag operation
- Creates smooth visual reordering by computing the difference between DOM position and desired visual position
- Returns array of pixel offsets for each block
- Handles multi-select, non-uniform heights, and CSS gaps

**Algorithm:**
1. Build list of non-dragged indices
2. Construct visual order by inserting dragged blocks at target position
3. Calculate DOM tops (cumulative heights in DOM order)
4. Calculate visual tops (cumulative heights in visual order)
5. Transform = visual top - DOM top

#### `calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights)`
- Calculates absolute Y position for the drop indicator within the container
- Indicator appears at the gap boundary (top edge of where dragged blocks will land)
- Sums heights of all blocks appearing before the gap in visual order
- Returns pixel offset from container top

#### Updated `cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks)`
- Added `block.style.transform = ''` to clear transforms when drag ends
- Ensures blocks snap back to their natural positions after reordering

### 3. Updates to `custom-cycle-manager.js`

#### Updated Imports (Line 11)
Added new functions:
```javascript
import {
  createDragPreview, cleanupDragVisuals, getDropIndicatorRef,
  showGhostBlocks, updateAutoScroll,
  computeAbsoluteTarget, calculateBlockTransforms, calculateDropIndicatorOffset
} from './drag-utils.js';
```

#### `_setupDragVisuals()` (Line 1043)
**Changes:**
1. All blocks now get `drag-transition` class (not just non-dragged)
2. Drop indicator uses `position: absolute` with `left: 0; right: 0`
3. Container gets `position: relative` to serve as positioning context
4. Dragged blocks now only get reduced opacity (0.3) instead of collapsing

**New Behavior:**
- ALL blocks (dragged and non-dragged) smoothly animate via CSS transforms
- Drop indicator positioned absolutely within container for pixel-perfect placement

#### `_startBlockDrag()` (Line 1221)
**New Data Caching:**
```javascript
// Cache block layout info for transform-based drag
const cachedBlockInfo = allBlocks.map(block => ({
  top: block.offsetTop,
  height: block.offsetHeight,
}));

// Calculate total height per block including gap
const blockHeights = cachedBlockInfo.map(info => info.height);
const containerGap = parseFloat(getComputedStyle(container).gap) || 0;
const blockHeightsWithGap = blockHeights.map((h, i) => 
  h + (i < blockHeights.length - 1 ? containerGap : 0)
);

// Cache non-dragged midpoints for target calculation
const cachedNonDraggedMidpoints = [];
allBlocks.forEach((block, idx) => {
  if (!dragIndices.includes(idx)) {
    cachedNonDraggedMidpoints.push(
      cachedBlockInfo[idx].top + cachedBlockInfo[idx].height / 2
    );
  }
});
```

**Why Cache?**
- Block layout info is captured BEFORE any CSS classes are applied
- Midpoints are used for target calculation and are unaffected by transforms
- Heights with gaps ensure accurate transform calculations

#### `_createPointerMoveHandler()` (Line 1097)
**Completely Rewritten:**

**Old Approach:**
1. Use `getDropTargetIndex()` to find target based on current block rects
2. Position drop indicator via DOM insertion (before/after elements)
3. Non-dragged blocks shift naturally due to dragged blocks collapsing

**New Approach:**
1. Calculate container-relative Y position
2. Find target index using cached non-dragged midpoints (unaffected by transforms)
3. Calculate transforms for ALL blocks using `calculateBlockTransforms()`
4. Apply transforms to all blocks via inline styles
5. Position drop indicator absolutely at gap boundary using `calculateDropIndicatorOffset()`

**Key Code:**
```javascript
const updateDropTarget = (clientY) => {
  const containerRect = container.getBoundingClientRect();
  const containerRelativeY = clientY - containerRect.top + container.scrollTop;

  // Find target using cached midpoints (unaffected by transforms)
  let targetIndex = cachedNonDraggedMidpoints.length;
  for (let i = 0; i < cachedNonDraggedMidpoints.length; i++) {
    if (containerRelativeY < cachedNonDraggedMidpoints[i]) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === lastTargetIndex) return;
  lastTargetIndex = targetIndex;
  if (targetIndex < 0) return;

  // Calculate and apply transforms
  const transforms = calculateBlockTransforms(dragIndices, targetIndex, blockHeightsWithGap);
  allBlocks.forEach((block, idx) => {
    block.style.transform = transforms[idx] !== 0 ? `translateY(${transforms[idx]}px)` : '';
  });

  // Position drop indicator absolutely
  const indicatorOffset = calculateDropIndicatorOffset(dragIndices, targetIndex, blockHeightsWithGap);
  dropIndicator.style.display = 'block';
  dropIndicator.style.top = `${indicatorOffset}px`;

  // Show ghost blocks for duplication mode
  if (this.isDuplicating && ghostBlocks.length > 0) {
    showGhostBlocks(container, dropIndicator, ghostBlocks);
  }
};
```

## New Test Suite

Added comprehensive test coverage in `tests/drag-utils-transforms.test.js`:
- 21 new tests covering transform calculations
- Tests for single/multi-block drags
- Tests for uniform and non-uniform block heights
- Tests for CSS gaps between blocks
- Edge cases (dragging all blocks, single block, clamping)
- Integration scenarios with complex multi-block operations

**Total Test Count:** 779 tests (up from 758)

## Visual Behavior

### Before (Collapse-based)
1. ❌ Dragged blocks disappear completely (height: 0)
2. ❌ Other blocks jump immediately to fill gap
3. ❌ Drop indicator often missing or incorrectly positioned
4. ❌ No smooth animation during drag
5. ❌ Scrollable lists have broken indicator positioning

### After (Transform-based)
1. ✅ Dragged blocks visible at 30% opacity (serve as placeholder)
2. ✅ Floating preview follows cursor
3. ✅ ALL blocks smoothly slide into preview positions via CSS transforms
4. ✅ Blue drop indicator appears at exact gap boundary
5. ✅ Works correctly in scrollable lists
6. ✅ CSS transitions provide smooth 200ms animation
7. ✅ On release, blocks snap to final positions and re-render

## Technical Highlights

### Why This Approach Works Better

**Problem with Old Approach:**
- Collapsing dragged blocks to `height: 0` caused layout shifts
- DOM-based indicator positioning flickered and broke in scroll containers
- No smooth animation feedback

**Solution with New Approach:**
- Dragged blocks keep their space (reduced opacity)
- CSS transforms move ALL blocks into preview positions
- Absolutely-positioned indicator works in any scroll state
- CSS transitions on transforms provide 60fps animation
- Cached layout data prevents transform-induced calculation errors

### Performance Considerations

1. **Layout Caching:** Block positions/heights cached before drag starts
2. **Transform-based:** GPU-accelerated via CSS transforms (no layout recalculation)
3. **RequestAnimationFrame Throttling:** Drop target updates throttled to 60fps
4. **Minimal DOM Mutations:** Only transform styles change during drag

## Files Modified

1. `chrome.css` - Updated `.dragging` and `.drop-indicator` classes
2. `src/drag-utils.js` - Added 2 new functions, updated 1 existing function
3. `src/custom-cycle-manager.js` - Updated imports, 3 methods rewritten
4. `tests/drag-utils-transforms.test.js` - **NEW FILE** with 21 tests

## Build Output

- ✅ All 779 tests pass
- ✅ ESLint passes with no warnings
- ✅ Bundle builds successfully (`zen-pomodoro-focus-blocker.uc.js`)
- ✅ Bundle size: 563K (no significant change)

## Future Improvements

Potential enhancements for future iterations:
1. Add spring physics to transforms for more natural movement
2. Implement variable transition durations based on distance
3. Add haptic feedback (if supported by browser)
4. Consider adding subtle rotation to dragged preview
5. Add visual "snap" animation when blocks settle into final position

## Testing Recommendations

When testing the changes:
1. Create a custom cycle with 5+ blocks
2. Test single block drag up/down
3. Test multi-select (Shift+click) drag operations
4. Test Alt+drag duplication with multiple selected blocks
5. Test in scrollable containers (10+ blocks)
6. Verify smooth 200ms animation during drag
7. Verify drop indicator appears at correct position
8. Verify dragged blocks show at 30% opacity
9. Verify floating preview follows cursor smoothly
10. Verify blocks snap to correct positions on drop
