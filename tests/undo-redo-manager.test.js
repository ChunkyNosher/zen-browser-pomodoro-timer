import { describe, it, expect, beforeEach, vi } from 'vitest';
import UndoRedoManager from '../src/undo-redo-manager.js';

describe('UndoRedoManager', () => {
  let manager;

  beforeEach(() => {
    manager = new UndoRedoManager();
  });

  describe('Initial State', () => {
    it('should start with empty stacks', () => {
      expect(manager.undoStack).toEqual([]);
      expect(manager.redoStack).toEqual([]);
    });

    it('should have canUndo return false initially', () => {
      expect(manager.canUndo()).toBe(false);
    });

    it('should have canRedo return false initially', () => {
      expect(manager.canRedo()).toBe(false);
    });

    it('should have null button references initially', () => {
      expect(manager.buttonContainer).toBeNull();
      expect(manager.undoButton).toBeNull();
      expect(manager.redoButton).toBeNull();
    });
  });

  describe('pushState', () => {
    it('should add state to undo stack', () => {
      const state = { value: 1 };
      manager.pushState(state);
      expect(manager.undoStack.length).toBe(1);
    });

    it('should still have canUndo false after one push', () => {
      // Need at least 2 states to undo (keep initial state)
      manager.pushState({ value: 1 });
      expect(manager.canUndo()).toBe(false);
    });

    it('should have canUndo true after two pushes', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      expect(manager.canUndo()).toBe(true);
    });

    it('should clear redo stack when pushing new state', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      expect(manager.canRedo()).toBe(true);
      
      manager.pushState({ value: 3 });
      expect(manager.canRedo()).toBe(false);
      expect(manager.redoStack.length).toBe(0);
    });

    it('should deep clone state using JSON', () => {
      const state = { nested: { value: 1 } };
      manager.pushState(state);
      
      // Modify original
      state.nested.value = 2;
      
      // Stored state should be unchanged
      const stored = JSON.parse(manager.undoStack[0]);
      expect(stored.nested.value).toBe(1);
    });
  });

  describe('undo', () => {
    it('should return null when only initial state exists', () => {
      manager.pushState({ value: 1 });
      const result = manager.undo();
      expect(result).toBeNull();
    });

    it('should return previous state after two pushes', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      const result = manager.undo();
      expect(result).toEqual({ value: 1 });
    });

    it('should move state to redo stack', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      expect(manager.redoStack.length).toBe(1);
    });

    it('should make canRedo return true after undo', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      expect(manager.canRedo()).toBe(true);
    });

    it('should call onStateRestore callback if set', () => {
      const callback = vi.fn();
      manager.onStateRestore = callback;
      
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ value: 1 });
    });

    it('should return independent copy of state', () => {
      manager.pushState({ nested: { value: 1 } });
      manager.pushState({ nested: { value: 2 } });
      const result = manager.undo();
      
      // Modify returned state
      result.nested.value = 999;
      
      // Undo again should return original value
      manager.pushState({ nested: { value: 3 } });
      const result2 = manager.undo();
      expect(result2.nested.value).toBe(1);
    });

    it('should handle multiple undos', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.pushState({ value: 3 });
      
      const result1 = manager.undo();
      expect(result1).toEqual({ value: 2 });
      
      const result2 = manager.undo();
      expect(result2).toEqual({ value: 1 });
      
      const result3 = manager.undo();
      expect(result3).toBeNull();
    });
  });

  describe('redo', () => {
    it('should return null when redo stack is empty', () => {
      const result = manager.redo();
      expect(result).toBeNull();
    });

    it('should return next state after undo', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      
      const result = manager.redo();
      expect(result).toEqual({ value: 2 });
    });

    it('should move state back to undo stack', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      
      const undoLengthBefore = manager.undoStack.length;
      manager.redo();
      expect(manager.undoStack.length).toBe(undoLengthBefore + 1);
    });

    it('should make canRedo false when redo stack becomes empty', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      manager.redo();
      
      expect(manager.canRedo()).toBe(false);
    });

    it('should call onStateRestore callback if set', () => {
      const callback = vi.fn();
      manager.onStateRestore = callback;
      
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      manager.redo();
      
      expect(callback).toHaveBeenCalledTimes(2); // Once for undo, once for redo
      expect(callback).toHaveBeenLastCalledWith({ value: 2 });
    });

    it('should handle multiple redos', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.pushState({ value: 3 });
      manager.undo();
      manager.undo();
      
      const result1 = manager.redo();
      expect(result1).toEqual({ value: 2 });
      
      const result2 = manager.redo();
      expect(result2).toEqual({ value: 3 });
      
      const result3 = manager.redo();
      expect(result3).toBeNull();
    });
  });

  describe('canUndo', () => {
    it('should return false with empty stack', () => {
      expect(manager.canUndo()).toBe(false);
    });

    it('should return false with only one state', () => {
      manager.pushState({ value: 1 });
      expect(manager.canUndo()).toBe(false);
    });

    it('should return true with two or more states', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      expect(manager.canUndo()).toBe(true);
    });

    it('should return false after undoing to last state', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      expect(manager.canUndo()).toBe(false);
    });
  });

  describe('canRedo', () => {
    it('should return false with empty redo stack', () => {
      expect(manager.canRedo()).toBe(false);
    });

    it('should return true after undo', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      expect(manager.canRedo()).toBe(true);
    });

    it('should return false after redo empties the stack', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      manager.redo();
      expect(manager.canRedo()).toBe(false);
    });

    it('should return false after new state is pushed', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      manager.pushState({ value: 3 });
      expect(manager.canRedo()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear both stacks', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      
      manager.reset();
      
      expect(manager.undoStack.length).toBe(0);
      expect(manager.redoStack.length).toBe(0);
    });

    it('should make canUndo and canRedo return false', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      manager.undo();
      
      manager.reset();
      
      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(false);
    });
  });

  describe('Deep Cloning', () => {
    it('should store independent copies of pushed states', () => {
      const state = { 
        value: 1, 
        nested: { data: 'test' },
        array: [1, 2, 3]
      };
      
      manager.pushState(state);
      
      // Modify original
      state.value = 999;
      state.nested.data = 'modified';
      state.array.push(4);
      
      // Push another state so we can undo
      manager.pushState({ value: 2 });
      const retrieved = manager.undo();
      
      expect(retrieved.value).toBe(1);
      expect(retrieved.nested.data).toBe('test');
      expect(retrieved.array).toEqual([1, 2, 3]);
    });

    it('should handle complex nested structures', () => {
      const state = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      };
      
      manager.pushState(state);
      state.level1.level2.level3.value = 'modified';
      
      manager.pushState({ dummy: true });
      const retrieved = manager.undo();
      
      expect(retrieved.level1.level2.level3.value).toBe('deep');
    });
  });

  describe('Undo/Redo Sequence', () => {
    it('should maintain correct state through undo/redo sequence', () => {
      manager.pushState({ step: 1 });
      manager.pushState({ step: 2 });
      manager.pushState({ step: 3 });
      
      // Current state is step 3, undo twice
      let state = manager.undo(); // Back to step 2
      expect(state.step).toBe(2);
      
      state = manager.undo(); // Back to step 1
      expect(state.step).toBe(1);
      
      // Redo once
      state = manager.redo(); // Forward to step 2
      expect(state.step).toBe(2);
      
      // Push new state
      manager.pushState({ step: 4 });
      
      // Redo should now be empty
      expect(manager.canRedo()).toBe(false);
      
      // Undo should go back to step 2
      state = manager.undo();
      expect(state.step).toBe(2);
    });
  });

  describe('Callback Behavior', () => {
    it('should not call callback if not set', () => {
      manager.pushState({ value: 1 });
      manager.pushState({ value: 2 });
      
      // Should not throw when callback is null
      expect(() => manager.undo()).not.toThrow();
      expect(() => manager.redo()).not.toThrow();
    });

    it('should call callback with correct state', () => {
      const states = [];
      manager.onStateRestore = (state) => states.push(state);
      
      manager.pushState({ id: 'A' });
      manager.pushState({ id: 'B' });
      manager.pushState({ id: 'C' });
      
      manager.undo(); // Should restore B
      manager.undo(); // Should restore A
      manager.redo(); // Should restore B
      
      expect(states).toEqual([
        { id: 'B' },
        { id: 'A' },
        { id: 'B' }
      ]);
    });
  });
});
