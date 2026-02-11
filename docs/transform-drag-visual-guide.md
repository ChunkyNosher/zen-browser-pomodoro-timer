# Transform-Based Drag Visual Explanation

## Example: Dragging Block 0 Down to Position 2

### Initial State (DOM Order)
```
┌─────────────────────┐
│  Block 0 (100px)    │  ← User grabs this block
├─────────────────────┤
│  Block 1 (100px)    │
├─────────────────────┤
│  Block 2 (100px)    │
└─────────────────────┘

DOM positions:
- Block 0: top = 0px
- Block 1: top = 100px
- Block 2: top = 200px
```

### During Drag (Visual Preview with Transforms)

**User's mouse is hovering over the position after Block 2**

```
┌─────────────────────┐
│  Block 1 (100px)    │  ← transform: translateY(-100px)
├─────────────────────┤    (moved up from 100 to 0)
│  Block 2 (100px)    │  ← transform: translateY(-100px)
├─────────────────────┤    (moved up from 200 to 100)
│━━━━━━━━━━━━━━━━━━━━━│  ← Drop indicator (absolutely positioned at 200px)
│  Block 0 (opacity)  │  ← transform: translateY(200px)
└─────────────────────┘    (moved down from 0 to 200, shown at 30% opacity)

Floating Preview:
┌─────────────────────┐
│  Block 0 (copy)     │  ← Follows cursor
└─────────────────────┘
```

**What happens:**
1. Block 0 stays in DOM position 0 but CSS transform moves it to visual position 200px
2. Block 0 rendered at 30% opacity to show the "gap" where it will land
3. Blocks 1 and 2 stay in DOM positions 100/200 but transforms move them up by 100px each
4. Drop indicator absolutely positioned at Y=200px (where the gap is)
5. CSS transitions make all blocks smoothly slide (200ms ease)
6. Floating preview follows cursor for visual feedback

### After Drop (Re-render to Natural Order)

**Transforms cleared, DOM reordered**

```
┌─────────────────────┐
│  Block 1 (100px)    │  ← No transform
├─────────────────────┤
│  Block 2 (100px)    │  ← No transform
├─────────────────────┤
│  Block 0 (100px)    │  ← No transform
└─────────────────────┘

DOM positions (after re-render):
- Block 1: top = 0px
- Block 2: top = 100px
- Block 0: top = 200px
```

## Multi-Block Example: Dragging Blocks [1, 3] to Position 2

### Initial State
```
┌─────────────────────┐
│  Block 0 (100px)    │
├─────────────────────┤
│  Block 1 (100px)    │  ← Selected (shift+click)
├─────────────────────┤
│  Block 2 (100px)    │
├─────────────────────┤
│  Block 3 (100px)    │  ← Selected (shift+click)
├─────────────────────┤
│  Block 4 (100px)    │
└─────────────────────┘
```

### During Drag (Target: After Block 2)

**Non-dragged blocks: [0, 2, 4]**
**Desired visual order: [0, 2, 1, 3, 4]**

```
┌─────────────────────┐
│  Block 0            │  ← transform: 0 (stays at 0)
├─────────────────────┤
│  Block 2            │  ← transform: translateY(-100px) (200→100)
├─────────────────────┤
│━━━━━━━━━━━━━━━━━━━━━│  ← Drop indicator at Y=200px
│  Block 1 (opacity)  │  ← transform: translateY(100px) (100→200)
├─────────────────────┤
│  Block 3 (opacity)  │  ← transform: 0 (stays at 300)
├─────────────────────┤
│  Block 4            │  ← transform: 0 (stays at 400)
└─────────────────────┘

Floating Preview:
┌─────────────────────┐
│  Block 1 (copy)     │
│  Block 3 (copy)     │  ← Both follow cursor
└─────────────────────┘
```

## Algorithm Visualization

### Transform Calculation Formula

```javascript
For each block i:
  transform[i] = visualTop[i] - domTop[i]

Where:
  domTop[i] = sum of heights of blocks 0 to i-1 (original order)
  visualTop[i] = sum of heights of blocks in visual order up to i
```

### Example Calculation (Single Block Drag)

**Dragging block 0 to position 2:**
**Block heights: [100, 100, 100]**

```
Step 1: Identify non-dragged blocks
  dragIndices = [0]
  nonDraggedIndices = [1, 2]

Step 2: Build visual order
  relativeTarget = 2 (after all non-dragged)
  visualOrder = [1, 2, 0]

Step 3: Calculate DOM tops
  domTops[0] = 0
  domTops[1] = 100
  domTops[2] = 200

Step 4: Calculate visual tops
  Block 1 is first in visual order: visualTops[1] = 0
  Block 2 is second: visualTops[2] = 100
  Block 0 is third: visualTops[0] = 200

Step 5: Calculate transforms
  transforms[0] = visualTops[0] - domTops[0] = 200 - 0 = 200px ↓
  transforms[1] = visualTops[1] - domTops[1] = 0 - 100 = -100px ↑
  transforms[2] = visualTops[2] - domTops[2] = 100 - 200 = -100px ↑
```

## Drop Indicator Positioning

### Formula
```javascript
indicatorOffset = sum of heights of all blocks before the gap in visual order
```

### Example
**Dragging block 0 to position 2:**
**Visual order: [1, 2, 0]**
**Gap is between blocks [1, 2] and [0]**

```
Blocks before gap: [1, 2]
indicatorOffset = height[1] + height[2] = 100 + 100 = 200px

Drop indicator absolutely positioned at top: 200px within container
```

## CSS Transition Effect

```css
.zen-pomodoro-cycle-block.drag-transition {
  transition: transform 0.2s ease;
}
```

**Result:** 
- All transform changes animate smoothly over 200ms
- Provides 60fps animation via GPU acceleration
- No layout recalculation during animation
- Buttery-smooth visual feedback

## Key Advantages

1. **GPU Accelerated**: CSS transforms use GPU, no CPU layout calculations
2. **Smooth Animation**: CSS transitions provide consistent 60fps
3. **No Layout Shift**: Transforms don't trigger reflow
4. **Precise Positioning**: Absolute indicator positioning works in scroll containers
5. **Visual Clarity**: 30% opacity dragged blocks show the gap clearly
6. **Cached Data**: Layout info captured before drag, unaffected by transforms
7. **Multi-Select**: Algorithm handles any number of dragged blocks elegantly
