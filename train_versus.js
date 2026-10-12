import { HexGame } from './js/game.js';
import { AIBotV2 } from './js/ai-v2.js';
import { DEFAULT_V2_GENES } from './js/genes-v2.js';
import { AIBot } from './js/ai-v1.js';
import { DEFAULT_GENES } from './js/genes-v1.js';
import fs from 'fs';

const POPULATION_SIZE = 20;
const GENERATIONS = 30; // Dropping to 30 for speed in validation
const GAMES_PER_BOT = 5;
const MAX_TURNS = 120;

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function mutate(genes, mode, rate = 0.3, variance = 0.5) {
    let g = deepClone(genes);
    for (let key in g) {
        if (key.toLowerCase().includes('win')) continue;
        if (Math.random() < rate) {
            const minScale = 1.0 - (variance / 2.0);
            g[key] = Math.round(g[key] * (minScale + Math.random() * variance));
        }
    }
    return g;
}

function crossover(g1, g2) {
    let child = {};
    for (let key in g1) { child[key] = Math.random() < 0.5 ? g1[key] : g2[key]; }
    return child;
}

// v2IsBlue = true -> V2 is BLUE, V1 is RED
function runMatch(genesV2, genesV1, mode, v2IsBlue) {
    const config = { width: 30, height: 15, mode: mode === 'PLANT' ? 'HIDDEN' : 'NEARBY', type: mode, credits: 100, flagCost: 10 };
    let game = new HexGame(config);
    game.network = null; game.ui = null;

    for (let c = 0; c < config.width; c++) {
        if (c % 2 === 1) {
            for (let r = 0; r < config.height; r++) {
                if (Math.random() < 0.35) { let tile = game.getTile(c, r); if (tile) tile.isBarricade = true; }
            }
        }
    }

    let botV2 = new AIBotV2(game, { [mode]: genesV2 });
    let botV1 = new AIBot(game, { [mode]: genesV1 });

    let botBlue = v2IsBlue ? botV2 : botV1;
    let botRed = v2IsBlue ? botV1 : botV2;

    let turns = 0;
    while (!game.winner && turns < MAX_TURNS) {
        if (game.activeTeam === 'BLUE') {
            const rootState = botBlue.cloneState();
            let dLimit = 5; // Universally bound Alpha-Beta pruned matrix
            const result = botBlue.minimax(rootState, dLimit, -Infinity, Infinity, true, 'BLUE');
            executeBotAction(game, 'BLUE', result.action);
        } else {
            const rootState = botRed.cloneState();
            let dLimit = 5;
            const result = botRed.minimax(rootState, dLimit, -Infinity, Infinity, true, 'RED');
            executeBotAction(game, 'RED', result.action);
        }
        turns++;
    }

    const termState = botV2.cloneState(); // Use V2 to evaluate math constants
    const finalScoreB = botV2.evaluateBoard(termState, 'BLUE');
    const finalScoreR = botV2.evaluateBoard(termState, 'RED');

    let winnerId = 0; // 0=Tie, 1=V2, 2=V1
    if (game.winner === 'BLUE') winnerId = v2IsBlue ? 1 : 2;
    if (game.winner === 'RED') winnerId = v2IsBlue ? 2 : 1;

    let finalScoreV2 = v2IsBlue ? finalScoreB : finalScoreR;
    let finalScoreV1 = v2IsBlue ? finalScoreR : finalScoreB;

    return {
        winnerId, turns,
        v2FinalScore: finalScoreV2,
        v1FinalScore: finalScoreV1,
    };
}

function executeBotAction(game, team, action) {
    if (!action) { game.endTurn(false, true); return; }
    if (action.type === 'DEPLOY') game.deployUnit(team, action.unitType, action.power, action.speed, action.targetCol, action.targetRow);
    else if (action.type === 'MOVE') game.moveUnit(action.unitCol, action.unitRow, action.targetCol, action.targetRow);
    else game.endTurn(false, true);
}

