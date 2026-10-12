import { HexGame } from './js/game.js';
import { AIBotV2 } from './js/ai-v2.js';
import { DEFAULT_V2_GENES } from './js/genes-v2.js';
import fs from 'fs';

const POPULATION_SIZE = 20;
const GAMES_PER_BOT = 10;
const MAX_TURNS = 120;

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

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
    for (let key in g1) {
        child[key] = Math.random() < 0.5 ? g1[key] : g2[key];
    }
    return child;
}

function runMatch(bot1Genes, bot2Genes, mode) {
    const config = { width: 30, height: 15, mode: mode === 'PLANT' ? 'HIDDEN' : 'NEARBY', type: mode, credits: 100, flagCost: 10 };
    let game = new HexGame(config);

    // Mock UI Map Generator to restrict pathing space
    for (let c = 0; c < config.width; c++) {
        if (c % 2 === 1) {
            for (let r = 0; r < config.height; r++) {
                if (Math.random() < 0.35) {
                    let tile = game.getTile(c, r);
                    if (tile) tile.isBarricade = true;
                }
            }
        }
    }

    game.network = null;
    game.ui = null;

    let botBlueGenes = { [mode]: bot1Genes };
    let botRedGenes = { [mode]: bot2Genes };

    // Disabling Modelers in Training Mode to isolate base evaluations purely mathematically
    let botBlue = new AIBotV2(game, botBlueGenes);
    let botRed = new AIBotV2(game, botRedGenes);

    let turns = 0;
    while (!game.winner && turns < MAX_TURNS) {
        if (game.activeTeam === 'BLUE') {
            const rootState = botBlue.cloneState();
            const result = botBlue.minimax(rootState, 1, -Infinity, Infinity, true, 'BLUE');
            executeBotAction(game, 'BLUE', result.action);
        } else {
            const rootState = botRed.cloneState();
            const result = botRed.minimax(rootState, 1, -Infinity, Infinity, true, 'RED');
            executeBotAction(game, 'RED', result.action);
        }
        turns++;
    }

    const termState = botBlue.cloneState();
    const finalScoreB = botBlue.evaluateBoard(termState, 'BLUE');
    const finalScoreR = botBlue.evaluateBoard(termState, 'RED');

    let winnerId = 0; // 0 = Tie, 1 = b1, 2 = b2
    if (game.winner === 'BLUE') winnerId = 1;
    if (game.winner === 'RED') winnerId = 2;

    return {
        winnerId,
        turns,
        blueFinalScore: finalScoreB,
        redFinalScore: finalScoreR,
        blueFlagsDeploy: termState.units.filter(u => u.player === 'BLUE' && u.isFlag).length,
        redFlagsDeploy: termState.units.filter(u => u.player === 'RED' && u.isFlag).length,
        blueUnits: termState.units.filter(u => u.player === 'BLUE' && !u.isFlag).length,
        redUnits: termState.units.filter(u => u.player === 'RED' && !u.isFlag).length,
        blueCredits: game.credits.BLUE,
        redCredits: game.credits.RED
    };
}

function executeBotAction(game, team, action) {
    if (!action) {
        game.endTurn(false, true);
        return;
    }
    if (action.type === 'DEPLOY') {
        game.deployUnit(team, action.unitType, action.power, action.speed, action.targetCol, action.targetRow);
    } else if (action.type === 'MOVE') {
        game.moveUnit(action.unitCol, action.unitRow, action.targetCol, action.targetRow);
    } else {
        game.endTurn(false, true);
    }
}

