import { HexGame } from './js/game.js';
import { AIBot } from './js/ai-v1.js';
import { DEFAULT_GENES } from './js/genes-v1.js';
import fs from 'fs';

const POPULATION_SIZE = 20;
const GENERATIONS = 30;
const GAMES_PER_BOT = 10;
const MAX_TURNS = 120;

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function mutate(genes, mode, rate = 0.3, variance = 0.5) {
    let g = deepClone(genes);
    for (let key in g) {
        if (key.toLowerCase().includes('win')) continue; // never mutate Terminal
        if (Math.random() < rate) {
            // Scale by +/- (variance / 2)
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

// Runs a single headless game
function runMatch(bot1Genes, bot2Genes, mode) {
    const config = {
        width: 30,
        height: 15,
        mode: mode === 'PLANT' ? 'HIDDEN' : 'NEARBY',
        type: mode,
        credits: 100,
        flagCost: 10
    };

    let game = new HexGame(config);

    // Mock UI Map Generator to restrict pathing space
    for (let c = 0; c < config.width; c++) {
        if (c % 2 === 1) { // create gaps like real map
            for (let r = 0; r < config.height; r++) {
                if (Math.random() < 0.35) {
                    let tile = game.getTile(c, r);
                    if (tile) tile.isBarricade = true;
                }
            }
        }
    }

    // Force network to null to avoid exceptions
    game.network = null;
    game.ui = null;

    let botBlueGenes = { [mode]: bot1Genes };
    let botRedGenes = { [mode]: bot2Genes };

    let botBlue = new AIBot(game, botBlueGenes);
    let botRed = new AIBot(game, botRedGenes);

    let turns = 0;
    while (!game.winner && turns < MAX_TURNS) {
        if (game.activeTeam === 'BLUE') {
            const rootState = botBlue.cloneState();
            const result = botBlue.minimax(rootState, 5, -Infinity, Infinity, true, 'BLUE');
            executeBotAction(game, 'BLUE', result.action);
        } else {
            const rootState = botRed.cloneState();
            const result = botRed.minimax(rootState, 5, -Infinity, Infinity, true, 'RED');
            executeBotAction(game, 'RED', result.action);
        }
        turns++;
    }

    let winTeam = 0;
    if (game.winner === 'BLUE') winTeam = 1;
    if (game.winner === 'RED') winTeam = 2;

    return {
        winner: winTeam,
        turns: turns,
        blueCredits: game.credits.BLUE,
        redCredits: game.credits.RED,
        blueDeployed: game.deployCounts ? game.deployCounts.BLUE : 0,
        redDeployed: game.deployCounts ? game.deployCounts.RED : 0
    };
}

function executeBotAction(game, team, action) {
    if (!action) {
        game.endTurn(false, true);
        return;
    }
    if (action.type === 'DEPLOY') {
        game.deployUnit(team, action.unitType || 'combat', action.power, action.speed, action.targetCol, action.targetRow);
    } else if (action.type === 'MOVE') {
        game.moveUnit(action.unitCol, action.unitRow, action.targetCol, action.targetRow);
    } else {
        game.endTurn(false, true);
    }
}

// EVOLUTION LOOP
function evolve(mode) {
    console.log(`\n============================`);
    console.log(`STARTING EVOLUTION: ${mode}`);
    console.log(`============================`);
    let population = [];
    const absoluteChampion = deepClone(DEFAULT_GENES.UNIFIED);
    population.push(absoluteChampion); // Seat 0 is the Reigning Champion from genes-v1.js!

    for (let i = 1; i < POPULATION_SIZE; i++) {
        // Generate massive variants based on the champion for the initial generation pool
        population.push(mutate(absoluteChampion, mode, 0.8, 1.0));
    }

    for (let gen = 1; gen <= GENERATIONS; gen++) {
        let genStartTime = Date.now();
        let scores = new Array(POPULATION_SIZE).fill(0);
        let ties = new Array(POPULATION_SIZE).fill(0);
        let wins = new Array(POPULATION_SIZE).fill(0);
        let losses = new Array(POPULATION_SIZE).fill(0);
        let matchCounts = new Array(POPULATION_SIZE).fill(0);

        // Win Telemetry Tracking
        let winningRoundsTotal = 0;
        let winningUnitsTotal = 0;
        let winningCreditsTotal = 0;
        let totalWins = 0;

        // Random matchmaking (each plays GAMES_PER_BOT matches)
        for (let i = 0; i < POPULATION_SIZE; i++) {
            for (let g = 0; g < GAMES_PER_BOT; g++) {
                let opponentIndex = Math.floor(Math.random() * POPULATION_SIZE);
                if (opponentIndex === i) continue;

                // Play Match (i is BLUE, opponent is RED)
                let res = runMatch(population[i], population[opponentIndex], mode);
                matchCounts[i]++;
                matchCounts[opponentIndex]++;
                if (res.winner === 1) {
                    scores[i] += 3; // Win
                    wins[i]++;
                    losses[opponentIndex]++;
                    winningRoundsTotal += res.turns;
                    winningUnitsTotal += res.blueDeployed;
                    winningCreditsTotal += res.blueCredits;
                    totalWins++;
                }
                else if (res.winner === 2) {
                    scores[opponentIndex] += 3;
                    wins[opponentIndex]++;
                    losses[i]++;
                    winningRoundsTotal += res.turns;
                    winningUnitsTotal += res.redDeployed;
                    winningCreditsTotal += res.redCredits;
                    totalWins++;
                }
                else {
                    scores[i] += 1; // Tie
                    scores[opponentIndex] += 1;
                    ties[i]++;
                    ties[opponentIndex]++;
                }
            }
        }

        // Rank Population by true Average Match Score to eliminate random matchmaking volume bias
        let ranked = population.map((genes, idx) => {
            let avgBotScore = matchCounts[idx] > 0 ? (scores[idx] / matchCounts[idx]) : 0;
            return { genes, score: scores[idx], tie: ties[idx], win: wins[idx], loss: losses[idx], matchCount: matchCounts[idx], fitness: avgBotScore };
        });
        ranked.sort((a, b) => b.fitness - a.fitness); // DESC by actual win-rate percentage

        let avgGenerationFitness = ranked.reduce((sum, p) => sum + p.fitness, 0) / POPULATION_SIZE;
        let genDuration = ((Date.now() - genStartTime) / 1000).toFixed(2);

        let avgRounds = totalWins > 0 ? (winningRoundsTotal / totalWins).toFixed(1) : 0;
        let avgUnits = totalWins > 0 ? (winningUnitsTotal / totalWins).toFixed(1) : 0;
        let avgCrd = totalWins > 0 ? (winningCreditsTotal / totalWins).toFixed(1) : 0;

        console.log(`Generation ${gen} - Top Fitness: ${ranked[0].fitness.toFixed(2)} (${ranked[0].score}/${ranked[0].matchCount}g) | W:${ranked[0].win}, T:${ranked[0].tie}, L:${ranked[0].loss} | Duration: ${genDuration}s | Win Averages -> Rnds: ${avgRounds}, Units: ${avgUnits}, Crd: ${avgCrd}`);

        // Keep Top 50%
        let survivors = ranked.slice(0, POPULATION_SIZE / 2).map(p => p.genes);
        let nextGen = [];

        // Elitism: carry over top 2 directly
        nextGen.push(deepClone(survivors[0]));
        nextGen.push(deepClone(survivors[1]));

        // Crossover and Mutate the rest
        while (nextGen.length < POPULATION_SIZE) {
            let p1 = survivors[Math.floor(Math.random() * survivors.length)];
            let p2 = survivors[Math.floor(Math.random() * (survivors.length / 2))]; // Heavy bias to top quarter

            let child = crossover(p1, p2);
            child = mutate(child, mode);
            nextGen.push(child);
        }

        population = nextGen;

        // Print fittest at end
        if (gen === GENERATIONS) {
            console.log(`\n[FINAL FITTEST GENES FOR ${mode}]:`);
            console.log(JSON.stringify(survivors[0], null, 2));

            // Write back to genes-v1.js seamlessly
            const genesPath = './js/genes-v1.js';
            let fileContent = fs.readFileSync(genesPath, 'utf8');

            // Regex to find and replace just the inner block for this mode
            const modeBlockRegex = new RegExp(`(${mode}:\\s*\\{[^}]+\\})`, 'g');

            // Reconstruct the gene dict block natively
            let stringified = JSON.stringify(survivors[0], null, 8);
            stringified = stringified.replace(/\\n/g, '\\n').replace(/\\"/g, '"');
            // Remove the top/bottom brackets to splice into the ES6 object cleanly
            stringified = stringified.substring(stringified.indexOf('{') + 1, stringified.lastIndexOf('}')).trim();

            const injectedBlock = `${mode}: {\n        ${stringified}\n    }`;
            fileContent = fileContent.replace(modeBlockRegex, injectedBlock);
            fs.writeFileSync(genesPath, fileContent);
            console.log(`Successfully injected optimized ${mode} genes directly into ./js/genes-v1.js!`);
        }
    }
}

// Run sequentially
console.log("Welcome to Hex-Invaders AI Trainer!");
evolve('INVADE');
evolve('PLANT');
console.log("Evolution completely finished!");
