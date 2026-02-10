import Constants from './constants.js';
import { logger } from './log-manager.js';
import {
  getConfig, saveConfig, sanitizeText, validateIntegerInput,
  LOG_CATEGORIES
} from './helpers.js';
import {
  setupDialogDrag, applyLastDialogPosition, saveDialogPosition,
  createLabeledInputRow, renderListOrEmptyMessage
} from './ui-helpers.js';
import UndoRedoManager from './undo-redo-manager.js';

// ============================================
// Custom Cycle Manager
// ============================================

/**
 * Manages custom Pomodoro cycles.
 * Allows users to create, edit, and manage custom timer sequences
 * with different durations for each focus and break phase.
 */
class CustomCycleManager {
  constructor() {
    this.currentEditingCycle = null;
    this.editingCycleDialog = null;
    this.draggedBlockIndex = null;
    this.selectedBlockIndices = new Set(); // Track selected block indices
    this.isDuplicating = false; // Flag for Alt+Drag duplication
    this.isDragging = false;
    this.dragCleanup = null;
    this._lastIndicatorRef = null; // Cached drop indicator position
  }

  /**
   * Create empty message element for cycles list.
   * @returns {HTMLElement} The empty message element
   * @private
   */
  _createEmptyMessage() {
    const emptyMessage = document.createElement('p');
    emptyMessage.style.color = '#888';
    emptyMessage.style.fontSize = '13px';
    emptyMessage.style.textAlign = 'center';
    emptyMessage.style.padding = '20px';
    emptyMessage.textContent = 'No custom cycles yet. Create one to get started!';
    return emptyMessage;
  }

  /**
   * Render cycles list into container.
   * @param {HTMLElement} container - Container element
   * @param {Array} cycles - Array of cycle objects
   * @param {Object} config - Configuration object
   * @param {HTMLElement} dialog - Parent dialog element
   * @private
   */
  _renderCyclesList(container, cycles, config, dialog) {
    if (cycles.length === 0) {
      container.appendChild(this._createEmptyMessage());
    } else {
      cycles.forEach((cycle, index) => {
        const cycleItem = this._createCycleListItem(cycle, config, dialog, { index, totalCount: cycles.length });
        container.appendChild(cycleItem);
      });
    }
  }

