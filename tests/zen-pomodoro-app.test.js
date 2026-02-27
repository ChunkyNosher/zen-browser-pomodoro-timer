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
});
