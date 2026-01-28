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

---

## File Structure

| File                               | Purpose                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `zen-pomodoro-focus-blocker.uc.js` | Main JavaScript file containing all logic, classes, and UI components                |
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

---

## Important Constants

```javascript
const PREF_PREFIX = 'zen-pomodoro';           // Preference key prefix
const MOD_VERSION = '1.3.6';                  // Current mod version
const DEFAULT_CONFIG = { ... };               // Default configuration object
const LOCKOUT_METHODS = { CODE: 'code', HOLD: 'hold' };
const TRANSITION_PHASE_DURATION_SECONDS = 5 * 60;  // 5 minutes
const DAILY_REMINDER_STARTUP_DELAY_MS = 3 * 1000;  // 3-second delay before showing daily reminder
```

---

## Module Architecture (IIFE Pattern)

The codebase uses a modular IIFE (Immediately Invoked Function Expression) architecture for better organization:

### Core Modules

| Module      | Type        | Purpose                                                    |
| ----------- | ----------- | ---------------------------------------------------------- |
| `Constants` | Plain Object | All application constants (PREF_PREFIX, DEFAULT_CONFIG, etc.) |
| `Storage`   | IIFE        | Firefox Services.prefs operations (getPref, setPref, loadConfig, saveConfig) |
| `Utils`     | IIFE        | General utility functions (formatTime, validateIntegerInput, etc.) |

### Module Usage Pattern

```javascript
// Constants are accessed directly
const config = { ...Constants.DEFAULT_CONFIG };

// Storage module for preferences
const savedConfig = Storage.loadConfig();
Storage.saveConfig(config);

// Utils module for helpers
const timeStr = Utils.formatTime(seconds);
```

---

## Important Notes for Development

When figuring out what changes need to be made, make sure that you use context7 and perplexity while implementing the fixes and changes and also use the tools to make sure that all of
the code in the repo follows the correct format for Zen Browser mods. Make sure that you also implement the changes for both the uc.js file and the .css file.

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
| `timerRemindersEnabled`         | boolean | true               | Enable timer reminders during sessions               |
| `focusPhaseReminders`           | array   | [20, 10, 5, 1]     | Minutes before focus phase ends to show reminder     |
| `breakPhaseReminders`           | array   | [5, 1]             | Minutes before break phase ends to show reminder     |

---

## Helper Functions

| Function                                              | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `loadBooleanPref(prefName, config, configKey)`        | Load a boolean preference with validation          |
| `loadPositiveIntPref(prefName, config, configKey)`    | Load a positive integer preference with validation |
| `isValidTimeFormat(timeStr)`                          | Validate HH:MM time format                         |
| `validateIntegerInput(value, min, max, defaultValue)` | Validate and clamp integer input                   |
| `handlePauseResumeTimer()`                            | Handle pause/resume timer action from UI           |
| `handleSkipFocusWithLockout(onSkip)`                  | Skip focus to break with lockout protection        |
| `loadIntArrayPref(prefName, config, configKey)`       | Load comma-separated integer array preference      |

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

```
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
