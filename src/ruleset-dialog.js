import { logger } from './log-manager.js';
import {
  getConfig,
  saveConfig,
  findRuleAndExecute,
  URL_REVOKE_DELAY_MS,
  LOG_CATEGORIES,
} from './helpers.js';
import {
  setupDialogDrag,
  applyLastDialogPosition,
  saveDialogPosition,
  renderListOrEmptyMessage,
} from './ui-helpers.js';
import UndoRedoManager from './undo-redo-manager.js';

/**
 * Show ruleset settings dialog
 * @param {Object} handler - KeyboardShortcutHandler instance
 * @param {Function|null} onClose - Optional callback when dialog closes
 */
export function showRulesetSettingsDialog(handler, onClose = null) {
  logger.log(LOG_CATEGORIES.MENU, 'Opening ruleset settings dialog');

  const dialog = document.createElement('div');
  dialog.id = 'zen-pomodoro-ruleset-dialog';
  dialog.className = 'zen-pomodoro-dialog active';

  const config = getConfig();

  // Back button - returns to settings or closes
  const backButton = document.createElement('button');
  backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
  backButton.textContent = '← Back';
  backButton.addEventListener('click', () => {
    // Save current rulesets before closing
    saveConfig(config);
    saveDialogPosition(dialog);
    dialog.remove();
    if (onClose) {
      onClose();
    } else {
      handler.showPomodoroMenu();
    }
  });

  const h2 = document.createElement('h2');
  h2.textContent = 'Ruleset Settings';

  // Undo/Redo for rulesets
  const rulesetUndoRedo = new UndoRedoManager();
  rulesetUndoRedo.pushState(JSON.parse(JSON.stringify(config)));
  const undoRedoButtons = rulesetUndoRedo.createButtons();

  const configSection = document.createElement('div');
  configSection.className = 'zen-pomodoro-config-section';

  // Description
  const description = document.createElement('p');
  description.style.fontSize = '13px';
  description.style.color = '#888';
  description.style.margin = '0 0 12px 0';
  description.textContent =
    'Configure website and keyword blocking rules. Block websites by domain, path, or keywords in page content.';

  // Rulesets container
  const rulesetsContainer = document.createElement('div');
  rulesetsContainer.className = 'zen-pomodoro-rulesets-container';
  rulesetsContainer.id = 'zen-pomodoro-rulesets-container';

  // Render existing rulesets
  renderRulesets(rulesetsContainer, config);

  // Add New Ruleset button
  const addRulesetRow = document.createElement('div');
  addRulesetRow.className = 'zen-pomodoro-config-row';
  addRulesetRow.style.marginTop = '12px';

  const addRulesetButton = document.createElement('button');
  addRulesetButton.className = 'zen-pomodoro-dialog-button secondary';
  addRulesetButton.id = 'zen-pomodoro-add-ruleset';
  addRulesetButton.textContent = '+ Add Ruleset';
  addRulesetButton.addEventListener('click', () => {
    addNewRuleset(rulesetsContainer, config);
  });
  addRulesetRow.appendChild(addRulesetButton);

  // Export/Import buttons
  const exportImportRow = document.createElement('div');
  exportImportRow.className = 'zen-pomodoro-config-row';
  exportImportRow.style.gap = '8px';
  exportImportRow.style.marginTop = '8px';

  const exportRulesetsButton = document.createElement('button');
  exportRulesetsButton.className = 'zen-pomodoro-dialog-button secondary small';
  exportRulesetsButton.textContent = 'Export Rulesets';
  exportRulesetsButton.addEventListener('click', () => {
    exportRulesets(config);
  });

  const importRulesetsButton = document.createElement('button');
  importRulesetsButton.className = 'zen-pomodoro-dialog-button secondary small';
  importRulesetsButton.textContent = 'Import Rulesets';
  importRulesetsButton.addEventListener('click', () => {
    importRulesets(rulesetsContainer, config);
  });

  exportImportRow.appendChild(exportRulesetsButton);
  exportImportRow.appendChild(importRulesetsButton);

  configSection.appendChild(description);
  configSection.appendChild(rulesetsContainer);
  configSection.appendChild(addRulesetRow);
  configSection.appendChild(exportImportRow);

  // Buttons
  const buttonDiv = document.createElement('div');
  buttonDiv.className = 'zen-pomodoro-dialog-buttons';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'zen-pomodoro-dialog-button secondary';
  cancelButton.id = 'zen-pomodoro-ruleset-cancel';
  cancelButton.textContent = 'Cancel';

  const saveButton = document.createElement('button');
  saveButton.className = 'zen-pomodoro-dialog-button secondary';
  saveButton.id = 'zen-pomodoro-ruleset-save';
  saveButton.textContent = 'Save';

  const saveCloseButton = document.createElement('button');
  saveCloseButton.className = 'zen-pomodoro-dialog-button';
  saveCloseButton.id = 'zen-pomodoro-ruleset-save-close';
  saveCloseButton.textContent = 'Save & Close';

  buttonDiv.appendChild(cancelButton);
  buttonDiv.appendChild(saveButton);
  buttonDiv.appendChild(saveCloseButton);

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
  dialog.appendChild(h2);
  dialog.appendChild(configSection);
  dialog.appendChild(buttonDiv);

  document.documentElement.appendChild(dialog);

  // Track changes for undo/redo
  configSection.addEventListener('change', () => {
    rulesetUndoRedo.pushState(JSON.parse(JSON.stringify(getConfig())));
  });

  // Set restore callback for undo/redo
  rulesetUndoRedo.onStateRestore = (state) => {
    saveConfig(state);
    saveDialogPosition(dialog);
    dialog.remove();
    showRulesetSettingsDialog(handler, onClose);
  };

  // Apply saved position from parent dialog before setting up drag
  applyLastDialogPosition(dialog);

  // Make dialog draggable
  setupDialogDrag(dialog);

  cancelButton.addEventListener('click', () => {
    logger.log(LOG_CATEGORIES.MENU, 'Ruleset settings dialog cancelled');
    dialog.remove();
    if (onClose) {
      onClose();
    }
  });

  // Save button - saves settings but keeps dialog open
  saveButton.addEventListener('click', () => {
    logger.log(LOG_CATEGORIES.SETTINGS, 'Saving ruleset settings');
    saveConfig(config);
    window.zenPomodoroApp?.showCustomAlert('Saved', 'Ruleset settings have been saved.');
  });

  // Save & Close button - saves settings and closes dialog
  saveCloseButton.addEventListener('click', () => {
    logger.log(LOG_CATEGORIES.SETTINGS, 'Saving ruleset settings and closing');
    saveConfig(config);
    dialog.remove();

    if (onClose) {
      onClose();
    }
  });
}

