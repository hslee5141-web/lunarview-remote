/**
 * Shared Types
 * 공통으로 사용되는 타입 정의
 */

// ================================
// 연결 관련 타입
// ================================

export interface ConnectionInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    password?: string;
}

export type RemoteConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'authenticating'
    | 'session-active'
    | 'error';

export interface SessionInfo {
    id: string;
    hostId: string;
    clientId: string;
    startTime: number;
    isHost: boolean;
}

// ================================
// 화면/입력 타입
// ================================

export interface ScreenFrame {
    data: ArrayBuffer | string;
    width: number;
    height: number;
    timestamp: number;
    isKeyFrame: boolean;
}

export interface MouseEvent {
    type: 'move' | 'down' | 'up' | 'wheel';
    x: number;
    y: number;
    button?: number;
    deltaX?: number;
    deltaY?: number;
}

export interface KeyboardEvent {
    type: 'down' | 'up';
    key: string;
    modifiers?: string[];
}

// ================================
// 품질 설정 타입
// ================================

export type QualityLevel = 'auto' | 'high' | 'medium' | 'low';

export interface QualitySettings {
    resolution: { width: number; height: number };
    frameRate: number;
    bitrate: number;
}

export const QUALITY_PRESETS: Record<Exclude<QualityLevel, 'auto'>, QualitySettings> = {
    high: { resolution: { width: 1920, height: 1080 }, frameRate: 60, bitrate: 5000000 },
    medium: { resolution: { width: 1280, height: 720 }, frameRate: 30, bitrate: 2500000 },
    low: { resolution: { width: 854, height: 480 }, frameRate: 15, bitrate: 1000000 },
};

// ================================
// 사용자/권한 타입
// ================================

export interface User {
    id: string;
    name: string;
    avatar?: string;
    role: 'host' | 'viewer' | 'controller';
}

export interface Permission {
    canControl: boolean;
    canViewScreen: boolean;
    canTransferFiles: boolean;
    canUseClipboard: boolean;
    canChat: boolean;
}

// ================================
// 파일 전송 타입
// ================================

export interface FileTransfer {
    id: string;
    name: string;
    size: number;
    progress: number;
    status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled';
    direction: 'upload' | 'download';
}

// ================================
// 알림 타입
// ================================

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: number;
    read: boolean;
}

// ================================
// 유틸리티 타입
// ================================

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Callback<T = void> = (data: T) => void;
export type AsyncCallback<T = void> = (data: T) => Promise<void>;

export interface Disposable {
    dispose: () => void;
}

export interface Serializable {
    toJSON: () => object;
    fromJSON: (json: object) => void;
}
