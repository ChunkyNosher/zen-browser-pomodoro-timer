# Workspace Blocking Bug Fix

## Bug Description

There were TWO related bugs with how the workspace blocking overlay behaves when the timer is paused:

### Bug 1: Pausing on unblocked workspace, then switching to blocked workspace
When the timer is paused while the user is on an **unblocked workspace**, and then the user switches to a **blocked workspace**, the block screen should appear on the blocked workspace, but it didn't.

### Bug 2: Pausing on blocked workspace shows overlay on ALL workspaces  
When the timer is paused while the user is on a **blocked workspace**, the block screen incorrectly appeared on **all workspaces** (including unblocked ones).

## Root Cause

The MutationObserver was configured to watch for workspace changes, but it was using **incorrect DOM selectors** that didn't match the actual structure of modern Zen Browser:

1. **Wrong element selector**: The code was looking for `toolbarbutton[zen-workspace-id][active="true"]`, but modern Zen Browser uses `zen-workspace` elements with `active="true"` attribute and the workspace UUID as the `id` attribute.

2. **Wrong container**: The MutationObserver was watching older container selectors, but the actual workspace elements are inside `#tabbrowser-arrowscrollbox`.

3. **Missing debouncing**: Multiple rapid mutations could cause race conditions in the workspace change detection logic.

## Changes Made

### 1. Updated `WORKSPACE_CONTAINER_SELECTORS` (Line 244)
Added `#tabbrowser-arrowscrollbox` as the first (highest priority) selector to observe:

```javascript
const WORKSPACE_CONTAINER_SELECTORS = [
  '#tabbrowser-arrowscrollbox', // Container holding zen-workspace elements (modern Zen Browser)
  '#zen-workspace-button-container',
  '#zen-workspaces-button-container',
  '[id*="workspace"]',
  '#navigator-toolbox',
];
```

### 2. Updated `getActiveWorkspace()` Method (Line 2138)
Modified to try modern selector first, with fallback to legacy selector:

```javascript
getActiveWorkspace() {
  try {
    // First try the zen-workspace element (modern approach)
    let activeElement = document.querySelector('zen-workspace[active="true"]');
    if (activeElement && activeElement.id) {
      return activeElement.id;
    }
    
    // Fallback to toolbarbutton selector (legacy approach)
    activeElement = document.querySelector(
      'toolbarbutton[zen-workspace-id][active="true"]'
    );
    if (activeElement) {
      return activeElement.getAttribute('zen-workspace-id');
    }
  } catch (e) {
    console.error('Failed to get active workspace:', e);
  }
  return null;
}
```

### 3. Added Proper Debouncing to `_handleWorkspaceMutation()` (Line 2260)
Implemented proper debouncing to prevent race conditions:

```javascript
_handleWorkspaceMutation() {
  // Clear any pending timeout to implement proper debouncing
  if (this.mutationDebounceTimer) {
    clearTimeout(this.mutationDebounceTimer);
  }
  
  this.mutationDebounceTimer = setTimeout(() => {
    const newWorkspace = this.getActiveWorkspace();
    
    // Log mutation for debugging
    logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace mutation detected', {
      oldWorkspace: this.activeWorkspace,
      newWorkspace: newWorkspace,
      changed: newWorkspace !== this.activeWorkspace,
    });
    
    if (newWorkspace === this.activeWorkspace) return;

    this.activeWorkspace = newWorkspace;
    this.needsValidation = true;
    this.validateBlockedWorkspaces();

    if (this.onWorkspaceChange) {
      const isBlocked = newWorkspace ? this.isWorkspaceIdBlocked(newWorkspace) : false;
      this.onWorkspaceChange(newWorkspace, isBlocked);
    }
    
    this.mutationDebounceTimer = null;
  }, WORKSPACE_MUTATION_DELAY_MS);
}
```

### 4. Added Logging to `startMonitoring()` (Line 2301)
Added comprehensive logging to debug workspace monitoring:

```javascript
startMonitoring() {
  this.activeWorkspace = this.getActiveWorkspace();
  
  logger.log(LOG_CATEGORIES.WORKSPACE, 'Starting workspace monitoring', {
    initialWorkspace: this.activeWorkspace,
  });
  
  // ... observer setup ...
  
  logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace observer configured', {
    container: workspaceContainerSelector,
    observingAttributes: ['active', 'selected', 'zen-workspace-id'],
  });
}
```

### 5. Updated `_tryWorkspaceContainer()` Method (Line 2479)
Added support for modern `zen-workspace` elements:

```javascript
_tryWorkspaceContainer() {
  // Try the modern zen-workspace elements first
  let items = document.querySelectorAll('zen-workspace');
  if (items.length > 0) {
    console.log(`Zen Pomodoro: Got ${items.length} workspaces from zen-workspace elements`);
    return Array.from(items).map((item) => {
      const id = item.id; // The workspace ID is the element's id attribute
      const name =
        item.getAttribute('label') ||
        item.querySelector('.zen-current-workspace-indicator-name')?.textContent?.trim() ||
        `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
      return { id, name };
    });
  }
  
  // Fallback to legacy selectors...
}
```

### 6. Updated `stopMonitoring()` Method (Line 2359)
Added cleanup for debounce timer:

```javascript
stopMonitoring() {
  if (this.workspaceObserver) {
    this.workspaceObserver.disconnect();
    this.workspaceObserver = null;
  }
  // Clear any pending debounce timer
  if (this.mutationDebounceTimer) {
    clearTimeout(this.mutationDebounceTimer);
    this.mutationDebounceTimer = null;
  }
}
```

### 7. Added `mutationDebounceTimer` to Constructor (Line 2134)
Added property to track debounce timer:

```javascript
constructor() {
  this.activeWorkspace = null;
  this.config = getConfig();
  this.onWorkspaceChange = null;
  this.workspaceObserver = null;
  this.validatedWorkspaces = null;
  this.needsValidation = true;
  this.mutationDebounceTimer = null; // Timer for debouncing workspace mutations
}
```

## Expected Behavior After Fix

- ✅ When the timer is active (whether running or paused), blocked workspaces should ALWAYS show the blocking overlay
- ✅ When the timer is active (whether running or paused), unblocked workspaces should NEVER show the blocking overlay
- ✅ The pause state should NOT affect which workspaces are blocked - only which workspaces are in the blockedWorkspaces list should determine this
- ✅ Workspace changes should be properly detected and logged, even while the timer is paused
- ✅ The overlay should update immediately when switching workspaces, regardless of timer state

## Testing

To verify the fix:

1. Start the timer on an unblocked workspace
2. Pause the timer
3. Switch to a blocked workspace → The block screen should appear immediately
4. Switch back to the unblocked workspace → The block screen should disappear
5. Resume the timer → Everything should continue working correctly

Check the browser console logs for "Workspace mutation detected" messages to confirm that workspace changes are being detected properly.

## Files Modified

- `zen-pomodoro-focus-blocker.uc.js` - All changes in the `WorkspaceDetector` class

## Backwards Compatibility

The fix maintains backwards compatibility by:
- Trying modern selectors first, then falling back to legacy selectors
- Not removing any existing functionality
- Adding defensive logging to help debug issues in different Zen Browser versions
