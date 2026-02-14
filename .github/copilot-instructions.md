# GitHub Copilot Instructions for zen-browser-pomodoro-timer

## Mod Overview

The **Zen Pomodoro Focus Blocker** is a productivity mod for Zen Browser (based on Firefox/fx-autoconfig) that implements a customizable Pomodoro timer with workspace blocking capabilities. It helps users maintain focus by blocking access to specified workspaces and websites during focus sessions while allowing breaks between sessions.

**Key Features:**

- Customizable Pomodoro and simple timer modes
- **Custom Cycles** with configurable focus/break block sequences and per-cycle duration defaults
- Workspace-based blocking (blocks entire workspaces during focus)
- Website/keyword blocking (LeechBlock-style rulesets)
- Settings protection with hold-to-unlock and code entry lockouts
- First-time daily reminder (configurable time)
- Post-session idle reminder with escalating skip requirements
- Transition phase warnings before breaks end
- Draggable UI dialogs and timer indicator
- Full keyboard shortcut support
- **Cross-window timer sync** (primary/secondary window architecture)

---

## File Structure

| File                               | Purpose                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `zen-pomodoro-focus-blocker.uc.js` | Bundled output file (IIFE) - DO NOT EDIT DIRECTLY, edit src/ files instead           |
| `src/`                             | Source ES modules directory - all code changes go here                                |
| `src/index.js`                     | Entry point - dependency injection and app initialization                            |
| `src/constants.js`                 | All application constants (PREF_PREFIX, DEFAULT_CONFIG, etc.)                        |
| `src/state.js`                     | Shared mutable state (lastDialogPosition)                                            |
| `src/log-manager.js`              | LogManager class + logger singleton instance                                          |
| `src/window-sync-manager.js`      | WindowSyncManager class for cross-window timer sync                                   |
| `src/storage.js`                   | Storage module - Firefox Services.prefs operations                                    |
| `src/utils.js`                     | Utils module - general utility functions                                              |
| `src/helpers.js`                   | Legacy wrappers, sendBrowserNotification, constant re-exports                         |
| `src/ui-helpers.js`               | Dialog drag, UI creation helpers, timer control functions                              |
| `src/break-phase-utils.js`        | Break phase detection utility                                                         |
| `src/shared-blocker-utils.js`     | Shared utilities for SineModBlocker and WebsiteBlocker                                |
| `src/pomodoro-timer.js`           | PomodoroTimer class                                                                   |
| `src/workspace-detector.js`       | WorkspaceDetector class                                                               |
| `src/overlay-manager.js`          | OverlayManager class                                                                  |
| `src/keyboard-shortcut-handler.js`| KeyboardShortcutHandler class - shortcut setup, pomodoro menu                         |
| `src/settings-dialog.js`         | Settings dialog UI (extracted from keyboard-shortcut-handler)                         |
| `src/ruleset-dialog.js`          | Ruleset settings dialog UI (extracted from keyboard-shortcut-handler)                 |
| `src/security-manager.js`         | SecurityManager class                                                                 |
| `src/sine-mod-blocker.js`         | SineModBlocker class                                                                  |
| `src/website-blocker.js`          | WebsiteBlocker class                                                                  |
| `src/transition-phase-manager.js` | TransitionPhaseManager class                                                          |
| `src/daily-reminder-manager.js`   | DailyReminderManager class                                                            |
| `src/post-session-reminder-manager.js` | PostSessionReminderManager class                                                 |
| `src/distraction-dump-manager.js` | DistractionDumpManager class                                                          |
| `src/undo-redo-manager.js`        | UndoRedoManager class                                                                 |
| `src/custom-cycle-manager.js`     | CustomCycleManager class                                                              |
| `src/drag-utils.js`               | Drag/drop utilities (extracted from custom-cycle-manager)                             |
| `src/zen-pomodoro-app.js`         | ZenPomodoroApp main application class                                                 |
| `rollup.config.mjs`               | Rollup bundler configuration                                                          |
| `chrome.css`                       | All styling for overlays, dialogs, indicators, and blockers                          |
| `theme.json`                       | Mod metadata (id, name, version, author, URLs) for Zen Browser mod system            |
| `preferences.json`                 | Zen Browser preferences UI definitions (keyboard shortcut, notifications, reminders) |
| `README.md`                        | User-facing documentation                                                            |
| `docs/`                            | Additional documentation                                                             |

---

## Key Classes

| Class                        | Purpose                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `PomodoroTimer`              | Core timer logic - handles countdown, phases (focus/break/transition), cycles, state persistence      |
| `WorkspaceDetector`          | Detects current Zen workspace, monitors workspace changes via MutationObserver                        |
| `OverlayManager`             | Manages the workspace blocking overlay that covers content during focus                               |
| `SecurityManager`            | Handles settings access lockouts (hold-to-unlock, code entry)                                         |
| `WebsiteBlocker`             | LeechBlock-style website/keyword blocking with configurable rulesets                                  |
| `SineModBlocker`             | Blocks access to `about:preferences#sineMods` during active timer                                     |
| `DailyReminderManager`       | Shows blocking reminders at configurable times throughout the day (replaces FirstTimeReminderManager) |
| `PostSessionReminderManager` | Shows reminder after idle time following timer completion                                             |
| `TransitionPhaseManager`     | Manages the "break ending soon" popup before focus resumes                                            |
| `KeyboardShortcutHandler`    | Global keyboard shortcut handling and configuration                                                   |
| `LogManager`                 | Comprehensive logging with export functionality                                                       |
| `DistractionDumpManager`     | Manages "Distraction Dump" feature - pauses timer, unblocks everything for thought capture            |
| `CustomCycleManager`         | Manages custom Pomodoro cycles with drag-and-drop block editing and per-cycle duration defaults       |
| `UndoRedoManager`            | Generic undo/redo state management for dialog menus with UI buttons                                   |
| `WindowSyncManager`          | Manages cross-window timer sync using primary/secondary window pattern with heartbeat ownership       |

---

## Important Constants

```javascript
const PREF_PREFIX = 'zen-pomodoro';           // Preference key prefix
const MOD_VERSION = '1.4.6';                  // Current mod version
const DEFAULT_CONFIG = { ... };               // Default configuration object
const LOCKOUT_METHODS = { CODE: 'code', HOLD: 'hold' };
const TRANSITION_PHASE_DURATION_SECONDS = 5 * 60;  // 5 minutes
const DAILY_REMINDER_STARTUP_DELAY_MS = 3 * 1000;  // 3-second delay before showing daily reminder
const SYNC_PREF_KEY = 'timer-sync';              // Pref key for timer sync state
const OWNER_PREF_KEY = 'timer-owner';             // Pref key for timer owner window
const REMINDER_SYNC_PREF_KEY = 'reminder-sync';   // Pref key for cross-window reminder sync
const OWNER_HEARTBEAT_TIMEOUT_MS = 30000;         // Heartbeat timeout (30 seconds)
const HEARTBEAT_WRITE_INTERVAL_MS = 5000;         // Owner writes heartbeat every 5 seconds (wall-clock)
const LOG_BROADCAST_TOPIC = 'zen-pomodoro-log';   // Services.obs topic for log broadcast
```

---

## Module Architecture (ES Modules + Rollup)

The codebase uses **ES modules** in the `src/` directory, bundled into a single IIFE file by **Rollup**.

**⚠️ CRITICAL: Never edit `zen-pomodoro-focus-blocker.uc.js` directly!** This file is auto-generated by Rollup from the `src/` modules. The Copilot setup steps automatically delete this file at the start of each agent run to enforce this rule. All JavaScript changes MUST be made in the `src/` modules, then rebuilt using `npm run build`.

### Build System

