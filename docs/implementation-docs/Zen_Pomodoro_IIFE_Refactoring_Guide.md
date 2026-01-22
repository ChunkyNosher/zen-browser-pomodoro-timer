# Zen Pomodoro Focus Blocker - IIFE Refactoring Guide for GitHub Copilot

## Executive Summary

Refactor `zen-pomodoro-focus-blocker.uc.js` (385KB) into modular IIFE architecture while maintaining single-file deployment for Sine compatibility. No file splitting. Result: Same file, better organized, easier to maintain.

---

## Phase 1: Module Identification

Identify these logical modules in the current code:

### 1. Constants Module
- Configuration defaults (timer durations, colors, keyboard shortcuts)
- Magic numbers and string constants
- Default configuration objects

### 2. Storage Module
- Firefox Services.prefs API operations
- Configuration serialization/deserialization
- Crash recovery state management
- Preference reading and writing

### 3. Utils Module
- Common helper functions used across modules
- String utilities
- Array utilities
- DOM query helpers
- Event handling utilities
- Path resolution helpers

### 4. Timer Module
- Timer state (isRunning, timeRemaining, phase, cycles)
- Countdown interval management
- Phase transitions (focus → break → long break)
- Cycle counting logic
- Time calculations
- Timer pause/resume/stop functionality

### 5. Overlay Module
- Full-screen overlay DOM element creation
- Overlay visibility management
- Color updates based on phase
- Message text display on overlay
- Overlay hiding when switching workspaces
- Opacity and z-index management

### 6. Notifications Module
- Notification DOM creation and display
- Notification removal after timeout
- Audio alert triggering
- Daily reminder scheduling
- Post-session reminder logic
- Grace period management for reminders

### 7. Security Module
- Security code generation (alphanumeric and all-typeable character sets)
- Code validation and comparison
- Failed attempt counting
- Lock screen handling during active timers
- Idle timeout calculations for settings lock

### 8. Settings Module
- Configuration loading from storage
- Configuration saving to storage
- Settings validation
- Workspace selection for blocking
- Default values
- User preference management

### 9. UI Module
- Keyboard shortcut registration (Alt+Shift+P)
- Context menu setup for right-click interactions
- Menu display with timer options
- Timer display updates with countdown
- Lock screen displays
- Input handling for security codes
- Button event listeners

### 10. PomodoroApp Coordinator
- Initialization orchestration
- Cross-module communication
- Session start workflow
- Session end workflow
- Session pause workflow
- Module dependency management

---

## Phase 2: IIFE Structure for Each Module

Each module should follow this pattern:

**Header Comments**: Clearly mark module boundaries with comment dividers

**Private Scope**: Declare all private variables, helper functions, and state inside the IIFE

**Public Interface**: Return only the methods/properties that external code should use

**No Global Variables**: All state belongs to the module's IIFE scope

**Clear Naming**: Public methods should have clear, descriptive names

**Module Isolation**: Modules should not directly access each other's private variables

---

## Phase 3: Module Responsibilities and Public Methods

### Constants Module Exports
- TIMER_DEFAULTS object (focus, break, long-break durations)
- COLORS object (focus color, break color, long-break color)
- KEYBOARD_SHORTCUTS object
- DEFAULT_SETTINGS object
- SECURITY_SETTINGS object
- UI_CONSTANTS object

### Storage Module Exports
- loadConfig() → returns configuration object
- saveConfig(config) → persists to prefs
- getPreference(key) → gets single pref value
- setPreference(key, value) → sets single pref value
- loadTimerState() → for crash recovery
- saveTimerState(state) → for crash recovery
- clearPreference(key) → removes preference

### Utils Module Exports
- Helper functions for string operations
- Helper functions for array operations
- DOM query helpers
- Event listener management helpers
- Path resolution functions needed by modules

### Timer Module Exports
- start(config) → begins timer with cycles/duration
- pause() → pauses running timer
- resume() → resumes paused timer
- stop() → stops and resets timer
- getState() → returns current state (read-only copy)
- getTimeRemaining() → returns milliseconds left
- getCurrentPhase() → returns 'focus'|'break'|'long-break'
- getCurrentCycle() → returns current cycle number

### Overlay Module Exports
- show(config) → displays overlay with configuration
- hide() → hides overlay
- setMessage(text) → updates overlay text
- setColor(color) → changes overlay background color
- isVisible() → returns boolean
- updateDimensions() → adjusts to window/sidebar changes
- appendChild(element) → for adding content to overlay

### Notifications Module Exports
- show(title, message) → displays and auto-dismisses notification
- showPersistent(title, message) → shows until manually closed
- playSound(filename) → plays audio file
- scheduleDailyReminder(time, callback) → schedules daily check
- showPostSessionReminder() → reminds after session ends
- clearNotification() → removes current notification

### Security Module Exports
- generateCode(length, characterSet) → creates new security code
- validateCode(userInput) → returns boolean
- getAttemptCount() → returns number of failed attempts
- resetAttempts() → clears attempt counter
- isCodeGenerated() → checks if code exists
- clearCode() → removes generated code

### Settings Module Exports
- loadSettings() → retrieves current settings
- saveSettings(newSettings) → persists new settings
- validateSettings(settings) → checks for errors, returns boolean
- getDefault(key) → returns default for single key
- getBlockedWorkspaces() → returns list of blocked workspace IDs
- setBlockedWorkspaces(workspaceIds) → updates blocked list
- getOverlayColor(phase) → returns color for phase

