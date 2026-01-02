/**
 * Remote Desktop - Main Process (Refactored)
 * 모듈화된 메인 프로세스
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
// 하드웨어 가속 및 성능 최적화
// app.disableHardwareAcceleration(); // 비활성화하면 안됨! GPU 가속 필요
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer'); // Linux support

// H.264 하드웨어 인코딩 최적화 플래그
app.commandLine.appendSwitch('enable-accelerated-video-decode'); // 하드웨어 비디오 디코딩
app.commandLine.appendSwitch('enable-accelerated-video-encode'); // 하드웨어 비디오 인코딩
app.commandLine.appendSwitch('enable-gpu-rasterization');        // GPU 래스터화
app.commandLine.appendSwitch('enable-zero-copy');                // 제로 카피 (메모리 최적화)
app.commandLine.appendSwitch('ignore-gpu-blocklist');            // GPU 블록리스트 무시

// 개발 모드에서 다른 userData 경로 사용 (캐시 충돌 방지)
if (!app.isPackaged) {
    app.setPath('userData', path.join(app.getPath('userData'), 'dev'));
}


// 모듈 로드
const WebSocket = require('ws');
const inputController = require('./modules/inputController');
// const screenCapture = require('./modules/screenCapture');
const clipboardSync = require('./modules/clipboardSync');
const fileTransfer = require('./modules/fileTransfer');
const hotkeyManager = require('./modules/hotkeyManager');
// const { WebRTCManager } = require('./modules/webrtcManager');
const autoUpdater = require('./modules/autoUpdater');
const desktopAuth = require('./modules/desktopAuth');
const planRestrictions = require('./modules/planRestrictions');
const { fixedPassword, trustedDevices, savedConnections } = require('./modules/trustedDevices');

// ===================
// 환경 설정
// ===================
// 배포/개발 환경 설정 (직접 인라인)
const isDev = false; // 배포 서버 사용: false, 로컬 테스트: true

const CONFIG = {
    serverUrl: isDev ? 'ws://localhost:8080' : 'wss://lunarview-server.onrender.com',
    reconnectInterval: 3000,
    heartbeatInterval: 30000,
};

// ===================
// 상태 관리
// ===================
const state = {
    mainWindow: null,
    ws: null,
    connectionId: '',
    password: '',
    isHost: true,
    sessionActive: false,
    connectedPeerId: null,
    // WebRTC P2P
    webrtc: null,
    useP2P: true,  // P2P 시도 여부
    p2pConnected: false,
};

// ===================
// 유틸리티
// ===================
function generateConnectionId() {
    return Math.random().toString().slice(2, 11);
}

function generatePassword() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function sendToRenderer(channel, data) {
    // mainWindow와 webContents가 모두 살아있는지 확인
    if (state.mainWindow && !state.mainWindow.isDestroyed() &&
        state.mainWindow.webContents && !state.mainWindow.webContents.isDestroyed()) {
        try {
            state.mainWindow.webContents.send(channel, data);
        } catch (e) {
            // 렌더러가 비정상 종료된 경우 로그만 남기고 무시 (앱 크래시 방지)
            if (e.message.includes('Render frame was disposed')) {
                return; // 개발 중 HMR 등으로 인한 자연스러운 현상이므로 무시
            }
            console.log(`[Main] Failed to send ${channel} (renderer might be gone):`, e.message);
        }
    }
}

function sendToServer(message) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(message));
        return true;
    }
    return false;
}

// ===================
// 윈도우 생성
// ===================
function createWindow() {
    state.mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        icon: path.join(__dirname, '../../assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true, // Enabled for debugging
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    // 패키징된 앱이거나, npm start로 실행된 경우 (프로덕션 빌드 테스트)
    // 개발 모드는 --dev 플래그로 구분
    const isDev = process.argv.includes('--dev');

    // 개발 모드이고 패키징되지 않았을 때만 localhost 연결
    if (!app.isPackaged && isDev) {
        state.mainWindow.loadURL('http://localhost:5173');
        // state.mainWindow.webContents.openDevTools();
    } else {
        // 그 외(빌드된 앱 테스트 또는 패키징된 앱)는 파일 로드
        // dist/main/index.js 기준 ../renderer/index.html
        state.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    state.mainWindow.once('ready-to-show', () => {
        state.mainWindow.show();
        // DevTools auto-close disabled for debugging
        /*
        setTimeout(() => {
            if (state.mainWindow && !state.mainWindow.isDestroyed()) {
                state.mainWindow.webContents.closeDevTools();
            }
        }, 500);
        */
    });

    // 창 이동 시 디스플레이 변경 감지
    let lastDisplayId = null;
    state.mainWindow.on('move', () => {
        if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
        const bounds = state.mainWindow.getBounds();
        const currentDisplay = screen.getDisplayNearestPoint({
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2
        });

        if (lastDisplayId !== null && lastDisplayId !== currentDisplay.id) {
            console.log('[Main] Window moved to different display:', currentDisplay.id);
            sendToRenderer('display-changed', {
                id: currentDisplay.id,
                bounds: currentDisplay.bounds
            });
        }
        lastDisplayId = currentDisplay.id;
    });

    state.mainWindow.on('closed', () => {
        state.mainWindow = null;
        disconnectFromServer();
    });

    // 서버 연결
    setTimeout(connectToServer, 1000);

    // 자동 업데이트 초기화 (세션 중엔 확인 안 함, 10초 딜레이)
    setTimeout(() => {
        if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
        autoUpdater.init(state.mainWindow, (event, data) => {
            sendToRenderer('update-status', { event, ...data });
        }, () => !state.sessionActive);
    }, 10000);
}

