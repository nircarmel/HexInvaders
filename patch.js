import fs from 'fs';

let code = fs.readFileSync('js/ai-v1.js', 'utf8');

const replacement = `        let modeGenes = this.genes.UNIFIED || this.genes.INVADE; 

        // ==========================================
        // UNIFIED BOARD SCORING VARIANT
        // ==========================================
        let score = 0;

        // 1. Win Condition
        let hasOwnFlagBase = state.units.some(u => u.player === botPlayer && u.isFlag && u.col === botGoalCol);
        let hasEnemyFlagBase = state.units.some(u => u.player === opponent && u.isFlag && u.col === oppGoalCol);
        
        let hasOwnCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === botPlayer && !u.isFlag && u.col === botGoalCol);
        let hasEnemyCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === opponent && !u.isFlag && u.col === oppGoalCol);

        if (hasOwnFlagBase || hasOwnCombatBase) return 1000000;
        if (hasEnemyFlagBase || hasEnemyCombatBase) return -1000000;

        // 2. Credit Value
        let ownCredits = botPlayer === 'BLUE' ? state.blue_credits : state.red_credits;
        let oppCredits = botPlayer === 'BLUE' ? state.red_credits : state.blue_credits;
        score += ownCredits * (modeGenes.k1 !== undefined ? modeGenes.k1 : 1);
        score -= oppCredits * (modeGenes.k1 !== undefined ? modeGenes.k1 : 1);

        // 3. Unit Value / Forward Progress
        let ownUnitScore = 0;
        let enemyUnitScore = 0;
        
        for (let u of state.units) {
            let isBot = u.player === botPlayer;
            let goalCol = isBot ? botGoalCol : oppGoalCol;
            
            let uScore = 0;

            if (u.type === 'observation') {
                uScore = modeGenes.obs_value !== undefined ? modeGenes.obs_value : 50;
            } else {
                let power = u.power || 0;
                let speedForTtg = u.speed || 1;

                if (u.isFlag) {
                    power = modeGenes.flag_boost !== undefined ? modeGenes.flag_boost : 10;
                    speedForTtg = u.speed || 1;
                }

                if (state.gameMode === 'PLANT' && !u.isFlag) {
                    // In PLANT Mode, Combat units strictly measure distances to Flags (to hunt or defend)
                    let friendlyFlags = state.units.filter(f => f.isFlag && f.player === u.player);
                    let enemyFlags = state.units.filter(f => f.isFlag && f.player !== u.player);
                    let allTargetFlags = friendlyFlags.concat(enemyFlags);

                    if (allTargetFlags.length > 0) {
                        let minTtg = 999;
                        for (let f of allTargetFlags) {
                            let dist = Math.abs(u.col - f.col); // Pure horizontal proxy to bypass minimax overhead
                            let formTtg = Math.ceil(dist / speedForTtg);
                            if (formTtg < minTtg) minTtg = formTtg;
                        }
                        let ttgVal = Math.max(1, minTtg);
                        uScore = (power * (modeGenes.flag_intercept_K !== undefined ? modeGenes.flag_intercept_K : 100)) / ttgVal;
                    }
                } else {
                    // Default Forward Progress (All units in INVADE, or specifically Flags in PLANT)
                    let ttgVal = Math.max(1, this.turnsToGoal(u.col, speedForTtg, goalCol));
                    uScore = (power * (modeGenes.K !== undefined ? modeGenes.K : 100)) / ttgVal;
                }
            }

            if (isBot) {
                ownUnitScore += uScore;
            } else {
                enemyUnitScore += uScore * (modeGenes.enemy_multiplier !== undefined ? modeGenes.enemy_multiplier : 2);
            }
        }
        score += ownUnitScore - enemyUnitScore;

        // 4. Escort / Wall Bonus
        let ownCombatUnits = friendlyUnits; // Excludes flags/obs 
        let oppCombatUnits = enemyUnits; 

        for (let f of friendlyFlags) {
            for (let u of ownCombatUnits) {
                let isEscorting = false;
                for (let e of state.units) { 
                    if (e.player === botPlayer) continue; 
                    let isBetween = botPlayer === 'BLUE' ? (u.col > f.col && u.col <= e.col) : (u.col < f.col && u.col >= e.col);
                    if (isBetween) {
                        isEscorting = true;
                        break; 
                    }
                }
                if (isEscorting) {
                    score += (modeGenes.escortBonusBase !== undefined ? modeGenes.escortBonusBase : 369) * u.power;
                }
            }
        }

        // Symmetrical Escort 
        for (let f of enemyFlags) {
            for (let u of oppCombatUnits) {
                let isEscorting = false;
                for (let e of state.units) { 
                    if (e.player === opponent) continue;
                    let isBetween = opponent === 'BLUE' ? (u.col > f.col && u.col <= e.col) : (u.col < f.col && u.col >= e.col);
                    if (isBetween) {
                        isEscorting = true;
                        break; 
                    }
                }
                if (isEscorting) {
                    score -= (modeGenes.escortBonusBase !== undefined ? modeGenes.escortBonusBase : 369) * u.power;
                }
            }
        }

        return score;`;

const searchStart = "        const modeGenes = state.gameMode === 'PLANT' ? this.genes.PLANT : this.genes.INVADE;";
const searchEnd = "        return deltaInvade + deltaMaterial + defensiveScore + deltaFlagMaterial + (totalStrategicScore / 100.0);\r\n    }";

let sIdx = code.indexOf(searchStart);
let eIdx = code.indexOf(searchEnd);

// If Windows CRLF \r\n vs \n is an issue, we can search safely
if (eIdx === -1) {
    const fallbackEnd = "        return deltaInvade + deltaMaterial + defensiveScore + deltaFlagMaterial + (totalStrategicScore / 100.0);\n    }";
    eIdx = code.indexOf(fallbackEnd);
}

if (sIdx !== -1 && eIdx !== -1) {
    let before = code.substring(0, sIdx);
    let after = code.substring(eIdx + searchEnd.length - 5); // Keep the '    }'
    fs.writeFileSync('js/ai-v1.js', before + replacement + "\n" + after);
    console.log("SUCCESS");
} else {
    console.log("COULD NOT FIND INDICES", sIdx, eIdx);
}
