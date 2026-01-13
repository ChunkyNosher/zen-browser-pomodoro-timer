# Zen Browser Pomodoro Focus Blocker Mod - Comprehensive Development Plan

**For GitHub Copilot: This is a detailed specification for building a productivity-focused Zen Browser mod that implements a customizable Pomodoro timer with workspace blocking capabilities.**

---

## Project Overview

This mod transforms Zen Browser into a powerful productivity tool by implementing a Pomodoro-style timer that blocks access to specified workspaces during focus periods. Users can customize timer phases, durations, cycle counts, and implement security measures to prevent mid-session setting changes.

### Core Value Proposition

- **Workspace-Based Focus Blocking**: Only blocks the workspaces the user designates, allowing work to continue in other spaces
- **Flexible Timer Modes**: Supports both simple one-phase timers and traditional Pomodoro cycles with focus/break periods
- **Anti-Cheating Security**: Implements robust protection against circumventing the timer through forced delays or complex unlock codes
- **Responsive UI**: Full-screen overlay adapts dynamically to browser UI changes (sidebar collapse/expansion, extension sidebars)
- **User-Centric Configuration**: Extensive customization of all time durations, cycle counts, colors, and security parameters

---

## Architecture Overview

### Zen Browser Mod Structure

Zen Browser mods operate within Firefox's XUL/XHTML framework and use a modular architecture:

#### File Structure Required

```
mod-folder/
├── userChrome.uc.mjs       (Main JavaScript controller)
├── chrome.css              (Styling for overlay and UI components)
├── manifest.json           (Mod metadata - name, version, description)
└── [OPTIONAL] locale/      (Localization files if needed)
```

#### Key Zen Browser Concepts

**Workspaces**: Zen implements workspaces as distinct browser contexts, each with a unique UUID stored as the `zen-workspace-id` attribute on DOM elements. The currently active workspace has the `active="true"` attribute.

**Mod Context**: Mods run in the privileged browser chrome context (not web content), granting access to:

- Full DOM manipulation of browser UI elements
- Firefox Services API (Services.prefs for persistent storage)
- XUL/XHTML elements and events
- No Content Security Policy restrictions

**CSS Integration**: Zen mods support both static CSS files and dynamic CSS injection via JavaScript. CSS selectors can target workspace elements using attribute selectors like `toolbarbutton[zen-workspace-id="specific-uuid"]`.

**Context Menus**: Custom context menu items are added via JavaScript event listeners targeting right-click events on specific elements. Zen Browser's context menu system integrates with Firefox's native menu infrastructure.

#### Firefox Services API

The mod will use `Services.prefs` for persistent configuration storage:

- String preferences for serialized JSON configurations
- Boolean preferences for feature toggles
- Character preferences for individual settings

Example: `Services.prefs.setCharPref("zen-pomodoro.config", JSON.stringify(config))`

---

## Feature Specifications

### 1. Timer Initiation System

#### Context Menu Integration

The user should be able to start the timer from multiple right-click context menu locations:

- **Sidebar Right-Click**: When right-clicking on the empty sidebar area (avoiding tabs/icons)
- **Workspace Icon Right-Click**: When right-clicking on workspace buttons at the bottom of the sidebar
- **Global Context Menu**: Ideally available on any right-click throughout the browser UI

Implementation approach:

- Listen for 'contextmenu' events on relevant DOM elements
- Create custom menu items using JavaScript (or modify existing menus if using extensions)
- Store event listeners on elements like `zen-workspace-icons` container and sidebar areas

#### Timer Mode Selection

When timer is initiated, present user with two mode options:

**Mode 1: Simple Timer**

- Single countdown phase
- Timer starts immediately and ends after duration expires
- No automatic restart or break periods
- User must manually start another timer

**Mode 2: Pomodoro Timer** (Recommended)

- Multiple configurable cycles consisting of:
  - **Focus Period**: Primary work time (default 25 minutes, customizable)
  - **Break Period**: Recovery time (default 5 minutes, customizable)
  - **Long Break** (Optional): Extended break every N cycles (default every 4 cycles, 15 minutes)
- Automatic cycling between phases for specified number of iterations
- Audible/visual notification at phase transitions
- Display indicating which phase is currently active

#### UI for Timer Configuration

Show a quick-config dialog when timer starts:

