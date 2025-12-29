/**
 * Jest Setup File
 * 테스트 환경 설정
 */

// Web Crypto API 폴리필 (Node.js 환경)
import { Crypto } from '@peculiar/webcrypto';

if (typeof globalThis.crypto === 'undefined') {
    (globalThis as any).crypto = new Crypto();
}

// TextEncoder/TextDecoder 폴리필
if (typeof globalThis.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util');
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;
}

// Electron 모듈 모킹
jest.mock('electron', () => ({
    app: {
        whenReady: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        quit: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
        loadURL: jest.fn(),
        loadFile: jest.fn(),
        on: jest.fn(),
        webContents: {
            send: jest.fn(),
            openDevTools: jest.fn(),
        },
        isDestroyed: jest.fn().mockReturnValue(false),
    })),
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn(),
    },
    ipcRenderer: {
        invoke: jest.fn(),
        on: jest.fn(),
        send: jest.fn(),
    },
    clipboard: {
        readText: jest.fn().mockReturnValue(''),
        writeText: jest.fn(),
        readHTML: jest.fn().mockReturnValue(''),
        writeHTML: jest.fn(),
        readImage: jest.fn().mockReturnValue({ isEmpty: () => true }),
        writeImage: jest.fn(),
    },
    desktopCapturer: {
        getSources: jest.fn().mockResolvedValue([]),
    },
    screen: {
        getAllDisplays: jest.fn().mockReturnValue([{ size: { width: 1920, height: 1080 } }]),
    },
    nativeImage: {
        createFromBuffer: jest.fn(),
    },
    dialog: {
        showOpenDialog: jest.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    },
}));

// WebSocket 모킹
class MockWebSocket {
    static OPEN = 1;
    readyState = MockWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((error: any) => void) | null = null;
    onmessage: ((event: any) => void) | null = null;

    constructor(url: string) {
        setTimeout(() => this.onopen?.(), 0);
    }

    send(data: string) { }
    close() {
        this.onclose?.();
    }
}

(globalThis as any).WebSocket = MockWebSocket;

// RTCPeerConnection 모킹
class MockRTCPeerConnection {
    localDescription: any = null;
    remoteDescription: any = null;
    connectionState = 'new';

    async createOffer() {
        return { type: 'offer', sdp: 'mock-sdp' };
    }

    async createAnswer() {
        return { type: 'answer', sdp: 'mock-sdp' };
    }

    async setLocalDescription(desc: any) {
        this.localDescription = desc;
    }

    async setRemoteDescription(desc: any) {
        this.remoteDescription = desc;
    }

    async addIceCandidate(candidate: any) { }

    createDataChannel(label: string) {
        return {
            label,
            readyState: 'open',
            send: jest.fn(),
            close: jest.fn(),
        };
    }

    close() { }
}

(globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as any).RTCSessionDescription = class {
    constructor(public desc: any) { }
};
(globalThis as any).RTCIceCandidate = class {
    constructor(public candidate: any) { }
    toJSON() { return this.candidate; }
};

// 콘솔 에러 억제 (테스트 시)
const originalError = console.error;
console.error = (...args) => {
    if (args[0]?.includes?.('Warning:')) return;
    originalError.apply(console, args);
};
