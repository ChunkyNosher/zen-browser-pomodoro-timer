import Constants from './constants.js';
import { logger } from './log-manager.js';
import Storage from './storage.js';
import {
  extractWorkspaceNameFromButton,
  isValidWorkspaceArray,
  formatWorkspacesFromApi,
} from './helpers.js';
import { isInBreakPhase } from './break-phase-utils.js';

const { LOG_CATEGORIES, WORKSPACE_CONTAINER_SELECTORS, WORKSPACE_MUTATION_DELAY_MS } = Constants;

// Backward compatibility helpers
const getConfig = () => Storage.loadConfig();
const saveConfig = (config) => Storage.saveConfig(config);

/**
 * Get combined blocked workspaces from all active rulesets (including global blockedWorkspaces for backwards compatibility).
 * Only includes rulesets that are both enabled AND listed in config.activeRulesets.
 * @returns {string[]} Array of blocked workspace IDs
 */
function getActiveBlockedWorkspaces(config) {
  const blocked = new Set(config.blockedWorkspaces || []); // Start with global blocked list
  const activeRulesetIds = new Set(config.activeRulesets || []);

  // Add blocked workspaces from rulesets that are both enabled and active
  (config.rulesets || []).forEach((ruleset) => {
    if (ruleset.enabled && activeRulesetIds.has(ruleset.id) &&
        ruleset.blockedWorkspaces && Array.isArray(ruleset.blockedWorkspaces)) {
      ruleset.blockedWorkspaces.forEach((wsId) => blocked.add(wsId));
    }
  });

  return Array.from(blocked);
}

class WorkspaceDetector {
  constructor() {
    this.activeWorkspace = null;
    this.config = getConfig();
    this.onWorkspaceChange = null;
    this.workspaceObserver = null; // Store observer for cleanup
    this.needsValidation = true; // Flag to track if validation is needed
    this.mutationDebounceTimer = null; // Timer for debouncing workspace mutations
    this.workspaceApi = null;
    this.workspaceChangeListener = null;
    this.workspaceDataChangeListener = null;
  }

  /**
   * Get the currently active workspace
   */
  getActiveWorkspace() {
    try {
      const workspaceApi = globalThis.gZenWorkspaces;
      const activeWorkspace = workspaceApi?.activeWorkspace;
      if (typeof activeWorkspace === 'string') {
        return activeWorkspace;
      }
      if (activeWorkspace?.uuid || activeWorkspace?.id) {
        return activeWorkspace.uuid || activeWorkspace.id;
      }

      // BUG FIX: Workspace blocking stopped working correctly on newer Zen Browser versions
      // because the DOM structure for workspaces changed. Modern Zen builds expose the active
      // workspace as a <zen-workspace> element, while older versions and some custom setups
      // still rely on toolbarbutton[zen-workspace-id][active="true"]. To remain compatible
      // across Zen Browser versions and themes, we first try the modern zen-workspace selector
      // and then fall back to the legacy toolbarbutton-based selector.
      let activeElement = document.querySelector('zen-workspace[active="true"][id]');
      if (activeElement) {
        return activeElement.id;
      }

      // Fallback to toolbarbutton selector (legacy approach for older Zen versions/themes)
      activeElement = document.querySelector('toolbarbutton[zen-workspace-id][active="true"]');
      if (activeElement) {
        return activeElement.getAttribute('zen-workspace-id');
      }
    } catch (e) {
      console.error('Failed to get active workspace:', e);
    }
    return null;
  }

  /**
   * Validate and clean up deleted workspaces from blocked list.
   * Now validates across all rulesets' blockedWorkspaces arrays.
   * Only called when workspace changes are detected.
   */
  validateBlockedWorkspaces() {
    if (!this.needsValidation) {
      return;
    }

    const existingWorkspaces = this.getAllWorkspaces();
    const existingWorkspaceIds = existingWorkspaces.map((ws) => ws.id);
    let configChanged = false;

    // Validate global blockedWorkspaces (deprecated but kept for backwards compatibility)
    const originalGlobalLength = this.config.blockedWorkspaces.length;
    this.config.blockedWorkspaces = this.config.blockedWorkspaces.filter((wsId) =>
      existingWorkspaceIds.includes(wsId)
    );
    if (this.config.blockedWorkspaces.length !== originalGlobalLength) {
      configChanged = true;
    }

    // Validate blockedWorkspaces in each ruleset
    (this.config.rulesets || []).forEach((ruleset) => {
      if (ruleset.blockedWorkspaces && Array.isArray(ruleset.blockedWorkspaces)) {
        const originalRulesetLength = ruleset.blockedWorkspaces.length;
        ruleset.blockedWorkspaces = ruleset.blockedWorkspaces.filter((wsId) =>
          existingWorkspaceIds.includes(wsId)
        );
        if (ruleset.blockedWorkspaces.length !== originalRulesetLength) {
          configChanged = true;
        }
      }
    });

    // Save config only if we removed any deleted workspaces
    if (configChanged) {
      console.log('Removed deleted workspaces from blocked lists');
      saveConfig(this.config);
    }

    this.needsValidation = false;
  }

