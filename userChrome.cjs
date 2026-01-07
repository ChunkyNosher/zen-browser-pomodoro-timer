/**
 * Zen Pomodoro Focus Blocker Mod
 * Version: 1.0.0
 * License: MPL-2.0
 * 
 * A productivity mod that implements customizable Pomodoro timer with workspace blocking
 */

(() => {
  'use strict';

  // ============================================
  // Constants and Configuration
  // ============================================
  
  const PREF_PREFIX = 'zen-pomodoro';
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
    settingsLockActiveCodeLength: 64,
    settingsLockActiveCharacterSet: 'all-typeable',
    holdToStartDuration: 3000,
    enableNotifications: true,
    enableAudioAlerts: false,
    phase: 'focus'
  };

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
    const configStr = getPref('config', null);
    if (configStr) {
      try {
        return JSON.parse(configStr);
      } catch (e) {
        console.error('Failed to parse config:', e);
      }
    }
    return { ...DEFAULT_CONFIG };
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
   * Generate random code for settings lock
   */
  function generateRandomCode(length, charset) {
    const chars = charset === 'alphanumeric' 
      ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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
      this.onTick = null;
      this.onPhaseChange = null;
      this.onComplete = null;
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

          this.saveState();
        }
      }, 1000);
    }

    /**
     * Handle phase completion
     */
    handlePhaseComplete() {
      if (this.mode === 'simple') {
        this.complete();
        return;
      }

      // Pomodoro mode phase transitions
      if (this.currentPhase === 'focus') {
        // Focus period complete, start break
        if (this.currentCycle % this.config.longBreakInterval === 0 && this.currentCycle === this.totalCycles) {
          // Last cycle, long break
          this.currentPhase = 'long-break';
          this.remainingTime = this.config.longBreakDuration * 60;
        } else {
          // Regular break
          this.currentPhase = 'break';
          this.remainingTime = this.config.breakDuration * 60;
        }
      } else {
        // Break complete
        this.currentCycle++;
        
        if (this.currentCycle > this.totalCycles) {
          // All cycles complete
          this.complete();
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
      this.clearState();
    }

    /**
     * Complete the timer
     */
    complete() {
      this.stop();
      if (this.onComplete) {
        this.onComplete();
      }
    }

    /**
     * Save timer state to preferences
     */
    saveState() {
      const state = {
        isActive: this.isActive,
        isPaused: this.isPaused,
        remainingTime: this.remainingTime,
        currentPhase: this.currentPhase,
        currentCycle: this.currentCycle,
        totalCycles: this.totalCycles,
        mode: this.mode
      };
      setPref('timer-state', JSON.stringify(state));
    }

    /**
     * Load timer state from preferences
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
     * Check if current workspace is blocked
     */
    isCurrentWorkspaceBlocked() {
      const activeWorkspace = this.getActiveWorkspace();
      if (!activeWorkspace) return false;
      
      return this.config.blockedWorkspaces.includes(activeWorkspace);
    }

    /**
     * Start monitoring workspace changes
     */
    startMonitoring() {
      this.activeWorkspace = this.getActiveWorkspace();
      
      // Use MutationObserver to detect workspace changes
      const observer = new MutationObserver(() => {
        const newWorkspace = this.getActiveWorkspace();
        if (newWorkspace !== this.activeWorkspace) {
          this.activeWorkspace = newWorkspace;
          if (this.onWorkspaceChange) {
            this.onWorkspaceChange(newWorkspace, this.isCurrentWorkspaceBlocked());
          }
        }
      });

      const workspaceContainer = document.querySelector('#zen-workspace-button-container, [id*="workspace"]');
      if (workspaceContainer) {
        observer.observe(workspaceContainer, {
          attributes: true,
          attributeFilter: ['active'],
          subtree: true
        });
      }
    }

    /**
     * Get all available workspaces
     */
    getAllWorkspaces() {
      try {
        const workspaceButtons = document.querySelectorAll('toolbarbutton[zen-workspace-id]');
        return Array.from(workspaceButtons).map(btn => ({
          id: btn.getAttribute('zen-workspace-id'),
          name: btn.getAttribute('label') || 'Unnamed Workspace'
        }));
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
    }

    /**
     * Create overlay elements
     */
    createOverlay() {
      if (this.overlay) return;

      // Main overlay
      this.overlay = document.createElement('div');
      this.overlay.id = 'zen-pomodoro-overlay';
      this.overlay.innerHTML = `
        <div id="zen-pomodoro-content">
          <div id="zen-pomodoro-phase-label">Focus Period</div>
          <div id="zen-pomodoro-timer-display">25:00</div>
          <div id="zen-pomodoro-cycle-progress">Cycle 1 of 4</div>
          <div id="zen-pomodoro-message">${this.config.motivationalMessage}</div>
          <div id="zen-pomodoro-controls">
            <button class="zen-pomodoro-button" id="zen-pomodoro-pause-button">Pause</button>
            <button class="zen-pomodoro-button" id="zen-pomodoro-stop-button">Stop Timer</button>
          </div>
        </div>
      `;

      // Persistent indicator
      this.indicator = document.createElement('div');
      this.indicator.id = 'zen-pomodoro-indicator';
      this.indicator.innerHTML = `
        <div id="zen-pomodoro-indicator-dot"></div>
        <span id="zen-pomodoro-indicator-text">Focus: 25:00</span>
      `;

      document.documentElement.appendChild(this.overlay);
      document.documentElement.appendChild(this.indicator);

      // Setup responsive resizing
      this.setupResizeObserver();
    }

    /**
     * Setup ResizeObserver for responsive design
     */
    setupResizeObserver() {
      if (!this.overlay) return;

      const observer = new ResizeObserver(() => {
        this.updateOverlayDimensions();
      });

      observer.observe(document.documentElement);
    }

    /**
     * Update overlay dimensions
     */
    updateOverlayDimensions() {
      if (!this.overlay) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      this.overlay.style.width = `${width}px`;
      this.overlay.style.height = `${height}px`;
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
        this.overlay.removeAttribute('data-transitioning');
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
     * Remove overlay elements
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
  // Context Menu Module
  // ============================================
  
  class ContextMenuHandler {
    constructor() {
      this.configDialog = null;
    }

    /**
     * Initialize context menu listeners
     */
    init() {
      // Listen for context menu on sidebar and workspace buttons
      document.addEventListener('contextmenu', (e) => {
        const target = e.target;
        
        // Check if right-click is on workspace button or sidebar
        const isWorkspaceButton = target.closest('toolbarbutton[zen-workspace-id]');
        const isSidebar = target.closest('#navigator-toolbox, #sidebar-box');
        
        if (isWorkspaceButton || isSidebar) {
          this.addContextMenuItem(e);
        }
      });
    }

    /**
     * Add context menu item
     */
    addContextMenuItem(event) {
      // Note: This is a simplified version. In a real implementation,
      // you would need to properly integrate with Firefox's context menu system
      // For now, we'll create a custom menu
      
      const existingMenu = document.getElementById('zen-pomodoro-context-menu');
      if (existingMenu) existingMenu.remove();
      
      const menu = document.createElement('div');
      menu.id = 'zen-pomodoro-context-menu';
      menu.style.cssText = `
        position: fixed;
        background: #2b2a33;
        border: 1px solid #3a3944;
        border-radius: 6px;
        padding: 4px 0;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      
      menu.innerHTML = `
        <div class="zen-pomodoro-context-menu-item" id="zen-pomodoro-start-timer">
          <span>⏱️ Start Pomodoro Timer</span>
        </div>
        <div class="zen-pomodoro-context-menu-separator"></div>
        <div class="zen-pomodoro-context-menu-item" id="zen-pomodoro-open-settings">
          <span>⚙️ Timer Settings</span>
        </div>
      `;
      
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
      
      document.documentElement.appendChild(menu);
      
      // Add click handlers
      menu.querySelector('#zen-pomodoro-start-timer').addEventListener('click', () => {
        menu.remove();
        this.showConfigDialog();
      });
      
      menu.querySelector('#zen-pomodoro-open-settings').addEventListener('click', () => {
        menu.remove();
        this.showSettingsDialog();
      });
      
      // Remove menu when clicking outside
      setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
      }, 100);
      
      event.preventDefault();
      event.stopPropagation();
    }

    /**
     * Show timer configuration dialog
     */
    showConfigDialog() {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-config-dialog';
      dialog.className = 'active';
      
      const config = getConfig();
      
      dialog.innerHTML = `
        <h2>Start Pomodoro Timer</h2>
        <div class="zen-pomodoro-config-section">
          <div class="zen-pomodoro-config-row">
            <label>Timer Mode:</label>
            <select id="zen-pomodoro-mode-select">
              <option value="simple">Simple Timer</option>
              <option value="pomodoro" selected>Pomodoro Cycles</option>
            </select>
          </div>
          <div class="zen-pomodoro-config-row" id="zen-pomodoro-cycles-row">
            <label>Number of Cycles:</label>
            <input type="number" id="zen-pomodoro-cycles-input" value="${config.cycles}" min="1" max="10">
          </div>
        </div>
        <div class="zen-pomodoro-dialog-buttons">
          <button class="zen-pomodoro-dialog-button secondary" id="zen-pomodoro-cancel-button">Cancel</button>
          <button class="zen-pomodoro-dialog-button" id="zen-pomodoro-start-button">Start Timer</button>
        </div>
      `;
      
      document.documentElement.appendChild(dialog);
      
      const modeSelect = dialog.querySelector('#zen-pomodoro-mode-select');
      const cyclesRow = dialog.querySelector('#zen-pomodoro-cycles-row');
      
      modeSelect.addEventListener('change', () => {
        cyclesRow.style.display = modeSelect.value === 'pomodoro' ? 'flex' : 'none';
      });
      
      dialog.querySelector('#zen-pomodoro-cancel-button').addEventListener('click', () => {
        dialog.remove();
      });
      
      dialog.querySelector('#zen-pomodoro-start-button').addEventListener('click', () => {
        const mode = modeSelect.value;
        const cycles = parseInt(dialog.querySelector('#zen-pomodoro-cycles-input').value);
        
        dialog.remove();
        
        // Trigger timer start
        if (window.zenPomodoroApp) {
          window.zenPomodoroApp.startTimer(mode, cycles);
        }
      });
    }

    /**
     * Show settings dialog
     */
    showSettingsDialog() {
      const dialog = document.createElement('div');
      dialog.id = 'zen-pomodoro-config-dialog';
      dialog.className = 'active';
      
      const config = getConfig();
      
      dialog.innerHTML = `
        <h2>Pomodoro Timer Settings</h2>
        <div class="zen-pomodoro-config-section">
          <div class="zen-pomodoro-config-row">
            <label>Focus Duration (min):</label>
            <input type="number" id="focus-duration" value="${config.focusDuration}" min="1" max="120">
          </div>
          <div class="zen-pomodoro-config-row">
            <label>Break Duration (min):</label>
            <input type="number" id="break-duration" value="${config.breakDuration}" min="1" max="30">
          </div>
          <div class="zen-pomodoro-config-row">
            <label>Long Break (min):</label>
            <input type="number" id="long-break-duration" value="${config.longBreakDuration}" min="5" max="60">
          </div>
          <div class="zen-pomodoro-config-row">
            <label>Motivational Message:</label>
            <input type="text" id="motivational-message" value="${config.motivationalMessage}" style="width: 250px;">
          </div>
        </div>
        <div class="zen-pomodoro-dialog-buttons">
          <button class="zen-pomodoro-dialog-button secondary" id="zen-pomodoro-settings-cancel">Cancel</button>
          <button class="zen-pomodoro-dialog-button" id="zen-pomodoro-settings-save">Save</button>
        </div>
      `;
      
      document.documentElement.appendChild(dialog);
      
      dialog.querySelector('#zen-pomodoro-settings-cancel').addEventListener('click', () => {
        dialog.remove();
      });
      
      dialog.querySelector('#zen-pomodoro-settings-save').addEventListener('click', () => {
        config.focusDuration = parseInt(dialog.querySelector('#focus-duration').value);
        config.breakDuration = parseInt(dialog.querySelector('#break-duration').value);
        config.longBreakDuration = parseInt(dialog.querySelector('#long-break-duration').value);
        config.motivationalMessage = dialog.querySelector('#motivational-message').value;
        
        saveConfig(config);
        dialog.remove();
      });
    }
  }

  // ============================================
  // Security Module
  // ============================================
  
  class SecurityManager {
    constructor() {
      this.lockScreen = null;
      this.isLocked = false;
      this.holdStartTime = null;
      this.holdDuration = 3000;
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
     * Show settings lock screen
     */
    showLockScreen(timerActive, onUnlock) {
      const config = getConfig();
      
      this.lockScreen = document.createElement('div');
      this.lockScreen.id = 'zen-pomodoro-lock-screen';
      this.lockScreen.className = 'active';
      
      if (timerActive) {
        // Code entry mode
        const code = generateRandomCode(
          config.settingsLockActiveCodeLength,
          config.settingsLockActiveCharacterSet
        );
        
        this.lockScreen.innerHTML = `
          <div id="zen-pomodoro-lock-content">
            <h2>Settings Locked</h2>
            <p>Timer is active. Enter the code below to unlock settings:</p>
            <div style="background: #1e1d26; padding: 12px; border-radius: 6px; margin: 16px 0; font-family: monospace; word-break: break-all;">
              ${code}
            </div>
            <input type="text" id="zen-pomodoro-lock-code" placeholder="Enter code here">
            <div style="margin-top: 16px;">
              <button class="zen-pomodoro-dialog-button" id="zen-pomodoro-lock-submit">Unlock</button>
              <button class="zen-pomodoro-dialog-button secondary" id="zen-pomodoro-lock-cancel">Cancel</button>
            </div>
          </div>
        `;
        
        document.documentElement.appendChild(this.lockScreen);
        
        this.lockScreen.querySelector('#zen-pomodoro-lock-submit').addEventListener('click', () => {
          const input = this.lockScreen.querySelector('#zen-pomodoro-lock-code').value;
          if (input === code) {
            this.lockScreen.remove();
            onUnlock();
          } else {
            alert('Incorrect code. Please try again.');
          }
        });
        
      } else {
        // Wait timer mode
        let waitTime = config.settingsLockIdleDuration;
        
        this.lockScreen.innerHTML = `
          <div id="zen-pomodoro-lock-content">
            <h2>Settings Locked</h2>
            <p>Please wait to access settings:</p>
            <div id="zen-pomodoro-lock-timer">${waitTime}</div>
            <p style="font-size: 14px; opacity: 0.7;">seconds remaining</p>
          </div>
        `;
        
        document.documentElement.appendChild(this.lockScreen);
        
        const interval = setInterval(() => {
          waitTime--;
          const timerEl = this.lockScreen?.querySelector('#zen-pomodoro-lock-timer');
          if (timerEl) {
            timerEl.textContent = waitTime;
          }
          
          if (waitTime <= 0) {
            clearInterval(interval);
            if (this.lockScreen) {
              this.lockScreen.remove();
              onUnlock();
            }
          }
        }, 1000);
      }
      
      this.lockScreen.querySelector('#zen-pomodoro-lock-cancel')?.addEventListener('click', () => {
        this.lockScreen.remove();
      });
    }

    /**
     * Implement hold-to-start button
     */
    setupHoldToStart(buttonElement, onComplete) {
      const config = getConfig();
      const duration = config.holdToStartDuration;
      
      if (duration <= 0) {
        onComplete();
        return;
      }
      
      let progress = 0;
      let interval = null;
      
      const progressBar = document.createElement('div');
      progressBar.id = 'zen-pomodoro-hold-progress';
      buttonElement.appendChild(progressBar);
      
      buttonElement.addEventListener('mousedown', () => {
        progress = 0;
        interval = setInterval(() => {
          progress += 100;
          const percent = (progress / duration) * 100;
          progressBar.style.width = `${percent}%`;
          
          if (progress >= duration) {
            clearInterval(interval);
            onComplete();
          }
        }, 100);
      });
      
      buttonElement.addEventListener('mouseup', () => {
        if (interval) {
          clearInterval(interval);
          progress = 0;
          progressBar.style.width = '0%';
        }
      });
      
      buttonElement.addEventListener('mouseleave', () => {
        if (interval) {
          clearInterval(interval);
          progress = 0;
          progressBar.style.width = '0%';
        }
      });
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
      this.contextMenu = new ContextMenuHandler();
      this.security = new SecurityManager();
      
      this.init();
    }

    /**
     * Initialize the application
     */
    init() {
      console.log('Zen Pomodoro Focus Blocker initializing...');
      
      // Wait for browser to be fully loaded
      if (document.readyState === 'complete') {
        this.onReady();
      } else {
        window.addEventListener('load', () => this.onReady());
      }
    }

    /**
     * Called when browser is ready
     */
    onReady() {
      console.log('Zen Pomodoro Focus Blocker ready');
      
      // Initialize modules
      this.contextMenu.init();
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
      
      // Setup overlay button handlers
      this.setupOverlayHandlers();
      
      // Expose app globally for debugging and context menu
      window.zenPomodoroApp = this;
    }

    /**
     * Setup overlay button handlers
     */
    setupOverlayHandlers() {
      // Wait for overlay to be created
      setTimeout(() => {
        const pauseButton = document.getElementById('zen-pomodoro-pause-button');
        const stopButton = document.getElementById('zen-pomodoro-stop-button');
        
        if (pauseButton) {
          pauseButton.addEventListener('click', () => {
            if (this.timer.isPaused) {
              this.timer.resume();
              pauseButton.textContent = 'Pause';
            } else {
              this.timer.pause();
              pauseButton.textContent = 'Resume';
            }
          });
        }
        
        if (stopButton) {
          stopButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to stop the timer?')) {
              this.stopTimer();
            }
          });
        }
      }, 1000);
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
     */
    showNotification(phase) {
      const messages = {
        focus: 'Time to focus! 💪',
        break: 'Take a break! ☕',
        'long-break': 'Long break time! 🌟',
        complete: 'Pomodoro session complete! 🎉'
      };
      
      const message = messages[phase] || 'Pomodoro timer';
      
      // Simple browser notification (could be enhanced)
      try {
        new Notification('Zen Pomodoro Timer', {
          body: message,
          icon: 'chrome://branding/content/about-logo.png'
        });
      } catch (e) {
        console.log('Notification:', message);
      }
    }
  }

  // ============================================
  // Initialize Application
  // ============================================
  
  // Start the app
  new ZenPomodoroApp();

})();
