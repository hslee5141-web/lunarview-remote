/**
 * Session Recording Service
 * 세션 녹화 및 타임라인 재생
 */

export interface RecordingMetadata {
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    fileSize: number;
    resolution: { width: number; height: number };
    fps: number;
    events: RecordingEvent[];
}

export interface RecordingEvent {
    timestamp: number;
    type: 'mouse' | 'keyboard' | 'clipboard' | 'file' | 'marker';
    data: any;
}

export interface RecordingState {
    isRecording: boolean;
    isPaused: boolean;
    startTime: number | null;
    duration: number;
    frameCount: number;
}

export interface TimelineMarker {
    id: string;
    timestamp: number;
    label: string;
    color: string;
}

const DEFAULT_STATE: RecordingState = {
    isRecording: false,
    isPaused: false,
    startTime: null,
    duration: 0,
    frameCount: 0,
};

class SessionRecordingService {
    private state: RecordingState = { ...DEFAULT_STATE };
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private events: RecordingEvent[] = [];
    private markers: TimelineMarker[] = [];
    private canvas: HTMLCanvasElement | null = null;
    private canvasStream: MediaStream | null = null;
    private animationFrame: number | null = null;
    private onStateChange: ((state: RecordingState) => void) | null = null;
    private currentRecording: RecordingMetadata | null = null;

    /**
     * 녹화 시작
     */
    async startRecording(
        sourceCanvas: HTMLCanvasElement,
        options: { fps?: number; videoBitsPerSecond?: number } = {}
    ): Promise<void> {
        if (this.state.isRecording) {
            throw new Error('Already recording');
        }

        const fps = options.fps || 30;
        const videoBitsPerSecond = options.videoBitsPerSecond || 2500000;

        this.canvas = sourceCanvas;
        this.canvasStream = sourceCanvas.captureStream(fps);

        // MediaRecorder 설정
        const mimeType = this.getSupportedMimeType();
        this.mediaRecorder = new MediaRecorder(this.canvasStream, {
            mimeType,
            videoBitsPerSecond,
        });

        this.recordedChunks = [];
        this.events = [];
        this.markers = [];

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.start(1000); // 1초마다 데이터 청크 생성

        this.state = {
            isRecording: true,
            isPaused: false,
            startTime: Date.now(),
            duration: 0,
            frameCount: 0,
        };

        // 녹화 시간 업데이트
        this.startDurationTimer();

        this.currentRecording = {
            id: this.generateId(),
            name: `Recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`,
            startTime: Date.now(),
            endTime: 0,
            duration: 0,
            fileSize: 0,
            resolution: { width: sourceCanvas.width, height: sourceCanvas.height },
            fps,
            events: [],
        };

        this.notifyStateChange();
    }

    /**
     * 녹화 중지
     */
    async stopRecording(): Promise<Blob> {
        if (!this.state.isRecording || !this.mediaRecorder) {
            throw new Error('Not recording');
        }

        return new Promise((resolve) => {
            this.mediaRecorder!.onstop = () => {
                const blob = new Blob(this.recordedChunks, {
                    type: this.getSupportedMimeType(),
                });

                if (this.currentRecording) {
                    this.currentRecording.endTime = Date.now();
                    this.currentRecording.duration = this.state.duration;
                    this.currentRecording.fileSize = blob.size;
                    this.currentRecording.events = this.events;
                }

                this.stopDurationTimer();
                this.state = { ...DEFAULT_STATE };
                this.notifyStateChange();

                resolve(blob);
            };

            this.mediaRecorder!.stop();
        });
    }

    /**
     * 녹화 일시정지
     */
    pauseRecording(): void {
        if (!this.state.isRecording || !this.mediaRecorder) return;

        if (this.state.isPaused) {
            this.mediaRecorder.resume();
            this.state.isPaused = false;
        } else {
            this.mediaRecorder.pause();
            this.state.isPaused = true;
        }

        this.notifyStateChange();
    }

    /**
     * 이벤트 기록
     */
    recordEvent(type: RecordingEvent['type'], data: any): void {
        if (!this.state.isRecording || this.state.isPaused) return;

        this.events.push({
            timestamp: Date.now() - (this.state.startTime || 0),
            type,
            data,
        });
    }

    /**
     * 마커 추가
     */
    addMarker(label: string, color: string = '#8b5cf6'): TimelineMarker {
        if (!this.state.isRecording) {
            throw new Error('Not recording');
        }

        const marker: TimelineMarker = {
            id: this.generateId(),
            timestamp: Date.now() - (this.state.startTime || 0),
            label,
            color,
        };

        this.markers.push(marker);
        this.recordEvent('marker', { label, color });

        return marker;
    }

    /**
     * 녹화 파일 저장
     */
    async saveRecording(blob: Blob, filename?: string): Promise<string> {
        const name = filename || this.currentRecording?.name || 'recording';
        const fullName = `${name}.webm`;

        // 브라우저 다운로드
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return fullName;
    }

