// js/genes-v3.js

/**
 * ========================================================
 * V3 INFLUENCE MAP AI GENOME WEIGHT STRUCTURE
 * ========================================================
 *
 * All tunable constants for the tile-based scoring engine.
 *
 * COMBAT_BOOST: Target base value for a combat unit.
 * COMBAT_RING_BOOST: Percentage push/pull on tiles surrounding a combat unit.
 * OBS_BOOST: Target base value for an observation unit ring-decay.
 * FLAG_TILE_CONSTANT: Signed boost applied only to the exact tile a flag is on.
 * FLAG_BOOST: Percentage multiplier applied to all combat presence inside a flag's 5-ring zone.
 * WIN_VALUE: Flat unconditional score for reaching the enemy base.
 */
export const DEFAULT_V3_GENES = {
    COMBAT_BOOST: 100,
    COMBAT_RING_BOOST: 0.15,
    OBS_BOOST: 5000,
    FLAG_TILE_CONSTANT: 3000,
    FLAG_BOOST: 0.15,
    WIN_VALUE: 1000000
};
