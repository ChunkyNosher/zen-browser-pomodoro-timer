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

| Class                        | Purpose                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `PomodoroTimer`              | Core timer logic - handles countdown, phases (focus/break/transition), cycles, state persistence |
| `WorkspaceDetector`          | Detects current Zen workspace, monitors workspace changes via MutationObserver                   |
| `OverlayManager`             | Manages the workspace blocking overlay that covers content during focus                          |
| `SecurityManager`            | Handles settings access lockouts (hold-to-unlock, code entry)                                    |
| `WebsiteBlocker`             | LeechBlock-style website/keyword blocking with configurable rulesets                             |
| `SineModBlocker`             | Blocks access to `about:preferences#sineMods` during active timer                                |
| `FirstTimeReminderManager`   | Shows blocking reminder if no timer started today after configured time                          |
| `PostSessionReminderManager` | Shows reminder after idle time following timer completion                                        |
| `TransitionPhaseManager`     | Manages the "break ending soon" popup before focus resumes                                       |
| `KeyboardShortcutHandler`    | Global keyboard shortcut handling and configuration                                              |
| `LogManager`                 | Comprehensive logging with export functionality                                                  |

---

## Important Constants

```javascript
const PREF_PREFIX = 'zen-pomodoro';           // Preference key prefix
const MOD_VERSION = '1.2.3';                  // Current mod version
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
2. **Break** - Rest period, blocking disabled
3. **Transition** - 5-minute warning before break ends, blocking disabled, popup shown

---

## Reminder Systems

### First-Time Reminder (FirstTimeReminderManager)

Shows a blocking reminder if no timer has been started today after a configurable time.

- Uses periodic check (every 60 seconds) not just on init
- Triggers based on user's local time (configurable HH:MM format)
- State persisted via `Services.prefs`

### Post-Session Reminder (PostSessionReminderManager)

Shows reminder after configurable idle time following timer completion.

- Escalating skip requirements (50% longer each skip)
- Skip count persisted across browser restarts
- Focus time tracking - reminders stop after configurable focus time goal (default 2h 30min)
- Focus time resets on daily reminder time, not midnight

---

## New Configuration Options

| Option                        | Type    | Default | Description                                          |
| ----------------------------- | ------- | ------- | ---------------------------------------------------- |
| `firstTimeReminderEnabled`    | boolean | false   | Enable daily startup reminder                        |
| `firstTimeReminderTime`       | string  | '10:00' | Time in HH:MM format for daily reminder              |
| `postSessionReminderEnabled`  | boolean | true    | Enable post-session idle reminder                    |
| `postSessionIdleTime`         | number  | 45      | Minutes before first reminder after timer completion |
| `postSessionSkipCooldown`     | number  | 30      | Minutes between reminders after skip                 |
| `postSessionFocusTimeGoal`    | number  | 150     | Minutes of focus time goal (2.5 hours)               |
| `postSessionSkipMethod`       | string  | 'hold'  | Skip method: 'hold' or 'code'                        |
| `postSessionSkipHoldDuration` | number  | 20      | Seconds to hold for skip                             |
| `postSessionSkipCodeLength`   | number  | 48      | Characters to type for skip                          |
| `postSessionSkipCount`        | number  | 0       | Current skip count (runtime state)                   |
| `postSessionLastSkipTime`     | number  | null    | Last skip timestamp (runtime state)                  |

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
