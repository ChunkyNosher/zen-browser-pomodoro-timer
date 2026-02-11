/**
 * Unit tests for shared-blocker-utils module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createProgressListener,
  setupBrowserListeners,
  removeBrowserListeners,
  handleBlockerGoBack,
  updateBlockerTimerStatus,
  startBlockerTimerStatusUpdates,
  createBlockerButton,
  createBlockerButtons,
  setupHoldToUnlockHandlers,
} from '../src/shared-blocker-utils.js';

// Helper to create mock DOM elements
function createMockElement(tag = 'div') {
  return {
    textContent: '',
    className: '',
    id: '',
    style: {
      width: '',
      setProperty: vi.fn(),
    },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    remove: vi.fn(),
  };
}

describe('createProgressListener', () => {
  it('should return object with correct interface methods', () => {
    const checkCallback = vi.fn();
    const listener = createProgressListener(checkCallback, 100);

    expect(listener).toBeDefined();
    expect(listener).toHaveProperty('QueryInterface');
    expect(listener).toHaveProperty('onLocationChange');
    expect(listener).toHaveProperty('onStateChange');
    expect(listener).toHaveProperty('onProgressChange');
    expect(listener).toHaveProperty('onStatusChange');
    expect(listener).toHaveProperty('onSecurityChange');
    expect(listener).toHaveProperty('onContentBlockingEvent');
  });

  it('should call callback with delay for top-level navigation', () => {
    vi.useFakeTimers();
    const checkCallback = vi.fn();
    const listener = createProgressListener(checkCallback, 100);

    const webProgress = { isTopLevel: true };
    listener.onLocationChange(webProgress, null, null);

    expect(checkCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(checkCallback).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should ignore non-top-level navigation', () => {
    vi.useFakeTimers();
    const checkCallback = vi.fn();
    const listener = createProgressListener(checkCallback, 100);

    const webProgress = { isTopLevel: false };
    listener.onLocationChange(webProgress, null, null);

    vi.advanceTimersByTime(200);
    expect(checkCallback).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should have noop methods for other progress events', () => {
    const checkCallback = vi.fn();
    const listener = createProgressListener(checkCallback, 100);

    expect(() => {
      listener.onStateChange();
      listener.onProgressChange();
      listener.onStatusChange();
      listener.onSecurityChange();
      listener.onContentBlockingEvent();
    }).not.toThrow();
  });

  it('should return null on error', () => {
    const originalChrome = globalThis.ChromeUtils;
    globalThis.ChromeUtils = {
      generateQI: () => {
        throw new Error('Mock error');
      },
    };

    const checkCallback = vi.fn();
    const listener = createProgressListener(checkCallback, 100);

    expect(listener).toBeNull();

    globalThis.ChromeUtils = originalChrome;
  });

  it('should call QueryInterface without errors', () => {
    const checkCallback = vi.fn();
    const listener = createProgressListener(checkCallback, 100);

    expect(() => {
      listener.QueryInterface(['nsIWebProgressListener']);
    }).not.toThrow();
  });
});

describe('setupBrowserListeners', () => {
  let mockContext;
  let originalGBrowser;

  beforeEach(() => {
    mockContext = {
      tabSelectHandler: null,
      pageShowHandler: null,
      progressListener: null,
      _tabSelectDelayTimeout: null,
    };

    originalGBrowser = globalThis.gBrowser;
    globalThis.gBrowser = {
      tabContainer: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addProgressListener: vi.fn(),
      removeProgressListener: vi.fn(),
      selectedBrowser: {
        currentURI: { spec: 'about:blank' },
      },
    };
  });

  afterEach(() => {
    globalThis.gBrowser = originalGBrowser;
  });

  it('should set up TabSelect handler on gBrowser.tabContainer', () => {
    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    expect(mockContext.tabSelectHandler).toBeDefined();
    expect(globalThis.gBrowser.tabContainer.addEventListener).toHaveBeenCalledWith(
      'TabSelect',
      mockContext.tabSelectHandler
    );
  });

  it('should set up pageshow handler on gBrowser', () => {
    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    expect(mockContext.pageShowHandler).toBeDefined();
    expect(globalThis.gBrowser.addEventListener).toHaveBeenCalledWith(
      'pageshow',
      mockContext.pageShowHandler
    );
  });

  it('should create and add progress listener', () => {
    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    expect(mockContext.progressListener).toBeDefined();
    expect(globalThis.gBrowser.addProgressListener).toHaveBeenCalledWith(
      mockContext.progressListener
    );
  });

  it('should have tab select handler with debounce timeout', () => {
    vi.useFakeTimers();
    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    mockContext.tabSelectHandler();

    expect(checkCallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(checkCallback).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should clear pending timeout when tab select fires again', () => {
    vi.useFakeTimers();
    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    mockContext.tabSelectHandler();
    vi.advanceTimersByTime(50);

    mockContext.tabSelectHandler();
    vi.advanceTimersByTime(50);

    // Should only be called once (second call canceled first)
    expect(checkCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(checkCallback).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should have pageshow handler with delay', () => {
    vi.useFakeTimers();
    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    mockContext.pageShowHandler();

    expect(checkCallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(checkCallback).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should handle missing gBrowser.tabContainer gracefully', () => {
    globalThis.gBrowser = {
      tabContainer: null,
      addEventListener: vi.fn(),
      addProgressListener: vi.fn(),
    };

    const checkCallback = vi.fn();
    expect(() => {
      setupBrowserListeners(mockContext, checkCallback, 100);
    }).not.toThrow();

    expect(mockContext.tabSelectHandler).toBeDefined();
  });

  it('should handle undefined gBrowser gracefully', () => {
    const savedGBrowser = globalThis.gBrowser;
    // @ts-ignore - testing undefined case
    delete globalThis.gBrowser;

    const checkCallback = vi.fn();
    expect(() => {
      setupBrowserListeners(mockContext, checkCallback, 100);
    }).not.toThrow();

    globalThis.gBrowser = savedGBrowser;
  });

  it('should handle addProgressListener error gracefully', () => {
    globalThis.gBrowser.addProgressListener = () => {
      throw new Error('Mock error');
    };

    const checkCallback = vi.fn();
    expect(() => {
      setupBrowserListeners(mockContext, checkCallback, 100);
    }).not.toThrow();
  });

  it('should handle null progress listener from createProgressListener', () => {
    const originalChrome = globalThis.ChromeUtils;
    globalThis.ChromeUtils = {
      generateQI: () => {
        throw new Error('Mock error');
      },
    };

    const checkCallback = vi.fn();
    setupBrowserListeners(mockContext, checkCallback, 100);

    expect(mockContext.progressListener).toBeNull();
    expect(globalThis.gBrowser.addProgressListener).not.toHaveBeenCalled();

    globalThis.ChromeUtils = originalChrome;
  });
});

describe('removeBrowserListeners', () => {
  let mockContext;
  let originalGBrowser;

  beforeEach(() => {
    mockContext = {
      tabSelectHandler: vi.fn(),
      pageShowHandler: vi.fn(),
      progressListener: {},
      _tabSelectDelayTimeout: null,
    };

    originalGBrowser = globalThis.gBrowser;
    globalThis.gBrowser = {
      tabContainer: {
        removeEventListener: vi.fn(),
      },
      removeEventListener: vi.fn(),
      removeProgressListener: vi.fn(),
    };
  });

  afterEach(() => {
    globalThis.gBrowser = originalGBrowser;
  });

  it('should remove TabSelect listener', () => {
    removeBrowserListeners(mockContext);

    expect(globalThis.gBrowser.tabContainer.removeEventListener).toHaveBeenCalledWith(
      'TabSelect',
      mockContext.tabSelectHandler
    );
  });

  it('should remove pageshow listener', () => {
    removeBrowserListeners(mockContext);

    expect(globalThis.gBrowser.removeEventListener).toHaveBeenCalledWith(
      'pageshow',
      mockContext.pageShowHandler
    );
  });

  it('should remove progress listener', () => {
    removeBrowserListeners(mockContext);

    expect(globalThis.gBrowser.removeProgressListener).toHaveBeenCalledWith(
      mockContext.progressListener
    );
  });

  it('should clear pending tab select timeout', () => {
    vi.useFakeTimers();
    mockContext._tabSelectDelayTimeout = setTimeout(() => {}, 1000);

    removeBrowserListeners(mockContext);

    expect(mockContext._tabSelectDelayTimeout).toBeNull();

    vi.useRealTimers();
  });

  it('should handle missing gBrowser gracefully', () => {
    const savedGBrowser = globalThis.gBrowser;
    // @ts-ignore - testing undefined case
    delete globalThis.gBrowser;

    expect(() => {
      removeBrowserListeners(mockContext);
    }).not.toThrow();

    globalThis.gBrowser = savedGBrowser;
  });

  it('should handle missing tabContainer gracefully', () => {
    globalThis.gBrowser = {
      tabContainer: null,
      removeEventListener: vi.fn(),
      removeProgressListener: vi.fn(),
    };

    expect(() => {
      removeBrowserListeners(mockContext);
    }).not.toThrow();
  });

  it('should handle missing handlers gracefully', () => {
    mockContext.tabSelectHandler = null;
    mockContext.pageShowHandler = null;
    mockContext.progressListener = null;

    expect(() => {
      removeBrowserListeners(mockContext);
    }).not.toThrow();
  });

  it('should handle removeProgressListener error gracefully', () => {
    globalThis.gBrowser.removeProgressListener = () => {
      throw new Error('Mock error');
    };

    expect(() => {
      removeBrowserListeners(mockContext);
    }).not.toThrow();
  });

  it('should not clear timeout if not set', () => {
    mockContext._tabSelectDelayTimeout = null;

    expect(() => {
      removeBrowserListeners(mockContext);
    }).not.toThrow();

    expect(mockContext._tabSelectDelayTimeout).toBeNull();
  });
});

describe('handleBlockerGoBack', () => {
  let originalGBrowser;
  let originalServices;

  beforeEach(() => {
    originalGBrowser = globalThis.gBrowser;
    originalServices = globalThis.Services;

    globalThis.Services = {
      io: {
        newURI: vi.fn((uri) => ({ spec: uri })),
      },
      scriptSecurityManager: {
        createNullPrincipal: vi.fn(() => ({})),
      },
    };
  });

  afterEach(() => {
    globalThis.gBrowser = originalGBrowser;
    globalThis.Services = originalServices;
  });

  it('should call goBack when canGoBack is true', () => {
    vi.useFakeTimers();
    const goBackFn = vi.fn();
    const hideCallback = vi.fn();

    globalThis.gBrowser = {
      selectedBrowser: {
        webNavigation: {
          canGoBack: true,
          goBack: goBackFn,
        },
      },
    };

    handleBlockerGoBack(hideCallback, 100);

    expect(goBackFn).toHaveBeenCalled();
    expect(hideCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(hideCallback).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should navigate to about:blank when canGoBack is false', () => {
    vi.useFakeTimers();
    const loadURIFn = vi.fn();
    const hideCallback = vi.fn();

    globalThis.gBrowser = {
      selectedBrowser: {
        webNavigation: {
          canGoBack: false,
        },
        loadURI: loadURIFn,
      },
    };

    handleBlockerGoBack(hideCallback, 100);

    expect(loadURIFn).toHaveBeenCalledWith(
      { spec: 'about:blank' },
      expect.objectContaining({ triggeringPrincipal: expect.any(Object) })
    );

    vi.advanceTimersByTime(100);
    expect(hideCallback).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should call hideBlockerCallback on last resort', () => {
    const savedGBrowser = globalThis.gBrowser;
    // @ts-ignore - testing undefined case
    delete globalThis.gBrowser;

    const hideCallback = vi.fn();
    handleBlockerGoBack(hideCallback, 100);

    expect(hideCallback).toHaveBeenCalled();

    globalThis.gBrowser = savedGBrowser;
  });

  it('should handle errors gracefully', () => {
    globalThis.gBrowser = {
      selectedBrowser: {
        webNavigation: {
          get canGoBack() {
            throw new Error('Mock error');
          },
        },
      },
    };

    const hideCallback = vi.fn();
    expect(() => {
      handleBlockerGoBack(hideCallback, 100);
    }).not.toThrow();

    expect(hideCallback).toHaveBeenCalled();
  });

  it('should handle missing selectedBrowser gracefully', () => {
    globalThis.gBrowser = {
      selectedBrowser: null,
    };

    const hideCallback = vi.fn();
    handleBlockerGoBack(hideCallback, 100);

    expect(hideCallback).toHaveBeenCalled();
  });

  it('should handle missing webNavigation gracefully', () => {
    globalThis.gBrowser = {
      selectedBrowser: {
        webNavigation: null,
      },
    };

    const hideCallback = vi.fn();
    handleBlockerGoBack(hideCallback, 100);

    expect(hideCallback).toHaveBeenCalled();
  });
});

describe('updateBlockerTimerStatus', () => {
  let statusElement;
  let originalWindow;

  beforeEach(() => {
    statusElement = createMockElement('div');
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('should show timer status with phase and time', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'focus',
            remainingTime: 1500,
            mode: 'pomodoro',
            currentCycle: 2,
            totalCycles: 4,
          }),
          isActive: true,
        },
      },
    };

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toContain('Focus');
    expect(statusElement.textContent).toContain('25:00');
    expect(statusElement.textContent).toContain('Cycle 2/4');
  });

  it('should show cycle info for pomodoro mode', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'break',
            remainingTime: 300,
            mode: 'pomodoro',
            currentCycle: 1,
            totalCycles: 4,
          }),
        },
      },
    };

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toContain('Break');
    expect(statusElement.textContent).toContain('5:00');
    expect(statusElement.textContent).toContain('Cycle 1/4');
  });

  it('should hide cycle info for simple mode', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'focus',
            remainingTime: 1200,
            mode: 'simple',
          }),
        },
      },
    };

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toContain('Focus');
    expect(statusElement.textContent).toContain('20:00');
    expect(statusElement.textContent).not.toContain('Cycle');
  });

  it('should handle no timer gracefully', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: null,
      },
    };

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toBe('');
  });

  it('should handle no status gracefully', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => null,
        },
      },
    };

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toBe('');
  });

  it('should handle missing zenPomodoroApp gracefully', () => {
    globalThis.window = {};

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toBe('');
  });

  it('should handle null statusElement gracefully', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'focus',
            remainingTime: 1500,
            mode: 'simple',
          }),
        },
      },
    };

    expect(() => {
      updateBlockerTimerStatus(null);
    }).not.toThrow();
  });

  it('should format time correctly', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'focus',
            remainingTime: 65,
            mode: 'simple',
          }),
        },
      },
    };

    updateBlockerTimerStatus(statusElement);

    expect(statusElement.textContent).toContain('1:05');
  });

  it('should show long break phase', () => {
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'longBreak',
            remainingTime: 900,
            mode: 'pomodoro',
            currentCycle: 4,
            totalCycles: 4,
          }),
        },
      },
    };

    updateBlockerTimerStatus(statusElement);

    // longBreak phase maps to 'Break' in getShortPhaseLabel
    expect(statusElement.textContent).toContain('Break');
    expect(statusElement.textContent).toContain('15:00');
  });
});

describe('startBlockerTimerStatusUpdates', () => {
  let mockContext;
  let statusElement;
  let originalWindow;

  beforeEach(() => {
    statusElement = createMockElement('div');
    mockContext = {
      isBlocking: true,
      _timerStatusInterval: null,
      _hideBlocker: vi.fn(),
    };

    originalWindow = globalThis.window;
    globalThis.window = {
      zenPomodoroApp: {
        timer: {
          getStatus: () => ({
            currentPhase: 'focus',
            remainingTime: 1500,
            mode: 'simple',
          }),
          isActive: true,
        },
      },
    };
  });

  afterEach(() => {
    if (mockContext._timerStatusInterval) {
      clearInterval(mockContext._timerStatusInterval);
    }
    globalThis.window = originalWindow;
  });

  it('should update status immediately', () => {
    startBlockerTimerStatusUpdates(mockContext, statusElement);

    expect(statusElement.textContent).toContain('Focus');
  });

  it('should start interval for periodic updates', () => {
    vi.useFakeTimers();

    startBlockerTimerStatusUpdates(mockContext, statusElement);

    expect(mockContext._timerStatusInterval).toBeDefined();

    statusElement.textContent = '';
    vi.advanceTimersByTime(1000);

    expect(statusElement.textContent).toContain('Focus');

    vi.useRealTimers();
  });

  it('should update multiple times', () => {
    vi.useFakeTimers();

    let updateCount = 0;
    globalThis.window.zenPomodoroApp.timer.getStatus = () => {
      updateCount++;
      return {
        currentPhase: 'focus',
        remainingTime: 1500 - updateCount,
        mode: 'simple',
      };
    };

    startBlockerTimerStatusUpdates(mockContext, statusElement);

    // startBlockerTimerStatusUpdates calls once immediately (updateCount = 1)
    // Then 3 more times for 3 seconds (updateCount = 4)
    vi.advanceTimersByTime(3000);

    expect(updateCount).toBeGreaterThanOrEqual(4);

    vi.useRealTimers();
  });

  it('should hide blocker when timer not active', () => {
    vi.useFakeTimers();

    startBlockerTimerStatusUpdates(mockContext, statusElement);

    globalThis.window.zenPomodoroApp.timer.isActive = false;

    vi.advanceTimersByTime(1000);

    expect(mockContext._hideBlocker).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should not update when isBlocking is false', () => {
    vi.useFakeTimers();

    mockContext.isBlocking = false;
    startBlockerTimerStatusUpdates(mockContext, statusElement);

    const initialText = statusElement.textContent;
    statusElement.textContent = '';

    vi.advanceTimersByTime(1000);

    expect(statusElement.textContent).toBe('');

    vi.useRealTimers();
  });

  it('should not update when statusElement is null', () => {
    vi.useFakeTimers();

    // With the null check in updateBlockerTimerStatus, this should not throw
    expect(() => {
      startBlockerTimerStatusUpdates(mockContext, null);
    }).not.toThrow();

    vi.advanceTimersByTime(1000);

    // _hideBlocker should not be called since statusElement is null
    expect(mockContext._hideBlocker).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe('createBlockerButton', () => {
  beforeEach(() => {
    globalThis.document = {
      createElement: (tag) => createMockElement(tag),
    };
  });

  it('should create button with correct class', () => {
    const onClick = vi.fn();
    const button = createBlockerButton('secondary', 'Test Button', onClick);

    expect(button.className).toContain('zen-pomodoro-dialog-button');
    expect(button.className).toContain('secondary');
  });

  it('should create button with correct text', () => {
    const onClick = vi.fn();
    const button = createBlockerButton('primary', 'Click Me', onClick);

    expect(button.textContent).toBe('Click Me');
  });

  it('should attach click handler', () => {
    const onClick = vi.fn();
    const button = createBlockerButton('', 'Test', onClick);

    expect(button.addEventListener).toHaveBeenCalledWith('click', onClick);
  });

  it('should create button with empty className', () => {
    const onClick = vi.fn();
    const button = createBlockerButton('', 'No Class', onClick);

    expect(button.className).toContain('zen-pomodoro-dialog-button');
  });
});

describe('createBlockerButtons', () => {
  beforeEach(() => {
    globalThis.document = {
      createElement: (tag) => createMockElement(tag),
    };
  });

  it('should create container with correct ID', () => {
    const onGoBack = vi.fn();
    const onStopTimer = vi.fn();
    const buttons = createBlockerButtons('test-buttons', onGoBack, onStopTimer);

    expect(buttons.id).toBe('test-buttons');
  });

  it('should create Go Back button', () => {
    const onGoBack = vi.fn();
    const onStopTimer = vi.fn();
    const buttons = createBlockerButtons('test-buttons', onGoBack, onStopTimer);

    expect(buttons.appendChild).toHaveBeenCalledTimes(2);
    const firstButton = buttons.appendChild.mock.calls[0][0];
    expect(firstButton.textContent).toBe('Go Back');
    expect(firstButton.className).toContain('secondary');
  });

  it('should create Stop Timer button', () => {
    const onGoBack = vi.fn();
    const onStopTimer = vi.fn();
    const buttons = createBlockerButtons('test-buttons', onGoBack, onStopTimer);

    const secondButton = buttons.appendChild.mock.calls[1][0];
    expect(secondButton.textContent).toBe('Stop Timer');
  });

  it('should attach correct handlers', () => {
    const onGoBack = vi.fn();
    const onStopTimer = vi.fn();
    const buttons = createBlockerButtons('test-buttons', onGoBack, onStopTimer);

    const firstButton = buttons.appendChild.mock.calls[0][0];
    const secondButton = buttons.appendChild.mock.calls[1][0];

    expect(firstButton.addEventListener).toHaveBeenCalledWith('click', onGoBack);
    expect(secondButton.addEventListener).toHaveBeenCalledWith('click', onStopTimer);
  });
});

describe('setupHoldToUnlockHandlers', () => {
  let holdButton;
  let holdProgress;
  let timerElement;
  let onComplete;
  let intervalId;
  let clearIntervalFn;
  let setIntervalId;

  beforeEach(() => {
    holdButton = createMockElement('button');
    holdProgress = createMockElement('div');
    timerElement = createMockElement('span');
    onComplete = vi.fn();
    intervalId = null;
    clearIntervalFn = vi.fn(() => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });
    setIntervalId = vi.fn((id) => {
      intervalId = id;
    });
  });

  afterEach(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  it('should set up mouse event handlers', () => {
    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    expect(holdButton.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(holdButton.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(holdButton.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should set up touch event handlers', () => {
    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    expect(holdButton.addEventListener).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
      { passive: false }
    );
    expect(holdButton.addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
    expect(holdButton.addEventListener).toHaveBeenCalledWith('touchcancel', expect.any(Function));
  });

  it('should set up keyboard handlers', () => {
    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    expect(holdButton.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(holdButton.addEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
  });

  it('should count down on hold', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    // Simulate mousedown
    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];
    mousedownHandler({ type: 'mousedown' });

    // Timer starts at waitTime (3) and doesn't update until first interval
    vi.advanceTimersByTime(1000);
    expect(timerElement.textContent).toBe('2');

    vi.advanceTimersByTime(1000);
    expect(timerElement.textContent).toBe('1');

    vi.useRealTimers();
  });

  it('should update progress bar', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];
    mousedownHandler({ type: 'mousedown' });

    vi.advanceTimersByTime(1000);
    // (3 - 2) / 3 * 100 = 33.33...%
    expect(holdProgress.style.width).toMatch(/33\.33/);

    vi.advanceTimersByTime(1000);
    // (3 - 1) / 3 * 100 = 66.66...%
    expect(holdProgress.style.width).toMatch(/66\.66/);

    vi.useRealTimers();
  });

  it('should call onComplete when countdown reaches 0', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 2,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];
    mousedownHandler({ type: 'mousedown' });

    vi.advanceTimersByTime(2000);

    expect(onComplete).toHaveBeenCalled();
    expect(clearIntervalFn).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should reset on release', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];
    const mouseupHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mouseup'
    )[1];

    mousedownHandler({ type: 'mousedown' });
    vi.advanceTimersByTime(1000);

    expect(timerElement.textContent).toBe('2');

    mouseupHandler();

    expect(timerElement.textContent).toBe('3');
    expect(holdProgress.style.width).toBe('0%');

    vi.useRealTimers();
  });

  it('should reset on mouse leave', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];
    const mouseleaveHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mouseleave'
    )[1];

    mousedownHandler({ type: 'mousedown' });
    vi.advanceTimersByTime(1000);

    mouseleaveHandler();

    expect(timerElement.textContent).toBe('3');
    expect(holdProgress.style.width).toBe('0%');

    vi.useRealTimers();
  });

  it('should handle Enter key', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 2,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const keydownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    )[1];
    const keyupHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'keyup'
    )[1];

    const mockEvent = { key: 'Enter', preventDefault: vi.fn() };
    keydownHandler(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(timerElement.textContent).toBe('1');

    keyupHandler({ key: 'Enter' });
    expect(timerElement.textContent).toBe('2');

    vi.useRealTimers();
  });

  it('should handle Space key', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 2,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const keydownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    )[1];

    const mockEvent = { key: ' ', preventDefault: vi.fn() };
    keydownHandler(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(timerElement.textContent).toBe('1');

    vi.useRealTimers();
  });

  it('should ignore other keys', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const keydownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    )[1];

    keydownHandler({ key: 'a', preventDefault: vi.fn() });

    vi.advanceTimersByTime(1000);
    // Timer should not have started, so textContent remains empty
    expect(timerElement.textContent).toBe('');
    expect(setIntervalId).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should return cleanup function', () => {
    const cleanup = setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    expect(cleanup).toBeInstanceOf(Function);
  });

  it('should remove all listeners on cleanup', () => {
    const cleanup = setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    cleanup();

    expect(holdButton.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('touchcancel', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(holdButton.removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
  });

  it('should clear pending interval on new mousedown', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];

    mousedownHandler({ type: 'mousedown' });
    vi.advanceTimersByTime(500);

    clearIntervalFn.mockClear();
    mousedownHandler({ type: 'mousedown' });

    expect(clearIntervalFn).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should prevent default on touchstart', () => {
    const cleanup = setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const touchstartHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'touchstart'
    )[1];

    const mockEvent = { type: 'touchstart', preventDefault: vi.fn() };
    touchstartHandler(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();

    cleanup();
  });

  it('should handle touchend', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const touchstartHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'touchstart'
    )[1];
    const touchendHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'touchend'
    )[1];

    touchstartHandler({ type: 'touchstart', preventDefault: vi.fn() });
    vi.advanceTimersByTime(1000);

    touchendHandler();

    expect(timerElement.textContent).toBe('3');
    expect(holdProgress.style.width).toBe('0%');

    vi.useRealTimers();
  });

  it('should handle touchcancel', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 3,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const touchstartHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'touchstart'
    )[1];
    const touchcancelHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'touchcancel'
    )[1];

    touchstartHandler({ type: 'touchstart', preventDefault: vi.fn() });
    vi.advanceTimersByTime(1000);

    touchcancelHandler();

    expect(timerElement.textContent).toBe('3');

    vi.useRealTimers();
  });

  it('should handle missing holdProgress gracefully', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress: null,
      waitTime: 2,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];

    expect(() => {
      mousedownHandler({ type: 'mousedown' });
      vi.advanceTimersByTime(1000);
    }).not.toThrow();

    vi.useRealTimers();
  });

  it('should handle missing timerElement gracefully', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 2,
      timerElement: null,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];

    expect(() => {
      mousedownHandler({ type: 'mousedown' });
      vi.advanceTimersByTime(1000);
    }).not.toThrow();

    vi.useRealTimers();
  });

  it('should use custom log category and message', () => {
    vi.useFakeTimers();

    setupHoldToUnlockHandlers({
      holdButton,
      holdProgress,
      waitTime: 1,
      timerElement,
      onComplete,
      clearInterval: clearIntervalFn,
      setIntervalId,
      logCategory: 'CUSTOM_CATEGORY',
      logMessage: 'Custom completion message',
    });

    const mousedownHandler = holdButton.addEventListener.mock.calls.find(
      (call) => call[0] === 'mousedown'
    )[1];

    mousedownHandler({ type: 'mousedown' });
    vi.advanceTimersByTime(1000);

    expect(onComplete).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