// ===================
// WebSocket 연결
// ===================
function connectToServer() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

    console.log('[Main] Connecting to:', CONFIG.serverUrl);

    try {
        state.ws = new WebSocket(CONFIG.serverUrl);

        state.ws.on('open', () => {
            console.log('[Main] Connected to server');
            registerAsHost();
        });

        state.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleServerMessage(message);
            } catch (e) {
                console.error('[Main] Message parse error:', e);
            }
        });

        state.ws.on('close', () => {
            console.log('[Main] Disconnected from server');
            state.sessionActive = false;
            sendToRenderer('connection-status', 'disconnected');

            // 재연결
            setTimeout(() => {
                if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
                    connectToServer();
                }
            }, CONFIG.reconnectInterval);
        });

        state.ws.on('error', (error) => {
            console.error('[Main] WebSocket error:', error.message);
        });
    } catch (error) {
        console.error('[Main] Connection failed:', error);
    }
}

function disconnectFromServer() {
    stopSession();
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }
}

function registerAsHost() {
    state.connectionId = generateConnectionId();
    state.password = generatePassword();
    state.isHost = true;

    sendToServer({
        type: 'register',
        connectionId: state.connectionId,
        password: state.password,
        isHost: true,
    });
}

// ===================
// 메시지 처리
// ===================
function handleServerMessage(message) {
    switch (message.type) {
        case 'registered':
            console.log('[Main] Registered:', state.connectionId);
            sendToRenderer('connection-status', 'connected');
            sendToRenderer('credentials-updated', {
                connectionId: state.connectionId,
                password: state.password
            });
            break;

        case 'connect-success':
            console.log('[Main] Connected to:', message.targetConnectionId);
            state.sessionActive = true;
            state.connectedPeerId = message.targetConnectionId;
            sendToRenderer('connection-status', 'session-active');
            sendToRenderer('session-started', { sessionId: message.sessionId });
            break;

        case 'connect-error':
            console.log('[Main] Connection failed:', message.error);
            sendToRenderer('connection-error', message.error);
            break;

        case 'incoming-connection':
            console.log('[Main] Incoming connection from:', message.fromConnectionId);
            state.sessionActive = true;
            state.connectedPeerId = message.fromConnectionId;
            sendToRenderer('connection-status', 'session-active');
            sendToRenderer('incoming-connection', message);
            startSession();
            break;

        case 'screen-frame':
            sendToRenderer('screen-frame', message.frame);
            break;

        case 'mouse-event':
            inputController.handleMouseEvent(message.event);
            break;

        case 'keyboard-event':
            inputController.handleKeyboardEvent(message.event);
            break;

        case 'chat-message':
            sendToRenderer('chat-message', message.text);
            break;

        case 'file-chunk':
            handleFileChunk(message);
            break;

        case 'clipboard-sync':
            clipboardSync.setContent(message.content);
            sendToRenderer('clipboard-received', message.content);
            break;

        case 'disconnected':
            console.log('[Main] Session ended:', message.reason);
            stopSession();
            sendToRenderer('connection-status', 'connected');
            sendToRenderer('session-ended', { reason: message.reason });
            break;

        // WebRTC 시그널링 처리
        case 'webrtc-offer':
            // RTCSessionDescription을 위해 type을 'offer'로 명시
            sendToRenderer('webrtc-offer', { type: 'offer', sdp: message.sdp });
            break;

        case 'webrtc-answer':
            // RTCSessionDescription을 위해 type을 'answer'로 명시
            sendToRenderer('webrtc-answer', { type: 'answer', sdp: message.sdp });
            break;

        case 'webrtc-ice-candidate':
            sendToRenderer('webrtc-ice-candidate', message);
            break;

        case 'webrtc-viewer-ready':
            console.log('[Main] Received viewer-ready from server, forwarding to Renderer');
            sendToRenderer('webrtc-viewer-ready');
            break;

        case 'pong':
            break;
    }
}