```bash
# Install dependencies (first time only)
npm ci

# Build the bundled output file
npm run build

# Lint source files
npm run lint

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

**IMPORTANT:** After making changes to any file in `src/`, you MUST run `npm run build` to regenerate `zen-pomodoro-focus-blocker.uc.js`. The bundled output file should be committed alongside the source changes.

### Testing

Unit tests use **Vitest** and are located in the `tests/` directory. The test setup file (`tests/setup.js`) mocks Firefox-specific globals (Services, ChromeUtils, gBrowser, etc.) so tests can run in Node.js.

Test files:
- `tests/constants.test.js` - Constants module, DEFAULT_CONFIG, freeze behavior
- `tests/utils.test.js` - All utility functions with edge cases
- `tests/helpers.test.js` - Helper re-exports, notification, formatting
- `tests/storage.test.js` - Storage module, preferences, config persistence
- `tests/log-manager.test.js` - LogManager, cross-window sync, sanitization
- `tests/break-phase-utils.test.js` - Break phase detection
- `tests/state.test.js` - Shared mutable state module
- `tests/undo-redo-manager.test.js` - Undo/redo stack operations
- `tests/pomodoro-timer.test.js` - Timer modes, phases, state management
- `tests/window-sync-manager.test.js` - Cross-window timer synchronization
- `tests/security-manager.test.js` - Lock screen, code entry, hold-to-unlock
- `tests/shared-blocker-utils.test.js` - Browser listeners, progress listeners
- `tests/workspace-detector.test.js` - Workspace detection and blocking logic

### Module Dependency Graph

```text
constants.js (no dependencies)
    ↓
    ├─→ state.js (no dependencies)
    ├─→ log-manager.js (Storage injected via DI at runtime)
    │       ↓
    │       ├─→ window-sync-manager.js
    │       │
    │       └─→ storage.js
    │               ↓
    │               └─→ utils.js
    │                       ↓
    │                       └─→ helpers.js (re-exports from Storage, Utils, Constants)
    │                               ↓
    │                               ├─→ ui-helpers.js
    │                               ├─→ break-phase-utils.js
    │                               └─→ shared-blocker-utils.js
    │
    ├─→ pomodoro-timer.js
    ├─→ workspace-detector.js
    ├─→ overlay-manager.js
    ├─→ keyboard-shortcut-handler.js
    │       ├─→ settings-dialog.js
    │       └─→ ruleset-dialog.js
    ├─→ security-manager.js
    ├─→ sine-mod-blocker.js
    ├─→ website-blocker.js
    ├─→ transition-phase-manager.js
    ├─→ daily-reminder-manager.js
    ├─→ post-session-reminder-manager.js
    ├─→ distraction-dump-manager.js
    ├─→ undo-redo-manager.js
    ├─→ custom-cycle-manager.js
    │       └─→ drag-utils.js
    └─→ zen-pomodoro-app.js (imports all classes, wires them together)
            ↓
            └─→ index.js (entry point: DI setup, app creation, event listeners)
```

### Circular Dependency Resolution

LogManager needs Storage for cross-window log sync, but Storage needs LogManager for logging. This is resolved via **dependency injection**: LogManager has a `setStorage()` method that is called after both modules are initialized (in `src/index.js`).

WindowSyncManager also needs Storage for cross-window timer sync. This is injected via `windowSync.setStorage(Storage)` in `src/index.js` after the app is created.

### Module Usage Pattern

```javascript
// In src/ modules, use ES import/export:
import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import { formatTime, LOG_CATEGORIES } from './helpers.js';
import { setupDialogDrag } from './ui-helpers.js';

// Export classes as default exports:
export default MyClass;

