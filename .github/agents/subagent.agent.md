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

| File | Description |
|------|-------------|
| `zen-pomodoro-focus-blocker.uc.js` | All JavaScript logic (~8500 lines) |
| `chrome.css` | All CSS styling (~1600 lines) |
| `theme.json` | Mod metadata for Zen Browser |
| `preferences.json` | Settings UI definitions |

## Key Classes

- `PomodoroTimer` - Timer countdown logic and phase management
- `WorkspaceDetector` - Monitors current workspace
- `OverlayManager` - Workspace blocking overlay
- `SecurityManager` - Settings lockout screens
- `WebsiteBlocker` - Website/keyword blocking
- `SineModBlocker` - Blocks mod settings access
- `FirstTimeReminderManager` - Daily startup reminder (periodic check every 60s)
- `PostSessionReminderManager` - Idle time reminder with escalating skips

## Reminder Systems

### First-Time Reminder
- Shows blocking reminder if no timer started today after configured time
- Uses periodic check (every 60 seconds) not just on init
- Triggers based on user's local time

### Post-Session Reminder
- Shows reminder after configurable idle time following timer completion
- Escalating skip requirements (50% longer each skip)
- Skip count persisted across browser restarts
- Focus time tracking - stops after focus time goal (default 2.5h)
- Focus time resets on daily reminder time, not midnight

## Important Constants

- `PREF_PREFIX = 'zen-pomodoro'`
- `MOD_VERSION = '1.2.1'`
- `DEFAULT_CONFIG` - Default settings object
- `LOCKOUT_METHODS = { CODE: 'code', HOLD: 'hold' }`

## Key Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `firstTimeReminderEnabled` | boolean | false | Enable daily startup reminder |
| `firstTimeReminderTime` | string | '10:00' | Time in HH:MM format for daily reminder |
| `postSessionReminderEnabled` | boolean | true | Enable post-session idle reminder |
| `postSessionIdleTime` | number | 45 | Minutes before first reminder |
| `postSessionSkipCooldown` | number | 30 | Minutes between reminders after skip |
| `postSessionFocusTimeGoal` | number | 150 | Focus time goal in minutes (2.5 hours) |

## Helper Functions

| Function | Purpose |
|----------|---------|
| `loadBooleanPref(prefName, config, configKey)` | Load boolean preference with validation |
| `loadPositiveIntPref(prefName, config, configKey)` | Load positive integer preference |
| `isValidTimeFormat(timeStr)` | Validate HH:MM time format |
| `validateIntegerInput(value, min, max, defaultValue)` | Validate and clamp integer input |

## Development Guidelines

1. **Always use context7 and perplexity** to look up relevant Zen Browser/Firefox documentation
2. **Update both JS and CSS** when making UI changes
3. **Never assume issues are already fixed** - if reported, investigate thoroughly
4. **Check log files** when debugging issues
5. **Use `Services.prefs`** for preference storage, not localStorage
6. **Use `textContent`** instead of `innerHTML` for security
7. **Use `crypto.getRandomValues()`** for random code generation
8. **Memory leak prevention** - always clean up event listeners in hold-to-unlock handlers

## Documentation Reminder

**⚠️ After completing your work**, remind the main agent to update documentation files (`copilot-instructions.md` and `subagent.agent.md`) if you've added new classes, constants, or significant features.