// ===================
// WebRTC Signaling IPC Handlers
// ===================
ipcMain.on('webrtc-viewer-ready', () => {
    if (state.connectedPeerId) {
        console.log('[Main] Sending viewer-ready signal to:', state.connectedPeerId);
        sendToServer({
            type: 'webrtc-viewer-ready',
            targetId: state.connectedPeerId
        });
    }
});

ipcMain.on('webrtc-offer', (_, offer) => {
    if (state.connectedPeerId) {
        console.log('[Main] Sending Offer to:', state.connectedPeerId);
        sendToServer({
            type: 'webrtc-offer',
            targetId: state.connectedPeerId,
            sdp: offer.sdp
            // offer.type은 'offer'이지만 메시지 타입은 'webrtc-offer'로 보냄
        });
    }
});

ipcMain.on('webrtc-answer', (_, answer) => {
    if (state.connectedPeerId) {
        console.log('[Main] Sending Answer to:', state.connectedPeerId);
        sendToServer({
            type: 'webrtc-answer',
            targetId: state.connectedPeerId,
            sdp: answer.sdp
        });
    }
});

ipcMain.on('webrtc-ice-candidate', (_, candidate) => {
    if (state.connectedPeerId) {
        sendToServer({
            type: 'webrtc-ice-candidate',
            targetId: state.connectedPeerId,
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
        });
    }
});

// ===================
// 세션 관리 (Relay Mode for WebRTC)
// ===================
function startSession() {
    // 1. P2P 연결은 Renderer 프로세스에서 직접 수행 (getUserMedia + RTCPeerConnection)
    // Main 프로세스는 시그널링 릴레이만 담당함 (handleServerMessage에서 처리)

    // 2. 화면 캡처 또한 Renderer에서 수행하므로 Main 캡처는 비활성화됨
    // screenCapture.startCapture() removed.

    // 3. 클립보드 동기화 시작 (임시로 서버 릴레이 사용, 추후 DataChannel로 이동 권장)
    clipboardSync.startSync(
        (content) => {
            sendToServer({ type: 'clipboard-sync', content });
        },
        () => state.sessionActive
    );
}

function stopSession() {
    state.sessionActive = false;
    state.connectedPeerId = null;
    // screenCapture.stopCapture(); // Removed - capture now in Renderer
    clipboardSync.stopSync();
}

// ===================
// 파일 전송
// ===================
function handleFileChunk(message) {
    const result = fileTransfer.receiveChunk(message, (progress) => {
        sendToRenderer('file-progress', progress);
    });

    if (result.complete) {
        saveReceivedFile(result.fileName, result.data);
    }
}

async function saveReceivedFile(fileName, base64Data) {
    const { filePath } = await dialog.showSaveDialog(state.mainWindow, {
        defaultPath: path.join(os.homedir(), 'Downloads', fileName),
    });

    if (filePath) {
        if (fileTransfer.saveFile(fileName, base64Data, filePath)) {
            sendToRenderer('file-progress', {
                fileName,
                progress: 100,
                status: 'completed',
                savedPath: filePath
            });
        }
    }
}

// ===================
// IPC 핸들러
// ===================

// 윈도우 컨트롤 (커스텀 타이틀바)
ipcMain.handle('window-minimize', () => {
    state.mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
    if (state.mainWindow?.isMaximized()) {
        state.mainWindow.unmaximize();
    } else {
        state.mainWindow?.maximize();
    }
});

ipcMain.handle('window-close', () => {
    state.mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
    return state.mainWindow?.isMaximized() || false;
});

ipcMain.handle('get-connection-id', () => state.connectionId);
ipcMain.handle('get-password', () => state.password);

ipcMain.handle('refresh-password', () => {
    state.password = generatePassword();
    sendToServer({
        type: 'register',
        connectionId: state.connectionId,
        password: state.password,
        isHost: true,
    });
    return state.password;
});

ipcMain.handle('connect', async (_, targetId, targetPwd) => {
    console.log('[Main] Connecting to:', targetId);

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        connectToServer();
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!state.connectionId) {
        state.connectionId = generateConnectionId();
        sendToServer({
            type: 'register',
            connectionId: state.connectionId,
            password: '',
            isHost: false,
        });
        await new Promise(r => setTimeout(r, 500));
    }

    return sendToServer({
        type: 'connect',
        targetConnectionId: targetId,
        password: targetPwd,
    });
});

ipcMain.handle('disconnect', () => {
    sendToServer({ type: 'disconnect' });
    stopSession();
    return true;
});

// 현재 디스플레이 정보 반환 (화면 공유 시 사용)
ipcMain.handle('get-current-display', () => {
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    return {
        id: currentDisplay.id.toString(),
        label: currentDisplay.label,
        bounds: currentDisplay.bounds
    };
});

// 화면 목록 반환 (WebRTC 캡처 소스용)
ipcMain.handle('get-screens', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen']
            // 썸네일 생성 부하 방지 및 IPC 메시지 최적화를 위해 thumbnailSize 옵션 제외
            // 및 반환 객체에서 thumbnail 제외
        });

        const safeSources = sources.map(source => ({
            id: source.id,
            name: source.name
        }));

        // IPC 직렬화 안전성을 위해 순수 JSON 객체로 변환
        return JSON.parse(JSON.stringify(safeSources));
    } catch (e) {
        console.error('[Main] Failed to get screens:', e);
        return [];
    }
});

ipcMain.on('mouse-event', (_, event) => {
    if (state.sessionActive) {
        sendToServer({ type: 'mouse-event', event });
    }
});

ipcMain.on('keyboard-event', (_, event) => {
    if (state.sessionActive) {
        sendToServer({ type: 'keyboard-event', event });
    }
});

ipcMain.on('chat-message', (_, text) => {
    if (state.sessionActive) {
        sendToServer({ type: 'chat-message', text });
    }
});

ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(state.mainWindow, {
        properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('send-file', async (_, filePath) => {
    return fileTransfer.sendFile(
        filePath,
        (chunk) => sendToServer(chunk),
        (progress) => sendToRenderer('file-progress', progress)
    );
});

// Deprecated IPC handlers (Moved to Renderer)
ipcMain.handle('set-quality', () => true);
ipcMain.handle('set-game-mode', () => true);
ipcMain.handle('get-game-mode', () => false);

ipcMain.handle('get-capture-stats', () => ({ fps: 60, bandwidth: 0 }));
ipcMain.handle('set-auto-quality', () => true);

// 설정 IPC 핸들러
ipcMain.handle('set-framerate', (_, fps) => {
    state.framerate = fps;
    console.log('[Settings] Framerate set to:', fps);
    return true;
});

ipcMain.handle('set-audio-enabled', (_, enabled) => {
    state.audioEnabled = enabled;
    console.log('[Settings] Audio enabled:', enabled);
    return true;
});

ipcMain.handle('set-session-timeout', (_, minutes) => {
    state.sessionTimeout = minutes;
    console.log('[Settings] Session timeout set to:', minutes, 'minutes');
    return true;
});

ipcMain.handle('set-auto-launch', async (_, enabled) => {
    try {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            openAsHidden: true
        });
        console.log('[Settings] Auto launch set to:', enabled);
        return true;
    } catch (e) {
        console.error('[Settings] Failed to set auto launch:', e);
        return false;
    }
});

ipcMain.handle('set-notification-settings', (_, settings) => {
    state.notificationSettings = settings;
    console.log('[Settings] Notification settings:', settings);
    return true;
});

// ===================
// 단축키 관리
// ===================
ipcMain.handle('get-hotkey-presets', () => {
    return hotkeyManager.getPresets();
});

