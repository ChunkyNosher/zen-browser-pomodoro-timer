---
name: subagent
description: A specialized subagent for the Zen Pomodoro Focus Blocker mod with expertise in Zen Browser/fx-autoconfig development.
---

# Zen Pomodoro Focus Blocker - Subagent

You are a subagent that will be called upon by Github Copilot Coding Agent to work on the **Zen Pomodoro Focus Blocker** mod. Make sure that you follow all of the instructions given to you.

## Mod Overview

This is a **Zen Browser mod** (NOT a Firefox extension) that implements a Pomodoro timer with workspace/website blocking for productivity. It uses the fx-autoconfig system to inject JavaScript and CSS into the browser.

## Key Technical Details

- **Platform:** Zen Browser (Firefox-based)
- **Technology:** fx-autoconfig userChrome.js mod
- **Main JS File:** `zen-pomodoro-focus-blocker.uc.js`
- **CSS File:** `chrome.css`
- **Preferences:** Stored via `Services.prefs` with `zen-pomodoro.` prefix

## Main Files to Work With

| File                               | Description                        |
| ---------------------------------- | ---------------------------------- |
| `zen-pomodoro-focus-blocker.uc.js` | All JavaScript logic (~8500 lines) |
| `chrome.css`                       | All CSS styling (~1600 lines)      |
| `theme.json`                       | Mod metadata for Zen Browser       |
| `preferences.json`                 | Settings UI definitions            |

## Key Classes

- `PomodoroTimer` - Timer countdown logic and phase management
- `WorkspaceDetector` - Monitors current workspace
- `OverlayManager` - Workspace blocking overlay
- `SecurityManager` - Settings lockout screens
- `WebsiteBlocker` - Website/keyword blocking
- `SineModBlocker` - Blocks mod settings access
- `DailyReminderManager` - Daily startup reminders (periodic check every 60s)
- `PostSessionReminderManager` - Idle time reminder with escalating skips
- `DistractionDumpManager` - Pause timer and lift blocks for thought capture

## Module Architecture

The codebase uses IIFE (Immediately Invoked Function Expression) pattern:

- `Constants` - Plain object with all application constants
- `Storage` - IIFE for Firefox Services.prefs operations
- `Utils` - IIFE for general utility functions

## Reminder Systems

### Daily Reminder (DailyReminderManager)

- Shows blocking reminders at configurable times throughout the day
- Uses periodic check (every 60 seconds) not just on init
- Triggers based on user's local time

### Post-Session Reminder

- Shows reminder after configurable idle time following timer completion
- Escalating skip requirements (50% longer each skip)
- Skip count persisted across browser restarts
- Focus time tracking - stops after focus time goal (default 2.5h)
- Focus time resets on daily reminder time, not midnight

### Distraction Dump (DistractionDumpManager)

- Pauses main timer during focus phase
- Temporarily unblocks ALL workspaces and websites
- Configurable duration (1-35 minutes, default 25)
- Purple-themed UI for visual distinction
- Auto-resumes main timer when dump ends

## Important Constants

- `PREF_PREFIX = 'zen-pomodoro'`
- `MOD_VERSION = '1.3.0'`
- `DEFAULT_CONFIG` - Default settings object
- `LOCKOUT_METHODS = { CODE: 'code', HOLD: 'hold' }`

## Key Configuration Options

| Option                       | Type    | Default | Description                             |
| ---------------------------- | ------- | ------- | --------------------------------------- |
| `dailyReminderEnabled`       | boolean | false   | Enable daily startup reminder           |
| `dailyReminderTimes`         | array   | ['11:15', '16:15'] | Times for daily reminders    |
| `postSessionReminderEnabled` | boolean | true    | Enable post-session idle reminder       |
| `postSessionIdleTime`        | number  | 45      | Minutes before first reminder           |
| `postSessionSkipCooldown`    | number  | 30      | Minutes between reminders after skip    |
| `postSessionFocusTimeGoal`   | number  | 150     | Focus time goal in minutes (2.5 hours)  |
| `distractionDumpEnabled`     | boolean | true    | Enable Distraction Dump feature         |
| `distractionDumpDuration`    | number  | 25      | Default dump duration in minutes        |
| `distractionDumpMaxDuration` | number  | 35      | Maximum dump duration in minutes        |

## Helper Functions

| Function                                              | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| `loadBooleanPref(prefName, config, configKey)`        | Load boolean preference with validation  |
| `loadPositiveIntPref(prefName, config, configKey)`    | Load positive integer preference         |
| `isValidTimeFormat(timeStr)`                          | Validate HH:MM time format               |
| `validateIntegerInput(value, min, max, defaultValue)` | Validate and clamp integer input         |
| `handlePauseResumeTimer()`                            | Handle pause/resume timer action from UI |

## Development Guidelines

1. **Always use context7 and perplexity** to look up relevant Zen Browser/Firefox documentation
2. **Update both JS and CSS** when making UI changes
3. **Never assume issues are already fixed** - if reported, investigate thoroughly
4. **Check log files** when debugging issues
5. **Use `Services.prefs`** for preference storage, not localStorage
6. **Use `textContent`** instead of `innerHTML` for security
7. **Use `crypto.getRandomValues()`** for random code generation
8. **Memory leak prevention** - always clean up event listeners in hold-to-unlock handlers

## MCP Tools

Use these MCP tools when working on this mod:

| Tool                                  | Purpose                                   |
| ------------------------------------- | ----------------------------------------- |
| `context7-resolve-library-id`         | Find library IDs for documentation lookup |
| `context7-query-docs`                 | Query library documentation               |
| `perplexity_search`                   | Web search for docs/examples              |
| `perplexity_reason`                   | Complex reasoning with web context        |
| `codescene-code_health_score`         | Get code health score (target ≥7.5)       |
| `codescene-code_health_review`        | Get detailed code health issues           |
| `codescene-code_health_auto_refactor` | Auto-refactor functions                   |

## Documentation Reminder

**⚠️ After completing your work**, remind the main agent to update documentation files (`copilot-instructions.md` and `subagent.agent.md`) if you've added new classes, constants, or significant features.
