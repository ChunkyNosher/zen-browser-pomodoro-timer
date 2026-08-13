/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WorkspaceDetector from '../src/workspace-detector.js';
import { clearMockPrefs } from './setup.js';

// Mock Storage module
vi.mock('../src/storage.js', () => ({
  default: {
    loadConfig: vi.fn(() => ({
      blockedWorkspaces: [],
      rulesets: [],
    })),
    saveConfig: vi.fn(),
  },
}));

// Mock break-phase-utils
vi.mock('../src/break-phase-utils.js', () => ({
  isInBreakPhase: vi.fn(() => false),
}));

// Mock helpers
vi.mock('../src/helpers.js', () => ({
  extractWorkspaceNameFromButton: vi.fn((btn, id) => `Workspace ${id}`),
  isValidWorkspaceArray: vi.fn((arr) => Array.isArray(arr) && arr.length > 0),
  formatWorkspacesFromApi: vi.fn((arr) => arr),
}));

// Mock log-manager
vi.mock('../src/log-manager.js', () => ({
  logger: {
    log: vi.fn(),
  },
}));

// Import mocked modules
import Storage from '../src/storage.js';
import { isInBreakPhase } from '../src/break-phase-utils.js';
import { extractWorkspaceNameFromButton, isValidWorkspaceArray, formatWorkspacesFromApi } from '../src/helpers.js';
import { logger } from '../src/log-manager.js';

