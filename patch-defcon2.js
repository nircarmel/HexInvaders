import fs from 'fs';

let code = fs.readFileSync('js/ai-v1.js', 'utf8');

const targetStr = `        // 1.5 DEFCON: Imminent Threat Thresholds
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

const replaceStr = `        // 1.5 DEFCON: Imminent Threat Thresholds
        let defconPenalty = 0;
        let defconBonus = 0;

        // Enemy Threat (They are close to winning and UNBLOCKED)
        for (let e of state.units.filter(u => u.player === opponent && (state.gameMode === 'INVADE' || u.isFlag))) {
            // FIX: Opponent is trying to reach oppGoalCol
            let ttg = Math.ceil(Math.abs(e.col - oppGoalCol) / (e.speed || 1));
            if (ttg <= 2 && e.col !== oppGoalCol) {
                let pathIsBlocked = false;
                let stepDir = (oppGoalCol > e.col) ? 1 : -1;
                let maxDist = Math.abs(oppGoalCol - e.col); 
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
            // FIX: Bot is trying to reach botGoalCol
            let ttg = Math.ceil(Math.abs(b.col - botGoalCol) / (b.speed || 1));
            if (ttg <= 2 && b.col !== botGoalCol) {
                let pathIsBlocked = false;
                let stepDir = (botGoalCol > b.col) ? 1 : -1;
                let maxDist = Math.abs(botGoalCol - b.col); 
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

// Build clean replacement using string indexOf so regex CRLF issues never happen
const sIdx = code.indexOf(`        // 1.5 DEFCON: Imminent Threat Thresholds`);
const eIdx = code.indexOf(`        score -= defconPenalty;`) + `        score -= defconPenalty;`.length;

if (sIdx !== -1 && eIdx !== -1) {
    let before = code.substring(0, sIdx);
    let after = code.substring(eIdx);
    fs.writeFileSync('js/ai-v1.js', before + replaceStr + after);
    console.log("SUCCESS");
} else {
    console.log("NOT FOUND");
}
