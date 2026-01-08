/**
 * Zen Pomodoro Focus Blocker Mod
 * Version: 1.0.4
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
  
  // Constants for keyboard shortcut handling
  const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];
  
  // Constants for lockout method types
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
    settingsLockIdleDuration: 20,
    settingsLockIdleMethod: LOCKOUT_METHODS.HOLD, // 'hold' | 'code' - what method to use when timer is idle
    settingsLockActiveMethod: LOCKOUT_METHODS.CODE, // 'hold' | 'code' - what method to use when timer is active
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
    if (isNaN(parsed) || parsed < min || parsed > max) {
      return defaultValue;
    }
    return parsed;
  }

  /**
   * Sanitize text content to prevent XSS attacks
   * Removes HTML-like characters (<, >) that could be used for injection
   * This is a defense-in-depth measure since we use textContent instead of innerHTML
   * @param {string} text - The text to sanitize
   * @returns {string} Sanitized text with HTML characters removed
   */
  function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[<>]/g, '');
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
     */
    start(mode = 'pomodoro', cycles = 4) {
      this.mode = mode;
      this.totalCycles = cycles;
      this.currentCycle = 1;
      this.currentPhase = 'focus';
      this.isActive = true;
      this.isPaused = false;
      this.tickCounter = 0;
      
      // Store config with timer state for proper restoration
      this.savedConfig = { ...this.config };

      if (mode === 'simple') {
        this.remainingTime = this.config.simpleDuration * 60;
      } else {
        this.remainingTime = this.config.focusDuration * 60;
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
      if (this.currentPhase === 'focus') {
        // Focus period complete, determine break type
        // Long breaks occur after completing N focus cycles (where N = longBreakInterval)
        // Example: if longBreakInterval=4, long breaks occur after cycles 4, 8, 12, etc.
        // LOGIC FIX: Check if this is the last cycle
        const isLastCycle = (this.currentCycle >= this.totalCycles);
        
        if (isLastCycle) {
          // Last focus cycle complete - end session without break
          this.completeTimer();
          return;
        }
        
        // Not the last cycle, so give appropriate break
        const isLongBreakCycle = (this.currentCycle % this.config.longBreakInterval === 0);
        
        if (isLongBreakCycle) {
          // Long break after completing N cycles
          this.currentPhase = 'long-break';
          this.remainingTime = this.config.longBreakDuration * 60;
        } else {
          // Regular short break
          this.currentPhase = 'break';
          this.remainingTime = this.config.breakDuration * 60;
        }
      } else {
        // Break complete, move to next cycle
        this.currentCycle++;
        
        if (this.currentCycle > this.totalCycles) {
          // All cycles complete
          this.completeTimer();
          return;
        }
        
        // Start next focus period
        this.currentPhase = 'focus';
        this.remainingTime = this.config.focusDuration * 60;
      }

      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.currentCycle);
      }

      this.saveState();
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
        // Method 1: Try to use ZenWorkspaces API if available (most reliable)
        // Try different possible API variants used by Zen Browser
        // eslint-disable-next-line no-undef
        if (typeof ZenWorkspaces !== 'undefined') {
          let workspaces = null;
          
          // Try different method names that Zen Browser might use
          // eslint-disable-next-line no-undef
          if (typeof ZenWorkspaces.getWorkspaces === 'function') {
            // eslint-disable-next-line no-undef
            workspaces = ZenWorkspaces.getWorkspaces();
          // eslint-disable-next-line no-undef
          } else if (typeof ZenWorkspaces._workspaces !== 'undefined') {
            // eslint-disable-next-line no-undef
            workspaces = ZenWorkspaces._workspaces;
          // eslint-disable-next-line no-undef
          } else if (typeof ZenWorkspaces.workspaces !== 'undefined') {
            // eslint-disable-next-line no-undef
            workspaces = ZenWorkspaces.workspaces;
          }
          
          if (workspaces && Array.isArray(workspaces) && workspaces.length > 0) {
            console.log('Zen Pomodoro: Got workspaces from ZenWorkspaces API');
            return workspaces.map(ws => ({
              id: ws.uuid || ws.id,
              name: ws.name || ws.title || 'Unnamed Workspace'
            }));
          }
        }
        
        // Method 1b: Try legacy gZenWorkspaces API
        // eslint-disable-next-line no-undef
        if (typeof gZenWorkspaces !== 'undefined') {
          let workspaces = null;
          
          // eslint-disable-next-line no-undef
          if (typeof gZenWorkspaces.getWorkspaces === 'function') {
            // eslint-disable-next-line no-undef
            workspaces = gZenWorkspaces.getWorkspaces();
          // eslint-disable-next-line no-undef
          } else if (gZenWorkspaces._workspaces) {
            // eslint-disable-next-line no-undef
            workspaces = gZenWorkspaces._workspaces;
          }
          
          if (workspaces && Array.isArray(workspaces) && workspaces.length > 0) {
            console.log('Zen Pomodoro: Got workspaces from gZenWorkspaces API');
            return workspaces.map(ws => ({
              id: ws.uuid || ws.id,
              name: ws.name || ws.title || 'Unnamed Workspace'
            }));
          }
        }
        
        // Method 2: Query DOM buttons with comprehensive attribute checks
        const workspaceButtons = document.querySelectorAll('toolbarbutton[zen-workspace-id]');
        if (workspaceButtons.length > 0) {
          console.log(`Zen Pomodoro: Got ${workspaceButtons.length} workspaces from DOM`);
          return Array.from(workspaceButtons).map(btn => {
            const id = btn.getAttribute('zen-workspace-id');
            
            // Try multiple attributes to find the workspace name
            // Priority order based on what's most likely to have the actual name
            let name = null;
            
            // Check for data attributes first (often most reliable)
            name = btn.getAttribute('data-workspace-name') ||
                   btn.getAttribute('data-name');
            
            // Then check standard XUL/HTML attributes
            if (!name || name === 'undefined') {
              name = btn.getAttribute('label');
            }
            if (!name || name === 'undefined') {
              name = btn.getAttribute('tooltiptext');
            }
            if (!name || name === 'undefined') {
              name = btn.getAttribute('aria-label');
            }
            if (!name || name === 'undefined') {
              name = btn.getAttribute('title');
            }
            
            // Try to get text content from child elements
            if (!name || name === 'undefined') {
              const labelEl = btn.querySelector('.tab-label, .tab-text, .workspace-label, label');
              if (labelEl) {
                name = labelEl.textContent?.trim();
              }
            }
            
            // Final fallback to direct text content
            if (!name || name === 'undefined') {
              name = btn.textContent?.trim();
            }
            
            // Clean up the name
            if (!name || name === 'undefined' || name === '') {
              name = `Workspace ${id?.substring(0, 8) || 'Unknown'}`;
            }
            
            return { id, name };
          });
        }
        
        // Method 3: Try to find workspace panel/container elements
        const workspaceContainer = document.querySelector('#zen-workspaces-button-container, #zen-workspace-button-container, [id*="workspace"]');
        if (workspaceContainer) {
          const items = workspaceContainer.querySelectorAll('[zen-workspace-id], [data-workspace-id]');
          if (items.length > 0) {
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
        
        console.log('Zen Pomodoro: No workspaces found');
        return [];
      } catch (e) {
        console.error('Failed to get workspaces:', e);
        return [];
      }
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
      // PERFORMANCE FIX: Removed ResizeObserver - CSS handles responsive sizing
      // The overlay uses position: fixed with width: 100% and height: 100% to fill viewport
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

      document.documentElement.appendChild(this.overlay);
      document.documentElement.appendChild(this.indicator);

      // PERFORMANCE FIX: Removed ResizeObserver - CSS handles sizing automatically
      // The overlay uses fixed positioning with width: 100% and height: 100%
      
      // Setup button handlers after elements are created
      // RACE CONDITION FIX: Set up handlers immediately after creation
      this.setupOverlayHandlers();
    }

    /**
     * Setup overlay button handlers
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
          if (window.zenPomodoroApp) {
            // UI/UX FIX: Use custom dialog instead of confirm()
            window.zenPomodoroApp.showCustomConfirm(
              'Stop Timer',
              'Are you sure you want to stop the timer?',
              () => {
                window.zenPomodoroApp.stopTimer();
              }
            );
          }
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
     */
    show(phase = 'focus') {
      if (!this.overlay) this.createOverlay();
      
      this.overlay.classList.add('active');
      this.overlay.setAttribute('data-phase', phase);
      this.isVisible = true;
      
      // Update color based on phase
      this.updatePhaseColor(phase);
    }

    /**
     * Hide overlay
     */
    hide() {
      if (this.overlay) {
        this.overlay.classList.remove('active');
        this.isVisible = false;
      }
    }

    /**
     * Update timer display
     * SECURITY FIX: Use textContent instead of innerHTML
     */
    updateDisplay(remainingTime, phase, currentCycle, totalCycles) {
      if (!this.overlay) return;

      const timerDisplay = this.overlay.querySelector('#zen-pomodoro-timer-display');
      const phaseLabel = this.overlay.querySelector('#zen-pomodoro-phase-label');
      const cycleProgress = this.overlay.querySelector('#zen-pomodoro-cycle-progress');
      const indicatorText = this.indicator?.querySelector('#zen-pomodoro-indicator-text');

      const timeStr = formatTime(remainingTime);
      
      if (timerDisplay) timerDisplay.textContent = timeStr;
      
      if (phaseLabel) {
        phaseLabel.textContent = phase === 'focus' ? 'Focus Period' : 
                                  phase === 'break' ? 'Break Time' : 
                                  'Long Break';
      }
      
      if (cycleProgress && phase === 'focus') {
        cycleProgress.textContent = `Cycle ${currentCycle} of ${totalCycles}`;
        cycleProgress.style.display = 'block';
      } else if (cycleProgress) {
        cycleProgress.style.display = 'none';
      }

      if (indicatorText) {
        const phaseShort = phase === 'focus' ? 'Focus' : 'Break';
        indicatorText.textContent = `${phaseShort}: ${timeStr}`;
      }

      // Update indicator
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
     * MEMORY LEAK FIX: Removed ResizeObserver cleanup (no longer using it)
     */
    destroy() {
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
  
  class KeyboardShortcutHandler {
    constructor() {
      this.keydownHandler = null;
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
     * Parse keyboard shortcut string into components
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
        if (part === 'ctrl' || part === 'control') {
          result.ctrlKey = true;
        } else if (part === 'alt') {
          result.altKey = true;
        } else if (part === 'shift') {
          result.shiftKey = true;
        } else if (part === 'meta' || part === 'cmd' || part === 'command') {
          result.metaKey = true;
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
        // Check if all modifier keys match
        if (event.ctrlKey === parsed.ctrlKey &&
            event.altKey === parsed.altKey &&
            event.shiftKey === parsed.shiftKey &&
            event.metaKey === parsed.metaKey &&
            event.key.toUpperCase() === parsed.key) {
          
          event.preventDefault();
          event.stopPropagation();
          this.showPomodoroMenu();
        }
      };
      
      document.addEventListener('keydown', this.keydownHandler, true);
    }

    /**
     * Show the main Pomodoro menu dialog
     */
    showPomodoroMenu() {
      // Remove existing menu if present
      if (this.menuDialog) {
        this.menuDialog.remove();
        this.menuDialog = null;
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
          window.zenPomodoroApp.showCustomConfirm(
            'Stop Timer',
            'Are you sure you want to stop the timer?',
            () => {
              window.zenPomodoroApp.stopTimer();
            }
          );
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
      
      const h2 = document.createElement('h2');
      h2.textContent = 'Start Timer';
      
      const configSection = document.createElement('div');
      configSection.className = 'zen-pomodoro-config-section';
      
      // Mode selection
      const modeRow = document.createElement('div');
      modeRow.className = 'zen-pomodoro-config-row';
      const modeLabel = document.createElement('label');
      modeLabel.textContent = 'Timer Mode:';
      const modeSelect = document.createElement('select');
      modeSelect.id = 'zen-pomodoro-mode-select';
      
      const simpleOption = document.createElement('option');
      simpleOption.value = 'simple';
      simpleOption.textContent = 'Simple Timer';
      simpleOption.selected = config.timerMode === 'simple';
      
      const pomodoroOption = document.createElement('option');
      pomodoroOption.value = 'pomodoro';
      pomodoroOption.selected = config.timerMode === 'pomodoro';
      pomodoroOption.textContent = 'Pomodoro Cycles';
      
      modeSelect.appendChild(simpleOption);
      modeSelect.appendChild(pomodoroOption);
      modeRow.appendChild(modeLabel);
      modeRow.appendChild(modeSelect);
      
      // Cycles input
      const cyclesRow = document.createElement('div');
      cyclesRow.className = 'zen-pomodoro-config-row';
      cyclesRow.id = 'zen-pomodoro-cycles-row';
      cyclesRow.style.display = config.timerMode === 'pomodoro' ? 'flex' : 'none';
      const cyclesLabel = document.createElement('label');
      cyclesLabel.textContent = 'Number of Cycles:';
      const cyclesInput = document.createElement('input');
      cyclesInput.type = 'number';
      cyclesInput.id = 'zen-pomodoro-cycles-input';
      cyclesInput.value = config.cycles;
      cyclesInput.min = '1';
      cyclesInput.max = '10';
      cyclesRow.appendChild(cyclesLabel);
      cyclesRow.appendChild(cyclesInput);
      
      configSection.appendChild(modeRow);
      configSection.appendChild(cyclesRow);
      
      // Buttons
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'zen-pomodoro-dialog-buttons';
      
      const cancelButton = document.createElement('button');
      cancelButton.className = 'zen-pomodoro-dialog-button secondary';
      cancelButton.id = 'zen-pomodoro-cancel-button';
      cancelButton.textContent = 'Cancel';
      
      // Hold-to-start button integration
      const startButton = document.createElement('button');
      startButton.className = 'zen-pomodoro-dialog-button';
      startButton.id = 'zen-pomodoro-start-button';
      
      // Check if hold-to-start is enabled
      if (config.holdToStartDuration > 0) {
        startButton.id = 'zen-pomodoro-hold-to-start';
        startButton.textContent = `Hold to Start (${config.holdToStartDuration / 1000}s)`;
      } else {
        startButton.textContent = 'Start Timer';
      }
      
      buttonDiv.appendChild(cancelButton);
      buttonDiv.appendChild(startButton);
      
      dialog.appendChild(h2);
      dialog.appendChild(configSection);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      modeSelect.addEventListener('change', () => {
        cyclesRow.style.display = modeSelect.value === 'pomodoro' ? 'flex' : 'none';
      });
      
      cancelButton.addEventListener('click', () => {
        dialog.remove();
      });
      
      // Setup hold-to-start if enabled
      if (config.holdToStartDuration > 0 && window.zenPomodoroApp && window.zenPomodoroApp.security) {
        window.zenPomodoroApp.security.setupHoldToStart(startButton, () => {
          const mode = modeSelect.value;
          const cycles = validateIntegerInput(cyclesInput.value, 1, 20, config.cycles);
          
          dialog.remove();
          
          if (window.zenPomodoroApp) {
            window.zenPomodoroApp.startTimer(mode, cycles);
          }
        });
      } else {
        startButton.addEventListener('click', () => {
          const mode = modeSelect.value;
          const cycles = validateIntegerInput(cyclesInput.value, 1, 20, config.cycles);
          
          dialog.remove();
          
          if (window.zenPomodoroApp) {
            window.zenPomodoroApp.startTimer(mode, cycles);
          }
        });
      }
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
      const simpleDurationRow = this.createInputRow('Simple Timer Duration (min):', 'simple-duration', config.simpleDuration, 1, 480);
      simpleDurationRow.id = 'simple-duration-row';
      if (config.timerMode !== 'simple') {
        simpleDurationRow.classList.add('hidden');
      }
      
      // ========================================
      // Pomodoro-specific options
      // ========================================
      const focusRow = this.createInputRow('Focus Duration (min):', 'focus-duration', config.focusDuration, 1, 120);
      focusRow.id = 'focus-duration-row';
      if (config.timerMode === 'simple') {
        focusRow.classList.add('hidden');
      }
      
      const breakRow = this.createInputRow('Break Duration (min):', 'break-duration', config.breakDuration, 1, 30);
      breakRow.id = 'break-duration-row';
      if (config.timerMode === 'simple') {
        breakRow.classList.add('hidden');
      }
      
      const longBreakRow = this.createInputRow('Long Break (min):', 'long-break-duration', config.longBreakDuration, 5, 60);
      longBreakRow.id = 'long-break-duration-row';
      if (config.timerMode === 'simple') {
        longBreakRow.classList.add('hidden');
      }
      
      const cyclesRow = this.createInputRow('Number of Cycles:', 'cycles', config.cycles, 1, 20);
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
      
      // Hold duration setting
      const holdDurationRow = this.createInputRow('Hold Duration (seconds):', 'hold-duration', config.settingsLockIdleDuration, 1, 300);
      
      // Code length setting
      const codeLengthRow = this.createInputRow('Code Length (8-128):', 'code-length', config.settingsLockActiveCodeLength, 8, 128);
      
      lockoutSection.appendChild(lockoutTitle);
      lockoutSection.appendChild(idleMethodRow);
      lockoutSection.appendChild(activeMethodRow);
      lockoutSection.appendChild(holdDurationRow);
      lockoutSection.appendChild(codeLengthRow);
      
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
      
      dialog.appendChild(h2);
      dialog.appendChild(configSection);
      dialog.appendChild(buttonDiv);
      
      document.documentElement.appendChild(dialog);
      
      cancelButton.addEventListener('click', () => {
        dialog.remove();
      });
      
      saveButton.addEventListener('click', () => {
        // Save keyboard shortcut
        const newShortcut = shortcutInput.getAttribute('data-shortcut');
        if (newShortcut && newShortcut !== config.keyboardShortcut) {
          config.keyboardShortcut = newShortcut;
          // Update the keyboard shortcut handler
          if (window.zenPomodoroApp && window.zenPomodoroApp.keyboardShortcut) {
            window.zenPomodoroApp.keyboardShortcut.setupKeyboardShortcut(newShortcut);
          }
          // Also save to preferences for persistence
          setPref('keyboardShortcut', newShortcut);
        }
        
        // Save timer mode
        config.timerMode = timerModeSelect.value;
        
        // Save simple duration
        config.simpleDuration = validateIntegerInput(
          dialog.querySelector('#simple-duration').value, 1, 480, config.simpleDuration
        );
        
        // Validate pomodoro inputs
        config.focusDuration = validateIntegerInput(
          dialog.querySelector('#focus-duration').value, 1, 120, config.focusDuration
        );
        config.breakDuration = validateIntegerInput(
          dialog.querySelector('#break-duration').value, 1, 30, config.breakDuration
        );
        config.longBreakDuration = validateIntegerInput(
          dialog.querySelector('#long-break-duration').value, 5, 60, config.longBreakDuration
        );
        config.cycles = validateIntegerInput(
          dialog.querySelector('#cycles').value, 1, 20, config.cycles
        );
        config.motivationalMessage = sanitizeText(dialog.querySelector('#motivational-message').value);
        
        // Save lockout settings
        config.settingsLockIdleMethod = idleMethodSelect.value;
        config.settingsLockActiveMethod = activeMethodSelect.value;
        config.settingsLockIdleDuration = validateIntegerInput(
          dialog.querySelector('#hold-duration').value, 1, 300, config.settingsLockIdleDuration
        );
        config.settingsLockActiveCodeLength = validateIntegerInput(
          dialog.querySelector('#code-length').value, 8, 128, config.settingsLockActiveCodeLength
        );
        
        // Save blocked workspaces
        const checkedWorkspaces = [];
        workspaceContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
          checkedWorkspaces.push(checkbox.value);
        });
        config.blockedWorkspaces = checkedWorkspaces;
        
        saveConfig(config);
        dialog.remove();
        
        // Update overlay message if it exists
        if (window.zenPomodoroApp && window.zenPomodoroApp.overlay.overlay) {
          const messageEl = window.zenPomodoroApp.overlay.overlay.querySelector('#zen-pomodoro-message');
          if (messageEl) {
            messageEl.textContent = sanitizeText(config.motivationalMessage);
          }
        }
      });
    }

    /**
     * Helper to create input row
     */
    createInputRow(labelText, inputId, value, min, max) {
      const row = document.createElement('div');
      row.className = 'zen-pomodoro-config-row';
      
      const label = document.createElement('label');
      label.textContent = labelText;
      
      const input = document.createElement('input');
      input.type = 'number';
      input.id = inputId;
      input.value = value;
      input.min = min;
      input.max = max;
      
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
      
      this.lockScreen = document.createElement('div');
      this.lockScreen.id = 'zen-pomodoro-lock-screen';
      this.lockScreen.className = 'active';
      
      const lockContent = document.createElement('div');
      lockContent.id = 'zen-pomodoro-lock-content';
      
      // Determine which method to use based on timer state and config
      // Validate method value and fall back to defaults if invalid
      const requestedMethod = timerActive ? config.settingsLockActiveMethod : config.settingsLockIdleMethod;
      let method = requestedMethod;
      if (method !== LOCKOUT_METHODS.CODE && method !== LOCKOUT_METHODS.HOLD) {
        // Fall back to defaults: code for active, hold for idle
        method = timerActive ? LOCKOUT_METHODS.CODE : LOCKOUT_METHODS.HOLD;
        console.warn(`Zen Pomodoro: Invalid lockout method "${requestedMethod}", using default "${method}".`);
      }
      
      if (method === LOCKOUT_METHODS.CODE) {
        // Code entry mode
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
        
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'zen-pomodoro-dialog-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'zen-pomodoro-dialog-button secondary';
        cancelButton.id = 'zen-pomodoro-lock-cancel';
        cancelButton.textContent = 'Cancel';
        
        // Dev bypass button
        const devBypassButton = document.createElement('button');
        devBypassButton.className = 'zen-pomodoro-dialog-button secondary small';
        devBypassButton.id = 'zen-pomodoro-dev-bypass';
        devBypassButton.textContent = 'Dev Bypass';
        
        const unlockButton = document.createElement('button');
        unlockButton.className = 'zen-pomodoro-dialog-button';
        unlockButton.id = 'zen-pomodoro-lock-submit';
        unlockButton.textContent = 'Unlock';
        
        buttonDiv.appendChild(cancelButton);
        buttonDiv.appendChild(devBypassButton);
        buttonDiv.appendChild(unlockButton);
        
        lockContent.appendChild(h2);
        lockContent.appendChild(p);
        lockContent.appendChild(codeDiv);
        lockContent.appendChild(input);
        lockContent.appendChild(buttonDiv);
        
        this.lockScreen.appendChild(lockContent);
        document.documentElement.appendChild(this.lockScreen);
        
        // Focus the input field for better UX (use setTimeout to ensure DOM is ready)
        setTimeout(() => {
          if (input) input.focus();
        }, 0);
        
        // Cancel button handler
        cancelButton.addEventListener('click', () => {
          this.cleanupLockScreen();
        });
        
        // Dev bypass button handler
        devBypassButton.addEventListener('click', () => {
          this.showDevBypassPrompt(() => {
            this.cleanupLockScreen();
            onUnlock();
          });
        });
        
        unlockButton.addEventListener('click', () => {
          const inputValue = input.value;
          if (inputValue === code) {
            this.cleanupLockScreen();
            onUnlock();
          } else {
            // UI/UX FIX: Use custom dialog instead of alert()
            if (window.zenPomodoroApp) {
              window.zenPomodoroApp.showCustomAlert('Incorrect Code', 'Please try again.');
            }
          }
        });
        
      } else {
        // Hold-to-unlock timer mode
        let waitTime = config.settingsLockIdleDuration;
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Settings Locked';
        
        const p = document.createElement('p');
        p.textContent = 'Hold the button below to unlock settings:';
        
        const timerDiv = document.createElement('div');
        timerDiv.id = 'zen-pomodoro-lock-timer';
        timerDiv.textContent = waitTime.toString();
        
        const pSub = document.createElement('p');
        pSub.className = 'zen-pomodoro-lock-subtext';
        pSub.textContent = 'seconds remaining - hold button to count down';
        
        // Hold-to-unlock button
        const holdButton = document.createElement('button');
        holdButton.className = 'zen-pomodoro-dialog-button zen-pomodoro-hold-to-unlock-btn';
        holdButton.id = 'zen-pomodoro-hold-to-unlock';
        holdButton.textContent = 'Hold to Unlock';
        
        // Progress bar for hold button
        const holdProgress = document.createElement('div');
        holdProgress.className = 'zen-pomodoro-hold-unlock-progress';
        holdProgress.id = 'zen-pomodoro-hold-unlock-progress';
        holdButton.appendChild(holdProgress);
        
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'zen-pomodoro-dialog-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'zen-pomodoro-dialog-button secondary';
        cancelButton.id = 'zen-pomodoro-lock-cancel';
        cancelButton.textContent = 'Cancel';
        
        // Dev bypass button
        const devBypassButton = document.createElement('button');
        devBypassButton.className = 'zen-pomodoro-dialog-button secondary small';
        devBypassButton.id = 'zen-pomodoro-dev-bypass';
        devBypassButton.textContent = 'Dev Bypass';
        
        buttonDiv.appendChild(cancelButton);
        buttonDiv.appendChild(devBypassButton);
        buttonDiv.appendChild(holdButton);
        
        lockContent.appendChild(h2);
        lockContent.appendChild(p);
        lockContent.appendChild(timerDiv);
        lockContent.appendChild(pSub);
        lockContent.appendChild(buttonDiv);
        
        this.lockScreen.appendChild(lockContent);
        document.documentElement.appendChild(this.lockScreen);
        
        // PERFORMANCE FIX: Cache timer element reference
        this.lockTimerElement = timerDiv;
        
        // Hold-to-unlock logic
        let currentWaitTime = waitTime;
        
        const startHold = (e) => {
          // Prevent default for touch events to avoid scrolling
          if (e.type === 'touchstart') {
            e.preventDefault();
          }
          
          // Clear any existing interval to prevent race conditions
          if (this.holdToUnlockIntervalId) {
            clearInterval(this.holdToUnlockIntervalId);
            this.holdToUnlockIntervalId = null;
          }
          
          this.holdToUnlockIntervalId = setInterval(() => {
            currentWaitTime--;
            if (this.lockTimerElement) {
              this.lockTimerElement.textContent = currentWaitTime.toString();
            }
            
            // Update progress bar with null check
            const percent = ((waitTime - currentWaitTime) / waitTime) * 100;
            if (holdProgress && holdProgress.style) {
              holdProgress.style.width = `${percent}%`;
            }
            
            if (currentWaitTime <= 0) {
              if (this.holdToUnlockIntervalId) {
                clearInterval(this.holdToUnlockIntervalId);
                this.holdToUnlockIntervalId = null;
              }
              this.cleanupLockScreen();
              onUnlock();
            }
          }, 1000);
        };
        
        const stopHold = () => {
          // Reset timer when button released
          if (this.holdToUnlockIntervalId) {
            clearInterval(this.holdToUnlockIntervalId);
            this.holdToUnlockIntervalId = null;
          }
          currentWaitTime = waitTime;
          if (this.lockTimerElement) {
            this.lockTimerElement.textContent = waitTime.toString();
          }
          // Add null check for holdProgress
          if (holdProgress) {
            holdProgress.style.width = '0%';
          }
        };
        
        // Mouse and touch event handlers
        holdButton.addEventListener('mousedown', startHold);
        holdButton.addEventListener('mouseup', stopHold);
        holdButton.addEventListener('mouseleave', stopHold);
        // Note: passive: false is required for touchstart to allow preventDefault() to work,
        // which prevents unwanted page scrolling while holding the button
        holdButton.addEventListener('touchstart', startHold, { passive: false });
        holdButton.addEventListener('touchend', stopHold);
        holdButton.addEventListener('touchcancel', stopHold);
        
        // Keyboard accessibility - support space/enter for hold
        holdButton.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            startHold(e);
          }
        });
        holdButton.addEventListener('keyup', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            stopHold();
          }
        });
        
        // Cancel button handler
        cancelButton.addEventListener('click', () => {
          this.cleanupLockScreen();
        });
        
        // Dev bypass button handler
        devBypassButton.addEventListener('click', () => {
          this.showDevBypassPrompt(() => {
            this.cleanupLockScreen();
            onUnlock();
          });
        });
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
    startTimer(mode = 'pomodoro', cycles = 4) {
      console.log(`Starting timer: mode=${mode}, cycles=${cycles}`);
      
      this.timer.start(mode, cycles);
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
