/**
 * Remote Desktop Protocol - Message Types
 * 원격 데스크톱 통신을 위한 메시지 타입 정의
 */

// 패킷 타입 enum
export enum PacketType {
    SCREEN_FRAME = 0x01,
    MOUSE_EVENT = 0x02,
    KEYBOARD_EVENT = 0x03,
    CLIPBOARD_DATA = 0x04,
    FILE_TRANSFER = 0x05,
    CONTROL_COMMAND = 0x06,
    AUDIO_DATA = 0x07,
    HEARTBEAT = 0x08,
    HANDSHAKE = 0x09,
    AUTH_REQUEST = 0x0a,
    AUTH_RESPONSE = 0x0b,
}

// 기본 패킷 인터페이스
export interface Packet {
    type: PacketType;
    timestamp: number;
    payload: Uint8Array;
}

// 마우스 이벤트
export interface MouseEvent {
    type: 'move' | 'down' | 'up' | 'scroll';
    x: number;
    y: number;
    button?: 0 | 1 | 2; // left, middle, right
    deltaX?: number;
    deltaY?: number;
}

// 키보드 이벤트
export interface KeyboardEvent {
    type: 'down' | 'up';
    key: string;
    keyCode: number;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}

// 화면 프레임
export interface ScreenFrame {
    width: number;
    height: number;
    format: 'jpeg' | 'h264' | 'vp9';
    quality: number;
    data: Uint8Array;
    isKeyFrame: boolean;
}

// 파일 전송 메시지
export interface FileTransferMessage {
    action: 'start' | 'chunk' | 'complete' | 'cancel' | 'error';
    fileId: string;
    fileName?: string;
    fileSize?: number;
    chunkIndex?: number;
    totalChunks?: number;
    data?: Uint8Array;
    error?: string;
}

// 핸드쉐이크 메시지
export interface HandshakeMessage {
    version: string;
    clientId: string;
    publicKey: string;
    capabilities: string[];
}

// 인증 요청
export interface AuthRequest {
    connectionId: string;
    encryptedPassword: string;
    timestamp: number;
}

// 인증 응답
export interface AuthResponse {
    success: boolean;
    sessionId?: string;
    sessionKey?: string;
    error?: string;
}

// 제어 명령
export interface ControlCommand {
    command: 'disconnect' | 'pause' | 'resume' | 'quality' | 'audio';
    params?: Record<string, any>;
}

// 연결 상태
export enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    AUTHENTICATING = 'authenticating',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    ERROR = 'error',
}

// 연결 정보
export interface ConnectionInfo {
    connectionId: string;
    sessionId: string;
    state: ConnectionState;
    remoteAddress: string;
    connectedAt: Date;
    latency: number;
}
