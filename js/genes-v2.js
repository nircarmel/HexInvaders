// js/genes-v2.js

/**
 * ========================================================
 * V2 (MINIMAX) AI GENOME WEIGHT STRUCTURE
 * ========================================================
 * 
 * V2 explicitly utilizes an 8-Term Evaluation Heuristic spanning both PLANT and INVADE modes seamlessly:
 * 
 * - unitValueMultiplier: Rewards holding troops based on their cost. Score = (Unit Speed * Unit Power) * unitValueMultiplier.
 * - flagSurchargeSafe: Rewards safe flags. Score = (Flag Base Cost) * flagSurchargeSafe, IF no enemy can reach it.
 * - flagSurchargePanic: Penalizes threatened flags. Score = (Flag Base Cost) * flagSurchargePanic, IF an enemy can reach it.
 * - homeBaseCapture: Adds its value (+999,999) when any unit gets to the enemy home base.
 * - proximityGradientWeight: Rewards pushing flags forward. Score = (Board Width - Distance to Enemy Base) * proximityGradientWeight.
 * - pathSafetyRetainer: Fraction of proximity score retained if flag is threatened. Score = (Proximity Score) * pathSafetyRetainer.
 * - frontierGapWeight: Rewards moving the single deepest combat unit forward. Score = (Board Width - Deepest Distance) * frontierGapWeight.
 * - territorialControlWeight: Rewards leaving troops near your home base safely. Score = (Board Width - Distance to OUR Base) * territorialControlWeight.
 * - tempoWastePenalty: Penalizes hoarding unspent credits in bank. Score = -(Credits in Bank) * (1 - tempoWastePenalty).
 * ========================================================
 */
export const DEFAULT_V2_GENES = {
    // Shared structural limits applied equally
    PLANT: {
        "unitValueMultiplier": 24,
        "flagSurchargeSafe": 2927,
        "flagSurchargePanic": 876,
        "homeBaseCapture": 265244,
        "proximityGradientWeight": 436,
        "pathSafetyRetainer": 0,
        "frontierGapWeight": 219,
        "territorialControlWeight": 157,
        "tempoWastePenalty": 21
    },
    INVADE: {
        "unitValueMultiplier": 51,
        "flagSurchargeSafe": 0,
        "flagSurchargePanic": 0,
        "homeBaseCapture": 186879,
        "proximityGradientWeight": 0,
        "pathSafetyRetainer": 0,
        "frontierGapWeight": 604,
        "territorialControlWeight": 102,
        "tempoWastePenalty": 3
    }
};
