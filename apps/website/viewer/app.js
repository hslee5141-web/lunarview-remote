/**
 * LunarView Web Viewer
 * Touch-optimized remote desktop viewer with WebRTC P2P support
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

        // WebRTC
        this.peerConnection = null;
        this.remoteStream = null;
        this.useWebRTC = true;
        this.pendingIceCandidates = [];

        // ICE 서버 설정 (데스크톱 앱과 동일)
        this.iceConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' },
                {
                    urls: 'turn:a.relay.metered.ca:80',
                    username: 'e8dd65c92a96d2d9dde3a016',
                    credential: 'xlr/9K0KQbvkBpzT'
                },
                {
                    urls: 'turn:a.relay.metered.ca:443',
                    username: 'e8dd65c92a96d2d9dde3a016',
                    credential: 'xlr/9K0KQbvkBpzT'
                },
                {
                    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
                    username: 'e8dd65c92a96d2d9dde3a016',
                    credential: 'xlr/9K0KQbvkBpzT'
                }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        this.initElements();
        this.initEventListeners();
        this.initSocialLogin();
    }

    initElements() {
        // Screens
        this.connectScreen = document.getElementById('connect-screen');
        this.viewerScreen = document.getElementById('viewer-screen');

        // Connect form
        this.connectionIdInput = document.getElementById('connection-id');
        this.passwordInput = document.getElementById('password');
        this.connectBtn = document.getElementById('connect-btn');
        this.errorMsg = document.getElementById('error-msg');
        this.connectionStatus = document.getElementById('connection-status');

        // Viewer
        this.video = document.getElementById('remote-video');
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

        // Touch events (for video element)
        this.video.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.video.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.video.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Mouse events for desktop (for video element)
        this.video.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.video.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.video.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.video.addEventListener('contextmenu', (e) => e.preventDefault());

        // Fallback canvas events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Prevent zoom
        document.addEventListener('gesturestart', e => e.preventDefault());
    }

    initSocialLogin() {
        window.addEventListener('message', (event) => {
            const allowedOrigins = [
                "https://lunarview-server.onrender.com",
                "http://localhost:8080"
            ];

            if (!allowedOrigins.includes(event.origin)) return;

            const { accessToken, refreshToken, user } = event.data;

            if (accessToken) {
                console.log('Social login success:', user);
                localStorage.setItem('lunarview_token', accessToken);
                localStorage.setItem('lunarview_refresh_token', refreshToken);

                if (user) {
                    localStorage.setItem('lunarview_user', JSON.stringify(user));
                    this.showError('');
                    alert(`환영합니다, ${user.name}님!`);
                }
            }
        });
    }

    connect() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const serverUrl = isLocalhost
            ? 'ws://localhost:8080'
            : 'wss://lunarview-server.onrender.com';

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

                this.connectionId = 'web-' + Math.random().toString().slice(2, 8);
                this.ws.send(JSON.stringify({
                    type: 'register',
                    connectionId: this.connectionId,
                    password: '',
                    isHost: false
                }));

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
                this.showError(`서버 연결 실패 (${serverUrl})`);
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
                // WebRTC 초기화 및 viewer-ready 신호 전송
                this.initWebRTC();
                break;

            case 'connect-error':
                this.showError(message.error || '연결 실패');
                this.setConnecting(false);
                this.updateConnectionStatus('error', message.error || '연결 실패');
                break;

            // WebRTC 시그널링 처리
            case 'webrtc-offer':
                this.handleWebRTCOffer(message);
                break;

            case 'webrtc-ice-candidate':
                this.handleWebRTCIceCandidate(message);
                break;

            // 폴백: screen-frame 모드
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

    // ==================
    // WebRTC 관련 메서드
    // ==================

    initWebRTC() {
        console.log('[WebRTC] Initializing as Viewer...');

        this.peerConnection = new RTCPeerConnection(this.iceConfig);

        // ICE Candidate 수집
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[WebRTC] Sending ICE candidate');
                this.sendToServer({
                    type: 'webrtc-ice-candidate',
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };

        // 연결 상태 변경 감지
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE State:', this.peerConnection.iceConnectionState);
            if (this.peerConnection.iceConnectionState === 'connected') {
                this.canvasOverlay.classList.remove('active');
                console.log('[WebRTC] P2P Connection established!');
            } else if (this.peerConnection.iceConnectionState === 'failed') {
                console.warn('[WebRTC] Connection failed, falling back to relay mode');
                this.useWebRTC = false;
            }
        };

        // 원격 스트림 수신
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Remote track received:', event.track.kind);
            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0];
                this.video.srcObject = this.remoteStream;
                this.video.style.display = 'block';
                this.canvas.style.display = 'none';
                this.canvasOverlay.classList.remove('active');

                // FPS 모니터링 (비디오용)
                this.startVideoFpsMonitor();

                console.log('[WebRTC] Video stream attached to element');
            }
        };

        // Transceiver 추가 (수신 전용)
        this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
        this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });

        // Host에게 준비 완료 알림
        console.log('[WebRTC] Sending viewer-ready signal');
        this.sendToServer({ type: 'webrtc-viewer-ready' });
    }

    async handleWebRTCOffer(message) {
        console.log('[WebRTC] Received offer');

        if (!this.peerConnection) {
            console.error('[WebRTC] No peer connection');
            return;
        }

        try {
            const offer = { type: 'offer', sdp: message.sdp };
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('[WebRTC] Remote description set');

            // 대기 중인 ICE 후보 처리
            await this.processPendingCandidates();

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log('[WebRTC] Sending answer');
            this.sendToServer({
                type: 'webrtc-answer',
                sdp: answer.sdp
            });
        } catch (err) {
            console.error('[WebRTC] Error handling offer:', err);
        }
    }

    async handleWebRTCIceCandidate(message) {
        if (!message.candidate) return;

        const candidate = {
            candidate: message.candidate,
            sdpMid: message.sdpMid,
            sdpMLineIndex: message.sdpMLineIndex
        };

        if (this.peerConnection && this.peerConnection.remoteDescription) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('[WebRTC] ICE candidate added');
            } catch (err) {
                console.error('[WebRTC] Error adding ICE candidate:', err);
            }
        } else {
            console.log('[WebRTC] Queueing ICE candidate');
            this.pendingIceCandidates.push(candidate);
        }
    }

    async processPendingCandidates() {
        if (!this.peerConnection || !this.peerConnection.remoteDescription) return;

        console.log(`[WebRTC] Processing ${this.pendingIceCandidates.length} pending candidates`);
        for (const candidate of this.pendingIceCandidates) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('[WebRTC] Error adding pending candidate:', err);
            }
        }
        this.pendingIceCandidates = [];
    }

    startVideoFpsMonitor() {
        // 비디오 프레임 카운트 (근사치)
        let lastTime = performance.now();
        const checkFps = () => {
            if (!this.connected || !this.video.srcObject) return;

            // requestVideoFrameCallback이 지원되면 사용
            if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
                this.video.requestVideoFrameCallback((now, metadata) => {
                    this.frameCount++;
                    const elapsed = now - this.lastFpsTime;
                    if (elapsed >= 1000) {
                        this.fpsDisplay.textContent = this.frameCount + ' FPS';
                        this.frameCount = 0;
                        this.lastFpsTime = now;
                    }
                    if (this.connected) {
                        this.video.requestVideoFrameCallback(checkFps);
                    }
                });
            } else {
                // 폴백: 1초마다 추정
                setInterval(() => {
                    if (this.connected && this.video.srcObject) {
                        const track = this.video.srcObject.getVideoTracks()[0];
                        if (track && track.getSettings) {
                            const fps = track.getSettings().frameRate || 30;
                            this.fpsDisplay.textContent = Math.round(fps) + ' FPS';
                        }
                    }
                }, 1000);
            }
        };
        checkFps();
    }

    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    // ==================
    // 폴백: screen-frame 렌더링
    // ==================

    renderFrame(base64Data) {
        // WebRTC가 활성화되어 있으면 무시
        if (this.useWebRTC && this.video.srcObject) return;

        // 캔버스 모드로 전환
        this.video.style.display = 'none';
        this.canvas.style.display = 'block';

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

        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fpsDisplay.textContent = this.frameCount + ' FPS';
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    // ==================
    // 입력 이벤트 처리
    // ==================

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = this.getPosition(e.target, touch.clientX, touch.clientY);

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
        const pos = this.getPosition(e.target, touch.clientX, touch.clientY);
        this.sendMouseEvent('move', pos.x, pos.y);
    }

    handleTouchEnd(e) {
        e.preventDefault();
        if (this.mouseMode === 'tap') {
            this.sendMouseEvent('up', 0, 0, 0);
        }
    }

    handleMouseDown(e) {
        const pos = this.getPosition(e.target, e.clientX, e.clientY);
        this.sendMouseEvent('down', pos.x, pos.y, e.button);
    }

    handleMouseMove(e) {
        if (!this.connected) return;
        const pos = this.getPosition(e.target, e.clientX, e.clientY);
        this.sendMouseEvent('move', pos.x, pos.y);
    }

    handleMouseUp(e) {
        const pos = this.getPosition(e.target, e.clientX, e.clientY);
        this.sendMouseEvent('up', pos.x, pos.y, e.button);
    }

    getPosition(element, clientX, clientY) {
        const rect = element.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
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

    handleSpecialKey(btn) {
        const key = btn.dataset.key;
        const combo = btn.dataset.combo;

        if (btn.classList.contains('modifier')) {
            btn.classList.toggle('active');
            if (btn.classList.contains('active')) {
                this.activeModifiers.add(key);
            } else {
                this.activeModifiers.delete(key);
            }
        } else if (combo) {
            const keys = combo.split('+');
            keys.forEach(k => this.sendKeyboardEvent('down', k));
            setTimeout(() => {
                keys.reverse().forEach(k => this.sendKeyboardEvent('up', k));
            }, 100);
        } else {
            this.sendKeyboardEvent('down', key, Array.from(this.activeModifiers));
            this.sendKeyboardEvent('up', key, Array.from(this.activeModifiers));

            this.activeModifiers.clear();
            document.querySelectorAll('.special-key.modifier.active').forEach(btn => {
                btn.classList.remove('active');
            });
        }
    }

    // ==================
    // UI 메서드
    // ==================

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
        // WebRTC 정리
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        this.remoteStream = null;
        this.pendingIceCandidates = [];
        this.useWebRTC = true;

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
