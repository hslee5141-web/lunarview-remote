/**
 * Clipboard Sync Module
 * 클립보드 동기화
 */

const { clipboard } = require('electron');

let syncInterval = null;
let lastContent = '';

/**
 * 클립보드 동기화 시작
 * @param {Function} onSync - 클립보드 변경 시 콜백 (content)
 * @param {Function} isActive - 활성 상태 확인 함수
 */
function startSync(onSync, isActive) {
    if (syncInterval) return;

    lastContent = clipboard.readText();

    syncInterval = setInterval(() => {
        if (!isActive()) {
            stopSync();
            return;
        }

        const current = clipboard.readText();
        if (current !== lastContent && current.length > 0) {
            lastContent = current;
            onSync(current);
        }
    }, 500);

    console.log('[ClipboardSync] Started');
}

/**
 * 클립보드 동기화 중지
 */
function stopSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('[ClipboardSync] Stopped');
    }
}

/**
 * 원격 클립보드 내용 적용
 */
function setContent(content) {
    if (content) {
        lastContent = content;
        clipboard.writeText(content);
        console.log('[ClipboardSync] Content received');
    }
}

function isSyncing() {
    return syncInterval !== null;
}

module.exports = {
    startSync,
    stopSync,
    setContent,
    isSyncing,
};
