// Browser-compatible EventEmitter (replaces Node.js 'events' module)
type EventCallback = (...args: any[]) => void;

class BrowserEventEmitter {
    private events: Map<string, EventCallback[]> = new Map();

    on(event: string, callback: EventCallback): this {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(callback);
        return this;
    }

    emit(event: string, ...args: any[]): boolean {
        const callbacks = this.events.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(...args));
            return true;
        }
        return false;
    }

    removeAllListeners(event?: string): this {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
        return this;
    }
}

/**
 * WebRTC Manager - Performance Optimized
 * TeamViewer 수준의 성능을 위한 최적화된 WebRTC 관리자
 * 
 * 최적화 내용:
 * - TURN 서버 추가 (NAT 관통)
 * - H.264 하드웨어 인코딩 우선 (NVENC/Quick Sync/VCE)
 * - 적응형 비트레이트 제어
 * - SDP 최적화 (저지연)
 * - 실시간 네트워크 통계 모니터링
 */
export class WebRTCManager extends BrowserEventEmitter {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private audioStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private isHost: boolean = false;
    private viewerReady: boolean = false;
    private audioEnabled: boolean = true;
    private statsInterval: ReturnType<typeof setInterval> | null = null;
    private bitrateAdjustInterval: ReturnType<typeof setInterval> | null = null;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private qualityPreset: 'low' | 'medium' | 'high' = 'high';
    private gameMode: boolean = false;  // 게임 모드 (저지연 우선)

    // ICE Candidate 큐 (remoteDescription 설정 전에 도착한 후보를 저장)

    // 최적화된 ICE 서버 구성 (TURN 서버 포함)
    private config: RTCConfiguration = {
        iceServers: [
            // STUN 서버
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            // TURN 서버 (무료 - metered.ca)
            {
                urls: 'turn:a.relay.metered.ca:80',
                username: 'e8dd65c92a96d2d9dde3a016',
                credential: 'xlr/9K0KQbvkBpzT'
            },
            {
                urls: 'turn:a.relay.metered.ca:443',
                username: 'e8dd65c92a96d2d9dde3a016',
                credential: 'xlr/9K0KQbvkBpzT'
            },
            {
                urls: 'turn:a.relay.metered.ca:443?transport=tcp',
                username: 'e8dd65c92a96d2d9dde3a016',
                credential: 'xlr/9K0KQbvkBpzT'
            }
        ],
        // 성능 최적화 설정
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };

    // 코덱 우선순위 (H.264 우선 - 하드웨어 인코딩 지원)
    // H.264: NVENC(NVIDIA), Quick Sync(Intel), VCE(AMD) 하드웨어 가속
    // VP9: 소프트웨어 인코딩이지만 압축 효율 좋음 (fallback)
    private preferredCodecs = ['video/H264', 'video/VP9', 'video/VP8'];

    // 비트레이트 설정 (bps)
    private targetBitrate = {
        min: 1_000_000,   // 1 Mbps
        start: 2_500_000, // 2.5 Mbps
        max: 6_000_000    // 6 Mbps
    };

    private signalCleanups: (() => void)[] = [];

    constructor() {
        super();
        this.setupSignalingListeners();
    }