function evolve(mode) {
    console.log(`\n======================================================`);
    console.log(`STARTING CO-EVOLUTION ASSYMETRICAL COMBAT: ${mode}`);
    console.log(`======================================================`);

    let popV2 = [deepClone(DEFAULT_V2_GENES[mode])];
    let popV1 = [deepClone(DEFAULT_GENES.UNIFIED)];

    for (let i = 1; i < POPULATION_SIZE; i++) {
        popV2.push(mutate(popV2[0], mode, 0.8, 1.0));
        popV1.push(mutate(popV1[0], mode, 0.8, 1.0));
    }

    let globalV2Wins = 0;
    let globalV1Wins = 0;
    let globalTies = 0;

    for (let gen = 1; gen <= GENERATIONS; gen++) {
        let statsV2 = new Array(POPULATION_SIZE).fill(0).map(() => ({ s: 0, w: 0, t: 0, l: 0 }));
        let statsV1 = new Array(POPULATION_SIZE).fill(0).map(() => ({ s: 0, w: 0, t: 0, l: 0 }));

        // Cross-population matchmaking
        for (let i = 0; i < POPULATION_SIZE; i++) {
            for (let g = 0; g < GAMES_PER_BOT; g++) {
                let oppIndex = Math.floor(Math.random() * POPULATION_SIZE);
                let v2IsBlue = Math.random() < 0.5; // Randomize color advantage

                let res = runMatch(popV2[i], popV1[oppIndex], mode, v2IsBlue);

                if (res.winnerId === 1) { // V2 Wins
                    statsV2[i].s += 3; statsV2[i].w++;
                    statsV1[oppIndex].l++;
                    globalV2Wins++;
                } else if (res.winnerId === 2) { // V1 Wins
                    statsV1[oppIndex].s += 3; statsV1[oppIndex].w++;
                    statsV2[i].l++;
                    globalV1Wins++;
                } else { // Tie
                    let v2TieBreaker = Math.max(0, Math.min(0.99, (res.v2FinalScore + 250000) / 500000));
                    let v1TieBreaker = Math.max(0, Math.min(0.99, (res.v1FinalScore + 250000) / 500000));
                    statsV2[i].s += 1 + v2TieBreaker;
                    statsV1[oppIndex].s += 1 + v1TieBreaker;
                    statsV2[i].t++; statsV1[oppIndex].t++;
                    globalTies++;
                }
            }
        }

        let rankedV2 = popV2.map((g, idx) => ({ genes: g, ...statsV2[idx] })).sort((a, b) => b.s - a.s);
        let rankedV1 = popV1.map((g, idx) => ({ genes: g, ...statsV1[idx] })).sort((a, b) => b.s - a.s);

        console.log(`Gen ${gen} | V2 Fittest: ${rankedV2[0].w}W ${rankedV2[0].t}T ${rankedV2[0].l}L | V1 Fittest: ${rankedV1[0].w}W ${rankedV1[0].t}T ${rankedV1[0].l}L | Globals -> V2:${globalV2Wins} V1:${globalV1Wins} TIES:${globalTies}`);

        // Recombine V2
        let survV2 = rankedV2.slice(0, POPULATION_SIZE / 2).map(p => p.genes);
        let nxtV2 = [deepClone(survV2[0]), deepClone(survV2[1])];
        while (nxtV2.length < POPULATION_SIZE) {
            let p1 = survV2[Math.floor(Math.random() * survV2.length)];
            let p2 = survV2[Math.floor(Math.random() * (survV2.length / 2))];
            nxtV2.push(mutate(crossover(p1, p2), mode));
        }
        popV2 = nxtV2;

        // Recombine V1
        let survV1 = rankedV1.slice(0, POPULATION_SIZE / 2).map(p => p.genes);
        let nxtV1 = [deepClone(survV1[0]), deepClone(survV1[1])];
        while (nxtV1.length < POPULATION_SIZE) {
            let p1 = survV1[Math.floor(Math.random() * survV1.length)];
            let p2 = survV1[Math.floor(Math.random() * (survV1.length / 2))];
            nxtV1.push(mutate(crossover(p1, p2), mode));
        }
        popV1 = nxtV1;

        if (gen === GENERATIONS) {
            let winRateV2 = (globalV2Wins / (globalV2Wins + globalV1Wins + globalTies)) * 100;
            let winRateV1 = (globalV1Wins / (globalV2Wins + globalV1Wins + globalTies)) * 100;
            console.log(`\n======================================`);
            console.log(`V2 Hybrid Architecture Win-Rate: ${winRateV2.toFixed(1)}%`);
            console.log(`V1 Baseline Architecture Win-Rate: ${winRateV1.toFixed(1)}%`);
            console.log(`======================================\n`);

            // Auto inject V2 back to genes-v2
            const v2Path = './js/genes-v2.js';
            let cV2 = fs.readFileSync(v2Path, 'utf8');
            let mRegex = new RegExp(`(${mode}:\\s*\\{[^}]+\\})`, 'g');
            let sV2 = JSON.stringify(survV2[0], null, 8).replace(/\\n/g, '\\n').replace(/\\"/g, '"');
            sV2 = sV2.substring(sV2.indexOf('{') + 1, sV2.lastIndexOf('}')).trim();
            cV2 = cV2.replace(mRegex, `${mode}: {\n        ${sV2}\n    }`);
            fs.writeFileSync(v2Path, cV2);
        }
    }
}

console.log("Welcome to Hex-Invaders Co-Evolution Arena!");
evolve('INVADE');
evolve('PLANT');
console.log("Asymmetrical Combat concluded successfully!");
