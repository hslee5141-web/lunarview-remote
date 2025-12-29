/**
 * Screen Capture Module
 * 화면 캡처 및 품질 관리 (게임 모드 포함)
 */

const { desktopCapturer } = require('electron');

let captureInterval = null;
let currentQuality = 'medium';
let isGameMode = false;
let frameCount = 0;
let lastFrameTime = Date.now();
let currentFPS = 0;
let lastFrameSize = 0;
let autoQualityEnabled = true;

// 품질 프리셋
const qualitySettings = {
    low: { width: 854, height: 480, fps: 10, jpeg: 40 },
    medium: { width: 1280, height: 720, fps: 15, jpeg: 60 },
    high: { width: 1920, height: 1080, fps: 25, jpeg: 80 },
    game: { width: 1920, height: 1080, fps: 60, jpeg: 70 },
    gamelow: { width: 1280, height: 720, fps: 60, jpeg: 50 },
};

// 자동 품질 조절 임계값
const AUTO_QUALITY_THRESHOLDS = {
    highToMedium: 200 * 1024,  // 200KB 이상이면 품질 낮춤
    mediumToLow: 300 * 1024,   // 300KB 이상이면 더 낮춤
    lowToMedium: 50 * 1024,    // 50KB 이하면 품질 높임
};

let onFrameCallback = null;
let isActiveCallback = null;

/**
 * 화면 캡처 시작
 */
function startCapture(onFrame, isActive) {
    if (captureInterval) return;

    onFrameCallback = onFrame;
    isActiveCallback = isActive;

    const quality = isGameMode ? 'game' : currentQuality;
    console.log(`[ScreenCapture] Starting (quality: ${quality}, gameMode: ${isGameMode})`);

    restartCaptureLoop();
}

function restartCaptureLoop() {
    if (captureInterval) {
        clearInterval(captureInterval);
    }

    const quality = isGameMode ? 'game' : currentQuality;
    const settings = qualitySettings[quality];
    const interval = 1000 / settings.fps;

    captureInterval = setInterval(async () => {
        if (!isActiveCallback || !isActiveCallback()) {
            stopCapture();
            return;
        }

        try {
            const quality = isGameMode ? (lastFrameSize > AUTO_QUALITY_THRESHOLDS.highToMedium ? 'gamelow' : 'game') : currentQuality;
            const settings = qualitySettings[quality];

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: settings.width, height: settings.height },
            });

            if (sources.length > 0) {
                const frame = sources[0].thumbnail.toJPEG(settings.jpeg);
                lastFrameSize = frame.length;

                if (onFrameCallback) {
                    onFrameCallback(frame.toString('base64'));
                }

                // FPS 계산
                frameCount++;
                const now = Date.now();
                if (now - lastFrameTime >= 1000) {
                    currentFPS = frameCount;
                    frameCount = 0;
                    lastFrameTime = now;

                    // 자동 품질 조절 (게임 모드가 아닐 때만)
                    if (autoQualityEnabled && !isGameMode) {
                        adjustQualityBasedOnSize();
                    }
                }
            }
        } catch (error) {
            console.error('[ScreenCapture] Error:', error);
        }
    }, interval);
}

/**
 * 프레임 크기 기반 자동 품질 조절
 */
function adjustQualityBasedOnSize() {
    const oldQuality = currentQuality;

    if (lastFrameSize > AUTO_QUALITY_THRESHOLDS.mediumToLow && currentQuality !== 'low') {
        currentQuality = 'low';
    } else if (lastFrameSize > AUTO_QUALITY_THRESHOLDS.highToMedium && currentQuality === 'high') {
        currentQuality = 'medium';
    } else if (lastFrameSize < AUTO_QUALITY_THRESHOLDS.lowToMedium && currentQuality === 'low') {
        currentQuality = 'medium';
    }

    if (oldQuality !== currentQuality) {
        console.log(`[ScreenCapture] Auto quality: ${oldQuality} -> ${currentQuality}`);
    }
}

/**
 * 화면 캡처 중지
 */
function stopCapture() {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
        console.log('[ScreenCapture] Stopped');
    }
}

/**
 * 게임 모드 토글
 */
function setGameMode(enabled) {
    isGameMode = enabled;
    console.log(`[ScreenCapture] Game mode: ${enabled ? 'ON' : 'OFF'}`);

    if (captureInterval) {
        restartCaptureLoop();
    }
    return true;
}

function getGameMode() {
    return isGameMode;
}

/**
 * 품질 설정 변경
 */
function setQuality(quality) {
    if (!qualitySettings[quality]) return false;

    currentQuality = quality;
    console.log(`[ScreenCapture] Quality changed to: ${quality}`);

    if (captureInterval && !isGameMode) {
        restartCaptureLoop();
    }
    return true;
}

function setAutoQuality(enabled) {
    autoQualityEnabled = enabled;
    console.log(`[ScreenCapture] Auto quality: ${enabled ? 'ON' : 'OFF'}`);
}

function getQuality() {
    return isGameMode ? 'game' : currentQuality;
}

function getFPS() {
    return currentFPS;
}

function getFrameSize() {
    return lastFrameSize;
}

function isCapturing() {
    return captureInterval !== null;
}

function getStats() {
    return {
        fps: currentFPS,
        quality: getQuality(),
        frameSize: lastFrameSize,
        gameMode: isGameMode,
        autoQuality: autoQualityEnabled,
    };
}

module.exports = {
    startCapture,
    stopCapture,
    setQuality,
    getQuality,
    getFPS,
    getFrameSize,
    isCapturing,
    setGameMode,
    getGameMode,
    setAutoQuality,
    getStats,
    qualitySettings,
};
