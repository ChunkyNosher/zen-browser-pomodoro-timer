# Next Steps for Module Extraction

## ✅ Phase 1: Core Modules Extraction - COMPLETE

The following core modules have been successfully extracted to `src/` directory:

1. ✅ `constants.js` - All application constants
2. ✅ `state.js` - Shared mutable state
3. ✅ `log-manager.js` - Logging and log management
4. ✅ `window-sync-manager.js` - Cross-window timer synchronization
5. ✅ `storage.js` - Firefox preferences management
6. ✅ `utils.js` - General utility functions
7. ✅ `index.js` - Main entry point with initialization
8. ✅ `README.md` - Module documentation

## 📋 Current Status

- **Rollup config**: ✅ Updated and working
- **Build system**: ✅ Clean build with no warnings
- **Generated bundle**: ✅ Produces valid `zen-pomodoro-focus-blocker.uc.js`
- **Circular dependencies**: ✅ Resolved via dependency injection

## 🎯 Phase 2: Integration (NEXT)

The generated bundle currently only contains the core modules. The rest of the code (classes and UI) is still in the original file. To fully integrate:

### Option A: Gradual Migration (Recommended)

Keep the original file but have it import from the bundled modules:

1. **Backup the original file** (already at 15890 lines)

2. **Remove extracted code from original** (lines 48-1572)
   - Remove Constants object (lines 48-278)
   - Remove lastDialogPosition (line 290)
   - Remove LogManager class (lines 296-601)
   - Remove WindowSyncManager class (lines 607-925)
   - Remove Storage IIFE (lines 933-1240)
   - Remove Utils IIFE (lines 1244-1572)

3. **Replace with imports** at the top of the file:
   ```javascript
   // Import core modules from bundled output
   // Note: This assumes the bundled file exports these
   const { Constants, logger, Storage, Utils, WindowSyncManager, lastDialogPosition, setLastDialogPosition, initModules } = window.zenPomodoroModules;
   
   // Initialize modules
   const modules = initModules();
   ```

4. **Update the bundle** to expose modules on window:
   - Modify `src/index.js` to attach exports to `window.zenPomodoroModules`

### Option B: Complete Extraction (More Work)

Continue extracting remaining classes into separate modules:

1. **Next extraction priority**:
   - `workspace-detector.js` (WorkspaceDetector class)
   - `overlay-manager.js` (OverlayManager class)
   - `security-manager.js` (SecurityManager class)
   - `website-blocker.js` (WebsiteBlocker class)
   - `pomodoro-timer.js` (PomodoroTimer class)
   - And all other classes...

2. **Update main file** to be a simple initialization script

3. **Bundle everything** via Rollup

## 🔨 Immediate Next Steps

### Step 1: Test the Current Build

Before making changes, verify the bundled modules work:

```bash
# The build is already complete
npm run build

# The generated file is at:
# zen-pomodoro-focus-blocker.uc.js (1637 lines, 56KB)
```

### Step 2: Choose Integration Strategy

**Decision needed**: Choose between Option A (gradual) or Option B (complete extraction)

**Recommendation**: Option A for now - it's safer and allows incremental testing.

### Step 3: Update src/index.js to Expose Modules

If choosing Option A, update `src/index.js` to expose modules globally:

```javascript
// At the end of initModules()
function initModules() {
  // ... existing code ...
  
  // Expose modules globally for other code to use
  if (typeof window !== 'undefined') {
    window.zenPomodoroModules = {
      Constants,
      logger,
      Storage,
      Utils,
      WindowSyncManager,
      lastDialogPosition: exports.lastDialogPosition,
      setLastDialogPosition,
      initModules,
    };
  }
  
  return { logger, windowSync, Storage, Utils, Constants };
}
```

### Step 4: Run Tests

1. Build: `npm run build`
2. Check generated file for syntax errors
3. Test in Zen Browser
4. Verify all functionality works

## 📊 Extraction Progress

```
Core Modules:        [████████████████████] 100% (6/6 complete)
Class Extraction:    [░░░░░░░░░░░░░░░░░░░░]   0% (0/~20 remaining)
UI Code Extraction:  [░░░░░░░░░░░░░░░░░░░░]   0% (0/~15 remaining)
Integration:         [░░░░░░░░░░░░░░░░░░░░]   0% (not started)
```

## 🎓 Lessons Learned

1. **Circular dependencies** are common when extracting from IIFE code
   - Solution: Dependency injection pattern
   
2. **Rollup warnings** can be suppressed for known issues
   - MIXED_EXPORTS is safe for IIFE format
   
3. **Firefox globals** must be marked as external
   - Services, Components, ChromeUtils, document, window, etc.

4. **Module organization** matters
   - Keep dependencies minimal
   - Use clear naming
   - Document everything

## 📚 References

- Module documentation: `src/README.md`
- Extraction summary: `EXTRACTION_SUMMARY.md`
- Rollup config: `rollup.config.mjs`
- Original file: `zen-pomodoro-focus-blocker.uc.js` (currently 15890 lines)

## ⚠️ Important Notes

1. **The original file still contains most of the code**
   - Only the core modules (6 files) have been extracted
   - Classes (PomodoroTimer, OverlayManager, etc.) remain in original file
   - UI code remains in original file
   
2. **The bundled file is standalone**
   - Contains only the extracted modules
   - Does NOT include the rest of the application
   - Need to integrate with original code OR continue extraction

3. **No breaking changes yet**
   - Original file still works as-is
   - New modules are ready but not yet integrated
   - Safe to test and validate before integration

## 🚀 When Ready to Integrate

1. Choose integration strategy (A or B)
2. Update `src/index.js` if needed
3. Rebuild: `npm run build`
4. Update original file to use modules
5. Test thoroughly in Zen Browser
6. Commit changes

Good luck with the next phase! 🎉
