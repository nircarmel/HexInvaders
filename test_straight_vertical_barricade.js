import { HexGame } from './js/game.js';
import { Unit } from './js/unit.js';

function assert(condition, message) {
    if (condition) {
        console.log(`[PASS] ${message}`);
    } else {
        console.error(`[FAIL] ${message}`);
        process.exitCode = 1;
    }
}

console.log('--- TESTING STRAIGHT VERTICAL BARRICADES ---');

const game = new HexGame({
    width: 12, height: 8, mode: 'VISIBLE', type: 'INVADE',
    credits: 100, flagCost: 10, barricadeCost: 10
});

// Test 1: getBarricadeFootprint length equals unit strength for strengths 1 through 5
for (let strength = 1; strength <= 5; strength++) {
    const footprint = game.getBarricadeFootprint(5, 4, strength);
    assert(footprint.length === strength, `Strength ${strength} creates footprint of length ${strength} (got ${footprint.length})`);

    // Test 2: Every single tile must be on the exact same column (straight vertical line)
    const allSameCol = footprint.every(pt => pt.col === 5);
    assert(allSameCol, `Strength ${strength} footprint is strictly vertical on column 5`);

    // Test 3: Rows must be consecutive
    const rows = footprint.map(pt => pt.row);
    let consecutive = true;
    for (let i = 1; i < rows.length; i++) {
        if (rows[i] !== rows[i - 1] + 1) consecutive = false;
    }
    assert(consecutive, `Strength ${strength} footprint has consecutive vertical rows: [${rows.join(', ')}]`);
}

// Test 4: Strength 5 default offset centering
const fp5Default = game.getBarricadeFootprint(5, 4, 5); // default offset = Math.floor(5/2) = 2
// Expected rows: 4 - 2 = 2 => [2, 3, 4, 5, 6]
assert(
    fp5Default.map(pt => pt.row).join(',') === '2,3,4,5,6',
    `Strength 5 default offset centers vertically around row 4 => [${fp5Default.map(pt => pt.row).join(',')}]`
);

// Test 5: Strength 5 with offset scrolling
const fp5Offset0 = game.getBarricadeFootprint(5, 4, 5, 0);
assert(
    fp5Offset0.map(pt => pt.row).join(',') === '4,5,6,7,8',
    `Strength 5 with offset 0 starts at row 4 => [${fp5Offset0.map(pt => pt.row).join(',')}]`
);

const fp5Offset4 = game.getBarricadeFootprint(5, 4, 5, 4);
assert(
    fp5Offset4.map(pt => pt.row).join(',') === '0,1,2,3,4',
    `Strength 5 with offset 4 starts at row 0 => [${fp5Offset4.map(pt => pt.row).join(',')}]`
);

// Test 6: Barricade creation on the board
game.setUnit(5, 4, new Unit('BLUE', 'combat', 5, 2, 20));
game.activeTeam = 'BLUE';
game.actionUsed = false;
game.credits['BLUE'] = 50;

const previewKeys = game.getBarricadePreview(5, 4, 2);
assert(previewKeys.length === 5, `Preview has 5 keys: ${previewKeys.join(' ')}`);
assert(
    previewKeys.every(k => k.startsWith('5,')),
    `All preview keys belong to column 5 (straight vertical line)`
);

const canBuild = game.canBarricade(5, 4, 2);
assert(canBuild.valid, `canBarricade should be valid for unit at (5, 4)`);

const created = game.createBarricade(5, 4, 2);
assert(created, `createBarricade returned true`);

// Verify the 5 tiles on column 5 are barricades
for (let r = 2; r <= 6; r++) {
    const tile = game.getTile(5, r);
    assert(tile.isBarricade === true, `Tile (5, ${r}) is marked as a barricade`);
}

// Verify adjacent columns 4 and 6 do not have barricades (no wings)
for (let r = 0; r < game.rows; r++) {
    assert(!game.getTile(4, r).isBarricade, `Column 4 row ${r} is not a barricade (no wings)`);
    assert(!game.getTile(6, r).isBarricade, `Column 6 row ${r} is not a barricade (no wings)`);
}

console.log('--- ALL STRAIGHT VERTICAL BARRICADE TESTS COMPLETED ---');
