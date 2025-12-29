/**
 * Screen Capture Module
 * Electron desktopCapturer를 사용한 화면 캡처
 */

import { desktopCapturer, screen } from 'electron';

export interface CaptureOptions {
    fps: number;
    quality: 'high' | 'medium' | 'low';
    displayId?: string;
}

export interface ScreenInfo {
    id: string;
    name: string;
    width: number;
    height: number;
}

const QUALITY_MAP = {
    high: { width: 1920, height: 1080, frameRate: 30 },
    medium: { width: 1280, height: 720, frameRate: 25 },
    low: { width: 854, height: 480, frameRate: 15 },
};

let mediaStream: MediaStream | null = null;
let captureInterval: NodeJS.Timeout | null = null;

/**
 * 사용 가능한 화면 목록 가져오기
 */
export async function getAvailableScreens(): Promise<ScreenInfo[]> {
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 150, height: 150 },
    });

    const displays = screen.getAllDisplays();

    return sources.map((source, index) => {
        const display = displays[index] || displays[0];
        return {
            id: source.id,
            name: source.name,
            width: display.size.width,
            height: display.size.height,
        };
    });
}

/**
 * 화면 캡처 시작
 */
export async function startCapture(
    options: CaptureOptions,
    onFrame: (frameData: Buffer, metadata: any) => void
): Promise<void> {
    const screens = await getAvailableScreens();
    const targetScreen = options.displayId
        ? screens.find(s => s.id === options.displayId)
        : screens[0];

    if (!targetScreen) {
        throw new Error('No screen available for capture');
    }

    const qualitySettings = QUALITY_MAP[options.quality];

    // Electron의 desktopCapturer를 사용하여 미디어 스트림 생성
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
    });

    const source = sources.find(s => s.id === targetScreen.id) || sources[0];

    // 메인 프로세스에서는 직접 getUserMedia를 호출할 수 없으므로
    // 렌더러 프로세스에서 처리하도록 이벤트 발송
    return new Promise((resolve, reject) => {
        try {
            // 프레임 캡처를 위한 타이머 설정
            const fps = options.fps || qualitySettings.frameRate;
            const interval = 1000 / fps;

            captureInterval = setInterval(async () => {
                try {
                    // 화면 캡처 (스크린샷 방식)
                    const sources = await desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: {
                            width: qualitySettings.width,
                            height: qualitySettings.height,
                        },
                    });

                    const targetSource = sources.find(s => s.id === source.id) || sources[0];
                    if (targetSource) {
                        const thumbnail = targetSource.thumbnail;
                        const frameData = thumbnail.toJPEG(options.quality === 'high' ? 90 : 70);

                        onFrame(frameData, {
                            width: thumbnail.getSize().width,
                            height: thumbnail.getSize().height,
                            timestamp: Date.now(),
                            isKeyFrame: true,
                        });
                    }
                } catch (err) {
                    console.error('Frame capture error:', err);
                }
            }, interval);

            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 화면 캡처 중지
 */
export function stopCapture(): void {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

/**
 * 캡처 품질 변경
 */
export function setQuality(quality: 'high' | 'medium' | 'low'): void {
    // 현재 캡처 중이면 재시작
    // 실제 구현에서는 onFrame 콜백을 저장해두고 재시작
}

/**
 * 현재 캡처 상태 확인
 */
export function isCapturing(): boolean {
    return captureInterval !== null;
}

// Audio capture module
export * from './audio';