/**
 * Render rulesets in container
 * @param {HTMLElement} container - Container element
 * @param {Object} config - Configuration object
 */
export function renderRulesets(container, config) {
  const rulesets = config.rulesets || [];
  renderListOrEmptyMessage({
    container,
    items: rulesets,
    emptyClass: 'zen-pomodoro-empty-rulesets',
    emptyText: 'No rulesets configured. Add one to start blocking websites.',
    renderItem: (ruleset, index) => {
      const rulesetItem = createRulesetItem(ruleset, index, container, config);
      container.appendChild(rulesetItem);
    },
  });
}

/**
 * Update workspace blocked status in a ruleset.
 * @param {Object} config - Configuration object
 * @param {string} rulesetId - Ruleset ID
 * @param {string} workspaceId - Workspace ID
 * @param {boolean} isBlocked - Whether workspace should be blocked
 */
export function updateRulesetWorkspace(config, rulesetId, workspaceId, isBlocked) {
  const rulesetIndex = config.rulesets.findIndex((r) => r.id === rulesetId);
  if (rulesetIndex === -1) return;

  const currentRuleset = config.rulesets[rulesetIndex];
  if (!currentRuleset.blockedWorkspaces) {
    currentRuleset.blockedWorkspaces = [];
  }

  if (isBlocked) {
    if (!currentRuleset.blockedWorkspaces.includes(workspaceId)) {
      currentRuleset.blockedWorkspaces.push(workspaceId);
    }
  } else {
    currentRuleset.blockedWorkspaces = currentRuleset.blockedWorkspaces.filter(
      (wsId) => wsId !== workspaceId
    );
  }
}

