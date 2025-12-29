/**
 * Connection Manager
 * 시그널링 서버 연결 및 세션 관리
 */

export interface ConnectionConfig {
    serverUrl: string;
    connectionId: string;
    password: string;
    isHost: boolean;
}

export type ConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'authenticating'
    | 'session-active'
    | 'error';

type StateChangeHandler = (state: ConnectionState, data?: any) => void;
type MessageHandler = (type: string, data: any) => void;

export class ConnectionManager {
    private ws: WebSocket | null = null;
    private config: ConnectionConfig | null = null;
    private state: ConnectionState = 'disconnected';
    private onStateChange: StateChangeHandler | null = null;
    private onMessage: MessageHandler | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    /**
     * 시그널링 서버에 연결
     */
    async connect(config: ConnectionConfig): Promise<void> {
        this.config = config;
        this.updateState('connecting');

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(config.serverUrl);

                this.ws.onopen = () => {
                    this.reconnectAttempts = 0;
                    this.register();
                    this.startHeartbeat();
                    resolve();
                };

                this.ws.onclose = () => {
                    this.stopHeartbeat();
                    if (this.state !== 'disconnected') {
                        this.handleDisconnect();
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.updateState('error');
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(JSON.parse(event.data));
                };
            } catch (error) {
                this.updateState('error');
                reject(error);
            }
        });
    }

    /**
     * 원격 호스트에 연결 요청
     */
    connectToHost(targetConnectionId: string, password: string): void {
        this.send({
            type: 'connect',
            targetConnectionId,
            password,
        });
        this.updateState('authenticating');
    }

    /**
     * WebRTC 시그널링 메시지 전송
     */
    sendSignaling(type: 'offer' | 'answer' | 'ice-candidate', data: any): void {
        this.send({ type, ...data });
    }

    /**
     * 릴레이 데이터 전송 (P2P 실패 시 폴백)
     */
    sendRelay(data: any): void {
        this.send({ type: 'relay', data });
    }

    /**
     * 연결 해제
     */
    disconnect(): void {
        this.send({ type: 'disconnect' });
        this.cleanup();
        this.updateState('disconnected');
    }

    /**
     * 이벤트 핸들러 설정
     */
    setStateChangeHandler(handler: StateChangeHandler): void {
        this.onStateChange = handler;
    }

    setMessageHandler(handler: MessageHandler): void {
        this.onMessage = handler;
    }

    /**
     * 현재 상태 확인
     */
    getState(): ConnectionState {
        return this.state;
    }

    // Private methods
    private register(): void {
        if (!this.config) return;

        this.send({
            type: 'register',
            connectionId: this.config.connectionId,
            password: this.config.password,
            isHost: this.config.isHost,
        });
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'registered':
                this.updateState('connected');
                break;

            case 'connect-success':
                this.updateState('session-active', { sessionId: message.sessionId });
                break;

            case 'connect-error':
                this.updateState('error', { error: message.error });
                break;

            case 'incoming-connection':
                // 원격 연결 요청 수신
                if (this.onMessage) {
                    this.onMessage('incoming-connection', message);
                }
                this.updateState('session-active', { sessionId: message.sessionId });
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
                // WebRTC 시그널링 메시지
                if (this.onMessage) {
                    this.onMessage(message.type, message);
                }
                break;

            case 'relayed':
                // 릴레이된 데이터
                if (this.onMessage) {
                    this.onMessage('relayed', message.data);
                }
                break;

            case 'disconnected':
                this.updateState('connected'); // 세션만 종료, 서버 연결 유지
                if (this.onMessage) {
                    this.onMessage('disconnected', message);
                }
                break;

            case 'pong':
                // Heartbeat 응답
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    private handleDisconnect(): void {
        this.stopHeartbeat();

        if (this.reconnectAttempts < this.maxReconnectAttempts && this.config) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                if (this.config) {
                    this.connect(this.config).catch(console.error);
                }
            }, 1000 * this.reconnectAttempts);
        } else {
            this.updateState('disconnected');
        }
    }

    private send(data: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'ping' });
        }, 30000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private cleanup(): void {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private updateState(state: ConnectionState, data?: any): void {
        this.state = state;
        if (this.onStateChange) {
            this.onStateChange(state, data);
        }
    }
}

// 싱글톤 인스턴스
let instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
    if (!instance) {
        instance = new ConnectionManager();
    }
    return instance;
}
