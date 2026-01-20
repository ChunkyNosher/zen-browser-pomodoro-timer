# GitHub Copilot Instructions for zen-browser-pomodoro-timer

## Mod Overview

The **Zen Pomodoro Focus Blocker** is a productivity mod for Zen Browser (based on Firefox/fx-autoconfig) that implements a customizable Pomodoro timer with workspace blocking capabilities. It helps users maintain focus by blocking access to specified workspaces and websites during focus sessions while allowing breaks between sessions.

**Key Features:**

- Customizable Pomodoro and simple timer modes
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

---

## Important Constants

```javascript
const PREF_PREFIX = 'zen-pomodoro';           // Preference key prefix
const MOD_VERSION = '1.2.10';                  // Current mod version
const DEFAULT_CONFIG = { ... };               // Default configuration object
const LOCKOUT_METHODS = { CODE: 'code', HOLD: 'hold' };
const TRANSITION_PHASE_DURATION_SECONDS = 5 * 60;  // 5 minutes
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

---

## Helper Functions

| Function                                              | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `loadBooleanPref(prefName, config, configKey)`        | Load a boolean preference with validation          |
| `loadPositiveIntPref(prefName, config, configKey)`    | Load a positive integer preference with validation |
| `isValidTimeFormat(timeStr)`                          | Validate HH:MM time format                         |
| `validateIntegerInput(value, min, max, defaultValue)` | Validate and clamp integer input                   |
| `handlePauseResumeTimer()`                            | Handle pause/resume timer action from UI           |

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
