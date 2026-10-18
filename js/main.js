import { HexGame } from './game.js';
import { RenderEngine } from './render.js';
import { InputController } from './input.js';
import { UIManager } from './ui.js';
import { NetworkManager } from './network.js';
import { AIBotV3 } from './ai-v3.js'; // New Influence Map AI

document.addEventListener('DOMContentLoaded', () => {

    const uiLayer = document.getElementById('ui-layer');
    const configModal = document.getElementById('config-modal');
    const mainMenu = document.getElementById('main-menu');
    const onlineModal = document.getElementById('online-modal');

    let GLOBAL_NETWORK = null;
    let GLOBAL_AI = null;
    let GLOBAL_MODE = 'LOCAL';

    window.exitToMenu = () => {
        try {
            sessionStorage.removeItem('TPOW_ACTIVE_SESSION');
        } catch (e) {}
        if (GLOBAL_NETWORK) {
            GLOBAL_NETWORK.leaveGame();
            GLOBAL_NETWORK = null;
        }
        window.location.href = window.location.origin + window.location.pathname;
    };

    window.requestGameRestart = (cfg = null) => {
        const targetCfg = cfg || (window.gameAPI && window.gameAPI.game ? window.gameAPI.game.config : null);
        if (GLOBAL_MODE === 'ONLINE' && GLOBAL_NETWORK && GLOBAL_NETWORK.connected) {
            GLOBAL_NETWORK.triggerNetworkRestart(targetCfg);
        } else {
            launchGame(targetCfg);
        }
    };

    // Check for active session in sessionStorage (for browser refresh persistence)
    let savedSession = null;
    try {
        const raw = sessionStorage.getItem('TPOW_ACTIVE_SESSION');
        if (raw) {
            savedSession = JSON.parse(raw);
        }
    } catch (e) {
        savedSession = null;
    }

    // 1. Check for immediate Guest Invite overrides
    const urlParams = new URLSearchParams(window.location.search);
    const guestHostId = urlParams.get('host');

    // If URL has a DIFFERENT hostId than our saved session, treat as a brand new invite link
    if (guestHostId && savedSession && (!savedSession.networkInfo || savedSession.networkInfo.hostId !== guestHostId)) {
        try {
            sessionStorage.removeItem('TPOW_ACTIVE_SESSION');
        } catch (e) {}
        savedSession = null;
    }

    if (savedSession && savedSession.config) {
        // Restore active game after browser refresh!
        mainMenu.classList.add('hidden');
        configModal.classList.add('hidden');
        onlineModal.classList.add('hidden');
        uiLayer.classList.remove('hidden');

        GLOBAL_MODE = savedSession.gameMode || 'LOCAL';

        if (GLOBAL_MODE === 'ONLINE' && savedSession.networkInfo) {
            const netInfo = savedSession.networkInfo;
            window.onReceiveNetworkConfig = (remoteConfig, remoteHistory) => {
                document.getElementById('victory-modal').classList.add('hidden');
                onlineModal.classList.add('hidden');
                uiLayer.classList.remove('hidden');
                launchGame(remoteConfig, true);
                if (Array.isArray(remoteHistory) && remoteHistory.length > 0 && window.gameAPI && window.gameAPI.game) {
                    window.gameAPI.game.applyRemoteHistory(remoteHistory);
                }
            };

            if (netInfo.isHost) {
                GLOBAL_NETWORK = new NetworkManager(netInfo.hostId, netInfo.guestName || 'Guest', {
                    isHost: true,
                    isReconnect: true,
                    deferConnect: true
                });
                launchGame(savedSession.config, true, savedSession);
                if (netInfo.hostId) {
                    GLOBAL_NETWORK.hostGame(netInfo.hostId, true);
                    if (window.gameAPI && window.gameAPI.game) {
                        window.gameAPI.game.logSystem("Session restored after refresh. Reconnecting channel...");
                    }
                } else {
                    onlineModal.classList.remove('hidden');
                    GLOBAL_NETWORK.hostGame();
                }
            } else {
                const guestName = netInfo.guestName || savedSession.redName || 'Guest';
                GLOBAL_NETWORK = new NetworkManager(netInfo.hostId, guestName, {
                    isHost: false,
                    isReconnect: true,
                    deferConnect: true
                });
                launchGame(savedSession.config, true, savedSession);
                if (netInfo.hostId) {
                    GLOBAL_NETWORK.joinGame(netInfo.hostId, true);
                    if (window.gameAPI && window.gameAPI.game) {
                        window.gameAPI.game.logSystem("Session restored after refresh. Reconnecting to Host...");
                    }
                }
            }
        } else {
            launchGame(savedSession.config, true, savedSession);
            if (window.gameAPI && window.gameAPI.game) {
                window.gameAPI.game.logSystem("Game restored after page refresh.");
            }
        }
    } else if (guestHostId) {
        mainMenu.classList.add('hidden');
        configModal.classList.add('hidden');

        // Show connecting overlay instead of immediate game
        onlineModal.classList.remove('hidden');
        const mContent = document.querySelector('#online-modal .menu-content');
        if (mContent) mContent.innerHTML = '<h2>Connecting...</h2><p>Waiting for Host Rules...</p>';

        GLOBAL_MODE = 'ONLINE';
        const myName = document.getElementById('player-name').value || 'Guest';
        GLOBAL_NETWORK = new NetworkManager(guestHostId, myName);

        // Wait for config from network instead of launching immediately
        window.onReceiveNetworkConfig = (remoteConfig, remoteHistory) => {
            document.getElementById('victory-modal').classList.add('hidden');
            onlineModal.classList.add('hidden');
            uiLayer.classList.remove('hidden');
            if (myName && myName !== 'Guest') {
                remoteConfig.redName = myName;
            }
            launchGame(remoteConfig, true);
            if (Array.isArray(remoteHistory) && remoteHistory.length > 1 && window.gameAPI && window.gameAPI.game) {
                window.gameAPI.game.applyRemoteHistory(remoteHistory);
            }
        };
    } else {
        // default bootup, hide config for now
        configModal.classList.add('hidden');
    }

    // 2. Bind Main Menu Options
    document.getElementById('btn-mode-local').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        configModal.classList.remove('hidden');
        GLOBAL_MODE = 'LOCAL';
    });

    document.getElementById('btn-mode-ai').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        configModal.classList.remove('hidden');
        GLOBAL_MODE = 'AI';
    });

    document.getElementById('btn-mode-online').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        configModal.classList.remove('hidden');
        GLOBAL_MODE = 'ONLINE';
    });

    const lobbyModal = document.getElementById('lobby-modal');

    function fetchLobby() {
        const lobbyList = document.getElementById('lobby-list');
        lobbyList.innerHTML = '<p style="color: #ccc; text-align: center;">Loading games...</p>';
        fetch('/api/lobby')
            .then(res => res.json())
            .then(data => {
                lobbyList.innerHTML = '';
                if (data.length === 0) {
                    lobbyList.innerHTML = '<p style="color: #ccc; text-align: center; margin-top: 20px;">No online games found.</p>';
                    return;
                }
                data.forEach(game => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
                    div.innerHTML = `
                        <div>
                            <strong style="color: #60a5fa;">${game.name}'s Game</strong>
                            <div style="font-size: 0.8rem; color: #aaa;">Host ID: ${game.hostId.substring(0, 8)}...</div>
                        </div>
                        <button class="btn-primary" style="padding: 5px 15px; font-size: 0.9rem;">Join</button>
                    `;
                    div.querySelector('button').onclick = () => {
                        lobbyModal.classList.add('hidden');
                        document.getElementById('online-modal').classList.remove('hidden');
                        const mContent = document.querySelector('#online-modal .menu-content');
                        if (mContent) mContent.innerHTML = '<h2>Connecting...</h2><p>Waiting for Host Rules...</p>';

                        GLOBAL_MODE = 'ONLINE';
                        const myName = document.getElementById('player-name').value || 'Guest';
                        GLOBAL_NETWORK = new NetworkManager(game.hostId, myName);

                        window.onReceiveNetworkConfig = (remoteConfig, remoteHistory) => {
                            document.getElementById('victory-modal').classList.add('hidden');
                            document.getElementById('online-modal').classList.add('hidden');
                            uiLayer.classList.remove('hidden');
                            remoteConfig.redName = myName;
                            launchGame(remoteConfig, true);
                            if (Array.isArray(remoteHistory) && remoteHistory.length > 1 && window.gameAPI && window.gameAPI.game) {
                                window.gameAPI.game.applyRemoteHistory(remoteHistory);
                            }
                        };
                    };
                    lobbyList.appendChild(div);
                });
            })
            .catch(() => {
                lobbyList.innerHTML = '<p style="color: #ef4444; text-align: center;">Failed to load lobby list.</p>';
            });
    }

    document.getElementById('btn-mode-find').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        lobbyModal.classList.remove('hidden');
        fetchLobby();
    });

    document.getElementById('btn-lobby-refresh').addEventListener('click', fetchLobby);
    document.getElementById('btn-lobby-back').addEventListener('click', () => {
        lobbyModal.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    });

    // Map Radio configurations to Custom Input row visibility
    document.querySelectorAll('input[name="cfg-dims"]').forEach(r => {
        r.addEventListener('change', (e) => {
            const customRow = document.getElementById('custom-dims-row');
            if (e.target.value === 'CUSTOM') {
                customRow.style.display = 'flex';
            } else {
                customRow.style.display = 'none';
            }
        });
    });

    // 3. Bind the traditional Local Start (proceeding from Config screen)
    document.getElementById('btn-start-game').addEventListener('click', () => {
        configModal.classList.add('hidden');

        if (GLOBAL_MODE === 'ONLINE') {
            onlineModal.classList.remove('hidden');
            GLOBAL_NETWORK = new NetworkManager();
            GLOBAL_NETWORK.hostGame();
        } else {
            uiLayer.classList.remove('hidden');
        }

        launchGame();
    });

    window.restartCurrentGame = launchGame;
    function launchGame(overrideConfig = null, isRemoteOrRestored = false, restoredSession = null) {
        document.getElementById('victory-modal').classList.add('hidden');

        // Clean up previous game timer if restarting in place
        if (window.gameAPI && window.gameAPI.game && window.gameAPI.game.timerInterval) {
            clearInterval(window.gameAPI.game.timerInterval);
            window.gameAPI.game.timerInterval = null;
        }

        let config;
        if (overrideConfig) {
            config = { ...overrideConfig };
        } else {
            // Read configs (or use defaults if bypassed by Online guest)
            let boardW = 30;
            let boardH = 15;
            const dimsRadio = document.querySelector('input[name="cfg-dims"]:checked');
            if (dimsRadio) {
                if (dimsRadio.value === 'CUSTOM') {
                    boardW = parseInt(document.getElementById('cfg-width').value) || 40;
                    boardH = parseInt(document.getElementById('cfg-height').value) || 20;
                } else {
                    const s = dimsRadio.value.split(',');
                    boardW = parseInt(s[0]);
                    boardH = parseInt(s[1]);
                }
            }

            const remChk = document.getElementById('cfg-barricadeRemovable');
            const kzChk = document.getElementById('cfg-barricadeKillZone');
            const numMinesEl = document.getElementById('cfg-numMines');
            const mineCreditEl = document.getElementById('cfg-mineCredit');
            const parsedNumMines = (numMinesEl && numMinesEl.value !== '') ? parseInt(numMinesEl.value, 10) : 2;
            const parsedMineCredit = (mineCreditEl && mineCreditEl.value !== '') ? parseInt(mineCreditEl.value, 10) : 5;

            config = {
                type: document.querySelector('input[name="cfg-type"]:checked') ? document.querySelector('input[name="cfg-type"]:checked').value : 'INVADE',
                mode: document.querySelector('input[name="cfg-mode"]:checked') ? document.querySelector('input[name="cfg-mode"]:checked').value : 'STANDARD',
                powerMode: document.querySelector('input[name="cfg-powerMode"]:checked') ? document.querySelector('input[name="cfg-powerMode"]:checked').value : 'DEPLETING',
                width: boardW,
                height: boardH,
                credits: parseInt(document.getElementById('cfg-credits').value) || 100,
                numMines: isNaN(parsedNumMines) ? 2 : Math.max(0, parsedNumMines),
                mineCredit: isNaN(parsedMineCredit) ? 5 : Math.max(0, parsedMineCredit),
                flagCost: parseInt(document.getElementById('cfg-flagCost').value) || 10,
                barricadeCost: parseInt(document.getElementById('cfg-barricadeCost').value) || 10,
                barricadeRemovable: remChk ? remChk.checked : true,
                barricadeKillZone: kzChk ? kzChk.checked : true,
                maxStrength: parseInt(document.getElementById('cfg-maxStrength').value) || 10,
                maxSpeed: parseInt(document.getElementById('cfg-maxSpeed').value) || 5,
                timerDuration: parseInt(document.querySelector('input[name="cfg-timer"]:checked') ? document.querySelector('input[name="cfg-timer"]:checked').value : '0'),
                blueName: document.getElementById('player-name').value || 'Player 1',
                redName: GLOBAL_MODE === 'AI' ? 'Bot' : 'Player 2'
            };
        }
        configModal.classList.add('hidden');
        uiLayer.classList.remove('hidden');

        const canvas = document.getElementById('gameCanvas');
        const game = new HexGame(config);
        game.gameMode = GLOBAL_MODE;

        let render, input, ui;
        if (window.gameAPI && window.gameAPI.render && window.gameAPI.input && window.gameAPI.ui) {
            // Reuse existing Render, Input, and UI instances to avoid duplicate DOM listeners
            render = window.gameAPI.render;
            input = window.gameAPI.input;
            ui = window.gameAPI.ui;

            render.game = game;
            render.clearExplosions();
            if (typeof render.clearMoveAnimations === 'function') {
                render.clearMoveAnimations();
            }
            render.centerCamera();

            input.game = game;
            game.ui = ui;
            ui.bindGame(game);
        } else {
            render = new RenderEngine(canvas, game);
            input = new InputController(canvas, game, render);
            ui = new UIManager(game, render, input);
            game.ui = ui;
        }

        if (GLOBAL_NETWORK) {
            GLOBAL_NETWORK.bindEngines(game, ui);
            ui.network = GLOBAL_NETWORK;
            game.network = GLOBAL_NETWORK;

            if (GLOBAL_NETWORK.isHost && GLOBAL_NETWORK.connected && !isRemoteOrRestored) {
                GLOBAL_NETWORK.sendData({
                    type: 'RESTART_GAME',
                    config: config
                });
            }
        }

        if (GLOBAL_MODE === 'AI') {
            GLOBAL_AI = new AIBotV3(game);
            game.aiBot = GLOBAL_AI;
            game.localTeam = 'BLUE';
        }

        // On game state changes, reset active UI state, update HUD, and trigger AI if necessary
        game.onStateChange = () => {
            ui.currentAction = null;
            game.selectedTile = null;
            render.validPath = null;
            ui.closeContextMenu();
            ui.updateHUD();
            if (GLOBAL_MODE === 'AI' && GLOBAL_AI && game.activeTeam === 'RED' && !game.winner) {
                game.logSystem('Computer is thinking...');
                setTimeout(() => {
                    if (game.activeTeam === 'RED' && !game.winner) {
                        GLOBAL_AI.executeTurn();
                    }
                }, 600);
            }
        };

        if (restoredSession) {
            game.restoreFromSession(restoredSession);
        } else {
            game.logSystem(`Game Started! Grid: ${config.width}x${config.height} | Mode: ${config.mode}`);
        }

        game.enablePersistence = true;
        game.saveSessionToStorage();

        // Sync HUD state
        ui.refreshLog();
        ui.updateHUD();

        window.gameAPI = { game, render, input, ui, network: GLOBAL_NETWORK, ai: GLOBAL_AI };

        // Start timer unless we are an un-connected Host waiting for a Guest
        const isWaitingHost = GLOBAL_MODE === 'ONLINE' && (!GLOBAL_NETWORK || !GLOBAL_NETWORK.connected);
        if (!isWaitingHost && game.timerDuration > 0 && !game.winner) {
            game.startTimer();
        }
    }
});