    private setupSignalingListeners() {
        // 이미 등록된 리스너가 있다면 정리
        this.removeAllSignalingListeners();

        const offerCleanup = window.electronAPI.onWebRTCOffer(async (data: any) => {
            console.log('[WebRTCManager] Received offer');
            const offer = data.offer || data;
            await this.handleOffer(offer);
        });
        if (typeof offerCleanup === 'function') this.signalCleanups.push(offerCleanup);

        const answerCleanup = window.electronAPI.onWebRTCAnswer(async (data: any) => {
            console.log('[WebRTCManager] Received answer');
            const answer = data.answer || data;
            await this.handleAnswer(answer);
        });
        if (typeof answerCleanup === 'function') this.signalCleanups.push(answerCleanup);

        const iceCleanup = window.electronAPI.onWebRTCIceCandidate(async (data: any) => {
            // Main process sends: { type, candidate (string), sdpMid, sdpMLineIndex }
            // RTCIceCandidateInit expects: { candidate (string), sdpMid, sdpMLineIndex }
            const candidateInit: RTCIceCandidateInit = {
                candidate: data.candidate,
                sdpMid: data.sdpMid,
                sdpMLineIndex: data.sdpMLineIndex
            };
            console.log('[WebRTCManager] Received ICE candidate:', candidateInit.candidate?.substring(0, 50));
            await this.handleIceCandidate(candidateInit);
        });
        if (typeof iceCleanup === 'function') this.signalCleanups.push(iceCleanup);

        const onViewerReady = window.electronAPI.onWebRTCViewerReady;
        if (onViewerReady) {
            const viewerReadyCleanup = onViewerReady(async () => {
                console.log('[WebRTCManager] Received viewer-ready signal');
                this.viewerReady = true;
                if (this.isHost && this.localStream && this.peerConnection) {
                    console.log('[WebRTCManager] Host ready, creating offer...');
                    await this.createAndSendOffer();
                }
            });
            if (typeof viewerReadyCleanup === 'function') this.signalCleanups.push(viewerReadyCleanup);
        }
    }

    private removeAllSignalingListeners() {
        this.signalCleanups.forEach(cleanup => {
            if (typeof cleanup === 'function') cleanup();
        });
        this.signalCleanups = [];
    }

    // --- Host Methods ---

    private isStartingHost = false;

