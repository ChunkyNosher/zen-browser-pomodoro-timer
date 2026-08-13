import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: {
    file: 'zen-pomodoro-focus-blocker.uc.js',
    format: 'iife',
    // No 'name' needed - this is a self-executing function with no global exports
    // Matches the original (() => { ... })() pattern
    banner: `/**
 * Zen Pomodoro Focus Blocker Mod
 * Version: 1.4.11
 * License: MIT
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
 * - Hold-to-unlock for settings access
 * - Notification permission requests
 * - Custom confirmation dialogs
 * - Custom Pomodoro Cycles (NEW in 1.3.2)
 *
 * CODE QUALITY:
 * - Proper input validation
 * - Reduced save frequency
 * - Config stored with timer state
 * - Viewport boundary checks
 * - Accessibility improvements
 * - Settings consolidated to preferences.json
 *
 * ARCHITECTURE:
 * - Modular ES modules bundled with Rollup
 * - Clear module boundaries with public interfaces
 * - No global variable pollution
 *
 * BUNDLED WITH ROLLUP - Source files are in the src/ directory
 * To rebuild: npm run build
 */`,
  },
  plugins: [resolve()],
  onwarn(warning, warn) {
    // Suppress known harmless warnings
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    if (warning.code === 'MISSING_NAME_OPTION_FOR_IIFE_EXPORT') return;
    warn(warning);
  },
};
