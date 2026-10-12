// js/ui.js
import { hexMath } from './hex.js';

export class UIManager {
    constructor(game, render, input) {
        this.game = game;
        this.render = render;
        if (this.render) this.render.ui = this;
        this.input = input;

        this.currentAction = null; // 'MOVE', 'WAITING_MOVE'

        this.bindEvents();
        this.updateHUD();

        this.isTimerMuted = false;

        this.game.onLog = () => this.refreshLog();
        this.game.onCombat = (c, r, instant = false) => {
            if (instant) {
                this.render.addExplosion(c, r);
            } else {
                setTimeout(() => this.render.addExplosion(c, r), 500);
            }
        };
        this.game.onStateChange = () => {
            this.currentAction = null;
            this.game.selectedTile = null;
            this.render.validPath = null;
            this.closeContextMenu();
            this.updateHUD();
        };
        this.game.onWinner = (team, reason) => this.showVictory(team, reason);
    }

    bindEvents() {
        this.btnEndTurn = document.getElementById('btn-end-turn');
        this.btnEndTurn.addEventListener('click', () => {
            if (this.game.gameMode === 'ONLINE' && this.game.localTeam !== this.game.activeTeam) return;
            if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;
            this.game.endTurn();
        });

        this.btnToggleLog = document.getElementById('btn-toggle-log');
        this.floatingLog = document.getElementById('floating-log');

        if (this.btnToggleLog && this.floatingLog) {
            this.btnToggleLog.addEventListener('click', () => {
                this.floatingLog.classList.toggle('hidden');
            });
        }

        this.btnMuteTimer = document.getElementById('btn-mute-timer');
        if (this.btnMuteTimer) {
            this.btnMuteTimer.addEventListener('click', () => {
                this.isTimerMuted = !this.isTimerMuted;
                this.btnMuteTimer.innerText = this.isTimerMuted ? '🔇' : '🔊';
            });
        }

        // Help Modal interactions
        const btnHelp = document.getElementById('btn-help');
        const helpPanel = document.getElementById('help-panel');
        const btnCloseHelp = document.getElementById('btn-close-help');
        const helpOverlay = document.getElementById('help-overlay');
        if (btnHelp && helpPanel) {
            btnHelp.addEventListener('click', () => {
                helpPanel.classList.toggle('hidden');
                if (helpOverlay) helpOverlay.classList.toggle('hidden');
            });

            const closePanels = () => {
                helpPanel.classList.add('hidden');
                if (helpOverlay) helpOverlay.classList.add('hidden');
            };

            if (btnCloseHelp) {
                btnCloseHelp.addEventListener('click', closePanels);
            }
            if (helpOverlay) {
                helpOverlay.addEventListener('click', closePanels);
            }
        }

        // Map AI insight visual flags natively
        this.showAIActionTree = false;
        this.showAIHeatmap = false;
        this.aiHeatmapTeam = null;

        const btnAiTreeBlue = document.getElementById('btn-blue-action-tree');
        if (btnAiTreeBlue) {
            btnAiTreeBlue.addEventListener('click', () => {
                this.toggleAIHeatmap('BLUE');
            });
        }

        const btnAiTreeRed = document.getElementById('btn-red-action-tree');
        if (btnAiTreeRed) {
            btnAiTreeRed.addEventListener('click', () => {
                this.toggleAIHeatmap('RED');
            });
        }

        const btnBlueAiPrev = document.getElementById('btn-blue-ai-prev');
        const btnBlueAiNext = document.getElementById('btn-blue-ai-next');
        if (btnBlueAiPrev) btnBlueAiPrev.addEventListener('click', () => this.stepAITurn('BLUE', -1));
        if (btnBlueAiNext) btnBlueAiNext.addEventListener('click', () => this.stepAITurn('BLUE', 1));

        const btnRedAiPrev = document.getElementById('btn-red-ai-prev');
        const btnRedAiNext = document.getElementById('btn-red-ai-next');
        if (btnRedAiPrev) btnRedAiPrev.addEventListener('click', () => this.stepAITurn('RED', -1));
        if (btnRedAiNext) btnRedAiNext.addEventListener('click', () => this.stepAITurn('RED', 1));

        this.initTeachAI();

        // History Controls
        document.getElementById('btn-hist-prev').addEventListener('click', () => {
            let idx = this.game.historyIndex - 1;
            if (idx >= 0) {
                this.game.loadSnapshot(idx);
                this.updateHUD();
                this.resetActiveState();
                this.game.logSystem(`Viewing Turn History Snapshot: ${idx + 1}/${this.game.history.length}`);
            }
        });
        document.getElementById('btn-hist-next').addEventListener('click', () => {
            let idx = this.game.historyIndex + 1;
            if (idx < this.game.history.length) {
                this.game.loadSnapshot(idx);
                this.updateHUD();
                this.resetActiveState();
                if (idx === this.game.history.length - 1) {
                    this.game.logSystem("Returned to LIVE state.");
                } else {
                    this.game.logSystem(`Viewing Turn History Snapshot: ${idx + 1}/${this.game.history.length}`);
                }
            }
        });
        const btnClock = document.getElementById('btn-clock');
        if (btnClock) {
            btnClock.addEventListener('click', () => {
                this.timeMachineOpen = !this.timeMachineOpen;
                this.updateHUD();
            });
        }

        document.getElementById('btn-hist-live').addEventListener('click', () => {
            this.timeMachineOpen = false;
            if (this.game.historyIndex !== this.game.history.length - 1) {
                this.game.loadSnapshot(this.game.history.length - 1);
                this.resetActiveState();
                this.game.logSystem("Returned to LIVE state.");
            }
            this.updateHUD();
        });
        const btnExitGame = document.getElementById('btn-exit-game');
        if (btnExitGame) btnExitGame.onclick = () => location.reload();

        const btnRestart = document.getElementById('btn-restart-game');
        if (btnRestart) btnRestart.onclick = () => { if (window.restartCurrentGame) window.restartCurrentGame(this.game.config); };

        // Context Menu Elements
        this.contextMenu = document.getElementById('context-menu');
        this.contextOptions = document.getElementById('context-options');
        this.contextDeployPanel = document.getElementById('context-deploy-panel');
        this.btnCloseContext = document.getElementById('btn-close-context');
        this.unitTooltip = document.getElementById('unit-tooltip');

        this.btnCloseContext.addEventListener('click', () => {
            this.closeContextMenu();
            this.game.selectedTile = null;
            this.render.validPath = null;
            this.currentAction = null;
        });

        // 1-Click Stat Matrix initialization is dynamic per deployment click        
        this.input.onHexClick = (col, row, key, e) => this.handleHexClick(col, row, key, e);
        this.input.onHexRightClick = (col, row, key, e) => this.handleHexRightClick(col, row, key, e);

        const origHover = this.input.handleHover.bind(this.input);
        this.input.handleHover = (e) => {
            origHover(e);
            this.updatePathPreview();
            this.updateTooltip(e);
        };

        this.barricadeOffset = undefined;
        window.addEventListener('wheel', (e) => {
            if (this.currentAction === 'WAITING_BARRICADE' && this.game.selectedTile) {
                e.preventDefault();
                e.stopPropagation(); // Prevent input.js from zooming the canvas

                const s = this.game.selectedTile.split(',');
                const col = parseInt(s[0]);
                const row = parseInt(s[1]);
                const unit = this.game.getTile(col, row).unit;
                if (!unit) return;

                const length = Math.max(1, unit.strength || 1);
                if (this.barricadeOffset === undefined) {
                    this.barricadeOffset = Math.floor(length / 2);
                }

                if (e.deltaY < 0) {
                    this.barricadeOffset = Math.min(length - 1, this.barricadeOffset + 1);
                } else if (e.deltaY > 0) {
                    this.barricadeOffset = Math.max(0, this.barricadeOffset - 1);
                }

                const barricadeCheck = this.game.canBarricade(col, row, this.barricadeOffset);
                if (barricadeCheck.valid) {
                    this.render.previewBarricade = this.game.getBarricadePreview(col, row, this.barricadeOffset);
                }
            }
        }, { capture: true });
    }