- Timer mode selection (Simple vs Pomodoro)
- For Pomodoro: number of cycles to run
- Option to use saved settings or customize on-the-fly
- Start/Cancel buttons

---

### 2. Workspace Blocking System

#### Overlay Implementation

When timer is active and user is on a blocked workspace:

- **Full-Screen Coverage**: CSS overlay must cover 100% of browser viewport
  - Position: fixed
  - Width/Height: 100%
  - Top/Left: 0
  - Z-index: Very high (9999 or higher) to sit above all content
  - Background: Non-transparent solid color (default gray, customizable)
  - Pointer-events: all (to capture all mouse/touch events)
  - Overflow: hidden (to prevent scrolling)

- **No Content Visibility**: Overlay must be completely opaque - no website content visible behind it
  - Background color must be solid, not transparent
  - Cannot use transparency or blur effects that reveal content

- **Time Display**: Center text showing remaining time
  - Format: "MM:SS" or "M:SS" with large, readable font
  - Update every second in real-time
  - Color: High contrast against overlay background

- **Motivational Message**: Display text like "Get back to work." above or below timer
  - Should be customizable by user
  - Default message encouraging focus

#### Responsive Sizing

The overlay must adapt dynamically to UI changes:

- **Sidebar Toggle**: When user collapses/expands Zen's sidebar, overlay resizes accordingly
- **Extension Sidebars**: When Firefox extensions (like Sidebery, Tab Groups) open their own sidebars, overlay adjusts
- **Implementation**: Use ResizeObserver or MutationObserver on document.documentElement to detect layout changes and recalculate overlay dimensions

#### Workspace-Specific Blocking

- User configures which workspaces trigger the blocking overlay
- When user switches to a non-blocked workspace, overlay disappears immediately
- When user switches to a blocked workspace with active timer, overlay reappears
- Workspace detection via `zen-workspace-icons toolbarbutton[active="true"][zen-workspace-id]` query

#### Block Enforcement

During active blocking:

- Prevent tab opening: Intercept new tab requests
- Prevent navigation: Intercept address bar input
- Prevent shortcuts: Disable keyboard shortcuts that would open new pages
- Prevent clicking: All pointer events intercepted by overlay
- Prevent scrolling: Body overflow hidden

---

### 3. Timer Display and Controls

#### Persistent Timer Indicator

While timer is active, display persistent indicator:

- In toolbar or corner of screen
- Shows current phase (if Pomodoro mode): "Focus: 15:23" or "Break: 3:47"
- Shows cycle progress (if Pomodoro mode): "Cycle 2/4"
- Clickable to bring overlay to focus (if user switches workspaces)
- Visual indication of timer status (colors change between focus/break phases)

#### In-Overlay Information

Within the full-screen overlay:

- Large, readable countdown timer (MM:SS format)
- Current phase label ("Focus Period" vs "Break Time")
- Cycle progress if Pomodoro ("Cycle 2 of 4")
- Motivational message
- Optional: pause/cancel button (with confirmation)

#### Notifications

At phase transitions:

- Visual notification (overlay changes color/styling)
- Optional audible alert (notification sound)
- Optional: Desktop notification (if enabled in settings)

---

### 4. Settings and Configuration

#### User Preference Storage

All settings persisted using Firefox Services.prefs in JSON format:

Core settings include:

- `zen-pomodoro.timer-mode` - "simple" or "pomodoro"
- `zen-pomodoro.simple-duration` - Minutes for simple timer
- `zen-pomodoro.focus-duration` - Minutes for focus period
- `zen-pomodoro.break-duration` - Minutes for break period
- `zen-pomodoro.cycles` - Number of pomodoro cycles
- `zen-pomodoro.blocked-workspaces` - Array of workspace UUIDs to block
- `zen-pomodoro.overlay-color` - CSS color value
- `zen-pomodoro.overlay-opacity` - Opacity 0-1
- `zen-pomodoro.motivational-message` - Custom text
- `zen-pomodoro.enabled` - Global on/off toggle

#### Settings Menu Access Protection

Implement dual security systems for accessing settings:

**System 1: Waiting Period (Used when timer NOT running)**

- User configures wait duration (default: 20 seconds, customizable 5-300 seconds)
- When accessing settings, show countdown timer
- User must wait full duration before settings unlock
- Cannot skip or cancel wait

