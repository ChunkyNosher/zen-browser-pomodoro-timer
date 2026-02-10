# Helper Modules Extraction Summary

This document summarizes the helper function modules extracted from the main bundled file.

## Extracted Modules

### 1. `src/helpers.js` (6.5 KB)
**Purpose:** Legacy wrapper functions and backward compatibility

**Contents:**
- **Storage legacy wrappers** (4 functions):
  - `getPref()`, `setPref()`, `getConfig()`, `saveConfig()`
  
- **Utils legacy wrappers** (15 functions):
  - `formatTime()`, `formatTimeWithHours()`, `getPhaseLabel()`, `getShortPhaseLabel()`
  - `sanitizeText()`, `validateIntegerInput()`, `getValidatedIntFromDialog()`
  - `isNonEmptyArray()`, `isValidRangeValue()`, `generateRandomCode()`
  - `clampToViewportBound()`, `isValidWorkspaceArray()`, `formatWorkspacesFromApi()`
  - `extractWorkspaceNameFromButton()`, `getActiveBlockedWorkspaces()`, `findRuleAndExecute()`

- **Notification helper** (1 function):
  - `sendBrowserNotification()`

- **Constants re-exports** (25 constants):
  - Re-exports all commonly used constants from Constants module for backward compatibility

- **Popup detection** (1 function):
  - `isPopupWindow()` - Detects if current window is a popup vs main browser window

**Dependencies:** Constants, Storage, Utils

---

### 2. `src/ui-helpers.js` (20 KB)
**Purpose:** UI helper functions for dialog management and interactions

**Contents:**
- **Dialog drag & positioning** (11 functions):
  - `initializeDialogDragPosition()` - Initialize dialog position
  - `isTouchEventWithTouches()` - Check for touch events
  - `getClientCoords()` - Get mouse/touch coordinates
  - `setupDialogDrag()` - Make dialog draggable
  - `_setupDragCleanupObserver()` - Clean up drag listeners
  - `saveDialogPosition()` - Save dialog position to state
  - `getViewportDimensions()` - Get viewport dimensions
  - `ensureDialogInViewport()` - Keep dialog visible in viewport
  - `applyLastDialogPosition()` - Apply saved position to new dialog

- **UI utilities** (6 functions):
  - `isValidTimeFormat()` - Validate HH:MM time format
  - `updateCountdownElement()` - Update countdown display
  - `getMenuPhaseLabel()` - Get detailed phase label
  - `createLabeledInputRow()` - Create input row for forms
  - `createLabeledSelectRow()` - Create select row for forms
  - `renderListOrEmptyMessage()` - Render list or empty message

- **Timer control helpers** (4 functions):
  - `handleStopTimerWithLockout()` - Stop timer with security lockout
  - `handleSkipFocusWithLockout()` - Skip focus with security lockout
  - `isDistractionDumpBlocking()` - Check if dump is active
  - `handlePauseResumeTimer()` - Handle pause/resume with overlay updates

**Dependencies:** Constants, log-manager, state, helpers

---

### 3. `src/break-phase-utils.js` (1 KB)
**Purpose:** Break phase detection utilities

**Contents:**
- **Break phase detection** (1 function):
  - `isInBreakPhase()` - Check if timer is in break/transition phase

**Dependencies:** None (accesses global `window.zenPomodoroApp`)

---

### 4. `src/shared-blocker-utils.js` (12 KB)
**Purpose:** Shared utilities for SineModBlocker and WebsiteBlocker

**Contents:**
- **Browser listener setup** (3 functions):
  - `createProgressListener()` - Create URL change listener
  - `setupBrowserListeners()` - Set up gBrowser event listeners
  - `removeBrowserListeners()` - Remove gBrowser event listeners

- **Blocker overlay utilities** (6 functions):
  - `handleBlockerGoBack()` - Handle "Go Back" navigation
  - `updateBlockerTimerStatus()` - Update timer status display
  - `startBlockerTimerStatusUpdates()` - Start status update interval
  - `createBlockerButton()` - Create blocker button element
  - `createBlockerButtons()` - Create buttons container

- **Hold-to-unlock handlers** (1 function):
  - `setupHoldToUnlockHandlers()` - Set up hold-to-unlock event handlers with cleanup

**Dependencies:** Constants, log-manager, helpers

**Special notes:**
- Uses Firefox globals: `gBrowser`, `ChromeUtils`, `Services`
- Includes eslint-disable comments for Firefox globals

---

## Import/Export Pattern

All modules follow the ES module pattern:

```javascript
// Import dependencies
import Constants from './constants.js';
import { logger } from './log-manager.js';

// Export all functions
export function myFunction() { ... }
export const MY_CONSTANT = ...;
```

## Key Changes from Original

1. **Removed IIFE indentation** - All lines have 2 spaces less indentation
2. **No 'use strict'** - ES modules are strict by default
3. **Preserved JSDoc comments** - All documentation intact
4. **Preserved eslint-disable comments** - For Firefox globals
5. **Used `.js` extensions** - In all import statements
6. **No IIFE wrappers** - Direct exports

## Usage in Main Application

These modules are meant to be imported by the main application classes:

```javascript
// Example usage in SecurityManager
import { setupHoldToUnlockHandlers } from './shared-blocker-utils.js';

// Example usage in OverlayManager
import { setupDialogDrag, saveDialogPosition } from './ui-helpers.js';

// Example usage in WebsiteBlocker
import { isInBreakPhase } from './break-phase-utils.js';
```

## Building

After extracting these modules, rebuild the bundled file:

```bash
npm run build
```

This will use Rollup to bundle all source modules into `zen-pomodoro-focus-blocker.uc.js`.
