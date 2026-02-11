/**
 * Shared mutable state module.
 * Holds state that needs to be accessed/modified across multiple modules.
 */

/**
 * Stores the last dialog position for maintaining position across dialogs.
 * @type {{left: number, top: number}|null}
 */
export let lastDialogPosition = null;

/**
 * Set the last dialog position.
 * @param {{left: number, top: number}|null} pos
 */
export function setLastDialogPosition(pos) {
  lastDialogPosition = pos;
}
