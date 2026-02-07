# Undo/Redo System Feature

## Overview
Added a comprehensive Undo/Redo system to all main dialog menus in the Zen Pomodoro Focus Blocker mod.

## Implementation Details

### New Class: UndoRedoManager
- Location: Line 12227 in zen-pomodoro-focus-blocker.uc.js (before CustomCycleManager)
- Provides generic undo/redo state management using JSON serialization
- Features:
  - Stack-based undo/redo with deep cloning via JSON
  - UI buttons with automatic enable/disable based on stack state
  - Callback system for state restoration
  - Prevents undo past initial state

### Integrated Dialogs

#### 1. Settings Dialog (createSettingsDialog)
- Undo/Redo buttons appear below the title
- Tracks all configuration changes
- Restores state by re-creating dialog with saved config

#### 2. Ruleset Settings Dialog (showRulesetSettingsDialog)
- Undo/Redo buttons appear below the title
- Tracks ruleset additions, deletions, and modifications
- Restores state and re-renders dialog

#### 3. Start Timer Dialog (showConfigDialog)
- Undo/Redo buttons appear below the title
- Tracks timer mode and duration changes
- Restores state and re-renders dialog

#### 4. Custom Cycle Editor (showCycleEditor)
- Undo/Redo buttons appear below the title
- Tracks:
  - Cycle name changes
  - Default duration changes (focus, break, transition)
  - Block additions and deletions
  - Block reordering (drag & drop)
  - Block duplication (Alt+drag)
  - Multi-block operations (shift+select, delete)
- Restores state and re-renders the blocks list

### User Interface
- Two buttons: "↩ Undo" and "Redo ↪"
- Positioned at top-right of dialog (below title)
- Buttons disabled when no undo/redo available
- Hover effects for visual feedback
- Styled to match existing mod theme

### CSS Additions
Added styles to chrome.css (lines 2311-2340):
- `.zen-pomodoro-undo-redo-container` - Button container
- `.zen-pomodoro-undo-redo-button` - Button styling
- Hover and disabled states

## Technical Decisions

1. **JSON Serialization**: Used for deep cloning and state comparison
   - Simple and reliable
   - Works with nested objects
   - No external dependencies

2. **Dialog Re-rendering**: On undo/redo in settings dialogs
   - Ensures UI consistency
   - Maintains dialog position using saveDialogPosition/applyLastDialogPosition
   - Clean separation of state and UI

3. **Event-based Tracking**: Uses 'change' event listeners
   - Captures most user interactions
   - Lightweight implementation
   - Additional tracking for specific inputs (name, durations)

4. **Stack Management**:
   - Undo stack keeps at least initial state (can't undo past start)
   - Redo stack cleared when new action performed
   - Updates button states automatically

## Testing Recommendations

1. **Settings Dialog**:
   - Change various settings
   - Undo changes one by one
   - Redo changes
   - Verify all settings restore correctly

2. **Ruleset Settings**:
   - Add/delete rulesets
   - Modify ruleset properties
   - Test undo/redo across operations

3. **Cycle Editor**:
   - Create blocks, undo, redo
   - Drag blocks, undo
   - Delete blocks (single and multi-select), undo
   - Change cycle name and durations, undo
   - Alt+drag duplication, undo

4. **Edge Cases**:
   - Undo button should be disabled initially
   - Can't undo past initial state
   - Redo disabled after performing new action
   - Dialog position preserved across undo/redo

## Future Enhancements

Potential improvements for future versions:
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- Undo history limit (prevent memory issues)
- Visual diff showing what changed
- Undo/redo for timer state (pause/resume)
