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

        // WebRTC 관련 속성
        this.peerConnection = null;
        this.dataChannel = null;
        this.useWebRTC = true; // WebRTC 사용 여부
        this.webrtcConnected = false;
        this.pendingIceCandidates = [];
        this.targetConnectionId = '';
        this.videoElement = null;

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
        // serverUrlInput removed - URL is now determined dynamically in connect()
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

    initSocialLogin() {
        window.addEventListener('message', (event) => {
            // 보안을 위해 오리진 확인 (프로덕션 및 로컬 개발 환경)
            const allowedOrigins = [
                "https://lunarview-server.onrender.com",
                "http://localhost:8080"
            ];

            if (!allowedOrigins.includes(event.origin)) return;

            const { accessToken, refreshToken, user } = event.data;

            if (accessToken) {
                console.log('Social login success:', user);
                // 토큰 저장
                localStorage.setItem('lunarview_token', accessToken);
                localStorage.setItem('lunarview_refresh_token', refreshToken);

                if (user) {
                    localStorage.setItem('lunarview_user', JSON.stringify(user));
                    // 로그인 성공 UI 피드백 (간단히)
                    this.showError('');
                    alert(`환영합니다, ${user.name}님!`);
                }
            }
        });
    }

    connect() {
        // 서버 URL 결정 (프로덕션 vs 로컬)
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
                    // WebRTC에서 사용할 target ID 저장
                    this.targetConnectionId = connectionId;

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

                // WebRTC 모드: viewer-ready 시그널 전송
                if (this.useWebRTC) {
                    this.initWebRTC();
                    this.ws.send(JSON.stringify({
                        type: 'webrtc-viewer-ready',
                        targetConnectionId: this.targetConnectionId
                    }));
                    console.log('[WebRTC] Sent viewer-ready signal');
                }
                break;

            case 'connect-error':
                this.showError(message.error || '연결 실패');
                this.setConnecting(false);
                this.updateConnectionStatus('error', message.error || '연결 실패');
                break;

            case 'screen-frame':
                // WebRTC가 연결되지 않은 경우에만 JPEG 폴백 사용
                if (!this.webrtcConnected) {
                    this.renderFrame(message.frame);
                }
                break;

            case 'pong':
                this.lastPing = Date.now() - message.timestamp;
                this.pingDisplay.textContent = this.lastPing + 'ms';
                break;

            case 'disconnected':
                this.disconnect();
                break;

            // WebRTC 시그널링 메시지
            case 'webrtc-offer':
                this.handleWebRTCOffer(message);
                break;

            case 'webrtc-ice-candidate':
                this.handleWebRTCIceCandidate(message);
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

    // 활성 요소 가져오기 (WebRTC 모드면 video, 아니면 canvas)
    getActiveElement() {
        if (this.webrtcConnected && this.videoElement) {
            return this.videoElement;
        }
        return this.canvas;
    }

    getTouchPosition(touch) {
        const elem = this.getActiveElement();
        const rect = elem.getBoundingClientRect();
        return {
            x: (touch.clientX - rect.left) / rect.width,
            y: (touch.clientY - rect.top) / rect.height
        };
    }

    getMousePosition(e) {
        const elem = this.getActiveElement();
        const rect = elem.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };
    }

    sendMouseEvent(type, x, y, button = 0) {
        const message = JSON.stringify({
            type: 'mouse-event',
            event: { type, x, y, button }
        });

        // DataChannel이 열려있으면 우선 사용 (저지연)
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
        } else if (this.ws && this.connected) {
            // WebSocket 폴백
            this.ws.send(message);
        }
    }

    sendKeyboardEvent(type, key, modifiers = []) {
        const message = JSON.stringify({
            type: 'keyboard-event',
            event: { type, key, modifiers }
        });

        // DataChannel이 열려있으면 우선 사용 (저지연)
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
        } else if (this.ws && this.connected) {
            // WebSocket 폴백
            this.ws.send(message);
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

        // WebRTC 정리
        this.cleanupWebRTC();

        // Video 요소 초기화
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement.style.display = 'none';
        }
        if (this.canvas) {
            this.canvas.style.display = 'block';
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

    // =============================================
    // WebRTC 관련 메서드
    // =============================================

    initWebRTC() {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(config);
        console.log('[WebRTC] PeerConnection created');

        // ICE Candidate 이벤트
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'webrtc-ice-candidate',
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                }));
                console.log('[WebRTC] Sent ICE candidate');
            }
        };

        // 연결 상태 변경
        this.peerConnection.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.webrtcConnected = true;
                this.updateConnectionStatus('connected', 'WebRTC P2P 연결됨');
                // Canvas 숨기고 Video 표시
                if (this.canvas) this.canvas.style.display = 'none';
                if (this.videoElement) this.videoElement.style.display = 'block';
            } else if (this.peerConnection.connectionState === 'failed' ||
                this.peerConnection.connectionState === 'disconnected') {
                this.webrtcConnected = false;
                this.updateConnectionStatus('error', 'WebRTC 연결 실패');
                // 폴백: Canvas 다시 표시
                if (this.canvas) this.canvas.style.display = 'block';
                if (this.videoElement) this.videoElement.style.display = 'none';
            }
        };

        // 원격 스트림 수신
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Received track:', event.track.kind);

            if (event.track.kind === 'video') {
                // Video 요소 생성 또는 재사용
                if (!this.videoElement) {
                    this.videoElement = document.createElement('video');
                    this.videoElement.id = 'webrtc-video';
                    this.videoElement.autoplay = true;
                    this.videoElement.playsInline = true;
                    this.videoElement.muted = true;
                    this.videoElement.style.width = '100%';
                    this.videoElement.style.height = '100%';
                    this.videoElement.style.objectFit = 'contain';
                    this.videoElement.style.background = '#000';
                    this.videoElement.style.display = 'none';

                    // Canvas 컨테이너에 추가
                    const container = this.canvas.parentElement;
                    container.appendChild(this.videoElement);
                }

                this.videoElement.srcObject = event.streams[0];
                this.videoElement.play().catch(e => console.error('Video play error:', e));

                // 오버레이 숨김
                if (this.canvasOverlay.classList.contains('active')) {
                    this.canvasOverlay.classList.remove('active');
                }

                // FPS 모니터링 시작
                this.startWebRTCStatsMonitor();
            }
        };

        // DataChannel 수신 (Host가 생성한 경우)
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            console.log('[WebRTC] DataChannel received:', event.channel.label);

            this.dataChannel.onopen = () => {
                console.log('[WebRTC] DataChannel opened');
            };

            this.dataChannel.onclose = () => {
                console.log('[WebRTC] DataChannel closed');
            };
        };

        // Transceiver 추가 (Video/Audio 수신 전용)
        this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
        this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    }

    async handleWebRTCOffer(message) {
        if (!this.peerConnection) {
            console.warn('[WebRTC] No peer connection for offer');
            return;
        }

        try {
            const offer = {
                type: 'offer',
                sdp: message.sdp
            };

            console.log('[WebRTC] Received offer, creating answer...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('[WebRTC] Remote description set');

            // 대기 중인 ICE 후보 처리
            await this.processPendingCandidates();

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.ws.send(JSON.stringify({
                type: 'webrtc-answer',
                sdp: answer.sdp
            }));
            console.log('[WebRTC] Answer sent');
        } catch (err) {
            console.error('[WebRTC] Error handling offer:', err);
        }
    }

    async handleWebRTCIceCandidate(message) {
        if (!this.peerConnection) {
            // 아직 PeerConnection이 없으면 대기열에 추가
            this.pendingIceCandidates.push(message);
            console.log('[WebRTC] ICE candidate queued');
            return;
        }

        if (!this.peerConnection.remoteDescription) {
            // RemoteDescription이 없으면 대기열에 추가
            this.pendingIceCandidates.push(message);
            console.log('[WebRTC] ICE candidate queued (no remote description)');
            return;
        }

        try {
            const candidate = new RTCIceCandidate({
                candidate: message.candidate,
                sdpMid: message.sdpMid,
                sdpMLineIndex: message.sdpMLineIndex
            });
            await this.peerConnection.addIceCandidate(candidate);
            console.log('[WebRTC] ICE candidate added');
        } catch (err) {
            console.error('[WebRTC] Error adding ICE candidate:', err);
        }
    }

    async processPendingCandidates() {
        console.log('[WebRTC] Processing', this.pendingIceCandidates.length, 'pending ICE candidates');

        for (const msg of this.pendingIceCandidates) {
            try {
                const candidate = new RTCIceCandidate({
                    candidate: msg.candidate,
                    sdpMid: msg.sdpMid,
                    sdpMLineIndex: msg.sdpMLineIndex
                });
                await this.peerConnection.addIceCandidate(candidate);
            } catch (err) {
                console.error('[WebRTC] Error adding pending ICE candidate:', err);
            }
        }

        this.pendingIceCandidates = [];
    }

    startWebRTCStatsMonitor() {
        if (this.statsInterval) return;

        this.statsInterval = setInterval(async () => {
            if (!this.peerConnection) return;

            try {
                const stats = await this.peerConnection.getStats();
                stats.forEach(report => {
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        if (this.lastFramesReceived !== undefined) {
                            const fps = report.framesReceived - this.lastFramesReceived;
                            this.fpsDisplay.textContent = fps + ' FPS';
                        }
                        this.lastFramesReceived = report.framesReceived;
                    }
                });
            } catch (err) {
                // Stats 수집 실패 무시
            }
        }, 1000);
    }

    cleanupWebRTC() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.webrtcConnected = false;
        this.pendingIceCandidates = [];
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
