# Zen Pomodoro Focus Blocker

Transform Zen Browser into a productivity powerhouse with customizable Pomodoro timers and workspace blocking capabilities. This mod helps you stay focused by blocking distracting workspaces during focus periods with a full-screen overlay.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.3.6-green.svg)

## ✨ Features

- ⏱️ **Flexible Timer Modes**:
  - Simple one-phase timer for quick focus sessions
  - Traditional Pomodoro cycles with focus/break periods
  - **Custom Cycles** with configurable focus/break sequences
  - Customizable long breaks every N cycles

- 🚫 **Workspace-Based Blocking**:
  - Block specific workspaces during focus periods
  - Full-screen opaque overlay prevents distractions
  - Automatically adapts when switching workspaces

- ⚙️ **Highly Customizable**:
  - Configurable timer durations (focus, break, long break)
  - Custom overlay colors for different phases
  - Personalized motivational messages
  - Security features to prevent mid-session changes

- 🔒 **Anti-Cheating Security**:
  - Settings lock with wait timer (when idle)
  - Code entry requirement during active timers

- 📱 **Responsive Design**:
  - Overlay adapts to sidebar collapse/expansion
  - Works with extension sidebars
  - Supports different screen sizes

- 🎨 **Visual Feedback**:
  - Different colors for focus, break, and long break phases
  - Persistent corner indicator shows timer status
  - Smooth phase transitions with animations

## 📦 Installation

### Via Sine Mod Manager (Recommended)

