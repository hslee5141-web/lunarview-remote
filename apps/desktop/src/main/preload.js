const { contextBridge, ipcRenderer } = require('electron');

// Renderer 프로세스에 안전하게 노출할 API 정의
contextBridge.exposeInMainWorld('electronAPI', {
    // 연결 관련
    getConnectionId: () => ipcRenderer.invoke('get-connection-id'),
    getPassword: () => ipcRenderer.invoke('get-password'),
    refreshPassword: () => ipcRenderer.invoke('refresh-password'),

    // 원격 연결
    connect: (connectionId, password) =>
        ipcRenderer.invoke('connect', connectionId, password),
    disconnect: () => ipcRenderer.invoke('disconnect'),

    // 화면 캡처
    startScreenCapture: () => ipcRenderer.invoke('start-screen-capture'),
    stopScreenCapture: () => ipcRenderer.invoke('stop-screen-capture'),
    getScreens: () => ipcRenderer.invoke('get-screens'),

    // 입력 제어
    sendMouseEvent: (event) => ipcRenderer.send('mouse-event', event),
    sendKeyboardEvent: (event) => ipcRenderer.send('keyboard-event', event),

    // 파일 전송
    sendFile: (filePath) => ipcRenderer.invoke('send-file', filePath),
    receiveFile: (savePath) => ipcRenderer.invoke('receive-file', savePath),

    // 이벤트 리스너 (cleanup 함수 반환)
    onConnectionStatus: (callback) => {
        const handler = (_, status) => callback(status);
        ipcRenderer.on('connection-status', handler);
        return () => ipcRenderer.removeListener('connection-status', handler);
    },
    onCredentialsUpdated: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('credentials-updated', handler);
        return () => ipcRenderer.removeListener('credentials-updated', handler);
    },
    onScreenFrame: (callback) => {
        const handler = (_, frame) => callback(frame);
        ipcRenderer.on('screen-frame', handler);
        return () => ipcRenderer.removeListener('screen-frame', handler);
    },
    onFileProgress: (callback) => {
        const handler = (_, progress) => callback(progress);
        ipcRenderer.on('file-progress', handler);
        return () => ipcRenderer.removeListener('file-progress', handler);
    },
    onIncomingConnection: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('incoming-connection', handler);
        return () => ipcRenderer.removeListener('incoming-connection', handler);
    },
    onSessionStarted: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('session-started', handler);
        return () => ipcRenderer.removeListener('session-started', handler);
    },
    onSessionEnded: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('session-ended', handler);
        return () => ipcRenderer.removeListener('session-ended', handler);
    },
    onConnectionError: (callback) => {
        const handler = (_, error) => callback(error);
        ipcRenderer.on('connection-error', handler);
        return () => ipcRenderer.removeListener('connection-error', handler);
    },
    onP2PStatus: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('p2p-status', handler);
        return () => ipcRenderer.removeListener('p2p-status', handler);
    },

    // 게임 모드 & 품질
    setGameMode: (enabled) => ipcRenderer.invoke('set-game-mode', enabled),
    getGameMode: () => ipcRenderer.invoke('get-game-mode'),
    setQuality: (quality) => ipcRenderer.invoke('set-quality', quality),
    setAutoQuality: (enabled) => ipcRenderer.invoke('set-auto-quality', enabled),
    getCaptureStats: () => ipcRenderer.invoke('get-capture-stats'),

    // 파일 선택
    selectFile: () => ipcRenderer.invoke('select-file'),

    // 단축키 설정
    getHotkeyPresets: () => ipcRenderer.invoke('get-hotkey-presets'),
    setHotkeyPreset: (preset) => ipcRenderer.invoke('set-hotkey-preset', preset),
    getHotkeyMappings: () => ipcRenderer.invoke('get-hotkey-mappings'),
    setCustomHotkey: (combo, target) => ipcRenderer.invoke('set-custom-hotkey', combo, target),
    removeCustomHotkey: (combo) => ipcRenderer.invoke('remove-custom-hotkey', combo),
    exportHotkeySettings: () => ipcRenderer.invoke('export-hotkey-settings'),
    importHotkeySettings: (json) => ipcRenderer.invoke('import-hotkey-settings', json),

    // 자동 업데이트
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateStatus: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('update-status', handler);
        return () => ipcRenderer.removeListener('update-status', handler);
    },

    // 인증
    authLogin: (email, password) => ipcRenderer.invoke('auth-login', email, password),
    authRegister: (email, password, name) => ipcRenderer.invoke('auth-register', email, password, name),
    authLogout: () => ipcRenderer.invoke('auth-logout'),
    authGetState: () => ipcRenderer.invoke('auth-get-state'),
    authGetUser: () => ipcRenderer.invoke('auth-get-user'),

    // 플랜 제한
    planGetLimits: () => ipcRenderer.invoke('plan-get-limits'),
    planCanUseFeature: (feature) => ipcRenderer.invoke('plan-can-use-feature', feature),
    planCanStartConnection: () => ipcRenderer.invoke('plan-can-start-connection'),
    planStartSession: () => ipcRenderer.invoke('plan-start-session'),
    planEndSession: () => ipcRenderer.invoke('plan-end-session'),
    planGetRemainingTime: () => ipcRenderer.invoke('plan-get-remaining-time'),
    planGetComparison: () => ipcRenderer.invoke('plan-get-comparison'),
    planGetRequiredUpgrades: () => ipcRenderer.invoke('plan-get-required-upgrades'),
    planShouldShowWatermark: () => ipcRenderer.invoke('plan-should-show-watermark'),
    planGetMaxResolution: () => ipcRenderer.invoke('plan-get-max-resolution'),

    // 고정 비밀번호
    fixedPasswordSet: (password) => ipcRenderer.invoke('fixed-password-set', password),
    fixedPasswordGet: () => ipcRenderer.invoke('fixed-password-get'),
    fixedPasswordIsEnabled: () => ipcRenderer.invoke('fixed-password-is-enabled'),
    fixedPasswordDisable: () => ipcRenderer.invoke('fixed-password-disable'),
    fixedPasswordRemove: () => ipcRenderer.invoke('fixed-password-remove'),

    // 신뢰 장치
    trustedDevicesGetAll: () => ipcRenderer.invoke('trusted-devices-get-all'),
    trustedDevicesAdd: (device) => ipcRenderer.invoke('trusted-devices-add', device),
    trustedDevicesRemove: (deviceId) => ipcRenderer.invoke('trusted-devices-remove', deviceId),
    trustedDevicesIsTrusted: (deviceId) => ipcRenderer.invoke('trusted-devices-is-trusted', deviceId),
    trustedDevicesClear: () => ipcRenderer.invoke('trusted-devices-clear'),

    // 저장된 연결
    savedConnectionsGetAll: () => ipcRenderer.invoke('saved-connections-get-all'),
    savedConnectionsSave: (connection) => ipcRenderer.invoke('saved-connections-save', connection),
    savedConnectionsGet: (remoteId) => ipcRenderer.invoke('saved-connections-get', remoteId),
    savedConnectionsRemove: (remoteId) => ipcRenderer.invoke('saved-connections-remove', remoteId),
    savedConnectionsRename: (remoteId, name) => ipcRenderer.invoke('saved-connections-rename', remoteId, name),
    savedConnectionsClear: () => ipcRenderer.invoke('saved-connections-clear'),

    // 윈도우 컨트롤 (커스텀 타이틀바용)
    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => ipcRenderer.invoke('window-maximize'),
    windowClose: () => ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

    // 외부 링크 열기
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
