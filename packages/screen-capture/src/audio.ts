/**
 * Audio Capture Module
 * 시스템 오디오 캡처 및 스트리밍
 */

export interface AudioCaptureOptions {
    sampleRate: number;
    channels: 1 | 2;
    bitrate: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
}

export interface AudioCaptureState {
    isCapturing: boolean;
    volume: number;
    muted: boolean;
}

const DEFAULT_OPTIONS: AudioCaptureOptions = {
    sampleRate: 44100,
    channels: 2,
    bitrate: 128000,
    echoCancellation: true,
    noiseSuppression: true,
};

let audioStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let captureState: AudioCaptureState = {
    isCapturing: false,
    volume: 1.0,
    muted: false,
};

/**
 * 오디오 캡처 시작
 */
export async function startAudioCapture(
    options: Partial<AudioCaptureOptions> = {},
    onAudioData?: (data: Float32Array) => void
): Promise<MediaStream> {
    const config = { ...DEFAULT_OPTIONS, ...options };

    try {
        // 시스템 오디오 캡처 (loopback)
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: config.echoCancellation,
                noiseSuppression: config.noiseSuppression,
                sampleRate: config.sampleRate,
                channelCount: config.channels,
            },
        });

        // AudioContext 생성
        audioContext = new AudioContext({
            sampleRate: config.sampleRate,
        });

        // 오디오 소스 연결
        const source = audioContext.createMediaStreamSource(audioStream);

        // 분석기 노드 (볼륨 모니터링용)
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        // 오디오 데이터 처리
        if (onAudioData) {
            const processor = audioContext.createScriptProcessor(4096, config.channels, config.channels);
            processor.onaudioprocess = (event) => {
                if (captureState.muted) return;

                const inputData = event.inputBuffer.getChannelData(0);
                const scaledData = new Float32Array(inputData.length);

                for (let i = 0; i < inputData.length; i++) {
                    scaledData[i] = inputData[i] * captureState.volume;
                }

                onAudioData(scaledData);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);
        }

        captureState.isCapturing = true;
        console.log('Audio capture started');

        return audioStream;
    } catch (error) {
        console.error('Failed to start audio capture:', error);
        throw error;
    }
}

/**
 * 오디오 캡처 중지
 */
export function stopAudioCapture(): void {
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    analyser = null;
    captureState.isCapturing = false;
    console.log('Audio capture stopped');
}

/**
 * 볼륨 설정
 */
export function setVolume(volume: number): void {
    captureState.volume = Math.max(0, Math.min(1, volume));
}

/**
 * 음소거 토글
 */
export function toggleMute(): boolean {
    captureState.muted = !captureState.muted;
    return captureState.muted;
}

/**
 * 현재 볼륨 레벨 가져오기 (0-1)
 */
export function getCurrentLevel(): number {
    if (!analyser) return 0;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }

    return (sum / dataArray.length) / 255;
}

/**
 * 오디오 스트림 가져오기
 */
export function getAudioStream(): MediaStream | null {
    return audioStream;
}

/**
 * 캡처 상태 확인
 */
export function getState(): AudioCaptureState {
    return { ...captureState };
}

/**
 * 오디오 설정 가져오기
 */
export function getAudioConstraints(options: Partial<AudioCaptureOptions> = {}): MediaTrackConstraints {
    const config = { ...DEFAULT_OPTIONS, ...options };

    return {
        echoCancellation: config.echoCancellation,
        noiseSuppression: config.noiseSuppression,
        sampleRate: config.sampleRate,
        channelCount: config.channels,
    };
}