/**
 * Create a ruleset item element
 * @param {Object} ruleset - Ruleset data
 * @param {number} index - Ruleset index
 * @param {HTMLElement} container - Parent container
 * @param {Object} config - Configuration object
 * @returns {HTMLElement}
 */
export function createRulesetItem(ruleset, index, container, config) {
  const item = document.createElement('div');
  item.className = 'zen-pomodoro-ruleset-item';
  item.dataset.rulesetId = ruleset.id;

  // Header row with name and controls
  const headerRow = document.createElement('div');
  headerRow.className = 'zen-pomodoro-ruleset-header';

  // Enable checkbox
  const enableCheckbox = document.createElement('input');
  enableCheckbox.type = 'checkbox';
  enableCheckbox.checked = ruleset.enabled;
  enableCheckbox.addEventListener('change', () => {
    // Find by ID to avoid stale index issues
    const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
    if (rulesetIndex !== -1) {
      config.rulesets[rulesetIndex].enabled = enableCheckbox.checked;
    }
  });

  // Name input
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'zen-pomodoro-ruleset-name';
  nameInput.value = ruleset.name;
  nameInput.placeholder = 'Ruleset Name';
  nameInput.addEventListener('change', () => {
    const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
    if (rulesetIndex !== -1) {
      config.rulesets[rulesetIndex].name = nameInput.value || 'Unnamed Ruleset';
    }
  });

  // Expand/collapse toggle
  const expandBtn = document.createElement('button');
  expandBtn.className = 'zen-pomodoro-dialog-button secondary small';
  expandBtn.textContent = '▼';
  expandBtn.addEventListener('click', () => {
    const details = item.querySelector('.zen-pomodoro-ruleset-details');
    const isCollapsed = details.classList.contains('zen-pomodoro-collapsed');
    details.classList.toggle('zen-pomodoro-collapsed');
    expandBtn.textContent = isCollapsed ? '▲' : '▼';
  });

  // Delete button - use ID instead of index
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'zen-pomodoro-dialog-button secondary small';
  deleteBtn.textContent = '🗑️';
  deleteBtn.addEventListener('click', () => {
    const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
    if (config.rulesets.length > 1 && rulesetIndex !== -1) {
      config.rulesets.splice(rulesetIndex, 1);
      config.activeRulesets = config.activeRulesets.filter((id) => id !== ruleset.id);
      renderRulesets(container, config);
    } else if (config.rulesets.length <= 1) {
      window.zenPomodoroApp?.showCustomAlert(
        'Cannot Delete',
        'You must have at least one ruleset.'
      );
    }
  });

  headerRow.appendChild(enableCheckbox);
  headerRow.appendChild(nameInput);
  headerRow.appendChild(expandBtn);
  headerRow.appendChild(deleteBtn);

  // Details section (collapsible)
  const details = document.createElement('div');
  details.className = 'zen-pomodoro-ruleset-details zen-pomodoro-collapsed';

  // Rules container
  const rulesContainer = document.createElement('div');
  rulesContainer.className = 'zen-pomodoro-rules-container';
  rulesContainer.id = `rules-container-${ruleset.id}`;

  // Render existing rules
  renderRules(rulesContainer, ruleset, config);

  // Add Rule button
  const addRuleBtn = document.createElement('button');
  addRuleBtn.className = 'zen-pomodoro-dialog-button secondary';
  addRuleBtn.textContent = '+ Add Rule/Condition';
  addRuleBtn.style.marginTop = '12px';
  addRuleBtn.addEventListener('click', () => {
    addNewRule(rulesContainer, ruleset, config);
  });

  // Keyword title-only info row (checkbox is always checked due to browser security restrictions)
  const titleOnlyRow = document.createElement('div');
  titleOnlyRow.className = 'zen-pomodoro-checkbox-row';
  titleOnlyRow.style.marginTop = '12px';

  const titleOnlyCheckbox = document.createElement('input');
  titleOnlyCheckbox.type = 'checkbox';
  titleOnlyCheckbox.id = `title-only-${ruleset.id}`;
  // Always checked and disabled - keywords can only check tab titles due to browser security
  titleOnlyCheckbox.checked = true;
  titleOnlyCheckbox.disabled = true;
  titleOnlyCheckbox.title =
    'Keywords match tab titles only due to browser security restrictions.';

  const titleOnlyLabel = document.createElement('label');
  titleOnlyLabel.htmlFor = `title-only-${ruleset.id}`;
  titleOnlyLabel.textContent = 'Keywords match tab title only (browser security limitation)';
  titleOnlyLabel.title = 'Keywords match tab titles only due to browser security restrictions.';
  titleOnlyLabel.style.cursor = 'help';

  titleOnlyRow.appendChild(titleOnlyCheckbox);
  titleOnlyRow.appendChild(titleOnlyLabel);

  // Workspace selection UI for this ruleset
  const workspaceSection = document.createElement('div');
  workspaceSection.className = 'zen-pomodoro-ruleset-workspace-section';
  workspaceSection.style.marginTop = '16px';

  const workspaceTitle = document.createElement('div');
  workspaceTitle.textContent = 'Blocked Workspaces:';
  workspaceTitle.style.fontWeight = 'bold';
  workspaceTitle.style.marginBottom = '8px';

  const workspaceContainer = document.createElement('div');
  workspaceContainer.className = 'zen-pomodoro-workspace-list';
  workspaceContainer.id = `workspace-container-${ruleset.id}`;

  const workspaces = window.zenPomodoroApp
    ? window.zenPomodoroApp.workspace.getAllWorkspaces()
    : [];

  if (workspaces.length === 0) {
    const noWorkspacesMsg = document.createElement('div');
    noWorkspacesMsg.className = 'zen-pomodoro-no-workspaces-msg';
    noWorkspacesMsg.textContent = 'No workspaces found';
    workspaceContainer.appendChild(noWorkspacesMsg);
  } else {
    // Ensure ruleset has blockedWorkspaces array
    if (!ruleset.blockedWorkspaces) {
      ruleset.blockedWorkspaces = [];
    }

    workspaces.forEach((workspace) => {
      const checkboxWrapper = document.createElement('div');
      checkboxWrapper.className = 'zen-pomodoro-checkbox-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `workspace-${ruleset.id}-${workspace.id}`;
      checkbox.value = workspace.id;
      checkbox.checked = ruleset.blockedWorkspaces.includes(workspace.id);
      checkbox.addEventListener('change', () => {
        updateRulesetWorkspace(config, ruleset.id, workspace.id, checkbox.checked);
      });

      const label = document.createElement('label');
      label.setAttribute('for', `workspace-${ruleset.id}-${workspace.id}`);
      label.textContent = workspace.name;

      checkboxWrapper.appendChild(checkbox);
      checkboxWrapper.appendChild(label);
      workspaceContainer.appendChild(checkboxWrapper);
    });
  }

  workspaceSection.appendChild(workspaceTitle);
  workspaceSection.appendChild(workspaceContainer);

  // Assemble details
  details.appendChild(rulesContainer);
  details.appendChild(addRuleBtn);
  details.appendChild(titleOnlyRow);
  details.appendChild(workspaceSection);

  item.appendChild(headerRow);
  item.appendChild(details);

  return item;
}

