/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import KeyboardShortcutHandler from '../src/keyboard-shortcut-handler.js';

describe('KeyboardShortcutHandler - Export Logs', () => {
  let handler;
  let mockLogger;
  let mockApp;

  beforeEach(() => {
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

    // Mock dependencies
    vi.mock('../src/helpers.js', () => ({
      getConfig: vi.fn(() => ({
        keyboardShortcut: 'Alt+Shift+P',
        toggleIndicatorShortcut: 'Alt+Shift+I',
      })),
      formatTime: vi.fn((seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`),
      MOD_VERSION: '1.4.7',
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
