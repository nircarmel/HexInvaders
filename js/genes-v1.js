// js/genes-v1.js

/**
 * ========================================================
 * UNIFIED AI GENOME WEIGHT STRUCTURE (AIBot V1)
 * ========================================================
 * The 'UNIFIED' dictionary universally dictates the Minimax Engine evaluation across 
 * both PLANT and INVADE variants mathematically.
 * 
 * Win Conditions are handled statically in engine:
 * - INVADE: Any unit reaching the enemy base returns +/- 1,000,000.
 * - PLANT: Only Flag units reaching the enemy base return +/- 1,000,000.
 * 
 * 
 * CORE VARIABLES:
 * - credit_multiplier: Multiplier for unspent credits. 
 *       [Score += Credits * credit_multiplier]
 * - advance_bonus: Base unit value as it moves forward on the board.
 *       [unit_score = (Power * advance_bonus) / turns_to_goal]
 * - flag_boost: Sets flag power instead of '0' for the unit value calculation so it can properly score.
 *       [Power = flag_boost]
 * - flag_progress_multiplier: Gives flags extra incentive to move forward. 
 *       [unit_score = ((Power * advance_bonus) / turns_to_goal) * flag_progress_multiplier]
 * - obs_value_factor: Ratio (0-1) scaling an observation unit's value assuming it had exactly 5 Power and 5 Speed natively.
 *       [unit_score = ((5 * advance_bonus) / turns_to_goal) * obs_value_factor]
 * - flag_intercept_K: Replaces 'advance_bonus' in PLANT mode to motivate combat units to hunt or defend flags instead of just moving forward. 
 *       [unit_score = (Power * flag_intercept_K) / turns_to_flag]
 * - enemy_multiplier: Makes enemy units look artificially more valuable, giving the AI a strong incentive to kill them. 
 *       [enemy_unit_score = unit_score * enemy_multiplier]
 * - escortBonusBase: Score bonus granted when a combat unit stands directly between a flag and an enemy to protect it. 
 *       [Score += Power * escortBonusBase]
 * - beam_width: Limits how many options the AI looks at to speed up the game. (e.g. only looking at the top 12 best moves each turn).
 * ========================================================
 */
export const DEFAULT_GENES = {
    UNIFIED: {
        "credit_multiplier": 10,
        "advance_bonus": 100000,
        "flag_boost": 6,
        "flag_progress_multiplier": 1.2,
        "obs_value_factor": 0.7,
        "flag_intercept_K": 3000,
        "enemy_multiplier": 1.3,
        "escortBonusBase": 500,
        "beam_width": 12
    }
};