/**
 * Render individual rules in a container
 * Uses shared utility to reduce code duplication.
 * @param {HTMLElement} container - Rules container
 * @param {Object} ruleset - Parent ruleset
 * @param {Object} config - Configuration object
 */
export function renderRules(container, ruleset, config) {
  const rules = ruleset.rules || [];
  renderListOrEmptyMessage({
    container,
    items: rules,
    emptyClass: 'zen-pomodoro-empty-rules',
    emptyText: 'No rules configured. Click "Add Rule/Condition" to add one.',
    renderItem: (rule) => {
      const ruleEl = createRuleElement(rule, ruleset, config, container);
      container.appendChild(ruleEl);
    },
  });
}

/**
 * Create a single rule element
 * @param {Object} rule - Rule data { id, pattern, type, condition }
 * @param {Object} ruleset - Parent ruleset
 * @param {Object} config - Configuration object
 * @param {HTMLElement} container - Rules container
 * @returns {HTMLElement}
 */
export function createRuleElement(rule, ruleset, config, container) {
  const ruleEl = document.createElement('div');
  ruleEl.className = 'zen-pomodoro-rule-item';
  ruleEl.dataset.ruleId = rule.id;

  // Pattern input
  const patternInput = document.createElement('input');
  patternInput.type = 'text';
  patternInput.className = 'zen-pomodoro-rule-pattern';
  patternInput.value = rule.pattern || '';
  patternInput.placeholder =
    rule.type === 'keyword' ? 'Enter keyword...' : 'site.com or *.site.com';
  patternInput.addEventListener('change', () => {
    findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj) => {
      ruleObj.pattern = patternInput.value.trim();
    });
  });

  // Type dropdown (Website/Keyword)
  const typeSelect = document.createElement('select');
  typeSelect.className = 'zen-pomodoro-rule-select';

  const websiteOption = document.createElement('option');
  websiteOption.value = 'website';
  websiteOption.textContent = 'Website';
  if (rule.type === 'website') websiteOption.selected = true;
  typeSelect.appendChild(websiteOption);

  const keywordOption = document.createElement('option');
  keywordOption.value = 'keyword';
  keywordOption.textContent = 'Keyword';
  if (rule.type === 'keyword') keywordOption.selected = true;
  typeSelect.appendChild(keywordOption);

  typeSelect.addEventListener('change', () => {
    findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj) => {
      ruleObj.type = typeSelect.value;
      // Update placeholder
      patternInput.placeholder =
        typeSelect.value === 'keyword' ? 'Enter keyword...' : 'site.com or *.site.com';
    });
  });

  // Condition dropdown (Block/Allow)
  const conditionSelect = document.createElement('select');
  conditionSelect.className = 'zen-pomodoro-rule-select';

  const blockOption = document.createElement('option');
  blockOption.value = 'block';
  blockOption.textContent = 'Block';
  if (rule.condition === 'block') blockOption.selected = true;
  conditionSelect.appendChild(blockOption);

  const allowOption = document.createElement('option');
  allowOption.value = 'allow';
  allowOption.textContent = 'Allow';
  if (rule.condition === 'allow') allowOption.selected = true;
  conditionSelect.appendChild(allowOption);

  conditionSelect.addEventListener('change', () => {
    findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj) => {
      ruleObj.condition = conditionSelect.value;
    });
  });

  // Delete rule button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'zen-pomodoro-dialog-button secondary small';
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Delete rule';
  deleteBtn.addEventListener('click', () => {
    findRuleAndExecute(config, ruleset.id, rule.id, (ruleObj, ruleIndex, rulesArray) => {
      rulesArray.splice(ruleIndex, 1);
      renderRules(container, ruleset, config);
    });
  });

  ruleEl.appendChild(patternInput);
  ruleEl.appendChild(typeSelect);
  ruleEl.appendChild(conditionSelect);
  ruleEl.appendChild(deleteBtn);

  return ruleEl;
}

