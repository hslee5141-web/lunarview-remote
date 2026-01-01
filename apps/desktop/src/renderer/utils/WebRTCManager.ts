import { EventEmitter } from 'events';

export class WebRTCManager extends EventEmitter {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private isHost: boolean = false;
    private config: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    };

    constructor() {
        super();
        this.setupSignalingListeners();
    }

    private setupSignalingListeners() {
        // Main process triggers these when receiving from signaling server
        window.electronAPI.onWebRTCOffer(async (data: { offer: RTCSessionDescriptionInit }) => {
            console.log('[WebRTCManager] Received offer');
            await this.handleOffer(data.offer);
        });

        window.electronAPI.onWebRTCAnswer(async (data: { answer: RTCSessionDescriptionInit }) => {
            console.log('[WebRTCManager] Received answer');
            await this.handleAnswer(data.answer);
        });

        window.electronAPI.onWebRTCIceCandidate(async (data: { candidate: RTCIceCandidateInit }) => {
            await this.handleIceCandidate(data.candidate);
        });
    }

    // --- Host Methods ---

    public async startHost() {
        this.isHost = true;
        console.log('[WebRTCManager] Starting Host...');
        try {
            // 1. Get Screen Source
            const sources = await window.electronAPI.getScreens();
            if (!sources || sources.length === 0) {
                throw new Error('No screens found');
            }
            const sourceId = sources[0].id; // Default to primary screen
            console.log('[WebRTCManager] Using screen source:', sourceId);

            // 2. Get Screen Stream
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1080,
                        minFrameRate: 60,
                        maxFrameRate: 60
                    }
                } as any
            });

            this.localStream = stream;
            this.emit('local-stream', stream);

            // 3. Create PeerConnection
            this.createPeerConnection();

            // 4. Add Tracks
            stream.getTracks().forEach(track => {
                if (this.peerConnection) {
                    this.peerConnection.addTrack(track, stream);
                }
            });

            // 5. Create Offer
            const offer = await this.peerConnection!.createOffer();
            await this.peerConnection!.setLocalDescription(offer);

            // 6. Send Offer via Main process
            window.electronAPI.sendWebRTCOffer(offer);
            console.log('[WebRTCManager] Offer sent');

        } catch (err) {
            console.error('[WebRTCManager] Error starting host:', err);
            this.emit('error', err);
        }
    }

    // --- Viewer Methods ---

    public async startViewer() {
        this.isHost = false;
        console.log('[WebRTCManager] Starting Viewer...');
        // Viewer waits for Offer
    }

    // --- Common WebRTC Logic ---

    private createPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(this.config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                window.electronAPI.sendWebRTCIceCandidate(event.candidate.toJSON());
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTCManager] ICE State:', this.peerConnection?.iceConnectionState);
            this.emit('connection-state-change', this.peerConnection?.iceConnectionState);
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTCManager] Remote track received');
            this.remoteStream = event.streams[0];
            this.emit('remote-stream', this.remoteStream);
        };
    }

    private async handleOffer(offer: RTCSessionDescriptionInit) {
        if (this.isHost) return; // Hosts don't accept offers usually

        try {
            this.createPeerConnection();
            await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await this.peerConnection!.createAnswer();
            await this.peerConnection!.setLocalDescription(answer);

            window.electronAPI.sendWebRTCAnswer(answer);
            console.log('[WebRTCManager] Answer sent');
        } catch (err) {
            console.error('[WebRTCManager] Error handling offer:', err);
        }
    }

    private async handleAnswer(answer: RTCSessionDescriptionInit) {
        if (!this.isHost) return; // Viewers don't accept answers usually

        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('[WebRTCManager] Remote description set (Answer)');
            }
        } catch (err) {
            console.error('[WebRTCManager] Error handling answer:', err);
        }
    }

    private async handleIceCandidate(candidate: RTCIceCandidateInit) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (err) {
            console.error('[WebRTCManager] Error adding ICE candidate:', err);
        }
    }

    public close() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.remoteStream = null;
    }
}

export const webRTCManager = new WebRTCManager();
