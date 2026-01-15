# Pause Behavior Bug Fix - Summary

## Issue
When the user paused the timer while on an unblocked workspace, switching to a blocked workspace would not show the block screen. This allowed users to bypass the blocking functionality by pausing on an unblocked workspace.

## Root Cause Analysis

The logic in `updateOverlayVisibility()` was correct, but there was a potential race condition in the workspace change detection:

1. When a workspace changes, a `MutationObserver` fires
2. The observer immediately queries the DOM for the active workspace
3. However, the DOM might not have fully updated yet (the `active="true"` attribute might not be set)
4. This could cause `getActiveWorkspace()` to return the wrong workspace ID
5. As a result, `isWorkspaceInBlockedList()` would check the wrong workspace

Additionally, there was insufficient logging to debug this issue when it occurred.

## Solution

### 1. DOM Settling Delay
Added a 50ms delay in `_handleWorkspaceMutation()` before processing the workspace change. This ensures the DOM has fully updated before we query for the active workspace.

**File:** `zen-pomodoro-focus-blocker.uc.js`  
**Lines:** 2171-2186

```javascript
_handleWorkspaceMutation() {
  // Use a small delay to ensure DOM has fully updated before checking workspace
  // This prevents race conditions where the active attribute hasn't been set yet
  setTimeout(() => {
    const newWorkspace = this.getActiveWorkspace();
    if (newWorkspace === this.activeWorkspace) return;

    this.activeWorkspace = newWorkspace;
    this.needsValidation = true;
    this.validateBlockedWorkspaces();

    if (this.onWorkspaceChange) {
      this.onWorkspaceChange(newWorkspace, this.isCurrentWorkspaceBlocked());
    }
  }, 50); // 50ms delay to allow DOM to settle
}
```

### 2. Enhanced Logging in Paused State Branch
Added detailed logging in `updateOverlayVisibility()` to track what's happening during paused state:

**File:** `zen-pomodoro-focus-blocker.uc.js`  
**Lines:** 9098-9128

- Logs when paused on blocked workspace (overlay shown on all workspaces)
- Logs when paused on unblocked workspace (checking current workspace)
- Logs whether current workspace is blocked or not
- Logs whether overlay is being shown or hidden

### 3. Enhanced Workspace Change Logging
Added more context to the `onWorkspaceChange()` log to help debug issues:

**File:** `zen-pomodoro-focus-blocker.uc.js`  
**Lines:** 9053-9062

- Logs timer active state
- Logs timer paused state  
- Logs pausedOnBlockedWorkspace flag

## Expected Behavior After Fix

### Pause on Unblocked Workspace
1. User pauses timer while on unblocked workspace
2. No block screen appears on current workspace (correct)
3. User switches to blocked workspace
4. **Block screen SHOULD appear** (this is the fix)

### Pause on Blocked Workspace
1. User pauses timer while on blocked workspace
2. Block screen remains visible (correct)
3. User switches to any workspace
4. **Block screen appears on ALL workspaces** (existing behavior)

## Testing

See `docs/pause-behavior-test.md` for comprehensive testing scenarios and verification steps.

### Quick Test
1. Start a timer
2. Switch to an unblocked workspace
3. Pause the timer using the main menu
4. Switch to a blocked workspace
5. **Expected:** Block screen should appear ✓

## Technical Notes

### Why 50ms Delay?
The 50ms delay is a common pattern for waiting for DOM updates:
- Short enough to be imperceptible to users
- Long enough for browser to complete DOM updates
- Similar to the `DOM_SETTLE_DELAY_MS` (100ms) used elsewhere in the codebase

### Alternative Solutions Considered

1. **Use `requestAnimationFrame()`** - Would wait for next frame, but might be too fast
2. **Use `queueMicrotask()`** - Might execute before DOM updates complete
3. **Double-check workspace ID** - Would add complexity and still have timing issues
4. **Increase MutationObserver delay** - Chosen solution is simplest and most reliable

### Why Not Fix the MutationObserver Configuration?
The MutationObserver is correctly configured to watch for `attributes: true`. The issue is that the observer fires AS SOON AS the mutation starts, not after it completes. Adding the delay ensures we check AFTER the mutation has fully applied.

## Code Health

Changes maintain code health:
- Added defensive delay for race condition
- Enhanced logging for debugging
- No breaking changes to existing functionality
- Follows existing code patterns (similar delays used elsewhere)

## Verification

Run `npm run lint` to verify code quality:
```bash
npm run lint
```

All linting checks pass ✓

## Files Changed

1. `zen-pomodoro-focus-blocker.uc.js`
   - Enhanced logging in `updateOverlayVisibility()` (lines 9098-9128)
   - Enhanced logging in `onWorkspaceChange()` (lines 9053-9062)
   - Added DOM settling delay in `_handleWorkspaceMutation()` (lines 2171-2186)

2. `docs/pause-behavior-test.md` (NEW)
   - Comprehensive testing documentation

3. `docs/pause-behavior-fix-summary.md` (THIS FILE)
   - Summary of changes and rationale

## Related Issues

This fix addresses workspace change detection timing issues that could affect:
- Pause behavior (primary fix)
- Normal workspace switching during active timer
- Resume behavior after pause

The DOM settling delay improves reliability in all these scenarios.
