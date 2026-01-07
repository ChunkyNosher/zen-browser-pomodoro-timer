# Zen Browser Pomodoro Focus Blocker Mod - Development Dependencies & Tools Guide

**For GitHub Copilot: A comprehensive guide to all recommended dependencies, development tools, and their configurations for building a professional-grade Zen Browser mod.**

---

## Overview

This guide covers all dependencies and tools recommended for developing the Zen Pomodoro Focus Blocker mod. The goal is to provide a development environment that ensures code quality, maintainability, testing capability, and smooth development workflow.

---

## Core Development Stack

### Base Requirements

Before installing any dependencies, ensure you have the following installed on your system:

**System-Level Tools:**
- **Git**: Version control (required for managing source code and version history)
- **Node.js 21+**: JavaScript runtime (Zen Browser's official build requirement)
- **npm** or **pnpm**: Node package manager (pnpm recommended for faster installations and better disk efficiency)

**Recommended Versions:**
- Node.js: 21.0.0 or higher (latest LTS recommended)
- npm: 10.0.0 or higher
- pnpm: 9.0.0 or higher (if using pnpm)

**Installation Commands:**

```bash
# Node.js includes npm by default
# Download from https://nodejs.org/

# Install pnpm globally (optional but recommended)
npm install -g pnpm

# Verify installations
node --version
npm --version
pnpm --version
```

---

## Project Dependencies

### Development Dependencies (devDependencies)

These tools are used during development and testing but not included in the final mod package.

#### 1. Linting Tools

**Purpose**: Ensure code quality, consistency, and adherence to best practices.

**ESLint** - JavaScript linting
- **Package**: `eslint`
- **Version**: Latest (^8.50.0)
- **Why**: Industry-standard JavaScript linter; catches errors and enforces code style
- **Installation**: `npm install --save-dev eslint`
- **Configuration**: `.eslintrc.json` or `.eslintrc.cjs`
- **Key Rules for Zen Mods**:
  - No use of localStorage/sessionStorage (blocked in browser chrome context)
  - Proper error handling for Services.prefs API calls
  - ES6 syntax validation (arrow functions, const/let, template literals)

**Recommended ESLint Plugins**:
- `eslint-plugin-no-unsanitized` - Prevent DOM sanitization issues
- `eslint-plugin-mozilla` - Mozilla-specific JavaScript patterns (Services, ChromeUtils, etc.)

**Stylelint** - CSS linting
- **Package**: `stylelint`
- **Version**: Latest (^16.0.0)
- **Why**: Ensures CSS code quality and consistency
- **Installation**: `npm install --save-dev stylelint stylelint-config-standard`
- **Configuration**: `.stylelintrc.json`
- **Key Rules for Zen Mods**:
  - Validate CSS properties and values
  - Ensure cross-browser compatibility (especially for overlay properties)
  - Check for vendor prefix consistency
  - Validate z-index values and layering logic

**Recommended Stylelint Plugins**:
- `stylelint-config-standard` - Base configuration with sensible defaults
- `stylelint-order` - Enforce property ordering in CSS rules

#### 2. Code Formatting Tools

**Prettier** - Code formatter
- **Package**: `prettier`
- **Version**: Latest (^3.0.0)
- **Why**: Automatic code formatting ensures consistent style across entire codebase
- **Installation**: `npm install --save-dev prettier`
- **Configuration**: `.prettierrc.json` or `.prettierrc.cjs`
- **Integration**: Use with ESLint and Stylelint to avoid conflicts
- **Key Settings for This Project**:
  - Print width: 100-120 characters
  - Tab width: 2 spaces (matches Zen Browser standards)
  - Use semicolons: true
  - Single quotes: true for JavaScript, false for HTML/XML

**Recommended Setup**:
```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "arrowParens": "always"
}
```

#### 3. Testing Frameworks

**Vitest** - Modern JavaScript testing framework
- **Package**: `vitest`
- **Version**: Latest (^1.0.0)
- **Why**: Modern, fast testing framework with Jest-compatible API; uses Vite for speed
- **Installation**: `npm install --save-dev vitest @vitest/ui`
- **Configuration**: `vitest.config.ts` or included in `vite.config.ts`
- **Key Advantages**:
  - 10-20x faster than Jest in watch mode
  - Native ESM support
  - Hot module reloading for tests
  - Browser UI for debugging
- **Test Types to Implement**:
  - Unit tests for timer logic (countdown accuracy)
  - Integration tests for workspace detection
  - DOM tests for overlay rendering and responsiveness
  - Settings persistence tests with Services.prefs mock

**Alternative: Jest** (if not using Vite)
- **Package**: `jest`
- **Version**: Latest (^29.0.0)
- **Why**: Established testing framework with extensive documentation
- **Note**: Slower than Vitest but more widely used and documented
- **When to Use**: If your project doesn't use Vite for bundling

**Testing Utilities**:
- `@testing-library/dom` - DOM testing utilities (querySelectors, fireEvents)
- `@testing-library/jest-dom` - Useful DOM assertions
- `vitest-browser-vue` or similar - Browser-mode testing for UI components
- `jsdom` or `happy-dom` - DOM implementation for testing

**Mock Libraries**:
- `sinon` - Spying, stubbing, and mocking library
- `nock` - HTTP mocking for API calls
- `jest-mock-extended` - Enhanced mocking capabilities

#### 4. Bundling and Build Tools

**Vite** - Next-generation frontend build tool
- **Package**: `vite`
- **Version**: Latest (^5.0.0)
- **Why**: Extremely fast build tool; Zen Browser-compatible; used by Firefox projects
- **Installation**: `npm install --save-dev vite`
- **Configuration**: `vite.config.ts` or `vite.config.js`
- **Key Capabilities**:
  - Pre-bundling for optimization
  - CSS processing and minification
  - Source maps for debugging
  - Plugin system for extensibility

**Rollup** - Bundler for libraries and extensions
- **Package**: `rollup`
- **Version**: Latest (^4.0.0)
- **Why**: Powers Vite; specifically good for Firefox extension bundling
- **Installation**: Usually installed as dependency of Vite
- **Key Rollup Plugins for This Project**:
  - `@rollup/plugin-commonjs` - Handle CommonJS modules
  - `@rollup/plugin-node-resolve` - Resolve node_modules imports
  - `rollup-plugin-terser` - Minify JavaScript output
  - `postcss` + `cssnano` - Minify CSS

**esbuild** - JavaScript bundler
- **Package**: `esbuild`
- **Version**: Latest (^0.19.0)
- **Why**: Used by Vite under the hood; extremely fast transpilation
- **Installation**: Usually handled by Vite
- **Use Case**: May need direct access for custom build scripts

#### 5. Development Server and Hot Reload

**Vite Dev Server** (included with Vite)
- **Capabilities**:
  - Hot Module Replacement (HMR)
  - Instant feedback on file changes
  - No page reloads needed during development
  - Built-in CSS hot reload

**Firefox Developer Edition** (runtime)
- **Purpose**: Debugging Zen mod during development
- **Installation**: Download from mozilla.org
- **Key Features for Mod Development**:
  - Browser DevTools (Inspector, Console, Debugger)
  - about:debugging for mod installation
  - WebExtension developer tools
  - Performance profiling

#### 6. Type Checking (Optional but Recommended)

**TypeScript** - Static type checking for JavaScript
- **Package**: `typescript`
- **Version**: Latest (^5.0.0)
- **Why**: Catch type errors before runtime; better IDE support; self-documenting code
- **Installation**: `npm install --save-dev typescript`
- **Configuration**: `tsconfig.json`
- **Usage in This Project**:
  - Add type definitions for Firefox Services API
  - Type-safe workspace and timer management
  - Better IDE autocomplete
- **Create Type Definitions File**:
  - `types/firefox.d.ts` - Type definitions for Services, ChromeUtils
  - `types/zen.d.ts` - Type definitions for Zen-specific APIs

**Recommended tsconfig.json Settings**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  }
}
```

#### 7. Pre-commit Hooks

**husky** - Git hooks manager
- **Package**: `husky`
- **Version**: Latest (^8.0.0)
- **Why**: Run linting and tests before commits; prevent bad code from being committed
- **Installation**: `npm install husky --save-dev && npx husky install`
- **Setup**: Creates `.husky/` directory with hook scripts
- **Use Cases**:
  - `pre-commit`: Run ESLint and Stylelint
  - `pre-push`: Run tests before pushing

**lint-staged** - Run linters on staged files only
- **Package**: `lint-staged`
- **Version**: Latest (^15.0.0)
- **Why**: Only lint files that are about to be committed (faster feedback)
- **Installation**: `npm install --save-dev lint-staged`
- **Configuration**: Add to `package.json`:
  ```json
  {
    "lint-staged": {
      "*.{js,cjs,mjs}": "eslint --fix",
      "*.css": "stylelint --fix",
      "**/*.{js,css}": "prettier --write"
    }
  }
  ```

#### 8. Documentation Tools

**JSDoc** - JavaScript documentation generator
- **Package**: `jsdoc`
- **Version**: Latest (^4.0.0)
- **Why**: Generate API documentation from code comments
- **Installation**: `npm install --save-dev jsdoc`
- **Configuration**: `jsdoc.json`
- **Use Cases**:
  - Document module exports
  - Document public APIs
  - Generate HTML documentation

**TypeDoc** (if using TypeScript)
- **Package**: `typedoc`
- **Version**: Latest (^0.25.0)
- **Why**: Better documentation for TypeScript code
- **Installation**: `npm install --save-dev typedoc`

#### 9. Debugging Tools

**Firefox DevTools Remote Debugging** (built-in)
- **Purpose**: Debug mod code running in Firefox
- **Access**: `about:debugging` → This Firefox → Enable/Manage Extensions
- **Key Features**:
  - Console for logging
  - Debugger for stepping through code
  - Inspector for DOM inspection
  - Network for timing analysis

**Browser Toolbox** (Firefox chrome debugging)
- **Purpose**: Debug browser chrome UI (not web content)
- **Enable**: Set `devtools.chrome.enabled` to true in `about:config`
- **Access**: Ctrl+Alt+Shift+I in Firefox
- **Use**: Debug userChrome.cjs directly in Firefox context

#### 10. Build Optimization

**terser** - JavaScript minifier
- **Package**: `terser`
- **Version**: Latest (^5.20.0)
- **Why**: Minify JavaScript for production builds
- **Installation**: Usually handled by Rollup
- **Key Options**:
  - Preserve function names for debugging
  - Remove console statements in production
  - Compress but maintain readability comments

**cssnano** - CSS minifier
- **Package**: `cssnano`
- **Version**: Latest (^6.0.0)
- **Why**: Minimize CSS file size
- **Installation**: `npm install --save-dev cssnano postcss`
- **Integration**: Use with PostCSS

**PostCSS** - CSS transformation tool
- **Package**: `postcss`
- **Version**: Latest (^8.4.0)
- **Why**: Enable modern CSS features and vendor prefixing
- **Installation**: `npm install --save-dev postcss autoprefixer`
- **Configuration**: `postcss.config.js`
- **Key Plugins**:
  - `autoprefixer` - Add vendor prefixes
  - `postcss-nested` - Support nested CSS syntax

---

## Runtime Dependencies

### Minimal Runtime Dependencies (for final mod)

Zen mods should have **minimal or zero** external runtime dependencies because they run in the browser chrome context without access to npm packages.

**Possible Runtime Dependencies** (rarely needed):
- Custom utility libraries (if bundled)
- Browser polyfills (if targeting older Firefox versions)

**Note**: Most functionality should be built using Firefox Services and native DOM APIs.

---

## Development Environment Configuration

### package.json Structure

Recommended `package.json` organization:

```json
{
  "name": "zen-pomodoro-blocker",
  "version": "1.0.0",
  "description": "A productivity mod implementing Pomodoro timer with workspace blocking",
  "type": "module",
  "main": "userChrome.cjs",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint . && stylelint '**/*.css'",
    "lint:fix": "eslint --fix . && stylelint --fix '**/*.css' && prettier --write .",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
    "docs": "jsdoc -c jsdoc.json",
    "prepare": "husky install"
  },
  "devDependencies": {
    "@eslint/js": "^8.56.0",
    "@testing-library/dom": "^9.3.4",
    "@testing-library/jest-dom": "^6.1.5",
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "@typescript-eslint/parser": "^6.13.0",
    "@vitest/ui": "^1.0.0",
    "autoprefixer": "^10.4.16",
    "cssnano": "^6.0.1",
    "eslint": "^8.54.0",
    "eslint-plugin-mozilla": "^1.2.0",
    "eslint-plugin-no-unsanitized": "^4.0.2",
    "happy-dom": "^12.10.3",
    "husky": "^8.0.3",
    "jsdoc": "^4.0.2",
    "lint-staged": "^15.2.0",
    "postcss": "^8.4.32",
    "prettier": "^3.1.0",
    "rollup": "^4.5.0",
    "rollup-plugin-terser": "^7.0.3",
    "stylelint": "^16.0.0",
    "stylelint-config-standard": "^35.0.0",
    "stylelint-order": "^6.0.0",
    "typescript": "^5.3.2",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "keywords": ["zen-browser", "pomodoro", "productivity", "focus", "timer"],
  "author": "[Your Name]",
  "license": "MPL-2.0"
}
```

---

## Configuration Files

### .eslintrc.cjs (ESLint Configuration)

Location: Root directory

Key configurations:
- ES2020 target (modern JavaScript)
- Browser and Node.js environments
- Mozilla extension rules enabled
- Strict error reporting

### .stylelintrc.json (Stylelint Configuration)

Location: Root directory

Key configurations:
- Standard CSS rules
- Property ordering rules
- No vendor prefix enforcement (handled by Autoprefixer)
- Custom rules for Zen mod CSS patterns

### .prettierrc.json (Prettier Configuration)

Location: Root directory

Key configurations:
- 100-character line width
- 2-space indentation
- Semicolons enabled
- Single quotes for JS

### vite.config.ts (Vite Configuration)

Location: Root directory

Key settings:
- Entry point: `src/userChrome.cjs`
- CSS processing with PostCSS
- Build output directory: `dist/`
- Minification enabled for production
- Source maps for debugging

### vitest.config.ts (Vitest Configuration)

Location: Root directory

Key settings:
- DOM environment (happy-dom)
- Coverage reporting enabled
- Browser UI enabled for debugging
- Test file patterns: `**/*.test.js`

### tsconfig.json (TypeScript Configuration)

Location: Root directory

Key settings:
- ES2020 target
- Strict type checking
- DOM and ES2020 libraries
- JSX support (if needed)

---

## Installation Instructions for Copilot

### Step 1: Initialize Project

```bash
# Create project directory
mkdir zen-pomodoro-blocker
cd zen-pomodoro-blocker

# Initialize Node.js project
npm init -y

# or with pnpm
pnpm init
```

### Step 2: Install All Dependencies

```bash
# Using npm
npm install --save-dev eslint stylelint prettier typescript vite vitest @vitest/ui eslint-plugin-mozilla eslint-plugin-no-unsanitized stylelint-config-standard stylelint-order postcss autoprefixer cssnano rollup husky lint-staged jsdoc

# or using pnpm (faster)
pnpm add -D eslint stylelint prettier typescript vite vitest @vitest/ui eslint-plugin-mozilla eslint-plugin-no-unsanitized stylelint-config-standard stylelint-order postcss autoprefixer cssnano rollup husky lint-staged jsdoc
```

### Step 3: Set Up Git Hooks

```bash
# Initialize husky
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit 'npm run lint:fix && npm run test'

# Add pre-push hook
npx husky add .husky/pre-push 'npm run test'
```

### Step 4: Create Configuration Files

Create each configuration file in the root directory with the settings specified above.

### Step 5: Create Directory Structure

```
zen-pomodoro-blocker/
├── src/
│   ├── userChrome.cjs      (Main mod logic)
│   ├── userChrome.css      (Mod styling)
│   └── index.ts            (TypeScript entry, if using TS)
├── tests/
│   ├── timer.test.ts       (Timer logic tests)
│   ├── workspace.test.ts   (Workspace detection tests)
│   └── overlay.test.ts     (Overlay rendering tests)
├── types/
│   ├── firefox.d.ts        (Firefox API types)
│   └── zen.d.ts            (Zen API types)
├── build/
│   └── output files here
├── dist/
│   └── bundled mod files
├── docs/
│   └── generated documentation
├── .eslintrc.cjs
├── .stylelintrc.json
├── .prettierrc.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── manifest.json
├── package.json
└── README.md
```

---

## Recommended VS Code Extensions

For optimal development experience:

- **ESLint** - Microsoft's ESLint extension
- **Stylelint** - Stylelint extension
- **Prettier - Code formatter** - Prettier extension
- **TypeScript Vue Plugin** - TypeScript support
- **Thunder Client** or **REST Client** - API testing (if needed)
- **Firefox DevTools** - Firefox debugging integration
- **GitLens** - Enhanced Git integration

### VS Code settings.json Configuration

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.fixAll.stylelint": "explicit"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[css]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "eslint.validate": ["javascript"],
  "stylelint.validate": ["css"],
  "search.exclude": {
    "node_modules": true,
    "dist": true,
    "build": true
  }
}
```

---

## Performance Considerations

### Development Performance

- **Vite HMR**: Fast refresh when files change (< 100ms)
- **Vitest Watch Mode**: Instant test feedback
- **Incremental Builds**: Only rebuild changed files
- **pnpm**: 30-50% faster than npm for dependency resolution

### Build Performance

- **Rollup Tree-shaking**: Remove unused code
- **Terser Minification**: Reduce final file size
- **CSS Minification**: Reduce stylesheet size
- **Source Maps**: Optional; disable for production

### Runtime Performance

- **Mod Context**: Minimal CPU/memory overhead
- **Timer Updates**: 1000ms interval (not per-frame)
- **ResizeObserver**: Debounced to prevent excessive callbacks
- **DOM Queries**: Cached where possible

---

## Troubleshooting Dependencies

### Common Issues

**Issue**: ESLint complains about Firefox Services API
- **Solution**: Install `eslint-plugin-mozilla` and configure `.eslintrc.cjs` to recognize Services

**Issue**: Tests fail with "document is not defined"
- **Solution**: Ensure Vitest is configured with `environment: 'jsdom'` or `'happy-dom'`

**Issue**: CSS minification breaks custom properties
- **Solution**: Configure cssnano to preserve CSS variables in `postcss.config.js`

**Issue**: TypeScript doesn't recognize Firefox API types
- **Solution**: Create `types/firefox.d.ts` with type definitions

**Issue**: Hot reload not working in Vite dev mode
- **Solution**: Check `vite.config.ts` HMR configuration; may need to disable for extension development

---

## Optional Advanced Tools

### Code Analysis

- **SonarQube** - Code quality and security analysis
- **OWASP Dependency-Check** - Security vulnerability scanning
- **Lighthouse** - Performance auditing (if any web UI components)

### Monitoring

- **Sentry** - Error tracking in production (requires mod-specific setup)
- **LogRocket** - Session replay (not applicable to browser mods)

### CI/CD Integration

- **GitHub Actions** - Automated testing and linting on push
- **Pre-commit Hooks** - Automated linting before commits
- **Release Automation** - Automated mod packaging for distribution

---

## Final Recommendations for Copilot

1. **Start with the basics**: ESLint, Stylelint, Prettier, and Vitest are sufficient for initial development

2. **Add TypeScript**: Provides enormous value with IDE support and type safety; enables better refactoring

3. **Enable Git hooks early**: Catch issues before they're committed; prevents bad code from reaching repository

4. **Run linting frequently**: Use `npm run lint:fix` to automatically fix common issues

5. **Write tests as you code**: Test-driven development for timer logic is highly recommended given complexity

6. **Use VS Code with extensions**: Provides real-time feedback without running external tools

7. **Leverage Vite's HMR**: Changes reflect instantly; test in Firefox dev edition side-by-side

8. **Monitor bundle size**: Keep final mod size small; compress userChrome.cjs and userChrome.css

9. **Document as you go**: Use JSDoc comments for public APIs; easier to maintain later

10. **Profile performance**: Use Firefox DevTools to monitor CPU and memory during timer operations

---

## Summary of Essential Commands

```bash
# Development workflow
npm run dev              # Start dev server with HMR
npm run lint:fix        # Auto-fix linting errors
npm run test            # Run all tests
npm run test:ui         # Visual test interface

# Before commit
npm run lint            # Check for linting errors
npm run type-check      # Type-check TypeScript

# Building for release
npm run build           # Production build
npm run docs            # Generate documentation

# Maintenance
npm outdated            # Check for outdated packages
npm audit               # Security vulnerability scan
npm update              # Update dependencies
```

---

## Dependency Management Philosophy

**Minimize external dependencies**: Zen mods run in restricted browser context; use Firefox APIs instead of npm packages where possible.

**Keep dependencies updated**: Regular updates reduce security vulnerabilities and improve performance.

**Review before installing**: Every dependency increases attack surface and build complexity; only install if necessary.

**Prefer official tools**: Use Firefox's official APIs and Mozilla-maintained tooling.

This comprehensive setup provides Copilot with all necessary tools to build a professional, well-tested, maintainable Zen Browser mod.