    /**
     * 메타데이터 저장
     */
    saveMetadata(): string {
        if (!this.currentRecording) {
            throw new Error('No recording metadata');
        }

        const json = JSON.stringify(this.currentRecording, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentRecording.name}_metadata.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return json;
    }

    /**
     * 현재 녹화 상태
     */
    getState(): RecordingState {
        return { ...this.state };
    }

    /**
     * 현재 녹화 메타데이터
     */
    getMetadata(): RecordingMetadata | null {
        return this.currentRecording;
    }

    /**
     * 마커 목록
     */
    getMarkers(): TimelineMarker[] {
        return [...this.markers];
    }

    /**
     * 이벤트 목록
     */
    getEvents(): RecordingEvent[] {
        return [...this.events];
    }

    /**
     * 상태 변경 리스너
     */
    onRecordingStateChange(callback: (state: RecordingState) => void): void {
        this.onStateChange = callback;
    }

    /**
     * 지원되는 MIME 타입
     */
    private getSupportedMimeType(): string {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return 'video/webm';
    }

    private startDurationTimer(): void {
        const update = () => {
            if (this.state.isRecording && !this.state.isPaused && this.state.startTime) {
                this.state.duration = Date.now() - this.state.startTime;
                this.state.frameCount++;
                this.notifyStateChange();
            }
            this.animationFrame = requestAnimationFrame(update);
        };
        update();
    }

    private stopDurationTimer(): void {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}

/**
 * Timeline Player Component
 * 타임라인 재생 컨트롤러
 */
export class TimelinePlayer {
    private video: HTMLVideoElement;
    private metadata: RecordingMetadata | null = null;
    private currentTime: number = 0;
    private isPlaying: boolean = false;
    private playbackRate: number = 1;
    private onTimeUpdate: ((time: number) => void) | null = null;
    private onEventTrigger: ((event: RecordingEvent) => void) | null = null;

    constructor(videoElement: HTMLVideoElement) {
        this.video = videoElement;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.video.addEventListener('timeupdate', () => {
            this.currentTime = this.video.currentTime * 1000;
            if (this.onTimeUpdate) {
                this.onTimeUpdate(this.currentTime);
            }
            this.checkEventTriggers();
        });

        this.video.addEventListener('play', () => {
            this.isPlaying = true;
        });

        this.video.addEventListener('pause', () => {
            this.isPlaying = false;
        });
    }

    /**
     * 녹화 파일 로드
     */
    loadRecording(videoBlob: Blob, metadata?: RecordingMetadata): void {
        this.video.src = URL.createObjectURL(videoBlob);
        this.metadata = metadata || null;
        this.currentTime = 0;
    }

    /**
     * 재생
     */
    play(): void {
        this.video.play();
    }

    /**
     * 일시정지
     */
    pause(): void {
        this.video.pause();
    }

    /**
     * 특정 시간으로 이동
     */
    seekTo(timeMs: number): void {
        this.video.currentTime = timeMs / 1000;
    }

    /**
     * 마커로 이동
     */
    seekToMarker(markerId: string): void {
        if (!this.metadata) return;

        const marker = this.metadata.events.find(
            e => e.type === 'marker' && e.data.id === markerId
        );

        if (marker) {
            this.seekTo(marker.timestamp);
        }
    }

    /**
     * 재생 속도 설정
     */
    setPlaybackRate(rate: number): void {
        this.playbackRate = rate;
        this.video.playbackRate = rate;
    }

    /**
     * 이벤트 트리거 확인
     */
    private checkEventTriggers(): void {
        if (!this.metadata || !this.onEventTrigger) return;

        for (const event of this.metadata.events) {
            if (Math.abs(event.timestamp - this.currentTime) < 100) {
                this.onEventTrigger(event);
            }
        }
    }

    /**
     * 이벤트 핸들러
     */
    onTimeChanged(callback: (time: number) => void): void {
        this.onTimeUpdate = callback;
    }

    onEvent(callback: (event: RecordingEvent) => void): void {
        this.onEventTrigger = callback;
    }

    /**
     * 타임라인 렌더링 데이터
     */
    getTimelineData(): {
        duration: number;
        currentTime: number;
        markers: Array<{ timestamp: number; label: string; color: string }>;
        events: Array<{ timestamp: number; type: string }>;
    } {
        return {
            duration: this.metadata?.duration || this.video.duration * 1000,
            currentTime: this.currentTime,
            markers: this.metadata?.events.filter(e => e.type === 'marker').map(e => ({
                timestamp: e.timestamp,
                label: e.data.label,
                color: e.data.color,
            })) || [],
            events: this.metadata?.events.filter(e => e.type !== 'marker').map(e => ({
                timestamp: e.timestamp,
                type: e.type,
            })) || [],
        };
    }
}

// 싱글톤 인스턴스
let instance: SessionRecordingService | null = null;

export function getSessionRecordingService(): SessionRecordingService {
    if (!instance) {
        instance = new SessionRecordingService();
    }
    return instance;
}

export default SessionRecordingService;
