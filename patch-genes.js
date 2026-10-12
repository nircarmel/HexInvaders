import fs from 'fs';

let code = fs.readFileSync('js/ai-v1.js', 'utf8');

// Replace k1
code = code.replace(
    "score += ownCredits * (modeGenes.k1 !== undefined ? modeGenes.k1 : 1);",
    "score += ownCredits * (modeGenes.credit_multiplier !== undefined ? modeGenes.credit_multiplier : 1);"
);
code = code.replace(
    "score -= oppCredits * (modeGenes.k1 !== undefined ? modeGenes.k1 : 1);",
    "score -= oppCredits * (modeGenes.credit_multiplier !== undefined ? modeGenes.credit_multiplier : 1);"
);

// Replace observation
code = code.replace(
    "uScore = modeGenes.obs_value !== undefined ? modeGenes.obs_value : 50;",
    `let obsPower = 5;
                let obsSpeed = 5;
                let obsTtgVal = Math.max(1, this.turnsToGoal(u.col, obsSpeed, goalCol));
                let factor = modeGenes.obs_value_factor !== undefined ? modeGenes.obs_value_factor : 0.7;
                uScore = ((obsPower * (modeGenes.advance_bonus !== undefined ? modeGenes.advance_bonus : 100)) / obsTtgVal) * factor;`
);

// Replace K
code = code.replace(
    "uScore = ((power * (modeGenes.K !== undefined ? modeGenes.K : 100)) / ttgVal) * flagMult;",
    "uScore = ((power * (modeGenes.advance_bonus !== undefined ? modeGenes.advance_bonus : 100)) / ttgVal) * flagMult;"
);

// In case the spacing is weird for K:
code = code.replace(
    /modeGenes\.K(?: !== undefined \? modeGenes\.K : 100\))/g,
    "modeGenes.advance_bonus !== undefined ? modeGenes.advance_bonus : 100)"
);

fs.writeFileSync('js/ai-v1.js', code);
console.log("PATCH COMPLETE");
