# Test Plan for Pause Timer Workspace Blocking Fix

## Bug Description
When pausing the timer while on an UNBLOCKED workspace, the blocked workspaces become unblocked (overlay doesn't show when switching to them).

## Fix Implemented
Modified `updateOverlayVisibility()` to accept optional `workspaceId` and `isBlocked` parameters from the `onWorkspaceChange()` callback. This avoids potential race conditions when querying the DOM for the active workspace during workspace changes while in paused state.

### Key Changes:
1. `onWorkspaceChange()` now passes workspace info to `updateOverlayVisibility()`
2. `updateOverlayVisibility()` uses provided workspace info when available instead of re-querying DOM
3. When checking if a workspace is blocked during paused state, we check the workspace directly against the blocked list from config

## Test Scenarios

### Scenario 1: Pause on Unblocked Workspace, Switch to Blocked
**Expected Behavior:** Overlay should appear on blocked workspace

1. Start timer in focus phase
2. Navigate to an unblocked workspace (e.g., "Home")
3. Pause the timer using main menu or overlay button
4. Switch to a blocked workspace (e.g., "Work")
5. **Expected:** Overlay should be visible showing "Paused" status
6. **Previous Bug:** Overlay would NOT appear (workspace appeared unblocked)

### Scenario 2: Pause on Blocked Workspace (Should Still Work)
**Expected Behavior:** Overlay should appear on ALL workspaces

1. Start timer in focus phase
2. Navigate to a blocked workspace (e.g., "Work")
3. Pause the timer
4. Switch to any other workspace (blocked or unblocked)
5. **Expected:** Overlay should be visible on ALL workspaces
6. **This behavior should remain unchanged**

### Scenario 3: Resume Timer After Pausing on Unblocked
**Expected Behavior:** Normal blocking resumes

1. Start timer, pause on unblocked workspace
2. Switch to blocked workspace (overlay should show - Scenario 1)
3. Resume timer
4. **Expected:** Overlay remains visible on blocked workspace (normal behavior)
5. Switch to unblocked workspace
6. **Expected:** Overlay disappears (normal behavior)

## Code Flow After Fix

### When pausing on unblocked workspace:
```
User on "Home" (unblocked) → Clicks Pause
  ↓
handlePauseResumeTimer()
  ↓
workspace.isWorkspaceInBlockedList() → false
  ↓
timer.pause(false) → sets pausedOnBlockedWorkspace = false
  ↓
updateOverlayVisibility() → hides overlay (correct - Home is unblocked)
```

### When switching to blocked workspace after pause:
```
User switches to "Work" (blocked)
  ↓
_handleWorkspaceMutation() triggered
  ↓
onWorkspaceChange("work", true) called
  ↓
updateOverlayVisibility("work", true)
  ↓
timer.isPaused = true, pausedOnBlockedWorkspace = false
  ↓
Check: config.blockedWorkspaces.includes("work") → true
  ↓
_showOverlayWithStatus() → SHOWS overlay ✓
```

### Key Fix:
Instead of calling `workspace.isWorkspaceInBlockedList()` which queries the DOM again (potential race condition), we now:
1. Use the workspace ID that was already determined by `_handleWorkspaceMutation()`
2. Check that specific workspace ID against the blocked list from config
3. This avoids any timing issues where the DOM might not reflect the latest workspace state

## Manual Testing Checklist
- [ ] Start timer, pause on unblocked workspace, switch to blocked → overlay shows
- [ ] Start timer, pause on blocked workspace, switch to any workspace → overlay shows on all
- [ ] Resume timer after pausing → normal blocking behavior restored
- [ ] Pause on unblocked, switch to unblocked → no overlay (correct)
- [ ] Pause on unblocked, switch through multiple blocked workspaces → overlay shows on each
