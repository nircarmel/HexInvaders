// js/ai.js
// Heuristic Bot for RED Team
class AIBot {
    constructor(game) {
        this.game = game;
    }

    executeTurn() {
        if (this.game.activeTeam !== 'RED') return;
        if (this.game.winner) return;

        this.game.logSystem('Computer is thinking...');

        // Wait 1 second for simulation feel
        setTimeout(() => {
            if (this.game.activeTeam !== 'RED') return;
            this.decideAction();
        }, 1200);
    }

    decideAction() {
        // Check if we need to deploy Flag
        if (this.game.deployCounts['RED'] >= 4 && !this.game.hasFlag['RED']) {
            this.deployFlag();
            return;
        }

        // See if we have sufficient credits to deploy a strong unit
        // Try to maintain board presence
        const redUnits = this.countUnits('RED');

        // Just deploy sequentially if low on units
        if (redUnits < 3 && this.game.credits['RED'] >= 9) {
            if (!this.game.hasFlag['RED'] && this.game.credits['RED'] >= 10) {
                this.deployFlag();
            } else {
                this.deployCombat();
            }
            return;
        }

        // If we have troops, try to move them!
        if (this.attemptMove()) {
            return;
        }

        // If movement failed but we have credits, deploy
        if (this.game.credits['RED'] >= 10) {
            this.deployCombat();
            return;
        }

        // Fallback: Skip turn
        this.game.logAction('RED', 'AI chose to Skip Action.');
        this.game.endTurn();
    }

    countUnits(team) {
        let count = 0;
        this.game.board.forEach(t => { if (t.unit && t.unit.team === team) count++; });
        return count;
    }

    deployFlag() {
        const deployOptions = this.getEmptyBaseTiles(this.game.cols - 1);
        if (deployOptions.length > 0) {
            const loc = deployOptions[Math.floor(Math.random() * deployOptions.length)];
            this.game.deployUnit('RED', 'flag', 0, 1, loc.c, loc.r);
        } else {
            this.game.endTurn();
        }
    }

    deployCombat() {
        const deployOptions = this.getEmptyBaseTiles(this.game.cols - 1);
        if (deployOptions.length > 0) {
            const loc = deployOptions[Math.floor(Math.random() * deployOptions.length)];
            // Spend up to 12 credits (e.g. 4 str 3 spd = 12, or just random)
            this.game.deployUnit('RED', 'combat', 4, 3, loc.c, loc.r);
        } else {
            this.game.endTurn();
        }
    }

    getEmptyBaseTiles(col) {
        let res = [];
        for (let r = 0; r < this.game.rows; r++) {
            if (this.game.isValid(col, r)) {
                let t = this.game.getTile(col, r);
                if (!t.unit && !t.isBarricade) res.push({ c: col, r });
            }
        }
        return res;
    }

    attemptMove() {
        // Collect all available red units that can move
        let movable = [];
        for (let c = 0; c < this.game.cols; c++) {
            for (let r = 0; r < this.game.rows; r++) {
                let t = this.game.getTile(c, r);
                if (t.unit && t.unit.team === 'RED' && !t.unit.hasMoved && !t.unit.justDeployed && !t.unit.isFlag) {
                    movable.push({ c, r, u: t.unit });
                }
            }
        }

        if (movable.length === 0) return false;

        // Pick random
        const chosen = movable[Math.floor(Math.random() * movable.length)];

        // Look for targets (we want to step leftwards to attack)
        const reach = this.game.getReachableHexes(chosen.c, chosen.r, chosen.u.speed);

        let bestTarget = null;
        let bestScore = -999;

        for (let k of reach) {
            const trgSpl = k.split(',');
            const tc = parseInt(trgSpl[0]);
            const tr = parseInt(trgSpl[1]);
            const tTile = this.game.getTile(tc, tr);

            // Score based on moving Left (towards 0), or killing blue units
            let score = (chosen.c - tc);
            if (tTile.unit && tTile.unit.team === 'BLUE') {
                score += 10; // kill priority
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = { c: tc, r: tr };
            }
        }

        if (bestTarget) {
            this.game.moveUnit(chosen.c, chosen.r, bestTarget.c, bestTarget.r);
            return true;
        }

        return false;
    }
}