/**
 * Add a new rule to a ruleset
 * @param {HTMLElement} container - Rules container
 * @param {Object} ruleset - Parent ruleset
 * @param {Object} config - Configuration object
 */
export function addNewRule(container, ruleset, config) {
  const rulesetIndex = config.rulesets.findIndex((r) => r.id === ruleset.id);
  if (rulesetIndex === -1) return;

  if (!config.rulesets[rulesetIndex].rules) {
    config.rulesets[rulesetIndex].rules = [];
  }

  const newRule = {
    id: generateRuleId(),
    pattern: '',
    type: 'website',
    condition: 'block',
  };

  config.rulesets[rulesetIndex].rules.push(newRule);
  renderRules(container, config.rulesets[rulesetIndex], config);
}

/**
 * Generate a unique rule ID using crypto.randomUUID with fallback
 * @returns {string} Unique rule ID
 */
export function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return 'rule-' + crypto.randomUUID();
  }
  // Fallback: timestamp + random string for uniqueness
  return 'rule-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
}

/**
 * Generate a unique ruleset ID using crypto.randomUUID with fallback
 * @returns {string} Unique ruleset ID
 */
export function generateRulesetId() {
  if (typeof crypto?.randomUUID === 'function') {
    return 'ruleset-' + crypto.randomUUID();
  }
  // Fallback: timestamp + random string for uniqueness
  return 'ruleset-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
}

