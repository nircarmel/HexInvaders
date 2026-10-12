import fs from 'fs';

let code = fs.readFileSync('js/ai-v1.js', 'utf8');

const targetStr = `        if (hasOwnFlagBase || hasOwnCombatBase) return 1000000;
        if (hasEnemyFlagBase || hasEnemyCombatBase) return -1000000;`;

const replaceStr = `        if (hasOwnFlagBase || hasOwnCombatBase) return 1000000;
        if (hasEnemyFlagBase || hasEnemyCombatBase) return -1000000;

        // 1.5 DEFCON: Imminent Threat Thresholds
        let defconPenalty = 0;
        let defconBonus = 0;

        // Enemy Threat (They are close to winning and UNBLOCKED)
        for (let e of state.units.filter(u => u.player === opponent && (state.gameMode === 'INVADE' || u.isFlag))) {
            let ttg = Math.ceil(Math.abs(e.col - botGoalCol) / (e.speed || 1));
            if (ttg <= 2 && e.col !== botGoalCol) {
                let pathIsBlocked = false;
                let stepDir = (botGoalCol > e.col) ? 1 : -1;
                let maxDist = Math.abs(botGoalCol - e.col); 
                for (let i = 1; i <= maxDist; i++) {
                    let checkCol = e.col + (i * stepDir);
                    if (state.units.some(u => u.col === checkCol && u.player === botPlayer && u.power > 0)) {
                        pathIsBlocked = true;
                        break;
                    }
                }
                if (!pathIsBlocked) {
                    defconPenalty += 500000; // Skyrocket priority of killing/blocking this unit
                }
            }
        }

        // Bot Threat (We are close to winning and UNBLOCKED)
        for (let b of state.units.filter(u => u.player === botPlayer && (state.gameMode === 'INVADE' || u.isFlag))) {
            let ttg = Math.ceil(Math.abs(b.col - oppGoalCol) / (b.speed || 1));
            if (ttg <= 2 && b.col !== oppGoalCol) {
                let pathIsBlocked = false;
                let stepDir = (oppGoalCol > b.col) ? 1 : -1;
                let maxDist = Math.abs(oppGoalCol - b.col); 
                for (let i = 1; i <= maxDist; i++) {
                    let checkCol = b.col + (i * stepDir);
                    if (state.units.some(u => u.col === checkCol && u.player === opponent && u.power > 0)) {
                        pathIsBlocked = true;
                        break;
                    }
                }
                if (!pathIsBlocked) {
                    defconBonus += 500000; 
                }
            }
        }

        score += defconBonus;
        score -= defconPenalty;`;

// Replace using CRLF regex matching safely
let safeCode = code.replace(/        if \(hasOwnFlagBase \|\| hasOwnCombatBase\) return 1000000;[\r\n\s]+if \(hasEnemyFlagBase \|\| hasEnemyCombatBase\) return -1000000;/, replaceStr);

fs.writeFileSync('js/ai-v1.js', safeCode);
console.log("PATCH COMPLETE");