// Export functions as named exports:
export function myHelper() { ... }
```

---

## Important Notes for Development

When figuring out what changes need to be made, make sure that you use context7 and perplexity while implementing the fixes and changes and also use the tools to make sure that all of
the code in the repo follows the correct format for Zen Browser mods. Make sure that you also implement the changes for the src/ modules and the .css file, then run `npm run build` to regenerate the bundled uc.js file.

**⚠️ NEVER EDIT `zen-pomodoro-focus-blocker.uc.js` DIRECTLY!** This is a Rollup-generated bundle. All JavaScript changes go in `src/` modules. The Copilot setup steps delete this file at startup to enforce this. After making changes to `src/` files, run `npm run build` to regenerate it.

**CRITICAL:** YOU ARE NOT WORKING ON A FIREFOX EXTENSION, YOU ARE WORKING ON A ZEN BROWSER MOD. ALSO, DO NOT SAY THAT THE ISSUES I DESCRIBED ARE ALREADY FIXED,
BECAUSE IF IT LOOKS LIKE IT'S IMPLEMENTED PROPERLY BUT I SAY THAT THERE'S AN ISSUE, THEN IT'S MOST LIKELY IMPLEMENTED WRONG.

Also, if there are log files that I explicitly list in a prompt/comment, make sure to find those logs files in the repo and diagnose
what's actually going on with the bugged behaviors and issues, and also try and identify any other bugged behaviors
in your parsing of the logs that I didn't already explicitly list out.

**BUG ANALYSIS REQUIREMENT:** For all bugs and issues, it is MANDATORY to scan through the code yourself to try and identify the buggy areas BEFORE assigning a subagent to fix it. DON'T just assign the subagent to identify the issue by itself, as it has on multiple occasions came to the wrong conclusion that there was nothing to fix. Make sure you look through the code yourself and identify the specific functions/lines that need changes before delegating to the subagent.

Make sure that you delegate all of the coding work to the subagent in this repo and MAKE SURE
TO RUN THE SUBAGENT MULTIPLE TIMES TO ADDRESS SPECIFIC CATEGORIES OF ISSUES RATHER THAN JUST DOING EVERYTHING IN ONE PASS.
When the subagent is done, make sure to double-check its work and don't just assume that it's correct.
Also make sure that you run the Copilot code review multiple times before finishing your work.

Also, after the changes are done, I want you to run the CodeScene MCP and refactor the code if there's any issue detected with CodeScene.

---

## MCP Tools Usage

When working on this mod, make use of these MCP (Model Context Protocol) tools:

### Context7

Use context7 to look up documentation for libraries and frameworks:

- First call `context7-resolve-library-id` with the library name to get the library ID
- Then call `context7-query-docs` with the library ID to query documentation
- Example: For Firefox WebExtension APIs, look up "mozilla/firefox-api" or similar

### Perplexity

Use perplexity for web searches and reasoning:

- `perplexity_search` - For finding up-to-date information, news, or documentation
- `perplexity_reason` - For complex reasoning tasks that benefit from web context

### CodeScene

Use CodeScene for code quality analysis:

- `codescene-code_health_score` - Get the overall code health score (1-10)
- `codescene-code_health_review` - Get detailed issues affecting code health
- `codescene-code_health_auto_refactor` - Auto-refactor specific functions
- Target: Maintain Code Health score of at least 7.5

---

## Configuration Storage

Configuration is stored via Firefox `Services.prefs` with the `zen-pomodoro.` prefix. The main config object is stored as JSON in `zen-pomodoro.config`, while some settings (keyboard shortcut, notifications, reminders) are stored as individual preferences for Zen Browser's settings UI.

---

## Timer Phases

1. **Focus** - Active work period, blocking enabled
2. **Break** - Rest period, blocking disabled (but blocked when paused)
3. **Transition** - 5-minute warning before break ends, blocking disabled (but blocked when paused), popup shown

---

## Reminder Systems

### Daily Reminders (DailyReminderManager)

Shows blocking reminders at configurable times throughout the day (default: 11:15 AM and 4:15 PM).

- Multiple configurable times per day (comma-separated HH:MM format)
- Uses periodic check (every 60 seconds)
- Triggers based on user's local time
- Skip with hold/code challenge (escalating difficulty)
- Skip count resets when timer is started
- State persisted via `Services.prefs`

### Post-Session Reminder (PostSessionReminderManager)

Shows reminder after configurable idle time following timer completion.

- Escalating skip requirements (50% longer each skip)
- Skip count persisted across browser restarts
- Focus time tracking - reminders stop after configurable focus time goal (default 2h 30min)
- Focus time resets on daily reminder time, not midnight

### Distraction Dump (DistractionDumpManager)

Allows users to pause their focus timer and capture distracting thoughts without using focus time.

- Only available during focus phase (not break/transition)
- **Only ONE dump allowed per focus phase** (resets when entering new focus cycle)
- Pauses main timer and temporarily lifts ALL blocking (workspace overlay + website blocks)
- Configurable duration (default: 25 minutes, max: 35 minutes)
- Purple-themed UI to distinguish from regular timer
- Auto-resumes main timer when dump ends
- Button shows "Dump Used" with disabled state when already used in current focus phase

---

## New Configuration Options

| Option                          | Type    | Default            | Description                                          |
| ------------------------------- | ------- | ------------------ | ---------------------------------------------------- |
| `dailyReminderEnabled`          | boolean | false              | Enable daily focus reminders                         |
| `dailyReminderTimes`            | array   | ['11:15', '16:15'] | Times in HH:MM format for daily reminders            |
| `dailyReminderSkipMethod`       | string  | 'hold'             | Skip method: 'hold' or 'code'                        |
| `dailyReminderSkipHoldDuration` | number  | 15                 | Seconds to hold for skip                             |
| `dailyReminderSkipCodeLength`   | number  | 32                 | Characters to type for skip                          |
| `dailyReminderSkipCooldown`     | number  | 10                 | Minutes of cooldown between daily reminder skips     |
| `postSessionReminderEnabled`    | boolean | true               | Enable post-session idle reminder                    |
| `postSessionIdleTime`           | number  | 45                 | Minutes before first reminder after timer completion |
| `postSessionSkipCooldown`       | number  | 30                 | Minutes between reminders after skip                 |
| `postSessionFocusTimeGoal`      | number  | 150                | Minutes of focus time goal (2.5 hours)               |
| `postSessionSkipMethod`         | string  | 'hold'             | Skip method: 'hold' or 'code'                        |
| `postSessionSkipHoldDuration`   | number  | 20                 | Seconds to hold for skip                             |
| `postSessionSkipCodeLength`     | number  | 48                 | Characters to type for skip                          |
| `distractionDumpEnabled`        | boolean | true               | Enable Distraction Dump feature                      |
| `distractionDumpDuration`       | number  | 25                 | Default dump duration in minutes                     |
| `distractionDumpMaxDuration`    | number  | 35                 | Maximum dump duration in minutes                     |
| `defaultTransitionDuration`     | number  | 5                  | Default transition block duration in custom cycles (minutes) |
| `timerRemindersEnabled`         | boolean | true               | Enable timer reminders during sessions               |
| `focusPhaseReminders`           | array   | [20, 10, 5, 1]     | Minutes before focus phase ends to show reminder     |
| `breakPhaseReminders`           | array   | [5, 1]             | Minutes before break phase ends to show reminder     |

---

## Helper Functions

| Function                                              | Purpose                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `loadBooleanPref(prefName, config, configKey)`        | Load a boolean preference with validation                   |
| `loadPositiveIntPref(prefName, config, configKey)`    | Load a positive integer preference with validation          |
| `isValidTimeFormat(timeStr)`                          | Validate HH:MM time format                                  |
| `validateIntegerInput(value, min, max, defaultValue)` | Validate and clamp integer input                            |
| `handlePauseResumeTimer()`                            | Handle pause/resume timer action from UI                    |
| `handleSkipFocusWithLockout(onSkip)`                  | Skip focus to break with lockout protection                 |
| `loadIntArrayPref(prefName, config, configKey)`       | Load comma-separated integer array preference               |
| `_countFocusBlocksUpTo(upToIndex)`                    | Count focus blocks in custom cycle up to given index        |
| `_needsTransitionPhase(completedBlock, nextBlock)`    | Check if transition phase is needed (break → focus)         |
| `_enterCustomCycleTransition(nextBlock)`              | Enter transition phase for custom cycles                    |
| `_startNextCustomBlock(nextBlock)`                    | Start next block in custom cycle directly                   |
| `_isValidCustomCycleState()`                          | Check if in valid custom cycle state with valid block index |
| `_getCurrentCustomBlockDuration()`                    | Get current custom block duration for custom cycles         |
| `_handleCutBreakEarly(currentPhase)`                  | Handle Cut Break Early button action                        |
| `_startNextFocusPhase(timer)`                         | Start next focus phase (custom or regular mode)             |
| `_shouldBlockDailyReminder()`                         | Check if daily reminder should be blocked                   |
| `_canShowReminderCountdown()`                         | Check if post-session reminder countdown can be shown       |
| `_getEarliestReminderTime(config)`                    | Get earliest daily reminder time from config                |
| `isPopupWindow()`                                     | Detect if current window is a popup (not main browser)      |
| `UndoRedoManager.pushState(state)`                    | Save state snapshot to undo stack                           |
| `UndoRedoManager.undo()`                              | Restore previous state from undo stack                      |
| `UndoRedoManager.redo()`                              | Restore next state from redo stack                          |
| `UndoRedoManager.createButtons()`                     | Create undo/redo UI button container                        |
| `DistractionDumpManager.getStateForPersistence()`     | Export dump state for browser restart persistence           |
| `DistractionDumpManager.restoreState(state)`          | Restore dump state from persistence                         |
| `_startBlockDrag(e, blockDiv, index)`                 | Start custom pointer-based block drag operation             |
| `_getDropTargetIndex(container, clientY, dragIndices)` | Calculate drop position among non-dragged blocks           |
| `_reorderCycle(config, fromIndex, toIndex, dialog)`   | Reorder a cycle in the saved cycles list                    |
| `_applyDragOperation(targetIndex, dragIndices, multi)` | Apply drag/drop move or duplicate operation                |
| `_cleanupDragVisuals(allBlocks, indicator, ghosts)`   | Clean up all drag visual state and orphaned elements        |
| `_computeAbsoluteTarget(relativeTarget, dragIndices)` | Calculate absolute insertion index from relative drag index |
| `_createDragPreview(e, blockDiv, allBlocks, dragIndices)` | Create floating drag preview that follows cursor (returns {dragPreview, offsetY}) |
| `_getDropIndicatorRef(nonDraggedBlocks, targetIndex)` | Compute reference element for drop indicator positioning    |
| `_isSamePositionMove(absoluteTarget, isMultiSelect)`  | Detect no-op moves where source and target are identical    |
| `_updateAutoScroll(clientY, container, zone, speed, state, onScroll)` | Manage auto-scroll during drag near container edges |
| `calculateBlockTransforms(dragIndices, target, heights)` | Calculate CSS translateY values for transform-based drag reordering |
| `calculateDropIndicatorOffset(dragIndices, target, heights)` | Calculate absolute Y position for drop indicator during drag |
| `WindowSyncManager.isAnotherWindowActive()`      | Check if another window is actively managing the timer        |
| `WindowSyncManager.claimOwnership()`              | Claim timer ownership for this window                         |
| `WindowSyncManager.releaseOwnership()`            | Release timer ownership (e.g., window closing)                |
| `WindowSyncManager.writeSyncState(state)`         | Write timer state to sync pref for other windows              |
| `WindowSyncManager.readSyncState()`               | Read current sync state from pref                             |
| `WindowSyncManager.clearSyncState()`              | Clear all sync-related prefs                                  |
| `WindowSyncManager.startHeartbeatMonitor()`       | Start monitoring owner heartbeat (secondary windows)          |
| `WindowSyncManager.writeReminderSync(actionData)` | Write reminder sync action to pref for cross-window dismissal |
| `PomodoroTimer._writeSyncState()`                 | Write timer state (incl. dump state) to sync pref on each tick |
| `PomodoroTimer.syncFromState(syncState)`          | Update timer state from cross-window sync data                |
| `PomodoroTimer._processActiveTick()`              | Process countdown tick logic (extracted for cross-window sync)|
| `LogManager.initSync()`                           | Initialize cross-window log sync via Services.obs             |
| `LogManager.requestExistingLogs()`                | Request historical logs from other windows on startup         |
| `LogManager.destroySync()`                        | Clean up cross-window log sync observers                      |

---

## Bug Fixes and Features in v1.4.6

### Cross-Window Reminder Sync

**Issue:** When a daily or post-session reminder popup appeared on multiple windows, dismissing or skipping it on one window did not dismiss it on other windows.

**Fix:**
- Added `REMINDER_SYNC_PREF_KEY` (`'reminder-sync'`) constant for cross-window reminder state broadcasting
- Added `writeReminderSync()` method to `WindowSyncManager` with action validation
- Added `onReminderSyncChanged` callback for receiving reminder sync events
- `hideReminder(fromSync)` parameter prevents infinite write-back loops when receiving sync events
- Timer start broadcasts `'timer-started'` action to dismiss all reminders on all windows

### Distraction Dump Cross-Window Sync

**Issue:** Starting a Distraction Dump on one window didn't properly register on other windows.

**Fix:**
- `PomodoroTimer._writeSyncState()` now includes `dumpActive`, `dumpTimeRemaining`, and `dumpUsedThisFocusPhase`
- `_syncDumpState()` in `ZenPomodoroApp` fully manages dump state on secondary windows:
  - Updates `distractionDump.isActive`, `dumpTimeRemaining`, `dumpUsedThisFocusPhase`
  - Calls `websiteBlocker._checkCurrentPage()` to sync website blocking
  - Shows/hides dump indicator via `overlay.showDumpIndicator()`/`overlay.hideDumpIndicator()`
  - Calls `overlay.hide()` when dump activates, `updateOverlayVisibility()` when dump ends

### Custom Cycle Drag UX Overhaul

**Issue:** When dragging blocks in the custom cycle editor, blocks collapsed to height 0 (disappeared), other blocks filled the gap immediately, the blue drop indicator often didn't appear, and there was no animation.

**Fix:**
- **Visual placeholder**: Dragged blocks now show at 30% opacity instead of collapsing to height 0
- **Transform-based reordering**: `calculateBlockTransforms()` computes CSS `translateY` values for all blocks to preview the final order
- **Animated movement**: CSS transitions provide 200ms animated block movement during drag
- **Reliable drop indicator**: Absolutely positioned at calculated gap boundary using `calculateDropIndicatorOffset()`
- **Cached positions**: Block heights/midpoints cached at drag start to avoid transform-affected DOM queries
- **Refactored arguments**: `_createPointerMoveHandler` and `_createDragCleanup` use options objects instead of 8-9 separate arguments

### Build System Improvements

- Copilot setup steps now verify Rollup build works and delete the bundled uc.js file to enforce editing src/ modules only
- Added CSS utility control layout fix for #zen-pomodoro-controls
- Added transition popup position reset documentation

### Window Teardown Notification Bug

**Issue:** Closing secondary windows or popup windows (e.g., Google sign-in) triggered false timer-complete notifications and caused reminder completion side effects, because the timer stop callback fired during app teardown.

**Fix:**
- `PomodoroTimer.stop()` now accepts `suppressCompleteCallback` parameter (default: false)
- `ZenPomodoroApp._runCleanupActions()` calls `timer.stop({ suppressCompleteCallback: true })` during teardown
- Prevents completion logic from running when window is closing, not when user actually completed a session

---

## Bug Fixes and Features in v1.4.5

### ES Module Architecture with Rollup Bundling

**Change:** Broke the monolithic 15,900-line `zen-pomodoro-focus-blocker.uc.js` into 28 ES modules under `src/`, bundled back into a single IIFE via Rollup for Sine mod loader compatibility.

**Build System:**
- Source code lives in `src/` (28 ES modules)
- `npm run build` runs `rollup -c rollup.config.mjs` to bundle into single IIFE
- Bundle MUST be rebuilt after any `src/` changes
- GitHub Action verifies bundle is up to date on PRs

**New Modules (extracted for CodeScene Code Health):**
- `src/settings-dialog.js` - Settings dialog UI (extracted from keyboard-shortcut-handler)
- `src/ruleset-dialog.js` - Ruleset settings dialog UI (extracted from keyboard-shortcut-handler)
- `src/drag-utils.js` - Drag/drop utilities (extracted from custom-cycle-manager)

### Critical Bug Fixes

**Cross-Window Sync API Mismatch:**
- Fixed `_writeSyncState()` using `sync.ownsTimer` → `sync.isTimerOwner` and `sync.writeState()` → `sync.writeSyncState()`
- Fixed WindowSyncManager never receiving Storage injection (was null, broke all sync)
- Added missing PomodoroTimer methods: `syncFromState()`, `getStatus()`, `startFocusFromTransition()`

**Callback Contract Fixes:**
- Fixed `tick()` to pass `(time, phase, cycle, total)` to onTick callback (was only `time`)
- Fixed all `onPhaseChange` calls to pass `(phase, cycle)` instead of `(phase, remainingTime)`
- Fixed `pause()` to accept and persist `isOnBlockedWorkspace` parameter

**NaN Long Break Duration:**
- Added `longBreakDuration: 15` to DEFAULT_CONFIG (was missing, caused NaN on last cycle)

**Timer Stop Sync:**
- Fixed `stop()` to write final inactive state and clear sync prefs before releasing ownership

### Code Quality Improvements

- All 28 modules at CodeScene Code Health ≥ 9.5 (13 at 10.0)
- keyboard-shortcut-handler refactored from 4.08 → 9.68
- LogManager console output now uses normalized `entry.category` (not raw parameter)
- Silent catch blocks replaced with `console.warn` for better debugging
- WorkspaceDetector: removed dead `validatedWorkspaces` cache
- `getActiveBlockedWorkspaces()` now filters by `config.activeRulesets`
- `ChromeUtils.generateQI()` uses `Ci.nsI*` interfaces instead of strings
- 0 ESLint warnings across all source modules
- CI workflows use `npm ci` for reproducible builds

### Test Coverage

- 758 tests across 13 test files (expanded from 205 across 4 files)
- `@vitest/coverage-v8` installed for code coverage
- 100% coverage: constants, helpers, break-phase-utils, state
- 98%+ coverage: storage, window-sync-manager, workspace-detector
- New test files: window-sync-manager, security-manager, shared-blocker-utils, workspace-detector

---

## Bug Fixes and Features in v1.4.4

### Cross-Window Timer Synchronization

**Issue:** When opening multiple Zen Browser windows with an active Pomodoro timer, each window ran its own independent timer. The second window showed a "Timer Restored" notification even though the browser hadn't restarted. Logs exported from different windows contained different entries.

**Root Cause:** Each window created its own independent `PomodoroTimer` instance with its own `setInterval` countdown. The `loadState()` method always set `restoredFromRestart = true` and forced `isPaused = true`, not distinguishing between a genuine browser restart and a new window opening while another window was active. Each window had its own in-memory `LogManager` with no cross-window sharing.

**Fix:** Implemented a primary/secondary window architecture:

**WindowSyncManager (new class):**
- Manages window ownership via `zen-pomodoro.timer-owner` pref with heartbeat timestamps
- Only the "owner" window runs the actual timer countdown (`setInterval`)
- Secondary windows observe `zen-pomodoro.timer-sync` pref for real-time state updates
- Dead owner detection: secondary windows check heartbeat every 5 seconds, take over if stale (>30s)
- Ownership transfer: when user interacts (pause/resume/stop) in secondary window, it claims ownership
- Uses `Services.prefs.addObserver()` for cross-window pref change notification

**PomodoroTimer modifications:**
- The interval callback checks ownership on every tick via `_hasLostOwnership()`, stops if lost
- New `_writeSyncState()` writes timer state to sync pref every tick
- New `syncFromState()` updates timer state from sync data (secondary windows)
- `start()`, `startCustomCycle()`, `pause()`, `resume()` claim ownership
- `stop()` clears sync state to notify all windows

**LogManager sync:**
- `initSync()` registers `Services.obs` observer for `zen-pomodoro-log` topic
- Each `log()` call broadcasts entry to all windows via `Services.obs.notifyObservers()`
- `requestExistingLogs()` requests historical logs from other windows on startup
- `_respondToLogRequest()` writes logs to shared pref for new windows
- `destroySync()` cleans up observers

**ZenPomodoroApp onReady() changes:**
- Checks `windowSync.isAnotherWindowActive()` before showing "Timer Restored" notification
- If another window is active: syncs state from sync pref, does NOT force pause, does NOT show notification
- If no other window active: genuine restart, claims ownership, proceeds with existing behavior
- Sets up sync callbacks: `onSyncStateChanged`, `onOwnershipLost`, `onOwnershipTaken`

**New Helper Methods:**
- `_onSyncStateReceived(syncState)` - Handle sync update from owner window
- `_onOwnershipLost()` - Stop interval, become secondary
- `_onOwnershipTaken(syncState)` - Take over timer, start interval
- `_claimOwnershipForAction()` - Claim ownership when user interacts in secondary

**Optimization:** Only one window runs the countdown interval at any time, regardless of how many windows are open. This means no additional CPU usage per window - secondary windows are purely reactive UI displays.

---

## Bug Fixes and Features in v1.4.3

### Floating Drag Preview for Block Drag

**Issue:** When dragging blocks in the custom cycle editor, the blocks completely disappeared during drag and only reappeared when released. The `.dragging` CSS class collapsed blocks to `height: 0; opacity: 0` to make room for the drop indicator, but no visual feedback showed what was being dragged.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Created a floating drag preview element that follows the cursor during drag
- Clones the dragged block(s) into a `position: fixed` container with `z-index: 2147483647`
- Captures block dimensions BEFORE adding `.dragging` class (which collapses blocks)
- Preview positioned at cursor offset and updates on every `pointermove` event
- Preview removed on drag end (cleanup)

**Fix:** In `chrome.css`:
- Added `.zen-pomodoro-drag-preview` class with semi-transparent background, shadow, and blue border accent

### Drop Indicator Flickering Fix

**Issue:** The blue drop indicator line flickered during block dragging in short lists and didn't appear at all in scrollable lists.

**Root Cause:** Multiple CSS issues contributed:
1. `.zen-pomodoro-cycle-block` had `transition: all 0.2s ease` which animated the collapse when `.dragging` class was added, causing layout jitter
2. The drop indicator had no `z-index`, so it could be hidden behind block elements
3. The pulsing animation oscillated `opacity` between 0.7 and 1.0, compounding the visual flickering

**Fix:** In `chrome.css`:
- Changed `.zen-pomodoro-cycle-block` transition from `all 0.2s ease` to `background-color 0.2s ease, border-color 0.2s ease` (only hover effects, not layout properties)
- Added `position: relative; z-index: 5;` to `.zen-pomodoro-cycle-drop-indicator`
- Changed animation to only pulse `box-shadow` (not opacity) with 1.5s timing for smoother effect

### Dropdown Select Contrast Improvement

**Issue:** Dropdown select backgrounds (`#1a1926`) were still nearly identical to the dialog background (`#2b2a33`) on many displays.