/**
 * Add a new ruleset
 * @param {HTMLElement} container - Container element
 * @param {Object} config - Configuration object
 */
export function addNewRuleset(container, config) {
  const newId = generateRulesetId();

  const newRuleset = {
    id: newId,
    name: 'New Ruleset',
    enabled: true,
    rules: [],
    // Keywords only check tab titles due to browser security restrictions (cross-origin)
    checkTitleOnly: true,
  };

  if (!config.rulesets) config.rulesets = [];
  config.rulesets.push(newRuleset);

  renderRulesets(container, config);
  logger.log(LOG_CATEGORIES.SETTINGS, 'New ruleset added', { id: newId });
}

/**
 * Export rulesets to JSON file
 * @param {Object} config - Configuration object
 */
export function exportRulesets(config) {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    rulesets: config.rulesets || [],
  };

  const data = JSON.stringify(exportData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zen-pomodoro-rulesets-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);

  logger.log(LOG_CATEGORIES.SETTINGS, 'Rulesets exported', { count: config.rulesets.length });
  window.zenPomodoroApp?.showCustomAlert(
    'Export Complete',
    `Exported ${config.rulesets.length} rulesets.`
  );
}

/**
 * Validate and normalize a single imported ruleset.
 * @param {Object} ruleset - Raw imported ruleset
 * @returns {Object} Normalized ruleset
 */
export function normalizeImportedRuleset(ruleset) {
  ruleset.id = 'imported-' + generateRulesetId().replace('ruleset-', '');
  ruleset.name = ruleset.name || 'Imported Ruleset';
  ruleset.enabled = ruleset.enabled !== false;
  ruleset.checkTitleOnly = !!ruleset.checkTitleOnly;

  // Convert old format to new format if needed
  if (hasOldFormatProperties(ruleset)) {
    ruleset.rules = convertOldFormatToRules(ruleset);
    delete ruleset.sites;
    delete ruleset.blockKeywords;
    delete ruleset.allowKeywords;
  }

  // Ensure rules array exists
  if (!Array.isArray(ruleset.rules)) {
    ruleset.rules = [];
  }

  // Validate and normalize each rule
  ruleset.rules = ruleset.rules.filter((rule) => normalizeImportedRule(rule));

  return ruleset;
}

/**
 * Check if ruleset has old format properties.
 * @param {Object} ruleset - Ruleset to check
 * @returns {boolean} True if has old format
 */
export function hasOldFormatProperties(ruleset) {
  return (
    Array.isArray(ruleset.sites) ||
    Array.isArray(ruleset.blockKeywords) ||
    Array.isArray(ruleset.allowKeywords)
  );
}

/**
 * Normalize and validate an imported rule.
 * @param {Object} rule - Raw imported rule
 * @returns {boolean} True if rule is valid
 */
export function normalizeImportedRule(rule) {
  if (!rule || typeof rule !== 'object') return false;

  rule.id = rule.id || generateRuleId();
  rule.pattern = typeof rule.pattern === 'string' ? rule.pattern : '';
  rule.type = ['website', 'keyword'].includes(rule.type) ? rule.type : 'website';
  rule.condition = ['block', 'allow'].includes(rule.condition) ? rule.condition : 'block';

  return true;
}