  /**
   * Check if current workspace is blocked
   * PERFORMANCE FIX: Validation only runs on workspace change, not every call
   * BREAK PHASE FIX: Returns false during break phases to allow free browsing
   */
  isCurrentWorkspaceBlocked() {
    // During break phases, workspaces are not blocked to allow free browsing
    if (isInBreakPhase()) {
      logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace blocking disabled during break phase');
      return false;
    }

    return this._checkWorkspaceBlocked('Workspace blocked check');
  }

  /**
   * Check if current workspace is in the blocked list.
   * Unlike isCurrentWorkspaceBlocked(), this does NOT check for break phase.
   * Originally designed for paused state logic where break/transition phases
   * are already handled separately, but safe for general use when you need
   * to check raw workspace membership without phase filtering.
   * @returns {boolean} True if current workspace is in the blocked list
   */
  isWorkspaceInBlockedList() {
    return this._checkWorkspaceBlocked('Workspace in blocked list check (no phase check)');
  }

  /**
   * Private helper to check if current workspace is in the blocked list.
   * Reloads config and checks against combined blocked workspaces from active rulesets.
   * Returns false if no active workspace can be detected.
   * @param {string} logMessage - Description for logging purposes
   * @returns {boolean} True if current workspace is in the blocked list, false otherwise
   * @private
   */
  _checkWorkspaceBlocked(logMessage) {
    // Reload config to get latest blocked workspaces
    this.refreshConfig();

    const activeWorkspace = this.getActiveWorkspace();
    if (!activeWorkspace) {
      return false;
    }

    // Get blocked workspaces from all active rulesets
    const activeBlockedWorkspaces = getActiveBlockedWorkspaces(this.config);
    const isBlocked = activeBlockedWorkspaces.includes(activeWorkspace);

    logger.log(LOG_CATEGORIES.WORKSPACE, logMessage, {
      workspaceId: activeWorkspace,
      isBlocked: isBlocked,
      blockedCount: activeBlockedWorkspaces.length,
    });
    return isBlocked;
  }

  /**
   * Check if a specific workspace ID is in the blocked list.
   * Uses cached config when available, reducing repeated config parsing.
   * @param {string} workspaceId - The workspace ID to check
   * @returns {boolean} True if the workspace is in the blocked list
   */
  isWorkspaceIdBlocked(workspaceId) {
    // Use cached config if available, otherwise reload
    if (!this.config) {
      this.refreshConfig();
    }
    // Get blocked workspaces from all active rulesets
    const activeBlockedWorkspaces = getActiveBlockedWorkspaces(this.config);
    return activeBlockedWorkspaces.includes(workspaceId);
  }

  refreshConfig() {
    this.config = getConfig();
    return this.config;
  }