**System 2: Code Entry (Used when timer IS running)**

- User configures code length (default: 64 characters, configurable 8-128 characters)
- User configures character set: "alphanumeric" or "all-typeable-characters"
- When accessing settings during active timer, generate random code and display it
- User must type exact code to unlock settings
- Failed attempts show error, resets code
- Optional: Rate limit attempts (max 5 per minute)

Settings interface allows separate configuration for:

- `zen-pomodoro.settings-lock-idle` - Lock when timer not running (wait time)
- `zen-pomodoro.settings-lock-active` - Lock when timer running (code config)
- `zen-pomodoro.max-code-length` - Maximum characters in unlock code (128)
- `zen-pomodoro.code-character-set` - "alphanumeric" or "all-typeable"

#### Timer Start Lock Feature

**Special Protection for Starting Timers**: User can implement an additional hold-to-start mechanism:

- When initiating new timer, display a large button labeled "Hold to Start"
- User must hold down mouse button continuously for configurable duration (default 3 seconds)
- If user releases mouse at any point, counter resets to 0
- Prevents accidental/impulsive timer starts
- Visual progress indicator showing hold progress

Configuration: `zen-pomodoro.hold-to-start-duration` (milliseconds)

---

### 5. Advanced Features

#### Phase Transition Handlers

- Audio notification option (customizable sound file or system default)
- Browser notification (if permissions granted)
- Color change in overlay (focus = energizing color, break = calming color)
- Visual "pulse" animation at transition

#### Statistics and Logging

Optional tracking of:

- Total focus time completed today
- Number of cycles completed
- Interruptions (timer cancelled mid-session)
- Most productive workspace
- Statistics panel in settings

#### Integration with Other Zen Features

- Does not interfere with Zen's workspace switching
- Compatible with Zen's tab management
- Compatible with Zen's sidebar modifications
- Respects Zen's theme preferences (for styling consistency)

#### Emergency Bypass

Allow user to configure emergency bypass (with warning):

- "Force Stop" function available even during blocking
- Requires both: (1) Confirming choice, (2) Successfully entering override code
- Logs emergency stops for accountability
- Not recommended for serious focus sessions

---

## UI/UX Design Specifications

### Visual Hierarchy and Layout

#### Timer Initiation Dialog

- Modal dialog overlaying browser UI
- Title: "Start Pomodoro Timer"
- Content:
  - Radio buttons or toggle for mode selection
  - If Pomodoro selected: Input field for cycle count
  - Option to customize: "Use Custom Settings" toggle
  - If custom: Expandable section showing focus duration, break duration, etc.
  - "Start Timer" and "Cancel" buttons

#### Full-Screen Overlay

- Solid background color (default: medium gray RGB 128,128,128, customizable)
- Content centered both horizontally and vertically
- Content box includes:
  - Large countdown timer (font-size: 80-120px, monospace font)
  - Phase label (font-size: 32px)
  - Cycle progress indicator (font-size: 24px)
  - Motivational message (font-size: 20px)
  - Optional pause/cancel button (small, bottom of content)

#### Persistent Indicator

- Location: Fixed to top-right or top-left corner
- Size: Compact (approximately 200px width)
- Content: "Focus: MM:SS | Cycle N/N"
- Background: Semi-transparent dark overlay
- Clickable to bring full overlay to foreground

### Color Schemes

- Focus phase: Bold, energizing color (default: deep blue or vibrant color)
- Break phase: Calm, restful color (default: soft green or warm neutral)
- Text: High contrast white or black based on background
- All customizable via settings panel

### Accessibility Considerations

- High contrast ratio for all text
- Large readable fonts
- Keyboard accessible settings
- Audio cues for phase transitions (not just visual)
- Option to disable animations for motion-sensitive users

---

## Technical Implementation Details

### Core Modules

**1. Timer Engine Module** (`timerEngine.js` or embedded in userChrome.uc.mjs)

- Manages countdown logic
- Handles phase transitions
- Emits events for UI updates
- Persists timer state to recover from crashes

**2. Workspace Detector Module**

- Queries DOM for active workspace
- Listens to workspace change events
- Determines if current workspace should be blocked
- Notifies timer engine of workspace changes

**3. Overlay Manager Module**

