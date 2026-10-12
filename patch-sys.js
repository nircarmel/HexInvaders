import fs from 'fs';

let html = fs.readFileSync('index.html', 'utf8');

// The original buggy nested chunk from my last replace:
const targetHtml = `                    <!-- Empty container for dynamic insertion of matching Turn interface -->
                    <div id="right-turn-container"
                        style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; gap: 10px;">
                        
                        <!-- AI INSIGHT BUTTONS -->
                        <div style="display: flex; flex-direction: column; width: 90%; gap: 8px; margin-top: auto; margin-bottom: 20px;">
                            <button id="btn-ai-action-tree" class="btn-primary w-hover" 
                                style="background: linear-gradient(135deg, #8b5cf6, #6d28d9); font-size: 0.75rem; padding: 8px; width: 100%;">
                                HOLD: Action Tree
                            </button>
                            <button id="btn-ai-heatmap" class="btn-primary w-hover" 
                                style="background: linear-gradient(135deg, #f59e0b, #b45309); font-size: 0.75rem; padding: 8px; width: 100%;">
                                HOLD: Terrain Heatmap
                            </button>
                        </div>
                    </div>`;

const replaceHtml = `                    <!-- Empty container for dynamic insertion of matching Turn interface -->
                    <div id="right-turn-container" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
                    </div>

                    <!-- AI INSIGHT BUTTONS (Completely independent from turn swapping) -->
                    <div style="display: flex; flex-direction: column; width: 90%; gap: 8px; margin-top: auto; margin-bottom: 20px;">
                        <button id="btn-ai-action-tree" class="btn-primary w-hover" 
                            style="background: linear-gradient(135deg, #8b5cf6, #6d28d9); font-size: 0.75rem; padding: 8px; width: 100%;">
                            HOLD: Action Tree
                        </button>
                        <button id="btn-ai-heatmap" class="btn-primary w-hover" 
                            style="background: linear-gradient(135deg, #f59e0b, #b45309); font-size: 0.75rem; padding: 8px; width: 100%;">
                            HOLD: Terrain Heatmap
                        </button>
                    </div>`;

// Replace index.html
if (html.includes(targetHtml)) {
    fs.writeFileSync('index.html', html.replace(targetHtml, replaceHtml));
} else {
    // If exact spacing failed, let's use indexOf
    const rootStart = html.indexOf(`                    <!-- Empty container for dynamic insertion of matching Turn interface -->`);
    const rootEnd = html.indexOf(`                </div>`, rootStart);
    if (rootStart !== -1 && rootEnd !== -1) {
        let nhtml = html.substring(0, rootStart) + replaceHtml + `\n` + html.substring(rootEnd);
        fs.writeFileSync('index.html', nhtml);
    }
}

// 2. Fix main.js
let main = fs.readFileSync('js/main.js', 'utf8');
main = main.replace(`GLOBAL_AI = new AIBot(game);`, `GLOBAL_AI = new AIBot(game);
            game.aiBot = GLOBAL_AI;`);
fs.writeFileSync('js/main.js', main);


// 3. Fix ui.js & render.js to use game.aiBot
let ui = fs.readFileSync('js/ui.js', 'utf8');
ui = ui.replace(/window\.GLOBAL_AI/g, 'this.game.aiBot');
fs.writeFileSync('js/ui.js', ui);

let render = fs.readFileSync('js/render.js', 'utf8');
render = render.replace(/this\.game\.GLOBAL_AI/g, 'this.game.aiBot');
fs.writeFileSync('js/render.js', render);

console.log("ALL FIXES APPLIED");