describe('WorkspaceDetector', () => {
  let detector;
  let querySelectorSpy;
  let querySelectorAllSpy;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    clearMockPrefs();

    // Reset Storage mock to default
    Storage.loadConfig.mockReturnValue({
      blockedWorkspaces: [],
      rulesets: [],
    });

    // Reset break phase mock
    isInBreakPhase.mockReturnValue(false);

    // Spy on DOM query methods
    querySelectorSpy = vi.spyOn(document, 'querySelector');
    querySelectorAllSpy = vi.spyOn(document, 'querySelectorAll');

    // Create fresh instance
    detector = new WorkspaceDetector();
  });

  afterEach(() => {
    // Cleanup
    if (detector) {
      detector.stopMonitoring();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete globalThis.gZenWorkspaces;
  });

  describe('Constructor', () => {
    it('should initialize activeWorkspace to null', () => {
      expect(detector.activeWorkspace).toBeNull();
    });

    it('should load config from Storage', () => {
      expect(Storage.loadConfig).toHaveBeenCalled();
      expect(detector.config).toBeDefined();
      expect(detector.config.blockedWorkspaces).toBeDefined();
    });

    it('should initialize needsValidation to true', () => {
      expect(detector.needsValidation).toBe(true);
    });

    it('should initialize onWorkspaceChange to null', () => {
      expect(detector.onWorkspaceChange).toBeNull();
    });

    it('should initialize workspaceObserver to null', () => {
      expect(detector.workspaceObserver).toBeNull();
    });

    it('should initialize mutationDebounceTimer to null', () => {
      expect(detector.mutationDebounceTimer).toBeNull();
    });
  });

  describe('getActiveWorkspace', () => {
    it('should prefer the native active workspace ID', () => {
      globalThis.gZenWorkspaces = { activeWorkspace: 'native-workspace' };

      expect(detector.getActiveWorkspace()).toBe('native-workspace');
      expect(querySelectorSpy).not.toHaveBeenCalled();
    });

    it('should return ID from modern zen-workspace element', () => {
      const mockElement = { id: 'workspace-123' };
      querySelectorSpy.mockImplementation((selector) => {
        if (selector === 'zen-workspace[active="true"][id]') {
          return mockElement;
        }
        return null;
      });

      const result = detector.getActiveWorkspace();
      expect(result).toBe('workspace-123');
      expect(querySelectorSpy).toHaveBeenCalledWith('zen-workspace[active="true"][id]');
    });

    it('should fall back to toolbarbutton selector', () => {
      const mockElement = { getAttribute: vi.fn(() => 'workspace-456') };
      querySelectorSpy.mockImplementation((selector) => {
        if (selector === 'toolbarbutton[zen-workspace-id][active="true"]') {
          return mockElement;
        }
        return null;
      });

      const result = detector.getActiveWorkspace();
      expect(result).toBe('workspace-456');
      expect(mockElement.getAttribute).toHaveBeenCalledWith('zen-workspace-id');
    });

    it('should return null if no workspace found', () => {
      querySelectorSpy.mockReturnValue(null);
      const result = detector.getActiveWorkspace();
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', () => {
      querySelectorSpy.mockImplementation(() => {
        throw new Error('DOM error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const result = detector.getActiveWorkspace();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should prioritize modern selector over legacy', () => {
      const modernElement = { id: 'modern-workspace' };
      const legacyElement = { getAttribute: vi.fn(() => 'legacy-workspace') };
      
      querySelectorSpy.mockImplementation((selector) => {
        if (selector === 'zen-workspace[active="true"][id]') {
          return modernElement;
        }
        if (selector === 'toolbarbutton[zen-workspace-id][active="true"]') {
          return legacyElement;
        }
        return null;
      });

      const result = detector.getActiveWorkspace();
      expect(result).toBe('modern-workspace');
      expect(legacyElement.getAttribute).not.toHaveBeenCalled();
    });
  });

  describe('validateBlockedWorkspaces', () => {
    it('should return early if needsValidation is false', () => {
      detector.needsValidation = false;
      vi.spyOn(detector, 'getAllWorkspaces');

      detector.validateBlockedWorkspaces();

      expect(detector.getAllWorkspaces).not.toHaveBeenCalled();
    });

    it('should remove deleted workspaces from global blocked list', () => {
      detector.config.blockedWorkspaces = ['ws1', 'ws2', 'ws3'];
      vi.spyOn(detector, 'getAllWorkspaces').mockReturnValue([
        { id: 'ws1', name: 'Workspace 1' },
        { id: 'ws3', name: 'Workspace 3' },
      ]);

      detector.validateBlockedWorkspaces();

      expect(detector.config.blockedWorkspaces).toEqual(['ws1', 'ws3']);
      expect(Storage.saveConfig).toHaveBeenCalledWith(detector.config);
    });

    it('should remove deleted workspaces from ruleset blocked lists', () => {
      detector.config.rulesets = [
        { enabled: true, blockedWorkspaces: ['ws1', 'ws2'] },
        { enabled: true, blockedWorkspaces: ['ws3', 'ws4'] },
      ];
      vi.spyOn(detector, 'getAllWorkspaces').mockReturnValue([
        { id: 'ws1', name: 'Workspace 1' },
        { id: 'ws4', name: 'Workspace 4' },
      ]);

      detector.validateBlockedWorkspaces();

      expect(detector.config.rulesets[0].blockedWorkspaces).toEqual(['ws1']);
      expect(detector.config.rulesets[1].blockedWorkspaces).toEqual(['ws4']);
      expect(Storage.saveConfig).toHaveBeenCalledWith(detector.config);
    });

    it('should not save config if no changes were made', () => {
      detector.config.blockedWorkspaces = ['ws1', 'ws2'];
      vi.spyOn(detector, 'getAllWorkspaces').mockReturnValue([
        { id: 'ws1', name: 'Workspace 1' },
        { id: 'ws2', name: 'Workspace 2' },
      ]);

      detector.validateBlockedWorkspaces();

      expect(Storage.saveConfig).not.toHaveBeenCalled();
    });

    it('should set needsValidation to false after validation', () => {
      vi.spyOn(detector, 'getAllWorkspaces').mockReturnValue([]);
      
      detector.validateBlockedWorkspaces();

      expect(detector.needsValidation).toBe(false);
    });

    it('should cache validated workspaces', () => {
      detector.config.blockedWorkspaces = ['ws1'];
      detector.config.rulesets = [
        { enabled: true, blockedWorkspaces: ['ws2'] },
      ];
      vi.spyOn(detector, 'getAllWorkspaces').mockReturnValue([
        { id: 'ws1', name: 'Workspace 1' },
        { id: 'ws2', name: 'Workspace 2' },
      ]);

      detector.validateBlockedWorkspaces();

      expect(detector.needsValidation).toBe(false);
    });

    it('should handle rulesets without blockedWorkspaces property', () => {
      detector.config.rulesets = [
        { enabled: true },
        { enabled: true, blockedWorkspaces: ['ws1'] },
      ];
      vi.spyOn(detector, 'getAllWorkspaces').mockReturnValue([
        { id: 'ws1', name: 'Workspace 1' },
      ]);

      detector.validateBlockedWorkspaces();

      expect(detector.config.rulesets[1].blockedWorkspaces).toEqual(['ws1']);
    });
  });

  describe('isCurrentWorkspaceBlocked', () => {
    it('should return false during break phase', () => {
      isInBreakPhase.mockReturnValue(true);
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isCurrentWorkspaceBlocked();

      expect(result).toBe(false);
      expect(logger.log).toHaveBeenCalled();
    });

    it('should return true when workspace is in blocked list', () => {
      isInBreakPhase.mockReturnValue(false);
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isCurrentWorkspaceBlocked();

      expect(result).toBe(true);
    });

    it('should return false when workspace is not in blocked list', () => {
      isInBreakPhase.mockReturnValue(false);
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isCurrentWorkspaceBlocked();

      expect(result).toBe(false);
    });

    it('should return false when no active workspace', () => {
      isInBreakPhase.mockReturnValue(false);
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue(null);
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isCurrentWorkspaceBlocked();

      expect(result).toBe(false);
    });

    it('should check rulesets for blocked workspaces', () => {
      isInBreakPhase.mockReturnValue(false);
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      detector.config.blockedWorkspaces = [];
      detector.config.rulesets = [
        { id: 'r1', enabled: true, blockedWorkspaces: ['ws2'] },
      ];
      // getActiveBlockedWorkspaces reads from Storage.loadConfig
      Storage.loadConfig.mockReturnValue({
        blockedWorkspaces: [],
        rulesets: [{ id: 'r1', enabled: true, blockedWorkspaces: ['ws2'] }],
        activeRulesets: ['r1'],
      });

      const result = detector.isCurrentWorkspaceBlocked();

      expect(result).toBe(true);
    });
  });

  describe('isWorkspaceInBlockedList', () => {
    it('should return true when workspace is blocked', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isWorkspaceInBlockedList();

      expect(result).toBe(true);
    });

    it('should return false when workspace is not blocked', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isWorkspaceInBlockedList();

      expect(result).toBe(false);
    });

    it('should NOT check break phase', () => {
      isInBreakPhase.mockReturnValue(true);
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isWorkspaceInBlockedList();

      // Should still return true even during break phase
      expect(result).toBe(true);
    });
  });

  describe('isWorkspaceIdBlocked', () => {
    it('should return true for blocked workspace ID', () => {
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isWorkspaceIdBlocked('ws1');

      expect(result).toBe(true);
    });

    it('should return false for unblocked workspace ID', () => {
      detector.config.blockedWorkspaces = ['ws1'];

      const result = detector.isWorkspaceIdBlocked('ws2');

      expect(result).toBe(false);
    });

    it('should include rulesets in check', () => {
      detector.config.blockedWorkspaces = [];
      detector.config.rulesets = [
        { id: 'r1', enabled: true, blockedWorkspaces: ['ws2'] },
      ];
      detector.config.activeRulesets = ['r1'];

      const result = detector.isWorkspaceIdBlocked('ws2');

      expect(result).toBe(true);
    });

    it('should reload config if missing', () => {
      detector.config = null;
      Storage.loadConfig.mockReturnValue({
        blockedWorkspaces: ['ws1'],
        rulesets: [],
      });

      const result = detector.isWorkspaceIdBlocked('ws1');

      expect(Storage.loadConfig).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should only check enabled rulesets', () => {
      detector.config.blockedWorkspaces = [];
      detector.config.rulesets = [
        { id: 'r1', enabled: false, blockedWorkspaces: ['ws1'] },
        { id: 'r2', enabled: true, blockedWorkspaces: ['ws2'] },
      ];
      detector.config.activeRulesets = ['r1', 'r2'];

      expect(detector.isWorkspaceIdBlocked('ws1')).toBe(false);
      expect(detector.isWorkspaceIdBlocked('ws2')).toBe(true);
    });
  });

  describe('_handleWorkspaceMutation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should debounce mutation events', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      detector.activeWorkspace = 'ws1'; // Set to same to prevent callback execution
      
      detector._handleWorkspaceMutation();
      detector._handleWorkspaceMutation();
      detector._handleWorkspaceMutation();

      expect(detector.mutationDebounceTimer).not.toBeNull();
      
      // Fast forward less than debounce time (50ms)
      vi.advanceTimersByTime(25);
      
      // Should not have been called yet
      expect(detector.getActiveWorkspace).toHaveBeenCalledTimes(0);
      
      // Fast forward to complete the debounce
      vi.advanceTimersByTime(30);
      
      // Now it should have been called exactly once
      expect(detector.getActiveWorkspace).toHaveBeenCalledTimes(1);
    });

    it('should detect workspace changes', () => {
      detector.activeWorkspace = 'ws1';
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});
      detector.onWorkspaceChange = vi.fn();

      detector._handleWorkspaceMutation();
      vi.advanceTimersByTime(300);

      expect(detector.activeWorkspace).toBe('ws2');
      expect(detector.onWorkspaceChange).toHaveBeenCalledWith('ws2', false);
    });

    it('should ignore same workspace', () => {
      detector.activeWorkspace = 'ws1';
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});
      detector.onWorkspaceChange = vi.fn();

      detector._handleWorkspaceMutation();
      vi.advanceTimersByTime(300);

      expect(detector.validateBlockedWorkspaces).not.toHaveBeenCalled();
      expect(detector.onWorkspaceChange).not.toHaveBeenCalled();
    });

    it('should call onWorkspaceChange callback', () => {
      detector.activeWorkspace = 'ws1';
      detector.config.blockedWorkspaces = ['ws2'];
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});
      detector.onWorkspaceChange = vi.fn();

      detector._handleWorkspaceMutation();
      vi.advanceTimersByTime(300);

      expect(detector.onWorkspaceChange).toHaveBeenCalledWith('ws2', true);
    });

    it('should validate blocked workspaces', () => {
      detector.activeWorkspace = 'ws1';
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});

      detector._handleWorkspaceMutation();
      vi.advanceTimersByTime(300);

      expect(detector.needsValidation).toBe(true);
      expect(detector.validateBlockedWorkspaces).toHaveBeenCalled();
    });

    it('should clear previous timeout', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      
      detector._handleWorkspaceMutation();
      const firstTimer = detector.mutationDebounceTimer;
      
      detector._handleWorkspaceMutation();
      const secondTimer = detector.mutationDebounceTimer;

      expect(firstTimer).not.toBe(secondTimer);
    });

    it('should clear timer after execution', () => {
      detector.activeWorkspace = 'ws1';
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});

      detector._handleWorkspaceMutation();
      vi.advanceTimersByTime(300);

      expect(detector.mutationDebounceTimer).toBeNull();
    });
  });

  describe('startMonitoring', () => {
    it('should use native workspace listeners when available', () => {
      const addChangeListeners = vi.fn();
      const removeChangeListeners = vi.fn();
      globalThis.gZenWorkspaces = {
        activeWorkspace: 'ws1',
        addChangeListeners,
        removeChangeListeners,
      };
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      detector.startMonitoring();

      expect(addChangeListeners).toHaveBeenCalledTimes(1);
      expect(detector.workspaceObserver).toBeNull();
      expect(addEventListenerSpy).toHaveBeenCalledWith('ZenWorkspaceDataChanged', detector.workspaceDataChangeListener);
    });

    it('should handle native workspace changes and remove listeners when stopped', () => {
      const addChangeListeners = vi.fn();
      const removeChangeListeners = vi.fn();
      globalThis.gZenWorkspaces = {
        activeWorkspace: 'ws1',
        addChangeListeners,
        removeChangeListeners,
      };
      detector.onWorkspaceChange = vi.fn();
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});

      detector.startMonitoring();
      addChangeListeners.mock.calls[0][0]({ workspace: { uuid: 'ws2' } });
      detector.stopMonitoring();

      expect(detector.activeWorkspace).toBe('ws2');
      expect(detector.onWorkspaceChange).toHaveBeenCalledWith('ws2', false);
      expect(removeChangeListeners).toHaveBeenCalledWith(addChangeListeners.mock.calls[0][0]);
    });

    it('should refresh and validate when native workspace data changes', () => {
      globalThis.gZenWorkspaces = {
        activeWorkspace: 'ws1',
        addChangeListeners: vi.fn(),
        removeChangeListeners: vi.fn(),
      };
      const refreshConfig = vi.spyOn(detector, 'refreshConfig');
      const validateBlockedWorkspaces = vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});

      detector.startMonitoring();
      window.dispatchEvent(new Event('ZenWorkspaceDataChanged'));

      expect(refreshConfig).toHaveBeenCalledTimes(1);
      expect(validateBlockedWorkspaces).toHaveBeenCalledTimes(1);
    });

    it('should set initial workspace', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      querySelectorSpy.mockReturnValue(document.createElement('div'));

      detector.startMonitoring();

      expect(detector.activeWorkspace).toBe('ws1');
    });

    it('should disconnect existing observer', () => {
      const mockObserver = { disconnect: vi.fn(), observe: vi.fn() };
      detector.workspaceObserver = mockObserver;
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      querySelectorSpy.mockReturnValue(document.createElement('div'));

      detector.startMonitoring();

      expect(mockObserver.disconnect).toHaveBeenCalled();
    });

    it('should create a fallback MutationObserver when native APIs are unavailable', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      querySelectorSpy.mockReturnValue(document.createElement('div'));

      detector.startMonitoring();

      expect(detector.workspaceObserver).toBeInstanceOf(MutationObserver);
    });

    it('should observe workspace container', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      const mockContainer = document.createElement('div');
      querySelectorSpy.mockReturnValue(mockContainer);
      
      const observeSpy = vi.fn();
      const MockMutationObserver = vi.fn(function() {
        this.observe = observeSpy;
        this.disconnect = vi.fn();
      });
      global.MutationObserver = MockMutationObserver;

      detector.startMonitoring();

      expect(observeSpy).toHaveBeenCalledWith(mockContainer, {
        attributes: true,
        attributeFilter: ['active', 'selected', 'zen-workspace-id'],
        subtree: true,
        childList: true,
      });
    });

    it('should warn if no workspace container found', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      querySelectorSpy.mockReturnValue(null);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      detector.startMonitoring();

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should log monitoring start', () => {
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');
      querySelectorSpy.mockReturnValue(document.createElement('div'));

      detector.startMonitoring();

      expect(logger.log).toHaveBeenCalled();
    });
  });

  describe('stopMonitoring', () => {
    it('should disconnect observer', () => {
      const mockObserver = { disconnect: vi.fn() };
      detector.workspaceObserver = mockObserver;

      detector.stopMonitoring();

      expect(mockObserver.disconnect).toHaveBeenCalled();
      expect(detector.workspaceObserver).toBeNull();
    });

    it('should clear debounce timer', () => {
      vi.useFakeTimers();
      detector.mutationDebounceTimer = setTimeout(() => {}, 1000);

      detector.stopMonitoring();

      expect(detector.mutationDebounceTimer).toBeNull();
      vi.useRealTimers();
    });

    it('should handle null observer gracefully', () => {
      detector.workspaceObserver = null;

      expect(() => detector.stopMonitoring()).not.toThrow();
    });
  });

  describe('getAllWorkspaces', () => {
    it('should prefer gZenWorkspaces API', () => {
      const mockWorkspaces = [{ id: 'ws1', name: 'Workspace 1' }];
      globalThis.gZenWorkspaces = { getWorkspaces: vi.fn(() => mockWorkspaces) };

      expect(detector.getAllWorkspaces()).toEqual(mockWorkspaces);
      expect(globalThis.gZenWorkspaces.getWorkspaces).toHaveBeenCalledTimes(1);
    });

    it('should try DOM buttons if the native API is unavailable', () => {
      const mockWorkspaces = [{ id: 'ws1', name: 'Workspace 1' }];
      vi.spyOn(detector, '_tryDomWorkspaceButtons').mockReturnValue(mockWorkspaces);

      const result = detector.getAllWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });

    it('should try workspace container if DOM buttons fail', () => {
      const mockWorkspaces = [{ id: 'ws1', name: 'Workspace 1' }];
      vi.spyOn(detector, '_tryDomWorkspaceButtons').mockReturnValue(null);
      vi.spyOn(detector, '_tryWorkspaceContainer').mockReturnValue(mockWorkspaces);

      const result = detector.getAllWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });

    it('should return empty array when nothing found', () => {
      vi.spyOn(detector, '_tryDomWorkspaceButtons').mockReturnValue(null);
      vi.spyOn(detector, '_tryWorkspaceContainer').mockReturnValue(null);

      const result = detector.getAllWorkspaces();

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', () => {
      vi.spyOn(detector, '_tryGZenWorkspacesApi').mockImplementation(() => {
        throw new Error('API error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = detector.getAllWorkspaces();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('_tryGZenWorkspacesApi', () => {
    it('should return null if gZenWorkspaces undefined', () => {
      const result = detector._tryGZenWorkspacesApi();
      expect(result).toBeNull();
    });

    it('should use getWorkspaces()', () => {
      const mockWorkspaces = [{ id: 'ws1', name: 'Workspace 1' }];
      globalThis.gZenWorkspaces = { getWorkspaces: vi.fn(() => mockWorkspaces) };
      isValidWorkspaceArray.mockReturnValue(true);
      formatWorkspacesFromApi.mockReturnValue(mockWorkspaces);

      const result = detector._tryGZenWorkspacesApi();

      expect(globalThis.gZenWorkspaces.getWorkspaces).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockWorkspaces);
    });

    it('should return null if workspaces invalid', () => {
      globalThis.gZenWorkspaces = { getWorkspaces: vi.fn(() => []) };
      isValidWorkspaceArray.mockReturnValue(false);

      const result = detector._tryGZenWorkspacesApi();

      expect(result).toBeNull();
    });
  });

  describe('_tryDomWorkspaceButtons', () => {
    it('should return null if no buttons found', () => {
      querySelectorAllSpy.mockReturnValue([]);

      const result = detector._tryDomWorkspaceButtons();

      expect(result).toBeNull();
    });

    it('should extract workspaces from buttons', () => {
      const mockButton = {
        getAttribute: vi.fn(() => 'ws1'),
      };
      querySelectorAllSpy.mockReturnValue([mockButton]);
      extractWorkspaceNameFromButton.mockReturnValue('Workspace 1');

      const result = detector._tryDomWorkspaceButtons();

      expect(result).toEqual([{ id: 'ws1', name: 'Workspace 1' }]);
    });

    it('should handle multiple buttons', () => {
      const mockButtons = [
        { getAttribute: vi.fn(() => 'ws1') },
        { getAttribute: vi.fn(() => 'ws2') },
      ];
      querySelectorAllSpy.mockReturnValue(mockButtons);
      extractWorkspaceNameFromButton.mockImplementation((btn, id) => `Workspace ${id}`);

      const result = detector._tryDomWorkspaceButtons();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ws1');
      expect(result[1].id).toBe('ws2');
    });
  });

  describe('_extractWorkspaceFromModernElement', () => {
    it('should extract id and label attribute', () => {
      const mockElement = {
        id: 'ws1',
        getAttribute: vi.fn(() => 'My Workspace'),
        querySelector: vi.fn(() => null),
      };

      const result = detector._extractWorkspaceFromModernElement(mockElement);

      expect(result).toEqual({ id: 'ws1', name: 'My Workspace' });
    });

    it('should fall back to indicator name', () => {
      const mockElement = {
        id: 'ws1',
        getAttribute: vi.fn(() => null),
        querySelector: vi.fn(() => ({
          textContent: '  Indicator Name  ',
        })),
      };

      const result = detector._extractWorkspaceFromModernElement(mockElement);

      expect(result).toEqual({ id: 'ws1', name: 'Indicator Name' });
    });

    it('should fall back to truncated ID', () => {
      const mockElement = {
        id: 'ws1234567890',
        getAttribute: vi.fn(() => null),
        querySelector: vi.fn(() => null),
      };

      const result = detector._extractWorkspaceFromModernElement(mockElement);

      expect(result).toEqual({ id: 'ws1234567890', name: 'Workspace ws123456' });
    });
  });

  describe('_extractWorkspaceFromLegacyElement', () => {
    it('should extract zen-workspace-id and label', () => {
      const mockElement = {
        getAttribute: vi.fn((attr) => {
          if (attr === 'zen-workspace-id') return 'ws1';
          if (attr === 'label') return 'My Workspace';
          return null;
        }),
      };

      const result = detector._extractWorkspaceFromLegacyElement(mockElement);

      expect(result).toEqual({ id: 'ws1', name: 'My Workspace' });
    });

    it('should extract data-workspace-id and data-name', () => {
      const mockElement = {
        getAttribute: vi.fn((attr) => {
          if (attr === 'zen-workspace-id') return null;
          if (attr === 'data-workspace-id') return 'ws1';
          if (attr === 'data-name') return 'Data Workspace';
          return null;
        }),
      };

      const result = detector._extractWorkspaceFromLegacyElement(mockElement);

      expect(result).toEqual({ id: 'ws1', name: 'Data Workspace' });
    });

    it('should fall back to textContent', () => {
      const mockElement = {
        getAttribute: vi.fn((attr) => {
          if (attr === 'zen-workspace-id') return 'ws1';
          return null;
        }),
        textContent: '  Text Content  ',
      };

      const result = detector._extractWorkspaceFromLegacyElement(mockElement);

      expect(result).toEqual({ id: 'ws1', name: 'Text Content' });
    });
  });

  describe('_tryWorkspaceContainer', () => {
    it('should try modern workspace elements first', () => {
      const mockWorkspaces = [{ id: 'ws1', name: 'Workspace 1' }];
      vi.spyOn(detector, '_tryModernWorkspaceElements').mockReturnValue(mockWorkspaces);

      const result = detector._tryWorkspaceContainer();

      expect(result).toEqual(mockWorkspaces);
    });

    it('should fall back to legacy containers', () => {
      const mockWorkspaces = [{ id: 'ws1', name: 'Workspace 1' }];
      vi.spyOn(detector, '_tryModernWorkspaceElements').mockReturnValue(null);
      vi.spyOn(detector, '_tryLegacyContainerWorkspaces').mockReturnValue(mockWorkspaces);

      const result = detector._tryWorkspaceContainer();

      expect(result).toEqual(mockWorkspaces);
    });
  });

  describe('_tryModernWorkspaceElements', () => {
    it('should return null if no elements found', () => {
      querySelectorAllSpy.mockReturnValue([]);

      const result = detector._tryModernWorkspaceElements();

      expect(result).toBeNull();
    });

    it('should extract from zen-workspace elements', () => {
      const mockElements = [
        {
          id: 'ws1',
          getAttribute: vi.fn(() => 'Workspace 1'),
          querySelector: vi.fn(() => null),
        },
      ];
      querySelectorAllSpy.mockReturnValue(mockElements);

      const result = detector._tryModernWorkspaceElements();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ws1');
    });
  });

  describe('_tryLegacyContainerWorkspaces', () => {
    it('should return null if no container found', () => {
      vi.spyOn(detector, '_findLegacyWorkspaceContainer').mockReturnValue(null);

      const result = detector._tryLegacyContainerWorkspaces();

      expect(result).toBeNull();
    });

    it('should return null if no items in container', () => {
      const mockContainer = {
        querySelectorAll: vi.fn(() => []),
      };
      vi.spyOn(detector, '_findLegacyWorkspaceContainer').mockReturnValue(mockContainer);

      const result = detector._tryLegacyContainerWorkspaces();

      expect(result).toBeNull();
    });

    it('should extract from container items', () => {
      const mockItems = [
        {
          getAttribute: vi.fn((attr) => {
            if (attr === 'zen-workspace-id') return 'ws1';
            if (attr === 'label') return 'Workspace 1';
            return null;
          }),
        },
      ];
      const mockContainer = {
        querySelectorAll: vi.fn(() => mockItems),
      };
      vi.spyOn(detector, '_findLegacyWorkspaceContainer').mockReturnValue(mockContainer);

      const result = detector._tryLegacyContainerWorkspaces();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ws1');
    });
  });

  describe('_findLegacyWorkspaceContainer', () => {
    it('should find container by selector', () => {
      const mockContainer = document.createElement('div');
      querySelectorSpy.mockReturnValue(mockContainer);

      const result = detector._findLegacyWorkspaceContainer();

      expect(result).toBe(mockContainer);
      expect(querySelectorSpy).toHaveBeenCalledWith(
        '#zen-workspaces-button, [id*="workspace"]'
      );
    });

    it('should return null if not found', () => {
      querySelectorSpy.mockReturnValue(null);

      const result = detector._findLegacyWorkspaceContainer();

      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty config gracefully', () => {
      detector.config = { blockedWorkspaces: [], rulesets: [] };
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');

      const result = detector.isCurrentWorkspaceBlocked();

      expect(result).toBe(false);
    });

    it('should handle config reload in isCurrentWorkspaceBlocked', () => {
      Storage.loadConfig.mockReturnValue({
        blockedWorkspaces: ['ws1'],
        rulesets: [],
      });
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');

      const result = detector.isCurrentWorkspaceBlocked();

      expect(Storage.loadConfig).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should load config once per blocked workspace check', () => {
      Storage.loadConfig.mockClear();
      Storage.loadConfig.mockReturnValue({ blockedWorkspaces: ['ws1'], rulesets: [] });
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws1');

      expect(detector.isCurrentWorkspaceBlocked()).toBe(true);
      expect(Storage.loadConfig).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple debounced calls correctly', () => {
      vi.useFakeTimers();
      detector.activeWorkspace = 'ws1';
      vi.spyOn(detector, 'getActiveWorkspace').mockReturnValue('ws2');
      vi.spyOn(detector, 'validateBlockedWorkspaces').mockImplementation(() => {});

      // Call multiple times rapidly (no time advancement between calls)
      for (let i = 0; i < 10; i++) {
        detector._handleWorkspaceMutation();
      }

      // Advance less than debounce timeout - callback should not execute yet
      vi.advanceTimersByTime(25);
      expect(detector.validateBlockedWorkspaces).toHaveBeenCalledTimes(0);

      // Complete the debounce delay - should execute exactly once
      vi.advanceTimersByTime(30);
      expect(detector.validateBlockedWorkspaces).toHaveBeenCalledTimes(1);
    });

    it('should handle workspace ID with special characters', () => {
      detector.config.blockedWorkspaces = ['ws-1.2.3'];

      const result = detector.isWorkspaceIdBlocked('ws-1.2.3');

      expect(result).toBe(true);
    });
  });
});
