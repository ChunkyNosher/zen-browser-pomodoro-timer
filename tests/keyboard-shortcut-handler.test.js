/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import KeyboardShortcutHandler from '../src/keyboard-shortcut-handler.js';

// Mock dependencies at module top level for proper hoisting
vi.mock('../src/helpers.js', () => ({
  getConfig: vi.fn(() => ({
    keyboardShortcut: 'Alt+Shift+P',
    toggleIndicatorShortcut: 'Alt+Shift+I',
  })),
  formatTime: vi.fn((seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`),
  MOD_VERSION: '1.4.10',
  LOG_CATEGORIES: {
    MENU: 'MENU',
    TIMER: 'TIMER',
  },
}));

vi.mock('../src/ui-helpers.js', () => ({
  setupDialogDrag: vi.fn(),
  applyLastDialogPosition: vi.fn(),
  saveDialogPosition: vi.fn(),
  getMenuPhaseLabel: vi.fn((phase) => phase),
  updateCountdownElement: vi.fn(),
  handleStopTimerWithLockout: vi.fn((callback) => callback()),
  handleSkipFocusWithLockout: vi.fn((callback) => callback()),
  isDistractionDumpBlocking: vi.fn(() => false),
  handlePauseResumeTimer: vi.fn(),
}));

describe('KeyboardShortcutHandler - Export Logs', () => {
  let handler;
  let mockLogger;
  let mockApp;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Reset DOM
    document.documentElement.innerHTML = '';

    // Create mocks
    mockLogger = {
      exportLogs: vi.fn(),
    };

    mockApp = {
      logger: mockLogger,
      timer: { isActive: false },
      showCustomAlert: vi.fn(),
    };

    // Setup global window
    global.window = { zenPomodoroApp: mockApp };

    handler = new KeyboardShortcutHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('showPomodoroMenu - inactive timer', () => {
    it('should show Export Logs button in inactive timer menu', () => {
      handler.showPomodoroMenu();

      const dialog = document.getElementById('zen-pomodoro-menu-dialog');
      expect(dialog).toBeTruthy();

      const buttons = dialog.querySelectorAll('.zen-pomodoro-dialog-button');
      const exportLogsBtn = Array.from(buttons).find(
        (btn) => btn.textContent === 'Export Logs'
      );

      expect(exportLogsBtn).toBeTruthy();
      expect(exportLogsBtn.className).toContain('secondary');
    });

    it('should call exportLogs when Export Logs button is clicked', () => {
      handler.showPomodoroMenu();

      const dialog = document.getElementById('zen-pomodoro-menu-dialog');
      const buttons = dialog.querySelectorAll('.zen-pomodoro-dialog-button');
      const exportLogsBtn = Array.from(buttons).find(
        (btn) => btn.textContent === 'Export Logs'
      );

      exportLogsBtn.click();

      expect(mockLogger.exportLogs).toHaveBeenCalled();
      expect(mockApp.showCustomAlert).toHaveBeenCalledWith(
        'Export Complete',
        'Logs have been exported successfully.'
      );
    });

    it('should show Export Logs after Custom Cycles button', () => {
      handler.showPomodoroMenu();

      const dialog = document.getElementById('zen-pomodoro-menu-dialog');
      const section = dialog.querySelector('.zen-pomodoro-config-section');
      const buttons = Array.from(section.children).filter(
        (el) => el.tagName === 'BUTTON'
      );

      const buttonTexts = buttons.map((btn) => btn.textContent);

      expect(buttonTexts).toContain('Custom Cycles');
      expect(buttonTexts).toContain('Export Logs');

      const customCyclesIndex = buttonTexts.indexOf('Custom Cycles');
      const exportLogsIndex = buttonTexts.indexOf('Export Logs');

      expect(exportLogsIndex).toBeGreaterThan(customCyclesIndex);
    });
  });

  describe('showPomodoroMenu - active timer', () => {
    beforeEach(() => {
      mockApp.timer = {
        isActive: true,
        isPaused: false,
        currentPhase: 'focus',
        remainingTime: 1500,
        mode: 'simple',
        getStatus: vi.fn(() => ({
          remainingTime: 1500,
          currentPhase: 'focus',
          isPaused: false,
          mode: 'simple',
        })),
      };
    });

    it('should show Export Logs button in active timer menu', () => {
      handler.showPomodoroMenu();

      const dialog = document.getElementById('zen-pomodoro-menu-dialog');
      expect(dialog).toBeTruthy();

      const buttons = dialog.querySelectorAll('.zen-pomodoro-dialog-button');
      const exportLogsBtn = Array.from(buttons).find(
        (btn) => btn.textContent === 'Export Logs'
      );

      expect(exportLogsBtn).toBeTruthy();
      expect(exportLogsBtn.className).toContain('secondary');
    });

    it('should call exportLogs when Export Logs button is clicked', () => {
      handler.showPomodoroMenu();

      const dialog = document.getElementById('zen-pomodoro-menu-dialog');
      const buttons = dialog.querySelectorAll('.zen-pomodoro-dialog-button');
      const exportLogsBtn = Array.from(buttons).find(
        (btn) => btn.textContent === 'Export Logs'
      );

      exportLogsBtn.click();

      expect(mockLogger.exportLogs).toHaveBeenCalled();
      expect(mockApp.showCustomAlert).toHaveBeenCalledWith(
        'Export Complete',
        'Logs have been exported successfully.'
      );
    });

    it('should show Export Logs after Ruleset Settings button', () => {
      handler.showPomodoroMenu();

      const dialog = document.getElementById('zen-pomodoro-menu-dialog');
      const section = dialog.querySelector('.zen-pomodoro-config-section');
      const buttons = Array.from(section.children).filter(
        (el) => el.tagName === 'BUTTON'
      );

      const buttonTexts = buttons.map((btn) => btn.textContent);

      expect(buttonTexts).toContain('Ruleset Settings');
      expect(buttonTexts).toContain('Export Logs');

      const rulesetIndex = buttonTexts.indexOf('Ruleset Settings');
      const exportLogsIndex = buttonTexts.indexOf('Export Logs');

      expect(exportLogsIndex).toBeGreaterThan(rulesetIndex);
    });
  });
});

describe('KeyboardShortcutHandler - Shortcut reliability hardening', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.innerHTML = '';
    global.window = {
      zenPomodoroApp: {
        timer: { isActive: false },
      },
    };
    handler = new KeyboardShortcutHandler();
  });

  it('removes existing keydown handlers with capture=true', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    handler.setupKeyboardShortcut('Alt+Shift+P');
    handler.setupKeyboardShortcut('Alt+Shift+O');
    handler.setupToggleIndicatorShortcut('Alt+Shift+H');
    handler.setupToggleIndicatorShortcut('Alt+Shift+I');

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(
      removeEventListenerSpy.mock.calls.some(
        (call) => call[0] === 'keydown' && call[2] === true
      )
    ).toBe(true);
  });

  it('falls back safely when keyboard shortcut config is malformed', () => {
    const showMenuSpy = vi.spyOn(handler, 'showPomodoroMenu').mockImplementation(() => {});

    expect(() => handler.setupKeyboardShortcut(null)).not.toThrow();

    const event = new KeyboardEvent('keydown', {
      key: 'p',
      code: 'KeyP',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(showMenuSpy).toHaveBeenCalledTimes(1);
  });

  it('matches letter shortcuts using event.code fallback when event.key differs', () => {
    const parsed = handler.parseShortcut('Alt+Shift+P');
    const event = {
      ctrlKey: false,
      altKey: true,
      shiftKey: true,
      metaKey: false,
      key: 'π',
      code: 'KeyP',
    };

    expect(handler._isShortcutMatch(event, parsed)).toBe(true);
  });

  it('matches numeric shortcuts using event.code Digit fallback', () => {
    const parsed = handler.parseShortcut('Alt+1');
    const event = {
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      key: '&',
      code: 'Digit1',
    };

    expect(handler._isShortcutMatch(event, parsed)).toBe(true);
  });
});

describe('KeyboardShortcutHandler - menu Escape cleanup', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.innerHTML = '';
    global.window = {
      zenPomodoroApp: {
        timer: { isActive: false },
      },
    };
    handler = new KeyboardShortcutHandler();
  });

  afterEach(() => {
    handler.destroy();
    vi.restoreAllMocks();
  });

  it('removes the Escape handler when Close is clicked', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    handler.showPomodoroMenu();
    const escHandler = handler.menuEscHandler;

    Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Close').click();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', escHandler);
    expect(handler.menuEscHandler).toBeNull();
  });

  it('removes the Escape handler when the menu is toggled closed', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    handler.showPomodoroMenu();
    const escHandler = handler.menuEscHandler;

    handler.showPomodoroMenu();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', escHandler);
    expect(handler.menuEscHandler).toBeNull();
  });

  it('removes the Escape handler during destroy', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    handler.showPomodoroMenu();
    const escHandler = handler.menuEscHandler;

    handler.destroy();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', escHandler);
    expect(handler.menuEscHandler).toBeNull();
  });

  it('closes the menu and removes its handler on Escape', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    handler.showPomodoroMenu();
    const escHandler = handler.menuEscHandler;

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('zen-pomodoro-menu-dialog')).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', escHandler);
    expect(handler.menuEscHandler).toBeNull();
  });
});
