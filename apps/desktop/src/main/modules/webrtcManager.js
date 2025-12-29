/**
 * WebRTC Peer Connection Module
 * P2P 연결 관리 (STUN/TURN 지원)
 */

// ICE 서버 설정 (무료 STUN + 유료 TURN 옵션)
const ICE_SERVERS = [
    // Google 무료 STUN 서버
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // 필요 시 TURN 서버 추가 (상용화 시)
    // {
    //     urls: 'turn:your-turn-server.com:3478',
    //     username: 'user',
    //     credential: 'pass'
    // }
];

class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.onIceCandidate = null;
        this.onTrack = null;
        this.onDataChannel = null;
        this.onConnectionStateChange = null;
        this.isConnected = false;
    }

    /**
     * PeerConnection 생성
     */
    createConnection() {
        this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidate) {
                this.onIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            if (this.onTrack) {
                this.onTrack(event.streams[0]);
            }
        };

        this.peerConnection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel);
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('[WebRTC] Connection state:', state);

            this.isConnected = (state === 'connected');

            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(state);
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE state:', this.peerConnection.iceConnectionState);
        };

        return this.peerConnection;
    }

    /**
     * DataChannel 생성 (호스트용)
     */
    createDataChannel(label = 'remote-data') {
        if (!this.peerConnection) {
            this.createConnection();
        }

        this.dataChannel = this.peerConnection.createDataChannel(label, {
            ordered: false, // 순서 보장 X (저지연)
            maxRetransmits: 0 // 재전송 X (실시간)
        });

        this.setupDataChannel(this.dataChannel);
        return this.dataChannel;
    }

    /**
     * DataChannel 설정
     */
    setupDataChannel(channel) {
        this.dataChannel = channel;

        channel.onopen = () => {
            console.log('[WebRTC] DataChannel open');
            if (this.onDataChannel) {
                this.onDataChannel('open', channel);
            }
        };

        channel.onclose = () => {
            console.log('[WebRTC] DataChannel closed');
            if (this.onDataChannel) {
                this.onDataChannel('close', channel);
            }
        };

        channel.onmessage = (event) => {
            if (this.onDataChannel) {
                this.onDataChannel('message', event.data);
            }
        };

        channel.onerror = (error) => {
            console.error('[WebRTC] DataChannel error:', error);
        };
    }

    /**
     * Offer 생성 (호스트)
     */
    async createOffer() {
        if (!this.peerConnection) {
            this.createConnection();
        }

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        return offer;
    }

    /**
     * Answer 생성 (뷰어)
     */
    async createAnswer(offer) {
        if (!this.peerConnection) {
            this.createConnection();
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        return answer;
    }

    /**
     * Answer 처리 (호스트)
     */
    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    /**
     * ICE Candidate 추가
     */
    async addIceCandidate(candidate) {
        if (this.peerConnection && candidate) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('[WebRTC] Failed to add ICE candidate:', error);
            }
        }
    }

    /**
     * 데이터 전송
     */
    send(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(data);
            return true;
        }
        return false;
    }

    /**
     * 바이너리 데이터 전송 (화면 프레임용)
     */
    sendBinary(arrayBuffer) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(arrayBuffer);
            return true;
        }
        return false;
    }

    /**
     * 연결 상태 확인
     */
    getConnectionState() {
        if (!this.peerConnection) return 'new';
        return this.peerConnection.connectionState;
    }

    /**
     * P2P 연결 여부
     */
    isP2PConnected() {
        return this.isConnected && this.dataChannel?.readyState === 'open';
    }

    /**
     * 연결 종료
     */
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.isConnected = false;
        console.log('[WebRTC] Connection closed');
    }

    /**
     * 통계 정보
     */
    async getStats() {
        if (!this.peerConnection) return null;

        const stats = await this.peerConnection.getStats();
        const result = {
            bytesSent: 0,
            bytesReceived: 0,
            roundTripTime: 0,
        };

        stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                result.roundTripTime = report.currentRoundTripTime * 1000;
            }
            if (report.type === 'data-channel') {
                result.bytesSent = report.bytesSent || 0;
                result.bytesReceived = report.bytesReceived || 0;
            }
        });

        return result;
    }
}

module.exports = { WebRTCManager, ICE_SERVERS };
