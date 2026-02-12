import { describe, it, expect } from 'vitest';
import { calculateBlockTransforms, calculateDropIndicatorOffset } from '../src/drag-utils.js';

describe('Drag Utils - Transform Calculations', () => {
  describe('calculateBlockTransforms', () => {
    it('should return zero transforms when dragging first block to same position', () => {
      const dragIndices = [0];
      const relativeTarget = 0;
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      expect(transforms).toEqual([0, 0, 0]);
    });

    it('should calculate correct transforms when moving single block down', () => {
      const dragIndices = [0]; // Dragging first block
      const relativeTarget = 2; // After second non-dragged block
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Block 0 (dragged) moves down by 200 (past blocks 1 and 2)
      // Block 1 moves up by -100 (to fill gap left by block 0)
      // Block 2 moves up by -100 (to fill gap left by block 0)
      expect(transforms[0]).toBe(200);
      expect(transforms[1]).toBe(-100);
      expect(transforms[2]).toBe(-100);
    });

    it('should calculate correct transforms when moving single block up', () => {
      const dragIndices = [2]; // Dragging third block
      const relativeTarget = 0; // Before first non-dragged block
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Block 0 moves down by 100 (to make room for block 2)
      // Block 1 moves down by 100 (to make room for block 2)
      // Block 2 (dragged) moves up by -200 (before blocks 0 and 1)
      expect(transforms[0]).toBe(100);
      expect(transforms[1]).toBe(100);
      expect(transforms[2]).toBe(-200);
    });

    it('should handle multiple dragged blocks', () => {
      const dragIndices = [0, 1]; // Dragging first two blocks
      const relativeTarget = 2; // After second non-dragged block
      const blockHeights = [100, 100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Blocks 0-1 (dragged) move down
      // Blocks 2-3 move up to fill gap
      expect(transforms[0]).toBe(200);
      expect(transforms[1]).toBe(200);
      expect(transforms[2]).toBe(-200);
      expect(transforms[3]).toBe(-200);
    });

    it('should handle non-uniform block heights', () => {
      const dragIndices = [0];
      const relativeTarget = 2;
      const blockHeights = [50, 100, 150]; // Different heights
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Block 0 moves down by 250 (100 + 150)
      // Block 1 moves up by -50
      // Block 2 moves up by -50
      expect(transforms[0]).toBe(250);
      expect(transforms[1]).toBe(-50);
      expect(transforms[2]).toBe(-50);
    });

    it('should clamp target to valid range (below minimum)', () => {
      const dragIndices = [1];
      const relativeTarget = -5; // Invalid: below 0
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Should clamp to 0 (before all non-dragged blocks)
      expect(transforms[0]).toBe(100);
      expect(transforms[1]).toBe(-100);
      expect(transforms[2]).toBe(0);
    });

    it('should clamp target to valid range (above maximum)', () => {
      const dragIndices = [1];
      const relativeTarget = 999; // Invalid: way above max
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Should clamp to max (after all non-dragged blocks)
      expect(transforms[0]).toBe(0);
      expect(transforms[1]).toBe(100);
      expect(transforms[2]).toBe(-100);
    });

    it('should handle dragging all blocks (edge case)', () => {
      const dragIndices = [0, 1, 2];
      const relativeTarget = 0; // No non-dragged blocks
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // No movement needed since all blocks are dragged
      expect(transforms).toEqual([0, 0, 0]);
    });

    it('should handle single block cycle', () => {
      const dragIndices = [0];
      const relativeTarget = 0;
      const blockHeights = [100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      expect(transforms).toEqual([0]);
    });

    it('should handle blocks with gaps (CSS gap)', () => {
      const dragIndices = [0];
      const relativeTarget = 2;
      // Blocks with 10px gap: [110, 110, 100] (last has no gap)
      const blockHeights = [110, 110, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      
      // Block 0 moves down by 210 (110 + 100, past blocks 1 and 2)
      // Block 1 moves up by -110
      // Block 2 moves up by -110
      expect(transforms[0]).toBe(210);
      expect(transforms[1]).toBe(-110);
      expect(transforms[2]).toBe(-110);
    });
  });

  describe('calculateDropIndicatorOffset', () => {
    it('should position indicator at start when target is 0', () => {
      const dragIndices = [1];
      const relativeTarget = 0;
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Indicator at top (before first block)
      expect(offset).toBe(0);
    });

    it('should position indicator after first block', () => {
      const dragIndices = [2];
      const relativeTarget = 1; // After first non-dragged block
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Indicator after block 0 (height 100)
      expect(offset).toBe(100);
    });

    it('should position indicator after second block', () => {
      const dragIndices = [0];
      const relativeTarget = 2; // After second non-dragged block
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Indicator after blocks 1 and 2 (heights 100 + 100 = 200)
      expect(offset).toBe(200);
    });

    it('should handle non-uniform block heights', () => {
      const dragIndices = [0];
      const relativeTarget = 2;
      const blockHeights = [50, 100, 150];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Indicator after blocks 1 and 2 (heights 100 + 150 = 250)
      expect(offset).toBe(250);
    });

    it('should handle multiple dragged blocks', () => {
      const dragIndices = [0, 2];
      const relativeTarget = 1; // After first non-dragged block
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Only block 1 is non-dragged, indicator after it
      expect(offset).toBe(100);
    });

    it('should clamp target below minimum', () => {
      const dragIndices = [1];
      const relativeTarget = -5;
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Clamped to 0
      expect(offset).toBe(0);
    });

    it('should clamp target above maximum', () => {
      const dragIndices = [1];
      const relativeTarget = 999;
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // After all non-dragged blocks (0 and 2): 100 + 100 = 200
      expect(offset).toBe(200);
    });

    it('should handle blocks with gaps', () => {
      const dragIndices = [0];
      const relativeTarget = 2;
      const blockHeights = [110, 110, 100]; // With 10px gap except last
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // After blocks 1 and 2: 110 + 100 = 210
      expect(offset).toBe(210);
    });

    it('should return 0 when all blocks are dragged', () => {
      const dragIndices = [0, 1, 2];
      const relativeTarget = 0;
      const blockHeights = [100, 100, 100];
      
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // No non-dragged blocks before gap
      expect(offset).toBe(0);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex multi-block drag scenario', () => {
      // Scenario: Dragging blocks 1 and 3 to position 2 (among non-dragged)
      const dragIndices = [1, 3];
      const relativeTarget = 2;
      const blockHeights = [100, 100, 100, 100, 100]; // 5 blocks total
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Non-dragged blocks: 0, 2, 4
      // Visual order should be: 0, 2, [1, 3], 4
      // DOM tops: [0, 100, 200, 300, 400]
      // Visual tops: {0: 0, 2: 100, 1: 200, 3: 300, 4: 400}
      // Transforms: visual - DOM
      
      // Block 0 stays in place (0 - 0 = 0)
      expect(transforms[0]).toBe(0);
      // Block 1 (dragged) moves from 100 to 200 (200 - 100 = 100)
      expect(transforms[1]).toBe(100);
      // Block 2 moves from 200 to 100 (100 - 200 = -100)
      expect(transforms[2]).toBe(-100);
      // Block 3 (dragged) stays at 300 (300 - 300 = 0)
      expect(transforms[3]).toBe(0);
      // Block 4 stays at 400 (400 - 400 = 0)
      expect(transforms[4]).toBe(0);
      
      // Indicator after blocks 0 and 2 (heights: 100 + 100 = 200)
      expect(offset).toBe(200);
    });

    it('should verify transforms and offset consistency', () => {
      // For any valid drag operation, indicator position should align
      // with where the dragged blocks end up
      const dragIndices = [0, 1];
      const relativeTarget = 1;
      const blockHeights = [100, 100, 100];
      
      const transforms = calculateBlockTransforms(dragIndices, relativeTarget, blockHeights);
      const offset = calculateDropIndicatorOffset(dragIndices, relativeTarget, blockHeights);
      
      // Visual order: block 2, [blocks 0-1]
      // Block 0 moves down by 100 (past block 2)
      expect(transforms[0]).toBe(100);
      // Block 1 moves down by 100 (past block 2)
      expect(transforms[1]).toBe(100);
      // Block 2 moves up by -200 (to make room for blocks 0-1)
      expect(transforms[2]).toBe(-200);
      
      // Indicator after block 2 (at Y=100, the gap boundary)
      expect(offset).toBe(100);
    });
  });
});