- Creates and manages full-screen overlay element
- Updates timer display every 1000ms (or more frequently if needed)
- Handles responsive resizing via ResizeObserver
- Manages pointer-events and click interception
- Applies CSS styling dynamically

**4. Context Menu Module**

- Injects context menu items on page load
- Handles right-click event listeners
- Triggers timer initialization UI
- Manages settings access dialog

**5. Settings Manager Module**

- Reads/writes to Services.prefs
- Provides validation for user inputs
- Handles settings lock mechanisms (wait and code)
- Exposes settings UI

**6. Security Module**

- Generates random codes for unlock mechanism
- Validates unlock attempts
- Manages rate limiting
- Handles hold-to-start button logic

### Event Flow Architecture

```
User Right-Click on Workspace
    ↓
Context Menu Listener Triggered
    ↓
Timer Initialization Dialog Shown
    ↓
User Selects Timer Mode/Duration
    ↓
Timer Engine Initialized
    ↓
Overlay Created and Made Fullscreen
    ↓
Every 1000ms: Timer Decrements, UI Updates
    ↓
User Switches Workspace
    ↓
Workspace Detector Checks if Blocked
    ↓
If Blocked: Overlay Shows | If Not Blocked: Overlay Hides
    ↓
Phase Transition Occurs
    ↓
Notification Triggered, UI Updated
    ↓
Timer Completes or User Cancels
    ↓
Overlay Removed, Timer Engine Reset
```

### CSS Architecture

**chrome.css** structure:

- Root variables for colors, dimensions, timing
- Overlay element styles (position fixed, fullscreen, pointer-events all)
- Overlay content styling (centered, large fonts)
- Timer display styling (monospace, large font sizes)
- Context menu styling (if custom menu)
- Animations (fade-in, color transitions for phase changes)
- Responsive breakpoints for different screen sizes

---

## Implementation Sequence and Milestones

### Phase 1: Core Timer Engine (Priority: Critical)

- Implement countdown logic
- Support both simple and Pomodoro modes
- Persist timer state
- Test countdown accuracy

### Phase 2: Workspace Detection (Priority: Critical)

- Query active workspace UUID
- Listen to workspace change events
- Detect blocked vs non-blocked workspaces
- Test workspace switching behavior

### Phase 3: Full-Screen Overlay (Priority: Critical)

- Create overlay DOM element
- Apply fullscreen CSS
- Display timer countdown
- Handle pointer-events blocking
- Test click/scroll blocking

### Phase 4: Context Menu Integration (Priority: High)

- Inject context menu items
- Create timer initialization dialog
- Handle mode selection
- Test menu availability across different areas

### Phase 5: Settings System (Priority: High)

- Implement Services.prefs storage
- Create settings UI
- Handle workspace selection for blocking
- Test settings persistence

### Phase 6: Security Features (Priority: Medium)

- Implement settings lock wait timer
- Implement unlock code system
- Add hold-to-start mechanism
- Test security bypass resistance

### Phase 7: Responsive UI (Priority: Medium)

- Implement ResizeObserver for layout changes
- Test with sidebar collapsed/expanded
- Test with extension sidebars
- Test on different screen resolutions

### Phase 8: Polish and Refinement (Priority: Low)

- Add notifications (audio/visual)
- Implement theme colors
- Optimize performance
- Add error handling and edge case management

---

## Testing Considerations

### Functional Testing

- Timer counts down accurately (compare with system clock)
- Workspace blocking engages/disengages correctly
- Overlay blocks all clicks and navigation
- Settings persist across browser restarts
- Security locks function as designed

### Integration Testing

- No interference with Zen's core functionality
- Compatible with other mods
- Works across multiple windows
- Handles rapid workspace switching

### Edge Cases

- Timer running when browser closes (recovery)
- Settings access while timer active
- Workspace deletion during active timer
- Multiple rapid timer starts
- Very large/small overlay sizes

### Performance Testing

- Memory usage during active timer
- CPU usage for countdown updates
- DOM query efficiency for workspace detection
- ResizeObserver callback frequency

---

## Configuration File Structure (manifest.json)

```json
{
  "name": "Zen Pomodoro Focus Blocker",
  "version": "1.0.0",
  "description": "A productivity mod that implements customizable Pomodoro timers with workspace blocking",
  "author": "[Your Name]",
  "license": "MPL-2.0",
  "icon": "path/to/icon.png",
  "url": "https://github.com/[user]/zen-pomodoro-blocker"
}
```