ipcMain.handle('set-hotkey-preset', (_, preset) => {
    return hotkeyManager.setPreset(preset);
});

ipcMain.handle('get-hotkey-mappings', () => {
    return hotkeyManager.getAllMappings();
});

ipcMain.handle('set-custom-hotkey', (_, combo, target) => {
    return hotkeyManager.setCustomMapping(combo, target);
});

ipcMain.handle('remove-custom-hotkey', (_, combo) => {
    return hotkeyManager.removeCustomMapping(combo);
});

ipcMain.handle('export-hotkey-settings', () => {
    return hotkeyManager.exportSettings();
});

ipcMain.handle('import-hotkey-settings', (_, json) => {
    return hotkeyManager.importSettings(json);
});

// ===================
// 자동 업데이트 IPC
// ===================
ipcMain.handle('check-for-updates', async () => {
    try {
        return await autoUpdater.checkForUpdates();
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('download-update', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-update-status', () => {
    return autoUpdater.getStatus();
});

ipcMain.handle('get-app-version', () => {
    return autoUpdater.getCurrentVersion();
});

// ===================
// 인증 IPC
// ===================
ipcMain.handle('auth-login', async (_, email, password) => {
    const result = await desktopAuth.login(email, password);
    if (result.success) {
        planRestrictions.setUser(result.user);
    }
    return result;
});

ipcMain.handle('auth-register', async (_, email, password, name) => {
    const result = await desktopAuth.register(email, password, name);
    if (result.success) {
        planRestrictions.setUser(result.user);
    }
    return result;
});

ipcMain.handle('auth-logout', async () => {
    planRestrictions.clearUser();
    return await desktopAuth.logout();
});

ipcMain.handle('auth-get-state', () => {
    return desktopAuth.getAuthState();
});

ipcMain.handle('auth-get-user', async () => {
    const user = await desktopAuth.getCurrentUser();
    if (user) {
        planRestrictions.setUser(user);
    }
    return user;
});

// QR 코드 로그인용 토큰 설정
ipcMain.handle('set-auth-tokens', async (_, data) => {
    const { accessToken, refreshToken, user } = data;
    // desktopAuth에 토큰 설정
    desktopAuth.setTokens(accessToken, refreshToken, user);
    if (user) {
        planRestrictions.setUser(user);
    }
    // 렌더러에 알림
    if (state.mainWindow) {
        state.mainWindow.webContents.send('oauth-success', { accessToken, refreshToken });
    }
});

// ===================
// 플랜 제한 IPC
// ===================
ipcMain.handle('plan-get-limits', () => {
    return planRestrictions.getPlanLimits();
});

ipcMain.handle('plan-can-use-feature', (_, feature) => {
    return planRestrictions.canUseFeature(feature);
});

ipcMain.handle('plan-can-start-connection', () => {
    return planRestrictions.canStartConnection();
});

ipcMain.handle('plan-start-session', () => {
    return planRestrictions.startSession();
});

ipcMain.handle('plan-end-session', () => {
    return planRestrictions.endSession();
});

ipcMain.handle('plan-get-remaining-time', () => {
    return planRestrictions.getRemainingSessionTime();
});

ipcMain.handle('plan-get-comparison', () => {
    return planRestrictions.getPlanComparison();
});

ipcMain.handle('plan-get-required-upgrades', () => {
    return planRestrictions.getRequiredUpgradeFeatures();
});

ipcMain.handle('plan-should-show-watermark', () => {
    return planRestrictions.shouldShowWatermark();
});

ipcMain.handle('plan-get-max-resolution', () => {
    return planRestrictions.getMaxResolution();
});

// ===================
// 고정 비밀번호 IPC
// ===================
ipcMain.handle('fixed-password-set', (_, password) => {
    fixedPassword.set(password);
    return { success: true };
});

ipcMain.handle('fixed-password-get', () => {
    return fixedPassword.get();
});

ipcMain.handle('fixed-password-is-enabled', () => {
    return fixedPassword.isEnabled();
});

ipcMain.handle('fixed-password-disable', () => {
    fixedPassword.disable();
    return { success: true };
});

ipcMain.handle('fixed-password-remove', () => {
    fixedPassword.remove();
    return { success: true };
});

// ===================
// 신뢰 장치 IPC
// ===================
ipcMain.handle('trusted-devices-get-all', () => {
    return trustedDevices.getAll();
});

ipcMain.handle('trusted-devices-add', (_, device) => {
    return trustedDevices.add(device);
});

ipcMain.handle('trusted-devices-remove', (_, deviceId) => {
    return trustedDevices.remove(deviceId);
});

ipcMain.handle('trusted-devices-is-trusted', (_, deviceId) => {
    return trustedDevices.isTrusted(deviceId);
});

ipcMain.handle('trusted-devices-clear', () => {
    trustedDevices.clear();
    return { success: true };
});

// ===================
// 저장된 연결 IPC
// ===================
ipcMain.handle('saved-connections-get-all', () => {
    // 비밀번호 제외하고 반환
    return savedConnections.getAll().map(c => ({
        id: c.id,
        remoteId: c.remoteId,
        name: c.name,
        savedAt: c.savedAt,
        lastUsed: c.lastUsed,
        hasPassword: !!c.password
    }));
});

ipcMain.handle('saved-connections-save', (_, connection) => {
    return savedConnections.save(connection);
});

ipcMain.handle('saved-connections-get', (_, remoteId) => {
    return savedConnections.get(remoteId);
});

ipcMain.handle('saved-connections-remove', (_, remoteId) => {
    return savedConnections.remove(remoteId);
});

ipcMain.handle('saved-connections-rename', (_, remoteId, newName) => {
    savedConnections.rename(remoteId, newName);
    return { success: true };
});

ipcMain.handle('saved-connections-clear', () => {
    savedConnections.clear();
    return { success: true };
});

ipcMain.handle('open-external', (_, url) => {
    shell.openExternal(url);
});

// 딥링크 설정
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('lunarview', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('lunarview');
}

// 단일 인스턴스 락 확인
const additionalData = { myKey: 'myValue' };
let gotTheLock = app.requestSingleInstanceLock(additionalData);

if (!gotTheLock && !app.isPackaged) {
    // 개발 모드에서 중복 실행 시 캐시 충돌 방지를 위해 별도 경로 사용
    const dev2Path = path.join(app.getPath('userData'), '../dev-2');
    console.log('[Main] Running as second instance in dev mode. Using path:', dev2Path);
    app.setPath('userData', dev2Path);
    gotTheLock = true; // 실행 허용
}

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 누군가 두 번째 인스턴스를 실행하려고 하면 메인 윈도우에 포커스
        if (state.mainWindow) {
            if (state.mainWindow.isMinimized()) state.mainWindow.restore();
            state.mainWindow.focus();
        }

        // 딥링크 처리 (Windows)
        const url = commandLine.find(arg => arg.startsWith('lunarview://'));
        if (url) {
            handleDeepLink(url);
        }
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeepLink(url);
    });

    app.whenReady().then(() => {
        createWindow();

        // 윈도우 (첫 실행) 딥링크 확인
        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('lunarview://'));
            if (url) handleDeepLink(url);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

function handleDeepLink(url) {
    console.log('[Main] Deep link received:', url);
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'auth-callback') {
            const accessToken = urlObj.searchParams.get('accessToken');
            const refreshToken = urlObj.searchParams.get('refreshToken');

            if (accessToken && refreshToken) {
                // 세션 설정
                desktopAuth.setSession(accessToken, refreshToken);

                if (state.mainWindow && !state.mainWindow.webContents.isLoading()) {
                    sendToRenderer('oauth-success', { accessToken, refreshToken });
                    // 메인 윈도우 포커스
                    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
                    state.mainWindow.focus();
                } else {
                    // 윈도우 로드 대기
                    const checkInterval = setInterval(() => {
                        if (state.mainWindow && !state.mainWindow.webContents.isLoading()) {
                            sendToRenderer('oauth-success', { accessToken, refreshToken });
                            if (state.mainWindow.isMinimized()) state.mainWindow.restore();
                            state.mainWindow.focus();
                            clearInterval(checkInterval);
                        }
                    }, 500);
                    // 10초 후 타임아웃
                    setTimeout(() => clearInterval(checkInterval), 10000);
                }
            }
        }
    } catch (e) {
        console.error('Deep link parse error:', e);
    }
}

app.on('window-all-closed', () => {
    disconnectFromServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
