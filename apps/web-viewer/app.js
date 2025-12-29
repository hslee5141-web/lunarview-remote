/**
 * LunarView Web Viewer
 * Touch-optimized remote desktop viewer
 */

class RemoteViewer {
    constructor() {
        this.ws = null;
        this.connectionId = '';
        this.connected = false;
        this.frameCount = 0;
        this.lastFpsTime = Date.now();
        this.mouseMode = 'tap'; // 'tap' or 'drag'
        this.activeModifiers = new Set();
        this.pingInterval = null;
        this.lastPing = 0;

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // Screens
        this.connectScreen = document.getElementById('connect-screen');
        this.viewerScreen = document.getElementById('viewer-screen');

        // Connect form
        this.connectionIdInput = document.getElementById('connection-id');
        this.passwordInput = document.getElementById('password');
        this.serverUrlInput = document.getElementById('server-url');
        this.connectBtn = document.getElementById('connect-btn');
        this.errorMsg = document.getElementById('error-msg');
        this.connectionStatus = document.getElementById('connection-status');

        // Viewer
        this.canvas = document.getElementById('remote-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasOverlay = document.getElementById('canvas-overlay');
        this.fpsDisplay = document.getElementById('fps-display');
        this.pingDisplay = document.getElementById('ping-display');
        this.remoteName = document.getElementById('remote-name');
        this.backBtn = document.getElementById('back-btn');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.qualityBtn = document.getElementById('quality-btn');
        this.keyboardBtn = document.getElementById('keyboard-btn');
        this.mouseModeBtn = document.getElementById('mouse-mode-btn');
        this.specialKeysBtn = document.getElementById('special-keys-btn');

        // Virtual keyboard
        this.virtualKeyboard = document.getElementById('virtual-keyboard');
        this.keyboardInput = document.getElementById('keyboard-input');
        this.sendTextBtn = document.getElementById('send-text-btn');
        this.closeKeyboardBtn = document.getElementById('close-keyboard-btn');

        // Special keys panel
        this.specialKeysPanel = document.getElementById('special-keys-panel');
        this.closeSpecialBtn = document.getElementById('close-special-btn');
    }

    initEventListeners() {
        // Connect
        this.connectBtn.addEventListener('click', () => this.connect());
        this.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connect();
        });
        this.connectionIdInput.addEventListener('input', (e) => {
            // Auto-format connection ID
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
        });

