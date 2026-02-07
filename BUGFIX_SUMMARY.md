# Custom Cycle Block Drag System Bug Fixes

## Summary
Fixed 5 critical bugs in the custom cycle block drag-and-drop system in `zen-pomodoro-focus-blocker.uc.js`.

## Changes Made

### Bug 1: Block drag should work on entire block, not just handle ✅
**Location:** Line ~13231-13238
**Changes:**
- Moved `pointerdown` event listener from `dragHandle` to `blockDiv`
- Added checks to prevent drag initiation when clicking on duration input or delete button
- Kept the visual drag handle element for UX clarity
- Users can now drag blocks from anywhere on the block surface

**Impact:** Improved usability - users no longer need to precisely target the small handle.

---

### Bug 2: Blue line flickering during drag ✅
**Location:** `_positionDropIndicator` method (line ~13524) and `_startBlockDrag` (line ~13252)
**Changes:**
- Added `lastIndicatorRef` parameter to `_positionDropIndicator` method
- Cache the current indicator position reference element
- Only call `insertBefore()` if the reference element actually changed
- Updated call site in `_startBlockDrag` to track and pass the cached reference

**Impact:** Eliminated DOM thrashing and visual flickering of the drop indicator line during drag operations.

---

### Bug 3: UI breaking after many drag operations ✅
**Location:** `_startBlockDrag` (line ~13252), `_cleanupDragVisuals` (line ~13492)
**Changes:**
- Added `pointercancel` event listener alongside `pointerup` for proper cleanup
- Added safety check at start of `_startBlockDrag` to cleanup any existing drag state
- Store cleanup function in `this.dragCleanup` for forced cleanup if needed
- Enhanced `_cleanupDragVisuals` to remove all orphaned drop indicators and ghost blocks
- Added null checks before removing elements

**Impact:** Prevents event listener accumulation and orphaned DOM elements, ensuring stable UI even after many drag operations or interrupted drags.

---

### Bug 4: Drag-back-to-original-position swaps block ✅
**Location:** `_applyDragOperation` method (line ~13467)
**Changes:**
- Added guard check for single-block moves before applying operations
- Detects when `absoluteTarget === from` or `absoluteTarget === from + 1` (no-op scenarios)
- Early return to prevent unnecessary reordering

**Impact:** Dragging a block back to its original position now correctly leaves it in place instead of swapping positions.

---

### Bug 5: Auto-scroll when dragging near edges ✅
**Location:** `_startBlockDrag` method (line ~13252)
**Changes:**
- Added auto-scroll functionality with 40px edge detection zones
- Smooth scrolling at 4px per frame using `requestAnimationFrame`
- Auto-activates when pointer enters top or bottom edge zones
- Auto-deactivates when pointer leaves edge zones
- Properly cleaned up in the drag cleanup handler
- Added logging for auto-scroll activation/deactivation

**Impact:** Users can now drag blocks in long lists without manual scrolling - the container automatically scrolls when dragging near edges.

---

## Additional Improvements

### Logging
Added comprehensive logging for drag operations:
- **Drag start:** Logs index, multi-select status, duplication mode, and affected indices
- **Drag end:** Logs source and target indices
- **Auto-scroll:** Logs activation/deactivation events

All logs use `LOG_CATEGORIES.MENU` for consistency with custom cycle operations.

---

## Testing Recommendations

1. **Bug 1:** Verify dragging works by clicking anywhere on a block (not just the handle)
2. **Bug 2:** Drag blocks rapidly up and down - the blue line should be smooth and stable
3. **Bug 3:** Perform many drag operations, including interrupted drags (pointer leaving window), and verify no visual artifacts accumulate
4. **Bug 4:** Drag a block slightly and release it back to its original position - it should stay in place
5. **Bug 5:** Create a custom cycle with 10+ blocks, drag blocks near the top/bottom edges, and verify automatic scrolling

---

## Code Quality
- **Lines changed:** 129 insertions, 12 deletions (141 total modifications)
- **Syntax validation:** ✅ Passed (verified with `node -c`)
- **Backward compatibility:** ✅ All existing features preserved
- **Performance:** Improved (reduced DOM operations via caching)

---

## Files Modified
- `zen-pomodoro-focus-blocker.uc.js` - Main implementation file

## Related Classes
- `CustomCycleManager` - Primary class containing all fixed methods

## Related Methods
- `_createBlockElement()` - Modified event listener attachment
- `_startBlockDrag()` - Major overhaul with all 5 bug fixes
- `_applyDragOperation()` - Added no-op detection
- `_cleanupDragVisuals()` - Enhanced cleanup logic
- `_positionDropIndicator()` - Added caching to prevent flickering