    public async startHost() {
        const version = 'v3.0-' + Date.now();
        if (this.isStartingHost) {
            console.log(`[WebRTCManager] [${version}] startHost already in progress, skipping...`);
            return;
        }

        // 이미 완료된 상태라면 재시작 방지
        if (this.isHost && this.localStream && this.peerConnection && this.peerConnection.connectionState !== 'closed') {
            console.log('[WebRTCManager] Host already running and healthy, skipping initialization');
            return;
        }

        this.isStartingHost = true;
        this.isHost = true;

        // ICE 후보 큐 초기화
        this.pendingIceCandidates = [];

        try {
            console.log('[WebRTCManager] Starting Host...');

            // 기존 스트림 및 연결 명시적 정리 (항상 새로 시작)
            if (this.localStream) {
                console.log('[WebRTCManager] Stopping existing stream...');
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            if (this.peerConnection) {
                console.log('[WebRTCManager] Closing existing peer connection...');
                this.peerConnection.close();
                this.peerConnection = null;
            }

            const sources = await window.electronAPI.getScreens();
            if (!sources || sources.length === 0) {
                throw new Error('No screens found');
            }

            // 저장된 선택 모니터 또는 첫 번째 모니터 사용
            const savedScreen = localStorage.getItem('selectedScreen');
            const selectedSource = sources.find(s => s.id === savedScreen) || sources[0];
            const sourceId = selectedSource.id;
            console.log('[WebRTCManager] Using screen source:', sourceId, selectedSource.name);

            // 품질 프리셋에 따른 설정
            const qualityConfig = this.getQualityConfig();

            console.log(`[WebRTCManager] Capturing screen with Source ID: ${sourceId}, Config:`, qualityConfig);

            // 화면 캡처 (품질 프리셋 적용)
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: qualityConfig.width * 0.7,
                        maxWidth: qualityConfig.width,
                        minHeight: qualityConfig.height * 0.7,
                        maxHeight: qualityConfig.height,
                        minFrameRate: qualityConfig.fps / 2,
                        maxFrameRate: qualityConfig.fps,
                        // @ts-ignore - Electron/Chrome specific
                        cursor: 'never'
                    }
                } as any
            });

            console.log('[WebRTCManager] Stream captured:', stream.id, 'Tracks:', stream.getVideoTracks().length);
            stream.getVideoTracks().forEach(track => {
                console.log('[WebRTCManager] Track info:', track.label, track.readyState, track.getSettings());
                track.onended = () => console.warn('[WebRTCManager] Track ended unexpectedly:', track.label);
            });

            this.localStream = stream;
            this.emit('local-stream', stream);

            // 시스템 오디오 캡처 - 크래시 원인으로 의심되어 임시 비활성화
            /*
            if (this.audioEnabled) {
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sourceId
                            }
                        } as any,
                        video: false
                    });
                    this.audioStream = audioStream;
                    console.log('[WebRTCManager] Audio stream captured');
                } catch (audioErr) {
                    console.warn('[WebRTCManager] Could not capture system audio:', audioErr);
                }
            }
            */

            // PeerConnection 생성 및 트랙 추가
            this.createPeerConnection();

            // 비디오 트랙 추가
            stream.getTracks().forEach(track => {
                if (this.peerConnection) {
                    this.peerConnection.addTrack(track, stream);
                    if (track.kind === 'video') {
                        this.setCodecPreferences();
                    }
                }
            });

            // 오디오 트랙 추가
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => {
                    if (this.peerConnection && this.localStream) {
                        this.peerConnection.addTrack(track, this.localStream);
                    }
                });
            }

            // 비트레이트 설정 적용
            await this.applyBitrateSettings();

            console.log('[WebRTCManager] Host ready, sending offer...');
            await this.createAndSendOffer();

            // 통계 모니터링 시작
            this.startStatsMonitoring();

            // 적응형 비트레이트 조절 시작
            this.startAdaptiveBitrate();

            // 재연결 카운터 리셋
            this.reconnectAttempts = 0;

        } catch (err) {
            console.error('[WebRTCManager] Error starting host:', err);
            this.emit('error', err);
        } finally {
            this.isStartingHost = false;
        }
    }

    /**
     * 코덱 우선순위 설정 (VP9 > VP8 > H264)
     */
    private setCodecPreferences() {
        if (!this.peerConnection) return;

        try {
            const transceivers = this.peerConnection.getTransceivers();
            for (const transceiver of transceivers) {
                if (transceiver.sender.track?.kind === 'video') {
                    const capabilities = RTCRtpSender.getCapabilities?.('video');
                    if (!capabilities) continue;

                    const codecs = capabilities.codecs.filter(codec =>
                        this.preferredCodecs.some(preferred =>
                            codec.mimeType.toLowerCase().includes(preferred.toLowerCase().split('/')[1])
                        )
                    );

                    // VP9 우선 정렬
                    const sortedCodecs = codecs.sort((a, b) => {
                        const aIndex = this.preferredCodecs.findIndex(p =>
                            a.mimeType.toLowerCase().includes(p.toLowerCase().split('/')[1])
                        );
                        const bIndex = this.preferredCodecs.findIndex(p =>
                            b.mimeType.toLowerCase().includes(p.toLowerCase().split('/')[1])
                        );
                        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                    });

                    if (sortedCodecs.length > 0 && transceiver.setCodecPreferences) {
                        transceiver.setCodecPreferences(sortedCodecs);
                        console.log('[WebRTCManager] Codec preferences set:', sortedCodecs.map(c => c.mimeType));
                    }
                }
            }
        } catch (err) {
            console.warn('[WebRTCManager] Could not set codec preferences:', err);
        }
    }

    /**
     * 비트레이트 설정 적용
     */
    private async applyBitrateSettings() {
        if (!this.peerConnection) {
            console.warn('[WebRTCManager] applyBitrateSettings: No peer connection');
            return;
        }

        const senders = this.peerConnection.getSenders();
        console.log('[WebRTCManager] applyBitrateSettings: Found', senders.length, 'senders, isHost:', this.isHost);

        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (!videoSender) {
            console.warn('[WebRTCManager] applyBitrateSettings: No video sender found (this is normal for Viewer)');
            return;
        }

        try {
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }

            params.encodings[0].maxBitrate = this.targetBitrate.max;
            params.encodings[0].maxFramerate = 60;
            params.encodings[0].scaleResolutionDownBy = 1.0;

            await videoSender.setParameters(params);
            console.log('[WebRTCManager] Bitrate settings applied:', this.targetBitrate.max / 1_000_000, 'Mbps');
        } catch (err) {
            console.warn('[WebRTCManager] Could not apply bitrate settings:', err);
        }
    }

    /**
     * SDP 최적화 - 저지연 설정
     */
    private optimizeSDP(sdp: string): string {
        let optimized = sdp;

        // b=AS 라인 제거 및 새로운 비트레이트 설정
        optimized = optimized.replace(/b=AS:\d+\r\n/g, '');

        // 비디오 섹션에 비트레이트 제한 추가
        optimized = optimized.replace(
            /(m=video.*\r\n)/g,
            `$1b=AS:${Math.floor(this.targetBitrate.max / 1000)}\r\n`
        );

        // x-google 비트레이트 힌트 추가 (Chrome/Electron 최적화)
        optimized = optimized.replace(
            /(a=fmtp:\d+.*)/g,
            (match) => {
                if (match.includes('x-google')) return match;
                return `${match};x-google-min-bitrate=${Math.floor(this.targetBitrate.min / 1000)};x-google-max-bitrate=${Math.floor(this.targetBitrate.max / 1000)}`;
            }
        );

        return optimized;
    }

    private async createAndSendOffer() {
        if (!this.peerConnection) {
            console.error('[WebRTCManager] No peer connection');
            return;
        }
        try {
            console.log('[WebRTCManager] Creating offer...');
            const offer = await this.peerConnection.createOffer({
                offerToReceiveVideo: false,
                offerToReceiveAudio: false
            });

            console.log('[WebRTCManager] Offer created, type:', offer.type);

            // SDP 최적화 적용
            if (offer.sdp) {
                offer.sdp = this.optimizeSDP(offer.sdp);
            }

            console.log('[WebRTCManager] Setting local description...');
            await this.peerConnection.setLocalDescription(offer);

            // 타이밍 이슈 방지를 위한 짧은 대기
            // await new Promise(resolve => setTimeout(resolve, 500)); 
            // 500ms might be too long, try 100ms or remove if not needed, but keeping delay for safety
            await new Promise(resolve => setTimeout(resolve, 100));

            // IPC 안전성을 위해 순수 객체로 변환
            const safeOffer = { type: offer.type, sdp: offer.sdp };

            if (!safeOffer.sdp) {
                console.error('[WebRTCManager] SDP is missing!');
                return;
            }

            console.log('[WebRTCManager] Sending offer via IPC (safe v4):', safeOffer.type, 'SDP Length:', safeOffer.sdp.length);

            // Validate offer before sending
            try {
                const serialized = JSON.stringify(safeOffer);
                const parsed = JSON.parse(serialized);
                window.electronAPI.sendWebRTCOffer(parsed);
                console.log('[WebRTCManager] IPC sent successfully');
            } catch (ipcErr) {
                console.error('[WebRTCManager] Failed to send IPC:', ipcErr);
            }

        } catch (err) {
            console.error('[WebRTCManager] Error creating offer:', err);
        }
    }

    // --- Viewer Methods ---

    private isStartingViewer = false;

    public async startViewer() {
        if (this.isStartingViewer) {
            console.log('[WebRTCManager] startViewer already in progress, skipping...');
            return;
        }

        // 이미 뷰어 모드로 동작 중이고 연결이 유효하다면 중복 초기화 방지
        if (!this.isHost && this.peerConnection && this.peerConnection.connectionState !== 'closed') {
            console.log('[WebRTCManager] Viewer already active, re-sending ready signal only.');
            window.electronAPI.sendWebRTCViewerReady?.();
            return;
        }

        this.isStartingViewer = true;
        this.isHost = false;

        try {
            // 이미 유효한 연결이 있는지 확인
            let shouldCreatePC = true;
            if (this.peerConnection && this.peerConnection.connectionState !== 'closed') {
                console.log('[WebRTCManager] Viewer has active connection (state:', this.peerConnection.connectionState, '), skipping PC creation.');
                shouldCreatePC = false;
            }

            if (shouldCreatePC) {
                console.log('[WebRTCManager] Creating new PeerConnection...');

                // 기존 연결 정리
                if (this.peerConnection) {
                    console.log('[WebRTCManager] Cleaning up closed/invalid connection');
                    this.peerConnection.close();
                    this.peerConnection = null;
                }

                this.createPeerConnection();
            }

            console.log('[WebRTCManager] Sending viewer-ready signal...');
            window.electronAPI.sendWebRTCViewerReady?.();

            // 통계 모니터링 시작 (뷰어용)
            this.startStatsMonitoring();
        } catch (err) {
            console.error('[WebRTCManager] Error starting viewer:', err);
        } finally {
            this.isStartingViewer = false;
        }
    }

    // --- Common WebRTC Logic ---

    private createPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(this.config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // IPC 안전성을 위해 순수 객체로 변환
                const candidate = event.candidate.toJSON();
                window.electronAPI.sendWebRTCIceCandidate(JSON.parse(JSON.stringify(candidate)));
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection?.iceConnectionState;
            console.log('[WebRTCManager] ICE State:', state);
            this.emit('connection-state-change', state);

            // 연결 성공 시 비트레이트 재적용 및 재연결 카운터 리셋
            if (state === 'connected') {
                this.reconnectAttempts = 0;
                if (this.isHost) {
                    setTimeout(() => this.applyBitrateSettings(), 1000);
                }
            }

            // 연결 실패/끊김 시 자동 재연결 시도
            if (state === 'failed' || state === 'disconnected') {
                console.log('[WebRTCManager] Connection lost, attempting reconnect...');
                this.attemptReconnect();
            }
        };

        this.peerConnection.onicegatheringstatechange = () => {
            console.log('[WebRTCManager] ICE Gathering State:', this.peerConnection?.iceGatheringState);
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('[WebRTCManager] Connection State:', this.peerConnection?.connectionState);
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTCManager] Remote track received:', event.track.kind, event.track.id);
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                console.log('[WebRTCManager] Remote stream found:', stream.id, 'Active:', stream.active);
                this.remoteStream = stream;
                this.emit('remote-stream', this.remoteStream);

                // 트랙 상태 모니터링
                event.track.onmute = () => console.log(`[WebRTCManager] Track ${event.track.id} muted`);
                event.track.onunmute = () => console.log(`[WebRTCManager] Track ${event.track.id} unmuted`);
                event.track.onended = () => console.log(`[WebRTCManager] Track ${event.track.id} ended`);
            } else {
                console.warn('[WebRTCManager] Track received but no stream associated');
                // 스트림이 없는 경우 새 스트림 생성
                const newStream = new MediaStream([event.track]);
                this.remoteStream = newStream;
                this.emit('remote-stream', newStream);
            }
        };
    }

    private isProcessingOffer: boolean = false;

    private async handleOffer(offer: RTCSessionDescriptionInit) {
        if (this.isHost) return;

        // 이미 Offer 처리 중이면 무시
        if (this.isProcessingOffer) {
            console.log('[WebRTCManager] Already processing an offer, ignoring duplicate');
            return;
        }

        this.isProcessingOffer = true;

        try {
            console.log('[WebRTCManager] Received Offer, creating Answer...');

            // 기존 연결이 유효하면 재사용, 아니면 새로 생성
            if (!this.peerConnection || this.peerConnection.connectionState === 'closed') {
                console.log('[WebRTCManager] Creating new PeerConnection for offer');
                this.createPeerConnection();

                // 비디오 수신을 위한 Transceiver 추가
                this.peerConnection!.addTransceiver('video', { direction: 'recvonly' });
                this.peerConnection!.addTransceiver('audio', { direction: 'recvonly' });
            } else {
                console.log('[WebRTCManager] Reusing existing PeerConnection for offer');
            }

            // 이미 연결되어 있으면 중복 Offer 무시
            if (this.peerConnection!.connectionState === 'connected') {
                console.log('[WebRTCManager] Already connected, ignoring offer');
                return;
            }

            // 시그널링 상태가 have-remote-offer 또는 have-local-offer이면 롤백
            const signalingState = this.peerConnection!.signalingState;
            if (signalingState !== 'stable') {
                console.warn('[WebRTCManager] Signaling state is not stable:', signalingState);
                if (signalingState === 'have-local-offer') {
                    // 우리가 Offer를 보낸 상태에서 상대방도 Offer를 보낸 경우 (glare)
                    // 롤백 후 상대방 Offer 처리
                    try {
                        await this.peerConnection!.setLocalDescription({ type: 'rollback' });
                        console.log('[WebRTCManager] Rolled back from have-local-offer');
                    } catch (rollbackErr) {
                        console.warn('[WebRTCManager] Rollback failed:', rollbackErr);
                        return;
                    }
                } else if (signalingState === 'have-remote-offer') {
                    // 이미 Offer를 처리 중 - 이 경우 무시
                    console.log('[WebRTCManager] Already have remote offer, ignoring');
                    return;
                }
            }

            await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('[WebRTCManager] Remote description set');

            // 큐에 저장된 ICE 후보 처리
            await this.processPendingCandidates();

            const answer = await this.peerConnection!.createAnswer();
            await this.peerConnection!.setLocalDescription(answer);

            window.electronAPI.sendWebRTCAnswer({ type: answer.type, sdp: answer.sdp });
            console.log('[WebRTCManager] Answer sent');
        } catch (err) {
            console.error('[WebRTCManager] Error handling offer:', err);
        } finally {
            this.isProcessingOffer = false;
        }
    }

    private async handleAnswer(answer: RTCSessionDescriptionInit) {
        if (!this.isHost) return;

        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('[WebRTCManager] Remote description set');

                // 큐에 저장된 ICE 후보 처리
                await this.processPendingCandidates();

                // 연결 후 비트레이트 재적용
                setTimeout(() => this.applyBitrateSettings(), 500);
            }
        } catch (err) {
            console.error('[WebRTCManager] Error handling answer:', err);
        }
    }

    // ICE 후보 큐
    private pendingIceCandidates: RTCIceCandidateInit[] = [];

    private async handleIceCandidate(candidate: RTCIceCandidateInit) {
        try {
            if (!candidate || !candidate.candidate) {
                // 유효하지 않은 후보는 무시
                return;
            }

            if (this.peerConnection && this.peerConnection.remoteDescription) {
                // remoteDescription이 설정되어 있으면 바로 추가
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('[WebRTCManager] ICE candidate added');
            } else {
                // remoteDescription이 아직 없으면 큐에 저장
                console.log('[WebRTCManager] Queueing ICE candidate (remote description not set yet)');
                this.pendingIceCandidates.push(candidate);
            }
        } catch (err) {
            console.error('[WebRTCManager] Error adding ICE candidate:', err);
        }
    }

    private async processPendingCandidates() {
        if (!this.peerConnection || !this.peerConnection.remoteDescription) {
            return;
        }

        console.log(`[WebRTCManager] Processing ${this.pendingIceCandidates.length} pending ICE candidates`);

        for (const candidate of this.pendingIceCandidates) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('[WebRTCManager] Error adding pending ICE candidate:', err);
            }
        }

        this.pendingIceCandidates = [];
    }

    // --- Statistics Monitoring ---

    /**
     * 실시간 통계 모니터링 시작
     */
    private startStatsMonitoring() {
        if (this.statsInterval) return;

        this.statsInterval = setInterval(async () => {
            if (!this.peerConnection) return;

            try {
                const stats = await this.peerConnection.getStats();
                let videoStats: any = null;
                let candidatePairStats: any = null;

                stats.forEach(report => {
                    // 비디오 통계 (송신/수신)
                    if (report.type === 'outbound-rtp' && report.kind === 'video') {
                        videoStats = {
                            type: 'outbound',
                            framesSent: report.framesSent,
                            framesPerSecond: report.framesPerSecond,
                            bytesSent: report.bytesSent,
                            qualityLimitationReason: report.qualityLimitationReason,
                            codec: report.codecId
                        };
                    }
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        videoStats = {
                            type: 'inbound',
                            framesReceived: report.framesReceived,
                            framesPerSecond: report.framesPerSecond,
                            bytesReceived: report.bytesReceived,
                            framesDropped: report.framesDropped
                        };
                    }

                    // 네트워크 통계
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        candidatePairStats = {
                            rtt: report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0,
                            availableBandwidth: report.availableOutgoingBitrate || 0,
                            bytesSent: report.bytesSent,
                            bytesReceived: report.bytesReceived
                        };
                    }
                });

                if (videoStats) {
                    this.emit('stats', videoStats);
                }
                if (candidatePairStats) {
                    this.emit('network-stats', candidatePairStats);
                }

            } catch (err) {
                console.warn('[WebRTCManager] Stats error:', err);
            }
        }, 2000);
    }

    /**
     * 적응형 비트레이트 조절
     */
    private startAdaptiveBitrate() {
        if (!this.isHost || this.bitrateAdjustInterval) return;

        let consecutiveLowBandwidth = 0;

        this.bitrateAdjustInterval = setInterval(async () => {
            if (!this.peerConnection) return;

            try {
                const stats = await this.peerConnection.getStats();
                let currentBandwidth = 0;
                let qualityLimitation = '';

                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        currentBandwidth = report.availableOutgoingBitrate || 0;
                    }
                    if (report.type === 'outbound-rtp' && report.kind === 'video') {
                        qualityLimitation = report.qualityLimitationReason || 'none';
                    }
                });

                // 적응형 비트레이트 조절
                if (qualityLimitation === 'bandwidth' || currentBandwidth < this.targetBitrate.min) {
                    consecutiveLowBandwidth++;
                    if (consecutiveLowBandwidth >= 3) {
                        // 비트레이트 낮추기
                        const newMax = Math.max(this.targetBitrate.min, this.targetBitrate.max * 0.8);
                        this.targetBitrate.max = newMax;
                        await this.applyBitrateSettings();
                        console.log('[WebRTCManager] Reduced bitrate to:', newMax / 1_000_000, 'Mbps');
                        consecutiveLowBandwidth = 0;
                    }
                } else if (currentBandwidth > this.targetBitrate.max * 1.5) {
                    // 여유가 있으면 비트레이트 높이기
                    const newMax = Math.min(6_000_000, this.targetBitrate.max * 1.2);
                    if (newMax > this.targetBitrate.max) {
                        this.targetBitrate.max = newMax;
                        await this.applyBitrateSettings();
                        console.log('[WebRTCManager] Increased bitrate to:', newMax / 1_000_000, 'Mbps');
                    }
                    consecutiveLowBandwidth = 0;
                } else {
                    consecutiveLowBandwidth = 0;
                }

            } catch (err) {
                console.warn('[WebRTCManager] Adaptive bitrate error:', err);
            }
        }, 5000);
    }

    public close() {
        // 인터벌 정리
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        if (this.bitrateAdjustInterval) {
            clearInterval(this.bitrateAdjustInterval);
            this.bitrateAdjustInterval = null;
        }

        // 스트림 정리
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }

        // PeerConnection 정리
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteStream = null;
        this.removeAllSignalingListeners();
        console.log('[WebRTCManager] Closed');
    }

    // --- 품질 프리셋 설정 ---

    /**
     * 품질 프리셋에 따른 설정 반환
     */
    private getQualityConfig() {
        const configs = {
            low: { width: 1280, height: 720, fps: 30, bitrate: 2_000_000 },
            medium: { width: 1920, height: 1080, fps: 30, bitrate: 4_000_000 },
            high: { width: 1920, height: 1080, fps: 60, bitrate: 6_000_000 }
        };
        return configs[this.qualityPreset];
    }

    /**
     * 품질 프리셋 변경
     */
    public setQualityPreset(preset: 'low' | 'medium' | 'high') {
        this.qualityPreset = preset;
        const config = this.getQualityConfig();
        this.targetBitrate.max = config.bitrate;
        this.applyBitrateSettings();
        console.log('[WebRTCManager] Quality preset changed to:', preset);
        this.emit('quality-changed', preset);
    }

    /**
     * 현재 품질 프리셋 반환
     */
    public getQualityPreset(): 'low' | 'medium' | 'high' {
        return this.qualityPreset;
    }

    // --- 오디오 제어 ---

    /**
     * 오디오 활성화/비활성화
     */
    public setAudioEnabled(enabled: boolean) {
        this.audioEnabled = enabled;
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => {
                track.enabled = enabled;
            });
        }
        console.log('[WebRTCManager] Audio:', enabled ? 'enabled' : 'disabled');
        this.emit('audio-changed', enabled);
    }

    /**
     * 오디오 활성화 상태 반환
     */
    public isAudioEnabled(): boolean {
        return this.audioEnabled;
    }

    // --- 게임 모드 ---

    /**
     * 게임 모드 설정 (저지연 우선)
     * - 해상도 낮춤 (720p)
     * - 비트레이트 높임 (빠른 전송)
     * - 인코딩 최적화 (low-latency)
     */
    public async setGameMode(enabled: boolean) {
        this.gameMode = enabled;
        console.log('[WebRTCManager] Game mode:', enabled ? 'ON (low-latency)' : 'OFF');

        if (enabled) {
            // 게임 모드: 720p + 높은 비트레이트 + 60fps
            this.targetBitrate = {
                min: 3_000_000,   // 3 Mbps
                start: 5_000_000, // 5 Mbps
                max: 10_000_000   // 10 Mbps
            };
        } else {
            // 일반 모드: 품질 프리셋에 따른 비트레이트
            const config = this.getQualityConfig();
            this.targetBitrate = {
                min: 1_000_000,
                start: config.bitrate / 2,
                max: config.bitrate
            };
        }

        // 비트레이트 설정 적용
        await this.applyBitrateSettings();

        // 게임 모드용 인코딩 파라미터 적용
        await this.applyGameModeEncodingParams(enabled);

        this.emit('game-mode-changed', enabled);
    }

    /**
     * 게임 모드용 인코딩 파라미터 적용
     */
    private async applyGameModeEncodingParams(enabled: boolean) {
        if (!this.peerConnection) return;

        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (!videoSender) return;

        try {
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }

            if (enabled) {
                // 게임 모드: 낮은 해상도 스케일링, 높은 프레임레이트 우선
                params.encodings[0].maxBitrate = this.targetBitrate.max;
                params.encodings[0].maxFramerate = 120;  // 게임 모드는 120fps
                params.encodings[0].scaleResolutionDownBy = 1.5; // 720p 스케일
                // @ts-ignore - priority는 표준이지만 타입 정의에 없을 수 있음
                params.encodings[0].priority = 'high';
                // @ts-ignore - networkPriority도 마찬가지
                params.encodings[0].networkPriority = 'high';
            } else {
                // 일반 모드: 원본 해상도
                params.encodings[0].maxBitrate = this.targetBitrate.max;
                params.encodings[0].maxFramerate = 60;
                params.encodings[0].scaleResolutionDownBy = 1.0;
            }

            await videoSender.setParameters(params);
            console.log('[WebRTCManager] Game mode encoding params applied:', enabled);
        } catch (err) {
            console.warn('[WebRTCManager] Could not apply game mode encoding params:', err);
        }
    }

    /**
     * 게임 모드 상태 반환
     */
    public isGameModeEnabled(): boolean {
        return this.gameMode;
    }

    /**
     * 현재 수신 중인 원격 스트림 반환 (UI 복구용)
     */
    public getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }

    // --- 자동 재연결 ---

    /**
     * 자동 재연결 시도
     */
    private async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WebRTCManager] Max reconnect attempts reached');
            this.emit('reconnect-failed');
            return;
        }

        this.reconnectAttempts++;
        console.log(`[WebRTCManager] Reconnecting... attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.emit('reconnecting', this.reconnectAttempts);

        // 3초 대기 후 재연결
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
            if (this.isHost) {
                await this.startHost();
            } else {
                await this.startViewer();
            }
        } catch (err) {
            console.error('[WebRTCManager] Reconnect failed:', err);
            this.attemptReconnect();
        }
    }
}

export const webRTCManager = new WebRTCManager();

