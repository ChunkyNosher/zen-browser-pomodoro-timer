# Visual Guide: Paused Timer Indicator

## What Changed? 🎨

### Before (Timer Running)
```
┌─────────────────────┐
│ 🔵 Focus: 25:00    │  ← Normal appearance
└─────────────────────┘
   Blue dot, full opacity
   Fast pulse (2s)
```

### After (Timer Paused)
```
┌─────────────────────┐
│ 🟠 Focus: 25:00    │  ← Dimmed appearance
└─────────────────────┘
   Orange dot, 70% opacity
   Slow pulse (3s)
   Darker gray background
```

## State Transitions

### Scenario 1: Manual Pause
```
User clicks indicator or pause button
           ↓
Timer pauses immediately
           ↓
Indicator changes to paused state:
  • Background: darker gray
  • Dot: orange
  • Opacity: 70%
  • Animation: slower pulse
```

### Scenario 2: Browser Restart
```
Browser closed with active timer
           ↓
Timer state saved to preferences
           ↓
Browser reopened
           ↓
Timer restored in PAUSED state
           ↓
Indicator appears (paused state)
           ↓
Notification appears (500ms delay):
"Your Focus timer (25:00 remaining) 
has been paused. Click the indicator 
to resume."
```

## Color Reference

| State | Dot Color | Background | Opacity |
|-------|-----------|------------|---------|
| **Focus (Running)** | 🔵 Blue `#2180cd` | Black 70% | 100% |
| **Break (Running)** | 🟢 Green `#2ec491` | Black 70% | 100% |
| **Paused** | 🟠 Orange `#ffa500` | Gray 70% `rgb(80 80 80 / 70%)` | 70% |

## Animation Reference

| State | Animation | Duration | Opacity Range |
|-------|-----------|----------|---------------|
| **Running** | `pulse` | 2 seconds | 1.0 → 0.4 → 1.0 |
| **Paused** | `slow-pulse` | 3 seconds | 1.0 → 0.3 → 1.0 |
| **Reduced Motion** | None | N/A | Static |

## User Experience Flow

### Normal Operation
1. ✅ User starts timer → Indicator appears (blue/green)
2. ✅ User pauses timer → Indicator dims and turns orange
3. ✅ User resumes timer → Indicator returns to normal

### Browser Restart
1. ✅ Timer active when browser closes → State saved
2. ✅ Browser reopens → Timer loads in PAUSED state
3. ✅ Indicator appears (dimmed, orange) → User knows timer is paused
4. ✅ Notification appears → User knows to resume
5. ✅ User clicks indicator → Timer resumes

## Accessibility Features

### Visual
- ✅ Clear color distinction (orange vs blue/green)
- ✅ Opacity change (dimmed when paused)
- ✅ Background color change

### Motion
- ✅ Slower pulse when paused
- ✅ No animations if `prefers-reduced-motion: reduce`

### Notification
- ✅ Non-blocking (user can dismiss)
- ✅ Clear message about state
- ✅ Instructions to resume

## Technical Details

### DOM Structure
```html
<div id="zen-pomodoro-indicator" 
     class="active" 
     data-phase="focus"
     data-paused="true">  <!-- NEW: Paused state -->
  <div id="zen-pomodoro-indicator-dot"></div>
  <span id="zen-pomodoro-indicator-text">Focus: 25:00</span>
</div>
```

### CSS Selector Priority
```css
/* Paused state overrides phase colors */
#zen-pomodoro-indicator[data-paused='true'] { 
  /* Applies to ANY phase when paused */
}

#zen-pomodoro-indicator[data-phase='focus'] {
  /* Only applies when NOT paused */
}
```

## Browser Compatibility

✅ All modern browsers (Chrome, Firefox, Edge, Safari)  
✅ Zen Browser (Firefox-based)  
✅ Hardware-accelerated animations  
✅ No external dependencies  

---

**For Users**: Look for the orange dot and dimmed appearance!  
**For Developers**: See `IMPLEMENTATION_SUMMARY.md` for technical details.
