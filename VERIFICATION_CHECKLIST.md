# Verification Checklist for Custom Cycle Drag Fixes

## Pre-Testing Setup
- [ ] Open Zen Browser with the mod loaded
- [ ] Navigate to Settings → Custom Cycles
- [ ] Create or edit a custom cycle
- [ ] Ensure you have at least 10 blocks for comprehensive testing

---

## Bug 1: Drag from Entire Block
**Test Steps:**
1. Click and drag on the center of a block (not the handle)
2. Click and drag on the right side of a block
3. Click and drag on the top edge of a block

**Expected Results:**
- ✅ Drag initiates from anywhere on the block
- ✅ Clicking duration input does NOT start drag
- ✅ Clicking delete button does NOT start drag
- ✅ Block moves smoothly to new position

**Status:** [ ] PASS [ ] FAIL

---

## Bug 2: No Blue Line Flickering
**Test Steps:**
1. Drag a block slowly up and down through the list
2. Drag a block rapidly back and forth
3. Move pointer in small circles while dragging

**Expected Results:**
- ✅ Blue drop indicator line is smooth and stable
- ✅ No oscillating/flickering behavior
- ✅ Line position updates cleanly as you drag

**Status:** [ ] PASS [ ] FAIL

---

## Bug 3: Stable UI After Many Operations
**Test Steps:**
1. Perform 20+ drag operations in succession
2. During some drags, move pointer outside browser window and release
3. Try rapid drag-and-drops
4. Check for orphaned visual elements

**Expected Results:**
- ✅ No visual artifacts accumulate
- ✅ No duplicate drop indicator lines
- ✅ No ghost blocks remain after drag
- ✅ All drags complete cleanly even when interrupted

**Status:** [ ] PASS [ ] FAIL

---

## Bug 4: Drag Back to Original Position
**Test Steps:**
1. Note the position of block at index 2
2. Drag the block slightly upward
3. Drag it back down to its original visual position
4. Release the drag

**Expected Results:**
- ✅ Block returns to index 2 (no position swap)
- ✅ Block stays in place when dropped at original position
- ✅ No unnecessary reordering occurs

**Status:** [ ] PASS [ ] FAIL

---

## Bug 5: Auto-Scroll Near Edges
**Test Steps:**
1. Create a custom cycle with 15+ blocks (scrollable list)
2. Scroll to top of list
3. Drag a block from middle and move pointer to within 40px of bottom edge
4. Hold pointer at bottom edge for 2 seconds
5. Move pointer away from edge
6. Repeat test for top edge

**Expected Results:**
- ✅ Container scrolls down automatically when near bottom
- ✅ Container scrolls up automatically when near top
- ✅ Scrolling is smooth (4px per frame)
- ✅ Scrolling stops when pointer leaves edge zone
- ✅ Block can be dropped at any position in long list

**Status:** [ ] PASS [ ] FAIL

---

## Additional Tests

### Multi-Select Drag
**Test Steps:**
1. Shift+Click to select 3 blocks
2. Drag all selected blocks together
3. Verify all selected blocks move together

**Status:** [ ] PASS [ ] FAIL

---

### Alt+Drag Duplication
**Test Steps:**
1. Hold Alt key
2. Drag a block to new position
3. Release drag

**Expected Results:**
- ✅ Original block stays in place
- ✅ Duplicate block created at drop position
- ✅ Ghost preview shows during drag

**Status:** [ ] PASS [ ] FAIL

---

## Console Log Verification
**Test Steps:**
1. Open Browser Console
2. Filter logs for "MENU" category
3. Perform a drag operation

**Expected Log Messages:**
- `Block drag started` with index and mode info
- `Auto-scroll activated (up)` or `(down)` when near edges
- `Auto-scroll deactivated` when leaving edge zone
- `Block drag completed` with from/to indices

**Status:** [ ] PASS [ ] FAIL

---

## Overall Assessment
- [ ] All critical functionality works
- [ ] All bugs are fixed
- [ ] No regressions introduced
- [ ] Performance is acceptable

**Tester Name:** _______________
**Date:** _______________
**Browser Version:** _______________
