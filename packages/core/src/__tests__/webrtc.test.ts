/**
 * Unit Tests for WebRTC Manager
 * WebRTC 매니저 단위 테스트
 */

import { WebRTCManager } from '../webrtc';

// Mock RTCPeerConnection
class MockRTCPeerConnection {
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    connectionState = 'new';
    onicecandidate: ((event: any) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: ((event: any) => void) | null = null;

    async createOffer() {
        return { type: 'offer', sdp: 'mock-offer-sdp' };
    }

    async createAnswer() {
        return { type: 'answer', sdp: 'mock-answer-sdp' };
    }

    async setLocalDescription(desc: RTCSessionDescriptionInit) {
        this.localDescription = desc;
    }

    async setRemoteDescription(desc: RTCSessionDescriptionInit) {
        this.remoteDescription = desc;
    }

    async addIceCandidate(candidate: RTCIceCandidateInit) {
        // Mock implementation
    }

    createDataChannel(label: string, options?: RTCDataChannelInit) {
        return new MockDataChannel(label);
    }

    close() {
        this.connectionState = 'closed';
    }
}

class MockDataChannel {
    label: string;
    readyState = 'open';
    binaryType: BinaryType = 'arraybuffer';
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((error: any) => void) | null = null;
    onmessage: ((event: any) => void) | null = null;

    constructor(label: string) {
        this.label = label;
        setTimeout(() => this.onopen?.(), 0);
    }

    send(data: string | ArrayBuffer) {
        // Mock send
    }

    close() {
        this.readyState = 'closed';
        this.onclose?.();
    }
}

// Mock global RTCPeerConnection and RTCSessionDescription
(global as any).RTCPeerConnection = MockRTCPeerConnection;
(global as any).RTCSessionDescription = class {
    constructor(public desc: RTCSessionDescriptionInit) { }
};
(global as any).RTCIceCandidate = class {
    constructor(public candidate: RTCIceCandidateInit) { }
    toJSON() { return this.candidate; }
};

describe('WebRTCManager', () => {
    let manager: WebRTCManager;

    beforeEach(() => {
        manager = new WebRTCManager();
    });

    afterEach(() => {
        manager.disconnect();
    });

    describe('createOffer', () => {
        it('should create an offer', async () => {
            const offer = await manager.createOffer();

            expect(offer).toBeDefined();
            expect(offer.type).toBe('offer');
            expect(offer.sdp).toBeDefined();
        });
    });

    describe('handleOffer', () => {
        it('should handle an offer and create an answer', async () => {
            const offer = { type: 'offer' as const, sdp: 'mock-offer-sdp' };
            const answer = await manager.handleOffer(offer);

            expect(answer).toBeDefined();
            expect(answer.type).toBe('answer');
        });
    });

    describe('handleAnswer', () => {
        it('should handle an answer after creating an offer', async () => {
            await manager.createOffer();

            const answer = { type: 'answer' as const, sdp: 'mock-answer-sdp' };
            await expect(manager.handleAnswer(answer)).resolves.not.toThrow();
        });

        it('should throw if no peer connection exists', async () => {
            const answer = { type: 'answer' as const, sdp: 'mock-answer-sdp' };
            await expect(manager.handleAnswer(answer)).rejects.toThrow('No peer connection');
        });
    });

    describe('send', () => {
        it('should return false if data channel is not ready', () => {
            const result = manager.send('test message');
            expect(result).toBe(false);
        });
    });

    describe('disconnect', () => {
        it('should close the connection', async () => {
            await manager.createOffer();
            manager.disconnect();

            expect(manager.getState()).toBe('disconnected');
        });
    });

    describe('state change handler', () => {
        it('should call state change handler when state changes', async () => {
            const stateHandler = jest.fn();
            manager.setStateChangeHandler(stateHandler);

            await manager.createOffer();

            // Wait for async state updates
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(stateHandler).toHaveBeenCalled();
        });
    });

    describe('ICE candidate handler', () => {
        it('should set ICE candidate callback', () => {
            const iceHandler = jest.fn();
            manager.onIceCandidate = iceHandler;

            expect(manager.onIceCandidate).toBe(iceHandler);
        });
    });
});