    updateTooltip(e) {
        this.render.hoverHexes = null;
        this.render.visionHexes = null;
        const hover = this.render.hoveredHex;
        if (!hover) {
            if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
            return;
        }

        const spl = hover.split(',');
        const col = parseInt(spl[0]);
        const row = parseInt(spl[1]);
        const tile = this.game.getTile(col, row);

        if (tile && tile.unit && !tile.unit.isFlag) {
            // Respect fog of war
            let perspective = this.game.activeTeam;
            if (this.game.gameMode === 'ONLINE' || this.game.gameMode === 'AI') {
                perspective = this.game.localTeam;
            }

            const isAIHeatmapDebug = this.showAIHeatmap;

            // Absolutely hide completely if blocked by barricade line-of-sight (bypassed in AI heatmap debug mode)
            if (!isAIHeatmapDebug && tile.unit.team !== perspective && tile.unit.type !== 'observation' && !this.game.canSeeUnit(col, row, perspective)) {
                if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
                return;
            }

            let hideStats = isAIHeatmapDebug ? false : this.game.getFogOfWar(col, row, perspective);

            if (tile.unit.exposedCounter && tile.unit.exposedCounter > 0) {
                hideStats = false;
            }

            if (!this.game.selectedTile && !this._contextTarget) {
                this.render.visionHexes = this.game.getUnitVision(col, row);
            }

            if (!hideStats) {
                if (!this.game.selectedTile && !this._contextTarget) {
                    this.render.hoverHexes = this.game.getReachableHexes(col, row, tile.unit.team, tile.unit.speed);
                    this.render.hoverHexesColor = tile.unit.team === 'BLUE' ? 'rgba(59, 130, 246, 0.120)' : 'rgba(239, 68, 68, 0.120)';
                }

                document.getElementById('tt-str').innerText = tile.unit.strength;
                document.getElementById('tt-spd').innerText = tile.unit.speed;
                this.unitTooltip.classList.remove('hidden');

                // Position relative to local canvas bounds
                const canvasEl = document.getElementById('gameCanvas');
                const rect = canvasEl.getBoundingClientRect();
                this.unitTooltip.style.left = `${e.clientX - rect.left}px`;
                this.unitTooltip.style.top = `${e.clientY - rect.top - 20}px`;
                return;
            }
        }

        if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
    }

    updatePopupTracking() {
        if (!this.contextMenu.classList.contains('hidden') && this._contextTarget) {
            const isDeploy = !this.contextDeployPanel.classList.contains('hidden');
            if (!isDeploy) return;

            const centerRow = (this.game.rows - 1) / 2;

            const isBlue = this._contextTarget.col < this.game.cols / 2;
            let targetCol = isBlue ? 1 : this.game.cols - 2;

            const pt = hexMath.hexToPixel(targetCol, centerRow, this.render.hexRadius);

            // Apply camera offsets
            const screenX = pt.x * this.render.camera.zoom + this.render.camera.x;
            const screenY = pt.y * this.render.camera.zoom + this.render.camera.y;

            const canvas = document.getElementById('gameCanvas');
            const rect = canvas.getBoundingClientRect();

            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;

            let cssX = screenX * scaleX;
            let cssY = screenY * scaleY;

            this.contextMenu.style.left = cssX + 'px';
            this.contextMenu.style.top = cssY + 'px';

            if (isBlue) {
                this.contextMenu.style.transform = 'translate(0%, -50%)';
            } else {
                this.contextMenu.style.transform = 'translate(-100%, -50%)';
            }
        }
    }

