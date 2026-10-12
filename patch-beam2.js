import fs from 'fs';

let code = fs.readFileSync('js/ai-v1.js', 'utf8');

const sIdx = code.indexOf(`    minimax(state, depth, alpha, beta, maximizing, botPlayer) {`);
const eIdx = code.indexOf(`decideAction() {`);

let replaceStr = `    minimax(state, depth, alpha, beta, maximizing, botPlayer) {
        let score = this.evaluateBoard(state, botPlayer);

        if (depth === 0 || Math.abs(score) >= 90000.0) {
            if (score >= 90000.0) score += depth * 1000;
            if (score <= -90000.0) score -= depth * 1000;
            return { score, action: null };
        }

        let actions = this.generateCandidateActions(state, state.currentPlayer);
        if (actions.length === 0) {
            return { score, action: null };
        }

        // =====================================
        // BEAM SEARCH (Action-Sort Pruning)
        // =====================================
        let scoredActions = [];
        let modeGenes = this.genes.UNIFIED || this.genes.INVADE;
        let beamWidth = modeGenes.beam_width || 12;

        for (let a of actions) {
            let nextState = this.applyVirtualAction(state, a);
            let immediateScore = this.evaluateBoard(nextState, botPlayer);
            scoredActions.push({ action: a, score: immediateScore });
        }

        if (maximizing) {
            scoredActions.sort((a, b) => b.score - a.score);
        } else {
            scoredActions.sort((a, b) => a.score - b.score);
        }

        // PRUNE ALL ACTIONS OUTSIDE THE BEAM WIDTH!
        actions = scoredActions.slice(0, beamWidth).map(pair => pair.action);
        let bestAction = actions[0];

        if (maximizing) {
            let maxEval = -Infinity;
            for (let a of actions) {
                let nextState = this.applyVirtualAction(state, a);
                let result = this.minimax(nextState, depth - 1, alpha, beta, false, botPlayer);
                if (result.score > maxEval) {
                    maxEval = result.score;
                    bestAction = a;
                }
                alpha = Math.max(alpha, result.score);
                if (beta <= alpha) break;
            }
            return { score: maxEval, action: bestAction };
        } else {
            let minEval = Infinity;
            for (let a of actions) {
                let nextState = this.applyVirtualAction(state, a);
                let result = this.minimax(nextState, depth - 1, alpha, beta, true, botPlayer);
                if (result.score < minEval) {
                    minEval = result.score;
                    bestAction = a;
                }
                beta = Math.min(beta, result.score);
                if (beta <= alpha) break;
            }
            return { score: minEval, action: bestAction };
        }
    }

    `;

if (sIdx !== -1 && eIdx !== -1) {
    let before = code.substring(0, sIdx);
    let after = code.substring(eIdx);
    fs.writeFileSync('js/ai-v1.js', before + replaceStr + after);
    console.log("SUCCESS");
} else {
    console.log("NOT FOUND", sIdx, eIdx);
}