function evolve(mode, totalGenLoops, currentPop, absoluteGenerationIndex) {
    console.log(`\n============================`);
    console.log(`STARTING EVOLUTION: ${mode} (Gens ${absoluteGenerationIndex} - ${absoluteGenerationIndex + totalGenLoops - 1})`);
    console.log(`============================`);

    let pop;
    if (currentPop) {
        pop = currentPop;
    } else {
        pop = [deepClone(DEFAULT_V2_GENES[mode])];
        for (let i = 1; i < POPULATION_SIZE; i++) {
            pop.push(mutate(pop[0], mode, 0.8, 1.0));
        }
    }

    for (let gen = 1; gen <= totalGenLoops; gen++) {
        let startTime = Date.now();
        let stats = new Array(POPULATION_SIZE).fill(0).map(() => ({ s: 0, w: 0, t: 0, l: 0, turns: 0, units: 0, crd: 0 }));

        for (let i = 0; i < POPULATION_SIZE; i++) {
            for (let g = 0; g < GAMES_PER_BOT; g++) {
                let oppIndex = i;
                while (oppIndex === i) oppIndex = Math.floor(Math.random() * POPULATION_SIZE);

                let res = runMatch(pop[i], pop[oppIndex], mode);

                if (res.winnerId === 1) {
                    stats[i].s += 3; stats[i].w++;
                    stats[oppIndex].l++;
                } else if (res.winnerId === 2) {
                    stats[oppIndex].s += 3; stats[oppIndex].w++;
                    stats[i].l++;
                } else {
                    let blueTieBreaker = Math.max(0, Math.min(0.99, (res.blueFinalScore + 250000) / 500000));
                    let redTieBreaker = Math.max(0, Math.min(0.99, (res.redFinalScore + 250000) / 500000));

                    stats[i].s += 1 + blueTieBreaker;
                    stats[oppIndex].s += 1 + redTieBreaker;

                    stats[i].t++;
                    stats[oppIndex].t++;
                }

                stats[i].turns += res.turns;
                stats[i].units += res.blueUnits;
                stats[i].crd += res.blueCredits;
            }
        }

        let ranked = pop.map((g, idx) => {
            let totalGames = stats[idx].w + stats[idx].t + stats[idx].l;
            let normalizedFitness = totalGames > 0 ? (stats[idx].s / totalGames) : 0;
            return {
                genes: g,
                ...stats[idx],
                s: normalizedFitness
            };
        }).sort((a, b) => b.s - a.s);

        let trns = (ranked[0].turns / (GAMES_PER_BOT * POPULATION_SIZE)).toFixed(1);
        let uns = (ranked[0].units / (GAMES_PER_BOT * POPULATION_SIZE)).toFixed(1);
        let crd = (ranked[0].crd / (GAMES_PER_BOT * POPULATION_SIZE)).toFixed(1);
        let dur = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`Generation ${absoluteGenerationIndex + gen - 1} - Top Fitness: ${ranked[0].s.toFixed(2)} (${ranked[0].w}W, ${ranked[0].t}T, ${ranked[0].l}L) | Duration: ${dur}s | Win Averages -> Rnds: ${trns}, Units: ${uns}, Crd: ${crd}`);

        let surv = ranked.slice(0, POPULATION_SIZE / 2).map(p => p.genes);
        let nxt = [deepClone(surv[0]), deepClone(surv[1])];

        while (nxt.length < POPULATION_SIZE) {
            let p1 = surv[Math.floor(Math.random() * surv.length)];
            let p2 = surv[Math.floor(Math.random() * (surv.length / 2))];
            nxt.push(mutate(crossover(p1, p2), mode, 0.4, 0.5));
        }

        pop = nxt;

        // WRITE TO DISK EVERY GENERATION SO USER NEVER LOSES PERSISTENCE!
        const genesPath = './js/genes-v2.js';
        let fileContent = fs.readFileSync(genesPath, 'utf8');
        let modeBlockRegex = new RegExp(`(${mode}:\\s*\\{[^}]+\\})`, 'g');

        let stringified = JSON.stringify(surv[0], null, 8).replace(/\\n/g, '\n').replace(/\\"/g, '"');
        stringified = stringified.substring(stringified.indexOf('{') + 1, stringified.lastIndexOf('}')).trim();

        const injectedBlock = `${mode}: {\n        ${stringified}\n    }`;
        fileContent = fileContent.replace(modeBlockRegex, injectedBlock);
        fs.writeFileSync(genesPath, fileContent);
    }

    return pop;
}

// Run sequence chunks of 25 natively multiplexed
async function startTraining() {
    console.log("Welcome to Hex-Invaders Cyclic Persistent Trainer!");

    let popInvade = null;
    let popPlant = null;
    let globalIndex = 1;

    // Cycle 4 batches of 25 = 100 generations per mode multiplexed
    for (let batch = 1; batch <= 4; batch++) {
        console.log(`\n--- TRAIN CYCLE ${batch}/4: SECURING PROGRESS LOCALLY ---`);
        popInvade = evolve('INVADE', 25, popInvade, globalIndex);
        popPlant = evolve('PLANT', 25, popPlant, globalIndex);
        globalIndex += 25;
    }

    console.log("\nAll Cyclic Evolution Matrices completely finished!");
}

startTraining();