/**
 * Process imported rulesets JSON data.
 * @param {string} jsonText - Raw JSON text
 * @param {Object} config - Current config
 * @param {HTMLElement} container - Container for re-rendering
 * @throws {Error} If invalid format
 * @returns {number} Number of imported rulesets
 */
export function processImportedRulesets(jsonText, config, container) {
  const importData = JSON.parse(jsonText);

  if (!importData.rulesets || !Array.isArray(importData.rulesets)) {
    throw new Error('Invalid rulesets format');
  }

  const importedCount = importData.rulesets.length;
  importData.rulesets.forEach((ruleset) => normalizeImportedRuleset(ruleset));

  config.rulesets = [...(config.rulesets || []), ...importData.rulesets];
  renderRulesets(container, config);

  logger.log(LOG_CATEGORIES.SETTINGS, 'Rulesets imported', { count: importedCount });
  return importedCount;
}

/**
 * Import rulesets from JSON file.
 * Refactored to reduce cyclomatic complexity.
 * @param {HTMLElement} container - Container element
 * @param {Object} config - Configuration object
 */
export function importRulesets(container, config) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    // Add error handler for FileReader
    reader.onerror = () => {
      logger.log(LOG_CATEGORIES.SETTINGS, 'FileReader error during import', {
        error: reader.error?.message,
      });
      window.zenPomodoroApp?.showCustomAlert(
        'Import Failed',
        'Could not read the file. Please try again.'
      );
    };

    reader.onload = (event) => {
      try {
        const importedCount = processImportedRulesets(event.target.result, config, container);
        window.zenPomodoroApp?.showCustomAlert(
          'Import Complete',
          `Imported ${importedCount} rulesets.`
        );
      } catch (err) {
        logger.log(LOG_CATEGORIES.SETTINGS, 'Ruleset import failed', { error: err.message });
        window.zenPomodoroApp?.showCustomAlert(
          'Import Failed',
          'Could not parse the rulesets file. Please ensure it is a valid JSON file.'
        );
      }
    };

    reader.readAsText(file);
  });

  input.click();
}

/**
 * Convert old ruleset format (sites/blockKeywords/allowKeywords arrays) to new rules format
 * @param {Object} ruleset - Ruleset with old format
 * @returns {Array} Array of rule objects
 */
export function convertOldFormatToRules(ruleset) {
  const rules = [];

  // Convert sites array
  if (Array.isArray(ruleset.sites)) {
    ruleset.sites.forEach((site) => {
      const rule = convertSiteToRule(site);
      if (rule) rules.push(rule);
    });
  }

  // Convert blockKeywords array
  convertKeywordsToRules(ruleset.blockKeywords, 'block', rules);

  // Convert allowKeywords array
  convertKeywordsToRules(ruleset.allowKeywords, 'allow', rules);

  return rules;
}

/**
 * Convert a site pattern to a rule object
 * @param {string} site - Site pattern (may include + prefix for allow)
 * @returns {Object|null} Rule object or null if invalid
 */
export function convertSiteToRule(site) {
  if (!site || typeof site !== 'string') return null;
  const trimmed = site.trim();
  if (!trimmed) return null;

  // Check for + prefix (allow exception)
  const isAllow = trimmed.startsWith('+');
  return {
    id: generateRuleId(),
    pattern: isAllow ? trimmed.substring(1) : trimmed,
    type: 'website',
    condition: isAllow ? 'allow' : 'block',
  };
}

/**
 * Convert keywords array to rules and add to rules array
 * @param {Array} keywords - Array of keywords
 * @param {string} condition - 'block' or 'allow'
 * @param {Array} rules - Array to add rules to
 */
export function convertKeywordsToRules(keywords, condition, rules) {
  if (!Array.isArray(keywords)) return;

  keywords.forEach((keyword) => {
    if (!keyword || typeof keyword !== 'string') return;
    const trimmed = keyword.trim();
    if (!trimmed) return;

    rules.push({
      id: generateRuleId(),
      pattern: trimmed,
      type: 'keyword',
      condition: condition,
    });
  });
}
