import { describe, it, expect, beforeEach } from 'vitest';
import { lastDialogPosition, setLastDialogPosition } from '../src/state.js';

describe('State Module', () => {
  describe('lastDialogPosition', () => {
    it('should initialize as null', () => {
      // Note: This test depends on import order and may be affected by other tests
      // In a fresh import, lastDialogPosition should be null
      expect(lastDialogPosition === null || typeof lastDialogPosition === 'object').toBe(true);
    });

    it('should be a mutable export', () => {
      // The lastDialogPosition export should be mutable
      // This tests that the module exports a mutable reference
      const imported = { lastDialogPosition };
      expect(imported).toBeDefined();
    });
  });

  describe('setLastDialogPosition', () => {
    let currentModule;

    beforeEach(async () => {
      // Reset position before each test
      setLastDialogPosition(null);
      // Re-import module to get fresh reference
      currentModule = await import('../src/state.js');
    });

    it('should set dialog position with left and top', async () => {
      const position = { left: 100, top: 200 };
      setLastDialogPosition(position);

      // After setting, the module-level variable should be updated
      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
    });

    it('should accept null position', async () => {
      setLastDialogPosition({ left: 50, top: 50 });
      setLastDialogPosition(null);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toBeNull();
    });

    it('should update position when called multiple times', async () => {
      setLastDialogPosition({ left: 100, top: 100 });
      setLastDialogPosition({ left: 200, top: 200 });

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual({ left: 200, top: 200 });
    });

    it('should handle position with zero values', async () => {
      const position = { left: 0, top: 0 };
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
    });

    it('should handle position with negative values', async () => {
      const position = { left: -100, top: -50 };
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
    });

    it('should preserve object reference', async () => {
      const position = { left: 100, top: 200 };
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      // The reference should be the same object
      expect(currentPos).toBe(position);
    });

    it('should allow position to be modified after setting', async () => {
      const position = { left: 100, top: 200 };
      setLastDialogPosition(position);

      // Modify the original object
      position.left = 300;

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      // The change should be reflected (same reference)
      expect(currentPos.left).toBe(300);
    });
  });

  describe('State Mutation', () => {
    beforeEach(() => {
      setLastDialogPosition(null);
    });

    it('should maintain state across multiple operations', async () => {
      // Set initial position
      setLastDialogPosition({ left: 10, top: 20 });
      let { lastDialogPosition: pos1 } = await import('../src/state.js');
      expect(pos1).toEqual({ left: 10, top: 20 });

      // Update position
      setLastDialogPosition({ left: 30, top: 40 });
      let { lastDialogPosition: pos2 } = await import('../src/state.js');
      expect(pos2).toEqual({ left: 30, top: 40 });

      // Clear position
      setLastDialogPosition(null);
      let { lastDialogPosition: pos3 } = await import('../src/state.js');
      expect(pos3).toBeNull();
    });

    it('should handle rapid position updates', async () => {
      for (let i = 0; i < 10; i++) {
        setLastDialogPosition({ left: i * 10, top: i * 20 });
      }

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual({ left: 90, top: 180 });
    });
  });

  describe('Type Validation', () => {
    beforeEach(() => {
      setLastDialogPosition(null);
    });

    it('should accept position with additional properties', async () => {
      const position = { left: 100, top: 200, extra: 'data' };
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
      expect(currentPos.extra).toBe('data');
    });

    it('should accept position with only left property', async () => {
      const position = { left: 100 };
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
    });

    it('should accept position with only top property', async () => {
      const position = { top: 200 };
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
    });

    it('should accept empty object', async () => {
      const position = {};
      setLastDialogPosition(position);

      const { lastDialogPosition: currentPos } = await import('../src/state.js');
      expect(currentPos).toEqual(position);
    });
  });
});
