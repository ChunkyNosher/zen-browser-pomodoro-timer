import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogManager, logger } from '../src/log-manager.js';
import Constants from '../src/constants.js';

describe('LogManager Module', () => {
  describe('LogManager Class', () => {
    let logManager;

    beforeEach(() => {
      logManager = new LogManager();
      // Silence console.log during tests
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    describe('constructor', () => {
      it('should initialize with default maxLogSize of 1000', () => {
        expect(logManager.maxLogSize).toBe(1000);
        expect(logManager.logs).toEqual([]);
        expect(logManager.windowId).toBeNull();
      });

      it('should accept custom maxLogSize', () => {
        const customManager = new LogManager(500);
        expect(customManager.maxLogSize).toBe(500);
      });

      it('should initialize with empty logs array', () => {
        expect(Array.isArray(logManager.logs)).toBe(true);
        expect(logManager.logs.length).toBe(0);
      });

      it('should initialize observers as null', () => {
        expect(logManager._logObserver).toBeNull();
        expect(logManager._logRequestObserver).toBeNull();
      });

      it('should initialize storage as null', () => {
        expect(logManager._storage).toBeNull();
      });
    });

    describe('log', () => {
      it('should add log entry with timestamp, category, and message', () => {
        logManager.log('TIMER', 'Timer started');

        expect(logManager.logs.length).toBe(1);
        expect(logManager.logs[0].category).toBe('TIMER');
        expect(logManager.logs[0].message).toBe('Timer started');
        expect(logManager.logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });

      it('should add log entry with data', () => {
        logManager.log('SETTINGS', 'Config updated', { duration: 25, phase: 'focus' });

        expect(logManager.logs.length).toBe(1);
        expect(logManager.logs[0].data).toEqual({ duration: 25, phase: 'focus' });
      });

      it('should use "GENERAL" as default category when null', () => {
        logManager.log(null, 'Test message');

        expect(logManager.logs[0].category).toBe('GENERAL');
      });

      it('should handle null data', () => {
        logManager.log('TIMER', 'Test message', null);

        expect(logManager.logs[0].data).toBeUndefined();
      });

      it('should handle undefined data', () => {
        logManager.log('TIMER', 'Test message', undefined);

        expect(logManager.logs[0].data).toBeUndefined();
      });

      it('should sanitize sensitive data', () => {
        logManager.log('SECURITY', 'Code generated', { 
          code: '12345',
          password: 'secret',
          duration: 25 
        });

        expect(logManager.logs[0].data.code).toBe('[REDACTED]');
        expect(logManager.logs[0].data.password).toBe('[REDACTED]');
        expect(logManager.logs[0].data.duration).toBe(25);
      });

      it('should enforce max log size by removing oldest entries', () => {
        const smallManager = new LogManager(3);
        vi.spyOn(console, 'log').mockImplementation(() => {});

        smallManager.log('TEST', 'Entry 1');
        smallManager.log('TEST', 'Entry 2');
        smallManager.log('TEST', 'Entry 3');
        smallManager.log('TEST', 'Entry 4');

        expect(smallManager.logs.length).toBe(3);
        expect(smallManager.logs[0].message).toBe('Entry 2');
        expect(smallManager.logs[1].message).toBe('Entry 3');
        expect(smallManager.logs[2].message).toBe('Entry 4');
      });

      it('should output to console', () => {
        const consoleSpy = vi.spyOn(console, 'log');
        logManager.log('TIMER', 'Test message');

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Zen Pomodoro][TIMER] Test message')
        );
      });

      it('should include data in console output', () => {
        const consoleSpy = vi.spyOn(console, 'log');
        logManager.log('SETTINGS', 'Config changed', { key: 'value' });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Zen Pomodoro][SETTINGS] Config changed | Data: {"key":"value"}')
        );
      });
    });

    describe('getLogs', () => {
      it('should return copy of logs array', () => {
        logManager.log('TIMER', 'Test');
        const logs = logManager.getLogs();

        expect(logs).toEqual(logManager.logs);
        expect(logs).not.toBe(logManager.logs); // Should be a copy
      });

      it('should return empty array when no logs', () => {
        const logs = logManager.getLogs();
        expect(logs).toEqual([]);
      });
    });

    describe('clearLogs', () => {
      it('should clear all logs', () => {
        logManager.log('TIMER', 'Entry 1');
        logManager.log('TIMER', 'Entry 2');
        
        expect(logManager.logs.length).toBe(2);
        
        logManager.clearLogs();
        
        expect(logManager.logs.length).toBe(0);
        expect(logManager.logs).toEqual([]);
      });

      it('should log clear action to console', () => {
        const consoleSpy = vi.spyOn(console, 'log');
        logManager.clearLogs();

        expect(consoleSpy).toHaveBeenCalledWith('[Zen Pomodoro][LOGGER] Logs cleared');
      });
    });

    describe('setStorage', () => {
      it('should set storage reference', () => {
        const mockStorage = { getPref: vi.fn(), setPref: vi.fn() };
        logManager.setStorage(mockStorage);

        expect(logManager._storage).toBe(mockStorage);
      });

      it('should allow null storage', () => {
        logManager.setStorage(null);
        expect(logManager._storage).toBeNull();
      });

      it('should load persisted logs from storage on startup', () => {
        const mockStorage = {
          getPref: vi.fn(() => JSON.stringify([
            { timestamp: '2024-01-01T00:00:00.000Z', category: 'INIT', message: 'Loaded 1' },
            { timestamp: '2024-01-01T00:00:01.000Z', category: 'INIT', message: 'Loaded 2' },
          ])),
          setPref: vi.fn(),
        };

        logManager.setStorage(mockStorage);

        expect(logManager.logs.length).toBe(2);
        expect(logManager.logs[0].message).toBe('Loaded 1');
      });

      it('should cap persisted logs to maxLogSize when loading', () => {
        const smallManager = new LogManager(2);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const mockStorage = {
          getPref: vi.fn(() => JSON.stringify([
            { timestamp: '2024-01-01T00:00:00.000Z', category: 'INIT', message: 'A' },
            { timestamp: '2024-01-01T00:00:01.000Z', category: 'INIT', message: 'B' },
            { timestamp: '2024-01-01T00:00:02.000Z', category: 'INIT', message: 'C' },
          ])),
          setPref: vi.fn(),
        };

        smallManager.setStorage(mockStorage);

        expect(smallManager.logs.length).toBe(2);
        expect(smallManager.logs[0].message).toBe('B');
        expect(smallManager.logs[1].message).toBe('C');
      });
    });

    describe('setWindowId', () => {
      it('should set window ID', () => {
        logManager.setWindowId('window-123');
        expect(logManager.windowId).toBe('window-123');
      });

      it('should allow null window ID', () => {
        logManager.setWindowId('test');
        logManager.setWindowId(null);
        expect(logManager.windowId).toBeNull();
      });
    });

    describe('_sanitizeData', () => {
      it('should handle null and undefined', () => {
        expect(logManager._sanitizeData(null)).toBeNull();
        expect(logManager._sanitizeData(undefined)).toBeUndefined();
      });

      it('should return primitives unchanged', () => {
        expect(logManager._sanitizeData('string')).toBe('string');
        expect(logManager._sanitizeData(123)).toBe(123);
        expect(logManager._sanitizeData(true)).toBe(true);
      });

      it('should sanitize objects with sensitive keys', () => {
        const data = {
          code: '12345',
          password: 'secret',
          username: 'user',
        };

        const sanitized = logManager._sanitizeData(data);

        expect(sanitized.code).toBe('[REDACTED]');
        expect(sanitized.password).toBe('[REDACTED]');
        expect(sanitized.username).toBe('user');
      });

      it('should sanitize nested objects', () => {
        const data = {
          user: {
            name: 'John',
            password: 'secret',
          },
          config: {
            code: '12345',
            duration: 25,
          },
        };

        const sanitized = logManager._sanitizeData(data);

        expect(sanitized.user.name).toBe('John');
        expect(sanitized.user.password).toBe('[REDACTED]');
        expect(sanitized.config.code).toBe('[REDACTED]');
        expect(sanitized.config.duration).toBe(25);
      });

      it('should sanitize arrays', () => {
        const data = [
          { code: '123', value: 1 },
          { password: 'secret', value: 2 },
        ];

        const sanitized = logManager._sanitizeData(data);

        expect(sanitized[0].code).toBe('[REDACTED]');
        expect(sanitized[0].value).toBe(1);
        expect(sanitized[1].password).toBe('[REDACTED]');
        expect(sanitized[1].value).toBe(2);
      });

      it('should be case-insensitive for sensitive keys', () => {
        const data = {
          Code: '123',
          PASSWORD: 'secret',
          PassWord: 'secret2',
        };

        const sanitized = logManager._sanitizeData(data);

        expect(sanitized.Code).toBe('[REDACTED]');
        expect(sanitized.PASSWORD).toBe('[REDACTED]');
        expect(sanitized.PassWord).toBe('[REDACTED]');
      });
    });

    describe('_isSensitiveKey', () => {
      it('should detect sensitive keys from SENSITIVE_KEYS constant', () => {
        expect(logManager._isSensitiveKey('code')).toBe(true);
        expect(logManager._isSensitiveKey('password')).toBe(true);
      });

      it('should be case-insensitive', () => {
        expect(logManager._isSensitiveKey('CODE')).toBe(true);
        expect(logManager._isSensitiveKey('Password')).toBe(true);
        expect(logManager._isSensitiveKey('PASSWORD')).toBe(true);
      });

      it('should detect keys containing sensitive substrings', () => {
        expect(logManager._isSensitiveKey('lockCode')).toBe(true);
        expect(logManager._isSensitiveKey('userPassword')).toBe(true);
      });

      it('should not detect non-sensitive keys', () => {
        expect(logManager._isSensitiveKey('duration')).toBe(false);
        expect(logManager._isSensitiveKey('phase')).toBe(false);
        expect(logManager._isSensitiveKey('workspace')).toBe(false);
      });
    });

    describe('exportLogs', () => {
      it('should create export data with metadata', () => {
        vi.useFakeTimers();
        const mockStorage = { getPref: vi.fn(() => ''), setPref: vi.fn() };
        logManager.setStorage(mockStorage);
        logManager.log('TIMER', 'Entry 1');
        logManager.log('TIMER', 'Entry 2');

        // Mock DOM and URL APIs
        const mockUrl = 'blob:mockurl';
        const mockCreateObjectURL = vi.fn(() => mockUrl);
        const mockRevokeObjectURL = vi.fn();
        const mockClick = vi.fn();
        
        global.URL.createObjectURL = mockCreateObjectURL;
        global.URL.revokeObjectURL = mockRevokeObjectURL;
        
        const mockAnchor = {
          href: '',
          download: '',
          click: mockClick,
        };

        // Mock document.createElement for anchor element
        global.document = global.document || {};
        global.document.createElement = vi.fn().mockReturnValue(mockAnchor);

        logManager.exportLogs();

        // Should have logged the export action (adds 1 more log)
        expect(logManager.logs.length).toBe(3);
        expect(logManager.logs[2].message).toBe('Logs exported');

        // Should create blob and anchor
        expect(mockCreateObjectURL).toHaveBeenCalled();
        const blob = mockCreateObjectURL.mock.calls[0][0];
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/json');

        // Should trigger download
        expect(mockAnchor.href).toBe(mockUrl);
        expect(mockAnchor.download).toMatch(/^zen-pomodoro-logs-\d+\.json$/);
        expect(mockClick).toHaveBeenCalled();
        expect(mockStorage.setPref).toHaveBeenCalledWith(
          Constants.PERSISTED_LOGS_PREF_KEY,
          expect.stringContaining('Logs exported')
        );
        vi.useRealTimers();
      });
    });

    describe('persistence', () => {
      it('should debounce routine log persistence', () => {
        vi.useFakeTimers();
        const mockStorage = { getPref: vi.fn(() => ''), setPref: vi.fn() };
        logManager.setStorage(mockStorage);

        logManager.log('TIMER', 'Persist me');

        expect(mockStorage.setPref).not.toHaveBeenCalled();

        vi.advanceTimersByTime(4999);
        expect(mockStorage.setPref).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);

        expect(mockStorage.setPref).toHaveBeenCalledWith(
          Constants.PERSISTED_LOGS_PREF_KEY,
          expect.any(String)
        );
        const persistedJson = mockStorage.setPref.mock.calls.at(-1)[1];
        const persistedLogs = JSON.parse(persistedJson);
        expect(persistedLogs[persistedLogs.length - 1].message).toBe('Persist me');
        vi.advanceTimersByTime(5000);
        expect(mockStorage.setPref).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
      });

      it('should immediately persist an empty array and cancel pending writes after clearLogs', () => {
        vi.useFakeTimers();
        const mockStorage = { getPref: vi.fn(() => ''), setPref: vi.fn() };
        logManager.setStorage(mockStorage);
        logManager.log('TIMER', 'Entry 1');

        logManager.clearLogs();

        expect(mockStorage.setPref).toHaveBeenCalledWith(
          Constants.PERSISTED_LOGS_PREF_KEY,
          '[]'
        );
        vi.advanceTimersByTime(5000);
        expect(mockStorage.setPref).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
      });

      it('should persist capped logs when maxLogSize is exceeded', () => {
        vi.useFakeTimers();
        const smallManager = new LogManager(2);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const mockStorage = { getPref: vi.fn(() => ''), setPref: vi.fn() };
        smallManager.setStorage(mockStorage);

        smallManager.log('TEST', 'Entry 1');
        smallManager.log('TEST', 'Entry 2');
        smallManager.log('TEST', 'Entry 3');

        vi.advanceTimersByTime(5000);

        const persistedJson = mockStorage.setPref.mock.calls.at(-1)[1];
        const persistedLogs = JSON.parse(persistedJson);
        expect(persistedLogs.length).toBe(2);
        expect(persistedLogs[0].message).toBe('Entry 2');
        expect(persistedLogs[1].message).toBe('Entry 3');
        vi.useRealTimers();
      });

      it('should immediately flush pending logs on destroy', () => {
        vi.useFakeTimers();
        const mockStorage = { getPref: vi.fn(() => ''), setPref: vi.fn() };
        logManager.setStorage(mockStorage);
        logManager.log('TIMER', 'Final entry');

        logManager.destroy();

        expect(mockStorage.setPref).toHaveBeenCalledWith(
          Constants.PERSISTED_LOGS_PREF_KEY,
          expect.stringContaining('Final entry')
        );
        vi.useRealTimers();
      });
    });
  });

  describe('logger Singleton', () => {
    it('should export logger instance', () => {
      expect(logger).toBeInstanceOf(LogManager);
    });

    it('should have default max log size of 1000', () => {
      expect(logger.maxLogSize).toBe(1000);
    });
  });

  describe('Cross-window Sync', () => {
    let logManager;
    let mockStorage;

    beforeEach(() => {
      logManager = new LogManager();
      mockStorage = {
        getPref: vi.fn(),
        setPref: vi.fn(),
      };
      logManager.setStorage(mockStorage);
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    describe('initSync', () => {
      it('should not initialize if no windowId', () => {
        const addObserverSpy = vi.spyOn(Services.obs, 'addObserver');
        
        logManager.initSync();

        expect(addObserverSpy).not.toHaveBeenCalled();
        expect(logManager._logObserver).toBeNull();
      });

      it('should register observers when windowId is set', () => {
        const addObserverSpy = vi.spyOn(Services.obs, 'addObserver');
        logManager.setWindowId('window-123');

        logManager.initSync();

        expect(addObserverSpy).toHaveBeenCalledTimes(2);
        expect(addObserverSpy).toHaveBeenCalledWith(
          logManager._logObserver,
          Constants.LOG_BROADCAST_TOPIC
        );
        expect(addObserverSpy).toHaveBeenCalledWith(
          logManager._logRequestObserver,
          Constants.LOG_REQUEST_TOPIC
        );
      });
    });

    describe('destroySync', () => {
      it('should remove observers', () => {
        const removeObserverSpy = vi.spyOn(Services.obs, 'removeObserver');
        logManager.setWindowId('window-123');
        logManager.initSync();

        logManager.destroySync();

        expect(removeObserverSpy).toHaveBeenCalledTimes(2);
        expect(logManager._logObserver).toBeNull();
        expect(logManager._logRequestObserver).toBeNull();
      });

      it('should not throw if observers not initialized', () => {
        expect(() => logManager.destroySync()).not.toThrow();
      });
    });

    describe('requestExistingLogs', () => {
      it('should not request if no windowId', () => {
        const notifySpy = vi.spyOn(Services.obs, 'notifyObservers');
        
        logManager.requestExistingLogs();

        expect(notifySpy).not.toHaveBeenCalled();
      });

      it('should not request if no storage', () => {
        logManager.setStorage(null);
        logManager.setWindowId('window-123');
        const notifySpy = vi.spyOn(Services.obs, 'notifyObservers');
        
        logManager.requestExistingLogs();

        expect(notifySpy).not.toHaveBeenCalled();
      });

      it('should broadcast request and merge shared logs', () => {
        logManager.setWindowId('window-123');
        const notifySpy = vi.spyOn(Services.obs, 'notifyObservers');
        
        const sharedLogs = [
          { timestamp: '2024-01-01T00:00:00.000Z', category: 'TIMER', message: 'Test' },
        ];
        mockStorage.getPref.mockReturnValue(JSON.stringify(sharedLogs));

        logManager.requestExistingLogs();

        expect(notifySpy).toHaveBeenCalledWith(
          null,
          Constants.LOG_REQUEST_TOPIC,
          'window-123'
        );
        expect(mockStorage.getPref).toHaveBeenCalledWith('shared-logs-window-123', '');
        expect(logManager.logs.length).toBe(1);
        expect(logManager.logs[0].message).toBe('Test');
      });

      it('should handle empty shared logs', () => {
        logManager.setWindowId('window-123');
        mockStorage.getPref.mockReturnValue('');

        logManager.requestExistingLogs();

        expect(logManager.logs.length).toBe(0);
      });
    });

    it('broadcasts local entries immediately but does not rebroadcast received entries', () => {
      vi.useFakeTimers();
      const notifySpy = vi.spyOn(Services.obs, 'notifyObservers');
      logManager.setWindowId('window-123');
      logManager.initSync();

      logManager.log('TIMER', 'Local entry');

      expect(notifySpy).toHaveBeenCalledWith(
        null,
        Constants.LOG_BROADCAST_TOPIC,
        expect.stringContaining('Local entry')
      );

      const broadcastsBeforeReceive = notifySpy.mock.calls.length;
      logManager._logObserver.observe(
        null,
        Constants.LOG_BROADCAST_TOPIC,
        JSON.stringify({
          timestamp: '2024-01-01T00:00:00.000Z',
          category: 'TIMER',
          message: 'Remote entry',
          _sourceWindowId: 'window-456',
        })
      );

      expect(notifySpy).toHaveBeenCalledTimes(broadcastsBeforeReceive);
      expect(logManager.logs.at(-1).message).toBe('Remote entry');
      vi.advanceTimersByTime(5000);
      expect(mockStorage.setPref).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});
