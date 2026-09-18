// js/main.js
import { HexGame } from './game.js';
import { RenderEngine } from './render.js';
import { InputController } from './input.js';
import { UIManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {

    const uiLayer = document.getElementById('ui-layer');
    const configModal = document.getElementById('config-modal');
    const mainMenu = document.getElementById('main-menu');
    const onlineModal = document.getElementById('online-modal');

    let GLOBAL_NETWORK = null;
    let GLOBAL_AI = null;
    let GLOBAL_MODE = 'LOCAL';

    // 1. Check for immediate Guest Invite overrides
    const urlParams = new URLSearchParams(window.location.search);
    const guestHostId = urlParams.get('host');

    if (guestHostId) {
        mainMenu.classList.add('hidden');
        configModal.classList.add('hidden');

        // Show connecting overlay instead of immediate game
        onlineModal.classList.remove('hidden');
        const mContent = document.querySelector('#online-modal .menu-content');
        if (mContent) mContent.innerHTML = '<h2>Connecting...</h2><p>Waiting for Host Rules...</p>';

        GLOBAL_MODE = 'ONLINE';
        GLOBAL_NETWORK = new NetworkManager(guestHostId);

        // Wait for config from network instead of launching immediately
        window.onReceiveNetworkConfig = (remoteConfig) => {
            onlineModal.classList.add('hidden');
            uiLayer.classList.remove('hidden');
            launchGame(remoteConfig);
            if (GLOBAL_NETWORK) {
                GLOBAL_NETWORK.bindEngines(GLOBAL_GAME, GLOBAL_UI);
                if (GLOBAL_NETWORK.ui) GLOBAL_NETWORK.ui.updateHUD();
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
    function launchGame(overrideConfig = null) {
        let config;

        if (overrideConfig) {
            config = overrideConfig;
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

            config = {
                type: document.querySelector('input[name="cfg-type"]:checked') ? document.querySelector('input[name="cfg-type"]:checked').value : 'INVADE',
                mode: document.querySelector('input[name="cfg-mode"]:checked') ? document.querySelector('input[name="cfg-mode"]:checked').value : 'STANDARD',
                powerMode: document.querySelector('input[name="cfg-powerMode"]:checked') ? document.querySelector('input[name="cfg-powerMode"]:checked').value : 'DEPLETING',
                width: boardW,
                height: boardH,
                credits: parseInt(document.getElementById('cfg-credits').value) || 50,
                flagCost: parseInt(document.getElementById('cfg-flagCost').value) || 10,
                barricadeCost: parseInt(document.getElementById('cfg-barricadeCost').value) || 5,
                maxStrength: parseInt(document.getElementById('cfg-maxStrength').value) || 10,
                maxSpeed: parseInt(document.getElementById('cfg-maxSpeed').value) || 5
            };
        }
        configModal.classList.add('hidden');
        uiLayer.classList.remove('hidden');

        // Max ranges are now handled dynamically by the buildDeployMatrix method in ui.js

        // Initialize systems
        const canvas = document.getElementById('gameCanvas');

        const game = new HexGame(config);
        const render = new RenderEngine(canvas, game);
        const input = new InputController(canvas, game, render);
        const ui = new UIManager(game, render, input);

        game.ui = ui; // Bind explicitly for animation dispatches

        // Attach special engine classes globally so game.js can easily broadcast
        game.gameMode = GLOBAL_MODE;
        if (GLOBAL_NETWORK) {
            GLOBAL_NETWORK.bindEngines(game, ui);
            ui.network = GLOBAL_NETWORK;
            game.network = GLOBAL_NETWORK;
        }

        if (GLOBAL_MODE === 'AI') {
            GLOBAL_AI = new AIBot(game);
        }

        // On game state changes, trigger AI if necessary
        game.onStateChange = () => {
            ui.updateHUD();
            if (GLOBAL_MODE === 'AI' && GLOBAL_AI && game.activeTeam === 'RED') {
                GLOBAL_AI.executeTurn();
            }
        };

        // Sync initial HUD state
        ui.updateHUD();
        game.logSystem(`Game Started! Initialized ${config.width}x${config.height} Grid.`);

        window.gameAPI = { game, render, input, ui, network: GLOBAL_NETWORK, ai: GLOBAL_AI };
    }
});
