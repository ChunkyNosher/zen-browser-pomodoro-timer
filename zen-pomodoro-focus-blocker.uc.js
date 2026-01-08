/**
 * Zen Pomodoro Focus Blocker Mod
 * Version: 1.0.5
 * License: MPL-2.0
 * 
 * A productivity mod that implements customizable Pomodoro timer with workspace blocking
 * 
 * SECURITY FIXES:
 * - Uses textContent/createElement instead of innerHTML for user content
 * - Uses crypto.getRandomValues() for security codes
 * - Proper cleanup of observers and intervals
 * - Memory leak fixes
 * 
 * FEATURES IMPLEMENTED:
 * - Native context menu integration (XUL-based)
 * - Workspace selection UI in settings
 * - Security lock screens with cancel buttons
 * - Hold-to-start integration
 * - Hold-to-unlock for settings access
 * - Notification permission requests
 * - Custom confirmation dialogs
 * - Dev mode with bypass capabilities
 * 
 * CODE QUALITY:
 * - Proper input validation
 * - Reduced save frequency
 * - Config stored with timer state
 * - Viewport boundary checks
 * - Accessibility improvements
 * - Settings consolidated to preferences.json
 */

(() => {
  'use strict';

  // ============================================
  // Constants and Configuration
  // ============================================
  
  const PREF_PREFIX = 'zen-pomodoro';
  // DEV NOTE: This password is for development bypass only and will be removed
  // before production release. It's intentionally hardcoded for testing purposes.
  const DEV_MODE_PASSWORD = 'Chunky-Nosher!';
  
  /**
   * Modifier keys used by the keyboard shortcut recorder.
   * These are the keys that can be combined with a regular key to form a shortcut.
   * @constant {string[]}
   */
  const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];
  
  /**
   * Valid lockout method types for settings access control.
   * @constant {Object}
   * @property {string} CODE - Requires entering a randomly generated code
   * @property {string} HOLD - Requires holding a button for a duration
   */
  const LOCKOUT_METHODS = {
    CODE: 'code',
    HOLD: 'hold'
  };
  
  const DEFAULT_CONFIG = {
    timerMode: 'pomodoro',
    simpleDuration: 25,
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    cycles: 4,
    blockedWorkspaces: [],
    overlayColor: '#808080',
    motivationalMessage: 'Get back to work.',
    // Note: Despite the name, this duration is used whenever the "hold" method is selected
    // (for both idle and active states). Name kept for backward compatibility.
    settingsLockIdleDuration: 20,
    /** @type {'hold'|'code'} Method to use when timer is idle */
    settingsLockIdleMethod: LOCKOUT_METHODS.HOLD,
    /** @type {'hold'|'code'} Method to use when timer is active */
    settingsLockActiveMethod: LOCKOUT_METHODS.CODE,
    // Note: Despite the name, this code length is used whenever the "code" method is selected
    // (for both idle and active states). Name kept for backward compatibility.
    settingsLockActiveCodeLength: 64,
    settingsLockActiveCharacterSet: 'all-typeable',
    holdToStartDuration: 3000,
    enableNotifications: true,
    enableAudioAlerts: false,
    phase: 'focus',
    keyboardShortcut: 'Alt+Shift+P'
  };

  // Save state every 10 seconds instead of every second for performance (in seconds)
  const SAVE_STATE_INTERVAL_SECONDS = 10;

  // ============================================
  // Utility Functions
  // ============================================
  
  /**
   * Get preference from Firefox Services
   */
  function getPref(key, defaultValue) {
    const prefKey = `${PREF_PREFIX}.${key}`;
    try {
      if (Services.prefs.prefHasUserValue(prefKey)) {
        const prefType = Services.prefs.getPrefType(prefKey);
        if (prefType === Services.prefs.PREF_STRING) {
          return Services.prefs.getCharPref(prefKey);
        } else if (prefType === Services.prefs.PREF_INT) {
          return Services.prefs.getIntPref(prefKey);
        } else if (prefType === Services.prefs.PREF_BOOL) {
          return Services.prefs.getBoolPref(prefKey);
        }
      }
    } catch (e) {
      console.error(`Failed to get pref ${prefKey}:`, e);
    }
    return defaultValue;
  }

  /**
   * Set preference in Firefox Services
   */
  function setPref(key, value) {
    const prefKey = `${PREF_PREFIX}.${key}`;
    try {
      if (typeof value === 'string') {
        Services.prefs.setCharPref(prefKey, value);
      } else if (typeof value === 'number') {
        Services.prefs.setIntPref(prefKey, value);
      } else if (typeof value === 'boolean') {
        Services.prefs.setBoolPref(prefKey, value);
      }
    } catch (e) {
      console.error(`Failed to set pref ${prefKey}:`, e);
    }
  }

  /**
   * Get configuration object from preferences
   */
  function getConfig() {
    // Start with default config
    let config = { ...DEFAULT_CONFIG };
    
    // Load from stored JSON config (legacy support)
    const configStr = getPref('config', null);
    if (configStr) {
      try {
        const storedConfig = JSON.parse(configStr);
        config = { ...config, ...storedConfig };
      } catch (e) {
        console.error('Failed to parse config:', e);
      }
    }
    
    // Override with individual preferences if set
    // Only keyboardShortcut and enableNotifications are in preferences.json now
    const enableNotifications = getPref('enableNotifications', null);
    if (enableNotifications !== null) {
      // Sine checkbox preferences normally return a boolean. The string check ('true')
      // is kept for robustness/legacy cases where values may have been stored as strings.
      config.enableNotifications = enableNotifications === true || enableNotifications === 'true';
    }
    
    // Keyboard shortcut
    const keyboardShortcut = getPref('keyboardShortcut', null);
    if (keyboardShortcut !== null && keyboardShortcut !== '') {
      config.keyboardShortcut = keyboardShortcut;
    }
    
    return config;
  }

  /**
   * Save configuration object to preferences
   */
  function saveConfig(config) {
    try {
      setPref('config', JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  /**
   * Format time in MM:SS format
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Issue 8: Setup drag functionality for dialogs
   * Makes a dialog draggable by its header (h2 element).
   * The dialog can be moved within the viewport boundaries.
   * 
   * @param {HTMLElement} dialog - The dialog element to make draggable.
   *                               Must contain an h2 element as the drag handle.
   * @returns {void}
   * 
   * @example
   * const dialog = document.createElement('div');
   * dialog.className = 'zen-pomodoro-dialog active';
   * // ... add h2 and other content ...
   * document.documentElement.appendChild(dialog);
   * setupDialogDrag(dialog);
   */
  function setupDialogDrag(dialog) {
    const header = dialog.querySelector('h2');
    if (!header) return;
    
    let isDragging = false;
    let startX, startY;
    let startLeft, startTop;
    let dialogWidth, dialogHeight;
    
    // Clean up function to remove document-level listeners
    const cleanupDrag = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      isDragging = false;
    };
    
    const onMouseDown = (e) => {
      // Only start drag on left mouse button
      if (e.button !== 0) return;
      
      e.preventDefault();
      isDragging = true;
      
      const rect = dialog.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      
      // If dialog is centered with transform, convert to left/top positioning
      const computedStyle = window.getComputedStyle(dialog);
      if (computedStyle.transform !== 'none') {
        dialog.style.transform = 'none';
        dialog.style.left = `${rect.left}px`;
        dialog.style.top = `${rect.top}px`;
      }
      
      startLeft = rect.left;
      startTop = rect.top;
      dialogWidth = rect.width;
      dialogHeight = rect.height;
      
      dialog.classList.add('dragging');
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;
      
      // Keep within viewport boundaries
      const maxX = window.innerWidth - dialogWidth;
      const maxY = window.innerHeight - dialogHeight;
      
      if (maxX >= 0) {
        newLeft = Math.max(0, Math.min(newLeft, maxX));
      } else {
        // Dialog wider than viewport: allow negative positions but ensure some part stays visible
        const overflowX = dialogWidth - window.innerWidth;
        const minLeft = -overflowX;
        const maxLeft = 0;
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
      }

      if (maxY >= 0) {
        newTop = Math.max(0, Math.min(newTop, maxY));
      } else {
        // Dialog taller than viewport
        const overflowY = dialogHeight - window.innerHeight;
        const minTop = -overflowY;
        const maxTop = 0;
        newTop = Math.max(minTop, Math.min(newTop, maxTop));
      }
      
      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
    };
    
    const onMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      dialog.classList.remove('dragging');
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    header.addEventListener('mousedown', onMouseDown);
    
    // Use MutationObserver to clean up when dialog is removed from DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode === dialog) {
            cleanupDrag();
            header.removeEventListener('mousedown', onMouseDown);
            observer.disconnect();
            return;
          }
        }
      }
    });
    
    // Observe a stable ancestor (documentElement) to ensure observer always sees dialog removal
    const targetNode = dialog.ownerDocument && dialog.ownerDocument.documentElement;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    } else if (dialog.parentNode) {
      observer.observe(dialog.parentNode, { childList: true, subtree: false });
    }
  }

  /**
   * Generate cryptographically secure random code for settings lock
   * SECURITY FIX: Uses crypto.getRandomValues() instead of Math.random()
   */
  function generateRandomCode(length, charset) {
    const chars = charset === 'alphanumeric' 
      ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    // Use crypto.getRandomValues for cryptographically secure random generation
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(randomValues[i] % chars.length);
    }
    return code;
  }

  /**
   * Validate integer input with min/max bounds
   * LOGIC FIX: Input validation for settings
   */
  function validateIntegerInput(value, min, max, defaultValue) {
    const parsed = parseInt(value, 10);
    const isValidNumber = !isNaN(parsed);
    const isInRange = parsed >= min && parsed <= max;
    
    return (isValidNumber && isInRange) ? parsed : defaultValue;
  }

  /**
   * Sanitize text content to prevent XSS attacks.
   * Removes HTML-like characters (<, >) that could be used for injection.
   * This is a defense-in-depth measure since we use textContent instead of innerHTML.
   * @param {string} text - The text to sanitize
   * @returns {string} Sanitized text with HTML characters removed
   */
  function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[<>]/g, '');
  }

  /**
   * Check if a workspace array is valid and non-empty.
   * @param {*} workspaces - The workspaces value to check
   * @returns {boolean} True if valid non-empty array
   */
  function isValidWorkspaceArray(workspaces) {
    return workspaces && Array.isArray(workspaces) && workspaces.length > 0;
  }

  /**
   * Format workspace data from API response to standard format.
   * @param {Array} workspaces - Raw workspace array from API
   * @returns {Array<{id: string, name: string}>} Formatted workspace array
   */
  function formatWorkspacesFromApi(workspaces) {
    return workspaces.map(ws => ({
      id: ws.uuid || ws.id,
      name: ws.name || ws.title || 'Unnamed Workspace'
    }));
  }

  /**
   * Attribute names to check for workspace name, in priority order.
   * @constant {string[]}
   */
  const WORKSPACE_NAME_ATTRIBUTES = [
    'data-workspace-name',
    'data-name',
    'label',
    'tooltiptext',
    'aria-label',
    'title'
  ];

  /**
   * Extract workspace name from a DOM button element.
   * Tries multiple attributes in priority order.
   * @param {Element} btn - The button element
   * @param {string} id - The workspace ID (for fallback name)
   * @returns {string} The workspace name
   */
  function extractWorkspaceNameFromButton(btn, id) {
    // Try each attribute in priority order
    for (const attr of WORKSPACE_NAME_ATTRIBUTES) {
      const name = btn.getAttribute(attr);
      if (isValidName(name)) return name;
    }

    // Try to find a label element
    const labelEl = btn.querySelector('.tab-label, .tab-text, .workspace-label, label');
    const labelName = labelEl?.textContent?.trim();
    if (isValidName(labelName)) return labelName;

    // Try button text content
    const textName = btn.textContent?.trim();
    if (isValidName(textName)) return textName;

    // Fallback name using truncated ID
    return createFallbackWorkspaceName(id);
  }

  /**
   * Check if a workspace name is valid (non-empty and not 'undefined').
   * @param {*} name - The name to check
   * @returns {boolean} True if valid
   */
  function isValidName(name) {
    return Boolean(name) && name !== 'undefined' && name !== '';
  }

  /**
   * Create a fallback workspace name from an ID.
   * @param {string} id - The workspace ID
   * @returns {string} Fallback name
   */
  function createFallbackWorkspaceName(id) {
    const idPrefix = id?.substring(0, 8) || 'Unknown';
    return `Workspace ${idPrefix}`;
  }

  /**
   * Get phase display label from phase identifier.
   * @param {string} phase - Phase identifier ('focus', 'break', 'long-break')
   * @returns {string} Human-readable phase label
   */
  function getPhaseLabel(phase) {
    const labels = {
      'focus': 'Focus Period',
      'break': 'Break Time',
      'long-break': 'Long Break'
    };
    return labels[phase] || 'Focus Period';
  }

  /**
   * Get short phase label for indicator.
   * @param {string} phase - Phase identifier
   * @returns {string} Short phase label
   */
  function getShortPhaseLabel(phase) {
    return phase === 'focus' ? 'Focus' : 'Break';
  }

  /**
   * Create a labeled input row for dialog forms.
   * @param {string} labelText - Label text
   * @param {string} inputId - Input element ID
   * @param {Object} inputAttrs - Input attributes (type, value, min, max)
   * @returns {HTMLElement} The row element
   */
  function createLabeledInputRow(labelText, inputId, inputAttrs = {}) {
    const row = document.createElement('div');
    row.className = 'zen-pomodoro-config-row';
    row.id = `${inputId}-row`;
    
    const label = document.createElement('label');
    label.textContent = labelText;
    
    const input = document.createElement('input');
    input.type = inputAttrs.type || 'number';
    input.id = inputId;
    if (inputAttrs.value !== undefined) input.value = inputAttrs.value;
    if (inputAttrs.min !== undefined) input.min = inputAttrs.min;
    if (inputAttrs.max !== undefined) input.max = inputAttrs.max;
    
    row.appendChild(label);
    row.appendChild(input);
    
    return row;
  }

  /**
   * Create a labeled select row for dialog forms.
   * @param {string} labelText - Label text
   * @param {string} selectId - Select element ID
   * @param {Array<{value: string, text: string, selected?: boolean}>} options - Select options
   * @returns {{row: HTMLElement, select: HTMLSelectElement}} The row and select elements
   */
  function createLabeledSelectRow(labelText, selectId, options) {
    const row = document.createElement('div');
    row.className = 'zen-pomodoro-config-row';
    
    const label = document.createElement('label');
    label.textContent = labelText;
    
    const select = document.createElement('select');
    select.id = selectId;
    
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.selected) option.selected = true;
      select.appendChild(option);
    });
    
    row.appendChild(label);
    row.appendChild(select);
    
    return { row, select };
  }

  /**
   * Helper to handle stop timer with lockout.
   * Reduces code duplication for stop timer logic.
   * 
   * When timer is active, ALWAYS shows the lockout screen before allowing
   * the timer to be stopped. The lockout method (code entry or hold button)
   * is determined by the user's settingsLockActiveMethod configuration.
   * 
   * When timer is not active, shows confirmation directly without lockout.
   * 
   * @param {() => void} onStop - Callback to execute after successful stop confirmation
   */
  function handleStopTimerWithLockout(onStop) {
    if (!window.zenPomodoroApp) return;
    
    const timerActive = window.zenPomodoroApp.timer && window.zenPomodoroApp.timer.isActive;
    
    const showStopConfirmation = () => {
      window.zenPomodoroApp.showCustomConfirm(
        'Stop Timer',
        'Are you sure you want to stop the timer?',
        onStop
      );
    };
    
    // Issue 6: Always require lockout when stopping an active timer.
    // This prevents accidental or impulsive timer stops during focus sessions.
    // The lockout uses the user's configured settingsLockActiveMethod.
    if (timerActive) {
      window.zenPomodoroApp.security.showLockScreen(true, showStopConfirmation);
    } else {
      showStopConfirmation();
    }
  }

  // ============================================
  // Timer Engine Module
  // ============================================
  
  class PomodoroTimer {
    constructor() {
      this.isActive = false;
      this.isPaused = false;
      this.remainingTime = 0;
      this.currentPhase = 'focus';
      this.currentCycle = 1;
      this.totalCycles = 4;
      this.mode = 'pomodoro';
      this.intervalId = null;
      this.config = getConfig();
      this.savedConfig = null; // Store config with timer state
      this.onTick = null;
      this.onPhaseChange = null;
      this.onComplete = null;
      this.tickCounter = 0; // Counter for reducing save frequency
    }

    /**
     * Start the timer
     * @param {string} mode - Timer mode ('pomodoro' or 'simple')
     * @param {number} cycles - Number of pomodoro cycles
     * @param {Object} sessionOverrides - Optional session-only duration overrides
     */
    start(mode = 'pomodoro', cycles = 4, sessionOverrides = {}) {
      this.mode = mode;
      this.totalCycles = cycles;
      this.currentCycle = 1;
      this.currentPhase = 'focus';
      this.isActive = true;
      this.isPaused = false;
      this.tickCounter = 0;
      
      // Get base config from preferences (ensures we start fresh without previous session modifications)
      this.config = getConfig();
      
      // Apply session-only overrides (these don't persist to saved config)
      const effectiveConfig = { ...this.config, ...sessionOverrides };
      
      // Store the effective config with timer state for proper restoration
      this.savedConfig = { ...effectiveConfig };

      if (mode === 'simple') {
        this.remainingTime = effectiveConfig.simpleDuration * 60;
      } else {
        this.remainingTime = effectiveConfig.focusDuration * 60;
      }

      this.startInterval();
      this.saveState();
    }

    /**
     * Start the countdown interval
     */
    startInterval() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      this.intervalId = setInterval(() => {
        if (!this.isPaused && this.isActive) {
          this.remainingTime--;
          
          if (this.onTick) {
            this.onTick(this.remainingTime, this.currentPhase, this.currentCycle, this.totalCycles);
          }

          if (this.remainingTime <= 0) {
            this.handlePhaseComplete();
          }

          // PERFORMANCE FIX: Save state every 10 seconds instead of every second
          this.tickCounter++;
          if (this.tickCounter >= SAVE_STATE_INTERVAL_SECONDS) {
            this.saveState();
            this.tickCounter = 0;
          }
        }
      }, 1000);
    }

    /**
     * Handle phase completion
     */
    handlePhaseComplete() {
      if (this.mode === 'simple') {
        this.completeTimer();
        return;
      }

      // Pomodoro mode phase transitions
      const shouldComplete = this.currentPhase === 'focus' 
        ? this._handleFocusPhaseComplete()
        : this._handleBreakPhaseComplete();
      
      if (shouldComplete) return;

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
    }

    /**
     * Handle completion of a focus phase.
     * @returns {boolean} True if timer should complete, false to continue
     * @private
     */
    _handleFocusPhaseComplete() {
      const isLastCycle = this.currentCycle >= this.totalCycles;
      
      if (isLastCycle) {
        this.completeTimer();
        return true;
      }
      
      // Determine break type
      const isLongBreakCycle = this.currentCycle % this.config.longBreakInterval === 0;
      
      if (isLongBreakCycle) {
        this.currentPhase = 'long-break';
        this.remainingTime = this.config.longBreakDuration * 60;
      } else {
        this.currentPhase = 'break';
        this.remainingTime = this.config.breakDuration * 60;
      }
      
      return false;
    }

    /**
     * Handle completion of a break phase.
     * @returns {boolean} True if timer should complete, false to continue
     * @private
     */
    _handleBreakPhaseComplete() {
      this.currentCycle++;
      
      if (this.currentCycle > this.totalCycles) {
        this.completeTimer();
        return true;
      }
      
      // Start next focus period
      this.currentPhase = 'focus';
      this.remainingTime = this.config.focusDuration * 60;
      
      return false;
    }

    /**
     * Pause the timer
     */
    pause() {
      this.isPaused = true;
      this.saveState();
    }

    /**
     * Resume the timer
     */
    resume() {
      this.isPaused = false;
      this.saveState();
    }

    /**
     * Stop the timer
     */
    stop() {
      this.isActive = false;
      this.isPaused = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.savedConfig = null;
      this.clearState();
    }

    /**
     * Complete the timer
     * RENAMED: From 'complete' to 'completeTimer' for clarity
     */
    completeTimer() {
      this.stop();
      if (this.onComplete) {
        this.onComplete();
      }
    }

    /**
     * Save timer state to preferences with config
     * LOGIC FIX: Store config with timer state
     */
    saveState() {
      const state = {
        isActive: this.isActive,
        isPaused: this.isPaused,
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode,
        savedConfig: this.savedConfig // Store config with state
      };
      setPref('timer-state', JSON.stringify(state));
    }

    /**
     * Load timer state from preferences
     * LOGIC FIX: Restore config from saved state
     */
    loadState() {
      const stateStr = getPref('timer-state', null);
      if (stateStr) {
        try {
          const state = JSON.parse(stateStr);
          if (state.isActive) {
            this.isActive = state.isActive;
            this.isPaused = state.isPaused;
            this.remainingTime = state.remainingTime;
            this.currentPhase = state.currentPhase;
            this.currentCycle = state.currentCycle;
            this.totalCycles = state.totalCycles;
            this.mode = state.mode;
            
            // Restore saved config
            if (state.savedConfig) {
              this.savedConfig = state.savedConfig;
              this.config = state.savedConfig;
            }
            
            if (!this.isPaused) {
              this.startInterval();
            }
            
            return true;
          }
        } catch (e) {
          console.error('Failed to load timer state:', e);
        }
      }
      return false;
    }

    /**
     * Clear timer state from preferences
     */
    clearState() {
      setPref('timer-state', '');
    }

    /**
     * Get current timer status
     */
    getStatus() {
      return {
        isActive: this.isActive,
        isPaused: this.isPaused,
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode
      };
    }
  }

  // ============================================
  // Workspace Detector Module
  // ============================================
  
  class WorkspaceDetector {
    constructor() {
      this.activeWorkspace = null;
      this.config = getConfig();
      this.onWorkspaceChange = null;
      this.workspaceObserver = null; // Store observer for cleanup
      this.validatedWorkspaces = null; // Cache validated workspace list
      this.needsValidation = true; // Flag to track if validation is needed
    }

    /**
     * Get the currently active workspace
     */
    getActiveWorkspace() {
      try {
        const activeButton = document.querySelector('toolbarbutton[zen-workspace-id][active="true"]');
        if (activeButton) {
          return activeButton.getAttribute('zen-workspace-id');
        }
      } catch (e) {
        console.error('Failed to get active workspace:', e);
      }
      return null;
    }

    /**
     * Validate and clean up deleted workspaces from blocked list
     * Only called when workspace changes are detected
     */
    validateBlockedWorkspaces() {
      if (!this.needsValidation) {
        return;
      }
      
      const existingWorkspaces = this.getAllWorkspaces();
      const existingWorkspaceIds = existingWorkspaces.map(ws => ws.id);
      const originalLength = this.config.blockedWorkspaces.length;
      
      // Filter out deleted workspaces
      this.config.blockedWorkspaces = this.config.blockedWorkspaces.filter(
        wsId => existingWorkspaceIds.includes(wsId)
      );
      
      // Save config only if we removed any deleted workspaces
      if (this.config.blockedWorkspaces.length !== originalLength) {
        console.log('Removed deleted workspaces from blocked list');
        saveConfig(this.config);
      }
      
      this.validatedWorkspaces = [...this.config.blockedWorkspaces];
      this.needsValidation = false;
    }

    /**
     * Check if current workspace is blocked
     * PERFORMANCE FIX: Validation only runs on workspace change, not every call
     */
    isCurrentWorkspaceBlocked() {
      // Reload config to get latest blocked workspaces
      this.config = getConfig();
      
      const activeWorkspace = this.getActiveWorkspace();
      if (!activeWorkspace) return false;
      
      return this.config.blockedWorkspaces.includes(activeWorkspace);
    }

    /**
     * Start monitoring workspace changes
     * MEMORY LEAK FIX: Store observer for cleanup
     * PERFORMANCE FIX: Validate workspaces on change, not on every check
     */
    startMonitoring() {
      this.activeWorkspace = this.getActiveWorkspace();
      
      // Clean up existing observer if any
      if (this.workspaceObserver) {
        this.workspaceObserver.disconnect();
      }
      
      // Use MutationObserver to detect workspace changes
      // PERFORMANCE FIX: Use attributeFilter to only observe 'active' attribute changes
      this.workspaceObserver = new MutationObserver(() => {
        const newWorkspace = this.getActiveWorkspace();
        if (newWorkspace !== this.activeWorkspace) {
          this.activeWorkspace = newWorkspace;
          
          // PERFORMANCE FIX: Validate workspaces only on workspace change
          this.needsValidation = true;
          this.validateBlockedWorkspaces();
          
          if (this.onWorkspaceChange) {
            this.onWorkspaceChange(newWorkspace, this.isCurrentWorkspaceBlocked());
          }
        }
      });

      const workspaceContainer = document.querySelector('#zen-workspace-button-container, [id*="workspace"]');
      if (workspaceContainer) {
        this.workspaceObserver.observe(workspaceContainer, {
          attributes: true,
          attributeFilter: ['active'],
          subtree: true
        });
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
    }

    /**
     * Get all available workspaces
     * Uses multiple methods to retrieve workspace names:
     * 1. Try to get from ZenWorkspaces API (multiple possible APIs)
     * 2. Fall back to DOM attributes (label, tooltiptext, aria-label)
     * 3. Try to extract from workspace panel if available
     */
    getAllWorkspaces() {
      try {
        // Method 1: Try ZenWorkspaces API (most reliable)
        const zenResult = this._tryZenWorkspacesApi();
        if (zenResult) return zenResult;
        
        // Method 2: Try legacy gZenWorkspaces API
        const legacyResult = this._tryLegacyWorkspacesApi();
        if (legacyResult) return legacyResult;
        
        // Method 3: Query DOM buttons
        const domResult = this._tryDomWorkspaceButtons();
        if (domResult) return domResult;
        
        // Method 4: Try workspace container elements
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
     * Try to get workspaces from ZenWorkspaces API.
     * @returns {Array|null} Workspaces array or null if not available
     * @private
     */
    _tryZenWorkspacesApi() {
      // eslint-disable-next-line no-undef
      if (typeof ZenWorkspaces === 'undefined') return null;
      
      // eslint-disable-next-line no-undef
      const workspaces = this._getWorkspacesFromObject(ZenWorkspaces);
      
      if (isValidWorkspaceArray(workspaces)) {
        console.log('Zen Pomodoro: Got workspaces from ZenWorkspaces API');
        return formatWorkspacesFromApi(workspaces);
      }
      return null;
    }

    /**
     * Try to get workspaces from legacy gZenWorkspaces API.
     * @returns {Array|null} Workspaces array or null if not available
     * @private
     */
    _tryLegacyWorkspacesApi() {
      // eslint-disable-next-line no-undef
      if (typeof gZenWorkspaces === 'undefined') return null;
      
      // eslint-disable-next-line no-undef
      const workspaces = this._getWorkspacesFromObject(gZenWorkspaces);
      
      if (isValidWorkspaceArray(workspaces)) {
        console.log('Zen Pomodoro: Got workspaces from gZenWorkspaces API');
        return formatWorkspacesFromApi(workspaces);
      }
      return null;
    }

    /**
     * Extract workspaces from a workspace API object.
     * Tries multiple property/method names.
     * @param {Object} wsObject - The workspace API object
     * @returns {Array|null} Workspaces array or null
     * @private
     */
    _getWorkspacesFromObject(wsObject) {
      if (typeof wsObject.getWorkspaces === 'function') {
        return wsObject.getWorkspaces();
      }
      if (wsObject._workspaces !== undefined) {
        return wsObject._workspaces;
      }
      if (wsObject.workspaces !== undefined) {
        return wsObject.workspaces;
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
      return Array.from(buttons).map(btn => {
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
      const container = document.querySelector(
        '#zen-workspaces-button-container, #zen-workspace-button-container, [id*="workspace"]'
      );
      if (!container) return null;
      
      const items = container.querySelectorAll('[zen-workspace-id], [data-workspace-id]');
      if (items.length === 0) return null;
      
      console.log(`Zen Pomodoro: Got ${items.length} workspaces from container`);
      return Array.from(items).map(item => {
        const id = item.getAttribute('zen-workspace-id') || item.getAttribute('data-workspace-id');
        const name = item.getAttribute('label') || 
                    item.getAttribute('data-name') || 
                    item.textContent?.trim() || 
                    `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
        return { id, name };
      });
    }
  }

  // ============================================
  // Overlay Manager Module
  // ============================================
  
  class OverlayManager {
    constructor() {
      this.overlay = null;
      this.indicator = null;
      this.config = getConfig();
      this.isVisible = false;
      this.contentAreaObserver = null; // Issue 1: Observer for content area size changes
      this.indicatorWidth = 0; // Cached indicator width for drag operations
      this.indicatorHeight = 0; // Cached indicator height for drag operations
      this.indicatorMouseDownHandler = null; // Store for cleanup
      this.contentArea = null; // Store reference for cleanup
      this.originalContentAreaPosition = null; // Store original position for restoration
      this._overlayUpdateScheduled = false; // Debounce flag for ResizeObserver
    }

    /**
     * Create overlay elements
     * SECURITY FIX: Use textContent instead of innerHTML for user content
     */
    createOverlay() {
      if (this.overlay) return;

      // Main overlay
      this.overlay = document.createElement('div');
      this.overlay.id = 'zen-pomodoro-overlay';
      
      // Create content container
      const content = document.createElement('div');
      content.id = 'zen-pomodoro-content';
      
      // Phase label
      const phaseLabel = document.createElement('div');
      phaseLabel.id = 'zen-pomodoro-phase-label';
      phaseLabel.textContent = 'Focus Period';
      
      // Timer display
      const timerDisplay = document.createElement('div');
      timerDisplay.id = 'zen-pomodoro-timer-display';
      timerDisplay.textContent = '25:00';
      
      // Cycle progress
      const cycleProgress = document.createElement('div');
      cycleProgress.id = 'zen-pomodoro-cycle-progress';
      cycleProgress.textContent = 'Cycle 1 of 4';
      
      // Motivational message - SECURITY FIX: Use textContent
      const message = document.createElement('div');
      message.id = 'zen-pomodoro-message';
      message.textContent = sanitizeText(this.config.motivationalMessage);
      
      // Controls
      const controls = document.createElement('div');
      controls.id = 'zen-pomodoro-controls';
      
      const pauseButton = document.createElement('button');
      pauseButton.className = 'zen-pomodoro-button';
      pauseButton.id = 'zen-pomodoro-pause-button';
      pauseButton.textContent = 'Pause';
      
      const stopButton = document.createElement('button');
      stopButton.className = 'zen-pomodoro-button';
      stopButton.id = 'zen-pomodoro-stop-button';
      stopButton.textContent = 'Stop Timer';
      
      // Dev bypass button for timer overlay
      const devButton = document.createElement('button');
      devButton.className = 'zen-pomodoro-button dev';
      devButton.id = 'zen-pomodoro-overlay-dev-button';
      devButton.textContent = 'Dev';
      
      controls.appendChild(pauseButton);
      controls.appendChild(stopButton);
      controls.appendChild(devButton);
      
      content.appendChild(phaseLabel);
      content.appendChild(timerDisplay);
      content.appendChild(cycleProgress);
      content.appendChild(message);
      content.appendChild(controls);
      
      this.overlay.appendChild(content);

      // Persistent indicator
      this.indicator = document.createElement('div');
      this.indicator.id = 'zen-pomodoro-indicator';
      
      const indicatorDot = document.createElement('div');
      indicatorDot.id = 'zen-pomodoro-indicator-dot';
      
      const indicatorText = document.createElement('span');
      indicatorText.id = 'zen-pomodoro-indicator-text';
      indicatorText.textContent = 'Focus: 25:00';
      
      this.indicator.appendChild(indicatorDot);
      this.indicator.appendChild(indicatorText);

      // Issue 1: Position overlay within content area instead of full window
      const contentArea = document.querySelector('#tabbrowser-tabpanels') || 
                          document.querySelector('#appcontent') || 
                          document.querySelector('#browser');
      if (contentArea) {
        // Store reference and original position for cleanup
        this.contentArea = contentArea;
        const computedPosition = window.getComputedStyle(contentArea).position;
        this.originalContentAreaPosition = computedPosition;
        
        // Only set position if not already a positioning context
        if (computedPosition === 'static') {
          contentArea.style.position = 'relative';
        }
        contentArea.appendChild(this.overlay);
        
        // Issue 1: Set up observer for content area size changes
        this.setupContentAreaObserver(contentArea);
      } else {
        // Fallback to document root if content area not found
        document.documentElement.appendChild(this.overlay);
      }
      
      document.documentElement.appendChild(this.indicator);

      // Issue 8: Set up drag functionality for indicator
      this.setupIndicatorDrag();
      
      // Set up button handlers after elements are created
      // RACE CONDITION FIX: Set up handlers immediately after creation
      this.setupOverlayHandlers();
    }

    /**
     * Issue 1: Set up observer for content area size changes
     * Watches for size/position changes when sidebars are toggled or resized
     */
    setupContentAreaObserver(contentArea) {
      this._cleanupContentAreaObserver();
      
      const browser = document.querySelector('#browser');
      
      this.contentAreaObserver = new ResizeObserver((entries) => {
        if (this._shouldUpdateOverlay(entries, contentArea, browser)) {
          this._scheduleOverlayUpdate(contentArea);
        }
      });
      
      this.contentAreaObserver.observe(contentArea);
      
      if (browser && browser !== contentArea) {
        this.contentAreaObserver.observe(browser);
      }
      
      this.updateOverlayPosition(contentArea);
    }

    /**
     * Clean up existing content area observer.
     * @private
     */
    _cleanupContentAreaObserver() {
      if (this.contentAreaObserver) {
        this.contentAreaObserver.disconnect();
        this.contentAreaObserver = null;
      }
    }

    /**
     * Check if overlay should be updated based on resize entries.
     * @param {ResizeObserverEntry[]} entries - Resize observer entries
     * @param {Element} contentArea - The content area element
     * @param {Element|null} browser - The browser element
     * @returns {boolean} True if overlay should update
     * @private
     */
    _shouldUpdateOverlay(entries, contentArea, browser) {
      return entries.some(entry => 
        entry.target === contentArea || (browser && entry.target === browser)
      );
    }

    /**
     * Schedule a debounced overlay position update.
     * @param {Element} contentArea - The content area element
     * @private
     */
    _scheduleOverlayUpdate(contentArea) {
      if (this._overlayUpdateScheduled) return;
      
      this._overlayUpdateScheduled = true;
      requestAnimationFrame(() => {
        this._overlayUpdateScheduled = false;
        this.updateOverlayPosition(contentArea);
      });
    }

    /**
     * Issue 1: Update overlay position to match content area
     * Ensures the overlay continues to cover the visible content area when it resizes.
     */
    updateOverlayPosition(contentArea) {
      if (!this.overlay || !contentArea) {
        return;
      }

      // Ensure the overlay is positioned relative to the content area
      // CSS handles most sizing via width/height: 100%, but we ensure positioning is correct
      this.overlay.style.position = 'absolute';
      this.overlay.style.top = '0';
      this.overlay.style.left = '0';
    }

    /**
     * Issue 8: Set up drag functionality for indicator
     */
    setupIndicatorDrag() {
      if (!this.indicator) return;
      
      let isDragging = false;
      let startX, startY;
      let startLeft, startTop;
      
      // Load saved position from preferences and validate against viewport bounds
      const savedPosX = getPref('indicatorPosX', null);
      const savedPosY = getPref('indicatorPosY', null);
      if (savedPosX !== null && savedPosY !== null) {
        // Ensure saved position is within current viewport bounds
        const rect = this.indicator.getBoundingClientRect();
        const indicatorWidth = rect.width;
        const indicatorHeight = rect.height;

        const rawX = Number(savedPosX);
        const rawY = Number(savedPosY);

        if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
          const maxX = Math.max(0, window.innerWidth - indicatorWidth);
          const maxY = Math.max(0, window.innerHeight - indicatorHeight);

          const clampedX = Math.max(0, Math.min(rawX, maxX));
          const clampedY = Math.max(0, Math.min(rawY, maxY));

          this.indicator.style.right = 'auto';
          this.indicator.style.left = `${clampedX}px`;
          this.indicator.style.top = `${clampedY}px`;
        }
      }
      
      const onMouseDown = (e) => {
        // Only start drag on left mouse button
        if (e.button !== 0) return;
        
        e.preventDefault();
        isDragging = true;
        
        const rect = this.indicator.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        
        // Cache dimensions at start of drag to avoid repeated getBoundingClientRect calls
        this.indicatorWidth = rect.width;
        this.indicatorHeight = rect.height;
        
        this.indicator.style.cursor = 'grabbing';
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
      
      const onMouseMove = (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;
        
        // Keep within viewport boundaries using cached dimensions
        const maxX = window.innerWidth - this.indicatorWidth;
        const maxY = window.innerHeight - this.indicatorHeight;
        
        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));
        
        // Use left positioning instead of right
        this.indicator.style.right = 'auto';
        this.indicator.style.left = `${newLeft}px`;
        this.indicator.style.top = `${newTop}px`;
      };
      
      const onMouseUp = () => {
        if (!isDragging) return;
        
        isDragging = false;
        this.indicator.style.cursor = '';
        
        // Save position to preferences
        const rect = this.indicator.getBoundingClientRect();
        setPref('indicatorPosX', Math.round(rect.left));
        setPref('indicatorPosY', Math.round(rect.top));
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      // Store reference for cleanup
      this.indicatorMouseDownHandler = onMouseDown;
      this.indicator.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Set up overlay button handlers
     * RACE CONDITION FIX: Called immediately after overlay creation
     */
    setupOverlayHandlers() {
      const pauseButton = this.overlay?.querySelector('#zen-pomodoro-pause-button');
      const stopButton = this.overlay?.querySelector('#zen-pomodoro-stop-button');
      const devButton = this.overlay?.querySelector('#zen-pomodoro-overlay-dev-button');
      
      if (pauseButton) {
        pauseButton.addEventListener('click', () => {
          if (window.zenPomodoroApp && window.zenPomodoroApp.timer) {
            if (window.zenPomodoroApp.timer.isPaused) {
              window.zenPomodoroApp.timer.resume();
              pauseButton.textContent = 'Pause';
            } else {
              window.zenPomodoroApp.timer.pause();
              pauseButton.textContent = 'Resume';
            }
          }
        });
      }
      
      if (stopButton) {
        stopButton.addEventListener('click', () => {
          // Issue 6: Require lockout before stopping timer using helper function
          handleStopTimerWithLockout(() => {
            window.zenPomodoroApp.stopTimer();
          });
        });
      }
      
      // Dev bypass button handler - shows dev bypass prompt to end timer early
      if (devButton) {
        devButton.addEventListener('click', () => {
          if (window.zenPomodoroApp && window.zenPomodoroApp.security) {
            window.zenPomodoroApp.security.showDevBypassPrompt(() => {
              // Dev bypass successful - stop the timer
              window.zenPomodoroApp.stopTimer();
            });
          }
        });
      }
    }

    /**
     * Show overlay
     * 
     * FLICKERING FIX (Issue 2): The overlay was flickering because the CSS animation
     * was re-triggering every second when updateOverlayVisibility() called show().
     * 
     * Solution: Use two-class approach:
     * 1. 'active' class controls display (flex/none)
     * 2. 'zen-pomodoro-animate-in' class triggers the fade-in animation
     * 
     * CSS selector requires BOTH classes: .active.zen-pomodoro-animate-in
     * This ensures animation only runs once when overlay first appears.
     * The animation class is removed in hide() so it can re-trigger next time.
     */
    show(phase = 'focus') {
      if (!this.overlay) this.createOverlay();
      
      // Only add classes and trigger animation if not already showing
      if (!this.isVisible) {
        this.overlay.classList.add('active');
        // Animation class triggers CSS animation (removed in hide() for re-trigger)
        this.overlay.classList.add('zen-pomodoro-animate-in');
        this.isVisible = true;
      }
      
      // Only update phase color when phase actually changes
      const currentPhase = this.overlay.getAttribute('data-phase');
      if (currentPhase !== phase) {
        this.overlay.setAttribute('data-phase', phase);
        this.updatePhaseColor(phase);
      }
    }

    /**
     * Hide overlay
     * Removes both active and animation classes.
     * Animation class removal allows re-triggering when show() is called again.
     */
    hide() {
      if (this.overlay) {
        this.overlay.classList.remove('active');
        this.overlay.classList.remove('zen-pomodoro-animate-in');
        this.isVisible = false;
      }
    }

    /**
     * Update timer display
     * SECURITY FIX: Use textContent instead of innerHTML
     */
    updateDisplay(remainingTime, phase, currentCycle, totalCycles) {
      if (!this.overlay) return;

      const timeStr = formatTime(remainingTime);
      
      this._updateTimerText(timeStr);
      this._updatePhaseLabel(phase);
      this._updateCycleProgress(phase, currentCycle, totalCycles);
      this._updateIndicator(phase, timeStr);
    }

    /**
     * Update the main timer text display.
     * @param {string} timeStr - Formatted time string
     * @private
     */
    _updateTimerText(timeStr) {
      const timerDisplay = this.overlay.querySelector('#zen-pomodoro-timer-display');
      if (timerDisplay) timerDisplay.textContent = timeStr;
    }

    /**
     * Update the phase label display.
     * @param {string} phase - Current phase identifier
     * @private
     */
    _updatePhaseLabel(phase) {
      const phaseLabel = this.overlay.querySelector('#zen-pomodoro-phase-label');
      if (phaseLabel) {
        phaseLabel.textContent = getPhaseLabel(phase);
      }
    }

    /**
     * Update the cycle progress display.
     * @param {string} phase - Current phase identifier
     * @param {number} currentCycle - Current cycle number
     * @param {number} totalCycles - Total number of cycles
     * @private
     */
    _updateCycleProgress(phase, currentCycle, totalCycles) {
      const cycleProgress = this.overlay.querySelector('#zen-pomodoro-cycle-progress');
      if (!cycleProgress) return;
      
      const shouldShow = phase === 'focus';
      cycleProgress.style.display = shouldShow ? 'block' : 'none';
      if (shouldShow) {
        cycleProgress.textContent = `Cycle ${currentCycle} of ${totalCycles}`;
      }
    }

    /**
     * Update the corner indicator.
     * @param {string} phase - Current phase identifier
     * @param {string} timeStr - Formatted time string
     * @private
     */
    _updateIndicator(phase, timeStr) {
      const indicatorText = this.indicator?.querySelector('#zen-pomodoro-indicator-text');
      if (indicatorText) {
        indicatorText.textContent = `${getShortPhaseLabel(phase)}: ${timeStr}`;
      }
      if (this.indicator) {
        this.indicator.setAttribute('data-phase', phase);
      }
    }

    /**
     * Update phase color
     */
    updatePhaseColor(phase) {
      if (!this.overlay) return;
      
      this.overlay.setAttribute('data-phase', phase);
      
      // Trigger transition animation
      this.overlay.setAttribute('data-transitioning', 'true');
      setTimeout(() => {
        if (this.overlay) {
          this.overlay.removeAttribute('data-transitioning');
        }
      }, 500);
    }

    /**
     * Show persistent indicator
     */
    showIndicator() {
      if (!this.indicator) this.createOverlay();
      this.indicator.classList.add('active');
    }

    /**
     * Hide persistent indicator
     */
    hideIndicator() {
      if (this.indicator) {
        this.indicator.classList.remove('active');
      }
    }

    /**
     * Remove overlay elements and cleanup
     * MEMORY LEAK FIX: Clean up ResizeObserver and event listeners on destroy
     */
    destroy() {
      this._cleanupContentAreaObserver();
      this._restoreContentAreaPosition();
      this._cleanupIndicatorEventListener();
      this._removeOverlayElements();
    }

    /**
     * Restore original content area position if modified.
     * @private
     */
    _restoreContentAreaPosition() {
      if (!this.contentArea || !this.originalContentAreaPosition) return;
      
      const position = this.originalContentAreaPosition === 'static' ? '' : this.originalContentAreaPosition;
      this.contentArea.style.position = position;
      this.contentArea = null;
      this.originalContentAreaPosition = null;
    }

    /**
     * Clean up indicator mouse event listener.
     * @private
     */
    _cleanupIndicatorEventListener() {
      if (this.indicator && this.indicatorMouseDownHandler) {
        this.indicator.removeEventListener('mousedown', this.indicatorMouseDownHandler);
        this.indicatorMouseDownHandler = null;
      }
    }

    /**
     * Remove overlay and indicator elements from DOM.
     * @private
     */
    _removeOverlayElements() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      if (this.indicator) {
        this.indicator.remove();
        this.indicator = null;
      }
    }
  }

  // ============================================
  // Keyboard Shortcut Module
  // ============================================
  
  // Issue 4: Define dialog selectors as a constant for maintainability
  const POMODORO_DIALOG_SELECTORS = [
    '#zen-pomodoro-menu-dialog',
    '#zen-pomodoro-start-dialog',
    '#zen-pomodoro-settings-dialog',
    '#zen-pomodoro-lock-screen',
    '#zen-pomodoro-alert-dialog',
    '#zen-pomodoro-confirm-dialog',
    '#zen-pomodoro-dev-bypass-dialog'
  ];
  
  /**
   * Mapping of shortcut modifier key names to their corresponding event property names.
   * Used by parseShortcut to convert string shortcuts (e.g., "Ctrl+Shift+P") to key objects.
   * @constant {Object<string, string>}
   */
  const SHORTCUT_MODIFIER_MAP = {
    'ctrl': 'ctrlKey',
    'control': 'ctrlKey',
    'alt': 'altKey',
    'shift': 'shiftKey',
    'meta': 'metaKey',
    'cmd': 'metaKey',
    'command': 'metaKey'
  };
  
  class KeyboardShortcutHandler {
    constructor() {
      this.keydownHandler = null;
      this.menuDialog = null;
    }

    /**
     * Issue 3: Close all existing dialogs to prevent duplicates
     * MEMORY LEAK FIX: Clean up associated resources for dialogs that manage state
     */
    closeAllDialogs() {
      // Clean up lock screen resources if the security manager exists
      if (window.zenPomodoroApp?.security) {
        window.zenPomodoroApp.security.cleanupLockScreen();
      }
      
      POMODORO_DIALOG_SELECTORS.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.remove();
      });
      this.menuDialog = null;
    }

    /**
     * Initialize keyboard shortcut handler
     */
    init() {
      const config = getConfig();
      this.setupKeyboardShortcut(config.keyboardShortcut);
      console.log(`Zen Pomodoro: Keyboard shortcut registered: ${config.keyboardShortcut}`);
    }

    /**
     * Parse keyboard shortcut string into components.
     * Uses SHORTCUT_MODIFIER_MAP lookup table for cleaner code.
     * @param {string} shortcut - e.g., "Alt+Shift+P" or "Ctrl+P"
     * @returns {object} - { ctrlKey, altKey, shiftKey, metaKey, key }
     */
    parseShortcut(shortcut) {
      const parts = shortcut.split('+').map(p => p.trim().toLowerCase());
      const result = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        key: ''
      };
      
      for (const part of parts) {
        const modifierKey = SHORTCUT_MODIFIER_MAP[part];
        if (modifierKey) {
          result[modifierKey] = true;
        } else {
          result.key = part.toUpperCase();
        }
      }
      
      return result;
    }

    /**
     * Setup keyboard shortcut listener
     * @param {string} shortcut - Keyboard shortcut string
     */
    setupKeyboardShortcut(shortcut) {
      // Clean up existing handler
      if (this.keydownHandler) {
        document.removeEventListener('keydown', this.keydownHandler);
      }
      
      const parsed = this.parseShortcut(shortcut);
      
      this.keydownHandler = (event) => {
        // Check if all modifier keys match using helper function
        if (this._isShortcutMatch(event, parsed)) {
          event.preventDefault();
          event.stopPropagation();
          this.showPomodoroMenu();
        }
      };
      
      document.addEventListener('keydown', this.keydownHandler, true);
    }

    /**
     * Check if a keyboard event matches the parsed shortcut.
     * @param {KeyboardEvent} event - The keyboard event
     * @param {Object} parsed - Parsed shortcut with modifier key booleans and key
     * @returns {boolean} True if event matches shortcut
     * @private
     */
    _isShortcutMatch(event, parsed) {
      const modifiersMatch = 
        event.ctrlKey === parsed.ctrlKey &&
        event.altKey === parsed.altKey &&
        event.shiftKey === parsed.shiftKey &&
        event.metaKey === parsed.metaKey;
      
      return modifiersMatch && event.key.toUpperCase() === parsed.key;
    }

    /**
     * Show the main Pomodoro menu dialog
     * Issue 4: Toggle behavior - if any dialog is open, close it instead of creating new
     */
    showPomodoroMenu() {
      // Issue 4: Check if any dialogs are currently open using shared constant
      const existingDialogs = document.querySelectorAll(
        POMODORO_DIALOG_SELECTORS.join(', ')
      );
      
      if (existingDialogs.length > 0) {
        // If any dialog exists, close them all and return (toggle behavior)
        this.closeAllDialogs();
        return;
      }
      
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-menu-dialog';
      dialog.className = 'zen-pomodoro-dialog active';
      this.menuDialog = dialog;
      
      const h2 = document.createElement('h2');
      h2.textContent = '⏱️ Pomodoro Timer';
      
      const menuSection = document.createElement('div');
      menuSection.className = 'zen-pomodoro-config-section';
      
      const timerActive = window.zenPomodoroApp && window.zenPomodoroApp.timer && window.zenPomodoroApp.timer.isActive;
      
      if (timerActive) {
        // Timer is running - show timer controls
        const status = window.zenPomodoroApp.timer.getStatus();
        const timeStr = formatTime(status.remainingTime);
        const phaseStr = status.currentPhase === 'focus' ? 'Focus' : 
                        status.currentPhase === 'break' ? 'Break' : 'Long Break';
        
        const statusRow = document.createElement('div');
        statusRow.className = 'zen-pomodoro-config-row';
        statusRow.style.justifyContent = 'center';
        statusRow.style.marginBottom = '16px';
        const statusText = document.createElement('div');
        statusText.style.fontSize = '18px';
        statusText.style.fontWeight = '600';
        statusText.textContent = `${phaseStr}: ${timeStr} (Cycle ${status.currentCycle}/${status.totalCycles})`;
        statusRow.appendChild(statusText);
        
        const pauseResumeBtn = document.createElement('button');
        pauseResumeBtn.className = 'zen-pomodoro-dialog-button';
        pauseResumeBtn.textContent = status.isPaused ? 'Resume Timer' : 'Pause Timer';
        pauseResumeBtn.addEventListener('click', () => {
          if (window.zenPomodoroApp.timer.isPaused) {
            window.zenPomodoroApp.timer.resume();
          } else {
            window.zenPomodoroApp.timer.pause();
          }
          dialog.remove();
          this.menuDialog = null;
        });
        
        const stopBtn = document.createElement('button');
        stopBtn.className = 'zen-pomodoro-dialog-button secondary';
        stopBtn.textContent = 'Stop Timer';
        stopBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          // Issue 6: Require lockout before stopping timer using helper function
          handleStopTimerWithLockout(() => {
            window.zenPomodoroApp.stopTimer();
          });
        });
        
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'zen-pomodoro-dialog-button secondary';
        settingsBtn.textContent = 'Timer Settings';
        settingsBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showSettingsDialog();
        });
        
        menuSection.appendChild(statusRow);
        menuSection.appendChild(pauseResumeBtn);
        menuSection.appendChild(stopBtn);
        menuSection.appendChild(settingsBtn);
      } else {
        // Timer not running - show start options
        const startBtn = document.createElement('button');
        startBtn.className = 'zen-pomodoro-dialog-button';
        startBtn.textContent = 'Start Pomodoro Timer';
        startBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showConfigDialog();
        });
        
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'zen-pomodoro-dialog-button secondary';
        settingsBtn.textContent = 'Timer Settings';
        settingsBtn.addEventListener('click', () => {
          dialog.remove();
          this.menuDialog = null;
          this.showSettingsDialog();
        });
        
        menuSection.appendChild(startBtn);
        menuSection.appendChild(settingsBtn);
      }
      
      // Buttons section
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Close';
      cancelButton.addEventListener('click', () => {
        dialog.remove();
        this.menuDialog = null;
      });
      
      buttonDiv.appendChild(cancelButton);
      
      dialog.appendChild(h2);
      dialog.appendChild(menuSection);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      // Issue 8: Make dialog draggable
      setupDialogDrag(dialog);
      
      // Focus the dialog
      dialog.focus();
      
      // Close on Escape key
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          dialog.remove();
          this.menuDialog = null;
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
      if (this.keydownHandler) {
        document.removeEventListener('keydown', this.keydownHandler, true);
        this.keydownHandler = null;
      }
      if (this.menuDialog) {
        this.menuDialog.remove();
        this.menuDialog = null;
      }
    }

    /**
     * Show timer configuration dialog
     */
    showConfigDialog() {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-start-dialog';
      dialog.className = 'zen-pomodoro-dialog active';
      
      const config = getConfig();
      const isSimpleMode = config.timerMode === 'simple';
      
      // Create dialog structure
      const backButton = this._createBackButton(dialog);
      const h2 = this._createDialogTitle('Start Timer');
      const configSection = document.createElement('div');
      configSection.className = 'zen-pomodoro-config-section';
      
      // Mode selection using helper
      const { row: modeRow, select: modeSelect } = createLabeledSelectRow('Timer Mode:', 'zen-pomodoro-mode-select', [
        { value: 'simple', text: 'Simple Timer', selected: isSimpleMode },
        { value: 'pomodoro', text: 'Pomodoro Mode', selected: !isSimpleMode }
      ]);
      
      // Duration inputs using helper
      const simpleDurationRow = createLabeledInputRow('Duration (min):', 'zen-pomodoro-simple-duration-input', 
        { value: config.simpleDuration, min: '1', max: '180' });
      simpleDurationRow.style.display = isSimpleMode ? 'flex' : 'none';
      
      const focusDurationRow = createLabeledInputRow('Focus (min):', 'zen-pomodoro-focus-duration-input',
        { value: config.focusDuration, min: '1', max: '120' });
      focusDurationRow.style.display = isSimpleMode ? 'none' : 'flex';
      
      const breakDurationRow = createLabeledInputRow('Break (min):', 'zen-pomodoro-break-duration-input',
        { value: config.breakDuration, min: '1', max: '30' });
      breakDurationRow.style.display = isSimpleMode ? 'none' : 'flex';
      
      const cyclesRow = createLabeledInputRow('Number of Cycles:', 'zen-pomodoro-cycles-input',
        { value: config.cycles, min: '1', max: '20' });
      cyclesRow.style.display = isSimpleMode ? 'none' : 'flex';
      
      // Add to config section
      [modeRow, simpleDurationRow, focusDurationRow, breakDurationRow, cyclesRow]
        .forEach(row => configSection.appendChild(row));
      
      // Buttons
      const { buttonDiv, cancelButton, startButton } = this._createStartDialogButtons(config);
      
      // Assemble dialog
      [backButton, h2, configSection, buttonDiv].forEach(el => dialog.appendChild(el));
      document.documentElement.appendChild(dialog);
      setupDialogDrag(dialog);
      
      // Event handlers
      this._setupModeToggleHandler(modeSelect, {
        simpleDurationRow,
        focusDurationRow,
        breakDurationRow,
        cyclesRow
      });
      cancelButton.addEventListener('click', () => dialog.remove());
      this._setupStartHandler(dialog, config, modeSelect, startButton);
    }

    /**
     * Create a back button for dialogs.
     * @param {HTMLElement} dialog - The dialog element
     * @returns {HTMLButtonElement} The back button
     * @private
     */
    _createBackButton(dialog) {
      const backButton = document.createElement('button');
      backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
      backButton.textContent = '← Back';
      backButton.addEventListener('click', () => {
        if (dialog && dialog.parentNode) {
          dialog.remove();
        }
        this.showPomodoroMenu();
      });
      return backButton;
    }

    /**
     * Create a dialog title element.
     * @param {string} text - Title text
     * @returns {HTMLHeadingElement} The title element
     * @private
     */
    _createDialogTitle(text) {
      const h2 = document.createElement('h2');
      h2.textContent = text;
      return h2;
    }

    /**
     * Create buttons for the start timer dialog.
     * @param {Object} config - Config object
     * @returns {{buttonDiv: HTMLElement, cancelButton: HTMLButtonElement, startButton: HTMLButtonElement}}
     * @private
     */
    _createStartDialogButtons(config) {
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.id = 'zen-pomodoro-cancel-button';
      cancelButton.textContent = 'Cancel';
      
      const startButton = document.createElement('button');
      startButton.className = 'zen-pomodoro-dialog-button';
      
      if (config.holdToStartDuration > 0) {
        startButton.id = 'zen-pomodoro-hold-to-start';
        startButton.textContent = `Hold to Start (${config.holdToStartDuration / 1000}s)`;
      } else {
        startButton.id = 'zen-pomodoro-start-button';
        startButton.textContent = 'Start Timer';
      }
      
      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(startButton);
      
      return { buttonDiv, cancelButton, startButton };
    }

    /**
     * Setup mode toggle handler for showing/hiding duration rows.
     * @param {HTMLSelectElement} modeSelect - Mode select element
     * @param {Object} rows - Object containing row elements
     * @param {HTMLElement} rows.simpleDurationRow - Simple duration row
     * @param {HTMLElement} rows.focusDurationRow - Focus duration row
     * @param {HTMLElement} rows.breakDurationRow - Break duration row
     * @param {HTMLElement} rows.cyclesRow - Cycles row
     * @private
     */
    _setupModeToggleHandler(modeSelect, rows) {
      modeSelect.addEventListener('change', () => {
        const isSimple = modeSelect.value === 'simple';
        rows.simpleDurationRow.style.display = isSimple ? 'flex' : 'none';
        rows.focusDurationRow.style.display = isSimple ? 'none' : 'flex';
        rows.breakDurationRow.style.display = isSimple ? 'none' : 'flex';
        rows.cyclesRow.style.display = isSimple ? 'none' : 'flex';
      });
    }

    /**
     * Setup start button handler with session duration overrides.
     * @param {HTMLElement} dialog - Dialog element
     * @param {Object} config - Config object
     * @param {HTMLSelectElement} modeSelect - Mode select element
     * @param {HTMLButtonElement} startButton - Start button element
     * @private
     */
    _setupStartHandler(dialog, config, modeSelect, startButton) {
      const applyDurationsAndStart = () => {
        const mode = modeSelect.value;
        const cyclesInput = dialog.querySelector('#zen-pomodoro-cycles-input');
        const cycles = cyclesInput
          ? validateIntegerInput(cyclesInput.value, 1, 20, config.cycles)
          : config.cycles;
        
        const sessionOverrides = this._buildSessionOverrides(dialog, mode, config);
        
        dialog.remove();
        
        if (window.zenPomodoroApp) {
          window.zenPomodoroApp.startTimer(mode, cycles, sessionOverrides);
        }
      };
      
      if (config.holdToStartDuration > 0 && window.zenPomodoroApp?.security) {
        window.zenPomodoroApp.security.setupHoldToStart(startButton, applyDurationsAndStart);
      } else {
        startButton.addEventListener('click', applyDurationsAndStart);
      }
    }

    /**
     * Build session override object from dialog inputs.
     * @param {HTMLElement} dialog - Dialog element
     * @param {string} mode - Timer mode
     * @param {Object} config - Config object
     * @returns {Object} Session overrides
     * @private
     */
    _buildSessionOverrides(dialog, mode, config) {
      const sessionOverrides = {};
      
      if (mode === 'simple') {
        const simpleDurationInput = dialog.querySelector('#zen-pomodoro-simple-duration-input');
        sessionOverrides.simpleDuration = simpleDurationInput
          ? validateIntegerInput(simpleDurationInput.value, 1, 180, config.simpleDuration)
          : config.simpleDuration;
      } else {
        const focusDurationInput = dialog.querySelector('#zen-pomodoro-focus-duration-input');
        const breakDurationInput = dialog.querySelector('#zen-pomodoro-break-duration-input');
        sessionOverrides.focusDuration = focusDurationInput
          ? validateIntegerInput(focusDurationInput.value, 1, 120, config.focusDuration)
          : config.focusDuration;
        sessionOverrides.breakDuration = breakDurationInput
          ? validateIntegerInput(breakDurationInput.value, 1, 30, config.breakDuration)
          : config.breakDuration;
      }
      
      return sessionOverrides;
    }

    /**
     * Show settings dialog
     * Checks security lock before showing
     */
    showSettingsDialog() {
      // Check if security lock should be shown
      if (window.zenPomodoroApp && window.zenPomodoroApp.security) {
        const timerActive = window.zenPomodoroApp.timer.isActive;
        if (window.zenPomodoroApp.security.shouldLockSettings(timerActive)) {
          window.zenPomodoroApp.security.showLockScreen(timerActive, () => {
            this.createSettingsDialog();
          });
          return;
        }
      }
      
      this.createSettingsDialog();
    }

    /**
     * Create the actual settings dialog
     */
    createSettingsDialog() {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-settings-dialog';
      dialog.className = 'zen-pomodoro-dialog active';
      
      const config = getConfig();
      
      // Issue 5: Add back button
      const backButton = document.createElement('button');
      backButton.className = 'zen-pomodoro-dialog-button secondary zen-pomodoro-back-button';
      backButton.textContent = '← Back';
      backButton.addEventListener('click', () => {
        dialog.remove();
        this.showPomodoroMenu();
      });
      
      const h2 = document.createElement('h2');
      h2.textContent = 'Pomodoro Timer Settings';
      
      const configSection = document.createElement('div');
      configSection.className = 'zen-pomodoro-config-section';
      
      // ========================================
      // Keyboard Shortcut Recorder
      // ========================================
      const shortcutRow = document.createElement('div');
      shortcutRow.className = 'zen-pomodoro-config-row';
      const shortcutLabel = document.createElement('label');
      shortcutLabel.textContent = 'Keyboard Shortcut:';
      const shortcutInput = document.createElement('div');
      shortcutInput.className = 'zen-pomodoro-shortcut-recorder';
      shortcutInput.id = 'keyboard-shortcut';
      shortcutInput.tabIndex = 0;
      shortcutInput.textContent = config.keyboardShortcut;
      shortcutInput.setAttribute('data-shortcut', config.keyboardShortcut);
      
      let isRecording = false;
      
      shortcutInput.addEventListener('click', () => {
        if (!isRecording) {
          isRecording = true;
          shortcutInput.textContent = 'Press keys...';
          shortcutInput.classList.add('recording');
        }
      });
      
      shortcutInput.addEventListener('keydown', (e) => {
        if (!isRecording) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Build shortcut string from modifier keys + regular key
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Meta');
        
        // Get the key (ignore modifier keys alone)
        // Normalize key: single characters to uppercase, special keys keep their natural casing
        const key = e.key;
        if (!MODIFIER_KEYS.includes(key)) {
          // Only uppercase single character keys, keep special keys like ArrowUp, Enter as-is
          const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
          parts.push(normalizedKey);
          
          const shortcutStr = parts.join('+');
          shortcutInput.textContent = shortcutStr;
          shortcutInput.setAttribute('data-shortcut', shortcutStr);
          shortcutInput.classList.remove('recording');
          isRecording = false;
        }
      });
      
      shortcutInput.addEventListener('blur', () => {
        if (isRecording) {
          shortcutInput.textContent = shortcutInput.getAttribute('data-shortcut');
          shortcutInput.classList.remove('recording');
          isRecording = false;
        }
      });
      
      shortcutRow.appendChild(shortcutLabel);
      shortcutRow.appendChild(shortcutInput);
      
      // ========================================
      // Timer Mode Selection
      // ========================================
      const timerModeRow = document.createElement('div');
      timerModeRow.className = 'zen-pomodoro-config-row';
      const timerModeLabel = document.createElement('label');
      timerModeLabel.textContent = 'Timer Mode:';
      const timerModeSelect = document.createElement('select');
      timerModeSelect.id = 'timer-mode';
      
      const simpleOption = document.createElement('option');
      simpleOption.value = 'simple';
      simpleOption.textContent = 'Simple Timer';
      simpleOption.selected = config.timerMode === 'simple';
      
      const pomodoroOption = document.createElement('option');
      pomodoroOption.value = 'pomodoro';
      pomodoroOption.textContent = 'Pomodoro Timer';
      pomodoroOption.selected = config.timerMode === 'pomodoro';
      
      timerModeSelect.appendChild(simpleOption);
      timerModeSelect.appendChild(pomodoroOption);
      timerModeRow.appendChild(timerModeLabel);
      timerModeRow.appendChild(timerModeSelect);
      
      // ========================================
      // Simple Timer Duration (only visible for simple mode)
      // ========================================
      const simpleDurationRow = this.createInputRow('Simple Timer Duration (min):', 'simple-duration', 
        { value: config.simpleDuration, min: 1, max: 180 });
      simpleDurationRow.id = 'simple-duration-row';
      if (config.timerMode !== 'simple') {
        simpleDurationRow.classList.add('hidden');
      }
      
      // ========================================
      // Pomodoro-specific options
      // ========================================
      const focusRow = this.createInputRow('Focus Duration (min):', 'focus-duration', 
        { value: config.focusDuration, min: 1, max: 120 });
      focusRow.id = 'focus-duration-row';
      if (config.timerMode === 'simple') {
        focusRow.classList.add('hidden');
      }
      
      const breakRow = this.createInputRow('Break Duration (min):', 'break-duration', 
        { value: config.breakDuration, min: 1, max: 30 });
      breakRow.id = 'break-duration-row';
      if (config.timerMode === 'simple') {
        breakRow.classList.add('hidden');
      }
      
      const longBreakRow = this.createInputRow('Long Break (min):', 'long-break-duration', 
        { value: config.longBreakDuration, min: 5, max: 60 });
      longBreakRow.id = 'long-break-duration-row';
      if (config.timerMode === 'simple') {
        longBreakRow.classList.add('hidden');
      }
      
      const cyclesRow = this.createInputRow('Number of Cycles:', 'cycles', 
        { value: config.cycles, min: 1, max: 20 });
      cyclesRow.id = 'cycles-row';
      if (config.timerMode === 'simple') {
        cyclesRow.classList.add('hidden');
      }
      
      // Timer mode change handler
      timerModeSelect.addEventListener('change', () => {
        const isSimple = timerModeSelect.value === 'simple';
        simpleDurationRow.classList.toggle('hidden', !isSimple);
        focusRow.classList.toggle('hidden', isSimple);
        breakRow.classList.toggle('hidden', isSimple);
        longBreakRow.classList.toggle('hidden', isSimple);
        cyclesRow.classList.toggle('hidden', isSimple);
      });
      
      // ========================================
      // Motivational message
      // ========================================
      const messageRow = document.createElement('div');
      messageRow.className = 'zen-pomodoro-config-row';
      const messageLabel = document.createElement('label');
      messageLabel.textContent = 'Motivational Message:';
      const messageInput = document.createElement('input');
      messageInput.type = 'text';
      messageInput.id = 'motivational-message';
      messageInput.className = 'zen-pomodoro-message-input';
      messageInput.value = config.motivationalMessage;
      messageRow.appendChild(messageLabel);
      messageRow.appendChild(messageInput);
      
      // ========================================
      // Workspace selection UI
      // ========================================
      const workspaceRow = document.createElement('div');
      workspaceRow.className = 'zen-pomodoro-config-row zen-pomodoro-workspace-row';
      
      const workspaceLabel = document.createElement('label');
      workspaceLabel.textContent = 'Blocked Workspaces:';
      
      const workspaceContainer = document.createElement('div');
      workspaceContainer.className = 'zen-pomodoro-workspace-list';
      
      const workspaces = window.zenPomodoroApp ? window.zenPomodoroApp.workspace.getAllWorkspaces() : [];
      
      if (workspaces.length === 0) {
        const noWorkspacesMsg = document.createElement('div');
        noWorkspacesMsg.textContent = 'No workspaces found';
        noWorkspacesMsg.style.fontStyle = 'italic';
        noWorkspacesMsg.style.opacity = '0.7';
        workspaceContainer.appendChild(noWorkspacesMsg);
      } else {
        workspaces.forEach(workspace => {
          const checkboxWrapper = document.createElement('div');
          checkboxWrapper.className = 'zen-pomodoro-checkbox-row';
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `workspace-${workspace.id}`;
          checkbox.value = workspace.id;
          checkbox.checked = config.blockedWorkspaces.includes(workspace.id);
          
          const label = document.createElement('label');
          label.setAttribute('for', `workspace-${workspace.id}`);
          label.textContent = workspace.name;
          
          checkboxWrapper.appendChild(checkbox);
          checkboxWrapper.appendChild(label);
          workspaceContainer.appendChild(checkboxWrapper);
        });
      }
      
      workspaceRow.appendChild(workspaceLabel);
      workspaceRow.appendChild(workspaceContainer);
      
      // ========================================
      // Lockout Methods Section
      // ========================================
      const lockoutSection = document.createElement('div');
      lockoutSection.className = 'zen-pomodoro-lockout-section';
      
      const lockoutTitle = document.createElement('div');
      lockoutTitle.className = 'zen-pomodoro-lockout-section-title';
      lockoutTitle.textContent = 'Settings Lock Options';
      
      // Idle lockout method
      const idleMethodRow = document.createElement('div');
      idleMethodRow.className = 'zen-pomodoro-config-row';
      const idleMethodLabel = document.createElement('label');
      idleMethodLabel.textContent = 'Lockout (Timer Idle):';
      const idleMethodSelect = document.createElement('select');
      idleMethodSelect.id = 'idle-lock-method';
      
      const idleHoldOption = document.createElement('option');
      idleHoldOption.value = LOCKOUT_METHODS.HOLD;
      idleHoldOption.textContent = 'Hold to Unlock';
      idleHoldOption.selected = config.settingsLockIdleMethod === LOCKOUT_METHODS.HOLD;
      
      const idleCodeOption = document.createElement('option');
      idleCodeOption.value = LOCKOUT_METHODS.CODE;
      idleCodeOption.textContent = 'Code Entry';
      idleCodeOption.selected = config.settingsLockIdleMethod === LOCKOUT_METHODS.CODE;
      
      idleMethodSelect.appendChild(idleHoldOption);
      idleMethodSelect.appendChild(idleCodeOption);
      idleMethodRow.appendChild(idleMethodLabel);
      idleMethodRow.appendChild(idleMethodSelect);
      
      // Active lockout method
      const activeMethodRow = document.createElement('div');
      activeMethodRow.className = 'zen-pomodoro-config-row';
      const activeMethodLabel = document.createElement('label');
      activeMethodLabel.textContent = 'Lockout (Timer Active):';
      const activeMethodSelect = document.createElement('select');
      activeMethodSelect.id = 'active-lock-method';
      
      const activeHoldOption = document.createElement('option');
      activeHoldOption.value = LOCKOUT_METHODS.HOLD;
      activeHoldOption.textContent = 'Hold to Unlock';
      activeHoldOption.selected = config.settingsLockActiveMethod === LOCKOUT_METHODS.HOLD;
      
      const activeCodeOption = document.createElement('option');
      activeCodeOption.value = LOCKOUT_METHODS.CODE;
      activeCodeOption.textContent = 'Code Entry';
      activeCodeOption.selected = config.settingsLockActiveMethod === LOCKOUT_METHODS.CODE;
      
      activeMethodSelect.appendChild(activeHoldOption);
      activeMethodSelect.appendChild(activeCodeOption);
      activeMethodRow.appendChild(activeMethodLabel);
      activeMethodRow.appendChild(activeMethodSelect);
      
      // Hold duration setting (used for both idle and active when hold method is selected)
      const lockHoldDurationRow = this.createInputRow('Button Hold Time (seconds):', 'hold-duration', 
        { value: config.settingsLockIdleDuration, min: 1, max: 300 });
      
      // Code length setting (used for both idle and active when code method is selected)
      const lockCodeLengthRow = this.createInputRow('Code Length (8-128):', 'code-length', 
        { value: config.settingsLockActiveCodeLength, min: 8, max: 128 });
      
      // Only show hold/code settings when at least one lockout method uses them
      const updateLockoutVisibility = () => {
        const usesHold =
          idleMethodSelect.value === LOCKOUT_METHODS.HOLD ||
          activeMethodSelect.value === LOCKOUT_METHODS.HOLD;
        const usesCode =
          idleMethodSelect.value === LOCKOUT_METHODS.CODE ||
          activeMethodSelect.value === LOCKOUT_METHODS.CODE;

        lockHoldDurationRow.style.display = usesHold ? '' : 'none';
        lockCodeLengthRow.style.display = usesCode ? '' : 'none';
      };

      idleMethodSelect.addEventListener('change', updateLockoutVisibility);
      activeMethodSelect.addEventListener('change', updateLockoutVisibility);
      updateLockoutVisibility();
      
      lockoutSection.appendChild(lockoutTitle);
      lockoutSection.appendChild(idleMethodRow);
      lockoutSection.appendChild(activeMethodRow);
      lockoutSection.appendChild(lockHoldDurationRow);
      lockoutSection.appendChild(lockCodeLengthRow);
      
      // ========================================
      // Assemble config section
      // ========================================
      configSection.appendChild(shortcutRow);
      configSection.appendChild(timerModeRow);
      configSection.appendChild(simpleDurationRow);
      configSection.appendChild(focusRow);
      configSection.appendChild(breakRow);
      configSection.appendChild(longBreakRow);
      configSection.appendChild(cyclesRow);
      configSection.appendChild(messageRow);
      configSection.appendChild(workspaceRow);
      configSection.appendChild(lockoutSection);
      
      // Buttons
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.id = 'zen-pomodoro-settings-cancel';
      cancelButton.textContent = 'Cancel';
      
      const saveButton = document.createElement('button');
      saveButton.className = 'zen-pomodoro-dialog-button';
      saveButton.id = 'zen-pomodoro-settings-save';
      saveButton.textContent = 'Save';
      
      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(saveButton);
      
      dialog.appendChild(backButton);
      dialog.appendChild(h2);
      dialog.appendChild(configSection);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      // Issue 8: Make dialog draggable
      setupDialogDrag(dialog);
      
      cancelButton.addEventListener('click', () => {
        dialog.remove();
      });
      
      saveButton.addEventListener('click', () => {
        this._saveKeyboardShortcut(shortcutInput, config);
        this._saveTimerSettings(dialog, config, timerModeSelect);
        this._saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect);
        this._saveBlockedWorkspaces(workspaceContainer, config);
        
        saveConfig(config);
        dialog.remove();
        
        this._updateOverlayMessage(config);
      });
    }

    /**
     * Save keyboard shortcut from settings dialog.
     * @param {HTMLElement} shortcutInput - The shortcut input element
     * @param {Object} config - Configuration object to update
     * @private
     */
    _saveKeyboardShortcut(shortcutInput, config) {
      const newShortcut = shortcutInput.getAttribute('data-shortcut');
      if (!newShortcut || newShortcut === config.keyboardShortcut) return;
      
      const shortcutParts = newShortcut.split('+');
      const hasNonModifierKey = shortcutParts.some(part => 
        !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(part)
      );
      
      if (!hasNonModifierKey) return;
      
      config.keyboardShortcut = newShortcut;
      if (window.zenPomodoroApp?.keyboardShortcut) {
        window.zenPomodoroApp.keyboardShortcut.setupKeyboardShortcut(newShortcut);
      }
      setPref('keyboardShortcut', newShortcut);
    }

    /**
     * Save timer settings from settings dialog.
     * @param {HTMLElement} dialog - The dialog element
     * @param {Object} config - Configuration object to update
     * @param {HTMLSelectElement} timerModeSelect - Timer mode select element
     * @private
     */
    _saveTimerSettings(dialog, config, timerModeSelect) {
      config.timerMode = timerModeSelect.value;
      
      const simpleDurationInput = dialog.querySelector('#simple-duration');
      if (simpleDurationInput) {
        config.simpleDuration = validateIntegerInput(
          simpleDurationInput.value, 1, 180, config.simpleDuration
        );
      }
      const focusDurationInput = dialog.querySelector('#focus-duration');
      if (focusDurationInput) {
        config.focusDuration = validateIntegerInput(
          focusDurationInput.value, 1, 120, config.focusDuration
        );
      }
      const breakDurationInput = dialog.querySelector('#break-duration');
      if (breakDurationInput) {
        config.breakDuration = validateIntegerInput(
          breakDurationInput.value, 1, 30, config.breakDuration
        );
      }
      const longBreakDurationInput = dialog.querySelector('#long-break-duration');
      if (longBreakDurationInput) {
        config.longBreakDuration = validateIntegerInput(
          longBreakDurationInput.value, 5, 60, config.longBreakDuration
        );
      }
      const cyclesInput = dialog.querySelector('#cycles');
      if (cyclesInput) {
        config.cycles = validateIntegerInput(
          cyclesInput.value, 1, 20, config.cycles
        );
      }
      const motivationalMessageInput = dialog.querySelector('#motivational-message');
      if (motivationalMessageInput) {
        config.motivationalMessage = sanitizeText(motivationalMessageInput.value);
      }
    }

    /**
     * Save lockout settings from settings dialog.
     * @param {HTMLElement} dialog - The dialog element
     * @param {Object} config - Configuration object to update
     * @param {HTMLSelectElement} idleMethodSelect - Idle method select element
     * @param {HTMLSelectElement} activeMethodSelect - Active method select element
     * @private
     */
    _saveLockoutSettings(dialog, config, idleMethodSelect, activeMethodSelect) {
      config.settingsLockIdleMethod = idleMethodSelect.value;
      config.settingsLockActiveMethod = activeMethodSelect.value;
      const holdDurationInput = dialog.querySelector('#hold-duration');
      if (holdDurationInput) {
        config.settingsLockIdleDuration = validateIntegerInput(
          holdDurationInput.value, 1, 300, config.settingsLockIdleDuration
        );
      }
      const codeLengthInput = dialog.querySelector('#code-length');
      if (codeLengthInput) {
        config.settingsLockActiveCodeLength = validateIntegerInput(
          codeLengthInput.value, 8, 128, config.settingsLockActiveCodeLength
        );
      }
    }

    /**
     * Save blocked workspaces from settings dialog.
     * @param {HTMLElement} workspaceContainer - Container with workspace checkboxes
     * @param {Object} config - Configuration object to update
     * @private
     */
    _saveBlockedWorkspaces(workspaceContainer, config) {
      const checkedWorkspaces = [];
      workspaceContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
        checkedWorkspaces.push(checkbox.value);
      });
      config.blockedWorkspaces = checkedWorkspaces;
    }

    /**
     * Update overlay message if it exists.
     * @param {Object} config - Configuration object with message
     * @private
     */
    _updateOverlayMessage(config) {
      if (!window.zenPomodoroApp?.overlay?.overlay) return;
      
      const messageEl = window.zenPomodoroApp.overlay.overlay.querySelector('#zen-pomodoro-message');
      if (messageEl) {
        messageEl.textContent = sanitizeText(config.motivationalMessage);
      }
    }

    /**
     * Helper to create input row.
     * @param {string} labelText - Label text
     * @param {string} inputId - Input element ID
     * @param {Object} options - Input options (value, min, max)
     * @returns {HTMLElement} The row element
     */
    createInputRow(labelText, inputId, options = {}) {
      const row = document.createElement('div');
      row.className = 'zen-pomodoro-config-row';
      
      const label = document.createElement('label');
      label.textContent = labelText;
      
      const input = document.createElement('input');
      input.type = 'number';
      input.id = inputId;
      if (options.value !== undefined) input.value = options.value;
      if (options.min !== undefined) input.min = options.min;
      if (options.max !== undefined) input.max = options.max;
      
      row.appendChild(label);
      row.appendChild(input);
      
      return row;
    }
  }

  // ============================================
  // Security Module
  // ============================================
  
  class SecurityManager {
    constructor() {
      this.lockScreen = null;
      this.lockIntervalId = null; // Store interval for cleanup
      this.lockTimerElement = null; // PERFORMANCE FIX: Initialize timer element reference for caching
      this.holdDuration = 3000;
      this.holdToUnlockIntervalId = null; // Store hold-to-unlock interval (renamed for consistency)
    }

    /**
     * Verify dev bypass password
     * Returns true if password matches
     */
    verifyDevPassword(password) {
      return password === DEV_MODE_PASSWORD;
    }

    /**
     * Check if settings should be locked
     */
    shouldLockSettings(timerActive) {
      const config = getConfig();
      
      if (timerActive) {
        return config.settingsLockActiveCodeLength > 0;
      } else {
        return config.settingsLockIdleDuration > 0;
      }
    }

    /**
     * Show dev bypass password prompt dialog
     * This is shown on the lock screen as a way to bypass during development
     */
    showDevBypassPrompt(onSuccess) {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-dev-bypass-dialog';
      dialog.className = 'zen-pomodoro-dialog active';
      
      const h2 = document.createElement('h2');
      h2.textContent = 'Dev Bypass';
      
      const p = document.createElement('p');
      p.textContent = 'Enter developer password to bypass lockout:';
      p.className = 'zen-pomodoro-dialog-message';
      
      const input = document.createElement('input');
      input.type = 'password';
      input.id = 'zen-pomodoro-dev-bypass-password';
      input.placeholder = 'Enter password';
      input.className = 'zen-pomodoro-devmode-input';
      input.style.width = '100%';
      input.style.marginBottom = '16px';
      
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      
      const submitButton = document.createElement('button');
      submitButton.className = 'zen-pomodoro-dialog-button';
      submitButton.textContent = 'Bypass';
      
      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(submitButton);
      
      dialog.appendChild(h2);
      dialog.appendChild(p);
      dialog.appendChild(input);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      // Issue 8: Make dialog draggable
      setupDialogDrag(dialog);
      
      // Focus input
      input.focus();
      
      cancelButton.addEventListener('click', () => {
        dialog.remove();
      });
      
      submitButton.addEventListener('click', () => {
        const password = input.value;
        if (this.verifyDevPassword(password)) {
          dialog.remove();
          console.log('[DEV BYPASS] Lock screen bypassed');
          onSuccess();
        } else {
          if (window.zenPomodoroApp) {
            window.zenPomodoroApp.showCustomAlert('Incorrect Password', 'Please try again.');
          }
          input.value = '';
          input.focus();
        }
      });
      
      // Allow Enter key to submit
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          submitButton.click();
        }
      });
    }

    /**
     * Show settings lock screen
     * UI/UX FIX: Replace alert() with custom dialog
     * MEMORY LEAK FIX: Store and clear interval properly
     * NEW: Added cancel button, hold-to-unlock, and dev bypass button
     * NEW: Configurable lockout methods (hold vs code) for idle and active states
     */
    showLockScreen(timerActive, onUnlock) {
      const config = getConfig();
      const method = this._determineLockoutMethod(timerActive, config);
      
      this._initializeLockScreen();
      const lockContent = this._createLockContent();
      
      if (method === LOCKOUT_METHODS.CODE) {
        this._setupCodeEntryMode(lockContent, config, timerActive, onUnlock);
      } else {
        this._setupHoldToUnlockMode(lockContent, config, timerActive, onUnlock);
      }
      
      this.lockScreen.appendChild(lockContent);
      document.documentElement.appendChild(this.lockScreen);
    }

    /**
     * Determine which lockout method to use based on timer state and config.
     * @param {boolean} timerActive - Whether timer is currently active
     * @param {Object} config - Configuration object
     * @returns {string} The lockout method to use
     * @private
     */
    _determineLockoutMethod(timerActive, config) {
      const requestedMethod = timerActive ? config.settingsLockActiveMethod : config.settingsLockIdleMethod;
      
      if (requestedMethod === LOCKOUT_METHODS.CODE || requestedMethod === LOCKOUT_METHODS.HOLD) {
        return requestedMethod;
      }
      
      // Fall back to defaults: code for active, hold for idle
      const defaultMethod = timerActive ? LOCKOUT_METHODS.CODE : LOCKOUT_METHODS.HOLD;
      console.warn(`Zen Pomodoro: Invalid lockout method "${requestedMethod}", using default "${defaultMethod}".`);
      return defaultMethod;
    }

    /**
     * Initialize the lock screen container element.
     * @private
     */
    _initializeLockScreen() {
      this.lockScreen = document.createElement('div');
      this.lockScreen.id = 'zen-pomodoro-lock-screen';
      this.lockScreen.className = 'active';
    }

    /**
     * Create the lock content container element.
     * @returns {HTMLElement} The lock content element
     * @private
     */
    _createLockContent() {
      const lockContent = document.createElement('div');
      lockContent.id = 'zen-pomodoro-lock-content';
      return lockContent;
    }

    /**
     * Create standard lock screen button row with cancel and dev bypass buttons.
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @returns {{buttonDiv: HTMLElement, cancelButton: HTMLElement, devBypassButton: HTMLElement}}
     * @private
     */
    _createLockButtonRow(onUnlock) {
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.id = 'zen-pomodoro-lock-cancel';
      cancelButton.textContent = 'Cancel';
      
      const devBypassButton = document.createElement('button');
      devBypassButton.className = 'zen-pomodoro-dialog-button secondary small';
      devBypassButton.id = 'zen-pomodoro-dev-bypass';
      devBypassButton.textContent = 'Dev Bypass';
      
      // Attach event handlers
      cancelButton.addEventListener('click', () => this.cleanupLockScreen());
      devBypassButton.addEventListener('click', () => {
        this.showDevBypassPrompt(() => {
          this.cleanupLockScreen();
          onUnlock();
        });
      });
      
      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(devBypassButton);
      
      return { buttonDiv, cancelButton, devBypassButton };
    }

    /**
     * Setup code entry lockout mode UI and handlers.
     * @param {HTMLElement} lockContent - Container for lock content
     * @param {Object} config - Configuration object
     * @param {boolean} timerActive - Whether timer is active
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupCodeEntryMode(lockContent, config, timerActive, onUnlock) {
      const code = generateRandomCode(
        config.settingsLockActiveCodeLength,
        config.settingsLockActiveCharacterSet
      );
      
      const h2 = document.createElement('h2');
      h2.textContent = 'Settings Locked';
      
      const p = document.createElement('p');
      p.textContent = timerActive 
        ? 'Timer is active. Enter the code below to unlock settings:'
        : 'Enter the code below to unlock settings:';
      
      const codeDiv = document.createElement('div');
      codeDiv.className = 'zen-pomodoro-lock-code-display';
      codeDiv.textContent = code;
      
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'zen-pomodoro-lock-code';
      input.placeholder = 'Enter code here';
      
      // Add Enter key support for code entry
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (input.value === code) {
            this.cleanupLockScreen();
            onUnlock();
          } else if (window.zenPomodoroApp) {
            window.zenPomodoroApp.showCustomAlert('Incorrect Code', 'Please try again.');
          }
        }
      });
      
      const { buttonDiv } = this._createLockButtonRow(onUnlock);
      
      const unlockButton = document.createElement('button');
      unlockButton.className = 'zen-pomodoro-dialog-button';
      unlockButton.id = 'zen-pomodoro-lock-submit';
      unlockButton.textContent = 'Unlock';
      buttonDiv.appendChild(unlockButton);
      
      unlockButton.addEventListener('click', () => {
        if (input.value === code) {
          this.cleanupLockScreen();
          onUnlock();
        } else if (window.zenPomodoroApp) {
          window.zenPomodoroApp.showCustomAlert('Incorrect Code', 'Please try again.');
        }
      });
      
      lockContent.appendChild(h2);
      lockContent.appendChild(p);
      lockContent.appendChild(codeDiv);
      lockContent.appendChild(input);
      lockContent.appendChild(buttonDiv);
      
      // Focus the input field for better UX
      setTimeout(() => input?.focus(), 0);
    }

    /**
     * Setup hold-to-unlock lockout mode UI and handlers.
     * @param {HTMLElement} lockContent - Container for lock content
     * @param {Object} config - Configuration object
     * @param {boolean} timerActive - Whether timer is active
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupHoldToUnlockMode(lockContent, config, timerActive, onUnlock) {
      const waitTime = config.settingsLockIdleDuration;
      
      const h2 = document.createElement('h2');
      h2.textContent = 'Settings Locked';
      
      const p = document.createElement('p');
      p.textContent = timerActive 
        ? 'Timer is active. Hold the button below to unlock settings:'
        : 'Hold the button below to unlock settings:';
      
      const timerDiv = document.createElement('div');
      timerDiv.id = 'zen-pomodoro-lock-timer';
      timerDiv.textContent = waitTime.toString();
      
      const pSub = document.createElement('p');
      pSub.className = 'zen-pomodoro-lock-subtext';
      pSub.textContent = 'seconds remaining - hold button to count down';
      
      const { holdButton, holdProgress } = this._createHoldButton();
      const { buttonDiv } = this._createLockButtonRow(onUnlock);
      buttonDiv.appendChild(holdButton);
      
      lockContent.appendChild(h2);
      lockContent.appendChild(p);
      lockContent.appendChild(timerDiv);
      lockContent.appendChild(pSub);
      lockContent.appendChild(buttonDiv);
      
      // Cache timer element reference for updates
      this.lockTimerElement = timerDiv;
      
      // Setup hold logic
      this._setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock);
    }

    /**
     * Create the hold-to-unlock button with progress bar.
     * @returns {{holdButton: HTMLElement, holdProgress: HTMLElement}}
     * @private
     */
    _createHoldButton() {
      const holdButton = document.createElement('button');
      holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
      holdButton.id = 'zen-pomodoro-hold-to-unlock';
      holdButton.textContent = 'Hold to Unlock';
      
      const holdProgress = document.createElement('div');
      holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
      holdProgress.id = 'zen-pomodoro-hold-unlock-progress';
      holdButton.appendChild(holdProgress);
      
      return { holdButton, holdProgress };
    }

    /**
     * Setup hold-to-unlock event handlers.
     * @param {HTMLElement} holdButton - The hold button element
     * @param {HTMLElement} holdProgress - The progress bar element
     * @param {number} waitTime - Total wait time in seconds
     * @param {Function} onUnlock - Callback when unlock succeeds
     * @private
     */
    _setupHoldHandlers(holdButton, holdProgress, waitTime, onUnlock) {
      let currentWaitTime = waitTime;
      
      const startHold = (e) => {
        if (e.type === 'touchstart') e.preventDefault();
        
        this._clearHoldInterval();
        
        this.holdToUnlockIntervalId = setInterval(() => {
          currentWaitTime--;
          if (this.lockTimerElement) {
            this.lockTimerElement.textContent = currentWaitTime.toString();
          }
          
          const percent = ((waitTime - currentWaitTime) / waitTime) * 100;
          if (holdProgress?.style) {
            holdProgress.style.width = `${percent}%`;
          }
          
          if (currentWaitTime <= 0) {
            this._clearHoldInterval();
            this.cleanupLockScreen();
            onUnlock();
          }
        }, 1000);
      };
      
      const stopHold = () => {
        this._clearHoldInterval();
        currentWaitTime = waitTime;
        if (this.lockTimerElement) {
          this.lockTimerElement.textContent = waitTime.toString();
        }
        if (holdProgress) {
          holdProgress.style.width = '0%';
        }
      };
      
      // Mouse events
      holdButton.addEventListener('mousedown', startHold);
      holdButton.addEventListener('mouseup', stopHold);
      holdButton.addEventListener('mouseleave', stopHold);
      
      // Touch events (passive: false to allow preventDefault)
      holdButton.addEventListener('touchstart', startHold, { passive: false });
      holdButton.addEventListener('touchend', stopHold);
      holdButton.addEventListener('touchcancel', stopHold);
      
      // Keyboard accessibility
      holdButton.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          startHold(e);
        }
      });
      holdButton.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') stopHold();
      });
    }

    /**
     * Clear the hold-to-unlock interval if active.
     * @private
     */
    _clearHoldInterval() {
      if (this.holdToUnlockIntervalId) {
        clearInterval(this.holdToUnlockIntervalId);
        this.holdToUnlockIntervalId = null;
      }
    }

    /**
     * Cleanup lock screen
     * MEMORY LEAK FIX: Clear interval and cached element reference on cleanup
     */
    cleanupLockScreen() {
      if (this.lockIntervalId) {
        clearInterval(this.lockIntervalId);
        this.lockIntervalId = null;
      }
      if (this.holdToUnlockIntervalId) {
        clearInterval(this.holdToUnlockIntervalId);
        this.holdToUnlockIntervalId = null;
      }
      this.lockTimerElement = null;
      if (this.lockScreen) {
        this.lockScreen.remove();
        this.lockScreen = null;
      }
    }

    /**
     * Implement hold-to-start button
     * MISSING FEATURE: Hold-to-start implementation
     * MEMORY LEAK FIX: Added cleanup for interval on mouseup/mouseleave
     */
    setupHoldToStart(buttonElement, onComplete) {
      const config = getConfig();
      const duration = config.holdToStartDuration;
      
      if (duration <= 0) {
        // If hold-to-start is disabled, just call onComplete
        buttonElement.addEventListener('click', onComplete);
        return;
      }
      
      let progress = 0;
      let interval = null;
      
      const progressBar = document.createElement('div');
      progressBar.id = 'zen-pomodoro-hold-progress';
      buttonElement.classList.add('zen-pomodoro-hold-button-wrapper');
      buttonElement.appendChild(progressBar);
      
      const startHold = () => {
        progress = 0;
        progressBar.style.width = '0%';
        interval = setInterval(() => {
          progress += 100;
          const percent = (progress / duration) * 100;
          progressBar.style.width = `${percent}%`;
          
          if (progress >= duration) {
            // MEMORY LEAK FIX: Clear interval on completion
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            progressBar.style.width = '0%';
            onComplete();
          }
        }, 100);
      };
      
      const stopHold = () => {
        // MEMORY LEAK FIX: Always clear interval when stopping
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        progress = 0;
        progressBar.style.width = '0%';
      };
      
      buttonElement.addEventListener('mousedown', startHold);
      buttonElement.addEventListener('mouseup', stopHold);
      buttonElement.addEventListener('mouseleave', stopHold);
    }
  }

  // ============================================
  // Main Application Class
  // ============================================
  
  class ZenPomodoroApp {
    constructor() {
      this.timer = new PomodoroTimer();
      this.workspace = new WorkspaceDetector();
      this.overlay = new OverlayManager();
      this.keyboardShortcut = new KeyboardShortcutHandler();
      this.security = new SecurityManager();
      this.notificationPermissionRequested = false;
      this.initialized = false; // DUPLICATE FIX: Track initialization to prevent duplicate setup
      
      this.init();
    }

    /**
     * Initialize the application
     * DUPLICATE FIX: Prevent duplicate initialization with guard
     */
    init() {
      if (this.initialized) {
        console.warn('Zen Pomodoro already initialized, skipping duplicate init');
        return;
      }
      
      console.log('Zen Pomodoro Focus Blocker initializing...');
      
      // Wait for browser to be fully loaded
      // DUPLICATE FIX: Use once option to prevent duplicate listeners
      if (document.readyState === 'complete') {
        this.onReady();
      } else {
        window.addEventListener('load', () => this.onReady(), { once: true });
      }
    }

    /**
     * Called when browser is ready
     */
    onReady() {
      // Double-check guard since init() already checks, but safer for edge cases
      if (this.initialized) {
        return;
      }
      
      this.initialized = true;
      console.log('Zen Pomodoro Focus Blocker ready');
      
      // Initialize modules
      this.keyboardShortcut.init();
      this.workspace.startMonitoring();
      
      // Setup timer callbacks
      this.timer.onTick = (time, phase, cycle, total) => {
        this.onTimerTick(time, phase, cycle, total);
      };
      
      this.timer.onPhaseChange = (phase, cycle) => {
        this.onPhaseChange(phase, cycle);
      };
      
      this.timer.onComplete = () => {
        this.onTimerComplete();
      };
      
      // Setup workspace change callback
      this.workspace.onWorkspaceChange = (workspaceId, isBlocked) => {
        this.onWorkspaceChange(workspaceId, isBlocked);
      };
      
      // Try to restore timer state
      const restored = this.timer.loadState();
      if (restored) {
        console.log('Restored timer state from previous session');
        this.updateOverlayVisibility();
      }
      
      // MISSING FEATURE: Request notification permission
      this.requestNotificationPermission();
      
      // Expose app globally for debugging and keyboard shortcut
      window.zenPomodoroApp = this;
    }

    /**
     * Request notification permission
     * MISSING FEATURE: Notification permission request
     */
    requestNotificationPermission() {
      const config = getConfig();
      if (config.enableNotifications && !this.notificationPermissionRequested) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
            this.notificationPermissionRequested = true;
          }).catch(err => {
            console.error('Failed to request notification permission:', err);
          });
        } else {
          this.notificationPermissionRequested = true;
        }
      }
    }

    /**
     * Start the timer
     */
    /**
     * Start the timer
     * @param {string} mode - Timer mode ('pomodoro' or 'simple')
     * @param {number} cycles - Number of pomodoro cycles
     * @param {Object} sessionOverrides - Optional session-only duration overrides
     */
    startTimer(mode = 'pomodoro', cycles = 4, sessionOverrides = {}) {
      console.log(`Starting timer: mode=${mode}, cycles=${cycles}`);
      
      this.timer.start(mode, cycles, sessionOverrides);
      this.overlay.showIndicator();
      this.updateOverlayVisibility();
    }

    /**
     * Stop the timer
     */
    stopTimer() {
      console.log('Stopping timer');
      
      this.timer.stop();
      this.overlay.hide();
      this.overlay.hideIndicator();
    }

    /**
     * Handle timer tick
     */
    onTimerTick(time, phase, cycle, total) {
      this.overlay.updateDisplay(time, phase, cycle, total);
      this.updateOverlayVisibility();
    }

    /**
     * Handle phase change
     */
    onPhaseChange(phase, cycle) {
      console.log(`Phase changed: ${phase}, cycle ${cycle}`);
      
      this.overlay.updatePhaseColor(phase);
      this.updateOverlayVisibility();
      
      // Show notification if enabled
      const config = getConfig();
      if (config.enableNotifications) {
        this.showNotification(phase);
      }
    }

    /**
     * Handle timer completion
     */
    onTimerComplete() {
      console.log('Timer completed');
      
      this.overlay.hide();
      this.overlay.hideIndicator();
      
      // Show completion notification
      this.showNotification('complete');
    }

    /**
     * Handle workspace change
     */
    onWorkspaceChange(workspaceId, isBlocked) {
      console.log(`Workspace changed: ${workspaceId}, blocked=${isBlocked}`);
      
      this.updateOverlayVisibility();
    }

    /**
     * Update overlay visibility based on current state
     */
    updateOverlayVisibility() {
      if (!this.timer.isActive) {
        this.overlay.hide();
        return;
      }
      
      const isBlocked = this.workspace.isCurrentWorkspaceBlocked();
      
      if (isBlocked) {
        const status = this.timer.getStatus();
        this.overlay.show(status.currentPhase);
        this.overlay.updateDisplay(
          status.remainingTime,
          status.currentPhase,
          status.currentCycle,
          status.totalCycles
        );
      } else {
        this.overlay.hide();
      }
    }

    /**
     * Show notification
     * SECURITY FIX: Simplified nested try-catch with conditional icon property
     */
    showNotification(phase) {
      const messages = {
        focus: 'Time to focus! 💪',
        break: 'Take a break! ☕',
        'long-break': 'Long break time! 🌟',
        complete: 'Pomodoro session complete! 🎉'
      };
      
      const message = messages[phase] || 'Pomodoro timer';
      
      // Browser notification with permission check
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          // Use chrome:// URI for icon (internal browser resource)
          // Falls back gracefully if path doesn't exist in some Zen Browser versions
          new Notification('Zen Pomodoro Timer', {
            body: message,
            icon: 'chrome://branding/content/about-logo.png'
          });
        } else {
          console.log('Notification:', message);
        }
      } catch (e) {
        console.log('Notification:', message);
      }
    }

    /**
     * Show custom alert dialog
     * UI/UX FIX: Replace alert() with custom dialog
     */
    showCustomAlert(title, message) {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-alert-dialog';
      dialog.className = 'zen-pomodoro-dialog active';
      
      const h2 = document.createElement('h2');
      h2.textContent = title;
      
      const p = document.createElement('p');
      p.textContent = message;
      p.className = 'zen-pomodoro-dialog-message';
      
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const okButton = document.createElement('button');
      okButton.className = 'zen-pomodoro-dialog-button';
      okButton.textContent = 'OK';
      
      buttonDiv.appendChild(okButton);
      
      dialog.appendChild(h2);
      dialog.appendChild(p);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      // Issue 8: Make dialog draggable
      setupDialogDrag(dialog);
      
      okButton.addEventListener('click', () => {
        dialog.remove();
      });
    }

    /**
     * Show custom confirm dialog
     * UI/UX FIX: Replace confirm() with custom dialog
     */
    showCustomConfirm(title, message, onConfirm) {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-confirm-dialog';
      dialog.className = 'zen-pomodoro-dialog active';
      
      const h2 = document.createElement('h2');
      h2.textContent = title;
      
      const p = document.createElement('p');
      p.textContent = message;
      p.className = 'zen-pomodoro-dialog-message';
      
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.textContent = 'Cancel';
      
      const confirmButton = document.createElement('button');
      confirmButton.className = 'zen-pomodoro-dialog-button';
      confirmButton.textContent = 'Confirm';
      
      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(confirmButton);
      
      dialog.appendChild(h2);
      dialog.appendChild(p);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      // Issue 8: Make dialog draggable
      setupDialogDrag(dialog);
      
      cancelButton.addEventListener('click', () => {
        dialog.remove();
      });
      
      confirmButton.addEventListener('click', () => {
        dialog.remove();
        onConfirm();
      });
    }
  }

  // ============================================
  // Initialize Application
  // ============================================
  
  // Start the app
  new ZenPomodoroApp();

})();
