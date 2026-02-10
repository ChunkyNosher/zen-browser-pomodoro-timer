/**
 * Break phase utilities - Functions for detecting break phases.
 */

/**
 * Check if the Pomodoro timer is currently in a break phase.
 * During break phases, workspace and website blocking should be disabled
 * to allow the user to freely browse during their break.
 *
 * The 'transition' phase is also treated as a break phase because during
 * the transition (break ending soon warning), blocking should remain disabled
 * to allow users to finish up their break activities.
 *
 * @returns {boolean} True if timer is active AND in a break phase (including transition)
 */
export function isInBreakPhase() {
  const timer = window.zenPomodoroApp?.timer;
  if (!timer || !timer.isActive) return false;
  // Handle 'long-break' for backwards compatibility with saved state
  // Include 'transition' because blocking should remain disabled during the break-ending warning
  return (
    timer.currentPhase === 'break' ||
    timer.currentPhase === 'long-break' ||
    timer.currentPhase === 'transition'
  );
}
