import Constants from './constants.js';
import { logger } from './log-manager.js';
import {
  getConfig, saveConfig, validateIntegerInput,
  LOG_CATEGORIES, DATA_NO_POSITION_SAVE, isValidRangeValue
} from './helpers.js';
import {
  setupDialogDrag, applyLastDialogPosition, saveDialogPosition
} from './ui-helpers.js';
import UndoRedoManager from './undo-redo-manager.js';
import {
  createDragPreview, cleanupDragVisuals, getDropIndicatorRef,
  showGhostBlocks, updateAutoScroll,
  computeAbsoluteTarget, calculateBlockTransforms, calculateDropIndicatorOffset
} from './drag-utils.js';

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
   * Load existing cycle or create a new one.
   * @param {string|null} cycleId - ID of cycle to edit, or null to create new
   * @returns {boolean} True if successful, false if cycle not found
   * @private
   */
  _loadOrCreateCycle(cycleId) {
    const config = getConfig();
    const savedCycles = config.customCycles || [];
    
    if (cycleId) {
      this.currentEditingCycle = savedCycles.find((c) => c.id === cycleId);
      if (!this.currentEditingCycle) {
        logger.log(LOG_CATEGORIES.MENU, `Cycle ${cycleId} not found`);
        return false;
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
    return true;
  }

  /**
   * Create header section with back button, title, and undo/redo buttons.
   * @param {HTMLElement} dialog - Parent dialog element
   * @param {string|null} cycleId - ID of cycle being edited
   * @param {UndoRedoManager} cycleUndoRedo - Undo/redo manager instance
   * @returns {HTMLElement} Header row element
   * @private
   */
  _createEditorHeaderSection(dialog, cycleId, cycleUndoRedo) {
    const backButton = document.createElement('button');
    backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
    backButton.textContent = '← Back';
    backButton.addEventListener('click', () => {
      saveDialogPosition(dialog);
      dialog.remove();
      this.editingCycleDialog = null;
      this.showCustomCyclesMenu();
    });

    const title = document.createElement('h2');
    title.className = 'zen-pomodoro-dialog-title';
    title.textContent = cycleId ? 'Edit Custom Cycle' : 'Create Custom Cycle';

    const undoRedoButtons = cycleUndoRedo.createButtons();

    // Create header row for back button and undo/redo
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '8px';
    backButton.style.marginBottom = '0';
    headerRow.appendChild(backButton);
    headerRow.appendChild(undoRedoButtons);

    return { headerRow, title };
  }

  /**
   * Create cycle name input section.
   * @param {UndoRedoManager} cycleUndoRedo - Undo/redo manager instance
   * @returns {Object} Object with nameRow element and nameInput element
   * @private
   */
  _createCycleNameInput(cycleUndoRedo) {
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
    return { nameRow, nameInput };
  }

  /**
   * Create a single duration input container.
   * @param {string} label - Label text
   * @param {number} value - Current value
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {Function} onChangeCallback - Callback when value changes
   * @param {UndoRedoManager} cycleUndoRedo - Undo/redo manager instance
   * @returns {Object} Object with container and input elements
   * @private
   */
  _createDurationInputContainer(label, value, min, max, onChangeCallback, cycleUndoRedo) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.flex = '1';
    
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.style.fontSize = '12px';
    labelElement.style.marginBottom = '4px';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'zen-pomodoro-dialog-input';
    input.min = String(min);
    input.max = String(max);
    input.value = value;
    input.style.width = '100%';
    input.addEventListener('change', () => {
      const validated = validateIntegerInput(input.value, min, max, value);
      input.value = validated;
      onChangeCallback(validated);
      // Push undo state after duration change
      cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    });
    
    container.appendChild(labelElement);
    container.appendChild(input);

    return { container, input };
  }

  /**
   * Create default duration inputs section.
   * @param {UndoRedoManager} cycleUndoRedo - Undo/redo manager instance
   * @returns {Object} Object with durationRow and input elements
   * @private
   */
  _createDefaultDurationsSection(cycleUndoRedo) {
    const durationRow = document.createElement('div');
    durationRow.className = 'zen-pomodoro-config-row';
    durationRow.style.display = 'flex';
    durationRow.style.gap = '16px';
    durationRow.style.alignItems = 'center';
    durationRow.style.marginTop = '12px';

    // Focus block duration
    const { container: focusDurationContainer, input: focusDurationInput } = this._createDurationInputContainer(
      'Focus Block Duration (min):',
      this.currentEditingCycle.defaultFocusDuration,
      1,
      120,
      (validated) => { this.currentEditingCycle.defaultFocusDuration = validated; },
      cycleUndoRedo
    );

    // Break block duration
    const { container: breakDurationContainer, input: breakDurationInput } = this._createDurationInputContainer(
      'Break Block Duration (min):',
      this.currentEditingCycle.defaultBreakDuration,
      1,
      120,
      (validated) => { this.currentEditingCycle.defaultBreakDuration = validated; },
      cycleUndoRedo
    );

    // Transition block duration
    const { container: transitionDurationContainer, input: transitionDurationInput } = this._createDurationInputContainer(
      'Transition Duration (min):',
      this.currentEditingCycle.defaultTransitionDuration,
      1,
      15,
      (validated) => { this.currentEditingCycle.defaultTransitionDuration = validated; },
      cycleUndoRedo
    );

    durationRow.appendChild(focusDurationContainer);
    durationRow.appendChild(breakDurationContainer);
    durationRow.appendChild(transitionDurationContainer);

    return {
      durationRow,
      focusDurationInput,
      breakDurationInput,
      transitionDurationInput
    };
  }

  /**
   * Create blocks management section with list and add controls.
   * @param {HTMLElement} blocksContainer - Container for blocks list
   * @param {UndoRedoManager} cycleUndoRedo - Undo/redo manager instance
   * @returns {Object} Object with blocksLabel and addBlockRow elements
   * @private
   */
  _createBlocksManagementSection(blocksContainer, cycleUndoRedo) {
    const blocksLabel = document.createElement('label');
    blocksLabel.textContent = 'Timer Blocks:';
    blocksLabel.style.display = 'block';
    blocksLabel.style.marginTop = '20px';
    blocksLabel.style.marginBottom = '8px';
    blocksLabel.style.fontWeight = 'bold';

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

    return { blocksLabel, addBlockRow };
  }

  /**
   * Create footer buttons (save and cancel).
   * @param {HTMLElement} dialog - Parent dialog element
   * @param {string|null} cycleId - ID of cycle being edited
   * @returns {HTMLElement} Button container element
   * @private
   */
  _createEditorFooterButtons(dialog) {
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

    return buttonDiv;
  }

  /**
   * Setup undo/redo state restoration handlers.
   * @param {UndoRedoManager} cycleUndoRedo - Undo/redo manager instance
   * @param {HTMLInputElement} nameInput - Name input element
   * @param {HTMLInputElement} focusDurationInput - Focus duration input
   * @param {HTMLInputElement} breakDurationInput - Break duration input
   * @param {HTMLInputElement} transitionDurationInput - Transition duration input
   * @param {HTMLElement} blocksContainer - Blocks container element
   * @private
   */
  _setupUndoRedoHandlers(cycleUndoRedo, nameInput, focusDurationInput, breakDurationInput, transitionDurationInput, blocksContainer) {
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
  }

  /**
   * Show the cycle editor for creating or editing a cycle.
   * @param {string|null} cycleId - ID of cycle to edit, or null to create new
   */
  showCycleEditor(cycleId = null) {
    logger.log(LOG_CATEGORIES.MENU, cycleId ? 'Editing custom cycle' : 'Creating new custom cycle');

    // Load or create cycle
    if (!this._loadOrCreateCycle(cycleId)) {
      return;
    }


    const dialog = document.createElement('div');
    dialog.id = 'zen-pomodoro-cycle-editor-dialog';
    dialog.className = 'zen-pomodoro-dialog active zen-pomodoro-cycle-editor-dialog';
    this.editingCycleDialog = dialog;

    // Undo/Redo for cycle editing
    const cycleUndoRedo = new UndoRedoManager();
    cycleUndoRedo.pushState(JSON.parse(JSON.stringify(this.currentEditingCycle)));
    this.currentUndoRedo = cycleUndoRedo;

    // Create UI sections
    const { headerRow, title } = this._createEditorHeaderSection(dialog, cycleId, cycleUndoRedo);
    const { nameRow, nameInput } = this._createCycleNameInput(cycleUndoRedo);
    const {
      durationRow,
      focusDurationInput,
      breakDurationInput,
      transitionDurationInput
    } = this._createDefaultDurationsSection(cycleUndoRedo);

    const blocksContainer = document.createElement('div');
    blocksContainer.className = 'zen-pomodoro-cycle-blocks-container';
    blocksContainer.id = 'zen-pomodoro-cycle-blocks';

    const { blocksLabel, addBlockRow } = this._createBlocksManagementSection(blocksContainer, cycleUndoRedo);
    const buttonDiv = this._createEditorFooterButtons(dialog);

    // Setup undo/redo handlers
    this._setupUndoRedoHandlers(
      cycleUndoRedo,
      nameInput,
      focusDurationInput,
      breakDurationInput,
      transitionDurationInput,
      blocksContainer
    );

    // Assemble dialog
    dialog.appendChild(headerRow);
    dialog.appendChild(title);
    dialog.appendChild(nameRow);
    dialog.appendChild(durationRow);
    dialog.appendChild(blocksLabel);
    dialog.appendChild(blocksContainer);
    dialog.appendChild(addBlockRow);
    dialog.appendChild(buttonDiv);

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
   * Create block info section with type label, duration input, and minutes label.
   * @param {Object} block - Block object
   * @param {number} index - Block index
   * @returns {Object} Object with infoDiv and durationInput elements
   * @private
   */
  _createBlockInfoSection(block, index) {
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

    return { infoDiv, durationInput };
  }

  /**
   * Handle click event on block for multi-select.
   * @param {MouseEvent} e - Click event
   * @param {HTMLElement} blockDiv - Block element
   * @param {number} index - Block index
   * @param {HTMLInputElement} durationInput - Duration input element
   * @param {HTMLElement} deleteButton - Delete button element
   * @private
   */
  _handleBlockClick(e, blockDiv, index, durationInput, deleteButton) {
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
  }

  /**
   * Handle pointerdown event on block for drag.
   * @param {PointerEvent} e - Pointerdown event
   * @param {HTMLElement} blockDiv - Block element
   * @param {number} index - Block index
   * @param {HTMLInputElement} durationInput - Duration input element
   * @param {HTMLElement} deleteButton - Delete button element
   * @private
   */
  _handleBlockPointerDown(e, blockDiv, index, durationInput, deleteButton) {
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
  }

  /**
   * Setup event handlers for block element (click and pointerdown).
   * @param {HTMLElement} blockDiv - Block div element
   * @param {number} index - Block index
   * @param {HTMLInputElement} durationInput - Duration input element
   * @param {HTMLElement} deleteButton - Delete button element
   * @private
   */
  _setupBlockEventHandlers(blockDiv, index, durationInput, deleteButton) {
    // Shift+Click handler for multi-select
    blockDiv.addEventListener('click', (e) => {
      this._handleBlockClick(e, blockDiv, index, durationInput, deleteButton);
    });

    // Custom pointer-based drag on entire block (supports mouse and touch)
    blockDiv.addEventListener('pointerdown', (e) => {
      this._handleBlockPointerDown(e, blockDiv, index, durationInput, deleteButton);
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

    // Block info section
    const { infoDiv, durationInput } = this._createBlockInfoSection(block, index);

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

    // Setup event handlers
    this._setupBlockEventHandlers(blockDiv, index, durationInput, deleteButton);

    return blockDiv;
  }

  /**
   * Initialize drag state and determine drag indices.
   * @param {MouseEvent} e - The pointer event
   * @param {number} index - The index of the block being dragged
   * @returns {Object} Object with isMultiSelect and dragIndices
   * @private
   */
  _initializeDragState(e, index) {
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

    return { isMultiSelect, dragIndices };
  }

  /**
   * Setup visual elements for drag operation (classes, indicator, ghosts).
   * @param {HTMLElement} container - The blocks container
   * @param {Array<HTMLElement>} allBlocks - All block elements
   * @param {Array<number>} dragIndices - Indices being dragged
   * @returns {Object} Object with dropIndicator and ghostBlocks
   * @private
   */
  _setupDragVisuals(container, allBlocks, dragIndices) {
    // Mark all dragged blocks (now shows at reduced opacity, keeps height)
    dragIndices.forEach(idx => {
      if (allBlocks[idx]) allBlocks[idx].classList.add('dragging');
    });

    // Add transition class to ALL blocks for smooth transform animation
    allBlocks.forEach(block => {
      block.classList.add('drag-transition');
    });

    // Create drop indicator - positioned absolutely within container
    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'zen-pomodoro-cycle-drop-indicator';
    dropIndicator.style.display = 'none';
    dropIndicator.style.position = 'absolute';
    dropIndicator.style.left = '0';
    dropIndicator.style.right = '0';
    container.appendChild(dropIndicator);

    // Ensure container has position: relative for absolute indicator positioning
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

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

    // Reset cached indicator position for new drag
    this._lastIndicatorRef = null;

    return { dropIndicator, ghostBlocks };
  }

  /**
   * Create pointer move handler for drag operation.
   * @param {Object} dragContext - Drag operation context
   * @param {HTMLElement} dragContext.dragPreview - Floating drag preview element
   * @param {number} dragContext.offsetY - Y offset for drag preview positioning
   * @param {HTMLElement} dragContext.container - Blocks container
   * @param {Array<HTMLElement>} dragContext.allBlocks - All block elements
   * @param {Array<number>} dragContext.dragIndices - Indices being dragged
   * @param {HTMLElement} dragContext.dropIndicator - Drop indicator element
   * @param {Array<HTMLElement>} dragContext.ghostBlocks - Ghost block elements
   * @param {Array<number>} dragContext.blockHeightsWithGap - Block heights including gaps
   * @param {Array<number>} dragContext.cachedNonDraggedMidpoints - Midpoints of non-dragged blocks
   * @returns {Object} Object with onPointerMove handler, state refs, and updateDropTarget function
   * @private
   */
  _createPointerMoveHandler(dragContext) {
    const { dragPreview, offsetY, container, allBlocks, dragIndices, dropIndicator, ghostBlocks, blockHeightsWithGap, cachedNonDraggedMidpoints } = dragContext;
    let lastTargetIndex = -1;
    let rafId = null;
    let lastPointerY;

    // Auto-scroll variables for dragging near container edges
    const SCROLL_ZONE = 40; // px from edge to trigger auto-scroll
    const SCROLL_SPEED = 4; // px per frame
    const scrollState = { rafId: null, direction: null };

    // Shared function to update drop target position based on pointer Y
    const updateDropTarget = (clientY) => {
      // Calculate container-relative Y position
      const containerRect = container.getBoundingClientRect();
      const containerRelativeY = clientY - containerRect.top + container.scrollTop;

      // Find target index using cached midpoints (unaffected by transforms)
      let targetIndex = cachedNonDraggedMidpoints.length; // default: after all
      for (let i = 0; i < cachedNonDraggedMidpoints.length; i++) {
        if (containerRelativeY < cachedNonDraggedMidpoints[i]) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === lastTargetIndex) return;
      lastTargetIndex = targetIndex;

      if (targetIndex < 0) return;

      // Calculate CSS transforms for all blocks
      const transforms = calculateBlockTransforms(dragIndices, targetIndex, blockHeightsWithGap);
      
      // Apply transforms to all blocks
      allBlocks.forEach((block, idx) => {
        block.style.transform = transforms[idx] !== 0 ? `translateY(${transforms[idx]}px)` : '';
      });

      // Position drop indicator at the gap boundary
      const indicatorOffset = calculateDropIndicatorOffset(dragIndices, targetIndex, blockHeightsWithGap);
      dropIndicator.style.display = 'block';
      dropIndicator.style.top = `${indicatorOffset}px`;

      // Show ghost blocks for duplication mode
      if (this.isDuplicating && ghostBlocks.length > 0) {
        showGhostBlocks(container, dropIndicator, ghostBlocks);
      }
    };

    const onPointerMove = (pointerMoveEvent) => {
      lastPointerY = pointerMoveEvent.clientY;
      
      // Update floating drag preview position
      dragPreview.style.top = `${lastPointerY - offsetY}px`;
      
      // Handle auto-scroll near container edges (not throttled by rAF)
      updateAutoScroll(lastPointerY, container, scrollState, {
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

    return {
      onPointerMove,
      getLastTargetIndex: () => lastTargetIndex,
      getRafId: () => rafId,
      getScrollState: () => scrollState
    };
  }

  /**
   * Create cleanup handler for drag operation.
   * @param {Object} cleanupContext - Cleanup context
   * @param {Function} cleanupContext.onPointerMove - Pointer move handler
   * @param {HTMLElement} cleanupContext.dragPreview - Floating drag preview element
   * @param {Array<HTMLElement>} cleanupContext.allBlocks - All block elements
   * @param {HTMLElement} cleanupContext.dropIndicator - Drop indicator element
   * @param {Array<HTMLElement>} cleanupContext.ghostBlocks - Ghost block elements
   * @param {Array<number>} cleanupContext.dragIndices - Indices being dragged
   * @param {boolean} cleanupContext.isMultiSelect - Whether multi-select drag
   * @param {Object} cleanupContext.stateRefs - References to drag state
   * @returns {Function} Cleanup handler function
   * @private
   */
  _createDragCleanup(cleanupContext) {
    const { onPointerMove, dragPreview, allBlocks, dropIndicator, ghostBlocks, dragIndices, isMultiSelect, stateRefs } = cleanupContext;
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', this.dragCleanup);
      document.removeEventListener('pointercancel', this.dragCleanup);
      
      // Remove floating drag preview
      if (dragPreview.parentElement) dragPreview.remove();
      
      const rafId = stateRefs.getRafId();
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      // Stop auto-scroll
      const scrollState = stateRefs.getScrollState();
      if (scrollState.rafId) {
        cancelAnimationFrame(scrollState.rafId);
        scrollState.rafId = null;
      }

      cleanupDragVisuals(allBlocks, dropIndicator, ghostBlocks);
      const lastTargetIndex = stateRefs.getLastTargetIndex();
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
  }

  /**
   * Start a custom pointer-based block drag operation.
   * @param {MouseEvent} e - The mousedown event
   * @param {HTMLElement} blockDiv - The block element being dragged
   * @param {number} index - The index of the block being dragged
   * @private
   */
  _startBlockDrag(e, blockDiv, index) {
    const container = blockDiv.parentElement;
    if (!container) return;

    // Initialize drag state
    const { isMultiSelect, dragIndices } = this._initializeDragState(e, index);

    // Capture dimensions BEFORE adding dragging class
    const allBlocks = Array.from(container.querySelectorAll('.zen-pomodoro-cycle-block:not(.zen-pomodoro-cycle-block-ghost)'));
    
    // Cache block layout info for transform-based drag (unaffected by CSS transforms)
    const cachedBlockInfo = allBlocks.map(block => ({
      top: block.offsetTop,
      height: block.offsetHeight,
    }));
    // Calculate total height per block including gap
    const blockHeights = cachedBlockInfo.map(info => info.height);
    // Account for gap between blocks (CSS gap on container)
    const containerGap = parseFloat(getComputedStyle(container).gap) || 0;
    const blockHeightsWithGap = blockHeights.map((h, i) => h + (i < blockHeights.length - 1 ? containerGap : 0));

    // Cache non-dragged midpoints for target calculation
    const cachedNonDraggedMidpoints = [];
    allBlocks.forEach((block, idx) => {
      if (!dragIndices.includes(idx)) {
        cachedNonDraggedMidpoints.push(cachedBlockInfo[idx].top + cachedBlockInfo[idx].height / 2);
      }
    });

    const { dragPreview, offsetY } = createDragPreview(e, blockDiv, allBlocks, dragIndices);

    // Setup visual elements
    const { dropIndicator, ghostBlocks } = this._setupDragVisuals(container, allBlocks, dragIndices);

    // Create pointer move handler
    const stateRefs = this._createPointerMoveHandler({
      dragPreview, offsetY, container, allBlocks, dragIndices,
      dropIndicator, ghostBlocks, blockHeightsWithGap, cachedNonDraggedMidpoints,
    });

    // Create cleanup handler
    this.dragCleanup = this._createDragCleanup({
      onPointerMove: stateRefs.onPointerMove, dragPreview, allBlocks,
      dropIndicator, ghostBlocks, dragIndices, isMultiSelect, stateRefs,
    });

    // Register event listeners
    document.addEventListener('pointermove', stateRefs.onPointerMove);
    document.addEventListener('pointerup', this.dragCleanup);
    document.addEventListener('pointercancel', this.dragCleanup);
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

    const absoluteTarget = computeAbsoluteTarget(lastTargetIndex, dragIndices, this.currentEditingCycle.blocks.length);

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
   * Position the drop indicator at the correct location in the container.
   * @param {HTMLElement} container - Blocks container element
   * @param {HTMLElement} dropIndicator - Drop indicator element
   * @param {Array<HTMLElement>} nonDraggedBlocks - Non-dragged block elements
   * @param {number} targetIndex - Target insertion index
   * @private
   */
  _positionDropIndicator(container, dropIndicator, nonDraggedBlocks, targetIndex) {
    dropIndicator.style.display = 'block';
    const newRef = getDropIndicatorRef(nonDraggedBlocks, targetIndex);

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