    playTickSound() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Mechanical tick simulation
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, this.audioCtx.currentTime);

        // Extremely short attack and decay (20ms)
        gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.02);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.03);
    }

    updateHUDTimer(timeRemaining) {
        const timerDiv = document.getElementById('turn-timer');
        const muteBtn = document.getElementById('btn-mute-timer');
        if (!timerDiv) return;

        if (this.game.timerDuration > 0) {
            timerDiv.classList.remove('hidden');
            if (muteBtn) muteBtn.style.display = 'flex';

            timerDiv.style.color = timeRemaining <= 5 ? '#ef4444' : 'white';
            timerDiv.innerText = `${timeRemaining}s`;

            if (timeRemaining > 0 && timeRemaining <= 3 && !this.isTimerMuted) {
                const isMyTurn = this.game.activeTeam === this.game.localTeam || this.game.gameMode === 'LOCAL';
                if (isMyTurn) {
                    this.playTickSound();
                }
            }
        } else {
            timerDiv.classList.add('hidden');
            if (muteBtn) muteBtn.style.display = 'none';
        }
    }

    updateHUD() {
        if (!this.topPanelInitialized && this.game.config) {
            this.topPanelInitialized = true;

            // Mode Value and Tooltip
            let modeEl = document.getElementById('info-mode');
            if (this.game.config.type === 'PLANT') {
                modeEl.innerText = 'Plant Flag';
                modeEl.title = "First player to reach the enemy home with a FLAG UNIT wins.";
            } else {
                modeEl.innerText = 'Invade';
                modeEl.title = "First player to reach the enemy home with ANY UNIT wins.";
            }
            modeEl.style.cursor = 'help';

            // Visibility Value and Tooltip
            let visEl = document.getElementById('info-vis');
            let visData = {
                'HIDDEN': { text: 'Your Units', title: 'Speed and Power are visible only for your units.' },
                'NEARBY': { text: 'Nearby Units', title: 'Speed and Power are visible for units within move range + 1.' },
                'VISIBLE': { text: 'All Units', title: 'Speed and Power are visible for all units.' }
            };
            let v = visData[this.game.config.mode] || { text: 'Unknown', title: '' };
            visEl.innerText = v.text;
            visEl.title = v.title;
            visEl.style.cursor = 'help';

            // Power Value and Tooltip
            let pwrEl = document.getElementById('info-power');
            if (this.game.config.powerMode === 'DEPLETING') {
                pwrEl.innerText = 'Depleting';
                pwrEl.title = "Units lose 1 Power point after each fight.";
            } else {
                pwrEl.innerText = 'Constant';
                pwrEl.title = "Units keep their Power value for the whole game.";
            }
            pwrEl.style.cursor = 'help';
        }

        const bNamePlate = document.getElementById('blue-name-plate');
        if (bNamePlate) {
            bNamePlate.innerText = this.game.blueName;
            bNamePlate.style.fontSize = this.game.blueName.length > 10 ? '1.1rem' : '1.5rem';
        }

        const rNamePlate = document.getElementById('red-name-plate');
        if (rNamePlate) {
            rNamePlate.innerText = this.game.redName;
            rNamePlate.style.fontSize = this.game.redName.length > 10 ? '1.1rem' : '1.5rem';
        }

        const bCredits = document.getElementById('blue-credits');
        const rCredits = document.getElementById('red-credits');
        if (bCredits) bCredits.innerText = this.game.credits['BLUE'];
        if (rCredits) rCredits.innerText = this.game.credits['RED'];

        const goalText = document.getElementById('help-goal-text');
        if (goalText && this.game.config) {
            const isPlant = this.game.config.type === 'PLANT';
            goalText.innerText = isPlant ?
                "Be the first player to move a Flag Unit into the enemy base." :
                "Be the first player to move a unit into the enemy base.";

            const flagSection = document.getElementById('help-section-flag');
            if (flagSection) {
                flagSection.style.display = isPlant ? 'block' : 'none';
            }
        }

        const bluePanel = document.querySelector('.team-panel.blue-team');
        const redPanel = document.querySelector('.team-panel.red-team');
        const turnSidebar = document.getElementById('turn-action-sidebar');
        const bigText = document.getElementById('big-turn-text');
        const skipBtn = document.getElementById('btn-end-turn');

        if (this.game.activeTeam === 'BLUE') {
            bluePanel.classList.add('active-turn');
            redPanel.classList.remove('active-turn');

            const leftBox = document.getElementById('left-turn-container');
            if (leftBox) leftBox.appendChild(turnSidebar);

            bigText.style.color = '#3b82f6';
            bigText.style.color = '#3b82f6';
            skipBtn.classList.remove('btn-red');
        } else {
            bluePanel.classList.remove('active-turn');
            redPanel.classList.add('active-turn');

            const rightBox = document.getElementById('right-turn-container');
            if (rightBox) rightBox.appendChild(turnSidebar);

            bigText.style.color = '#ef4444';
            bigText.style.color = '#ef4444';
            skipBtn.classList.add('btn-red');
        }

        // When playing against a bot, the bot player should not have a "skip Action" button
        const isCurrentPlayerBot = (this.game.gameMode === 'AI' && this.game.activeTeam !== this.game.localTeam);
        skipBtn.style.display = isCurrentPlayerBot ? 'none' : 'block';

        // When playing vs computer, remove the two hexagon (red/blue) buttons on the bot AI's player panel
        const isRedBot = (this.game.gameMode === 'AI' && (this.game.localTeam === 'BLUE' || !this.game.localTeam));
        const redHexToggleGroup = document.getElementById('red-hex-toggle-group');
        if (redHexToggleGroup) {
            redHexToggleGroup.style.display = isRedBot ? 'none' : 'flex';
        }
        const blueHexToggleGroup = document.getElementById('blue-hex-toggle-group');
        if (blueHexToggleGroup) {
            blueHexToggleGroup.style.display = 'flex';
        }

        if (this.game.winner && !this.historyHasWon) {
            this.historyHasWon = true;
            this.timeMachineOpen = true;
        }

        const hist = document.getElementById('history-controls');
        const clock = document.getElementById('btn-clock');
        if (hist && clock) {
            hist.style.display = this.timeMachineOpen ? 'flex' : 'none';
        }

        // Show robot button ONLY for computer player, hide under human player
        const isBlueAI = (this.game.gameMode === 'AI' && this.game.localTeam === 'RED') || (this.game.aiBot && this.game.aiTeam === 'BLUE');
        const isRedAI = (this.game.gameMode === 'AI' && (this.game.localTeam === 'BLUE' || !this.game.localTeam)) || (this.game.aiBot && this.game.aiTeam === 'RED');

        const blueAiContainer = document.getElementById('blue-ai-container');
        const redAiContainer = document.getElementById('red-ai-container');
        if (blueAiContainer) blueAiContainer.style.display = isBlueAI ? 'flex' : 'none';
        if (redAiContainer) redAiContainer.style.display = isRedAI ? 'flex' : 'none';

        if (this.showAIHeatmap) {
            this.updateAIHeatmapForCurrentSnapshot();
        }
        this.updateAIHeatmapUI();
    }

    refreshLog() {
        const c = document.getElementById('action-log');
        c.innerHTML = '';
        const limit = Math.max(0, this.game.logs.length - 50);
        for (let i = limit; i < this.game.logs.length; i++) {
            const l = this.game.logs[i];
            const div = document.createElement('div');
            div.className = `log-entry log-entry-${l.type} ${l.isCombat ? 'log-entry-combat' : ''}`;
            div.innerText = l.text;
            c.appendChild(div);
        }
        c.scrollTop = c.scrollHeight;
    }

    closeContextMenu() {
        this.contextMenu.classList.add('hidden');
        this.contextOptions.innerHTML = '';
        this.contextDeployPanel.classList.add('hidden');
        this._contextTarget = null;
    }

    openContextMenu(x, y, col, row, options, customOpts = {}) {
        this.closeContextMenu();
        this._contextTarget = { col, row };

        const headerText = this.contextMenu.querySelector('h4');
        const closeBtn = document.getElementById('btn-close-context');

        if (customOpts.isBarricade) {
            headerText.innerText = 'Build a Barricade';
            closeBtn.style.display = 'none';

            this.contextOptions.innerHTML = `
                <div style="text-align: center; color: #ccc; margin-bottom: 20px; font-size: 0.95rem;">
                    <div style="color: #60a5fa; font-weight: bold; margin-bottom: 10px;">Cost: ${customOpts.cost} credits</div>
                    <div style="font-size: 0.85rem; line-height: 1.5;">
                        <span style="font-size: 1.2rem; color: #10b981;">⇕</span><br>
                        Scroll mouse to position<br>barricade
                    </div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-barricade-build" class="btn-action" style="background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.4); color: #10b981;">Build</button>
                    <button id="btn-barricade-cancel" class="btn-action" style="background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #ef4444;">Cancel</button>
                </div>
            `;

            document.getElementById('btn-barricade-build').addEventListener('click', customOpts.onConfirm);
            document.getElementById('btn-barricade-cancel').addEventListener('click', () => {
                this.resetActiveState();
                this.updateHUD();
            });
        } else {
            headerText.innerText = 'Deploy Unit';
            closeBtn.style.display = 'block';

            // Build buttons first to populate DOM
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'btn-action';
                btn.innerText = opt.label;
                btn.addEventListener('click', opt.onClick);
                this.contextOptions.appendChild(btn);
            });
        }

        this.contextMenu.classList.remove('hidden');

        const rect = this.canvas.getBoundingClientRect();

        const estMaxHeight = customOpts.isBarricade ? 180 : 450;
        const estMaxWidth = customOpts.isBarricade ? 200 : 270;

        let localX = x - rect.left;
        let localY = y - rect.top;

        let safeX = localX > rect.width / 2 ? localX - estMaxWidth - 10 : localX + 10;
        let safeY = localY > rect.height / 2 ? localY - estMaxHeight - 10 : localY + 10;

        if (safeX < 10) safeX = 10;
        if (safeY < 10) safeY = 10;

        this.contextMenu.style.left = `${safeX}px`;
        this.contextMenu.style.top = `${safeY}px`;
        this.contextMenu.style.transform = 'none';
    }

    resetActiveState() {
        this.closeContextMenu();
        this.game.selectedTile = null;
        this.render.validPath = null;
        this.render.highlightHexes = null;
        this.render.previewBarricade = null;
        this.barricadeOffset = undefined;
        this.currentAction = null;
    }

    handleHexClick(col, row, key, e) {
        if (this.game.winner) return;

        // Teach AI: intercept tile click to insert tile coordinates and score
        if (this.teachAIPanelOpen && this.isAwaitingTileMention()) {
            this.insertTileMention(col, row);
            return;
        }

        if (this.game.historyIndex !== this.game.history.length - 1) {
            this.game.logSystem("Viewing history. Return to Live state to take actions.");
            return;
        }

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        // If we are currently building a path
        if (this.currentAction === 'WAITING_MOVE' && this.game.selectedTile) {
            const s = this.game.selectedTile.split(',');
            const sC = parseInt(s[0]);
            const sR = parseInt(s[1]);

            if (this.game.selectedTile !== key) {
                this.game.moveUnit(sC, sR, col, row);
            }
            this.resetActiveState();
            return;
        }

        this.resetActiveState();

        const tile = this.game.getTile(col, row);
        if (tile.unit && tile.unit.team === this.game.activeTeam) {
            if (this.game.actionUsed) {
                this.game.logSystem("You have already used your action this turn.");
                return;
            }

            this.currentAction = 'WAITING_MOVE';
            this.game.selectedTile = key;
            this.render.hoverHexes = null;
            this.render.visionHexes = null;
            this.render.highlightHexes = this.game.getReachableHexes(col, row, this.game.activeTeam, tile.unit.speed);
            this.render.highlightHexesColor = this.game.activeTeam === 'BLUE' ? 'rgba(59, 130, 246, 0.120)' : 'rgba(239, 68, 68, 0.120)';
        } else if (!tile.unit && !tile.isBarricade) {
            // EMPTY TILE: check if it's our deploy baseline
            if ((this.game.activeTeam === 'BLUE' && col === 0) || (this.game.activeTeam === 'RED' && col === this.game.cols - 1)) {
                if (this.game.actionUsed && this.game.phase === 'MAIN') {
                    this.game.logSystem("You have already used your action this turn.");
                    return;
                }

                // Directly trigger Deploy Combat panel
                this.closeContextMenu();
                this._contextTarget = { col, row };

                this.contextMenu.classList.remove('hidden');
                this.contextDeployPanel.classList.remove('hidden');

                this.updatePopupTracking();

                this.buildDeployMatrix(false, this.game.config.maxStrength, this.game.config.maxSpeed, col, row, e);
            }
        }

        this.updateHUD();
    }

    buildDeployMatrix(isFlag, maxPower, maxSpeed, col, row, e) {
        const container = document.getElementById('stat-matrix');
        container.innerHTML = '';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${maxSpeed}, 1fr)`;
        container.style.gap = '4px';

        for (let p = maxPower; p >= (isFlag ? 0 : 1); p--) {
            if (isFlag && p !== 0) continue;

            for (let s = 1; s <= maxSpeed; s++) {
                const btn = document.createElement('div');
                const cost = isFlag ? this.game.config.flagCost * s : p * s;
                btn.className = 'stat-matrix-node';

                const ratio = (cost - 1) / (Math.max(1, (maxPower * maxSpeed) - 1));
                const hue = isFlag ? 200 : (1 - Math.pow(ratio, 0.7)) * 120; // 200 is light blue for flags, or green/red scaling for units
                btn.style.backgroundColor = `hsla(${hue}, 80%, 40%, 0.6)`;
                btn.style.border = `1px solid hsla(${hue}, 80%, 60%, 0.5)`;
                btn.style.width = '26px';
                btn.style.height = '26px';
                btn.style.borderRadius = '5px';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.flexDirection = 'column';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.lineHeight = '1';
                btn.style.transition = 'all 0.15s ease-out';
                btn.style.userSelect = 'none';
                const currentCredits = this.game.credits[this.game.activeTeam];

                if (cost > currentCredits) {
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                }

                btn.innerHTML = ``;

                const sizeP = maxPower > 0 ? 0.4 + (p / maxPower) * 0.35 : 0;
                const sizeS = 0.4 + (s / maxSpeed) * 0.35;

                btn.addEventListener('mouseenter', () => {
                    document.getElementById('preview-cost').innerHTML = `Cost: ${cost}`;
                    document.getElementById('axis-speed-val').innerText = s;
                    document.getElementById('axis-power-val').innerText = isFlag ? '-' : p;
                    btn.style.transform = 'scale(1.15)';
                    btn.style.backgroundColor = `hsla(${hue}, 90%, 55%, 1)`;
                    btn.style.boxShadow = `0 0 10px hsla(${hue}, 80%, 50%, 0.6)`;
                    btn.style.zIndex = '10';

                    btn.innerHTML = `<b style="font-size:${sizeS}rem; color:#fff; line-height:1;">S${s}</b>` + (isFlag ? `` : `<b style="font-size:${sizeP}rem; color:#fff; line-height:1;">P${p}</b>`);
                });

                btn.addEventListener('mouseleave', () => {
                    document.getElementById('preview-cost').innerText = 'Cost: -';
                    document.getElementById('axis-speed-val').innerText = '-';
                    document.getElementById('axis-power-val').innerText = '-';
                    btn.style.transform = 'scale(1)';
                    btn.style.backgroundColor = `hsla(${hue}, 80%, 40%, 0.6)`;
                    btn.style.boxShadow = 'none';
                    btn.style.zIndex = '1';

                    btn.innerHTML = ``;
                });

                if (cost <= currentCredits) {
                    btn.addEventListener('click', () => {
                        this.game.deployUnit(this.game.activeTeam, isFlag ? 'flag' : 'combat', p, s, col, row);
                        this.resetActiveState();
                        this.updateHUD();
                        this.closeContextMenu();
                    });
                }

                container.appendChild(btn);
            }
        }
    }

    handleHexRightClick(col, row, key, e) {
        if (this.game.winner) return;
        if (this.game.historyIndex !== this.game.history.length - 1) {
            this.game.logSystem("Viewing history. Return to Live state to take actions.");
            return;
        }

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        this.resetActiveState();

        const tile = this.game.getTile(col, row);
        if (tile.unit && tile.unit.team === this.game.activeTeam) {
            if (this.game.actionUsed) {
                this.game.logSystem("You have already used your action this turn.");
                return;
            }
            const barricadeCheck = this.game.canBarricade(col, row);
            if (barricadeCheck.valid) {
                this.currentAction = 'WAITING_BARRICADE'; // Must define state immediately so scroll captures it!
                this.game.selectedTile = key;
                const length = Math.max(1, tile.unit.strength || 1);
                this.barricadeOffset = Math.floor(length / 2); // initialize offset

                this.render.hoverHexes = null;
                this.render.previewBarricade = this.game.getBarricadePreview(col, row, this.barricadeOffset);

                const cost = this.game.config ? (this.game.config.barricadeCost || 10) : 10;
                this.openContextMenu(e.clientX, e.clientY, col, row, [], {
                    isBarricade: true,
                    cost: cost,
                    onConfirm: () => {
                        this.game.createBarricade(col, row, this.barricadeOffset);
                        this.resetActiveState();
                        this.updateHUD();
                    }
                });
            } else {
                this.game.logSystem(`Invalid Barricade: ${barricadeCheck.reason}`);
            }
        } else if (!tile.unit && !tile.isBarricade) {
            // Check if Empty tile is in our deploy baseline
            if ((this.game.activeTeam === 'BLUE' && col === 0) || (this.game.activeTeam === 'RED' && col === this.game.cols - 1)) {
                if (this.game.actionUsed && this.game.phase === 'MAIN') {
                    this.game.logSystem("You have already used your action this turn.");
                    return;
                }

                if (this.game.config && this.game.config.type === 'INVADE') {
                    this.game.logSystem("Flags cannot be deployed during an Invade mission.");
                    return;
                }

                this.closeContextMenu();
                this._contextTarget = { col, row };
                this.contextMenu.classList.remove('hidden');
                this.contextDeployPanel.classList.remove('hidden');

                this.updatePopupTracking();

                this.buildDeployMatrix(true, 0, this.game.config.maxSpeed, col, row, e);
            }
        }
    }

    updatePathPreview() {
        if (this.currentAction === 'WAITING_MOVE' && this.game.selectedTile && this.render.hoveredHex) {
            const s = this.game.selectedTile.split(',');
            const startCol = parseInt(s[0]);
            const startRow = parseInt(s[1]);

            const h = this.render.hoveredHex.split(',');
            const endCol = parseInt(h[0]);
            const endRow = parseInt(h[1]);

            const unit = this.game.getTile(startCol, startRow).unit;
            if (!unit || unit.team !== this.game.activeTeam) return;

            const path = this.game.findPath(startCol, startRow, endCol, endRow, unit.team, unit.speed);
            this.render.validPath = path || null;

            this.render.invalidMove = false;
            if (path) {
                const targetTile = this.game.getTile(endCol, endRow);
                if (targetTile.unit && targetTile.unit.team !== unit.team) {
                    if (unit.isFlag || (targetTile.unit.strength >= unit.strength && !targetTile.unit.isFlag)) {
                        this.render.invalidMove = true;
                    }
                }
            }
        } else {
            this.render.validPath = null;
        }
    }

    showVictory(team, reason) {
        document.getElementById('ui-layer').classList.remove('hidden');

        const modal = document.getElementById('victory-modal');
        modal.classList.remove('hidden');

        const title = document.getElementById('victory-title');
        title.innerText = `${team} has won the game!`;
        title.style.color = team === 'BLUE' ? '#60a5fa' : '#f87171';

        document.getElementById('victory-reason').innerText = reason;

        document.getElementById('btn-play-again').onclick = () => location.reload();

        const btnExitGame = document.getElementById('btn-exit-game');
        if (btnExitGame) btnExitGame.onclick = () => location.reload();

        const btnRestart = document.getElementById('btn-victory-restart');
        if (this.game.gameMode === 'ONLINE' && this.network && !this.network.isHost) {
            if (btnRestart) btnRestart.style.display = 'none';
        } else {
            if (btnRestart) {
                btnRestart.style.display = 'block';
                btnRestart.onclick = () => {
                    if (window.restartCurrentGame) {
                        window.restartCurrentGame(this.game.config);
                    }
                };
            }
        }

        document.getElementById('btn-review-game').onclick = () => {
            modal.classList.add('hidden');
            this.timeMachineOpen = true;
            this.updateHUD();
        };
    }

    toggleAIHeatmap(team) {
        if (this.render && typeof this.render.clearMoveAnimations === 'function') {
            this.render.clearMoveAnimations();
        }
        if (this.showAIHeatmap && this.aiHeatmapTeam === team) {
            // Turn off
            this.showAIHeatmap = false;
            this.aiHeatmapTeam = null;
            // Restore to live snapshot if we were reviewing past turns
            if (this.game.historyIndex !== this.game.history.length - 1) {
                this.game.loadSnapshot(this.game.history.length - 1);
                this.resetActiveState();
                this.game.logSystem("Returned to LIVE state.");
            }
        } else {
            // Turn on (or switch team)
            this.showAIHeatmap = true;
            this.aiHeatmapTeam = team;
            this.updateAIHeatmapForCurrentSnapshot();
        }
        this.updateAIHeatmapUI();
        if (this.render) this.render.draw();
    }

    updateAIHeatmapForCurrentSnapshot() {
        if (!this.showAIHeatmap || !this.game.aiBot) return;
        const team = this.aiHeatmapTeam || 'RED';
        this.game.aiHeatmapCache = this.game.aiBot.generateHeatmap(this.game.aiBot.cloneState(), team);
    }

    getAISnapshotIndices(team) {
        const indices = [];
        for (let i = 0; i < this.game.history.length; i++) {
            const snap = this.game.history[i];
            if (snap.activeTeam === team) {
                indices.push(i);
            }
        }
        return indices;
    }

    stepAITurn(team, direction) {
        const aiIndices = this.getAISnapshotIndices(team);
        if (aiIndices.length === 0) return;

        const currentIdx = this.game.historyIndex;
        let targetIdx = -1;

        if (direction < 0) {
            // Step backwards to previous AI turn
            for (let i = aiIndices.length - 1; i >= 0; i--) {
                if (aiIndices[i] < currentIdx) {
                    targetIdx = aiIndices[i];
                    break;
                }
            }
        } else {
            // Step forward to next AI turn
            for (let i = 0; i < aiIndices.length; i++) {
                if (aiIndices[i] > currentIdx) {
                    targetIdx = aiIndices[i];
                    break;
                }
            }
            // Allow stepping up to live state if no further AI turn snapshot
            if (targetIdx === -1 && currentIdx < this.game.history.length - 1) {
                targetIdx = this.game.history.length - 1;
            }
        }

        if (targetIdx !== -1 && targetIdx !== currentIdx) {
            this.game.loadSnapshot(targetIdx);
            this.updateHUD();
            this.resetActiveState();
            this.updateAIHeatmapForCurrentSnapshot();
            this.updateAIHeatmapUI();
            if (this.render) this.render.draw();
        }
    }

    updateAIHeatmapUI() {
        ['BLUE', 'RED'].forEach(team => {
            const lower = team.toLowerCase();
            const btnTree = document.getElementById(`btn-${lower}-action-tree`);
            const btnPrev = document.getElementById(`btn-${lower}-ai-prev`);
            const btnNext = document.getElementById(`btn-${lower}-ai-next`);
            const label = document.getElementById(`${lower}-ai-turn-label`);

            const isActive = this.showAIHeatmap && this.aiHeatmapTeam === team;
            if (btnTree) {
                if (isActive) {
                    btnTree.style.background = team === 'BLUE' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(239, 68, 68, 0.45)';
                    btnTree.style.borderColor = team === 'BLUE' ? '#3b82f6' : '#ef4444';
                    btnTree.style.boxShadow = team === 'BLUE' ? '0 0 16px rgba(59, 130, 246, 0.7)' : '0 0 16px rgba(239, 68, 68, 0.7)';
                } else {
                    btnTree.style.background = team === 'BLUE' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                    btnTree.style.borderColor = team === 'BLUE' ? '#60a5fa' : '#f87171';
                    btnTree.style.boxShadow = 'none';
                }
            }

            if (isActive) {
                if (btnPrev) btnPrev.style.display = 'flex';
                if (btnNext) btnNext.style.display = 'flex';
                if (label) label.style.display = 'block';

                const aiIndices = this.getAISnapshotIndices(team);
                const currentIdx = this.game.historyIndex;
                const isLive = (currentIdx === this.game.history.length - 1);

                // Find which AI turn index this is
                let turnNum = -1;
                for (let i = 0; i < aiIndices.length; i++) {
                    if (aiIndices[i] === currentIdx) {
                        turnNum = i + 1;
                        break;
                    }
                }

                if (label) {
                    if (turnNum !== -1) {
                        label.innerText = `Turn ${turnNum}${isLive ? ' (Live)' : ''}`;
                    } else if (isLive) {
                        label.innerText = 'Live State';
                    } else {
                        label.innerText = 'Turn Review';
                    }
                }

                const hasPrev = aiIndices.some(idx => idx < currentIdx);
                const hasNext = aiIndices.some(idx => idx > currentIdx) || (currentIdx < this.game.history.length - 1);

                if (btnPrev) {
                    btnPrev.style.opacity = hasPrev ? '1' : '0.35';
                    btnPrev.style.pointerEvents = hasPrev ? 'auto' : 'none';
                }
                if (btnNext) {
                    btnNext.style.opacity = hasNext ? '1' : '0.35';
                    btnNext.style.pointerEvents = hasNext ? 'auto' : 'none';
                }
            } else {
                if (btnPrev) btnPrev.style.display = 'none';
                if (btnNext) btnNext.style.display = 'none';
                if (label) label.style.display = 'none';
            }

            // Teach AI Debug Button visibility
            const btnTeach = document.getElementById(`btn-${lower}-teach-ai`);
            const boxThinking = document.getElementById(`${lower}-ai-thinking-box`);
            const isThinking = boxThinking && boxThinking.style.display !== 'none';
            if (btnTeach) {
                if (isActive && !isThinking) {
                    btnTeach.style.display = 'flex';
                } else {
                    btnTeach.style.display = 'none';
                    if (!this.showAIHeatmap && this.teachAIPanelOpen) {
                        this.toggleTeachAIPanel(team);
                    }
                }
            }
        });
    }

    showAIThinking(team, visible) {
        const prefix = team.toLowerCase();
        const box = document.getElementById(`${prefix}-ai-thinking-box`);
        const btnTeach = document.getElementById(`btn-${prefix}-teach-ai`);
        if (box) {
            box.style.display = visible ? 'flex' : 'none';
        }
        if (btnTeach && visible) {
            btnTeach.style.display = 'none';
        }
        if (!visible) {
            this.updateAIThinkingProgress(team, 0);
            this.updateAIHeatmapUI();
        }
    }

    updateAIThinkingProgress(team, percent) {
        const prefix = team.toLowerCase();
        const bar = document.getElementById(`${prefix}-ai-progress-bar`);
        const txt = document.getElementById(`${prefix}-ai-progress-text`);
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (bar) {
            bar.style.width = `${clamped}%`;
        }
        if (txt) {
            txt.textContent = `${clamped}%`;
        }
    }

    initTeachAI() {
        this.teachAIPanel = document.getElementById('teach-ai-panel');
        this.teachAITextarea = document.getElementById('teach-ai-feedback-text');
        this.teachAIPanelOpen = false;
        this.awaitingTileMention = false;
        this.currentTeachReport = '';

        // Wire debug buttons
        const btnTeachRed = document.getElementById('btn-red-teach-ai');
        if (btnTeachRed) {
            btnTeachRed.addEventListener('click', () => this.toggleTeachAIPanel('RED'));
        }
        const btnTeachBlue = document.getElementById('btn-blue-teach-ai');
        if (btnTeachBlue) {
            btnTeachBlue.addEventListener('click', () => this.toggleTeachAIPanel('BLUE'));
        }

        // Close button
        const btnClose = document.getElementById('btn-close-teach-ai');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.toggleTeachAIPanel(this.aiHeatmapTeam || 'RED'));
        }

        // Textarea input detection for '@'
        if (this.teachAITextarea) {
            this.teachAITextarea.addEventListener('input', (e) => {
                const val = this.teachAITextarea.value;
                const pos = this.teachAITextarea.selectionStart;
                if (pos > 0 && val[pos - 1] === '@') {
                    this.setAwaitingTileMention(true);
                } else if (!val.includes('@')) {
                    this.setAwaitingTileMention(false);
                }
            });
        }

        // Pick Tile Button
        const btnPick = document.getElementById('btn-teach-ai-pick-tile');
        if (btnPick) {
            btnPick.addEventListener('click', () => {
                if (!this.teachAITextarea) return;
                const val = this.teachAITextarea.value;
                const pos = this.teachAITextarea.selectionStart !== undefined ? this.teachAITextarea.selectionStart : val.length;
                if (pos === 0 || val[pos - 1] !== '@') {
                    this.teachAITextarea.value = val.slice(0, pos) + '@' + val.slice(pos);
                    this.teachAITextarea.setSelectionRange(pos + 1, pos + 1);
                }
                this.setAwaitingTileMention(true);
            });
        }

        // Clear Button
        const btnClear = document.getElementById('btn-teach-ai-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (this.teachAITextarea) this.teachAITextarea.value = '';
                this.setAwaitingTileMention(false);
            });
        }

        // Submit Report Button
        const btnSubmit = document.getElementById('btn-teach-ai-submit');
        if (btnSubmit) {
            btnSubmit.addEventListener('click', () => this.submitTeachAIReport());
        }

        // Edit Feedback Button
        const btnEdit = document.getElementById('btn-teach-ai-edit');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => {
                document.getElementById('teach-ai-input-view')?.classList.remove('hidden');
                document.getElementById('teach-ai-report-view')?.classList.add('hidden');
                if (this.teachAITextarea) this.teachAITextarea.focus();
            });
        }

        // Copy Report Button
        const btnCopy = document.getElementById('btn-teach-ai-copy');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => this.copyTeachAIReport());
        }
    }

    toggleTeachAIPanel(team) {
        const panel = document.getElementById('teach-ai-panel');
        if (!panel) return;
        this.teachAIPanelOpen = !this.teachAIPanelOpen;
        if (this.teachAIPanelOpen) {
            const frameId = team === 'BLUE' ? 'left-frame' : 'right-frame';
            const frame = document.getElementById(frameId);
            if (frame && panel.parentElement !== frame) {
                frame.appendChild(panel);
            }
            panel.classList.remove('hidden');
            document.getElementById('teach-ai-input-view')?.classList.remove('hidden');
            document.getElementById('teach-ai-report-view')?.classList.add('hidden');
            this.setAwaitingTileMention(false);
            if (this.teachAITextarea) this.teachAITextarea.focus();
        } else {
            panel.classList.add('hidden');
            this.setAwaitingTileMention(false);
        }
    }

    setAwaitingTileMention(active) {
        this.awaitingTileMention = active;
        const hint = document.getElementById('teach-ai-tile-hint');
        const activeBadge = document.getElementById('teach-ai-tile-active');
        if (hint && activeBadge) {
            if (active) {
                hint.classList.add('hidden');
                activeBadge.classList.remove('hidden');
            } else {
                hint.classList.remove('hidden');
                activeBadge.classList.add('hidden');
            }
        }
    }

    isAwaitingTileMention() {
        if (this.awaitingTileMention) return true;
        if (!this.teachAITextarea) return false;
        const val = this.teachAITextarea.value;
        const selStart = this.teachAITextarea.selectionStart !== undefined ? this.teachAITextarea.selectionStart : val.length;
        if (selStart > 0 && val[selStart - 1] === '@') return true;
        return false;
    }

    insertTileMention(col, row) {
        if (!this.teachAITextarea) return;
        let scoreTxt = '0';
        let isBarricade = false;
        const tile = this.game.getTile(col, row);
        if (tile && tile.isBarricade) isBarricade = true;

        if (this.game.aiHeatmapCache) {
            const ev = this.game.aiHeatmapCache.find(e => e.col === col && e.row === row);
            if (ev) {
                if (ev.isBarricade || ev.val === null) {
                    isBarricade = true;
                } else {
                    const rounded = Math.round(ev.val);
                    scoreTxt = (rounded > 0 ? '+' : '') + rounded.toLocaleString();
                }
            }
        }
        const mention = isBarricade
            ? `@Tile(${col}, ${row}) [Barricade] `
            : `@Tile(${col}, ${row}) [Score: ${scoreTxt}] `;
        const textarea = this.teachAITextarea;
        const val = textarea.value;
        const selStart = textarea.selectionStart !== undefined ? textarea.selectionStart : val.length;
        const atIdx = val.lastIndexOf('@', selStart > 0 ? selStart - 1 : 0);

        if (atIdx !== -1 && (selStart - atIdx) <= 5) {
            textarea.value = val.slice(0, atIdx) + mention + val.slice(selStart);
            const nextPos = atIdx + mention.length;
            textarea.setSelectionRange(nextPos, nextPos);
        } else {
            textarea.value = val.slice(0, selStart) + mention + val.slice(selStart);
            const nextPos = selStart + mention.length;
            textarea.setSelectionRange(nextPos, nextPos);
        }

        this.setAwaitingTileMention(false);
        textarea.focus();
    }

    formatBoardStateText(snap, label) {
        if (!snap) return `#### ${label}\n*No snapshot data available.*`;
        const cols = this.game.cols;
        const rows = this.game.rows;
        let lines = [];
        lines.push(`#### ${label}`);
        lines.push(`- **Active Turn**: ${snap.activeTeam || 'N/A'}`);
        lines.push(`- **Credits**: Blue = ${snap.credits?.BLUE ?? 0}, Red = ${snap.credits?.RED ?? 0}`);
        if (snap.lastMove) {
            const lm = snap.lastMove;
            const u = lm.unit || {};
            lines.push(`- **Last Move**: (${lm.sC}, ${lm.sR}) -> (${lm.eC}, ${lm.eR}) [Unit: ${u.team || 'N/A'} ${u.type || 'combat'}, Str ${u.strength ?? '?'}, Spd ${u.speed ?? '?'}]`);
        }

        const units = [];
        const barricades = [];
        for (let [k, tile] of snap.board.entries()) {
            const [c, r] = k.split(',').map(Number);
            if (tile.unit) {
                const u = tile.unit;
                units.push(`  - [${u.team}] ${u.isFlag ? 'FLAG' : (u.type || 'combat').toUpperCase()} (Str: ${u.strength}, Spd: ${u.speed}) at (${c}, ${r})`);
            }
            if (tile.isBarricade) {
                barricades.push(`(${c}, ${r})`);
            }
        }

        lines.push(`- **Units on Board** (${units.length}):`);
        if (units.length > 0) lines.push(units.join('\n'));
        else lines.push('  - None');

        lines.push(`- **Barricades** (${barricades.length}): ${barricades.length > 0 ? barricades.join(', ') : 'None'}`);

        lines.push(`\n**Grid Representation (${cols}x${rows}):**`);
        lines.push('```text');
        let colHdr = '     ';
        for (let c = 0; c < cols; c++) {
            colHdr += (c < 10 ? ' ' + c : c) + ' ';
        }
        lines.push(colHdr);

        for (let r = 0; r < rows; r++) {
            let rowStr = (r < 10 ? ' ' + r : r) + ':  ';
            for (let c = 0; c < cols; c++) {
                const tile = snap.board.get(`${c},${r}`);
                if (!tile) {
                    rowStr += ' . ';
                } else if (tile.isBarricade) {
                    rowStr += '###';
                } else if (tile.unit) {
                    const u = tile.unit;
                    const t = u.team === 'BLUE' ? 'B' : 'R';
                    if (u.isFlag) rowStr += `${t}F `;
                    else if (u.strength !== undefined) rowStr += `${t}${u.strength} `;
                    else rowStr += `${t}* `;
                } else {
                    rowStr += ' . ';
                }
            }
            lines.push(rowStr);
        }
        lines.push('```');
        return lines.join('\n');
    }

    generateTeachAIReport() {
        const feedback = (this.teachAITextarea?.value || '').trim();
        const currentIdx = this.game.historyIndex;
        const totalSnaps = this.game.history.length;

        let prevSnap = null;
        let postSnap = null;

        if (currentIdx < totalSnaps - 1) {
            postSnap = this.game.history[currentIdx];
            prevSnap = currentIdx > 0 ? this.game.history[currentIdx - 1] : postSnap;
        } else {
            postSnap = this.game.history[totalSnaps - 1];
            prevSnap = totalSnaps >= 2 ? this.game.history[totalSnaps - 2] : postSnap;
        }

        const botTeam = this.aiHeatmapTeam || (this.game.aiBot ? (this.game.aiBot.team || 'RED') : 'RED');

        let report = [];
        report.push('# Teach AI: Bot Feedback Report\n');
        report.push('## 1. User Feedback');
        report.push(feedback.length > 0 ? feedback : '*No text feedback entered.*');
        report.push('\n---\n');
        report.push('## 2. Previous Board State (Before Bot Move)');
        report.push(this.formatBoardStateText(prevSnap, 'Board Before Bot Move'));
        report.push('\n---\n');
        report.push('## 3. Current Board State (After Bot Move)');
        report.push(this.formatBoardStateText(postSnap, 'Board After Bot Move'));
        report.push('\n---\n');
        report.push('## 4. Metadata');
        report.push(`- **Bot Team**: ${botTeam}`);
        report.push(`- **Game Mode**: ${this.game.config?.mode || 'STANDARD'} (${this.game.config?.type || 'INVADE'})`);
        report.push(`- **Grid Size**: ${this.game.cols} cols x ${this.game.rows} rows`);
        report.push(`- **History Snapshot**: ${currentIdx + 1} of ${totalSnaps}`);

        return report.join('\n');
    }

    submitTeachAIReport() {
        this.currentTeachReport = this.generateTeachAIReport();
        const pre = document.getElementById('teach-ai-report-pre');
        if (pre) pre.textContent = this.currentTeachReport;

        document.getElementById('teach-ai-input-view')?.classList.add('hidden');
        document.getElementById('teach-ai-report-view')?.classList.remove('hidden');
    }

    copyTeachAIReport() {
        if (!this.currentTeachReport) return;
        const btn = document.getElementById('btn-teach-ai-copy');
        const txt = document.getElementById('teach-ai-copy-text');

        const onSuccess = () => {
            if (btn && txt) {
                btn.classList.add('copied');
                txt.textContent = 'Copied to Clipboard!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    txt.textContent = 'Copy Report';
                }, 2000);
            }
        };

        const nav = (typeof window !== 'undefined' && window.navigator) ? window.navigator : (typeof navigator !== 'undefined' ? navigator : null);
        if (nav && nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(this.currentTeachReport).then(onSuccess).catch(err => {
                this.fallbackCopyText(this.currentTeachReport, onSuccess);
            });
        } else {
            this.fallbackCopyText(this.currentTeachReport, onSuccess);
        }
    }

    fallbackCopyText(text, cb) {
        const pre = document.getElementById('teach-ai-report-pre');
        if (pre) {
            const range = document.createRange();
            range.selectNodeContents(pre);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        try {
            document.execCommand('copy');
            if (cb) cb();
        } catch (e) {
            console.warn('execCommand copy failed:', e);
        }
    }
}
