import fs from 'fs';

let code = fs.readFileSync('js/ai-v1.js', 'utf8');

const targetStr = `            this.game.endTurn();
        }
    }
}`;

const replaceStr = `            this.game.endTurn();
        }
    }

    // --- AI INSIGHT HEATMAP --- 
    generateHeatmap(state, botPlayer) {
        let heatmapCache = [];
        let pwr = 5; let spd = 3;
        for (let c = 0; c < state.cols; c++) {
            for (let r = 0; r < state.rows; r++) {
                // Determine if a mock deployment mathematically escalates/decreases net utility
                let occupant = state.units.find(u => u.col === c && u.row === r);
                if (occupant) {
                    // Record existing unit scalar 
                    heatmapCache.push({ col: c, row: r, val: occupant.player === botPlayer ? 10 : -10, occupied: true });
                } else if (!state.barricades.has(c + ',' + r)) {
                    let mockState = JSON.parse(JSON.stringify(state));
                    mockState.units.push({ id: 'X', type: 'combat', power: pwr, speed: spd, isFlag: false, player: botPlayer, col: c, row: r });
                    let val = this.evaluateBoard(mockState, botPlayer);
                    heatmapCache.push({ col: c, row: r, val: val, occupied: false });
                }
            }
        }

        // Normalize scaling linearly safely from min to max to clean colors
        let min = Math.min(...heatmapCache.filter(h => !h.occupied).map(h => h.val));
        let max = Math.max(...heatmapCache.filter(h => !h.occupied).map(h => h.val));
        
        for (let h of heatmapCache) {
            if (!h.occupied && max > min) {
                h.norm = (h.val - min) / (max - min); // 0.0 to 1.0
            } else {
                h.norm = 0.5;
            }
        }
        return heatmapCache;
    }
}`;

// Make sure replacing works by finding the very last bracket of the file
const lastBrackIdx = code.lastIndexOf("}");
if (lastBrackIdx !== -1) {
    let sub = code.substring(0, lastBrackIdx);
    let patch = `
    // --- AI INSIGHT HEATMAP --- 
    generateHeatmap(state, botPlayer) {
        let heatmapCache = [];
        let pwr = 5; let spd = 3;
        for (let c = 0; c < state.cols; c++) {
            for (let r = 0; r < state.rows; r++) {
                // Determine if a mock deployment mathematically escalates/decreases net utility
                let occupant = state.units.find(u => u.col === c && u.row === r);
                if (occupant) {
                    // Record existing unit scalar 
                    heatmapCache.push({ col: c, row: r, val: occupant.player === botPlayer ? 10 : -10, occupied: true });
                } else if (!state.barricades.has(c + ',' + r)) {
                    let mockState = JSON.parse(JSON.stringify(state));
                    mockState.units.push({ id: 'X', type: 'combat', power: pwr, speed: spd, isFlag: false, player: botPlayer, col: c, row: r });
                    let val = this.evaluateBoard(mockState, botPlayer);
                    heatmapCache.push({ col: c, row: r, val: val, occupied: false });
                }
            }
        }

        // Normalize scaling linearly safely from min to max to clean colors
        let unocc = heatmapCache.filter(h => !h.occupied);
        let min = unocc.length > 0 ? Math.min(...unocc.map(h => h.val)) : 0;
        let max = unocc.length > 0 ? Math.max(...unocc.map(h => h.val)) : 100;
        
        for (let h of heatmapCache) {
            if (!h.occupied && max > min) {
                h.norm = (h.val - min) / (max - min); // 0.0 to 1.0
            } else {
                h.norm = 0.5;
            }
        }
        return heatmapCache;
    }
}
`;
    fs.writeFileSync('js/ai-v1.js', sub + patch);
    console.log("PATCH HEATMAP SUCCESS");
}
