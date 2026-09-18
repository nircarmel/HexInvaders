// js/network.js
class NetworkManager {
    constructor(hostId = null) {
        this.peer = null;
        this.conn = null;
        this.isHost = !hostId;
        this.connected = false;

        // These will be bound after game setup
        this.ui = null;
        this.game = null;

        if (hostId) {
            this.joinGame(hostId);
        }

        this.bindPopupListeners();
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
        this.game.localTeam = this.isHost ? 'BLUE' : 'RED';
        if (this.isHost) {
            this.game.logSystem("Waiting for Opponent to connect to the Host Link...");
        } else {
            this.game.logSystem(`Connected as Guest. You are RED.`);
            document.getElementById('online-modal').classList.add('hidden');
        }
    }

    hostGame() {
        // Assumes PeerJS is loaded as global 'Peer'
        this.peer = new Peer();
        this.peer.on('open', (id) => {
            const link = `${window.location.origin}${window.location.pathname}?host=${id}`;
            document.getElementById('host-link-input').value = link;
        });

        this.peer.on('connection', (conn) => {
            if (this.conn) {
                conn.close(); // Only 1 guest
                return;
            }
            this.conn = conn;
            this.setupConnection();

            document.getElementById('online-modal').classList.add('hidden');
            if (this.game) this.game.logSystem("Opponent Connected! Game Start! You are BLUE.");
            if (this.ui) this.ui.updateHUD();
        });

        this.peer.on('error', (err) => {
            console.error(err);
            if (this.game) this.game.logSystem("Network Error: " + err.message);
        });
    }

    joinGame(hostId) {
        this.peer = new Peer();
        this.peer.on('open', (id) => {
            this.conn = this.peer.connect(hostId, { reliable: true });
            this.setupConnection();
        });

        this.peer.on('error', (err) => {
            console.error(err);
            if (this.game) this.game.logSystem("Network Error: " + err.message);
        });
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.connected = true;
            if (this.ui) this.ui.updateHUD();
        });

        this.conn.on('data', (data) => {
            this.receiveData(data);
        });

        this.conn.on('close', () => {
            this.connected = false;
            if (this.game) this.game.logSystem("Opponent Disconnected!");
        });
    }

    sendData(payload) {
        if (this.connected && this.conn) {
            this.conn.send(payload);
        }
    }

    receiveData(data) {
        if (!this.game || !this.ui) return;

        if (data.type === 'DEPLOY') {
            this.game.deployUnit(data.team, data.unitType, data.str, data.spd, data.col, data.row, true);
        } else if (data.type === 'MOVE') {
            this.game.moveUnit(data.col, data.row, data.tC, data.tR, true);
        } else if (data.type === 'BARRICADE') {
            this.game.createBarricade(data.col, data.row, data.offset, true);
        }

        // Notice endTurn implies a SKIP, but moveUnit/deployUnit internally call endTurn if actionUsed!
        // We only explicitly call endTurn if the remote player forcefully skipped.
        if (data.type === 'SKIP') {
            this.game.endTurn(true);
        }

        this.ui.updateHUD();
    }
}
