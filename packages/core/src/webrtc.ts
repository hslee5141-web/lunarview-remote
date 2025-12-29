/**
 * WebRTC Connection Manager
 * P2P 연결 및 데이터 전송 관리
 */

export interface RTCConfig {
    iceServers: RTCIceServer[];
}

export interface PeerConnection {
    id: string;
    pc: RTCPeerConnection;
    dataChannel: RTCDataChannel | null;
    state: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';
}

type MessageHandler = (data: ArrayBuffer | string) => void;
type StateChangeHandler = (state: string) => void;

const DEFAULT_CONFIG: RTCConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

export class WebRTCManager {
    private config: RTCConfig;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private onMessage: MessageHandler | null = null;
    private onStateChange: StateChangeHandler | null = null;
    private iceCandidates: RTCIceCandidateInit[] = [];
    private isInitiator = false;

    constructor(config?: Partial<RTCConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 연결 초기화 (발신자)
     */
    async createOffer(): Promise<RTCSessionDescriptionInit> {
        this.isInitiator = true;
        this.peerConnection = this.createPeerConnection();

        // 데이터 채널 생성 (발신자가 생성)
        this.dataChannel = this.peerConnection.createDataChannel('remote-desktop', {
            ordered: true,
            maxRetransmits: 3,
        });
        this.setupDataChannel(this.dataChannel);

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        return offer;
    }

    /**
     * Offer 수신 처리 (수신자)
     */
    async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        this.isInitiator = false;
        this.peerConnection = this.createPeerConnection();

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        // 저장된 ICE candidates 적용
        for (const candidate of this.iceCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.iceCandidates = [];

        return answer;
    }

    /**
     * Answer 수신 처리 (발신자)
     */
    async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('No peer connection');
        }
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

        // 저장된 ICE candidates 적용
        for (const candidate of this.iceCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.iceCandidates = [];
    }

    /**
     * ICE Candidate 처리
     */
    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (this.peerConnection && this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            // Remote description이 아직 설정되지 않았으면 저장
            this.iceCandidates.push(candidate);
        }
    }

    /**
     * 데이터 전송
     */
    send(data: ArrayBuffer | string): boolean {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn('Data channel not ready');
            return false;
        }

        try {
            this.dataChannel.send(data as any);
            return true;
        } catch (error) {
            console.error('Send error:', error);
            return false;
        }
    }

    /**
     * 바이너리 데이터 전송 (화면 프레임 등)
     */
    sendBinary(data: Uint8Array): boolean {
        return this.send(data.buffer);
    }

    /**
     * 연결 종료
     */
    disconnect(): void {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.updateState('disconnected');
    }

    /**
     * 이벤트 핸들러 설정
     */
    setMessageHandler(handler: MessageHandler): void {
        this.onMessage = handler;
    }

    setStateChangeHandler(handler: StateChangeHandler): void {
        this.onStateChange = handler;
    }

    /**
     * ICE candidate 이벤트 핸들러 설정
     */
    onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;

    /**
     * 연결 상태 확인
     */
    getState(): string {
        return this.peerConnection?.connectionState || 'disconnected';
    }

    // Private methods
    private createPeerConnection(): RTCPeerConnection {
        const pc = new RTCPeerConnection(this.config);

        pc.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidate) {
                this.onIceCandidate(event.candidate.toJSON());
            }
        };

        pc.onconnectionstatechange = () => {
            this.updateState(pc.connectionState);
        };

        pc.ondatachannel = (event) => {
            // 수신자가 데이터 채널 수신
            this.dataChannel = event.channel;
            this.setupDataChannel(this.dataChannel);
        };

        return pc;
    }

    private setupDataChannel(channel: RTCDataChannel): void {
        channel.binaryType = 'arraybuffer';

        channel.onopen = () => {
            console.log('Data channel opened');
            this.updateState('connected');
        };

        channel.onclose = () => {
            console.log('Data channel closed');
            this.updateState('disconnected');
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
            this.updateState('failed');
        };

        channel.onmessage = (event) => {
            if (this.onMessage) {
                this.onMessage(event.data);
            }
        };
    }

    private updateState(state: string): void {
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }
}

// 싱글톤 인스턴스
let instance: WebRTCManager | null = null;

export function getWebRTCManager(config?: Partial<RTCConfig>): WebRTCManager {
    if (!instance) {
        instance = new WebRTCManager(config);
    }
    return instance;
}

export function resetWebRTCManager(): void {
    if (instance) {
        instance.disconnect();
        instance = null;
    }
}