1. Install [Sine Mod Manager](https://github.com/CosmoCreeper/Sine) if you haven't already
2. Open Zen Browser Settings → Sine Mods
3. **Enable JavaScript Mods**: In Sine settings, enable "Allow Unsafe JS" to allow JavaScript mods from custom repositories
4. Click "Install from Repository"
5. Paste: `ChunkyNosher/zen-browser-pomodoro-timer`
6. Click "Install"
7. Restart Zen Browser when prompted

> **Note**: Since this mod includes JavaScript functionality (not just CSS), you must enable the "Allow Unsafe JS" option in Sine's settings for the mod to work properly. This is required for all JavaScript mods installed from custom repositories (not the official Sine store).

### Manual Installation

1. Download or clone this repository
2. Locate your Zen Browser profile folder:
   - **Windows**: `%APPDATA%\Zen\Profiles\[your-profile]\`
   - **macOS**: `~/Library/Application Support/Zen/Profiles/[your-profile]/`
   - **Linux**: `~/.zen/[your-profile]/`
3. Create the `chrome` folder if it doesn't exist
4. Copy `chrome.css` to the `chrome` folder
5. Create the `chrome/JS` folder if it doesn't exist
6. Copy `zen-pomodoro-focus-blocker.uc.js` to the `chrome/JS` folder
7. Restart Zen Browser

**Note**: When using Sine mod manager, the mod is installed in the `chrome/sine-mods/zen-pomodoro-focus-blocker/` folder. The `js` property in `theme.json` points to the JavaScript file that Sine will load.

> **Important**: This mod uses the **userChrome.js loader approach** (requires Sine's fx-autoconfig support), not the native Zen Mod Store CSS-only approach. The mod provides JavaScript functionality that goes beyond CSS theming, which is why it requires Sine's JS loading capability.

## 🚀 Usage

### Starting a Timer

1. Press **Alt+Shift+P** (or your configured keyboard shortcut) to open the Pomodoro menu
2. Click **"Start Pomodoro Timer"** to configure and start a new session
3. Choose your timer mode:
   - **Simple Timer**: Single countdown, no breaks
   - **Pomodoro Cycles**: Multiple focus/break periods
4. If Pomodoro mode, specify the number of cycles (default: 4)
5. Click **"Start Timer"**

The timer will begin immediately, and if you're on a blocked workspace, the full-screen overlay will appear.

### During a Timer Session

- **Timer Display**: Large countdown shows remaining time
- **Phase Indicator**: Shows whether you're in focus or break mode
- **Cycle Progress**: Displays current cycle number (e.g., "Cycle 2 of 4")
- **Corner Indicator**: Persistent small indicator in top-right corner
- **Keyboard Shortcut Menu**: Press the keyboard shortcut to access:
  - Pause/Resume timer
  - Stop timer (requires confirmation)
  - Timer Settings

### Switching Workspaces

- Switch to a **blocked workspace**: Overlay appears immediately
- Switch to a **non-blocked workspace**: Overlay disappears, timer continues
- This allows you to work in approved spaces while still tracking time

## ⚙️ Configuration

### Accessing Settings

1. Right-click on sidebar or workspace button
2. Select **"Timer Settings"**
3. Wait for settings lock (if configured)
4. Modify your preferences

### Available Settings

#### Timer Durations

- **Focus Duration**: Time for focus periods (default: 25 minutes)
  - Range: 1-120 minutes
- **Break Duration**: Time for short breaks (default: 5 minutes)
  - Range: 1-30 minutes
- **Long Break Duration**: Time for extended breaks (default: 15 minutes)
  - Range: 5-60 minutes
- **Long Break Interval**: Cycles between long breaks (default: every 4 cycles)

#### Overlay Customization

- **Overlay Color**: Background color during blocking
  - Default: `#808080` (medium gray)
  - Focus: `#2180cd` (blue)
  - Break: `#2ec491` (green)
- **Motivational Message**: Text displayed on overlay
  - Default: "Get back to work."
  - Examples: "Stay focused!", "You got this!", "Focus mode activated"

#### Workspace Selection

- Choose which workspaces should be blocked during timers
- Unblocked workspaces remain accessible during focus periods
- Changes take effect on next timer start

#### Security Features

- **Settings Lock (Idle)**: Wait time before accessing settings when no timer is active
  - Default: 20 seconds
  - Range: 5-300 seconds
  - Prevents quick settings changes
- **Settings Lock (Active)**: Code entry required during active timer
  - Default: 64 character code
  - Range: 8-128 characters
  - Character sets: alphanumeric or all typeable characters
  - Prevents cheating mid-session

#### Notifications

- **Enable Notifications**: Show phase change alerts
- **Enable Audio Alerts**: Play sound on phase transitions (requires audio file)

## 🔧 Advanced Configuration

For power users, settings are stored in Firefox preferences under the `zen-pomodoro` namespace. You can manually edit these via `about:config`:

```
zen-pomodoro.config - JSON configuration object
zen-pomodoro.timer-state - Current timer state (for crash recovery)
```

### Configuration JSON Structure

```json
{
  "timerMode": "pomodoro",
  "simpleDuration": 25,
  "focusDuration": 25,
  "breakDuration": 5,
  "longBreakDuration": 15,
  "longBreakInterval": 4,
  "cycles": 4,
  "blockedWorkspaces": ["workspace-uuid-1", "workspace-uuid-2"],
  "overlayColor": "#808080",
  "motivationalMessage": "Get back to work.",
  "settingsLockIdleMethod": "hold",
  "settingsLockActiveMethod": "code",
  "settingsLockIdleHoldDuration": 10,
  "settingsLockActiveHoldDuration": 25,
  "settingsLockIdleCodeLength": 48,
  "settingsLockActiveCodeLength": 96,
  "settingsLockActiveCharacterSet": "all-typeable",
  "enableNotifications": true,
  "enableAudioAlerts": false
}
```

## 🎯 Use Cases

### Focused Work Sessions

Block social media or entertainment workspaces while working on important tasks. Set a 25-minute focus period with 5-minute breaks.

### Deep Work Marathons

Use extended focus periods (50-90 minutes) with longer breaks (15-20 minutes) for complex projects requiring sustained concentration.

### Time-Boxed Learning

Block all non-educational workspaces during study sessions. Use Pomodoro cycles to maintain engagement while learning new material.

### Meeting Preparation

Set a simple timer for 15 minutes to prepare for meetings without getting distracted by other browser tabs.

## 🐛 Troubleshooting

### Overlay Not Appearing

**Issue**: Timer starts but no overlay appears

**Solutions**:

1. Verify the current workspace is marked as "blocked" in settings
2. Clear Zen Browser startup cache:
   - Navigate to `about:support`
   - Click "Clear Startup Cache"
   - Restart browser
3. Check browser console for JavaScript errors (F12 → Console)
4. Ensure `zen-pomodoro-focus-blocker.uc.js` is in the `chrome/JS` folder and `chrome.css` is in the `chrome` folder

### Timer Inaccuracy

**Issue**: Timer doesn't count down accurately

**Solutions**:

1. Verify system clock is correct
2. Check for high CPU usage from other processes
3. Close unnecessary browser tabs/extensions
4. Report issue on GitHub with details

### Settings Not Persisting

**Issue**: Configuration changes don't save after browser restart

**Solutions**:

1. Check Firefox preferences: `about:config` → search for `zen-pomodoro`
2. Verify write permissions for profile directory
3. Try manually saving config via browser console:
   ```javascript
   Services.prefs.setCharPref('zen-pomodoro.config', JSON.stringify({...}))
   ```
4. Check for conflicting mods or extensions

### Keyboard Shortcut Not Working

**Issue**: Pressing Alt+Shift+P doesn't open the Pomodoro menu

**Solutions**:

1. Verify `zen-pomodoro-focus-blocker.uc.js` is loaded (check browser console on startup)
2. Check if another extension or mod is using the same shortcut
3. Configure a different shortcut in the mod settings
4. Restart browser completely after changing settings
5. Check for JavaScript errors in console

### Overlay Covers Everything

**Issue**: Can't access any workspace during timer

**Solutions**:

- This is intended behavior for blocked workspaces during focus periods
- Switch to a non-blocked workspace to continue other work
- Stop the timer if you need immediate access (requires confirmation)
- Configure which workspaces should be blocked in settings before starting timer

## 🔐 Privacy & Security

### Data Storage

- All configuration stored locally using Firefox Services.prefs
- No data transmitted to external servers
- No tracking or analytics
- Timer state saved to recover from browser crashes

### Security Features

- Settings locks prevent unauthorized configuration changes
- Code generation uses cryptographically secure random values

### Limitations

- **Browser-Level Only**: Blocking works only within Zen Browser. Users can open other browsers.
- **Developer Tools Access**: Users with DevTools knowledge could theoretically bypass the overlay.
- **Single Timer Per Window**: One active timer per browser window (multiple windows can have independent timers).
- **Workspace-Specific**: Blocking is per-workspace, not per-window.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

### Development Setup

1. Clone the repository
2. Make changes to `zen-pomodoro-focus-blocker.uc.js` or `chrome.css`
3. Test in Zen Browser by copying files to your profile chrome folder
4. Submit a pull request with clear description of changes

### Reporting Issues

When reporting bugs, please include:

- Zen Browser version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Browser console errors (if any)

## 📜 License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) file for full details.

## 🙏 Acknowledgments

- **Zen Browser Team**: For creating an amazing browser
- **Sine Mod Manager**: For making mod installation seamless
- **Pomodoro Technique**: Francesco Cirillo's time management method
- **Contributors**: Everyone who helps improve this mod

## 📞 Support

- 📝 **Report Bugs**: [GitHub Issues](https://github.com/ChunkyNosher/zen-browser-pomodoro-timer/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ChunkyNosher/zen-browser-pomodoro-timer/discussions)
- 🌐 **Zen Browser Community**: [Zen Browser Website](https://zen-browser.app/)

## 📊 Changelog

### Version 1.3.6

- ✅ Fixed "Cut Break Early" button not working during transition phase (added custom mode support)
- ✅ Fixed code lock screen character alignment issue (first character now perfectly aligned)
- ✅ Fixed Copilot setup workflow (added cache-dependency-path and changed to npm install)
- ✨ New: Custom Cycles block duplication with Alt+Drag (works with single and multi-selected blocks)
- ✨ New: Custom Cycles multi-select with Shift+Click (select multiple blocks, blue border highlight)
- ✨ New: Custom Cycles multi-select operations (move, duplicate, and delete multiple blocks together)
- 🔧 Removed duplicate settings from preferences.json (now only in internal settings menu)

### Version 1.3.5

- ✅ Fixed Distraction Dump bug - blocked workspaces now properly unblocked during dump
- ✅ Fixed code lockout screen character alignment (perfect left-padding alignment)
- ✅ Fixed transition phase pause bug - workspaces now blocked when pausing during transition
- 🔧 Fixed copilot-setup-steps.yml workflow (added missing checkout and setup-node steps)
- 📝 Updated documentation with v1.3.5 changes

### Version 1.3.4

- ✅ Fixed code lockout screen font size (input now matches displayed code size)
- ✅ Improved Distraction Dump UX - button changes to "End Dump Early" when dump is active
- ✨ New "Skip Focus" feature - skip to break early with lockscreen protection
- ✅ Supports regular Pomodoro, simple, and custom cycle modes
- 📝 Updated documentation with v1.3.4 changes

### Version 1.3.2

- ✅ Fixed code lockout screen UI alignment (input matches code display width)
- ✅ Fixed Distraction Dump timer resume bug (can't resume during dump)
- ✅ Replaced large Distraction Dump dialog with small indicator
- ✅ Made Daily and Post-Session reminders mutually exclusive
- ✅ Added Custom Pomodoro Cycles feature with drag-and-drop block editor

### Version 1.0.0 (Initial Release)

- ✅ Simple and Pomodoro timer modes
- ✅ Full-screen workspace blocking overlay
- ✅ Customizable timer durations
- ✅ Phase-specific overlay colors
- ✅ Persistent corner indicator
- ✅ Settings lock mechanisms
- ✅ Responsive design
- ✅ Context menu integration
- ✅ Configuration persistence

---

**Built with ❤️ for productivity and focus**
