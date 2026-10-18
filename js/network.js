// js/network.js
export class NetworkManager {
    constructor(hostId = null, guestName = 'Guest', options = {}) {
        this.peer = null;
        this.conn = null;
        this.isHost = options.isHost !== undefined ? options.isHost : !hostId;
        this.hostId = hostId || null;
        this.isReconnect = !!options.isReconnect;
        this.connected = false;
        this.guestName = guestName;
        this.intentionalDisconnect = false;
        this.hasCompletedInitialHandshake = !!options.isReconnect;

        // These will be bound after game setup
        this.ui = null;
        this.game = null;

        // Fault-tolerant turn handoff & reconnect state
        this.pendingTurn = null;
        this.retryInterval = null;
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;
        this.hostIdRetryCount = 0;

        if (!this.isHost && this.hostId && !options.deferConnect) {
            this.joinGame(this.hostId, this.isReconnect);
        }

        this.bindPopupListeners();
        this.bindBeforeUnload();
    }

    bindBeforeUnload() {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('beforeunload', () => {
                if (!this.intentionalDisconnect && this.game && typeof this.game.saveSessionToStorage === 'function') {
                    this.game.saveSessionToStorage();
                }
                if (this.peer && !this.peer.destroyed) {
                    try { this.peer.destroy(); } catch (e) {}
                }
            });
        }
    }

    bindPopupListeners() {
        const copyBtn = document.getElementById('btn-copy-link');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const el = document.getElementById('host-link-input');
                el.select();
                document.execCommand('copy');
                copyBtn.innerText = "Copied!";
                setTimeout(() => { copyBtn.innerText = "Copy"; }, 2000);
            };
        }
    }

    bindEngines(game, ui) {
        this.game = game;
        this.ui = ui;
        this.pendingTurn = null;
        if (!this.game) return;

        this.game.localTeam = this.isHost ? 'BLUE' : 'RED';
        if (this.isHost) {
            if (!this.connected && !this.isReconnect) {
                this.game.logSystem("Waiting for Opponent to connect to the Host Link...");
            }
        } else {
            if (!this.isReconnect) {
                this.game.logSystem(`Connected as Guest. You are RED.`);
            }
            const modal = document.getElementById('online-modal');
            if (modal) modal.classList.add('hidden');
        }

        if (this.connected) {
            this.startSyncLoops();
        }
    }

    startSyncLoops() {
        this.stopSyncLoops();

        // Persistent retry loop for unacknowledged turn handoffs
        this.retryInterval = setInterval(() => {
            if (!this.connected || !this.conn || !this.game) return;
            if (this.pendingTurn) {
                const now = Date.now();
                if (now - this.pendingTurn.lastSentAt >= 1000) {
                    this.pendingTurn.lastSentAt = now;
                    this.pendingTurn.retries++;
                    this.sendData(this.pendingTurn.payload);
                }
            }
        }, 400);

        // Continuous state heartbeat watchdog to prevent split-brain / turn limbo
        this.heartbeatInterval = setInterval(() => {
            if (!this.connected || !this.conn || !this.game) return;
            const liveTurnId = this.game.history.length - 1;
            this.sendData({
                type: 'STATE_HEARTBEAT',
                turnId: liveTurnId,
                activeTeam: this.game.liveActiveTeam,
                winner: this.game.winner || null
            });
        }, 2000);
    }

    stopSyncLoops() {
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    getPeerConfig() {
        return {
            config: {
                'iceServers': [
                    { 'urls': 'stun:stun.l.google.com:19302' },
                    { 'urls': 'stun:stun1.l.google.com:19302' },
                    { 'urls': 'stun:stun2.l.google.com:19302' },
                    { 'urls': 'stun:stun3.l.google.com:19302' },
                    { 'urls': 'stun:stun4.l.google.com:19302' }
                ]
            }
        };
    }

    hostGame(preferredHostId = null, isReconnect = false) {
        if (preferredHostId) this.hostId = preferredHostId;
        if (isReconnect) {
            this.isReconnect = true;
            this.hasCompletedInitialHandshake = true;
        }

        const peerConfig = this.getPeerConfig();
        this.peer = this.hostId ? new Peer(this.hostId, peerConfig) : new Peer(peerConfig);

        this.peer.on('open', (id) => {
            this.hostId = id;
            this.hostIdRetryCount = 0;

            const link = `${window.location.origin}${window.location.pathname}?host=${id}`;
            const linkInput = document.getElementById('host-link-input');
            if (linkInput) linkInput.value = link;

            if (this.game && typeof this.game.saveSessionToStorage === 'function') {
                this.game.saveSessionToStorage();
            }

            if (!this.isReconnect && (!this.game || this.game.history.length <= 1)) {
                const nameEl = document.getElementById('player-name');
                const pName = (nameEl && nameEl.value) ? nameEl.value : (this.game ? this.game.blueName : 'Host');
                fetch('/api/lobby', {
                    method: 'POST',
                    body: JSON.stringify({ hostId: id, name: pName }),
                    headers: { 'Content-Type': 'application/json' }
                }).catch(console.error);
            }
        });

        this.peer.on('connection', (conn) => {
            if (this.conn && this.conn !== conn) {
                this.conn._superseded = true;
                try { this.conn.close(); } catch (e) {}
            }
            this.conn = conn;
            this.setupConnection();

            const modal = document.getElementById('online-modal');
            if (modal) modal.classList.add('hidden');
            if (this.game && !this.hasCompletedInitialHandshake) {
                this.game.logSystem("Opponent Connected! Initializing Channel...");
            }
            if (this.ui) this.ui.updateHUD();
        });

        this.peer.on('error', (err) => {
            console.error(err);
            if (err && err.type === 'unavailable-id' && this.hostId && this.hostIdRetryCount < 10) {
                this.hostIdRetryCount++;
                try { this.peer.destroy(); } catch (e) {}
                setTimeout(() => {
                    if (!this.intentionalDisconnect) {
                        this.hostGame(this.hostId, this.isReconnect);
                    }
                }, 1000);
                return;
            }
            if (this.game) this.game.logSystem("Network Error: " + err.message);
        });
    }

    joinGame(hostId, isReconnect = false) {
        if (hostId) this.hostId = hostId;
        if (isReconnect) {
            this.isReconnect = true;
            this.hasCompletedInitialHandshake = true;
        }

        if (this.peer && !this.peer.destroyed && this.peer.open) {
            if (this.conn) {
                this.conn._superseded = true;
                try { this.conn.close(); } catch (e) {}
            }
            this.conn = this.peer.connect(this.hostId, { reliable: true });
            this.setupConnection();
            return;
        }

        const peerConfig = this.getPeerConfig();
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = new Peer(peerConfig);
        this.peer.on('open', () => {
            this.conn = this.peer.connect(this.hostId, { reliable: true });
            this.setupConnection();
        });

        this.peer.on('error', (err) => {
            console.error(err);
            if (!this.intentionalDisconnect) {
                this.scheduleGuestReconnect();
            }
        });
    }

    scheduleGuestReconnect() {
        if (this.intentionalDisconnect || this.isHost || !this.hostId) return;
        if (this.reconnectTimeout) return;
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (!this.connected && !this.intentionalDisconnect) {
                this.joinGame(this.hostId, true);
            }
        }, 1500);
    }

    setupConnection() {
        const currentConn = this.conn;
        if (!currentConn) return;

        const handleOpen = () => {
            if (this.conn !== currentConn) return;
            this.connected = true;
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            this.startSyncLoops();

            // WebRTC data channels (especially on Firefox) can drop initial payloads if sent immediately
            setTimeout(() => {
                if (this.conn !== currentConn || !this.connected) return;

                if (this.hasCompletedInitialHandshake && this.game) {
                    this.sendData({
                        type: 'RECONNECT_HELLO',
                        turnId: this.game.history.length - 1,
                        snapshot: this.game.serializeSnapshot(),
                        history: this.game.serializeFullHistory(),
                        blueName: this.game.blueName,
                        redName: this.game.redName,
                        config: this.game.config
                    });
                    this.game.logSystem("Reconnected to opponent!");
                    if (this.game.timerDuration > 0 && !this.game.winner && !this.game.timerInterval) {
                        this.game.startTimer();
                    }
                    this.game.saveSessionToStorage();
                    if (this.ui) this.ui.updateHUD();
                    return;
                }

                this.hasCompletedInitialHandshake = true;
                if (this.isHost && this.game) {
                    // Host sends config to guest
                    this.sendData({
                        type: 'CONFIG',
                        config: this.game.config,
                        hostId: this.hostId,
                        turnId: this.game.history.length - 1,
                        history: this.game.serializeFullHistory()
                    });

                    // Remove game from open lobbies
                    if (this.peer && this.peer.id) {
                        fetch('/api/lobby', {
                            method: 'DELETE',
                            body: JSON.stringify({ hostId: this.peer.id }),
                            headers: { 'Content-Type': 'application/json' }
                        }).catch(console.error);
                    }

                    if (this.game.timerDuration > 0) {
                        this.game.startTimer();
                    }
                    this.game.logSystem("Game Start! You are BLUE.");
                    this.game.saveSessionToStorage();
                } else {
                    this.sendData({
                        type: 'GUEST_JOIN',
                        name: this.guestName
                    });
                }
                if (this.ui) this.ui.updateHUD();
            }, 400);
        };

        if (currentConn.open) {
            handleOpen();
        } else {
            currentConn.on('open', handleOpen);
        }

        currentConn.on('data', (data) => {
            if (this.conn !== currentConn) return;
            this.receiveData(data);
        });

        currentConn.on('close', () => {
            if (currentConn._superseded) return;
            this.connected = false;
            this.stopSyncLoops();
            if (this.intentionalDisconnect) return;

            if (this.game) {
                this.game.logSystem("Connection interrupted. Waiting for opponent to reconnect...");
            }
            if (!this.isHost) {
                this.scheduleGuestReconnect();
            }
        });
    }

    triggerNetworkRestart(overrideConfig = null) {
        const baseConfig = overrideConfig || (this.game ? this.game.config : null);
        if (!baseConfig) return;

        const restartConfig = {
            ...baseConfig,
            blueName: this.game ? this.game.blueName : (baseConfig.blueName || 'Player 1'),
            redName: this.game ? this.game.redName : (baseConfig.redName || 'Player 2')
        };

        this.pendingTurn = null;
        if (window.restartCurrentGame) {
            window.restartCurrentGame(restartConfig, true);
        }
        this.sendData({
            type: 'RESTART_GAME',
            config: restartConfig
        });
    }

    leaveGame() {
        this.intentionalDisconnect = true;
        this.pendingTurn = null;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.stopSyncLoops();
        if (this.connected && this.conn) {
            try {
                this.conn.send({ type: 'PEER_LEFT_GAME' });
                this.conn.close();
            } catch (e) {}
        }
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) {}
        }
    }

    sendData(payload) {
        if (this.connected && this.conn) {
            this.conn.send(payload);
        }
    }

    recordAndSendTurn(action) {
        if (!this.game) return;
        const turnId = this.game.history.length - 1;
        const snapshot = this.game.serializeSnapshot(turnId);
        const payload = {
            type: 'TURN_ACTION',
            turnId,
            senderTeam: this.game.localTeam,
            action,
            snapshot
        };
        this.pendingTurn = {
            turnId,
            payload,
            lastSentAt: Date.now(),
            retries: 0
        };
        this.sendData(payload);
    }

    sendTurnAck() {
        if (!this.game) return;
        this.sendData({
            type: 'TURN_ACK',
            turnId: this.game.history.length - 1,
            activeTeam: this.game.liveActiveTeam
        });
    }

    executeRemoteAction(action) {
        if (!this.game || !action) return false;
        if (action.type === 'DEPLOY') {
            return this.game.deployUnit(action.team, action.unitType, action.str, action.spd, action.col, action.row, true);
        } else if (action.type === 'MOVE') {
            return this.game.moveUnit(action.col, action.row, action.tC, action.tR, true);
        } else if (action.type === 'BARRICADE') {
            return this.game.createBarricade(action.col, action.row, action.offset, true);
        } else if (action.type === 'REMOVE_BARRICADE') {
            return this.game.removeBarricade(action.col, action.row, true);
        } else if (action.type === 'SKIP') {
            return this.game.endTurn(true);
        }
        return false;
    }

    receiveData(data) {
        if (!data || !data.type) return;

        if (data.type === 'PEER_LEFT_GAME') {
            this.intentionalDisconnect = true;
            this.stopSyncLoops();
            if (this.game) {
                this.game.logSystem("Opponent left the game.");
            }
            return;
        }

        if (data.type === 'RESTART_GAME') {
            this.pendingTurn = null;
            if (data.config && window.restartCurrentGame) {
                window.restartCurrentGame(data.config, true);
                if (this.game) {
                    this.game.logSystem("Game restarted!");
                }
                this.sendTurnAck();
            }
            return;
        }

        if (data.type === 'CONFIG') {
            if (data.hostId) this.hostId = data.hostId;
            if (!this.isHost) {
                if (this.game && this.isReconnect) {
                    // Guest already restored game from sessionStorage; sync any newer history
                    if (Array.isArray(data.history) && data.history.length > this.game.history.length) {
                        this.game.ensureLiveState();
                        this.game.applyRemoteHistory(data.history);
                    }
                    if (this.ui) this.ui.updateHUD();
                    this.sendTurnAck();
                } else if (window.onReceiveNetworkConfig) {
                    window.onReceiveNetworkConfig(data.config, data.history);
                }
            }
            return;
        }

        if (data.type === 'GUEST_JOIN' && this.isHost && this.game) {
            this.game.redName = data.name;
            if (this.game.config) this.game.config.redName = data.name;
            this.game.saveSessionToStorage();
            if (this.ui) this.ui.updateHUD();
            return;
        }

        if (data.type === 'RECONNECT_HELLO') {
            if (!this.game && !this.isHost && data.config && window.onReceiveNetworkConfig) {
                window.onReceiveNetworkConfig(data.config, data.history);
                return;
            }
            if (!this.game) return;

            if (data.blueName) {
                this.game.blueName = data.blueName;
                if (this.game.config) this.game.config.blueName = data.blueName;
            }
            if (data.redName && data.redName !== 'Player 2') {
                this.game.redName = data.redName;
                if (this.game.config) this.game.config.redName = data.redName;
            }

            const localTurnId = this.game.history.length - 1;
            if (typeof data.turnId === 'number') {
                if (data.turnId > localTurnId) {
                    this.game.ensureLiveState();
                    if (Array.isArray(data.history) && data.history.length > 0) {
                        this.game.applyRemoteHistory(data.history);
                    } else if (data.snapshot) {
                        this.game.applyRemoteSnapshot(data.snapshot);
                    }
                    this.sendTurnAck();
                } else if (data.turnId < localTurnId) {
                    this.sendData({
                        type: 'STATE_SYNC',
                        turnId: localTurnId,
                        snapshot: this.game.serializeSnapshot(localTurnId),
                        history: this.game.serializeFullHistory()
                    });
                } else {
                    if (data.snapshot && !this.game.doesLiveStateMatch(data.snapshot)) {
                        if (this.isHost) {
                            this.sendData({
                                type: 'STATE_SYNC',
                                turnId: localTurnId,
                                snapshot: this.game.serializeSnapshot(localTurnId),
                                history: this.game.serializeFullHistory()
                            });
                        } else {
                            this.game.ensureLiveState();
                            this.game.applyRemoteSnapshot(data.snapshot);
                        }
                    }
                    this.sendTurnAck();
                }
            }
            this.game.saveSessionToStorage();
            if (this.ui) this.ui.updateHUD();
            return;
        }

        if (!this.game) return;

        if (data.type === 'TURN_ACK') {
            if (this.pendingTurn && typeof data.turnId === 'number' && data.turnId >= this.pendingTurn.turnId) {
                this.pendingTurn = null;
            }
            const localTurnId = this.game.history.length - 1;
            if (data.turnId === localTurnId && data.activeTeam && data.activeTeam !== this.game.liveActiveTeam) {
                this.sendData({
                    type: 'STATE_SYNC',
                    turnId: localTurnId,
                    snapshot: this.game.serializeSnapshot(localTurnId),
                    history: this.game.serializeFullHistory()
                });
            }
            return;
        }

        if (data.type === 'TURN_ACTION') {
            const localTurnId = this.game.history.length - 1;

            // If we also had an older pendingTurn that is now superseded, clear it
            if (this.pendingTurn && data.turnId > this.pendingTurn.turnId) {
                this.pendingTurn = null;
            }

            if (data.turnId < localTurnId) {
                // Already processed an even newer turn; simply ACK current turn
                this.sendTurnAck();
                return;
            }

            if (data.turnId === localTurnId) {
                // Duplicate retry of the current turn; verify state matches and re-ACK
                if (data.snapshot && !this.game.doesLiveStateMatch(data.snapshot)) {
                    const wasInHistory = this.game.ensureLiveState();
                    if (wasInHistory) {
                        this.game.logSystem("Opponent completed their turn — returned to LIVE state.");
                    }
                    this.game.applyRemoteSnapshot(data.snapshot);
                    if (this.ui) this.ui.updateHUD();
                }
                this.sendTurnAck();
                return;
            }

            // data.turnId > localTurnId: This is a new turn from the opponent!
            const wasInHistory = this.game.ensureLiveState();
            if (wasInHistory) {
                this.game.logSystem("Opponent completed their turn — returned to LIVE state.");
            }

            if (data.turnId === localTurnId + 1 && data.action) {
                this.executeRemoteAction(data.action);
            }

            // Authoritative post-action verification & fallback sync
            if (data.snapshot && !this.game.doesLiveStateMatch(data.snapshot)) {
                this.game.applyRemoteSnapshot(data.snapshot);
            }

            if (this.ui) this.ui.updateHUD();
            this.sendTurnAck();
            return;
        }

        if (data.type === 'STATE_HEARTBEAT') {
            const localTurnId = this.game.history.length - 1;
            const localActive = this.game.liveActiveTeam;

            if (this.pendingTurn && data.turnId >= this.pendingTurn.turnId && data.activeTeam === localActive) {
                this.pendingTurn = null;
            }

            if (localTurnId > data.turnId) {
                // Remote peer missed a turn handoff; push the turn or state immediately
                if (this.pendingTurn && this.pendingTurn.turnId === localTurnId) {
                    this.sendData(this.pendingTurn.payload);
                } else {
                    this.sendData({
                        type: 'STATE_SYNC',
                        turnId: localTurnId,
                        snapshot: this.game.serializeSnapshot(localTurnId),
                        history: this.game.serializeFullHistory()
                    });
                }
            } else if (localTurnId < data.turnId) {
                // We missed a turn handoff; request immediate sync from remote peer
                this.sendData({
                    type: 'STATE_REQUEST',
                    currentTurnId: localTurnId
                });
            } else if (localTurnId === data.turnId && data.activeTeam && data.activeTeam !== localActive) {
                // Split-brain on the same turnId: Host acts as authoritative tie-breaker
                if (this.isHost) {
                    this.sendData({
                        type: 'STATE_SYNC',
                        turnId: localTurnId,
                        snapshot: this.game.serializeSnapshot(localTurnId),
                        history: this.game.serializeFullHistory()
                    });
                } else {
                    this.sendData({
                        type: 'STATE_REQUEST',
                        currentTurnId: localTurnId
                    });
                }
            }
            return;
        }

        if (data.type === 'STATE_REQUEST') {
            const localTurnId = this.game.history.length - 1;
            if (this.pendingTurn && this.pendingTurn.turnId === localTurnId) {
                this.sendData(this.pendingTurn.payload);
            } else {
                this.sendData({
                    type: 'STATE_SYNC',
                    turnId: localTurnId,
                    snapshot: this.game.serializeSnapshot(localTurnId),
                    history: this.game.serializeFullHistory()
                });
            }
            return;
        }

        if (data.type === 'STATE_SYNC') {
            if (Array.isArray(data.history) && data.history.length > this.game.history.length) {
                const wasInHistory = this.game.ensureLiveState();
                if (wasInHistory) {
                    this.game.logSystem("Opponent completed their turn — returned to LIVE state.");
                }
                this.game.applyRemoteHistory(data.history);
                if (this.ui) this.ui.updateHUD();
                this.sendTurnAck();
                return;
            }
            if (data.snapshot) {
                const localTurnId = this.game.history.length - 1;
                if (data.turnId > localTurnId || !this.game.doesLiveStateMatch(data.snapshot)) {
                    const wasInHistory = this.game.ensureLiveState();
                    if (wasInHistory) {
                        this.game.logSystem("Opponent completed their turn — returned to LIVE state.");
                    }
                    this.game.applyRemoteSnapshot(data.snapshot);
                    if (this.ui) this.ui.updateHUD();
                }
                this.sendTurnAck();
            }
            return;
        }

        // Legacy fallback for raw action payloads
        const wasInHistory = this.game.ensureLiveState();
        if (wasInHistory) {
            this.game.logSystem("Opponent completed their turn — returned to LIVE state.");
        }

        if (data.type === 'DEPLOY' || data.type === 'MOVE' || data.type === 'BARRICADE' || data.type === 'SKIP') {
            this.executeRemoteAction(data);
        }

        if (this.ui) this.ui.updateHUD();
        this.sendTurnAck();
    }
}

