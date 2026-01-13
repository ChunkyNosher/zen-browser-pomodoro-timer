# Zen Browser Pomodoro Focus Blocker Mod - Repository & Installation Structure Guide

**For GitHub Copilot: A comprehensive guide to structuring the Zen mod repository and userChrome files to enable installation via the Sine mod manager.**

---

## Overview

This guide explains how to structure the Zen Pomodoro Focus Blocker mod and its GitHub repository to be discoverable and installable through the **Sine mod manager** - the modern replacement for Zen Mods. The Sine mod manager allows users to install, manage, and update mods directly from Zen Browser's settings interface.

---

## Understanding Sine Mod Manager

### What is Sine?

[Sine](https://github.com/CosmoCreeper/Sine) is a comprehensive mod manager for Zen Browser that provides:

- **One-click mod installation** from GitHub repositories
- **Automatic mod updates** with version checking
- **Unified settings interface** for managing all mods
- **Cross-platform support** (Windows, macOS, Linux)
- **No manual file editing required** for end users

### Installation Methods for Users

Users can install your mod via Sine in two ways:

1. **From Sine's Built-in Marketplace**: If your mod is featured in the official Sine marketplace (curated collection)
2. **From Custom Repository URLs**: Users can paste a direct repository link into Sine's settings and install from there

This guide focuses on enabling both methods.

---

## Part 1: Mod File Structure (userChrome Format)

### What is userChrome?

`chrome.css` and `userChrome.uc.mjs` are Firefox/Zen's browser chrome customization files that:

- Modify the browser UI itself (not web content)
- Run in the privileged browser context
- Allow access to Firefox Services API
- Persist across browser updates when installed via mod managers

### Standard Zen Mod Structure

A minimal Zen mod requires this structure:

```
zen-pomodoro-blocker/
├── chrome.css              # CSS styling for the mod
├── userChrome.uc.mjs       # JavaScript logic for the mod (optional but recommended)
├── theme.json              # Mod metadata (REQUIRED for Zen mod discovery)
└── README.md               # Documentation (displayed in mod manager)
```

### File Descriptions

#### 1. theme.json (CRITICAL FOR ZEN MODS)

The `manifest.json` file is **essential** for Sine mod manager compatibility. This is how Sine identifies, validates, and displays your mod.

**Location**: Root directory of repository

**Minimal Valid manifest.json**:

```json
{
  "manifest_version": 1,
  "name": "Zen Pomodoro Focus Blocker",
  "version": "1.0.0",
  "description": "A productivity mod implementing customizable Pomodoro timer with workspace blocking",
  "author": "[Your GitHub Username]",
  "license": "MPL-2.0",
  "homepage": "https://github.com/[your-username]/zen-pomodoro-blocker",
  "repository": {
    "type": "git",
    "url": "https://github.com/[your-username]/zen-pomodoro-blocker"
  },
  "keywords": ["productivity", "pomodoro", "timer", "focus", "blocker"],
  "icon": "icon.png",
  "screenshot": "screenshot.png"
}
```

**Detailed Field Explanations**:

| Field              | Required | Type    | Description                                                |
| ------------------ | -------- | ------- | ---------------------------------------------------------- |
| `manifest_version` | ✅       | Integer | Must be `1` for Sine compatibility                         |
| `name`             | ✅       | String  | Display name in Sine marketplace (20-50 chars recommended) |
| `version`          | ✅       | String  | Semantic versioning (e.g., "1.0.0", "2.1.3-beta")          |
| `description`      | ✅       | String  | Brief description for marketplace (100-200 chars)          |
| `author`           | ✅       | String  | Your name or GitHub username                               |
| `license`          | ✅       | String  | License type (MPL-2.0, MIT, GPL-3.0, etc.)                 |
| `homepage`         | ⚠️       | String  | URL to project homepage or GitHub repo                     |
| `repository`       | ⚠️       | Object  | Git repository info (used by Sine for updates)             |
| `keywords`         | Optional | Array   | Search tags (5-10 keywords)                                |
| `icon`             | Optional | String  | Path to 512x512 PNG icon (relative to root)                |
| `screenshot`       | Optional | String  | Path to screenshot image for marketplace preview           |
| `compatible_with`  | Optional | String  | Zen version compatibility (e.g., "1.0.0+")                 |

**Example Enhanced manifest.json**:

```json
{
  "manifest_version": 1,
  "name": "Zen Pomodoro Focus Blocker",
  "version": "1.2.0",
  "description": "Customize Pomodoro timers and block distracting workspaces during focus periods",
  "author": "CosmoCreeper",
  "license": "MPL-2.0",
  "homepage": "https://github.com/CosmoCreeper/zen-pomodoro-blocker",
  "repository": {
    "type": "git",
    "url": "https://github.com/CosmoCreeper/zen-pomodoro-blocker.git"
  },
  "keywords": [
    "productivity",
    "pomodoro",
    "timer",
    "focus",
    "workspace-blocker",
    "fullscreen-overlay",
    "anti-procrastination"
  ],
  "icon": "assets/icon.png",
  "screenshot": "assets/screenshot.png",
  "compatible_with": "1.0.0+",
  "update_url": "https://raw.githubusercontent.com/CosmoCreeper/zen-pomodoro-blocker/main/manifest.json"
}
```

#### 2. chrome.css

The CSS file that styles the timer overlay, buttons, and UI modifications.

**Key Requirements**:

- Must work standalone (no external dependencies)
- CSS variables for theming
- No imports of external stylesheets
- High z-index for overlay (9999+)
- Responsive design for different screen sizes

**File Structure**:

```css
/* Root CSS Variables */
:root {
  --pomodoro-overlay-bg: #808080;
  --pomodoro-overlay-opacity: 0.95;
  --pomodoro-text-color: #ffffff;
  --pomodoro-timer-font-size: 96px;
  --pomodoro-focus-color: #2180cd;
  --pomodoro-break-color: #2ec491;
  --pomodoro-z-index: 9999;
}

/* Main Overlay Styles */
#zen-pomodoro-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--pomodoro-overlay-bg);
  opacity: var(--pomodoro-overlay-opacity);
  z-index: var(--pomodoro-z-index);
  pointer-events: all;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Additional styles... */
```

#### 3. userChrome.uc.mjs

JavaScript file containing the mod's logic. This is where the timer engine, workspace detection, and overlay management live.

**Requirements for Zen Mod Installation**:

- Must use ES module syntax
- Must be self-contained (all dependencies bundled)
- Access Firefox Services API via `Services.prefs`
- No `localStorage` or `sessionStorage` (blocked in chrome context)

**File Structure**:

```javascript
/**
 * Zen Pomodoro Focus Blocker Mod
 * @version 1.0.0
 */

// Module initialization
(() => {
  'use strict';

  // Timer Engine Module
  class PomodoroTimer {
    constructor() {
      this.isActive = false;
      this.remainingTime = 0;
      // ... more implementation
    }
  }

  // Workspace Detector Module
  class WorkspaceDetector {
    constructor() {
      this.activeWorkspace = null;
      // ... more implementation
    }
  }

  // Overlay Manager Module
  class OverlayManager {
    constructor() {
      // ... more implementation
    }
  }

  // Initialize mod
  const timer = new PomodoroTimer();
  const workspace = new WorkspaceDetector();
  const overlay = new OverlayManager();

  // Export for testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PomodoroTimer, WorkspaceDetector, OverlayManager };
  }
})();
```

#### 4. README.md

Markdown documentation displayed in Sine's mod details page.

**Required Sections**:

```markdown
# Zen Pomodoro Focus Blocker

Brief one-liner description

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

### Via Sine Mod Manager (Recommended)

1. Open Zen Browser Settings → Sine Mods
2. Paste this URL: https://github.com/[username]/zen-pomodoro-blocker
3. Click Install

### Manual Installation

[Instructions for users without Sine]

## Usage

How to use the mod once installed

## Configuration

How to customize settings

## Troubleshooting

Common issues and solutions

## License

MPL-2.0

## Support

Links to issues, discussions, etc.
```

#### 5. Optional: icon.png and screenshot.png

**icon.png** (512x512 PNG):

- Displayed in Sine marketplace
- Should represent mod functionality (timer icon, etc.)
- Place in `assets/` subdirectory

**screenshot.png** (1200x675 or similar):

- Preview image shown in Sine details
- Should show the mod in action
- Place in `assets/` subdirectory

### Optional: Additional Files

For more complex mods, you may include:

```
zen-pomodoro-blocker/
├── assets/
│   ├── icon.png              # Marketplace icon (512x512)
│   ├── screenshot.png        # Preview screenshot
│   ├── icon-disabled.png     # Disabled state icon (optional)
│   └── logo.svg              # Vector logo (optional)
├── docs/
│   ├── CONFIGURATION.md      # Advanced settings guide
│   ├── USAGE.md              # Detailed usage instructions
│   └── TROUBLESHOOTING.md    # FAQ and common issues
├── locales/                  # Localization files (optional)
│   ├── en/
│   └── de/
├── .github/
│   ├── workflows/            # CI/CD workflows (optional)
│   └── ISSUE_TEMPLATE.md     # Issue template
├── chrome.css
├── userChrome.uc.mjs
├── theme.json
├── README.md
├── LICENSE                   # Full license text
└── .gitignore
```

---

## Part 2: GitHub Repository Structure

### Repository Naming Convention

**Recommended Format**: `zen-[mod-name]`

**Examples**:

- `zen-pomodoro-blocker`
- `zen-nebula-theme`
- `zen-keyboard-shortcuts`

### Repository Setup

#### Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Choose repository name: `zen-pomodoro-blocker`
3. Set to **Public** (required for Sine discovery)
4. Add description: "A productivity mod implementing Pomodoro timer with workspace blocking"
5. Add `.gitignore` for Node.js (if using dev tools)
6. Choose license: **MPL-2.0** (Mozilla Public License)
7. Click "Create Repository"

#### Step 2: Root Directory Structure

Minimum repository structure for Zen mods:

```
zen-pomodoro-blocker/
├── chrome.css
├── userChrome.uc.mjs
├── theme.json
├── README.md
├── LICENSE
└── .gitignore
```

#### Step 3: Enhanced Repository Structure (Recommended)

For better maintenance and discoverability:

```
zen-pomodoro-blocker/
├── .github/
│   ├── workflows/
│   │   ├── lint.yml              # Linting CI/CD
│   │   └── release.yml           # Auto-release on tag
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── SECURITY.md               # Security policy
├── assets/
│   ├── icon.png                  # 512x512 marketplace icon
│   ├── screenshot.png            # 1200x675 preview
│   ├── icon-dark.png            # Dark mode variant
│   └── banner.png               # GitHub header banner
├── docs/
│   ├── CONFIGURATION.md          # Advanced settings
│   ├── USAGE.md                  # Detailed guide
│   ├── TROUBLESHOOTING.md        # FAQ
│   ├── ARCHITECTURE.md           # Technical overview
│   └── DEVELOPMENT.md            # For contributors
├── src/
│   ├── userChrome.uc.mjs         # Main logic
│   ├── chrome.css                # Styling
│   └── index.d.ts                # TypeScript definitions (optional)
├── tests/
│   ├── timer.test.js
│   ├── workspace.test.js
│   └── overlay.test.js
├── package.json                  # Dev dependencies and scripts
├── tsconfig.json                 # TypeScript config (if using TS)
├── .eslintrc.cjs                 # ESLint config
├── .stylelintrc.json             # Stylelint config
├── chrome.css                    # Symlink or copy to root
├── userChrome.uc.mjs             # Symlink or copy to root
├── theme.json                    # Root level (required by Zen)
├── README.md
├── CHANGELOG.md
├── LICENSE
├── CODE_OF_CONDUCT.md
└── .gitignore
```

**Important**: `theme.json`, `chrome.css`, and `userChrome.uc.mjs` **must be in the root directory** for Zen mod manager to find them.

#### Step 4: Key Configuration Files

**.gitignore**:

```
# Node.js
node_modules/
package-lock.json
pnpm-lock.yaml
*.tgz
dist/
build/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
```

**LICENSE**:

```
Mozilla Public License Version 2.0
==================================

[Full MPL 2.0 license text]
```

For the full license text, see: [mozilla.org/MPL/2.0](https://www.mozilla.org/en-US/MPL/2.0/)

#### Step 5: GitHub Settings Configuration

**In Repository Settings**:

1. **General**:
   - Check "Discussions" (for user feedback)
   - Check "Issues" (for bug reports)

2. **Branch Protection Rules** (optional but recommended):
   - Create rule for `main` branch
   - Require pull request reviews
   - Require status checks to pass

3. **Actions**:
   - Enable GitHub Actions (for CI/CD)

4. **Pages** (optional):
   - Enable GitHub Pages
   - Set source to `main` branch
   - (Can host documentation here)

---

## Part 3: Version Management & Releases

### Semantic Versioning

Follow semantic versioning format: `MAJOR.MINOR.PATCH`

**Examples**:

- `1.0.0` - Initial release
- `1.1.0` - Minor feature addition
- `1.1.1` - Bug fix
- `2.0.0` - Major breaking change

### Creating Releases for Sine

Sine uses GitHub Releases to check for updates. Every new mod version should have a corresponding release.

#### Manual Release Process

1. **Update version in `manifest.json`**:

   ```json
   {
     "version": "1.1.0"
   }
   ```

2. **Update `CHANGELOG.md`**:

   ```markdown
   ## [1.1.0] - 2025-01-15

   ### Added

   - Hold-to-start button feature
   - Custom notification sounds

   ### Fixed

   - Overlay not responding on sidebar collapse
   - Settings not persisting on browser restart

   ### Changed

   - Increased default timer font size to 100px
   ```

3. **Commit changes**:

   ```bash
   git add manifest.json CHANGELOG.md
   git commit -m "Release v1.1.0: Add hold-to-start and custom sounds"
   ```

4. **Create Git tag**:

   ```bash
   git tag v1.1.0
   git push origin main
   git push origin v1.1.0
   ```

5. **Create GitHub Release**:
   - Go to repository → Releases → Draft a new release
   - Tag: `v1.1.0`
   - Title: `Release v1.1.0`
   - Description: Copy from CHANGELOG
   - Click "Publish release"

#### Automated Release Process (GitHub Actions)

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: |
            See CHANGELOG.md for details
          draft: false
          prerelease: false
```

### Update URL in manifest.json

Sine checks this URL for updates:

```json
{
  "update_url": "https://raw.githubusercontent.com/[username]/zen-pomodoro-blocker/main/manifest.json"
}
```

This points to the `manifest.json` file in your main branch. When the version in this file changes, Sine notifies users of available updates.

---

## Part 4: Sine Installation Flow (How Users Install Your Mod)

### Method 1: From Sine Marketplace (Manual Testing)

**User Experience**:

1. User opens Zen Browser Settings → Sine Mods → Marketplace
2. User searches for "Pomodoro" or your mod name
3. Mod appears with icon, description, and screenshot
4. User clicks "Install"
5. Sine clones repository from GitHub
6. Files are copied to Zen's chrome directory
7. Browser restarts automatically
8. Mod is now active

**For Your Mod to Appear**:

- Submit to Sine marketplace (contact Sine maintainers)
- Make sure `manifest.json` is valid
- Ensure repository is public

### Method 2: Direct URL Installation (Recommended for Beta/Testing)

**User Experience**:

1. User opens Zen Browser Settings → Sine Mods
2. User finds input field for "Install from Repository URL"
3. User pastes: `https://github.com/[username]/zen-pomodoro-blocker`
4. User clicks "Install"
5. Same installation process as above

**Testing Your Mod**:

You can test this immediately with your own repository URL, no marketplace submission needed.

### Automatic Updates via Sine

Once installed, users can enable automatic updates in Sine settings:

1. Sine periodically checks your `manifest.json`
2. Compares version in manifest with installed version
3. If newer version found, notifies user
4. User clicks "Update" button
5. Sine re-clones and updates files

---

## Part 5: manifest.json Validation

### Sine's Validation Requirements

For your mod to be recognized and installable by Sine:

| Requirement                       | Status         | Notes                                  |
| --------------------------------- | -------------- | -------------------------------------- |
| `manifest.json` in root directory | ✅ REQUIRED    | Must be valid JSON                     |
| Valid `manifest_version: 1`       | ✅ REQUIRED    | Integer value 1                        |
| `name` field                      | ✅ REQUIRED    | String, 20-50 chars                    |
| `version` field                   | ✅ REQUIRED    | Semantic version (e.g., "1.0.0")       |
| `description` field               | ✅ REQUIRED    | String, 100-200 chars                  |
| `author` field                    | ✅ REQUIRED    | Your name/username                     |
| `license` field                   | ✅ REQUIRED    | Standard license identifier            |
| `chrome.css` file                 | ✅ REQUIRED    | In root directory                      |
| `userChrome.uc.mjs` or similar    | ⚠️ OPTIONAL    | JavaScript logic file                  |
| `README.md` file                  | ⚠️ RECOMMENDED | Displayed in mod manager               |
| `icon.png` file                   | ⚠️ RECOMMENDED | 512x512 PNG image                      |
| Repository is public              | ✅ REQUIRED    | Mod manager cannot clone private repos |
| Valid JSON syntax                 | ✅ REQUIRED    | Use JSON validator to check            |

### Validate Your theme.json

Use online JSON validator: [jsonlint.com](https://www.jsonlint.com/)

Or use command line:

```bash
npm install -g jsonlint
jsonlint theme.json
```

Expected output if valid:

```
✓ theme.json is valid JSON
```

---

## Part 6: Distribution Channels

### Primary: GitHub Repository

- **URL**: `https://github.com/[username]/zen-pomodoro-blocker`
- **Installation**: Paste URL into mod manager
- **Advantages**: Direct control, automatic updates via theme.json

### Secondary: Zen Browser Mods Marketplace

- **URL**: [zen-browser.app/mods](https://zen-browser.app/mods/)
- **Installation**: Browse and install from Zen settings
- **Requirement**: Submit mod for review
- **Advantages**: Increased discoverability

### Tertiary: Sine Official Marketplace

- **Contact**: Sine GitHub issues/discussions
- **Installation**: Browse Sine's built-in marketplace
- **Requirement**: Mod review and approval
- **Advantages**: Maximum visibility, trusted repository

---

## Part 7: Pre-Release Setup Checklist

Before publishing your mod:

### Mod Files

- [ ] `chrome.css` created and styled
- [ ] `userChrome.uc.mjs` with all logic implemented
- [ ] No `console.error()` or debug statements in production code
- [ ] All CSS properties use valid syntax
- [ ] Overlay blocks all pointer events correctly
- [ ] Timer updates accurately to system clock

### Repository Structure

- [ ] All files in root directory (theme.json, chrome.css, userChrome.uc.mjs)
- [ ] `theme.json` valid and complete
- [ ] `README.md` with installation instructions
- [ ] `LICENSE` file (MPL-2.0 recommended)
- [ ] `.gitignore` configured
- [ ] Repository is **public**

### Documentation

- [ ] README explains features clearly
- [ ] Installation instructions included (mod manager URL method)
- [ ] Configuration/settings explained
- [ ] Troubleshooting section present
- [ ] Links to GitHub issues for support

### Testing

- [ ] Mod installs via mod manager URL method without errors
- [ ] Browser doesn't crash after installation
- [ ] CSS applies correctly without visual glitches
- [ ] Timer functionality works accurately
- [ ] All user-configurable options function properly

### Publishing

- [ ] Commit and push to GitHub
- [ ] Create GitHub Release with v1.0.0 tag
- [ ] Update URLs in theme.json if needed
- [ ] Test installation from repository URL
- [ ] Optionally submit to Zen mods marketplace

---

## Part 8: Post-Release Maintenance

### Update Process

When releasing a new version:

1. **Increment version** in `theme.json`
2. **Update CHANGELOG.md** with changes
3. **Commit changes**: `git commit -m "v1.1.0: Add features"`
4. **Create tag**: `git tag v1.1.0`
5. **Push**: `git push origin main --tags`
6. **Create release** on GitHub with release notes

### User Communication

When releasing updates:

- Post release notes in GitHub Discussions
- Explain breaking changes clearly
- Provide migration guide if needed
- Link to issue tracker for bug reports

### Monitoring

Track:

- GitHub stars (popularity)
- Issues/discussions (user feedback)
- Download statistics (engagement)
- Bug reports (quality feedback)

---

## Part 9: Example Files

### Complete manifest.json Example

```json
{
  "manifest_version": 1,
  "name": "Zen Pomodoro Focus Blocker",
  "version": "1.0.0",
  "description": "A productivity mod implementing customizable Pomodoro timer with workspace blocking to enhance focus and prevent distractions",
  "author": "CosmoCreeper",
  "license": "MPL-2.0",
  "homepage": "https://github.com/CosmoCreeper/zen-pomodoro-blocker",
  "repository": {
    "type": "git",
    "url": "https://github.com/CosmoCreeper/zen-pomodoro-blocker.git"
  },
  "update_url": "https://raw.githubusercontent.com/CosmoCreeper/zen-pomodoro-blocker/main/manifest.json",
  "keywords": [
    "productivity",
    "pomodoro",
    "timer",
    "focus",
    "blocker",
    "workspace",
    "time-management"
  ],
  "icon": "assets/icon.png",
  "screenshot": "assets/screenshot.png",
  "compatible_with": "1.0.0+",
  "donation_url": "https://github.com/sponsors/CosmoCreeper"
}
```

### Complete README.md Example

```markdown
# Zen Pomodoro Focus Blocker

Transform Zen Browser into a productivity powerhouse with customizable Pomodoro timers and workspace blocking.

## Features

- ⏱️ **Flexible Timer Modes**: Simple timer or traditional Pomodoro cycles
- 🚫 **Workspace Blocking**: Block specific workspaces during focus sessions
- ⚙️ **Highly Customizable**: Configure durations, colors, messages, and security
- 🔒 **Anti-Cheating Security**: Prevent settings changes during active timers
- 📱 **Responsive Overlay**: Adapts to sidebar collapse and extension sidebars
- 🎨 **Theme Support**: Works with Zen's light/dark modes

## Installation

### Via Sine Mod Manager (Recommended)

1. Open Zen Browser
2. Go to Settings → Sine Mods → Install from Repository
3. Paste: `https://github.com/CosmoCreeper/zen-pomodoro-blocker`
4. Click "Install"
5. Browser will restart automatically

### Via Zen Mods Marketplace

1. Go to Settings → Zen Mods → Visit Store
2. Search for "Pomodoro Focus Blocker"
3. Click "Install Theme"

### Manual Installation

1. Clone this repository
2. Copy `chrome.css` to your Zen profile `chrome` folder
3. Copy `userChrome.uc.mjs` to your Zen profile `chrome/JS` folder
4. Restart Zen Browser

## Usage

### Starting a Timer

1. Right-click on sidebar or workspace button
2. Select "Start Pomodoro Timer"
3. Choose timer mode (Simple or Pomodoro)
4. Timer will start automatically

### Configuring Settings

1. Open Zen Settings → Sine Mods → Zen Pomodoro Blocker
2. Customize:
   - Timer durations (focus, break, long break)
   - Overlay colors
   - Security features
   - Which workspaces to block

## Configuration

### Timer Durations

- **Focus Period**: Default 25 minutes (customizable 5-120 minutes)
- **Break Period**: Default 5 minutes (customizable 1-30 minutes)
- **Long Break**: Default 15 minutes (customizable 5-60 minutes)
- **Long Break Interval**: Default every 4 cycles

### Security Options

- **Settings Lock (Idle)**: Wait timer required to access settings when no timer active
- **Settings Lock (Active)**: Code entry required during active timer
- **Hold-to-Start**: Must hold button for N seconds to start timer

## Troubleshooting

### Overlay Not Showing

- Clear Zen startup cache: `about:support` → Clear Startup Cache
- Restart Zen Browser
- Ensure workspace is marked as "blocked" in settings

### Timer Not Accurate

- Check system clock is correct
- Ensure no other processes are consuming excessive CPU
- Report issue on GitHub

### Settings Lock Not Working

- Verify code entry is enabled in settings
- Try clearing startup cache and restarting

## Known Limitations

- Blocks only within Zen Browser (not system-wide)
- Users with developer tools access could bypass overlay
- One timer per window

## License

Mozilla Public License 2.0 - See LICENSE file for details

## Support

- 📝 Report bugs: [GitHub Issues](https://github.com/CosmoCreeper/zen-pomodoro-blocker/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/CosmoCreeper/zen-pomodoro-blocker/discussions)
- 🌐 Official Zen Mods: [zen-browser.app/mods](https://zen-browser.app/mods/)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

Built with ❤️ for Zen Browser
```

---

## Part 10: Troubleshooting Mod Installation

### Issue: Mod Not Found by Mod Manager

**Symptoms**: Mod manager says "Repository not found" or "Invalid manifest"

**Solutions**:

1. Verify repository is **public** (Settings → Visibility)
2. Check `theme.json` is valid JSON (use jsonlint.com)
3. Ensure `theme.json` is in **root directory** (not in subdirectory)
4. Verify `chrome.css` or `userChrome.uc.mjs` exists in root
5. Check repository URL is correct: `https://github.com/[username]/[repo]`

### Issue: Mod Installs but Doesn't Work

**Symptoms**: Files copied but mod doesn't load in Zen

**Solutions**:

1. Clear Zen startup cache: `about:support` → Clear Startup Cache
2. Restart Zen Browser completely
3. Check for syntax errors in `userChrome.uc.mjs` (use Firefox console)
4. Verify no `console.error()` blocking initialization
5. Check file permissions are correct

### Issue: Mod Manager Can't Update Mod

**Symptoms**: "Update failed" in mod manager settings

**Solutions**:

1. Verify URLs in theme.json are correct
2. Check GitHub repository is still public
3. Verify version in theme.json has been incremented for new release
4. Clear Zen cache and restart
5. Try reinstalling mod

### Issue: Old Version Still Active After Update

**Symptoms**: Updated mod but old features still present

**Solutions**:

1. Clear Zen startup cache
2. Clear browser cache (Settings → Clear Recent History)
3. Restart Zen Browser completely
4. Check for cached files in profile chrome directory
5. Use Firefox DevTools to verify loaded version

---

## Summary: Complete Workflow

### For Developers Creating the Mod

1. **Create repository** on GitHub with public visibility
2. **Structure files** correctly (theme.json, chrome.css, userChrome.uc.mjs in root)
3. **Write comprehensive theme.json** with all required fields
4. **Create README.md** with clear installation instructions
5. **Test installation** via mod manager URL method
6. **Create GitHub Release** with semantic version tag
7. **Announce** on Zen Reddit/Discord communities
8. **(Optional) Submit** to Zen mods marketplace for more visibility

### For Users Installing the Mod

1. **Install mod manager** (like Sine) from CosmoCreeper/Sine GitHub
2. **Open Zen Settings** → Sine Mods
3. **Paste repository URL** into "Install from Repository" field
4. **Click Install** and wait for completion
5. **Restart browser** when prompted
6. **Configure mod** in settings
7. **Enable automatic updates** in Sine settings

---

## Additional Resources

- [Sine GitHub Repository](https://github.com/CosmoCreeper/Sine)
- [Sine Installation Wiki](https://github.com/CosmoCreeper/Sine/wiki/Installation)
- [Zen Browser Mods](https://zen-browser.app/mods/)
- [Zen Browser Documentation](https://docs.zen-browser.app/)
- [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
- [Semantic Versioning](https://semver.org/)

---

This comprehensive guide ensures your Zen Pomodoro mod is properly structured for discovery and installation via Sine, with clear instructions for both developers and users.
