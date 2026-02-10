# Module Extraction Verification

This document helps verify that all extracted modules are working correctly.

## Quick Verification Commands

### 1. Check All Modules Exist
```bash
ls -lh src/*.js
```

Expected output: 11 JavaScript files in `src/` directory

### 2. Build Test
```bash
npm run build
```

Expected: Build succeeds with no errors

### 3. Check Bundled File
```bash
wc -l zen-pomodoro-focus-blocker.uc.js
```

Expected: ~2900 lines (vs ~1600 before extraction)

### 4. Verify Helper Functions in Bundle
```bash
grep -n "function setupDialogDrag\|function isInBreakPhase\|function createProgressListener" zen-pomodoro-focus-blocker.uc.js | wc -l
```

Expected: 3 (one match for each function)

## Module Checklist

- [x] `src/constants.js` - Application constants
- [x] `src/state.js` - Shared mutable state
- [x] `src/log-manager.js` - Logging system
- [x] `src/window-sync-manager.js` - Cross-window sync
- [x] `src/storage.js` - Firefox preferences
- [x] `src/utils.js` - General utilities
- [x] `src/helpers.js` - Legacy wrappers
- [x] `src/ui-helpers.js` - UI helper functions
- [x] `src/break-phase-utils.js` - Break phase detection
- [x] `src/shared-blocker-utils.js` - Blocker utilities
- [x] `src/index.js` - Main entry point

## Function Count by Module

| Module | Exported Functions | Exported Constants |
|--------|-------------------|-------------------|
| constants.js | 0 | ~40 |
| state.js | 1 | 1 variable |
| log-manager.js | 1 class | 1 instance |
| window-sync-manager.js | 1 class | 0 |
| storage.js | ~15 functions | 0 |
| utils.js | ~15 functions | 0 |
| helpers.js | 21 functions | 25 constants |
| ui-helpers.js | 21 functions | 0 |
| break-phase-utils.js | 1 function | 0 |
| shared-blocker-utils.js | 9 functions | 0 |
| index.js | All modules | All modules |

## Import/Export Validation

### Check for Circular Dependencies
```bash
grep -r "import.*from.*helpers" src/ | grep -v ".md"
```

Expected: Only `ui-helpers.js` imports from `helpers.js`

### Check for Missing Imports
```bash
# Build should catch this, but verify manually:
grep -r "Constants\." src/*.js | grep -v "import Constants"
```

Expected: All files using Constants should import it

## Build Output Verification

### Check Rollup Bundle Size
```bash
du -h zen-pomodoro-focus-blocker.uc.js
```

Expected: ~140KB (vs ~80KB before extraction)

### Check for IIFE Wrapper
```bash
head -20 zen-pomodoro-focus-blocker.uc.js | grep "function (exports)"
```

Expected: Should find the IIFE wrapper added by Rollup

### Check for Source Map Comments
```bash
tail -5 zen-pomodoro-focus-blocker.uc.js
```

Expected: Should end with `})({});` (IIFE closing)

## Module Dependencies Graph

```
constants.js (no deps)
    ↓
state.js (no deps)
    ↓
log-manager.js ──→ constants.js
    ↓
window-sync-manager.js ──→ constants.js, log-manager.js
    ↓
storage.js ──→ constants.js, log-manager.js
    ↓
utils.js ──→ constants.js, log-manager.js, storage.js
    ↓
helpers.js ──→ constants.js, storage.js, utils.js
    ↓
ui-helpers.js ──→ constants.js, log-manager.js, state.js, helpers.js
break-phase-utils.js (no deps - uses global)
shared-blocker-utils.js ──→ constants.js, log-manager.js, helpers.js
    ↓
index.js ──→ ALL MODULES
```

## Testing Recommendations

### 1. Syntax Verification
```bash
npm run build
```

### 2. Manual Testing in Zen Browser
1. Copy `zen-pomodoro-focus-blocker.uc.js` to Zen Browser chrome folder
2. Restart Zen Browser
3. Test basic timer functionality
4. Test dialog drag and drop
5. Test workspace blocking
6. Test website blocking

### 3. Code Quality Check
```bash
# If ESLint is configured:
npx eslint src/*.js
```

### 4. Size Comparison
```bash
# Compare with previous version
git show edf01c4:zen-pomodoro-focus-blocker.uc.js | wc -l
wc -l zen-pomodoro-focus-blocker.uc.js
```

Expected: New file should be larger (more functionality extracted)

## Common Issues & Solutions

### Issue: Build fails with "Cannot find module"
**Solution**: Check that all imports use `.js` extension and correct path

### Issue: Functions not found in bundled file
**Solution**: Ensure index.js exports all helper modules

### Issue: Circular dependency warning
**Solution**: This is expected for Storage ↔ LogManager (resolved via dependency injection)

### Issue: Browser globals (gBrowser, Services, ChromeUtils) errors
**Solution**: These are provided by Firefox runtime and marked as external in rollup.config.mjs

## Success Criteria

✅ All 11 source modules exist in `src/` directory
✅ Build completes without errors
✅ Bundled file contains all helper functions
✅ No duplicate function definitions
✅ All JSDoc comments preserved
✅ All eslint-disable comments preserved
✅ ES module imports/exports working correctly
✅ File sizes are reasonable (~6-20KB per module)
✅ Dependencies are clear and well-organized

## Next Steps After Verification

1. Test the mod in Zen Browser to ensure runtime functionality
2. Update documentation (copilot-instructions.md, subagent.agent.md)
3. Consider extracting larger class files in future PRs
4. Celebrate clean, modular code! 🎉
