import { logger } from './log-manager.js';
import Constants from './constants.js';

// ============================================
// Undo/Redo Manager Module
// ============================================

/**
 * UndoRedoManager - Generic undo/redo state management for dialog menus.
 * Tracks state snapshots and provides undo/redo navigation.
 * Uses JSON serialization for deep state comparison and cloning.
 */
class UndoRedoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.buttonContainer = null;
    this.undoButton = null;
    this.redoButton = null;
    this.onStateRestore = null; // Callback when state is restored
  }

  /**
   * Push a new state snapshot onto the undo stack.
   * Clears the redo stack since a new action invalidates future states.
   * @param {Object} state - The state to save (will be deep-cloned)
   */
  pushState(state) {
    this.undoStack.push(JSON.stringify(state));
    this.redoStack = [];
    this._updateButtons();
  }

  /**
   * Undo the last action and return the previous state.
   * @returns {Object|null} The restored state, or null if nothing to undo
   */
  undo() {
    if (this.undoStack.length <= 1) return null; // Keep at least initial state
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const previousState = JSON.parse(this.undoStack[this.undoStack.length - 1]);
    this._updateButtons();
    if (this.onStateRestore) this.onStateRestore(previousState);
    return previousState;
  }

  /**
   * Redo the last undone action and return the next state.
   * @returns {Object|null} The restored state, or null if nothing to redo
   */
  redo() {
    if (this.redoStack.length === 0) return null;
    const nextStateStr = this.redoStack.pop();
    this.undoStack.push(nextStateStr);
    const nextState = JSON.parse(nextStateStr);
    this._updateButtons();
    if (this.onStateRestore) this.onStateRestore(nextState);
    return nextState;
  }

  /**
   * Check if undo is available.
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 1;
  }

  /**
   * Check if redo is available.
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Create the undo/redo button container UI element.
   * @returns {HTMLElement} Container with undo and redo buttons
   */
  createButtons() {
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.className = 'zen-pomodoro-undo-redo-container';

    this.undoButton = document.createElement('button');
    this.undoButton.className = 'zen-pomodoro-undo-redo-button';
    this.undoButton.textContent = '↩ Undo';
    this.undoButton.title = 'Undo last change';
    this.undoButton.disabled = true;
    this.undoButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.undo();
    });

    this.redoButton = document.createElement('button');
    this.redoButton.className = 'zen-pomodoro-undo-redo-button';
    this.redoButton.textContent = 'Redo ↪';
    this.redoButton.title = 'Redo last undone change';
    this.redoButton.disabled = true;
    this.redoButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.redo();
    });

    this.buttonContainer.appendChild(this.undoButton);
    this.buttonContainer.appendChild(this.redoButton);

    return this.buttonContainer;
  }

  /**
   * Update button disabled states based on stack contents.
   * @private
   */
  _updateButtons() {
    if (this.undoButton) this.undoButton.disabled = !this.canUndo();
    if (this.redoButton) this.redoButton.disabled = !this.canRedo();
  }

  /**
   * Reset the undo/redo stacks.
   */
  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this._updateButtons();
  }
}

export default UndoRedoManager;