---

## Default Configuration Values

These should be set as defaults when mod is first loaded:

```
Timer Modes:
- simple-duration: 25 minutes
- focus-duration: 25 minutes
- break-duration: 5 minutes
- long-break-duration: 15 minutes
- long-break-interval: 4 cycles

UI/UX:
- overlay-color: #808080 (medium gray)
- overlay-opacity: 0.95
- motivational-message: "Get back to work."
- timer-font-size: 96px

Security:
- settings-lock-idle-mode: "wait"
- settings-lock-idle-duration: 20 seconds
- settings-lock-active-mode: "code"
- settings-lock-active-code-length: 64
- settings-lock-active-character-set: "all-typeable"
- hold-to-start-duration: 3000ms

Features:
- enable-notifications: true
- enable-audio-alerts: true
- enable-desktop-notifications: false
- blocked-workspaces: [] (empty by default)

Logging:
- enable-statistics: false
```

---

## Known Limitations and Design Decisions

1. **Browser-Level Only**: This mod operates within Zen Browser only. It cannot prevent user from opening a different browser.

2. **Overlay-Based Blocking**: The blocking mechanism is presentation-level (CSS overlay) not application-level. A user with developer tools access could theoretically inspect and remove the overlay, though the mod can detect and restore it.

3. **Workspace-Specific Only**: Blocking is per-workspace, not per-window. A determined user could open a new window and switch to an unblocked workspace.

4. **No System-Level Integration**: The mod cannot prevent system-level activities or other applications. It only affects Zen Browser behavior.

5. **Single Timer Per Window**: The mod supports one active timer per browser window. Multiple windows can have independent timers.

6. **Break Period Still Blocks**: If user configures settings to block workspaces during Pomodoro breaks, they won't be able to access those workspaces. This is intentional design - breaks are meant to be away from specific work contexts.

---

## Deliverables and Success Criteria

### Core Deliverables

- ✅ userChrome.uc.mjs with full functionality
- ✅ chrome.css with complete styling
- ✅ manifest.json with proper metadata
- ✅ README with usage instructions
- ✅ Settings documentation

### Success Criteria

- Timer counts down accurately to within 100ms
- Overlay successfully blocks 100% of clicks/interactions
- Settings persist across browser restarts
- Workspace detection works reliably
- Security locks prevent settings access as designed
- No noticeable performance impact on browser

### Optional Enhancements

- Statistics dashboard showing daily stats
- Theme presets (dark, light, custom)
- Sound file customization
- Keyboard shortcuts for common actions
- Integration with Zen's existing status bar

---

## Repository Structure Recommendation

```
zen-pomodoro-blocker/
├── README.md                    (User-facing documentation)
├── DEVELOPMENT.md              (This file - for developers)
├── theme.json                  (Mod metadata)
├── userChrome.uc.mjs           (Main mod logic)
├── chrome.css                  (Styling)
├── LICENSE                     (MPL-2.0 recommended)
├── docs/
│   ├── CONFIGURATION.md        (Settings explanation)
│   ├── USAGE.md               (How to use the mod)
│   └── TROUBLESHOOTING.md     (Common issues)
└── examples/
    ├── custom-colors.json     (Example color configuration)
    └── strict-mode-settings.json (Example security settings)
```

---

## Notes for GitHub Copilot

This plan intentionally avoids specific code blocks to allow for flexible implementation. Key areas Copilot should focus on:

1. **Accuracy**: Timer countdown must be precise. Use high-resolution timers where possible.

2. **DOM Manipulation**: Workspace detection requires reliable DOM querying. Test multiple approaches.

3. **CSS Responsiveness**: Overlay must adapt to all UI changes. ResizeObserver is likely the best solution.

4. **Event Handling**: Context menu integration may require testing with different Firefox versions.

5. **Security**: Lock mechanisms must be difficult to bypass but not frustrating for legitimate users.

6. **Performance**: Real-time countdown updates (every 1000ms) should not impact browser performance.

When in doubt, prioritize user experience and security over feature complexity. A simple, reliable implementation is better than a feature-rich but buggy one.

Good luck with development! This will be a powerful productivity tool for Zen Browser users.
