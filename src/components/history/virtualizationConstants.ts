/**
 * Shared virtualization constants for list views with fallback rendering.
 * RFIX-15: Lists falling back to non-virtualized rendering must cap at FALLBACK_WINDOW
 * to prevent DOM explosions while providing an honest visible affordance.
 */
export const FALLBACK_WINDOW = 5;
