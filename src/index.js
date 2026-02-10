/**
 * Main entry point for Zen Pomodoro Focus Blocker mod
 * 
 * This file demonstrates how to initialize and wire together the extracted modules.
 * The modules are organized as follows:
 * 
 * 1. constants.js - No dependencies (pure data)
 * 2. state.js - No dependencies (simple shared state)
 * 3. log-manager.js - Depends on constants.js (Storage injected later)
 * 4. window-sync-manager.js - Depends on constants.js, log-manager.js (Storage injected later)
 * 5. storage.js - Depends on constants.js, log-manager.js
 * 6. utils.js - Depends on constants.js, log-manager.js, storage.js
 * 7. helpers.js - Legacy wrappers for Storage and Utils (backward compatibility)
 * 8. ui-helpers.js - UI helper functions for dialog management
 * 9. break-phase-utils.js - Break phase detection utilities
 * 10. shared-blocker-utils.js - Shared utilities for blockers
 * 
 * CIRCULAR DEPENDENCY RESOLUTION:
 * - LogManager needs Storage for cross-window log sync (getPref/setPref)
 * - Storage needs LogManager for logging configuration changes
 * - Solution: Dependency injection via setStorage() method after both are initialized
 */

import Constants from './constants.js';
import { lastDialogPosition, setLastDialogPosition } from './state.js';
import { LogManager, logger } from './log-manager.js';
import WindowSyncManager from './window-sync-manager.js';
import Storage from './storage.js';
import Utils from './utils.js';

// Import helper modules
import * as Helpers from './helpers.js';
import * as UIHelpers from './ui-helpers.js';
import * as BreakPhaseUtils from './break-phase-utils.js';
import * as SharedBlockerUtils from './shared-blocker-utils.js';

// ============================================
// Initialization
// ============================================

/**
 * Initialize all modules with proper dependency injection.
 * This function should be called once when the mod loads.
 */
function initModules() {
  // Step 1: Inject Storage into logger to resolve circular dependency
  logger.setStorage(Storage);
  
  // Step 2: Create and configure WindowSyncManager
  const windowSync = new WindowSyncManager();
  windowSync.setStorage(Storage);
  
  // Step 3: Set up cross-window log sync
  logger.setWindowId(windowSync.windowId);
  logger.initSync();
  logger.requestExistingLogs();
  
  // Step 4: Initialize window sync manager
  windowSync.init();
  
  // Log successful initialization
  logger.log(Constants.LOG_CATEGORIES.INIT, 'Modules initialized', {
    windowId: windowSync.windowId,
    modVersion: Constants.MOD_VERSION,
  });
  
  return {
    logger,
    windowSync,
    Storage,
    Utils,
    Constants,
  };
}

// ============================================
// Exports
// ============================================

// Export individual modules
export { Constants, logger, Storage, Utils, WindowSyncManager };

// Export helper modules
export { Helpers, UIHelpers, BreakPhaseUtils, SharedBlockerUtils };

// Export state management
export { lastDialogPosition, setLastDialogPosition };

// Export initialization function
export { initModules };

// Default export with all modules
export default {
  Constants,
  logger,
  Storage,
  Utils,
  WindowSyncManager,
  Helpers,
  UIHelpers,
  BreakPhaseUtils,
  SharedBlockerUtils,
  lastDialogPosition,
  setLastDialogPosition,
  initModules,
};
