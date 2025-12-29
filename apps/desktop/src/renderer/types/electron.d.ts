/**
 * Electron API Type Definitions
 * preload.js에서 노출된 API의 타입 정의
 */

export interface ElectronAPI {
    // 연결 관련
    getConnectionId: () => Promise<string>;
    getPassword: () => Promise<string>;
    refreshPassword: () => Promise<string>;

    // 원격 연결
    connect: (connectionId: string, password: string) => Promise<boolean>;
    disconnect: () => Promise<void>;

    // 화면 캡처
    startScreenCapture: () => Promise<void>;
    stopScreenCapture: () => Promise<void>;
    getScreens: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;

    // 입력 제어
    sendMouseEvent: (event: MouseEventData) => void;
    sendKeyboardEvent: (event: KeyboardEventData) => void;

    // 파일 전송
    sendFile: (filePath: string) => Promise<boolean>;
    receiveFile: (savePath: string) => Promise<boolean>;
    selectFile: () => Promise<{ name: string; path: string; size: string } | null>;

    // 이벤트 리스너 (cleanup 함수 반환)
    onConnectionStatus: (callback: (status: string) => void) => (() => void) | void;
    onCredentialsUpdated: (callback: (data: { connectionId: string; password: string }) => void) => (() => void) | void;
    onScreenFrame: (callback: (frame: ArrayBuffer) => void) => (() => void) | void;
    onFileProgress: (callback: (progress: number) => void) => (() => void) | void;
    onIncomingConnection: (callback: (data: { peerId: string }) => void) => (() => void) | void;
    onSessionStarted: (callback: (data: { peerId: string; isViewer: boolean }) => void) => (() => void) | void;
    onSessionEnded: (callback: (data?: any) => void) => (() => void) | void;
    onConnectionError: (callback: (error: string) => void) => (() => void) | void;
    onP2PStatus?: (callback: (data: { connected: boolean }) => void) => (() => void) | void;

    // 게임 모드 & 품질
    setGameMode: (enabled: boolean) => Promise<void>;
    getGameMode: () => Promise<boolean>;
    setQuality: (quality: 'low' | 'medium' | 'high' | 'auto') => Promise<void>;
    setAutoQuality: (enabled: boolean) => Promise<void>;
    getCaptureStats: () => Promise<{ fps: number; bitrate: number; latency: number }>;

    // 단축키 설정
    getHotkeyPresets: () => Promise<string[]>;
    setHotkeyPreset: (preset: string) => Promise<void>;
    getHotkeyMappings: () => Promise<Record<string, string>>;
    setCustomHotkey: (combo: string, target: string) => Promise<void>;
    removeCustomHotkey: (combo: string) => Promise<void>;
    exportHotkeySettings: () => Promise<string>;
    importHotkeySettings: (json: string) => Promise<void>;

    // 자동 업데이트
    checkForUpdates: () => Promise<any>;
    downloadUpdate: () => Promise<{ success?: boolean; error?: string }>;
    installUpdate: () => Promise<void>;
    getUpdateStatus: () => Promise<any>;
    getAppVersion: () => Promise<string>;
    onUpdateStatus: (callback: (data: any) => void) => (() => void) | void;

    // 인증
    authLogin: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
    authRegister: (email: string, password: string, name: string) => Promise<{ success: boolean; user?: any; error?: string }>;
    authLogout: () => Promise<{ success: boolean }>;
    authGetState: () => Promise<{ isLoggedIn: boolean; user: any }>;
    authGetUser: () => Promise<any>;

    // 플랜 제한
    planGetLimits: () => Promise<any>;
    planCanUseFeature: (feature: string) => Promise<boolean>;
    planCanStartConnection: () => Promise<{ allowed: boolean; reason?: string; message?: string }>;
    planStartSession: () => Promise<any>;
    planEndSession: () => Promise<void>;
    planGetRemainingTime: () => Promise<number | null>;
    planGetComparison: () => Promise<any[]>;
    planGetRequiredUpgrades: () => Promise<string[]>;
    planShouldShowWatermark: () => Promise<boolean>;
    planGetMaxResolution: () => Promise<number>;

    // 고정 비밀번호
    fixedPasswordSet: (password: string) => Promise<{ success: boolean }>;
    fixedPasswordGet: () => Promise<string | null>;
    fixedPasswordIsEnabled: () => Promise<boolean>;
    fixedPasswordDisable: () => Promise<{ success: boolean }>;
    fixedPasswordRemove: () => Promise<{ success: boolean }>;

    // 신뢰 장치
    trustedDevicesGetAll: () => Promise<any[]>;
    trustedDevicesAdd: (device: { deviceId: string; name?: string }) => Promise<any>;
    trustedDevicesRemove: (deviceId: string) => Promise<any[]>;
    trustedDevicesIsTrusted: (deviceId: string) => Promise<boolean>;
    trustedDevicesClear: () => Promise<{ success: boolean }>;

    // 저장된 연결
    savedConnectionsGetAll: () => Promise<any[]>;
    savedConnectionsSave: (connection: { remoteId: string; password: string; name?: string }) => Promise<any>;
    savedConnectionsGet: (remoteId: string) => Promise<{ remoteId: string; password: string; name: string } | null>;
    savedConnectionsRemove: (remoteId: string) => Promise<any[]>;
    savedConnectionsRename: (remoteId: string, name: string) => Promise<{ success: boolean }>;
    savedConnectionsClear: () => Promise<{ success: boolean }>;

    // 윈도우 컨트롤 (커스텀 타이틀바용)
    windowMinimize: () => Promise<void>;
    windowMaximize: () => Promise<void>;
    windowClose: () => Promise<void>;
    windowIsMaximized: () => Promise<boolean>;
}

export interface MouseEventData {
    type: 'move' | 'click' | 'scroll';
    x: number;
    y: number;
    button?: 'left' | 'right' | 'middle';
    delta?: number;
}

export interface KeyboardEventData {
    type: 'keydown' | 'keyup';
    key: string;
    modifiers?: {
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
        meta?: boolean;
    };
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { };
