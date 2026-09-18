const fs = require('fs');
let combined = '';
for (const f of ['hex.js', 'unit.js', 'game.js', 'input.js', 'render.js', 'ui.js', 'network.js', 'ai.js', 'main.js']) {
    let cnt = fs.readFileSync('js/' + f, 'utf8');
    // Remove "export " and "import ... " syntax since we are combining them globally
    cnt = cnt.replace(/export class/g, 'class');
    cnt = cnt.replace(/export const/g, 'const');
    cnt = cnt.replace(/import .*? from .*?;/g, '');
    combined += `// --- ${f} ---\n` + cnt + '\n\n';
}
fs.writeFileSync('js/bundle.js', combined);
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<script type="module" src="js/main.js"></script>', '<script src="js/bundle.js"></script>');
fs.writeFileSync('index.html', html);
console.log("Bundled successfully!");