  /**
   * Show the main custom cycles menu listing all saved cycles.
   */
  showCustomCyclesMenu() {
    logger.log(LOG_CATEGORIES.MENU, 'Opening custom cycles menu');

    const config = getConfig();
    const savedCycles = config.customCycles || [];

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-custom-cycles-dialog';
    dialog.className = 'zen-pomodoro-dialog active';

    // Back button
    const backButton = document.createElement('button');
    backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
    backButton.textContent = '← Back';
    backButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      // Return to main menu
      if (window.zenPomodoroApp?.keyboardShortcut) {
        window.zenPomodoroApp.keyboardShortcut.showPomodoroMenu();
      }
    });

    // Title
    const title = document.createElement('h2');
    title.className = 'zen-pomodoro-dialog-title';
    title.textContent = 'Custom Cycles';
    
    // Description
    const description = document.createElement('p');
    description.className = 'zen-pomodoro-dialog-description';
    description.textContent = 
      'Create custom timer sequences with different durations for each phase.';
    description.style.fontSize = '13px';
    description.style.color = '#888';
    description.style.margin = '0 0 16px 0';

    // Cycles list container
    const cyclesContainer = document.createElement('div');
    cyclesContainer.className = 'zen-pomodoro-cycles-list';
    cyclesContainer.style.marginBottom = '16px';

    this._renderCyclesList(cyclesContainer, savedCycles, config, dialog);

    // Create New button
    const createButton = document.createElement('button');
    createButton.className = 'zen-pomodoro-dialog-button';
    createButton.textContent = '+ Create New Cycle';
    createButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.showCycleEditor(null);
    });

    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'zen-pomodoro-dialog-button secondary';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
    });

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';
    buttonDiv.appendChild(createButton);
    buttonDiv.appendChild(closeButton);

    dialog.appendChild(backButton);
    dialog.appendChild(title);
    dialog.appendChild(description);
    dialog.appendChild(cyclesContainer);
    dialog.appendChild(buttonDiv);

    applyLastDialogPosition(dialog);
    document.documentElement.appendChild(dialog);
    setupDialogDrag(dialog);
  }

  /**
   * Create a list item for a single saved cycle.
   * @param {Object} cycle - The cycle object
   * @param {Object} config - Current configuration
   * @param {HTMLElement} parentDialog - Parent dialog element
   * @param {Object} position - Position info for ordering
   * @param {number} position.index - Index of the cycle in the list
   * @param {number} position.totalCount - Total number of cycles
   * @returns {HTMLElement} The cycle list item element
   * @private
   */
  _createCycleListItem(cycle, config, parentDialog, { index, totalCount }) {
    const item = document.createElement('div');
    item.className = 'zen-pomodoro-cycle-list-item';

    // Cycle name and info
    const nameDiv = document.createElement('div');
    nameDiv.className = 'zen-pomodoro-cycle-name';
    nameDiv.textContent = cycle.name;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'zen-pomodoro-cycle-info';
    const blockCount = cycle.blocks.length;
    const totalMinutes = cycle.blocks.reduce((sum, block) => sum + block.duration, 0);
    infoDiv.textContent = `${blockCount} blocks • ${totalMinutes} minutes total`;

    const leftContent = document.createElement('div');
    leftContent.style.flex = '1';
    leftContent.appendChild(nameDiv);
    leftContent.appendChild(infoDiv);

    // Button container
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'zen-pomodoro-cycle-buttons';

    // Move Up button
    const moveUpButton = document.createElement('button');
    moveUpButton.className = 'zen-pomodoro-dialog-button secondary small';
    moveUpButton.textContent = '▲';
    moveUpButton.title = 'Move up';
    moveUpButton.disabled = index === 0;
    moveUpButton.style.padding = '4px 8px';
    moveUpButton.style.minWidth = 'auto';
    moveUpButton.addEventListener('click', () => {
      this._reorderCycle(config, index, index - 1, parentDialog);
    });

    // Move Down button
    const moveDownButton = document.createElement('button');
    moveDownButton.className = 'zen-pomodoro-dialog-button secondary small';
    moveDownButton.textContent = '▼';
    moveDownButton.title = 'Move down';
    moveDownButton.disabled = index >= totalCount - 1;
    moveDownButton.style.padding = '4px 8px';
    moveDownButton.style.minWidth = 'auto';
    moveDownButton.addEventListener('click', () => {
      this._reorderCycle(config, index, index + 1, parentDialog);
    });

    // Edit button
    const editButton = document.createElement('button');
    editButton.className = 'zen-pomodoro-dialog-button secondary small';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      saveDialogPosition(parentDialog);
      parentDialog.remove();
      this.showCycleEditor(cycle.id);
    });

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'zen-pomodoro-dialog-button secondary small';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      this._confirmDeleteCycle(cycle, config, parentDialog);
    });

    buttonsDiv.appendChild(moveUpButton);
    buttonsDiv.appendChild(moveDownButton);
    buttonsDiv.appendChild(editButton);
    buttonsDiv.appendChild(deleteButton);

    item.appendChild(leftContent);
    item.appendChild(buttonsDiv);

    return item;
  }

  /**
   * Show confirmation dialog before deleting a cycle.
   * @param {Object} cycle - The cycle to delete
   * @param {Object} config - Current configuration
   * @param {HTMLElement} parentDialog - Parent dialog to refresh
   * @private
   */
  _confirmDeleteCycle(cycle, config, parentDialog) {
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'zen-pomodoro-dialog active';
    confirmDialog.setAttribute(DATA_NO_POSITION_SAVE, 'true');

    const title = document.createElement('h2');
    title.textContent = 'Delete Cycle?';

    const message = document.createElement('p');
    message.textContent = `Are you sure you want to delete "${cycle.name}"? This cannot be undone.`;
    message.style.marginBottom = '20px';

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      confirmDialog.remove();
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'zen-pomodoro-dialog-button';
    deleteButton.textContent = 'Delete';
    deleteButton.style.backgroundColor = '#e74c3c';
    deleteButton.addEventListener('click', () => {
      this.deleteCycle(cycle.id);
      confirmDialog.remove();
      // Refresh the cycles list
      saveDialogPosition(parentDialog);
      parentDialog.remove();
      this.showCustomCyclesMenu();
    });

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(deleteButton);

    confirmDialog.appendChild(title);
    confirmDialog.appendChild(message);
    confirmDialog.appendChild(buttonDiv);

    applyLastDialogPosition(confirmDialog);
    document.documentElement.appendChild(confirmDialog);
  }

  /**
   * Reorder a cycle in the saved cycles list.
   * @param {Object} config - Current configuration
   * @param {number} fromIndex - Current index
   * @param {number} toIndex - Target index
   * @param {HTMLElement} parentDialog - Parent dialog to refresh
   * @private
   */
  _reorderCycle(config, fromIndex, toIndex, parentDialog) {
    const savedCycles = config.customCycles || [];
    if (fromIndex < 0 || fromIndex >= savedCycles.length) return;
    if (toIndex < 0 || toIndex >= savedCycles.length) return;

    const cycle = savedCycles[fromIndex];
    if (!cycle) return;
    savedCycles.splice(fromIndex, 1);
    savedCycles.splice(toIndex, 0, cycle);

    config.customCycles = savedCycles;
    saveConfig(config);

    logger.log(LOG_CATEGORIES.MENU, `Reordered cycle from position ${fromIndex} to ${toIndex}`, { cycleName: cycle.name || 'Unknown' });

    // Refresh the dialog
    saveDialogPosition(parentDialog);
    parentDialog.remove();
    this.showCustomCyclesMenu();
  }

  /**
   * Show the cycle editor for creating or editing a cycle.
   * @param {string|null} cycleId - ID of cycle to edit, or null to create new
   */
  showCycleEditor(cycleId = null) {
    logger.log(LOG_CATEGORIES.MENU, cycleId ? 'Editing custom cycle' : 'Creating new custom cycle');

    const config = getConfig();
    const savedCycles = config.customCycles || [];
    
    // Load existing cycle or create new one
    if (cycleId) {
      this.currentEditingCycle = savedCycles.find((c) => c.id === cycleId);
      if (!this.currentEditingCycle) {
        logger.log(LOG_CATEGORIES.MENU, `Cycle ${cycleId} not found`);
        return;
      }
      // Make a deep copy to avoid modifying the original until save
      this.currentEditingCycle = JSON.parse(JSON.stringify(this.currentEditingCycle));
      // Add default durations if not present (backward compatibility)
      if (!this.currentEditingCycle.defaultFocusDuration) {
        this.currentEditingCycle.defaultFocusDuration = 25;
      }
      if (!this.currentEditingCycle.defaultBreakDuration) {
        this.currentEditingCycle.defaultBreakDuration = 5;
      }
      if (!this.currentEditingCycle.defaultTransitionDuration) {
        this.currentEditingCycle.defaultTransitionDuration = 5;
      }
    } else {
      // Create new cycle with default values
      this.currentEditingCycle = {
        id: this._generateCycleId(),
        name: 'New Custom Cycle',
        defaultFocusDuration: 25,
        defaultBreakDuration: 5,
        defaultTransitionDuration: 5,
        blocks: [
          { type: 'focus', duration: 25 },
          { type: 'break', duration: 5 },
        ],
      };
    }

    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-cycle-editor-dialog';
    dialog.className = 'zen-pomodoro-dialog active zen-pomodoro-cycle-editor-dialog';
    this.editingCycleDialog = dialog;

    // Back button
    const backButton = document.createElement('button');
    backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
    backButton.textContent = '← Back';
    backButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.editingCycleDialog = null;
      this.showCustomCyclesMenu();
    });

    // Title
    const title = document.createElement('h2');
    title.className = 'zen-pomodoro-dialog-title';
    title.textContent = cycleId ? 'Edit Custom Cycle' : 'Create Custom Cycle';

    // Undo/Redo for cycle editing
    const cycleUndoRedo = new UndoRedoManager();
    cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    const undoRedoButtons = cycleUndoRedo.createButtons();
    this.currentUndoRedo = cycleUndoRedo;

    // Cycle name input
    const nameRow = document.createElement('div');
    nameRow.className = 'zen-pomodoro-config-row';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Cycle Name:';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'zen-pomodoro-dialog-input';
    nameInput.value = this.currentEditingCycle.name;
    nameInput.placeholder = 'e.g., Deep Work Session';
    nameInput.addEventListener('input', () => {
      this.currentEditingCycle.name = nameInput.value;
    });
    nameInput.addEventListener('change', () => {
      // Push undo state after name change
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);

    // Default duration inputs row
    const durationRow = document.createElement('div');
    durationRow.className = 'zen-pomodoro-config-row';
    durationRow.style.display = 'flex';
    durationRow.style.gap = '16px';
    durationRow.style.alignItems = 'center';
    durationRow.style.marginTop = '12px';

    // Focus block duration
    const focusDurationContainer = document.createElement('div');
    focusDurationContainer.style.display = 'flex';
    focusDurationContainer.style.flexDirection = 'column';
    focusDurationContainer.style.flex = '1';
    
    const focusDurationLabel = document.createElement('label');
    focusDurationLabel.textContent = 'Focus Block Duration (min):';
    focusDurationLabel.style.fontSize = '12px';
    focusDurationLabel.style.marginBottom = '4px';
    
    const focusDurationInput = document.createElement('input');
    focusDurationInput.type = 'number';
    focusDurationInput.className = 'zen-pomodoro-dialog-input';
    focusDurationInput.min = '1';
    focusDurationInput.max = '120';
    focusDurationInput.value = this.currentEditingCycle.defaultFocusDuration;
    focusDurationInput.style.width = '100%';
    focusDurationInput.addEventListener('change', () => {
      const validated = validateIntegerInput(
        focusDurationInput.value,
        1,
        120,
        this.currentEditingCycle.defaultFocusDuration
      );
      this.currentEditingCycle.defaultFocusDuration = validated;
      focusDurationInput.value = validated;
      // Push undo state after duration change
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });
    
    focusDurationContainer.appendChild(focusDurationLabel);
    focusDurationContainer.appendChild(focusDurationInput);

    // Break block duration
    const breakDurationContainer = document.createElement('div');
    breakDurationContainer.style.display = 'flex';
    breakDurationContainer.style.flexDirection = 'column';
    breakDurationContainer.style.flex = '1';
    
    const breakDurationLabel = document.createElement('label');
    breakDurationLabel.textContent = 'Break Block Duration (min):';
    breakDurationLabel.style.fontSize = '12px';
    breakDurationLabel.style.marginBottom = '4px';
    
    const breakDurationInput = document.createElement('input');
    breakDurationInput.type = 'number';
    breakDurationInput.className = 'zen-pomodoro-dialog-input';
    breakDurationInput.min = '1';
    breakDurationInput.max = '120';
    breakDurationInput.value = this.currentEditingCycle.defaultBreakDuration;
    breakDurationInput.style.width = '100%';
    breakDurationInput.addEventListener('change', () => {
      const validated = validateIntegerInput(
        breakDurationInput.value,
        1,
        120,
        this.currentEditingCycle.defaultBreakDuration
      );
      this.currentEditingCycle.defaultBreakDuration = validated;
      breakDurationInput.value = validated;
      // Push undo state after duration change
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });
    
    breakDurationContainer.appendChild(breakDurationLabel);
    breakDurationContainer.appendChild(breakDurationInput);

    // Transition block duration
    const transitionDurationContainer = document.createElement('div');
    transitionDurationContainer.style.display = 'flex';
    transitionDurationContainer.style.flexDirection = 'column';
    transitionDurationContainer.style.flex = '1';

    const transitionDurationLabel = document.createElement('label');
    transitionDurationLabel.textContent = 'Transition Duration (min):';
    transitionDurationLabel.style.fontSize = '12px';
    transitionDurationLabel.style.marginBottom = '4px';

    const transitionDurationInput = document.createElement('input');
    transitionDurationInput.type = 'number';
    transitionDurationInput.className = 'zen-pomodoro-dialog-input';
    transitionDurationInput.min = '1';
    transitionDurationInput.max = '15';
    transitionDurationInput.value = this.currentEditingCycle.defaultTransitionDuration;
    transitionDurationInput.style.width = '100%';
    transitionDurationInput.addEventListener('change', () => {
      const validated = validateIntegerInput(
        transitionDurationInput.value,
        1,
        15,
        this.currentEditingCycle.defaultTransitionDuration
      );
      this.currentEditingCycle.defaultTransitionDuration = validated;
      transitionDurationInput.value = validated;
      // Push undo state after duration change
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });

    transitionDurationContainer.appendChild(transitionDurationLabel);
    transitionDurationContainer.appendChild(transitionDurationInput);

    durationRow.appendChild(focusDurationContainer);
    durationRow.appendChild(breakDurationContainer);
    durationRow.appendChild(transitionDurationContainer);

    // Blocks container
    const blocksLabel = document.createElement('label');
    blocksLabel.textContent = 'Timer Blocks:';
    blocksLabel.style.display = 'block';
    blocksLabel.style.marginTop = '20px';
    blocksLabel.style.marginBottom = '8px';
    blocksLabel.style.fontWeight = 'bold';

    const blocksContainer = document.createElement('div');
    blocksContainer.className = 'zen-pomodoro-cycle-blocks-container';
    blocksContainer.id = 'zen-pomodoro-cycle-blocks';

    // Render blocks
    this._renderBlocks(blocksContainer);

    // Add Block controls row (dropdown + button)
    const addBlockRow = document.createElement('div');
    addBlockRow.style.display = 'flex';
    addBlockRow.style.gap = '8px';
    addBlockRow.style.alignItems = 'center';
    addBlockRow.style.marginTop = '12px';

    const blockTypeSelect = document.createElement('select');
    blockTypeSelect.className = 'zen-pomodoro-dialog-input';
    
    const focusOption = document.createElement('option');
    focusOption.value = 'focus';
    focusOption.textContent = '🎯 Focus';
    
    const breakOption = document.createElement('option');
    breakOption.value = 'break';
    breakOption.textContent = '☕ Break';
    
    const transitionOption = document.createElement('option');
    transitionOption.value = 'transition';
    transitionOption.textContent = '⏰ Transition';
    
    blockTypeSelect.appendChild(focusOption);
    blockTypeSelect.appendChild(breakOption);
    blockTypeSelect.appendChild(transitionOption);

    const addBlockButton = document.createElement('button');
    addBlockButton.className = 'zen-pomodoro-dialog-button secondary';
    addBlockButton.textContent = '+ Add Block';
    addBlockButton.style.width = 'auto';
    addBlockButton.style.padding = '8px 16px';
    addBlockButton.addEventListener('click', () => {
      const selectedType = blockTypeSelect.value;
      let duration;
      if (selectedType === 'focus') {
        duration = this.currentEditingCycle.defaultFocusDuration;
      } else if (selectedType === 'break') {
        duration = this.currentEditingCycle.defaultBreakDuration;
      } else {
        // Transition: use the cycle's default transition duration with fallback
        duration = this.currentEditingCycle.defaultTransitionDuration || 5;
      }
      this.addBlock(selectedType, duration);
      this._renderBlocks(blocksContainer);
      // Push undo state after adding block
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });

    addBlockRow.appendChild(blockTypeSelect);
    addBlockRow.appendChild(addBlockButton);

    // Save and Cancel buttons
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'zen-pomodoro-dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.editingCycleDialog = null;
      this.showCustomCyclesMenu();
    });

    const saveButton = document.createElement('button');
    saveButton.className = 'zen-pomodoro-dialog-button';
    saveButton.textContent = 'Save Cycle';
    saveButton.addEventListener('click', () => {
      if (this._validateCycle()) {
        this.saveCycle();
        saveDialogPosition(dialog);
        dialog.remove();
        this.editingCycleDialog = null;
        this.showCustomCyclesMenu();
      }
    });

    buttonDiv.appendChild(cancelButton);
    buttonDiv.appendChild(saveButton);

    // Assemble dialog - create header row for back button and undo/redo
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '8px';
    backButton.style.marginBottom = '0';
    headerRow.appendChild(backButton);
    headerRow.appendChild(undoRedoButtons);

    dialog.appendChild(headerRow);
    dialog.appendChild(title);
    dialog.appendChild(nameRow);
    dialog.appendChild(durationRow);
    dialog.appendChild(blocksLabel);
    dialog.appendChild(blocksContainer);
    dialog.appendChild(addBlockRow);
    dialog.appendChild(buttonDiv);

    // Track changes for undo/redo
    blocksContainer.addEventListener('change', () => {
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });

    // Set restore callback for undo/redo
    cycleUndoRedo.onStateRestore = (state) => {
      this.currentEditingCycle = state;
      // Update inputs
      if (nameInput) nameInput.value = state.name;
      if (focusDurationInput) focusDurationInput.value = state.defaultFocusDuration;
      if (breakDurationInput) breakDurationInput.value = state.defaultBreakDuration;
      if (transitionDurationInput) transitionDurationInput.value = state.defaultTransitionDuration || 5;
      this._renderBlocks(blocksContainer);
    };

    applyLastDialogPosition(dialog);
    document.documentElement.appendChild(dialog);
    setupDialogDrag(dialog);
  }

  /**
   * Clear all block selections.
   * @param {HTMLElement} container - Container element for blocks
   * @private
   */
  _clearBlockSelection(container) {
    this.selectedBlockIndices.clear();
    if (container) {
      container.querySelectorAll('.zen-pomodoro-cycle-block.selected')
        .forEach(el => el.classList.remove('selected'));
    }
  }

  /**
   * Duplicate blocks at specified indices and insert at target position.
   * @param {Array<number>} sourceIndices - Indices of blocks to duplicate (sorted)
   * @param {number} targetIndex - Target insertion index
   * @private
   */
  _duplicateBlocks(sourceIndices, targetIndex) {
    if (sourceIndices.length === 0) return;

    // Create deep copies of the blocks
    const blocksToDuplicate = sourceIndices.map(idx => ({
      type: this.currentEditingCycle.blocks[idx].type,
      duration: this.currentEditingCycle.blocks[idx].duration
    }));

    // Insert duplicated blocks at target position
    this.currentEditingCycle.blocks.splice(targetIndex, 0, ...blocksToDuplicate);
    
    logger.log(LOG_CATEGORIES.MENU, `Duplicated ${sourceIndices.length} block(s) to index ${targetIndex}`);
  }

  /**
   * Move multiple blocks to a target position, preserving their relative order.
   * @param {Array<number>} sourceIndices - Indices of blocks to move (sorted)
   * @param {number} targetIndex - Target insertion index
   * @private
   */
  _moveMultipleBlocks(sourceIndices, targetIndex) {
    if (sourceIndices.length === 0) return;

    // Extract the blocks to move
    const blocksToMove = sourceIndices.map(idx => this.currentEditingCycle.blocks[idx]);
    
    // Remove blocks from the array (in reverse order to maintain indices)
    for (let i = sourceIndices.length - 1; i >= 0; i--) {
      this.currentEditingCycle.blocks.splice(sourceIndices[i], 1);
    }

    // Adjust target index based on how many blocks before it were removed
    const removedBefore = sourceIndices.filter(idx => idx < targetIndex).length;
    const adjustedTarget = targetIndex - removedBefore;

    // Insert blocks at adjusted target position
    this.currentEditingCycle.blocks.splice(adjustedTarget, 0, ...blocksToMove);
    
    logger.log(LOG_CATEGORIES.MENU, `Moved ${sourceIndices.length} block(s) to index ${adjustedTarget}`);
  }

  /**
   * Handle a block drop operation.
   * Extracts the complex drop logic into a dedicated method to reduce handler complexity.
   * @param {number} targetIndex - Target insertion index
   * @private
   */
  _handleBlockDrop(targetIndex) {
    const isMultiSelect = this.selectedBlockIndices.has(this.draggedBlockIndex);
    const sourceIndices = isMultiSelect 
      ? Array.from(this.selectedBlockIndices).sort((a, b) => a - b)
      : [this.draggedBlockIndex];
    
    if (this.isDuplicating) {
      this._duplicateBlocks(sourceIndices, targetIndex);
    } else if (this.draggedBlockIndex !== targetIndex) {
      if (isMultiSelect) {
        this._moveMultipleBlocks(sourceIndices, targetIndex);
      } else {
        this.reorderBlocks(this.draggedBlockIndex, targetIndex);
      }
    }
    
    // Re-render blocks
    const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
    if (blocksContainer) {
      this._renderBlocks(blocksContainer);
    }
  }

  /**
   * Render the blocks in the editor.
   * @param {HTMLElement} container - Container element for blocks
   * @private
   */
  _renderBlocks(container) {
    // Clear selection when re-rendering
    this._clearBlockSelection(container);
    
    container.innerHTML = '';

    if (this.currentEditingCycle.blocks.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.style.color = '#888';
      emptyMessage.style.fontSize = '13px';
      emptyMessage.style.textAlign = 'center';
      emptyMessage.style.padding = '20px';
      emptyMessage.textContent = 'No blocks yet. Add your first block to get started!';
      container.appendChild(emptyMessage);
      return;
    }

    this.currentEditingCycle.blocks.forEach((block, index) => {
      const blockElement = this._createBlockElement(block, index);
      container.appendChild(blockElement);
    });
  }

  /**
   * Create a block element for the editor.
   * @param {Object} block - Block object
   * @param {number} index - Block index
   * @returns {HTMLElement} Block element
   * @private
   */
  _createBlockElement(block, index) {
    const blockDiv = document.createElement('div');
    blockDiv.className = `zen-pomodoro-cycle-block zen-pomodoro-cycle-block-${block.type}`;
    blockDiv.dataset.index = index;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'zen-pomodoro-cycle-block-handle';
    dragHandle.textContent = '⋮⋮';
    dragHandle.title = 'Drag to reorder';

    // Block type icon
    const typeIcon = document.createElement('div');
    typeIcon.className = 'zen-pomodoro-cycle-block-type';
    const typeIcons = { focus: '🎯', break: '☕', transition: '⏰' };
    typeIcon.textContent = typeIcons[block.type] || '❓';

    // Block info
    const infoDiv = document.createElement('div');
    infoDiv.className = 'zen-pomodoro-cycle-block-info';
    
    const typeLabel = document.createElement('div');
    typeLabel.className = 'zen-pomodoro-cycle-block-label';
    const typeLabels = { focus: 'Focus', break: 'Break', transition: 'Transition' };
    typeLabel.textContent = typeLabels[block.type] || 'Unknown';
    
    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.min = '1';
    durationInput.max = block.type === 'transition' ? '15' : '120';
    durationInput.value = block.duration;
    durationInput.className = 'zen-pomodoro-cycle-block-duration';
    durationInput.addEventListener('change', () => {
      const maxDuration = block.type === 'transition' ? 15 : 120;
      const newDuration = validateIntegerInput(durationInput.value, 1, maxDuration, block.duration);
      durationInput.value = newDuration;
      this.currentEditingCycle.blocks[index].duration = newDuration;
    });
    
    const minutesLabel = document.createElement('span');
    minutesLabel.textContent = ' minutes';
    minutesLabel.style.fontSize = '12px';
    minutesLabel.style.color = '#888';

    infoDiv.appendChild(typeLabel);
    infoDiv.appendChild(durationInput);
    infoDiv.appendChild(minutesLabel);

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'zen-pomodoro-cycle-block-delete';
    deleteButton.textContent = '✕';
    deleteButton.title = 'Delete block';
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering block click
      
      // If this block is selected, delete all selected blocks
      if (this.selectedBlockIndices.has(index)) {
        this._deleteSelectedBlocks();
      } else {
        // Single block deletion
        this.removeBlock(index);
        this._pushUndoState();
      }
    });

    blockDiv.appendChild(dragHandle);
    blockDiv.appendChild(typeIcon);
    blockDiv.appendChild(infoDiv);
    blockDiv.appendChild(deleteButton);

    // Shift+Click handler for multi-select
    blockDiv.addEventListener('click', (e) => {
      // Don't handle click if it's on the input or delete button
      if (e.target === durationInput || e.target === deleteButton) {
        return;
      }
      
      if (e.shiftKey) {
        e.preventDefault();
        if (this.selectedBlockIndices.has(index)) {
          this.selectedBlockIndices.delete(index);
          blockDiv.classList.remove('selected');
        } else {
          this.selectedBlockIndices.add(index);
          blockDiv.classList.add('selected');
        }
      } else {
        // Clear all selections on normal click
        const container = blockDiv.parentElement;
        this._clearBlockSelection(container);
      }
    });

    // Custom pointer-based drag on entire block (supports mouse and touch)
    blockDiv.addEventListener('pointerdown', (e) => {
      // Don't start drag if clicking on input, delete button, or their children
      if (durationInput.contains(e.target) || deleteButton.contains(e.target)) {
        return;
      }
      if (e.shiftKey) return; // allow Shift+Click multi-select without drag
      // Allow left mouse button (button 0) or touch/pen input
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this._startBlockDrag(e, blockDiv, index);
    });

    return blockDiv;
  }

  /**
   * Start a custom pointer-based block drag operation.
   * @param {MouseEvent} e - The mousedown event
   * @param {HTMLElement} blockDiv - The block element being dragged
   * @param {number} index - The index of the block being dragged
   * @private
   */
  _startBlockDrag(e, blockDiv, index) {
    // Safety: cleanup any existing drag state before starting new drag
    if (this.isDragging) {
      if (this.dragCleanup) {
        this.dragCleanup();
        this.dragCleanup = null;
      }
      this.isDragging = false;
    }

    this.isDragging = true;
    this.draggedBlockIndex = index;
    this.isDuplicating = e.altKey;

    const container = blockDiv.parentElement;
    if (!container) return;

    // Determine which indices are being dragged
    const isMultiSelect = this.selectedBlockIndices.has(index);
    const dragIndices = isMultiSelect
      ? Array.from(this.selectedBlockIndices).sort((a, b) => a - b)
      : [index];

    logger.log(Constants.LOG_CATEGORIES.MENU, 'Block drag started', {
      index,
      isMultiSelect,
      isDuplicating: this.isDuplicating,
      dragIndices
    });

    // Capture dimensions BEFORE adding dragging class
    const allBlocks = Array.from(container.querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)'));
    const { dragPreview, offsetY } = this._createDragPreview(e, blockDiv, allBlocks, dragIndices);

    // Mark all dragged blocks
    dragIndices.forEach(idx => {
      if (allBlocks[idx]) allBlocks[idx].classList.add('dragging');
    });

    // Add transition class to non-dragged blocks for smooth shifting
    allBlocks.forEach((block, idx) => {
      if (!dragIndices.includes(idx)) {
        block.classList.add('drag-transition');
      }
    });

    // Create drop indicator
    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'zen-pomodoro-cycle-drop-indicator';
    dropIndicator.style.display = 'none';
    container.appendChild(dropIndicator);

    // Create ghost blocks for duplication mode
    let ghostBlocks = [];
    if (this.isDuplicating) {
      ghostBlocks = dragIndices.map(idx => {
        const ghost = allBlocks[idx].cloneNode(true);
        ghost.className = allBlocks[idx].className.replace('dragging', '').trim() + ' zen-pomodoro-cycle-block-ghost';
        ghost.style.display = 'none';
        return ghost;
      });
    }

    let lastTargetIndex = -1;
    let rafId = null;
    let lastPointerY = e.clientY; // Track pointer Y for auto-scroll target recalculation
    
    // Reset cached indicator position for new drag
    this._lastIndicatorRef = null;
    
    // Auto-scroll variables for dragging near container edges
    const scrollContainer = container;
    const SCROLL_ZONE = 40; // px from edge to trigger auto-scroll
    const SCROLL_SPEED = 4; // px per frame
    const scrollState = { rafId: null, direction: null };

    // Shared function to update drop target position based on pointer Y
    const updateDropTarget = (clientY) => {
      const targetIndex = this._getDropTargetIndex(container, clientY, dragIndices);
      
      if (targetIndex === lastTargetIndex) return;
      lastTargetIndex = targetIndex;

      const nonDraggedBlocks = allBlocks.filter((_, idx) => !dragIndices.includes(idx));
      
      if (targetIndex < 0) return;

      this._positionDropIndicator(container, dropIndicator, nonDraggedBlocks, targetIndex);

      if (this.isDuplicating && ghostBlocks.length > 0) {
        this._showGhostBlocks(container, dropIndicator, ghostBlocks);
      }

    };

    const onPointerMove = (pointerMoveEvent) => {
      lastPointerY = pointerMoveEvent.clientY;
      
      // Update floating drag preview position
      dragPreview.style.top = `${lastPointerY - offsetY}px`;
      
      // Handle auto-scroll near container edges (not throttled by rAF)
      this._updateAutoScroll(lastPointerY, scrollContainer, scrollState, {
        zone: SCROLL_ZONE,
        scrollSpeed: SCROLL_SPEED,
        onScroll: updateDropTarget,
      });
      
      if (rafId) return; // Throttle updateDropTarget with rAF
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateDropTarget(lastPointerY);
      });
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      
      // Remove floating drag preview
      if (dragPreview.parentElement) dragPreview.remove();
      
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      
      // Stop auto-scroll
      if (scrollState.rafId) {
        cancelAnimationFrame(scrollState.rafId);
        scrollState.rafId = null;
      }

      this._cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks);
      const didApply = this._applyDragOperation(lastTargetIndex, dragIndices, isMultiSelect);

      logger.log(Constants.LOG_CATEGORIES.MENU, 'Block drag completed', {
        from: dragIndices,
        to: lastTargetIndex
      });

      // Only re-render and push undo state if an actual operation occurred
      if (didApply) {
        const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
        if (blocksContainer) {
          this._renderBlocks(blocksContainer);
        }
        if (this.currentUndoRedo) {
          this.currentUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
        }
      }

      this.isDragging = false;
      this.draggedBlockIndex = null;
      this.isDuplicating = false;
      this.dragCleanup = null;
    };


    this.dragCleanup = cleanup;

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  }

  /**
   * Create a floating drag preview element that follows the cursor.
   * Must be called BEFORE blocks are collapsed with the dragging class.
   * @param {PointerEvent} e - The pointer event
   * @param {HTMLElement} blockDiv - The primary block being dragged
   * @param {Array<HTMLElement>} allBlocks - All block elements
   * @param {Array<number>} dragIndices - Indices of blocks being dragged
   * @returns {{ dragPreview: HTMLElement, offsetY: number }}
   * @private
   */
  _createDragPreview(e, blockDiv, allBlocks, dragIndices) {
    const blockWidth = blockDiv.offsetWidth;
    const blockRect = blockDiv.getBoundingClientRect();
    const startY = e.clientY;
    const offsetY = startY - blockRect.top;

    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'fixed';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.zIndex = '2147483647';
    dragPreview.style.opacity = '0.85';
    dragPreview.style.width = `${blockWidth}px`;
    dragPreview.style.transition = 'none';
    dragPreview.className = 'zen-pomodoro-drag-preview';

    dragIndices.forEach(idx => {
      if (allBlocks[idx]) {
        const clone = allBlocks[idx].cloneNode(true);
        clone.classList.remove('selected');
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        dragPreview.appendChild(clone);
      }
    });

    dragPreview.style.left = `${blockRect.left}px`;
    dragPreview.style.top = `${startY - offsetY}px`;
    document.documentElement.appendChild(dragPreview);

    return { dragPreview, offsetY };
  }

  /**
   * Apply the drag/drop operation (move or duplicate) based on target index.
   * @param {number} lastTargetIndex - Drop target index relative to non-dragged blocks
   * @param {Array<number>} dragIndices - Indices of dragged blocks
   * @param {boolean} isMultiSelect - Whether multiple blocks were selected
   * @returns {boolean} True if an operation was applied, false if no-op
   * @private
   */
  _applyDragOperation(lastTargetIndex, dragIndices, isMultiSelect) {
    if (lastTargetIndex < 0) return false;

    const absoluteTarget = this._computeAbsoluteTarget(lastTargetIndex, dragIndices);

    // Check if single-block move would result in no change
    if (this._isSamePositionMove(absoluteTarget, isMultiSelect)) return false;

    if (this.isDuplicating) {
      this._duplicateBlocks(dragIndices, absoluteTarget);
    } else if (isMultiSelect) {
      this._moveMultipleBlocks(dragIndices, absoluteTarget);
    } else {
      this.reorderBlocks(this.draggedBlockIndex, absoluteTarget);
    }
    return true;
  }

  /**
   * Compute the absolute target index from a relative drop position.
   * @param {number} relativeTarget - Target index among non-dragged blocks
   * @param {Array<number>} dragIndices - Indices of blocks being dragged
   * @returns {number} Absolute target index in the full blocks array
   * @private
   */
  _computeAbsoluteTarget(relativeTarget, dragIndices) {
    const nonDraggedIndices = [];
    for (let i = 0; i < this.currentEditingCycle.blocks.length; i++) {
      if (!dragIndices.includes(i)) {
        nonDraggedIndices.push(i);
      }
    }
    return relativeTarget >= nonDraggedIndices.length
      ? this.currentEditingCycle.blocks.length
      : nonDraggedIndices[relativeTarget];
  }

  /**
   * Check if a single-block drag would result in no position change.
   * @param {number} absoluteTarget - Target index in the full blocks array
   * @param {boolean} isMultiSelect - Whether multiple blocks are selected
   * @returns {boolean} True if the move is a no-op
   * @private
   */
  _isSamePositionMove(absoluteTarget, isMultiSelect) {
    if (this.isDuplicating || isMultiSelect) return false;
    const from = this.draggedBlockIndex;
    return absoluteTarget === from || absoluteTarget === from + 1;
  }

  /**
   * Clean up visual state after a drag operation ends.
   * @param {Array<HTMLElement>} allBlocks - All block DOM elements
   * @param {HTMLElement} dropIndicator - Drop indicator element
   * @param {Array<HTMLElement>} ghostBlocks - Ghost block elements
   * @private
   */
  _cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks) {
    if (dropIndicator && dropIndicator.parentElement) {
      dropIndicator.remove();
    }
    ghostBlocks.forEach((g) => {
      if (g && g.parentElement) {
        g.remove();
      }
    });
    
    // Remove any orphaned indicators or ghosts from container
    const container = allBlocks[0]?.parentElement;
    if (container) {
      container.querySelectorAll('.zen-pomodoro-cycle-drop-indicator').forEach((el) => {
        el.remove();
      });
      container.querySelectorAll('.zen-pomodoro-cycle-block-ghost').forEach((el) => {
        el.remove();
      });
    }
    
    allBlocks.forEach(block => {
      block.classList.remove('dragging', 'drag-transition');
    });
  }

  /**
   * Compute the reference element for drop indicator positioning.
   * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
   * @param {number} targetIndex - Target insertion index
   * @returns {HTMLElement|null} Reference element to insert before, or null to append
   * @private
   */
  _getDropIndicatorRef(nonDraggedBlocks, targetIndex) {
    if (targetIndex < nonDraggedBlocks.length) {
      return nonDraggedBlocks[targetIndex];
    }
    const lastNonDragged = nonDraggedBlocks[nonDraggedBlocks.length - 1];
    return (lastNonDragged && lastNonDragged.nextSibling) || null;
  }

  /**
   * Position the drop indicator at the correct location in the container.
   * @param {HTMLElement} container - Blocks container element
   * @param {HTMLElement} dropIndicator - Drop indicator element
   * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
   * @param {number} targetIndex - Target insertion index
   * @private
   */
  _positionDropIndicator(container, dropIndicator, nonDraggedBlocks, targetIndex) {
    dropIndicator.style.display = 'block';
    const newRef = this._getDropIndicatorRef(nonDraggedBlocks, targetIndex);

    // Only update DOM if position changed (prevents flickering)
    if (newRef !== this._lastIndicatorRef) {
      this._lastIndicatorRef = newRef;
      if (newRef) {
        container.insertBefore(dropIndicator, newRef);
      } else {
        container.appendChild(dropIndicator);
      }
    }
  }

  /**
   * Show ghost blocks at the drop indicator position for duplication preview.
   * @param {HTMLElement} container - Blocks container
   * @param {HTMLElement} dropIndicator - Drop indicator element
   * @param {Array<HTMLElement>} ghostBlocks - Ghost block elements
   * @private
   */
  _showGhostBlocks(container, dropIndicator, ghostBlocks) {
    ghostBlocks.forEach((g) => {
      g.remove();
    });
    ghostBlocks.forEach((ghost) => {
      ghost.style.display = '';
      container.insertBefore(ghost, dropIndicator);
    });
  }

  /**
   * Update auto-scroll state based on pointer position relative to container edges.
   * @param {number} clientY - Current pointer Y position
   * @param {HTMLElement} scrollContainer - Scrollable container element
   * @param {Object} scrollState - Mutable state object with rafId and direction
   * @param {Object} options - Auto-scroll options
   * @param {number} options.zone - Distance from edge to trigger scrolling (px)
   * @param {number} options.scrollSpeed - Scroll speed per animation frame (px)
   * @param {Function} options.onScroll - Callback to update drop target during scroll
   * @private
   */
  _updateAutoScroll(clientY, scrollContainer, scrollState, { zone, scrollSpeed, onScroll }) {
    const containerRect = scrollContainer.getBoundingClientRect();
    let newScrollDir = null;
    if (clientY < containerRect.top + zone) {
      newScrollDir = 'up';
    } else if (clientY > containerRect.bottom - zone) {
      newScrollDir = 'down';
    }

    if (newScrollDir === scrollState.direction) return;

    // Stop any existing scroll
    if (scrollState.rafId) {
      cancelAnimationFrame(scrollState.rafId);
      scrollState.rafId = null;
    }
    scrollState.direction = newScrollDir;
    if (scrollState.direction) {
      logger.log(Constants.LOG_CATEGORIES.MENU, `Auto-scroll activated (${scrollState.direction})`);
      const scrollDelta = scrollState.direction === 'up' ? -scrollSpeed : scrollSpeed;
      const doScroll = () => {
        scrollContainer.scrollTop += scrollDelta;
        // Recalculate drop target as scroll position changes
        if (onScroll) {
          onScroll(clientY);
        }
        scrollState.rafId = requestAnimationFrame(doScroll);
      };
      scrollState.rafId = requestAnimationFrame(doScroll);
    }
  }

  /**
   * Push current cycle state to undo stack.
   * @private
   */
  _pushUndoState() {
    if (this.currentUndoRedo) {
      this.currentUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    }
  }

  /**
   * Delete all currently selected blocks, with validation.
   * Shows an error dialog if all blocks would be deleted.
   * @private
   */
  _deleteSelectedBlocks() {
    const indicesToDelete = Array.from(this.selectedBlockIndices).sort((a, b) => b - a);

    // Check if we'd delete all blocks
    if (indicesToDelete.length >= this.currentEditingCycle.blocks.length) {
      this._showValidationError('A cycle must have at least one block.');
      return;
    }

    // Delete in reverse order to maintain indices
    for (const idx of indicesToDelete) {
      this.currentEditingCycle.blocks.splice(idx, 1);
    }

    logger.log(LOG_CATEGORIES.MENU, `Deleted ${indicesToDelete.length} selected block(s)`);

    // Clear selection and re-render
    this.selectedBlockIndices.clear();
    const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
    if (blocksContainer) {
      this._renderBlocks(blocksContainer);
    }
    this._pushUndoState();
  }

  /**
   * Calculate the drop target index based on mouse Y position.
   * Returns the index among non-dragged blocks where the drop should occur.
   * @param {HTMLElement} container - The blocks container
   * @param {number} clientY - Mouse Y position
   * @param {Array<number>} dragIndices - Indices of blocks being dragged
   * @returns {number} Target insertion index among non-dragged blocks
   * @private
   */
  _getDropTargetIndex(container, clientY, dragIndices) {
    const allBlocks = Array.from(container.querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)'));
    const nonDraggedBlocks = allBlocks.filter((_, idx) => !dragIndices.includes(idx));

    // Find the position among non-dragged blocks
    for (let i = 0; i < nonDraggedBlocks.length; i++) {
      const rect = nonDraggedBlocks[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) {
        return i;
      }
    }
    
    return nonDraggedBlocks.length; // After all blocks
  }

  /**
   * Get the element after which the dragged element should be inserted.
   * @param {HTMLElement} container - Container element
   * @param {number} y - Mouse Y position
   * @returns {HTMLElement|null} Element after which to insert
   * @private
   */
  _getDragAfterElement(container, y) {
    const draggableElements = [
      ...container.querySelectorAll('.zen-pomodoro-cycle-block:not(.dragging)'),
    ];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  }

  /**
   * Show menu to add a new block.
   * @param {HTMLElement} blocksContainer - Container for blocks
   * @private
   */
  _showAddBlockMenu(blocksContainer) {
    const menu = document.createElement('div');
    menu.className = 'zen-pomodoro-dialog active zen-pomodoro-add-block-menu';
    menu.setAttribute(DATA_NO_POSITION_SAVE, 'true');

    const title = document.createElement('h2');
    title.textContent = 'Add Block';

    const description = document.createElement('p');
    description.textContent = 'Choose the type of block to add:';
    description.style.marginBottom = '16px';
    description.style.fontSize = '13px';

    // Block type buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'zen-pomodoro-dialog-buttons';
    buttonsDiv.style.flexDirection = 'column';
    buttonsDiv.style.gap = '8px';

    const focusButton = document.createElement('button');
    focusButton.className = 'zen-pomodoro-dialog-button';
    focusButton.textContent = '🎯 Focus Block (25 min)';
    focusButton.addEventListener('click', () => {
      this.addBlock('focus', 25);
      menu.remove();
      this._renderBlocks(blocksContainer);
    });

    const breakButton = document.createElement('button');
    breakButton.className = 'zen-pomodoro-dialog-button';
    breakButton.textContent = '☕ Break Block (5 min)';
    breakButton.addEventListener('click', () => {
      this.addBlock('break', 5);
      menu.remove();
      this._renderBlocks(blocksContainer);
    });

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zen-pomodoro-dialog-button secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      menu.remove();
    });

    buttonsDiv.appendChild(focusButton);
    buttonsDiv.appendChild(breakButton);
    buttonsDiv.appendChild(cancelButton);

    menu.appendChild(title);
    menu.appendChild(description);
    menu.appendChild(buttonsDiv);

    applyLastDialogPosition(menu);
    document.documentElement.appendChild(menu);
  }

  /**
   * Add a new block to the current editing cycle.
   * @param {string} type - Block type ('focus' or 'break')
   * @param {number} duration - Duration in minutes
   */
  addBlock(type, duration) {
    this.currentEditingCycle.blocks.push({ type, duration });
    logger.log(LOG_CATEGORIES.MENU, `Added ${type} block (${duration} min)`);
  }

  /**
   * Remove a block from the current editing cycle.
   * @param {number} index - Index of block to remove
   */
  removeBlock(index) {
    if (this.currentEditingCycle.blocks.length <= 1) {
      // Show error - must have at least one block
      const errorDialog = document.createElement('div');
      errorDialog.className = 'zen-pomodoro-dialog active';
      errorDialog.setAttribute(DATA_NO_POSITION_SAVE, 'true');

      const title = document.createElement('h2');
      title.textContent = 'Cannot Delete';

      const message = document.createElement('p');
      message.textContent = 'A cycle must have at least one block.';
      message.style.marginBottom = '20px';

      const okButton = document.createElement('button');
      okButton.className = 'zen-pomodoro-dialog-button';
      okButton.textContent = 'OK';
      okButton.addEventListener('click', () => {
        errorDialog.remove();
      });

      errorDialog.appendChild(title);
      errorDialog.appendChild(message);
      errorDialog.appendChild(okButton);

      applyLastDialogPosition(errorDialog);
      document.documentElement.appendChild(errorDialog);
      return;
    }

    this.currentEditingCycle.blocks.splice(index, 1);
    logger.log(LOG_CATEGORIES.MENU, `Removed block at index ${index}`);
    
    // Re-render blocks
    const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
    if (blocksContainer) {
      this._renderBlocks(blocksContainer);
    }
  }

  /**
   * Reorder blocks by moving a block from one index to another.
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Target index
   */
  reorderBlocks(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    const block = this.currentEditingCycle.blocks[fromIndex];
    this.currentEditingCycle.blocks.splice(fromIndex, 1);
    // Adjust target index: after removing the block at fromIndex,
    // all indices above it shift down by 1
    const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    this.currentEditingCycle.blocks.splice(adjustedIndex, 0, block);
    
    logger.log(LOG_CATEGORIES.MENU, `Reordered block from ${fromIndex} to ${adjustedIndex}`);
    
    // Re-render blocks to update indices
    const blocksContainer = document.getElementById('zen-pomodoro-cycle-blocks');
    if (blocksContainer) {
      this._renderBlocks(blocksContainer);
    }
  }

  /**
   * Validate the current editing cycle.
   * @returns {boolean} True if valid
   * @private
   */
  _validateCycle() {
    if (!this.currentEditingCycle.name || this.currentEditingCycle.name.trim() === '') {
      this._showValidationError('Please enter a name for the cycle.');
      return false;
    }

    if (this.currentEditingCycle.blocks.length === 0) {
      this._showValidationError('A cycle must have at least one block.');
      return false;
    }

    // Check that all blocks have valid durations
    for (const block of this.currentEditingCycle.blocks) {
      if (!isValidRangeValue(block.duration, 1, 120)) {
        this._showValidationError('All blocks must have a duration between 1 and 120 minutes.');
        return false;
      }
    }

    return true;
  }

  /**
   * Show a validation error dialog.
   * @param {string} message - Error message
   * @private
   */
  _showValidationError(message) {
    const errorDialog = document.createElement('div');
    errorDialog.className = 'zen-pomodoro-dialog active';
    errorDialog.setAttribute(DATA_NO_POSITION_SAVE, 'true');

    const title = document.createElement('h2');
    title.textContent = 'Validation Error';

    const messageP = document.createElement('p');
    messageP.textContent = message;
    messageP.style.marginBottom = '20px';

    const okButton = document.createElement('button');
    okButton.className = 'zen-pomodoro-dialog-button';
    okButton.textContent = 'OK';
    okButton.addEventListener('click', () => {
      errorDialog.remove();
    });

    errorDialog.appendChild(title);
    errorDialog.appendChild(messageP);
    errorDialog.appendChild(okButton);

    applyLastDialogPosition(errorDialog);
    document.documentElement.appendChild(errorDialog);
  }

  /**
   * Save the current editing cycle.
   */
  saveCycle() {
    const config = getConfig();
    const savedCycles = config.customCycles || [];
    
    // Find if cycle already exists
    const existingIndex = savedCycles.findIndex((c) => c.id === this.currentEditingCycle.id);
    
    if (existingIndex !== -1) {
      // Update existing cycle
      savedCycles[existingIndex] = this.currentEditingCycle;
      logger.log(LOG_CATEGORIES.MENU, `Updated custom cycle: ${this.currentEditingCycle.name}`);
    } else {
      // Add new cycle
      savedCycles.push(this.currentEditingCycle);
      logger.log(LOG_CATEGORIES.MENU, `Created new custom cycle: ${this.currentEditingCycle.name}`);
    }
    
    config.customCycles = savedCycles;
    saveConfig(config);
    
    this.currentEditingCycle = null;
  }

  /**
   * Delete a saved cycle.
   * @param {string} cycleId - ID of cycle to delete
   */
  deleteCycle(cycleId) {
    const config = getConfig();
    const savedCycles = config.customCycles || [];
    
    const index = savedCycles.findIndex((c) => c.id === cycleId);
    if (index !== -1) {
      const cycleName = savedCycles[index].name;
      savedCycles.splice(index, 1);
      config.customCycles = savedCycles;
      saveConfig(config);
      logger.log(LOG_CATEGORIES.MENU, `Deleted custom cycle: ${cycleName}`);
    }
  }

  /**
   * Get all saved custom cycles.
   * @returns {Array} Array of saved cycles
   */
  getSavedCycles() {
    const config = getConfig();
    return config.customCycles || [];
  }

  /**
   * Generate a unique ID for a new cycle.
   * @returns {string} Unique cycle ID
   * @private
   */
  _generateCycleId() {
    return `cycle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default CustomCycleManager;