  /**
   * Handle workspace mutation observer callback
   * @private
   */
  _handleWorkspaceMutation() {
    // Clear any pending timeout to implement proper debouncing
    if (this.mutationDebounceTimer) {
      clearTimeout(this.mutationDebounceTimer);
      this.mutationDebounceTimer = null;
    }

    // Use a small delay to ensure DOM has fully updated before checking workspace
    this.mutationDebounceTimer = setTimeout(() => {
      const newWorkspace = this.getActiveWorkspace();

      // BUG FIX: Log mutation handler execution to debug workspace change detection
      logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace mutation detected', {
        oldWorkspace: this.activeWorkspace,
        newWorkspace: newWorkspace,
        changed: newWorkspace !== this.activeWorkspace,
      });

      if (newWorkspace === this.activeWorkspace) return;

      this.activeWorkspace = newWorkspace;
      this.needsValidation = true;
      this.validateBlockedWorkspaces();

      if (this.onWorkspaceChange) {
        // WORKSPACE BLOCKING FIX: Use isWorkspaceIdBlocked() to get raw workspace membership
        // (not phase-filtered) so overlay visibility works correctly when paused or during breaks.
        // Phase filtering is handled in updateOverlayVisibility().
        const isBlocked = newWorkspace ? this.isWorkspaceIdBlocked(newWorkspace) : false;
        this.onWorkspaceChange(newWorkspace, isBlocked);
      }

      this.mutationDebounceTimer = null;
    }, WORKSPACE_MUTATION_DELAY_MS);
  }

  _handleNativeWorkspaceChange({ workspace } = {}) {
    const newWorkspace =
      typeof workspace === 'string'
        ? workspace
        : workspace?.uuid || workspace?.id || this.getActiveWorkspace();
    if (newWorkspace === this.activeWorkspace) return;

    this.activeWorkspace = newWorkspace;
    this.refreshConfig();
    this.needsValidation = true;
    this.validateBlockedWorkspaces();

    if (this.onWorkspaceChange) {
      const isBlocked = newWorkspace ? this.isWorkspaceIdBlocked(newWorkspace) : false;
      this.onWorkspaceChange(newWorkspace, isBlocked);
    }
  }

  _handleWorkspaceDataChange() {
    this.refreshConfig();
    this.needsValidation = true;
    this.validateBlockedWorkspaces();
  }

  /**
   * Start monitoring workspace changes
   * MEMORY LEAK FIX: Store observer for cleanup
   * PERFORMANCE FIX: Validate workspaces on change, not on every check
   */
  startMonitoring() {
    this.stopMonitoring();
    this.activeWorkspace = this.getActiveWorkspace();

    logger.log(LOG_CATEGORIES.WORKSPACE, 'Starting workspace monitoring', {
      initialWorkspace: this.activeWorkspace,
    });

    const workspaceApi = globalThis.gZenWorkspaces;
    if (typeof workspaceApi?.addChangeListeners === 'function' &&
        typeof workspaceApi.removeChangeListeners === 'function') {
      this.workspaceApi = workspaceApi;
      this.workspaceChangeListener = (change) => this._handleNativeWorkspaceChange(change);
      this.workspaceDataChangeListener = () => this._handleWorkspaceDataChange();
      workspaceApi.addChangeListeners(this.workspaceChangeListener);
      window.addEventListener('ZenWorkspaceDataChanged', this.workspaceDataChangeListener);
      return;
    }

    // Use MutationObserver to detect workspace changes
    // PERFORMANCE FIX: Use attributeFilter to only observe 'active' attribute changes
    this.workspaceObserver = new MutationObserver(() => this._handleWorkspaceMutation());

    // Try multiple containers for more reliable detection
    // NOTE: We use a for-loop with early break instead of combined selector string
    // (document.querySelector('sel1, sel2, sel3')) because we want to find the FIRST
    // valid element in priority order defined by WORKSPACE_CONTAINER_SELECTORS.
    // A combined selector returns the first DOM element matching ANY selector,
    // not respecting our preference order.
    let workspaceContainer = null;
    let workspaceContainerSelector = null;
    for (const selector of WORKSPACE_CONTAINER_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        workspaceContainer = element;
        workspaceContainerSelector = selector;
        break;
      }
    }

    // Set up observer on the workspace container if found
    if (workspaceContainer) {
      this.workspaceObserver.observe(workspaceContainer, {
        attributes: true,
        attributeFilter: ['active', 'selected', 'zen-workspace-id'],
        subtree: true,
        // Observes childList changes to detect when workspace buttons/elements
        // are added or removed (e.g., new workspaces created), ensuring
        // _handleWorkspaceMutation() keeps the active workspace state in sync.
        childList: true,
      });
      logger.log(LOG_CATEGORIES.WORKSPACE, 'Workspace observer configured', {
        container: workspaceContainerSelector,
        observingAttributes: ['active', 'selected', 'zen-workspace-id'],
      });
    } else {
      console.warn('[Pomodoro Focus Blocker] No workspace container found for monitoring');
      logger.log(LOG_CATEGORIES.WORKSPACE, 'No workspace container found for monitoring');
    }
  }

  /**
   * Stop monitoring and cleanup
   * MEMORY LEAK FIX: Disconnect observer
   */
  stopMonitoring() {
    if (this.workspaceObserver) {
      this.workspaceObserver.disconnect();
      this.workspaceObserver = null;
    }
    // Clear any pending debounce timer
    if (this.mutationDebounceTimer) {
      clearTimeout(this.mutationDebounceTimer);
      this.mutationDebounceTimer = null;
    }
    if (this.workspaceApi && this.workspaceChangeListener) {
      this.workspaceApi.removeChangeListeners(this.workspaceChangeListener);
    }
    if (this.workspaceDataChangeListener) {
      window.removeEventListener('ZenWorkspaceDataChanged', this.workspaceDataChangeListener);
    }
    this.workspaceApi = null;
    this.workspaceChangeListener = null;
    this.workspaceDataChangeListener = null;
  }

  /**
   * Get all available workspaces
   * Uses multiple methods to retrieve workspace names:
   * 1. Try to get from gZenWorkspaces API
   * 2. Fall back to DOM attributes (label, tooltiptext, aria-label)
   * 3. Try to extract from workspace panel if available
   */
  getAllWorkspaces() {
    try {
      // Method 1: Try gZenWorkspaces API (most reliable)
      const nativeResult = this._tryGZenWorkspacesApi();
      if (nativeResult) return nativeResult;

      // Method 2: Query DOM buttons
      const domResult = this._tryDomWorkspaceButtons();
      if (domResult) return domResult;

      // Method 3: Try workspace container elements
      const containerResult = this._tryWorkspaceContainer();
      if (containerResult) return containerResult;

      console.log('Zen Pomodoro: No workspaces found');
      return [];
    } catch (e) {
      console.error('Failed to get workspaces:', e);
      return [];
    }
  }

  /**
   * Try to get workspaces from gZenWorkspaces API.
   * @returns {Array|null} Workspaces array or null if not available
   * @private
   */
  _tryGZenWorkspacesApi() {
    const workspaceApi = globalThis.gZenWorkspaces;
    if (typeof workspaceApi?.getWorkspaces !== 'function') return null;

    const workspaces = workspaceApi.getWorkspaces();

    if (isValidWorkspaceArray(workspaces)) {
      console.log('Zen Pomodoro: Got workspaces from gZenWorkspaces API');
      return formatWorkspacesFromApi(workspaces);
    }
    return null;
  }

  /**
   * Try to get workspaces from DOM toolbar buttons.
   * @returns {Array|null} Workspaces array or null if none found
   * @private
   */
  _tryDomWorkspaceButtons() {
    const buttons = document.querySelectorAll('toolbarbutton[zen-workspace-id]');
    if (buttons.length === 0) return null;

    console.log(`Zen Pomodoro: Got ${buttons.length} workspaces from DOM`);
    return Array.from(buttons).map((btn) => {
      const id = btn.getAttribute('zen-workspace-id');
      return { id, name: extractWorkspaceNameFromButton(btn, id) };
    });
  }

  /**
   * Try to get workspaces from container elements.
   * @returns {Array|null} Workspaces array or null if none found
   * @private
   */
  _tryWorkspaceContainer() {
    // BUG FIX: Try the modern zen-workspace elements first (for newer Zen Browser versions)
    const modernWorkspaces = this._tryModernWorkspaceElements();
    if (modernWorkspaces) return modernWorkspaces;

    // Fallback to legacy selectors
    return this._tryLegacyContainerWorkspaces();
  }

  /**
   * Try to get workspaces from modern zen-workspace elements.
   * @returns {Array|null} Workspaces array or null if none found
   * @private
   */
  _tryModernWorkspaceElements() {
    const items = document.querySelectorAll('zen-workspace');
    if (items.length === 0) return null;

    logger.log(
      LOG_CATEGORIES.WORKSPACE,
      'Workspace detection: Using modern zen-workspace elements',
      {
        count: items.length,
      }
    );
    console.log(`Zen Pomodoro: Got ${items.length} workspaces from zen-workspace elements`);

    return Array.from(items).map((item) => this._extractWorkspaceFromModernElement(item));
  }

  /**
   * Extract workspace data from a modern zen-workspace element.
   * @param {Element} item - The zen-workspace element
   * @returns {Object} Workspace object with id and name
   * @private
   */
  _extractWorkspaceFromModernElement(item) {
    const id = item.id;
    const name =
      item.getAttribute('label') ||
      item.querySelector('.zen-current-workspace-indicator-name')?.textContent?.trim() ||
      `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
    return { id, name };
  }

  /**
   * Try to get workspaces from legacy container selectors.
   * @returns {Array|null} Workspaces array or null if none found
   * @private
   */
  _tryLegacyContainerWorkspaces() {
    const container = this._findLegacyWorkspaceContainer();
    if (!container) return null;

    const items = container.querySelectorAll('[zen-workspace-id], [data-workspace-id]');
    if (items.length === 0) return null;

    console.log(`Zen Pomodoro: Got ${items.length} workspaces from container`);
    return Array.from(items).map((item) => this._extractWorkspaceFromLegacyElement(item));
  }

  /**
   * Find the legacy workspace container element.
   * @returns {Element|null} Container element or null
   * @private
   */
  _findLegacyWorkspaceContainer() {
    return document.querySelector(
      '#zen-workspaces-button, [id*="workspace"]'
    );
  }

  /**
   * Extract workspace data from a legacy container element.
   * @param {Element} item - The workspace element
   * @returns {Object} Workspace object with id and name
   * @private
   */
  _extractWorkspaceFromLegacyElement(item) {
    const id = item.getAttribute('zen-workspace-id') || item.getAttribute('data-workspace-id');
    const name =
      item.getAttribute('label') ||
      item.getAttribute('data-name') ||
      item.textContent?.trim() ||
      `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
    return { id, name };
  }
}

export default WorkspaceDetector;
