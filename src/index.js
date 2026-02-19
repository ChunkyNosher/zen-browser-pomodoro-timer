/**
 * Zen Pomodoro Focus Blocker Mod - Entry Point
 *
 * This is the main entry point that Rollup uses to bundle all modules into
 * a single IIFE file (zen-pomodoro-focus-blocker.uc.js).
 *
 * Module load order:
 * 1. constants.js - No dependencies (pure data)
 * 2. state.js - No dependencies (simple shared state)
 * 3. log-manager.js - Depends on constants.js (Storage injected later)
 * 4. window-sync-manager.js - Depends on constants.js, log-manager.js
 * 5. storage.js - Depends on constants.js, log-manager.js
 * 6. utils.js - Depends on constants.js, log-manager.js, storage.js
 * 7. helpers.js - Legacy wrappers for Storage and Utils
 * 8. ui-helpers.js - UI helper functions for dialog management
 * 9. break-phase-utils.js - Break phase detection
 * 10. shared-blocker-utils.js - Shared blocker utilities
 * 11-23. Class modules (Timer, Workspace, Overlay, etc.)
 * 24. zen-pomodoro-app.js - Main application class
 *
 * CIRCULAR DEPENDENCY RESOLUTION:
 * - LogManager needs Storage for cross-window log sync
 * - Storage needs LogManager for logging
 * - Solution: Dependency injection via setStorage() after both are initialized
 */

// Import all modules (Rollup will bundle them into the IIFE)
import { logger } from './log-manager.js';
import Storage from './storage.js';
import ZenPomodoroApp from './zen-pomodoro-app.js';
import Constants from './constants.js';

// ============================================
// Dependency Injection
// ============================================

// Resolve circular dependency: LogManager needs Storage for cross-window log sync
logger.setStorage(Storage);

// ============================================
// Initialize Application
// ============================================

// BOOTSTRAP GUARD: Prevent duplicate initialization in same window
// This guard flag prevents duplicate app initialization if the script runs multiple times
// in the same window (e.g., duplicate script injections).
if (window.__zenPomodoroInitialized) {
  logger.log(
    Constants.LOG_CATEGORIES.INIT,
    'Zen Pomodoro already initialized in this window. Skipping duplicate initialization.'
  );
} else {
  window.__zenPomodoroInitialized = true;

  // Create and store the app instance for cleanup
  const app = new ZenPomodoroApp();

  // Resolve circular dependency: WindowSyncManager needs Storage for cross-window timer sync
  if (app.windowSync && typeof app.windowSync.setStorage === 'function') {
    app.windowSync.setStorage(Storage);
  }

  // TIMER STATE PERSISTENCE FIX: Save timer state before browser closes
  // This ensures state is saved even on sudden browser/PC shutdown
  window.addEventListener(
    'beforeunload',
    () => {
      if (app?.timer?.isActive) {
        app.timer.saveState();
        logger.log(Constants.LOG_CATEGORIES.TIMER, 'Timer state saved before browser close');
      }
      // CROSS-WINDOW SYNC: Release ownership so other windows can take over
      if (app?.windowSync) {
        app.windowSync.releaseOwnership();
      }
    }
  );

  // MEMORY LEAK FIX: Register shutdown handler to cleanup resources
  // This ensures SineModBlocker and other modules are properly destroyed
  window.addEventListener(
    'unload',
    () => {
      if (app) {
        app.destroy();
      }
      // Clear the bootstrap guard flag on unload so a reused window object can initialize cleanly.
      // This protects edge cases where the browser keeps the JS window alive across teardown/reload.
      delete window.__zenPomodoroInitialized;
    },
    { once: true }
  );
}
