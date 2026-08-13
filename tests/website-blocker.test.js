import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/helpers.js', () => ({
  getConfig: vi.fn(() => ({ activeRulesets: ['default'], rulesets: [] })),
  LOG_CATEGORIES: { INIT: 'INIT', SECURITY: 'SECURITY' },
  REGEX_ESCAPE_PATTERN: /[.*+?^${}()|[\]\\]/g,
  REGEX_ESCAPE_PATTERN_KEEP_ASTERISK: /[.+?^${}()|[\]\\]/g,
}));

vi.mock('../src/log-manager.js', () => ({
  logger: { log: vi.fn() },
}));

vi.mock('../src/ui-helpers.js', () => ({
  handleStopTimerWithLockout: vi.fn(),
}));

vi.mock('../src/break-phase-utils.js', () => ({
  isInBreakPhase: vi.fn(() => false),
}));

vi.mock('../src/shared-blocker-utils.js', () => ({
  setupBrowserListeners: vi.fn(),
  removeBrowserListeners: vi.fn(),
  handleBlockerGoBack: vi.fn(),
  startBlockerTimerStatusUpdates: vi.fn(),
  createBlockerButtons: vi.fn(),
  updateBlockerTimerStatus: vi.fn(),
}));

import WebsiteBlocker from '../src/website-blocker.js';

describe('WebsiteBlocker title changes', () => {
  let blocker;
  let selectedTab;
  let originalGBrowser;
  let originalMutationObserver;
  let contentDocument;

  beforeEach(() => {
    selectedTab = { label: 'Initial title' };
    contentDocument = vi.fn(() => {
      throw new Error('contentDocument should not be accessed');
    });
    originalGBrowser = globalThis.gBrowser;
    originalMutationObserver = globalThis.MutationObserver;
    globalThis.MutationObserver = vi.fn();
    globalThis.gBrowser = {
      selectedTab,
      selectedBrowser: {},
      tabContainer: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    };
    Object.defineProperty(globalThis.gBrowser.selectedBrowser, 'contentDocument', {
      get: contentDocument,
    });
    blocker = new WebsiteBlocker();
    vi.spyOn(blocker, '_checkCurrentPage').mockImplementation(() => {});
    blocker._setupListeners();
  });

  afterEach(() => {
    if (blocker?.titleChangeHandler) blocker.destroy();
    globalThis.gBrowser = originalGBrowser;
    globalThis.MutationObserver = originalMutationObserver;
    vi.restoreAllMocks();
  });

  it('registers a TabAttrModified listener without accessing page content', () => {
    expect(globalThis.gBrowser.tabContainer.addEventListener).toHaveBeenCalledWith(
      'TabAttrModified',
      blocker.titleChangeHandler
    );
    expect(contentDocument).not.toHaveBeenCalled();
    expect(globalThis.MutationObserver).not.toHaveBeenCalled();
  });

  it('checks the current page for selected tab label and title changes', () => {
    blocker.titleChangeHandler({ target: selectedTab, detail: { changed: ['label'] } });
    blocker.titleChangeHandler({ target: selectedTab, detail: { changed: ['titlechanged'] } });

    expect(blocker._checkCurrentPage).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated attributes and changes to non-selected tabs', () => {
    blocker.titleChangeHandler({ target: selectedTab, detail: { changed: ['image'] } });
    blocker.titleChangeHandler({ target: {}, detail: { changed: ['label'] } });

    expect(blocker._checkCurrentPage).not.toHaveBeenCalled();
  });

  it('removes the title listener and clears its reference on destroy', () => {
    const handler = blocker.titleChangeHandler;

    blocker.destroy();

    expect(globalThis.gBrowser.tabContainer.removeEventListener).toHaveBeenCalledWith(
      'TabAttrModified',
      handler
    );
    expect(blocker.titleChangeHandler).toBeNull();
  });
});