### UI Module Exports
- init() → initializes all UI components
- showMenu() → displays Pomodoro options menu
- updateTimerDisplay(timeRemaining, phase, cycle) → updates countdown
- showLockScreen(type, challenge) → shows security lock
- showSettingsDialog() → opens settings interface
- disableAllInteraction() → locks down UI during locked state
- enableAllInteraction() → re-enables UI

### PomodoroApp Coordinator Exports
- init() → initializes all modules in correct order
- startSession(config) → orchestrates session start
- pauseSession() → pauses active session
- resumeSession() → resumes paused session
- stopSession() → ends session and cleans up
- openSettings() → coordinates settings dialog

---

## Phase 4: Inter-Module Communication Patterns

**No Direct Private Variable Access**: Modules never access another module's private variables

**Public Method Calls Only**: Communication happens through returned public methods

**Parameter Passing**: Data moves between modules through method parameters and return values

**Event Delegation**: For UI events, UIModule coordinates and calls other modules

**Initialization Order**: PomodoroApp calls module initialization in correct dependency order

### Example Communication Flow

User clicks "Start Timer" →
- UIModule detects click
- UIModule calls SettingsModule.loadSettings()
- UIModule calls PomodoroApp.startSession(config)
- PomodoroApp calls TimerModule.start(config)
- PomodoroApp calls OverlayModule.show(config)
- TimerModule calls Notifications when phase completes
- Overlay updates when workspace changes

---

## Phase 5: Specific Implementation Considerations

### Constants Module
- Should be first module defined (no dependencies)
- Should NOT be wrapped as IIFE - just a plain object
- Can be referenced by all other modules

### Storage Module
- Depends on Constants Module only
- All Firefox prefs operations happen here
- No other module directly calls Services.prefs

### Timer Module
- Manages internal countdown interval
- Does NOT directly manage overlay
- Does NOT directly show notifications
- Calls callbacks or public methods on other modules when phases complete

### Overlay Module
- Does NOT manage timer state
- Gets configuration from SettingsModule when showing
- Updates dimensions when workspace changes (DOM detection)

### Notifications Module
- Independent of Timer state
- Called by Timer when phases complete
- Daily reminder logic tracks last trigger time

### Security Module
- Completely independent
- Used by UI Module to validate user input
- Generates and validates codes, nothing else

### Settings Module
- Loads from storage initially
- Validates before saving
- Broadcasts changes to other modules through callback if needed

### UI Module
- Event listener hub
- Coordinates user interactions
- Calls other modules in response to user actions
- Updates display based on module states

---

## Phase 6: File Structure After Refactoring

```
zen-pomodoro-focus-blocker.uc.js (same filename, single file)

1. File header and initial comments
2. Constants Module (optional IIFE, often plain object)
3. Utils Module IIFE
4. Storage Module IIFE
5. Timer Module IIFE
6. Overlay Module IIFE
7. Notifications Module IIFE
8. Security Module IIFE
9. Settings Module IIFE
10. UI Module IIFE
11. PomodoroApp Coordinator IIFE
12. PomodoroApp.init() call
13. window.PomodoroTimer = { /* module references */ }
```

---

## Phase 7: Copilot Coding Instructions

When GitHub Copilot refactors this code:

1. **Preserve all functionality**: Every feature must work identically after refactoring
2. **Do not split files**: Keep as single zen-pomodoro-focus-blocker.uc.js
3. **Create clear module boundaries**: Use comment dividers between modules
4. **Implement IIFE pattern**: Each module wrapped in self-executing function
5. **Define public interfaces**: Return only necessary methods from each IIFE
6. **Maintain state privacy**: All private variables stay in module scope
7. **Test module independence**: Each module should work without modification to others
8. **Preserve initialization**: PomodoroApp.init() calls modules in correct order
9. **Keep Firefox API usage unchanged**: Storage operations use Services.prefs
10. **Maintain event handling**: All keyboard shortcuts and DOM events work identically
11. **No new dependencies**: Do not add external libraries or imports
12. **Error handling**: Preserve all console logging and error checks
13. **Comments and documentation**: Keep existing comments, add module documentation
14. **Sine compatibility**: File loads and runs identically through Sine Mod Manager

---

## Testing Checklist After Refactoring

- [ ] Browser console has no JavaScript errors
- [ ] Timer starts and counts down correctly
- [ ] Overlay appears on blocked workspaces
- [ ] Overlay hides on non-blocked workspaces
- [ ] Phase transitions work (focus → break → long-break)
- [ ] Settings load and save correctly
- [ ] Security codes generate and validate
- [ ] Notifications display at correct times
- [ ] Keyboard shortcut (Alt+Shift+P) opens menu
- [ ] Context menu still functions
- [ ] Application loads without errors on startup
- [ ] Crash recovery state loads on restart
- [ ] Private variables are not accessible from console
- [ ] Public methods are accessible from console
- [ ] No global variable pollution outside module scope

---

## Expected Outcomes

**Before Refactoring**:
- 385KB monolithic file
- Variables scattered in global scope
- Hard to locate bugs
- Difficult to add features
- Slow to search and understand

**After Refactoring**:
- 385KB modular file (no size reduction)
- Variables organized by module in private scopes
- Easy to locate bugs in specific module
- Safe to add features without affecting others
- Fast to find and understand specific functionality
- Clear public interfaces for each module
- Better maintainability
- Same user experience
- Identical Sine installation process