/**
 * Remote Session - Viewer Mode
 * 뷰어 측 원격 세션 관리
 */

import { ipcMain, BrowserWindow } from 'electron';

// Stub implementations
class ConnectionManager {
    private onStateChange: ((state: string, data?: any) => void) | null = null;
    private onMessage: ((type: string, data: any) => void) | null = null;

    async connect(config: any): Promise<void> { console.log('Connecting...'); }
    connectToHost(targetId: string, password: string): void { console.log('Connecting to host:', targetId); }
    disconnect(): void { }
    sendSignaling(type: string, data: any): void { }
    setStateChangeHandler(fn: (state: string, data?: any) => void): void { this.onStateChange = fn; }
    setMessageHandler(fn: (type: string, data: any) => void): void { this.onMessage = fn; }
}

class WebRTCManager {
    onIceCandidate: ((candidate: any) => void) | null = null;
    private onStateChange: ((state: string) => void) | null = null;
    private onMessage: ((data: any) => void) | null = null;

    async createOffer(): Promise<any> { return { type: 'offer', sdp: '' }; }
    async handleAnswer(answer: any): Promise<void> { }
    async addIceCandidate(candidate: any): Promise<void> { }
    send(data: string): boolean { return true; }
    disconnect(): void { }
    setStateChangeHandler(fn: (state: string) => void): void { this.onStateChange = fn; }
    setMessageHandler(fn: (data: any) => void): void { this.onMessage = fn; }
}

let connectionManagerInstance: ConnectionManager | null = null;
let webrtcManagerInstance: WebRTCManager | null = null;

function getConnectionManager(): ConnectionManager {
    if (!connectionManagerInstance) connectionManagerInstance = new ConnectionManager();
    return connectionManagerInstance;
}

function getWebRTCManager(): WebRTCManager {
    if (!webrtcManagerInstance) webrtcManagerInstance = new WebRTCManager();
    return webrtcManagerInstance;
}

function resetWebRTCManager(): void {
    webrtcManagerInstance?.disconnect();
    webrtcManagerInstance = null;
}

const APP_CONFIG = require('./config');
const SERVER_URL = APP_CONFIG.WS_URL;

interface ViewerSessionConfig {
    targetConnectionId: string;
    password: string;
}

class ViewerSession {
    private connectionManager: ConnectionManager;
    private webrtcManager: WebRTCManager;
    private isActive = false;
    private config: ViewerSessionConfig;
    private mainWindow: BrowserWindow | null = null;
    private myConnectionId: string;

    constructor(config: ViewerSessionConfig) {
        this.config = config;
        this.myConnectionId = this.generateConnectionId();
        this.connectionManager = getConnectionManager();
        this.webrtcManager = getWebRTCManager();
    }

    /**
     * 뷰어 세션 시작 및 호스트에 연결
     */
    async connect(mainWindow: BrowserWindow): Promise<void> {
        this.mainWindow = mainWindow;

        // 시그널링 서버 연결
        await this.connectionManager.connect({
            serverUrl: SERVER_URL,
            connectionId: this.myConnectionId,
            password: '',
            isHost: false,
        });

        // 상태 변경 핸들러
        this.connectionManager.setStateChangeHandler((state, data) => {
            this.sendToRenderer('connection-status', state);

            if (state === 'session-active') {
                this.initiateWebRTC();
            } else if (state === 'error') {
                this.sendToRenderer('connection-error', data?.error || 'Connection failed');
            }
        });

        // 메시지 핸들러
        this.connectionManager.setMessageHandler((type, data) => {
            this.handleSignalingMessage(type, data);
        });

        // WebRTC 핸들러
        this.webrtcManager.onIceCandidate = (candidate) => {
            this.connectionManager.sendSignaling('ice-candidate', { candidate });
        };

        this.webrtcManager.setStateChangeHandler((state) => {
            this.sendToRenderer('webrtc-state', state);
        });

        this.webrtcManager.setMessageHandler((data) => {
            this.handleRemoteFrame(data);
        });

        // 호스트에 연결 요청
        this.connectionManager.connectToHost(
            this.config.targetConnectionId,
            this.config.password
        );

        this.isActive = true;
    }

    /**
     * 연결 해제
     */
    disconnect(): void {
        resetWebRTCManager();
        this.connectionManager.disconnect();
        this.isActive = false;
        this.sendToRenderer('disconnected', {});
    }

    /**
     * 마우스 입력 전송
     */
    sendMouseInput(event: any): void {
        this.webrtcManager.send(JSON.stringify({
            type: 'mouse',
            ...event,
        }));
    }

    /**
     * 키보드 입력 전송
     */
    sendKeyboardInput(event: any): void {
        this.webrtcManager.send(JSON.stringify({
            type: 'keyboard',
            ...event,
        }));
    }

    /**
     * 클립보드 동기화
     */
    sendClipboard(text: string): void {
        this.webrtcManager.send(JSON.stringify({
            type: 'clipboard',
            text,
        }));
    }

    // Private methods
    private generateConnectionId(): string {
        return Math.random().toString().slice(2, 11);
    }

    private async initiateWebRTC(): Promise<void> {
        try {
            // Offer 생성 및 전송
            const offer = await this.webrtcManager.createOffer();
            this.connectionManager.sendSignaling('offer', { offer });
        } catch (error) {
            console.error('WebRTC offer creation failed:', error);
            this.sendToRenderer('connection-error', 'Failed to establish P2P connection');
        }
    }

    private async handleSignalingMessage(type: string, data: any): Promise<void> {
        switch (type) {
            case 'answer':
                await this.webrtcManager.handleAnswer(data.answer);
                break;

            case 'ice-candidate':
                await this.webrtcManager.addIceCandidate(data.candidate);
                break;

            case 'disconnected':
                this.sendToRenderer('session-ended', data);
                break;
        }
    }

    private handleRemoteFrame(data: ArrayBuffer | string): void {
        if (data instanceof ArrayBuffer) {
            // 바이너리 프레임 데이터
            this.sendToRenderer('screen-frame', data);
        }
    }

    private sendToRenderer(channel: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

// IPC 핸들러 등록
let viewerSession: ViewerSession | null = null;

export function registerViewerSessionHandlers(mainWindow: BrowserWindow): void {
    ipcMain.handle('connect', async (_, targetConnectionId: string, password: string) => {
        try {
            viewerSession = new ViewerSession({ targetConnectionId, password });
            await viewerSession.connect(mainWindow);
            return true;
        } catch (error: any) {
            console.error('Connection failed:', error);
            return false;
        }
    });

    ipcMain.handle('disconnect', async () => {
        if (viewerSession) {
            viewerSession.disconnect();
            viewerSession = null;
        }
    });

    ipcMain.on('mouse-event', (_, event) => {
        if (viewerSession) {
            viewerSession.sendMouseInput(event);
        }
    });

    ipcMain.on('keyboard-event', (_, event) => {
        if (viewerSession) {
            viewerSession.sendKeyboardInput(event);
        }
    });

    ipcMain.on('clipboard-sync', (_, text: string) => {
        if (viewerSession) {
            viewerSession.sendClipboard(text);
        }
    });
}
