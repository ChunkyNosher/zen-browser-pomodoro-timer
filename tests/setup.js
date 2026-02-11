/**
 * Test setup - Mock Firefox/Zen Browser globals that are not available in Node.js.
 *
 * The source modules rely on several Firefox-specific APIs:
 * - Services.prefs (preference storage)
 * - ChromeUtils (module loading, UUID generation)
 * - gBrowser (tab management)
 * - Components (XPCOM interfaces)
 * - Notification (browser notifications)
 */

// Mock Services.prefs
const mockPrefs = new Map();

// Pref type constants (Firefox compatibility)
const PREF_STRING = 32;
const PREF_INT = 64;
const PREF_BOOL = 128;

globalThis.Services = {
  prefs: {
    // Type constants
    PREF_STRING,
    PREF_INT,
    PREF_BOOL,
    // Getter methods with legacy alias
    getCharPref: (key, defaultValue) => mockPrefs.get(key) ?? defaultValue ?? '',
    getStringPref: (key, defaultValue) => mockPrefs.get(key) ?? defaultValue ?? '',
    setCharPref: (key, value) => mockPrefs.set(key, value),
    setStringPref: (key, value) => mockPrefs.set(key, value),
    getIntPref: (key, defaultValue) => mockPrefs.get(key) ?? defaultValue ?? 0,
    setIntPref: (key, value) => mockPrefs.set(key, value),
    getBoolPref: (key, defaultValue) => mockPrefs.get(key) ?? defaultValue ?? false,
    setBoolPref: (key, value) => mockPrefs.set(key, value),
    prefHasUserValue: (key) => mockPrefs.has(key),
    clearUserPref: (key) => mockPrefs.delete(key),
    // Get pref type based on stored value
    getPrefType: (key) => {
      if (!mockPrefs.has(key)) return 0;
      const value = mockPrefs.get(key);
      if (typeof value === 'string') return PREF_STRING;
      if (typeof value === 'number') return PREF_INT;
      if (typeof value === 'boolean') return PREF_BOOL;
      return 0;
    },
    addObserver: () => {},
    removeObserver: () => {},
    getDefaultBranch: () => ({
      getStringPref: (key, defaultValue) => defaultValue ?? '',
    }),
  },
  obs: {
    addObserver: () => {},
    removeObserver: () => {},
    notifyObservers: () => {},
  },
  scriptloader: {
    loadSubScriptWithOptions: () => {},
  },
};

// Mock ChromeUtils
globalThis.ChromeUtils = {
  generateQI: (interfaces) => () => null,
  importESModule: () => ({}),
  defineESModuleGetters: () => {},
};

// Mock Components
globalThis.Components = {
  interfaces: {
    nsIWebProgressListener: {},
    nsISupportsWeakReference: {},
  },
};

// Mock gBrowser
globalThis.gBrowser = {
  selectedBrowser: {
    currentURI: { spec: 'about:blank' },
    webNavigation: { goBack: () => {} },
  },
  tabContainer: { childNodes: [] },
  addProgressListener: () => {},
  removeProgressListener: () => {},
  addTabsProgressListener: () => {},
  removeTabsProgressListener: () => {},
};

// Mock Notification
globalThis.Notification = class Notification {
  constructor(title, options) {
    this.title = title;
    this.options = options;
  }
  static permission = 'granted';
  static requestPermission = async () => 'granted';
};

// Mock crypto
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  };
}

// Helper to clear mock prefs between tests
export function clearMockPrefs() {
  mockPrefs.clear();
}

// Helper to set mock pref values
export function setMockPref(key, value) {
  mockPrefs.set(key, value);
}