**Fix:** In `chrome.css`:
- Changed select background-color from `#1a1926` to `#151422` (darker, more distinct)
- Changed border from `2px solid #4a4960` to `2px solid #5a5980` (brighter purple)
- Added `box-shadow: inset 0 1px 4px rgb(0 0 0 / 40%)` for visual depth
- Changed hover background from `#222135` to `#1c1b30`
- Changed hover border from `#5a59a0` to `#7a79c0` (brighter)
- Changed option background from `#1e1d26` to `#131220`
- Applied to all select selectors: `.zen-pomodoro-config-row select`, `.zen-pomodoro-dialog select`, `.zen-pomodoro-cycle-editor-dialog select`, `select.zen-pomodoro-dialog-input`, `.zen-pomodoro-rule-select`

---

## Bug Fixes and Features in v1.4.2

### Dropdown Select Contrast Fix

**Issue:** Dropdown select backgrounds (#252430) were nearly identical to the dialog background (#2b2a33), making them hard to distinguish. The dropdowns also flickered when opened due to CSS transitions.

**Fix:** In `chrome.css`:
- Changed select background-color from `#252430` to `#1a1926` (darker, more distinct)
- Increased border from `1px` to `2px solid #4a4960` for better visibility
- Changed hover background from `#2a2940` to `#222135`
- **Removed CSS transitions** from all select elements to prevent flickering on open
- Applied to all selectors: `.zen-pomodoro-config-row select`, `.zen-pomodoro-dialog select`, `.zen-pomodoro-cycle-editor-dialog select`, `select.zen-pomodoro-dialog-input`, `.zen-pomodoro-rule-select`

### Block Drag Ordering Fix

**Issue:** When dragging a block from position 0 to the middle position in a 3-block cycle, the block ended up at the bottom instead of the middle.

**Root Cause:** `reorderBlocks()` called `splice(fromIndex, 1)` to remove the block, which shifts all subsequent indices down by 1. Then `splice(toIndex, 0, block)` used the unadjusted `toIndex`, inserting at the wrong position.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added index adjustment: `const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;`
- Example: With [A, B, C], dragging A(0) to middle → absoluteTarget=2, adjustedIndex=1 → [B, A, C] ✓

### Drop Indicator Visibility Fix

**Issue:** Blue drop indicator line didn't appear during drag, and non-dragged blocks didn't move positions when dragging.

**Root Cause:** Dragged blocks had `opacity: 0.4` and `transform: scale(0.95)` but still occupied layout space. Non-dragged blocks stayed in place, making the drop indicator hard to see. CSS classes `shift-down`/`shift-up` were referenced in JS but never defined in CSS.

**Fix:**
- **CSS**: Changed `.dragging` to collapse blocks: `height: 0 !important; padding: 0; margin: 0; border-width: 0; overflow: hidden; opacity: 0;`
- **JS**: Removed dead shift-down/shift-up code and `--block-shift-distance` CSS variable logic
- Non-dragged blocks now naturally fill the gap, making the drop indicator clearly visible

### Ghost Block Index Corruption Fix

**Issue:** During Alt+drag duplication, ghost blocks had the `zen-pomodoro-cycle-block` class, causing `_getDropTargetIndex()` to include them in block counts, corrupting drop position calculations.

**Fix:** Changed `querySelectorAll('.zen-pomodoro-cycle-block')` to `querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)')` in both `_startBlockDrag()` and `_getDropTargetIndex()`.

### Auto-Scroll Timing Fix

**Issue:** Auto-scroll during block drag was not triggering reliably because the `_updateAutoScroll()` call was placed after the `if (rafId) return;` throttle check, meaning it was skipped when a requestAnimationFrame was pending.

**Fix:** Moved `_updateAutoScroll()` call before the rAF throttle check in `onPointerMove`, so auto-scroll detection runs on every pointer move event.

---

## Bug Fixes and Features in v1.4.1

### Custom Cycle Drag System Overhaul

**Issue:** Several drag-related bugs in the custom cycle editor: blocks could only be dragged from the handle, blue drop indicator flickered, UI broke after many drags, blocks swapped when dragged back to original position.

**Fixes:**
- **Full-block drag**: Moved `pointerdown` listener from drag handle to entire block element with guards for input/delete button clicks
- **Flickering fix**: Added position caching to `_positionDropIndicator()` - only calls `insertBefore()` when reference element actually changes
- **Stability fix**: Added `pointercancel` event support, safety cleanup on drag start if previous drag wasn't cleaned up, enhanced `_cleanupDragVisuals()` to remove orphaned indicators/ghosts
- **Snap-back fix**: Added no-op detection in `_applyDragOperation()` - returns early when `absoluteTarget === from || absoluteTarget === from + 1`
- **Auto-scroll**: Added auto-scroll when dragging near top/bottom edges (40px zone, 4px/frame speed) with proper direction change handling

### Auto-scroll for Block Drag

**Feature:** When the block list is long enough to require scrolling, dragging a block near the top or bottom of the visible area auto-scrolls the container.

**Implementation:**
- 40px edge detection zones at top and bottom of scrollable container
- Smooth 4px/frame scrolling via `requestAnimationFrame`
- Proper direction switching (up ↔ down) without stopping/restarting
- Cleanup on pointer release or cancel

### Dropdown Option Styling Fix

**Issue:** Dropdown menu option backgrounds matched the dialog background, making them hard to see. Selecting the first option was particularly difficult.

**Fix:** In `chrome.css`:
- Added `option` element styling for all select elements with dark background (#1e1d26)
- Added hover state (#2a2940) and checked/selected state (#2180cd blue)
- Applied to all dropdown selectors including `.zen-pomodoro-rule-select`

### Undo/Redo Buttons Layout

**Issue:** Undo/redo buttons were on a separate line below the back button instead of the same line.

**Fix:**
- Created `headerRow` flex container in all 4 dialogs (Start Timer, Settings, Rulesets, Cycle Editor)
- Back button on left, undo/redo on right in same row
- Removed `margin-bottom` from `.zen-pomodoro-undo-redo-container`

### Custom Cycle Reordering

**Feature:** Users can now reorder custom cycles in the cycles list using up/down arrow buttons.

**Implementation:**
- Added ▲/▼ buttons to each cycle list item
- Buttons disabled at list boundaries (can't move first up or last down)
- Added `_reorderCycle()` method to `CustomCycleManager`
- Order persists to config immediately
- Added disabled button styling (opacity 0.3)

### Comprehensive Logging

**Enhancement:** Added detailed logging for all custom cycle and ruleset operations.

**Custom Cycle Logs:**
- Block duration changes, selection/deselection, drag start/complete
- Cycle name changes, default duration changes
- Block deletion (single and multi-select), cycle validation failures
- Cycle deletion confirmation, auto-scroll activation

**Ruleset Logs:**
- Ruleset creation, deletion, renaming, enable/disable toggling
- Rule pattern changes, rule deletion

---

## Bug Fixes and Features in v1.4.0

### Timer State Persistence for Distraction Dump

**Issue:** If the browser closes or crashes during a Distraction Dump, the dump state was lost and the timer didn't persist correctly.

**Root Cause:** The `saveState()` method only saved basic timer fields but didn't include any Distraction Dump state (isActive, dumpTimeRemaining, savedTimerState, dumpUsedThisFocusPhase).

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added `getStateForPersistence()` method to `DistractionDumpManager` to export dump state
- Added `restoreState()` method to `DistractionDumpManager` to restore dump state
- Modified `saveState()` to include dump state via `getStateForPersistence()`
- Modified `loadState()` to store dump state in `pendingDumpState`
- Modified `onReady()` to restore dump state, re-enable dump mode, and restart countdown

### Timer Indicator Visual Bug on Restore

**Issue:** After browser restart, the timer indicator showed the initial configured duration (e.g., 30 minutes) instead of the actual remaining time (e.g., 10 minutes).

**Root Cause:** In `_resetIndicatorDisplay()`, it accessed `window.zenPomodoroApp?.timer` but the global variable wasn't assigned yet when `showIndicator()` was called during restoration.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Moved `window.zenPomodoroApp = this;` assignment to early in `onReady()`, before timer restoration code
- Added `updateIndicatorPausedState(true)` call after showing indicator during restore

### Code Lockout Screen Character Alignment (Final Fix)

**Issue:** Characters in the code display and input text box were still misaligned.

**Root Cause:** Firefox's internal input padding didn't match the div element's padding even with identical CSS.

**Fix:** In `chrome.css`:
- Changed `.zen-pomodoro-lock-code-display` border from `transparent` to background-matching `#1e1d26`
- Added `-moz-padding-start` and `-moz-padding-end` overrides with `!important` to `#zen-pomodoro-lock-code`
- Added explicit `padding: 0` to `.zen-pomodoro-code-container`

### Custom Cycle Drag/Drop UX Overhaul

**Issue:** Drag and drop for custom cycle blocks was janky with cursor flickering, no visual preview for where blocks would end up, and poor feedback during Alt+drag duplication.

**Root Cause:** The HTML5 native drag API's ghost image conflicted with DOM manipulation during `dragover`, causing cursor flickering and rapid reflows.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js` and `chrome.css`:
- Replaced HTML5 drag API with custom pointer-based drag system using `pointerdown`/`pointermove`/`pointerup`
- Added `_startBlockDrag()` method with `requestAnimationFrame` throttling for smooth 60fps updates
- Added `_getDropTargetIndex()` for precise drop position calculation
- Added blue pulsing drop indicator line (`.zen-pomodoro-cycle-drop-indicator`)
- Added ghost blocks for duplication preview (`.zen-pomodoro-cycle-block-ghost`)
- Added smooth CSS transitions for block shifting during drag (`.drag-transition`)
- Removed `draggable` attribute from block elements

### Dropdown Styling Improvements

**Enhancement:** All dropdown/select elements across the mod now have distinct visual styling.

**Changes:** In `chrome.css`:
- Added custom background color (#252430) distinct from dialog background
- Added visible border (#4a4960) with hover state (#5a59a0)
- Added custom SVG dropdown arrow replacing native appearance
- Added focus state with blue glow
- Applied to all select elements: `.zen-pomodoro-config-row select`, `.zen-pomodoro-dialog select`, `.zen-pomodoro-rule-select`, `select.zen-pomodoro-dialog-input`

### Default Transition Duration Config

**Feature:** Custom cycle editor now has a configurable default transition duration.

**Changes:**
- Added `defaultTransitionDuration` property to cycle objects (default: 5 minutes, max: 15 minutes)
- Added transition duration input field in cycle editor alongside focus and break duration inputs
- "Add Block" handler uses configured transition duration instead of hardcoded 5 minutes
- Backward compatibility: existing cycles without this field default to 5 minutes

### Undo/Redo System for All Menus

**Feature:** All mod menus now have undo and redo buttons for reverting changes.

**Implementation:**
- Added `UndoRedoManager` class with stack-based undo/redo state management
- JSON serialization for deep state cloning and comparison
- Auto-enabling/disabling buttons based on stack state
- Integrated into 4 dialogs: Settings, Rulesets, Start Timer, Custom Cycle Editor
- CSS styling with `.zen-pomodoro-undo-redo-container` and `.zen-pomodoro-undo-redo-button`

**New Class:** `UndoRedoManager`
- `pushState(state)` - Save state snapshot
- `undo()` / `redo()` - Navigate state history
- `createButtons()` - Create UI button container
- `onStateRestore` callback for dialog refresh

---

## Bug Fixes in v1.3.9

### End Break Early Not Working During Transition Phase in Custom Cycles

**Issue:** When clicking "Cut Break Early" during a transition phase in custom cycles, nothing happened. The timer stayed in transition phase.

**Root Cause:** The `_canSkipCustomBlock()` method only allowed skipping when `currentPhase === 'break'`, but transition phase was not included.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Modified `_canSkipCustomBlock()` to allow skipping during both break and transition phases
- Changed condition from `if (this.currentPhase !== 'break')` to `if (this.currentPhase !== 'break' && this.currentPhase !== 'transition')`

### Distraction Dump Workspace Blocking Fix

**Issue:** When activating a Distraction Dump while on a blocked workspace, the workspace was unblocked, but switching to another blocked workspace showed it as blocked. Returning to the original workspace also showed it as blocked again.

**Root Cause:** The `updateOverlayVisibility()` method referenced `distractionDumpManager` but the actual property name is `distractionDump`. This caused the check for active dump to always fail, so workspace blocking was not properly lifted when switching workspaces during a dump.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Changed line 13676 from `window.zenPomodoroApp?.distractionDumpManager` to `window.zenPomodoroApp?.distractionDump`
- This ensures the active dump state is properly checked when determining overlay visibility

### Code Lockout Screen Character Alignment Fix

**Issue:** The first character in the input text box was still not aligned with the first character in the displayed code, despite previous alignment fixes.

**Root Cause:** The `.zen-pomodoro-lock-code-input` class had asymmetric padding-inline values (`14px 12px`) while the other code display elements used `12px`.

**Fix:** In `chrome.css`:
- Changed `.zen-pomodoro-lock-code-input` padding-inline from `14px 12px` to `12px`
- Now matches `.zen-pomodoro-lock-code-display` and `#zen-pomodoro-lock-code` for perfect alignment

---

## Bug Fixes in v1.3.8

### Timer Restored Notification in Popup Windows

**Issue:** The "Timer Restored" notification would incorrectly appear when a Google sign-in popup (or other auth popup) opened, even though the browser didn't actually restart.

**Root Cause:** The mod initializes in all browser windows, including popup windows. When `loadState()` restored timer state, it always set `restoredFromRestart = true`, triggering the notification even in popup windows.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added `isPopupWindow()` utility function to detect popup windows
- Checks for `chromehidden` attribute (set on popup windows)
- Checks for absence of `gBrowser.tabContainer` (not present in popups)
- Modified `onReady()` to skip restoration notification in popup windows

### Right-Click to Pause/Unpause Timer Indicator

**Feature:** Users can now right-click the draggable timer indicator to quickly pause/unpause the timer without opening the menu.

**Implementation:**
- Added `contextmenu` event handler to timer indicator
- `e.preventDefault()` and `e.stopPropagation()` prevent context menu and event propagation
- Calls `handlePauseResumeTimer()` for consistent pause/resume behavior
- Checks for Distraction Dump active state and shows appropriate alert
- Handler stored in `indicatorContextMenuHandler` for proper cleanup

### Hide/Show Timer Indicator Keyboard Shortcut

**Feature:** Users can now assign a keyboard shortcut to toggle the timer indicator visibility.

**Implementation:**
- Added `toggleIndicatorShortcut` config option (default: `Alt+Shift+H`)
- Added `setupToggleIndicatorShortcut()` method to `KeyboardShortcutHandler`
- Added `_toggleIndicatorVisibility()` helper method
- Added shortcut recorder UI in settings dialog
- Added `_saveToggleIndicatorShortcut()` to save settings
- Proper cleanup in `destroy()` method

**New Configuration Options:**
| Option | Type | Default | Description |
| `toggleIndicatorShortcut` | string | 'Alt+Shift+H' | Keyboard shortcut to hide/show timer indicator |

---

## Bug Fixes in v1.3.7

### Code Lock Screen Character Alignment (Improved)

**Issue:** The "J" in the input text box was shifted to the RIGHT compared to the "J" in the displayed code above it.

**Root Cause:** Asymmetric padding-inline values (`14px 12px`) caused misalignment between the code display and input elements.

**Fix:** In `chrome.css`:
- Changed `.zen-pomodoro-lock-code-display` padding-inline from `14px 12px` to `12px`
- Changed `#zen-pomodoro-lock-code` padding-inline from `14px 12px` to `12px`
- Equal padding on both sides ensures perfect character alignment

### Transition Phases Not Working in Custom Cycles

**Issue:** When a break ends in a custom cycle, it would go directly to the next focus session without showing the transition phase popup.

**Root Cause:** The `_handleCustomCycleBlockComplete()` method directly set the next block's phase without checking if a transition phase should occur (break → focus transition).

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added `_needsTransitionPhase()` helper to check if transition is needed
- Added `_enterCustomCycleTransition()` to handle entering transition phase
- Added `_startNextCustomBlock()` to start blocks directly
- Modified `startFocusFromTransition()` to support custom cycle block durations
- Refactored to reduce code complexity and improve maintainability

### Custom Cycles Show Wrong Cycle Count (1/1)

**Issue:** The main menu always showed "Cycle 1 of 1" for custom cycles, even when there were multiple focus phases.

**Root Cause:** 
1. `totalCycles` was hardcoded to 1 for custom cycles
2. Display logic only showed cycle progress for pomodoro mode, not custom mode

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Changed `startCustomCycle()` to calculate `totalCycles` as the count of focus blocks
- Added `_countFocusBlocksUpTo()` helper to track which focus cycle we're on
- Updated cycle tracking logic in `_enterCustomCycleTransition()` and `_startNextCustomBlock()`
- Modified `_updateCycleProgress()` to show progress for custom mode (`timerMode === 'custom'`)

### Code Quality Refactoring

**Improvement:** Refactored `_handleCustomCycleBlockComplete()` from cc=14 to cc=4 (cyclomatic complexity reduced by 10).

**New Helper Methods:**
- `_countFocusBlocksUpTo(upToIndex)` - Count focus blocks up to a given index
- `_needsTransitionPhase(completedBlock, nextBlock)` - Check if transition phase is needed
- `_enterCustomCycleTransition(nextBlock)` - Enter transition phase for custom cycles
- `_startNextCustomBlock(nextBlock)` - Start the next block directly
- `_isValidCustomCycleState()` - Check if in valid custom cycle state
- `_getCurrentCustomBlockDuration()` - Get current custom block duration

### Distraction Dump Indicator Click Fix

**Issue:** Clicking on the draggable timer indicator during Distraction Dump would trigger the "End Dump" confirmation dialog even when the user was just dragging the indicator.

**Root Cause:** The click event fires after mouseup, so any click on the indicator would trigger the end dump dialog regardless of whether the user dragged.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added `indicatorDidDrag` flag to `OverlayManager` to track when drag occurred
- Flag is set when mouse moves more than 5 pixels during drag
- Flag is reset 100ms after mouseup to allow click handlers to check it
- Distraction Dump indicator click handler checks flag and skips dialog if drag occurred

### Cut Break Early Improvements

**Enhancement:** Refactored "Cut Break Early" button handling for better code organization.

**Changes:**
- Added `_handleCutBreakEarly(currentPhase)` helper method
- Added `_startNextFocusPhase(timer)` helper method for consistent phase transitions
- Properly handles all scenarios: transition phase, custom mode, and regular pomodoro mode
- Skips transition popup when cutting transition phase early

### Custom Cycle Empty Blocks Validation

**Enhancement:** Added validation for empty custom cycle blocks.

**Fix:** `startCustomCycle()` now validates that `customCycleBlocks.length > 0` before attempting to access the first block, preventing potential undefined errors.

---

## Bug Fixes in v1.3.6

### Timer Reminders Feature (New)

**Feature:** Browser notifications at specified times before focus or break phases end.

**Implementation:**
- Shows notifications at exact minute boundaries
- Different messages for focus vs break phases:
  - Focus: "⏰ X minute(s) left in your focus session!"
  - Break: "☕ X minute(s) left in your break!"
- Respects the global `enableNotifications` setting
- Skips transition phase (already a warning phase)
- Tracks shown reminders per phase to avoid duplicates
- Clears tracking when phase changes

**Configuration:**
- `timerRemindersEnabled` (boolean, default: true) - Enable/disable reminders
- `focusPhaseReminders` (array, default: [20, 10, 5, 1]) - Minutes before focus ends
- `breakPhaseReminders` (array, default: [5, 1]) - Minutes before break ends

**Settings UI:**
- New "Timer Reminders" section in settings dialog
- Enable/disable checkbox
- Focus Phase Reminders subsection with list and add/delete controls
- Break Phase Reminders subsection with list and add/delete controls
- Input validation (1-120 min focus, 1-60 min break)

**Helper Functions:**
- `loadIntArrayPref(prefName, config, configKey)` - Load comma-separated integer array preference

### Cut Break Early Button for Transition Phase

**Issue:** "Cut Break Early" button didn't work during transition phase - it would appear but clicking it did nothing.

**Root Cause:** The button handler only called `hideTransitionPopup()`, which has a guard that returns early if the popup isn't showing (e.g., on non-blocked workspaces). Additionally, there was no custom mode handling, so custom cycles would not properly advance to the next block.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Modified button handler to directly start focus phase regardless of popup visibility
- Added custom mode detection and calls `skipToNextCustomBlock()` for custom cycles
- Regular Pomodoro mode continues to use existing `startFocusPhase()` logic

### Code Lock Screen Character Alignment

**Issue:** The first character in the displayed code was a few pixels to the RIGHT of the first character in the input text box, causing misalignment.

**Root Cause:** Browser differences in text positioning between div and input elements. The input had default padding/appearance styles that caused offset.

**Fix:** In `chrome.css`:
- Added explicit `padding-inline-start: 2px;` to `.zen-pomodoro-lock-code-display` to match input padding
- Added explicit `padding-inline-end: 2px;` for consistency
- Added `text-indent: 0;` to ensure no text indentation
- Added `appearance: none;` to remove browser default styling
- This ensures perfect character-by-character alignment between code display and input

### Copilot Setup Steps Workflow

**Issue:** The `copilot-setup-steps.yml` workflow failed because `cache: npm` requires package-lock.json, which is in .gitignore.

**Root Cause:** The workflow used `cache: npm` without a cache-dependency-path, and npm ci requires package-lock.json.

**Fix:** In `.github/workflows/copilot-setup-steps.yml`:
- Added `cache-dependency-path: './package.json'` to explicitly point to package.json
- Changed `npm ci` to `npm install` since package-lock.json is not tracked

### Removed Duplicate Settings from preferences.json

**Issue:** Several settings (reminderMode, postSessionIdleTime, etc.) appeared both in preferences.json and in the mod's internal settings menu, causing confusion.

**Fix:**
- Removed: reminderMode, postSessionIdleTime, postSessionSkipCooldown, postSessionFocusTimeGoal, postSessionReminderEndTime, dailyReminderSkipCooldown
- These settings are still available in the mod's internal settings menu (accessed via keyboard shortcut)
- Kept only: keyboard shortcut and notifications settings in preferences.json

### Custom Cycles: Block Duplication (Alt+Drag)

**Feature:** Hold Alt key and drag a block to duplicate it.

**Implementation:**
- Works with single blocks and multi-selected blocks
- Duplicates preserve duration and type
- Visual feedback during drag operation

### Custom Cycles: Multi-Select (Shift+Click)

**Feature:** Hold Shift and click blocks to select multiple blocks at once.

**Implementation:**
- Selected blocks have distinct visual appearance (blue border, highlighted background)
- Click without Shift to clear selection
- Selection state persists during drag/duplicate/delete operations

### Custom Cycles: Multi-Select Operations

**Feature:** Perform operations on multiple selected blocks simultaneously.

**Implementation:**
- **Multi-select + drag:** Move all selected blocks together, preserving relative order
- **Multi-select + Alt+drag:** Duplicate all selected blocks at once
- **Multi-select + delete:** Delete all selected blocks (with protection - cannot delete all blocks in cycle)

---

## Bug Fixes in v1.3.5

### Distraction Dump Workspace Blocking Fix

**Issue:** When a Distraction Dump was active, blocked workspaces were still blocked. Switching to a blocked workspace during dump would show the overlay.

**Root Cause:** In `updateOverlayVisibility()`, there was no check for whether a Distraction Dump was active before deciding to show/hide the overlay.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added check at the top of `updateOverlayVisibility()` to detect active Distraction Dump
- When dump is active, overlay is hidden and method returns early
- This properly lifts workspace blocking during dump

### Code Lockout Screen Character Alignment Fix

**Issue:** The first character of the input box didn't align perfectly with the first character of the displayed code.

**Root Cause:** The `.zen-pomodoro-lock-code-input` class had no explicit `margin: 0`, allowing browser defaults to add extra margin.

**Fix:** In `chrome.css`:
- Added `margin: 0;` to `.zen-pomodoro-lock-code-input` (line 1770)
- Ensured all code lockout elements have consistent padding and no margins

### Transition Phase Pause Blocking Fix

**Issue:** Pausing during a transition phase while on a blocked workspace wouldn't block the workspace. The overlay would only appear after switching to another workspace and back.

**Root Cause:** In `_handlePausedBreakPhase()`, when `isBlocked` parameter was null, it called `this.workspace.isCurrentWorkspaceBlocked()` to check if the workspace should be blocked. However, `isCurrentWorkspaceBlocked()` has a guard that returns false during break/transition phases (since blocking is disabled during breaks). This caused the overlay to never show when pausing during transition on a blocked workspace.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Changed `_handlePausedBreakPhase()` to use `isWorkspaceInBlockedList()` instead of `isCurrentWorkspaceBlocked()` when `isBlocked` is null
- `isWorkspaceInBlockedList()` checks raw workspace membership without phase filtering
- This correctly shows the overlay on blocked workspaces when paused during break/transition phases

### Copilot Setup Steps Workflow Fix

**Issue:** The `copilot-setup-steps.yml` workflow was missing critical steps, causing `npm ci` to fail.

**Root Cause:** The workflow attempted to run `npm ci` without first checking out the repository code.

**Fix:** In `.github/workflows/copilot-setup-steps.yml`:
- Added `actions/checkout@v4` step to checkout the repository
- Added `actions/setup-node@v4` step with Node.js 20 and npm caching
- Added `permissions: contents: read` for proper security
- Updated trigger to also run on `push` events for validation

---

## Bug Fixes in v1.3.4

### Code Lockout Screen Font Size Fix

**Issue:** The input text box font size was smaller than the displayed code above it.

**Root Cause:** Firefox/browser default styles were overriding the `font-size: 17px` rule because it didn't have `!important`.

**Fix:** In `chrome.css`:
- Added `!important` to `font-size: 17px` for `#zen-pomodoro-lock-code` (line 698)
- Added `!important` to `font-size: 17px` for `.zen-pomodoro-lock-code-input` (line 1768)

### Distraction Dump UX Improvement

**Issue:** Users could only end the Distraction Dump early by clicking on the small timer indicator in the corner.

**Fix:** The Distraction Dump button in the main menu now supports three states:
- "🧠 Distraction Dump" → Available (opens config dialog)
- "🧠 End Dump Early" → Active dump (shows end confirmation)
- "🧠 Dump Used" → Disabled (already used this focus phase)

### Skip Focus Cycle Feature (New)

**Feature:** Users can now skip a single focus cycle (move to break early) without stopping the entire timer.

**Implementation:**
- Added "Skip Focus" button that appears only during focus phase
- Protected by lockscreen verification (same as Stop Timer)
- Works with all timer modes (regular Pomodoro, simple, custom cycles)
- Added `handleSkipFocusWithLockout()` helper function
- Added `skipFocusToBreak()` and `_skipFocusInCustomMode()` methods to PomodoroTimer class

---

## Bug Fixes in v1.3.3

### Code Lockout Screen UI Alignment Fix

**Issue:** The input text box was narrower than the displayed code, and first characters weren't aligned.

**Root Cause:** The CSS container used `display: inline-flex` with `width: max-content`, but input elements don't properly stretch within inline-flex containers.

**Fix:** In `chrome.css`:
- Changed `.zen-pomodoro-code-container` from `display: inline-flex` to `display: flex`
- This allows the input element to properly stretch to match the code display width

### Custom Cycles Dialogs Not Draggable

**Issue:** The Custom Cycles and Create Custom Cycle submenu boxes were not draggable like other dialogs.

**Root Cause:** In `CustomCycleManager`, both `showCustomCyclesMenu()` and `showCycleEditor()` called `applyLastDialogPosition(dialog)` but did NOT call `setupDialogDrag(dialog)` after appending dialogs to the DOM.

**Fix:** In `zen-pomodoro-focus-blocker.uc.js`:
- Added `setupDialogDrag(dialog);` after `document.documentElement.appendChild(dialog);` in both methods
- Line ~11172 for `showCustomCyclesMenu()`
- Line ~11526 for `showCycleEditor()`

### Add Block UX Improvement

**Issue:** Adding blocks required a popup dialog asking what type of block to add.

**Fix:** Redesigned the UI:
- Replaced popup dialog with inline dropdown + button
- Dropdown selects block type (Focus/Break) with icons
- "Add Block" button immediately adds block with selected type
- No extra clicks required

### Per-Cycle Duration Defaults

**Issue:** Block durations were hardcoded to 25/5 minutes when adding new blocks.

**Fix:** 
- Added `defaultFocusDuration` and `defaultBreakDuration` properties to custom cycle objects
- Added duration input fields in the cycle editor UI
- When "Add Block" is clicked, uses the cycle's configured duration defaults
- Values are isolated per cycle and persist when saved

### Custom Cycles Cut Break Early Support

**Issue:** "Cut Break Early" didn't work correctly with custom cycles - it used pomodoro mode logic.

**Fix:** Added `skipToNextCustomBlock()` method to `PomodoroTimer` class:
- Properly increments `currentBlockIndex` instead of `currentCycle`
- Sets up the next block's phase and duration from the custom cycle
- Handles cycle completion if no more blocks
- Updated "Cut Break Early" handler to detect custom mode and call appropriate method

---

## Bug Fixes in v1.3.1

### Distraction Dump Dialog Visibility Fix

**Issue:** The Distraction Dump button was non-functional because dialogs were created without the `active` CSS class.

**Root Cause:** In `DistractionDumpManager`:
- `showDumpConfigDialog()` created dialog with `className = 'zen-pomodoro-dialog'` but `.zen-pomodoro-dialog` has `display: none` in CSS
- `_createDumpDialog()` used `className = 'zen-pomodoro-dialog zen-pomodoro-dump-active'` but `.zen-pomodoro-dump-active` only adds `backdrop-filter`, not `display: flex`

**Fix:** Added `active` class to both dialog creation points:
- Line 10335: `className = 'zen-pomodoro-dialog active'`
- Line 10574: `className = 'zen-pomodoro-dialog active zen-pomodoro-dump-active'`

### Code Lockout Screen Alignment Fix

**Issue:** The input text box was narrower than the displayed code, and characters weren't aligned.

**Root Cause:** The code display (`.zen-pomodoro-lock-code-display`) had no border, while the input (`#zen-pomodoro-lock-code`) had a 2px border causing visual offset.

**Fix:** In `chrome.css`:
- Added `border: 2px solid transparent;` to `.zen-pomodoro-lock-code-display` for consistent box model
- Changed input to use `width: max-content; min-width: 100%;` to match display sizing

---

## Custom Cycles Feature

Custom cycles allow users to create personalized timer sequences with any combination of focus and break blocks.

### Cycle Object Structure

```javascript
{
  id: 'cycle-xxx',              // Unique identifier
  name: 'Custom Cycle',         // User-defined name
  defaultFocusDuration: 25,     // Default duration for new focus blocks (minutes)
  defaultBreakDuration: 5,      // Default duration for new break blocks (minutes)
  blocks: [                     // Array of timer blocks
    { type: 'focus', duration: 25 },
    { type: 'break', duration: 5 },
    // ... more blocks
  ]
}
```

### Key Implementation Details

- **Draggable dialogs**: Both cycle list and editor dialogs are draggable via `setupDialogDrag()`
- **Block type dropdown**: Select box with icons (🎯 Focus, ☕ Break) determines new block type
- **Per-cycle defaults**: Each cycle stores its own default durations, isolated from other cycles
- **Backward compatibility**: Cycles without `defaultFocusDuration`/`defaultBreakDuration` default to 25/5

---

## Documentation Update Reminder

**⚠️ IMPORTANT:** When making changes to this mod, remember to update these documentation files (`copilot-instructions.md` and `subagent.agent.md`) with any new classes, constants, features, or significant changes. This ensures Copilot and the subagent have accurate context for future tasks.

---

## Copilot Memory Usage

**⚠️ MANDATORY:** At the end of EVERY Copilot session that makes code changes, you MUST use the `store_memory` tool to preserve important facts learned during the session. This is not optional - failing to create memories means future sessions will repeat the same mistakes or lose valuable context.

**When to Store Memories:** After completing significant changes to this repository, use the `store_memory` tool to preserve important facts about the codebase. Memories help future Copilot sessions understand conventions, patterns, and important decisions.

**The `store_memory` Tool:** The tool is called `store_memory` and takes these parameters:
- `subject` - 1-2 word topic (e.g., "button styling", "logging throttle")
- `fact` - Clear, concise statement under 200 characters
- `citations` - File path and line numbers (e.g., "file.js:100-120")
- `reason` - 2-3 sentence explanation of why this is important
- `category` - One of: "bootstrap_and_build", "user_preferences", "general", "file_specific"

**Types of Facts to Store:**

- New coding conventions or patterns introduced
- Build/lint/test commands that work
- Important architectural decisions
- Common pitfalls or bugs to avoid
- File structure changes
- New features and their implementation details
- UI/UX patterns and color schemes
- Configuration options and their defaults

**Memory Categories:**

- `bootstrap_and_build` - How to build and test the project
- `user_preferences` - Coding style preferences
- `general` - File-independent facts about the codebase
- `file_specific` - Facts about specific files

**Example Memory Usage:**

```javascript
store_memory(
  subject: "time sorting",
  fact: "Always use numeric comparator when sorting HH:MM time strings, not lexicographic sort",
  citations: "zen-pomodoro-focus-blocker.uc.js:1901",
  reason: "Lexicographic sort causes '16:15' to sort before '9:00'. Use minutes-since-midnight comparison.",
  category: "general"
)
```

**Memory Creation Checklist (run at end of every session):**
1. What new patterns or conventions were established?
2. What bugs were fixed and what was the root cause?
3. What UI/UX decisions were made?
4. What configuration options were added or changed?
5. What validation or error handling patterns were used?
