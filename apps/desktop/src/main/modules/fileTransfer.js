/**
 * File Transfer Module
 * 파일 전송 (청크 기반)
 */

const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 1024 * 1024; // 1MB
const receivingFiles = new Map();
const TIMEOUT_MS = 5 * 60 * 1000; // 5분

/**
 * 파일 전송 시작
 * @param {string} filePath - 전송할 파일 경로
 * @param {Function} sendChunk - 청크 전송 콜백
 * @param {Function} onProgress - 진행률 콜백
 */
async function sendFile(filePath, sendChunk, onProgress) {
    try {
        const stats = fs.statSync(filePath);
        const fileName = path.basename(filePath);
        const fileData = fs.readFileSync(filePath);
        const base64Data = fileData.toString('base64');

        const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

        onProgress({ fileName, progress: 0, status: 'sending' });

        for (let i = 0; i < totalChunks; i++) {
            const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

            sendChunk({
                type: 'file-chunk',
                fileName,
                chunkIndex: i,
                totalChunks,
                data: chunk,
                fileSize: stats.size,
            });

            const progress = Math.round(((i + 1) / totalChunks) * 100);
            onProgress({
                fileName,
                progress,
                status: progress === 100 ? 'completed' : 'sending'
            });

            await new Promise(r => setTimeout(r, 50));
        }

        return true;
    } catch (error) {
        console.error('[FileTransfer] Send error:', error);
        onProgress({
            fileName: path.basename(filePath),
            progress: 0,
            status: 'failed',
            error: error.message
        });
        return false;
    }
}

/**
 * 파일 청크 수신
 */
function receiveChunk(message, onProgress) {
    const { fileName, chunkIndex, totalChunks, data, fileSize } = message;

    if (!receivingFiles.has(fileName)) {
        receivingFiles.set(fileName, {
            chunks: [],
            totalChunks,
            fileSize,
            startTime: Date.now(),
        });
    }

    const fileState = receivingFiles.get(fileName);
    fileState.chunks[chunkIndex] = data;

    const receivedChunks = fileState.chunks.filter(c => c).length;
    const progress = Math.round((receivedChunks / totalChunks) * 100);

    onProgress({
        fileName,
        progress,
        status: progress === 100 ? 'saving' : 'receiving'
    });

    if (receivedChunks === totalChunks) {
        return {
            complete: true,
            fileName,
            data: fileState.chunks.join(''),
        };
    }

    return { complete: false };
}

/**
 * 파일 저장
 */
function saveFile(fileName, base64Data, savePath) {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(savePath, buffer);
        receivingFiles.delete(fileName);
        return true;
    } catch (error) {
        console.error('[FileTransfer] Save error:', error);
        return false;
    }
}

/**
 * 오래된 수신 항목 정리
 */
function cleanup() {
    const now = Date.now();
    for (const [fileName, state] of receivingFiles) {
        if (now - state.startTime > TIMEOUT_MS) {
            receivingFiles.delete(fileName);
            console.log(`[FileTransfer] Cleaned up stale transfer: ${fileName}`);
        }
    }
}

// 1분마다 정리 실행
setInterval(cleanup, 60000);

module.exports = {
    sendFile,
    receiveChunk,
    saveFile,
    cleanup,
    CHUNK_SIZE,
};
