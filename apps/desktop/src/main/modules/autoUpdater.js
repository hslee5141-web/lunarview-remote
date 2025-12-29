/**
 * LunarView - Auto Updater Module
 * 자동 업데이트 관리 모듈
 */

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// 로그 설정
log.transports.file.level = 'info';
autoUpdater.logger = log;

// 업데이트 상태
let updateStatus = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    progress: null,
    version: null
};

// 이벤트 콜백
let onStatusChange = null;

/**
 * 자동 업데이트 초기화
 * @param {BrowserWindow} mainWindow - 메인 윈도우 인스턴스
 * @param {Function} statusCallback - 상태 변경 콜백
 */
function init(mainWindow, statusCallback) {
    onStatusChange = statusCallback;

    // 업데이트 서버 설정 (GitHub Releases 사용 시)
    // 자체 서버 사용 시 아래 주석 해제
    // autoUpdater.setFeedURL({
    //     provider: 'generic',
    //     url: 'https://your-server.com/updates/'
    // });

    // 자동 다운로드 비활성화 (사용자 확인 후 다운로드)
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // 이벤트 핸들러 등록
    setupEventHandlers(mainWindow);

    // 앱 시작 시 업데이트 확인 (개발 모드 제외)
    if (process.env.NODE_ENV === 'production') {
        setTimeout(() => {
            checkForUpdates();
        }, 3000);
    }
}

/**
 * 이벤트 핸들러 설정
 */
function setupEventHandlers(mainWindow) {
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        updateStatus = { ...updateStatus, checking: true, error: null };
        notifyStatus('checking');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info.version);
        updateStatus = {
            ...updateStatus,
            checking: false,
            available: true,
            version: info.version
        };
        notifyStatus('available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available');
        updateStatus = { ...updateStatus, checking: false, available: false };
        notifyStatus('not-available');
    });

    autoUpdater.on('error', (err) => {
        log.error('Update error:', err);
        updateStatus = {
            ...updateStatus,
            checking: false,
            downloading: false,
            error: err.message
        };
        notifyStatus('error', { message: err.message });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const progress = {
            percent: Math.round(progressObj.percent),
            bytesPerSecond: progressObj.bytesPerSecond,
            transferred: progressObj.transferred,
            total: progressObj.total
        };
        log.info(`Download progress: ${progress.percent}%`);
        updateStatus = { ...updateStatus, progress, downloading: true };
        notifyStatus('downloading', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded');
        updateStatus = {
            ...updateStatus,
            downloading: false,
            downloaded: true,
            version: info.version
        };
        notifyStatus('downloaded', { version: info.version });
    });
}

/**
 * 상태 알림
 */
function notifyStatus(event, data = {}) {
    if (onStatusChange) {
        onStatusChange(event, { ...data, ...updateStatus });
    }
}

/**
 * 업데이트 확인
 */
async function checkForUpdates() {
    try {
        log.info('Checking for updates...');
        const result = await autoUpdater.checkForUpdates();
        return result;
    } catch (error) {
        log.error('Check for updates failed:', error);
        throw error;
    }
}

/**
 * 업데이트 다운로드
 */
async function downloadUpdate() {
    try {
        log.info('Starting download...');
        updateStatus.downloading = true;
        await autoUpdater.downloadUpdate();
    } catch (error) {
        log.error('Download failed:', error);
        throw error;
    }
}

/**
 * 업데이트 설치 및 재시작
 */
function quitAndInstall() {
    log.info('Quitting and installing update...');
    autoUpdater.quitAndInstall(false, true);
}

/**
 * 현재 상태 반환
 */
function getStatus() {
    return updateStatus;
}

/**
 * 현재 앱 버전 반환
 */
function getCurrentVersion() {
    const { app } = require('electron');
    return app.getVersion();
}

module.exports = {
    init,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    getStatus,
    getCurrentVersion
};