        // Viewer controls
        this.backBtn?.addEventListener('click', () => this.disconnect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // Keyboard panel
        this.keyboardBtn.addEventListener('click', () => this.showKeyboard());
        this.closeKeyboardBtn.addEventListener('click', () => this.hideKeyboard());
        this.sendTextBtn.addEventListener('click', () => this.sendText());
        this.keyboardInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendText();
        });

        // Mouse mode
        this.mouseModeBtn.addEventListener('click', () => this.toggleMouseMode());

        // Special keys panel
        this.specialKeysBtn?.addEventListener('click', () => this.showSpecialKeys());
        this.closeSpecialBtn?.addEventListener('click', () => this.hideSpecialKeys());

        // Special key buttons
        document.querySelectorAll('.special-key').forEach(btn => {
            btn.addEventListener('click', () => this.handleSpecialKey(btn));
        });

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Mouse events for desktop
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Prevent zoom
        document.addEventListener('gesturestart', e => e.preventDefault());
    }

    connect() {
        const serverUrl = this.serverUrlInput.value;
        const connectionId = this.connectionIdInput.value.trim();
        const password = this.passwordInput.value;

        if (!connectionId) {
            this.showError('연결 ID를 입력하세요');
            return;
        }

        if (connectionId.length !== 9) {
            this.showError('9자리 ID를 입력하세요');
            return;
        }

        this.showError('');
        this.setConnecting(true);

        try {
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                console.log('Connected to server');
                this.updateConnectionStatus('connecting', '서버 연결됨');

                // Register as viewer
                this.connectionId = 'web-' + Math.random().toString().slice(2, 8);
                this.ws.send(JSON.stringify({
                    type: 'register',
                    connectionId: this.connectionId,
                    password: '',
                    isHost: false
                }));

                // Request connection
                setTimeout(() => {
                    this.ws.send(JSON.stringify({
                        type: 'connect',
                        targetConnectionId: connectionId,
                        password: password
                    }));
                }, 500);
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.showError('서버 연결 실패');
                this.setConnecting(false);
                this.updateConnectionStatus('error', '연결 실패');
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                if (this.connected) {
                    this.disconnect();
                }
                this.setConnecting(false);
                this.updateConnectionStatus('idle', '연결 대기 중');
            };
        } catch (error) {
            console.error('Connection error:', error);
            this.showError(error.message);
            this.setConnecting(false);
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'registered':
                console.log('Registered as:', this.connectionId);
                break;

            case 'connect-success':
                console.log('Session started');
                this.connected = true;
                this.remoteName.textContent = message.hostName || '원격 PC';
                this.showViewer();
                this.startPingMonitor();
                break;

            case 'connect-error':
                this.showError(message.error || '연결 실패');
                this.setConnecting(false);
                this.updateConnectionStatus('error', message.error || '연결 실패');
                break;

            case 'screen-frame':
                this.renderFrame(message.frame);
                break;

            case 'pong':
                this.lastPing = Date.now() - message.timestamp;
                this.pingDisplay.textContent = this.lastPing + 'ms';
                break;

            case 'disconnected':
                this.disconnect();
                break;
        }
    }

    renderFrame(base64Data) {
        // Hide loading overlay on first frame
        if (this.canvasOverlay.classList.contains('active')) {
            this.canvasOverlay.classList.remove('active');
        }

        const img = new Image();
        img.onload = () => {
            if (this.canvas.width !== img.width) this.canvas.width = img.width;
            if (this.canvas.height !== img.height) this.canvas.height = img.height;
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = 'data:image/jpeg;base64,' + base64Data;

        // FPS calculation
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fpsDisplay.textContent = this.frameCount + ' FPS';
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    // Touch handling
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = this.getTouchPosition(touch);

        if (this.mouseMode === 'tap') {
            this.sendMouseEvent('move', pos.x, pos.y);
            this.sendMouseEvent('down', pos.x, pos.y, 0);
        } else {
            this.sendMouseEvent('move', pos.x, pos.y);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = this.getTouchPosition(touch);
        this.sendMouseEvent('move', pos.x, pos.y);
    }

    handleTouchEnd(e) {
        e.preventDefault();
        if (this.mouseMode === 'tap') {
            this.sendMouseEvent('up', 0, 0, 0);
        }
    }

    // Mouse handling (for desktop)
    handleMouseDown(e) {
        const pos = this.getMousePosition(e);
        this.sendMouseEvent('down', pos.x, pos.y, e.button);
    }

    handleMouseMove(e) {
        if (!this.connected) return;
        const pos = this.getMousePosition(e);
        this.sendMouseEvent('move', pos.x, pos.y);
    }

    handleMouseUp(e) {
        const pos = this.getMousePosition(e);
        this.sendMouseEvent('up', pos.x, pos.y, e.button);
    }

    getTouchPosition(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (touch.clientX - rect.left) / rect.width,
            y: (touch.clientY - rect.top) / rect.height
        };
    }

    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };
    }

    sendMouseEvent(type, x, y, button = 0) {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify({
                type: 'mouse-event',
                event: { type, x, y, button }
            }));
        }
    }

    sendKeyboardEvent(type, key, modifiers = []) {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify({
                type: 'keyboard-event',
                event: { type, key, modifiers }
            }));
        }
    }

    // Special keys handling
    handleSpecialKey(btn) {
        const key = btn.dataset.key;
        const combo = btn.dataset.combo;

        if (btn.classList.contains('modifier')) {
            // Toggle modifier
            btn.classList.toggle('active');
            if (btn.classList.contains('active')) {
                this.activeModifiers.add(key);
            } else {
                this.activeModifiers.delete(key);
            }
        } else if (combo) {
            // Key combination
            const keys = combo.split('+');
            keys.forEach(k => this.sendKeyboardEvent('down', k));
            setTimeout(() => {
                keys.reverse().forEach(k => this.sendKeyboardEvent('up', k));
            }, 100);
        } else {
            // Regular key
            this.sendKeyboardEvent('down', key, Array.from(this.activeModifiers));
            this.sendKeyboardEvent('up', key, Array.from(this.activeModifiers));

            // Clear modifiers after use
            this.activeModifiers.clear();
            document.querySelectorAll('.special-key.modifier.active').forEach(btn => {
                btn.classList.remove('active');
            });
        }
    }

    // UI methods
    showViewer() {
        this.connectScreen.classList.remove('active');
        this.viewerScreen.classList.add('active');
        this.canvasOverlay.classList.add('active');
    }

    showConnect() {
        this.viewerScreen.classList.remove('active');
        this.connectScreen.classList.add('active');
    }

    disconnect() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.showConnect();
        this.setConnecting(false);
        this.hideKeyboard();
        this.hideSpecialKeys();
    }

    showError(msg) {
        this.errorMsg.textContent = msg;
    }

    setConnecting(isConnecting) {
        this.connectBtn.disabled = isConnecting;
        const btnText = this.connectBtn.querySelector('span');
        if (btnText) {
            btnText.textContent = isConnecting ? '연결 중...' : '연결하기';
        }
    }

    updateConnectionStatus(status, text) {
        this.connectionStatus.className = 'connection-status ' + status;
        this.connectionStatus.querySelector('span').textContent = text;
    }

    startPingMonitor() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.connected) {
                this.ws.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            }
        }, 2000);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.body.requestFullscreen();
            document.body.classList.add('fullscreen');
        } else {
            document.exitFullscreen();
            document.body.classList.remove('fullscreen');
        }
    }

    toggleMouseMode() {
        this.mouseMode = this.mouseMode === 'tap' ? 'drag' : 'tap';
        const modeText = this.mouseModeBtn.querySelector('span');
        if (modeText) {
            modeText.textContent = this.mouseMode === 'tap' ? '터치' : '드래그';
        }
    }

    showKeyboard() {
        this.hideSpecialKeys();
        this.virtualKeyboard.classList.remove('hidden');
        this.keyboardInput.focus();
    }

    hideKeyboard() {
        this.virtualKeyboard.classList.add('hidden');
        this.keyboardInput.value = '';
    }

    showSpecialKeys() {
        this.hideKeyboard();
        this.specialKeysPanel.classList.remove('hidden');
    }

    hideSpecialKeys() {
        this.specialKeysPanel.classList.add('hidden');
        this.activeModifiers.clear();
        document.querySelectorAll('.special-key.modifier.active').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    sendText() {
        const text = this.keyboardInput.value;
        for (const char of text) {
            this.sendKeyboardEvent('down', char);
            this.sendKeyboardEvent('up', char);
        }
        this.keyboardInput.value = '';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new RemoteViewer();
});
