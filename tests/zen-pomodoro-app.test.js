import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ZenPomodoroApp from '../src/zen-pomodoro-app.js';
import Constants from '../src/constants.js';
import { logger } from '../src/log-manager.js';
import { clearMockPrefs, setMockPref } from './setup.js';

describe('ZenPomodoroApp - export logs preference trigger', () => {
  let app;
  const exportPrefName = `${Constants.PREF_PREFIX}.${Constants.EXPORT_LOGS_REQUEST_PREF_KEY}`;

  beforeEach(() => {
    clearMockPrefs();
    app = Object.create(ZenPomodoroApp.prototype);
    app._isResettingExportLogsPref = false;
    app._lastExportLogsTriggerAt = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports logs and resets trigger when export pref is enabled', () => {
    const exportSpy = vi.spyOn(logger, 'exportLogs').mockImplementation(() => {});
    setMockPref(exportPrefName, true);

    app._handlePreferenceTrigger(exportPrefName);

    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(Services.prefs.getBoolPref(exportPrefName, true)).toBe(false);
  });

  it('avoids duplicate exports in the same moment and still resets trigger', () => {
    const exportSpy = vi.spyOn(logger, 'exportLogs').mockImplementation(() => {});
    setMockPref(exportPrefName, true);
    app._lastExportLogsTriggerAt = Date.now();

    app._handleExportLogsPreferenceTrigger();

    expect(exportSpy).not.toHaveBeenCalled();
    expect(Services.prefs.getBoolPref(exportPrefName, true)).toBe(false);
  });

  it('ignores unrelated preference changes', () => {
    const exportSpy = vi.spyOn(logger, 'exportLogs').mockImplementation(() => {});
    setMockPref(exportPrefName, true);

    app._handlePreferenceTrigger('zen-pomodoro.unrelatedPreference');

    expect(exportSpy).not.toHaveBeenCalled();
    expect(Services.prefs.getBoolPref(exportPrefName, false)).toBe(true);
  });

  it('refreshes workspace config and visibility when the config pref changes', () => {
    const configPrefName = `${Constants.PREF_PREFIX}.config`;
    app.workspace = {
      refreshConfig: vi.fn(),
      getActiveWorkspace: vi.fn(() => 'workspace-1'),
      isWorkspaceIdBlocked: vi.fn(() => true),
    };
    app.updateOverlayVisibility = vi.fn();

    app._handlePreferenceTrigger(configPrefName);

    expect(app.workspace.refreshConfig).toHaveBeenCalledTimes(1);
    expect(app.updateOverlayVisibility).toHaveBeenCalledWith('workspace-1', true);
  });
});

describe('ZenPomodoroApp visibility updates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates only the display on timer ticks', () => {
    const app = Object.create(ZenPomodoroApp.prototype);
    app.overlay = { updateDisplay: vi.fn() };
    app.updateOverlayVisibility = vi.fn();

    app.onTimerTick(120, 'focus', 1, 4);

    expect(app.overlay.updateDisplay).toHaveBeenCalledWith(120, 'focus', 1, 4);
    expect(app.updateOverlayVisibility).not.toHaveBeenCalled();
  });

  it('logs an unchanged workspace visibility state once', () => {
    const app = Object.create(ZenPomodoroApp.prototype);
    app._lastWorkspaceVisibilityLog = null;
    app.timer = { isPaused: false };
    app.workspace = { isCurrentWorkspaceBlocked: vi.fn(() => true), getActiveWorkspace: vi.fn(() => 'workspace-1') };
    app._showOverlayWithStatus = vi.fn();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    app._handleFocusPhase('workspace-1', true);
    app._handleFocusPhase('workspace-1', true);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      Constants.LOG_CATEGORIES.OVERLAY,
      'Current workspace is blocked - showing overlay',
      expect.any(Object)
    );
  });
});

describe('ZenPomodoroApp teardown', () => {
  it('stops the local interval without clearing persisted timer state', () => {
    const app = Object.create(ZenPomodoroApp.prototype);
    app.workspace = { stopMonitoring: vi.fn() };
    app.timer = { stopInterval: vi.fn(), stop: vi.fn() };
    app.security = { cleanupLockScreen: vi.fn() };

    app._runCleanupActions();

    expect(app.timer.stopInterval).toHaveBeenCalledTimes(1);
    expect(app.timer.stop).not.toHaveBeenCalled();
  });
});
