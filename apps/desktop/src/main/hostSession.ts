/**
 * Remote Session - Host Mode
 * 호스트 측 원격 세션 관리
 */

import { ipcMain, desktopCapturer, BrowserWindow } from 'electron';

// Stub implementations (실제 구현은 packages에 있음)
class ConnectionManager {
    private ws: WebSocket | null = null;
    private onStateChange: ((state: string, data?: any) => void) | null = null;
    private onMessage: ((type: string, data: any) => void) | null = null;

    async connect(config: any): Promise<void> {
        console.log('ConnectionManager: connecting to', config.serverUrl);
    }
    disconnect(): void { this.ws?.close(); }
    sendSignaling(type: string, data: any): void { console.log('Signaling:', type); }
    setStateChangeHandler(fn: (state: string, data?: any) => void): void { this.onStateChange = fn; }
    setMessageHandler(fn: (type: string, data: any) => void): void { this.onMessage = fn; }
}

class WebRTCManager {
    onIceCandidate: ((candidate: any) => void) | null = null;
    private onStateChange: ((state: string) => void) | null = null;
    private onMessage: ((data: any) => void) | null = null;

    async handleOffer(offer: any): Promise<any> { return { type: 'answer', sdp: '' }; }
    async addIceCandidate(candidate: any): Promise<void> { }
    sendBinary(data: Uint8Array): boolean { return true; }
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

const APP_CONFIG = require('./config');
const SERVER_URL = APP_CONFIG.WS_URL;

interface HostSessionConfig {
    connectionId: string;
    password: string;
    allowControl: boolean;
    allowFileTransfer: boolean;
    quality: 'high' | 'medium' | 'low';
}

class HostSession {
    private connectionManager: ConnectionManager;
    private webrtcManager: WebRTCManager;
    private isActive = false;
    private captureInterval: NodeJS.Timeout | null = null;
    private config: HostSessionConfig;
    private mainWindow: BrowserWindow | null = null;

    constructor(config: HostSessionConfig) {
        this.config = config;
        this.connectionManager = getConnectionManager();
        this.webrtcManager = getWebRTCManager();
    }

    /**
     * 호스트 세션 시작
     */
    async start(mainWindow: BrowserWindow): Promise<void> {
        this.mainWindow = mainWindow;

        // 시그널링 서버 연결
        await this.connectionManager.connect({
            serverUrl: SERVER_URL,
            connectionId: this.config.connectionId,
            password: this.config.password,
            isHost: true,
        });

        // 메시지 핸들러 설정
        this.connectionManager.setMessageHandler((type, data) => {
            this.handleSignalingMessage(type, data);
        });

        this.connectionManager.setStateChangeHandler((state, data) => {
            this.sendToRenderer('connection-status', state);

            if (state === 'session-active') {
                this.onSessionStart();
            }
        });

        // WebRTC 핸들러 설정
        this.webrtcManager.onIceCandidate = (candidate) => {
            this.connectionManager.sendSignaling('ice-candidate', { candidate });
        };

        this.webrtcManager.setStateChangeHandler((state) => {
            if (state === 'connected') {
                this.startScreenCapture();
            }
        });

        this.webrtcManager.setMessageHandler((data) => {
            this.handleRemoteInput(data);
        });

        this.isActive = true;
    }

    /**
     * 세션 종료
     */
    stop(): void {
        this.stopScreenCapture();
        this.webrtcManager.disconnect();
        this.connectionManager.disconnect();
        this.isActive = false;
    }

    /**
     * 비밀번호 변경
     */
    updatePassword(newPassword: string): void {
        this.config.password = newPassword;
        // 서버에 알림 (재등록 필요)
    }

    // Private methods
    private async handleSignalingMessage(type: string, data: any): Promise<void> {
        switch (type) {
            case 'incoming-connection':
                // 원격 연결 요청 수락
                this.sendToRenderer('incoming-connection', data);
                break;

            case 'offer':
                // WebRTC Offer 수신 → Answer 생성
                const answer = await this.webrtcManager.handleOffer(data.offer);
                this.connectionManager.sendSignaling('answer', { answer });
                break;

            case 'ice-candidate':
                await this.webrtcManager.addIceCandidate(data.candidate);
                break;

            case 'disconnected':
                this.stopScreenCapture();
                this.sendToRenderer('session-ended', data);
                break;
        }
    }

    private onSessionStart(): void {
        // 세션 시작 시 초기화
        this.sendToRenderer('session-started', {
            connectionId: this.config.connectionId,
        });
    }

    private startScreenCapture(): void {
        const qualitySettings = {
            high: { width: 1920, height: 1080, fps: 30, quality: 90 },
            medium: { width: 1280, height: 720, fps: 25, quality: 70 },
            low: { width: 854, height: 480, fps: 15, quality: 50 },
        };

        const settings = qualitySettings[this.config.quality];
        const interval = 1000 / settings.fps;

        this.captureInterval = setInterval(async () => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: { width: settings.width, height: settings.height },
                });

                if (sources.length > 0) {
                    const frame = sources[0].thumbnail.toJPEG(settings.quality);
                    this.webrtcManager.sendBinary(new Uint8Array(frame));
                }
            } catch (error) {
                console.error('Screen capture error:', error);
            }
        }, interval);
    }

    private stopScreenCapture(): void {
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
    }

    private handleRemoteInput(data: ArrayBuffer | string): void {
        if (!this.config.allowControl) return;

        try {
            const input = typeof data === 'string' ? JSON.parse(data) : JSON.parse(new TextDecoder().decode(data as ArrayBuffer));

            switch (input.type) {
                case 'mouse':
                    this.handleMouseInput(input);
                    break;
                case 'keyboard':
                    this.handleKeyboardInput(input);
                    break;
                case 'clipboard':
                    this.handleClipboardInput(input);
                    break;
            }
        } catch (error) {
            console.error('Input parsing error:', error);
        }
    }

    private handleMouseInput(input: any): void {
        // 마우스 입력 처리 (robotjs 필요)
        console.log('Mouse input:', input);
    }

    private handleKeyboardInput(input: any): void {
        // 키보드 입력 처리 (robotjs 필요)
        console.log('Keyboard input:', input);
    }

    private handleClipboardInput(input: any): void {
        // 클립보드 동기화
        console.log('Clipboard input:', input);
    }

    private sendToRenderer(channel: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

// IPC 핸들러 등록
let hostSession: HostSession | null = null;

export function registerHostSessionHandlers(mainWindow: BrowserWindow): void {
    ipcMain.handle('start-host-session', async (_, config: HostSessionConfig) => {
        try {
            hostSession = new HostSession(config);
            await hostSession.start(mainWindow);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-host-session', async () => {
        if (hostSession) {
            hostSession.stop();
            hostSession = null;
        }
        return { success: true };
    });

    ipcMain.handle('update-host-password', async (_, newPassword: string) => {
        if (hostSession) {
            hostSession.updatePassword(newPassword);
        }
        return { success: true };
    });
}
