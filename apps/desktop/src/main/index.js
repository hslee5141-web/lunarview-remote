/**
 * Remote Desktop - Main Process (Refactored)
 * 모듈화된 메인 프로세스
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

// 모듈 로드
const inputController = require('./modules/inputController');
const screenCapture = require('./modules/screenCapture');
const clipboardSync = require('./modules/clipboardSync');
const fileTransfer = require('./modules/fileTransfer');
const hotkeyManager = require('./modules/hotkeyManager');
const { WebRTCManager } = require('./modules/webrtcManager');
const autoUpdater = require('./modules/autoUpdater');
const desktopAuth = require('./modules/desktopAuth');
const planRestrictions = require('./modules/planRestrictions');
const { fixedPassword, trustedDevices, savedConnections } = require('./modules/trustedDevices');

// ===================
// 환경 설정
// ===================
// 설정 로드
const APP_CONFIG = require('./config');

// ===================
// 환경 설정
// ===================
const CONFIG = {
    serverUrl: APP_CONFIG.WS_URL,
    reconnectInterval: APP_CONFIG.RECONNECT_INTERVAL,
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
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send(channel, data);
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
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    if (process.env.NODE_ENV !== 'production') {
        state.mainWindow.loadURL('http://localhost:5173');
        state.mainWindow.webContents.openDevTools();
    } else {
        state.mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
    }

    state.mainWindow.on('closed', () => {
        state.mainWindow = null;
        disconnectFromServer();
    });

    // 서버 연결
    setTimeout(connectToServer, 1000);

    // 자동 업데이트 초기화
    autoUpdater.init(state.mainWindow, (event, data) => {
        sendToRenderer('update-status', { event, ...data });
    });
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

        // WebRTC 시그널링
        case 'webrtc-offer':
            handleWebRTCOffer(message);
            break;

        case 'webrtc-answer':
            handleWebRTCAnswer(message);
            break;

        case 'webrtc-ice-candidate':
            handleWebRTCIceCandidate(message);
            break;

        case 'pong':
            break;
    }
}

// ===================
// WebRTC P2P
// ===================
async function initWebRTC(isInitiator) {
    if (state.webrtc) {
        state.webrtc.close();
    }

    state.webrtc = new WebRTCManager();

    state.webrtc.onIceCandidate = (candidate) => {
        sendToServer({
            type: 'webrtc-ice-candidate',
            candidate
        });
    };

    state.webrtc.onConnectionStateChange = (connectionState) => {
        if (connectionState === 'connected') {
            console.log('[Main] P2P connected!');
            state.p2pConnected = true;
            sendToRenderer('p2p-status', { connected: true });
        } else if (connectionState === 'failed' || connectionState === 'disconnected') {
            console.log('[Main] P2P failed, using relay');
            state.p2pConnected = false;
            sendToRenderer('p2p-status', { connected: false });
        }
    };

    state.webrtc.onDataChannel = (event, data) => {
        if (event === 'message') {
            handleP2PMessage(data);
        }
    };

    if (isInitiator) {
        state.webrtc.createDataChannel();
        const offer = await state.webrtc.createOffer();
        sendToServer({
            type: 'webrtc-offer',
            offer
        });
    }
}

async function handleWebRTCOffer(message) {
    if (!state.useP2P) return;

    await initWebRTC(false);
    const answer = await state.webrtc.createAnswer(message.offer);
    sendToServer({
        type: 'webrtc-answer',
        answer
    });
}

async function handleWebRTCAnswer(message) {
    if (state.webrtc) {
        await state.webrtc.handleAnswer(message.answer);
    }
}

async function handleWebRTCIceCandidate(message) {
    if (state.webrtc) {
        await state.webrtc.addIceCandidate(message.candidate);
    }
}

function handleP2PMessage(data) {
    try {
        const message = JSON.parse(data);
        switch (message.type) {
            case 'screen-frame':
                sendToRenderer('screen-frame', message.frame);
                break;
            case 'mouse-event':
                inputController.handleMouseEvent(message.event);
                break;
            case 'keyboard-event':
                inputController.handleKeyboardEvent(message.event);
                break;
        }
    } catch (e) {
        // 바이너리 데이터 (화면 프레임)
        sendToRenderer('screen-frame', data);
    }
}

// P2P 또는 서버로 전송
function sendData(message) {
    // P2P 연결되어 있으면 P2P로 전송
    if (state.p2pConnected && state.webrtc) {
        return state.webrtc.send(JSON.stringify(message));
    }
    // 아니면 서버 릴레이
    return sendToServer(message);
}

// ===================
// 세션 관리
// ===================
function startSession() {
    // P2P 연결 시도 (호스트)
    if (state.useP2P && state.isHost) {
        initWebRTC(true).catch(err => {
            console.error('[Main] WebRTC init failed:', err);
        });
    }

    // 화면 캡처 시작
    screenCapture.startCapture(
        (frameData) => {
            // P2P 연결되면 P2P로, 아니면 서버 릴레이
            sendData({ type: 'screen-frame', frame: frameData });
        },
        () => state.sessionActive
    );

    // 클립보드 동기화 시작
    clipboardSync.startSync(
        (content) => {
            sendData({ type: 'clipboard-sync', content });
        },
        () => state.sessionActive
    );
}

function stopSession() {
    state.sessionActive = false;
    state.connectedPeerId = null;
    screenCapture.stopCapture();
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

ipcMain.handle('get-screens', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const displays = screen.getAllDisplays();
    return sources.map((source, i) => ({
        id: source.id,
        name: source.name,
        width: displays[i]?.size.width || 0,
        height: displays[i]?.size.height || 0,
    }));
});

ipcMain.handle('set-quality', (_, quality) => {
    return screenCapture.setQuality(quality);
});

ipcMain.handle('set-game-mode', (_, enabled) => {
    return screenCapture.setGameMode(enabled);
});

ipcMain.handle('get-game-mode', () => {
    return screenCapture.getGameMode();
});

ipcMain.handle('get-capture-stats', () => {
    return screenCapture.getStats();
});

ipcMain.handle('set-auto-quality', (_, enabled) => {
    return screenCapture.setAutoQuality(enabled);
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

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    disconnectFromServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
