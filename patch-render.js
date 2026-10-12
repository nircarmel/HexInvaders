import fs from 'fs';

let code = fs.readFileSync('js/render.js', 'utf8');

// 1. Inject Heatmap Fill Logic
const hmTarget = `                this.drawHex(pt.x, pt.y, this.hexRadius - 1, fill, stroke, lineWidth);`;
const hmReplacement = `                if (this.ui && this.ui.showAIHeatmap && this.game.aiHeatmapCache) {
                    let hm = this.game.aiHeatmapCache.find(h => h.col === col && h.row === row);
                    if (hm) {
                        let hue = (1.0 - hm.norm) * 120; // 0=Red, 120=Green
                        if (hm.norm > 0.5) {
                            hue = 120 + ((hm.norm - 0.5) * 2 * 60); // Green to Cyan
                        }
                        if (hm.occupied) {
                            fill = hm.val > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                        } else {
                            fill = 'hsla(' + hue + ', 100%, 40%, 0.6)';
                        }
                    }
                }
                this.drawHex(pt.x, pt.y, this.hexRadius - 1, fill, stroke, lineWidth);`;

code = code.replace(hmTarget, hmReplacement);

// 2. Inject Action Tree Arrows + Text
const actionTarget = `        this.ctx.restore();`;
const actionReplacement = `        // --- DRAW ACTION TREE ---
        if (this.ui && this.ui.showAIActionTree && this.game.GLOBAL_AI && this.game.GLOBAL_AI.lastEvaluations) {
            let evals = this.game.GLOBAL_AI.lastEvaluations;
            let maxEvalScore = Math.max(...evals.map(e => e.score));

            for (let ev of evals) {
                let a = ev.action;
                if (!a) continue;

                let scoreTxt = (ev.score).toLocaleString();
                let txtColor = ev.score === maxEvalScore ? '#fbbf24' : '#fff';
                let txtSize = ev.score === maxEvalScore ? '18px' : '14px';

                let targetPt;
                if (a.type === 'MOVE') {
                    let startPt = hexMath.hexToPixel(a.unitCol, a.unitRow, this.hexRadius, this.ox, this.oy);
                    targetPt = hexMath.hexToPixel(a.targetCol, a.targetRow, this.hexRadius, this.ox, this.oy);
                    
                    // Draw Vector Arrow
                    this.ctx.beginPath();
                    this.ctx.moveTo(startPt.x, startPt.y);
                    this.ctx.lineTo(targetPt.x, targetPt.y);
                    this.ctx.strokeStyle = ev.score === maxEvalScore ? 'rgba(251, 191, 36, 0.8)' : 'rgba(255, 255, 255, 0.3)';
                    this.ctx.lineWidth = ev.score === maxEvalScore ? 4 : 2;
                    this.ctx.stroke();

                } else if (a.type === 'DEPLOY') {
                    targetPt = hexMath.hexToPixel(a.targetCol, a.targetRow, this.hexRadius, this.ox, this.oy);
                    
                    // Highlight Deploy Target exactly
                    this.drawHex(targetPt.x, targetPt.y, this.hexRadius * 1.2, 'transparent', '#fbbf24', 3);
                }

                if (targetPt) {
                    this.ctx.font = 'bold ' + txtSize + ' Inter, sans-serif';
                    this.ctx.fillStyle = txtColor;
                    this.ctx.shadowColor = 'black';
                    this.ctx.shadowBlur = 4;
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(scoreTxt, targetPt.x, targetPt.y + (a.type === 'DEPLOY' ? 0 : 25));
                    this.ctx.shadowBlur = 0;
                }
            }
        }

        this.ctx.restore();`;

code = code.replace(actionTarget, actionReplacement);

fs.writeFileSync('js/render.js', code);
console.log("RENDER PATCH COMPLETED");
