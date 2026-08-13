/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { _setupDragCleanupObserver } from '../src/ui-helpers.js';

describe('_setupDragCleanupObserver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('observes only the direct parent and cleans up once when the dialog is removed', () => {
    let observer;
    class MockMutationObserver {
      constructor(callback) {
        this.callback = callback;
        observer = this;
        this.disconnect = vi.fn();
      }

      observe(...args) {
        this.observeMock(...args);
      }
    }
    vi.stubGlobal('MutationObserver', MockMutationObserver);
    MockMutationObserver.prototype.observeMock = vi.fn();

    const parent = document.createElement('div');
    const dialog = document.createElement('div');
    const header = document.createElement('h2');
    const startDrag = vi.fn();
    const removeDragListeners = vi.fn();
    const removeHeaderListenerSpy = vi.spyOn(header, 'removeEventListener');
    dialog.appendChild(header);
    parent.appendChild(dialog);

    _setupDragCleanupObserver(dialog, header, startDrag, removeDragListeners);

    expect(observer.observeMock).toHaveBeenCalledWith(parent, { childList: true, subtree: false });

    observer.callback([{ removedNodes: [dialog] }]);
    dialog._dragCleanup();

    expect(removeDragListeners).toHaveBeenCalledTimes(1);
    expect(removeHeaderListenerSpy).toHaveBeenCalledWith('mousedown', startDrag);
    expect(removeHeaderListenerSpy).toHaveBeenCalledWith('touchstart', startDrag);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
