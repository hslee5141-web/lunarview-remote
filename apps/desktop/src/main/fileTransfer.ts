/**
 * File Transfer Module
 * 파일 전송 기능 구현
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 파일 전송 설정
const CHUNK_SIZE = 64 * 1024; // 64KB 청크
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

export interface FileInfo {
    id: string;
    name: string;
    size: number;
    type: string;
    path: string;
    checksum?: string;
}

export interface TransferProgress {
    fileId: string;
    fileName: string;
    totalBytes: number;
    transferredBytes: number;
    progress: number; // 0-100
    speed: number; // bytes per second
    remainingTime: number; // seconds
    status: 'pending' | 'transferring' | 'paused' | 'completed' | 'failed' | 'cancelled';
}

export interface FileChunk {
    fileId: string;
    chunkIndex: number;
    totalChunks: number;
    data: Uint8Array;
    checksum: string;
}

type SendFunction = (data: any) => boolean;
type ProgressCallback = (progress: TransferProgress) => void;

export class FileTransferManager {
    private activeTransfers: Map<string, TransferState> = new Map();
    private sendFunction: SendFunction | null = null;
    private onProgress: ProgressCallback | null = null;
    private downloadPath: string;
    private mainWindow: BrowserWindow | null = null;

    constructor(downloadPath?: string) {
        this.downloadPath = downloadPath || path.join(process.env.USERPROFILE || '', 'Downloads');
    }

    /**
     * 초기화
     */
    initialize(mainWindow: BrowserWindow, sendFn: SendFunction): void {
        this.mainWindow = mainWindow;
        this.sendFunction = sendFn;
        this.registerIPCHandlers();
    }

    /**
     * 진행 상황 콜백 설정
     */
    setProgressCallback(callback: ProgressCallback): void {
        this.onProgress = callback;
    }

    /**
     * 파일 전송 시작 (송신자)
     */
    async startSend(filePath: string): Promise<string> {
        const stats = await fs.promises.stat(filePath);

        if (stats.size > MAX_FILE_SIZE) {
            throw new Error('File too large');
        }

        const fileId = this.generateId();
        const fileName = path.basename(filePath);
        const totalChunks = Math.ceil(stats.size / CHUNK_SIZE);

        const state: TransferState = {
            id: fileId,
            fileName,
            filePath,
            fileSize: stats.size,
            totalChunks,
            currentChunk: 0,
            transferredBytes: 0,
            status: 'pending',
            direction: 'send',
            startTime: Date.now(),
            lastProgressTime: Date.now(),
        };

        this.activeTransfers.set(fileId, state);

        // 파일 메타데이터 전송
        this.send({
            type: 'file-start',
            fileId,
            fileName,
            fileSize: stats.size,
            totalChunks,
            checksum: await this.calculateFileChecksum(filePath),
        });

        return fileId;
    }

    /**
     * 파일 메타데이터 수신 (수신자)
     */
    handleFileStart(message: any): void {
        const { fileId, fileName, fileSize, totalChunks, checksum } = message;

        const state: TransferState = {
            id: fileId,
            fileName,
            filePath: path.join(this.downloadPath, fileName),
            fileSize,
            totalChunks,
            currentChunk: 0,
            transferredBytes: 0,
            status: 'transferring',
            direction: 'receive',
            startTime: Date.now(),
            lastProgressTime: Date.now(),
            expectedChecksum: checksum,
            chunks: [],
        };

        this.activeTransfers.set(fileId, state);

        // 준비 완료 응답
        this.send({
            type: 'file-ready',
            fileId,
        });

        this.notifyProgress(state);
    }

    /**
     * 파일 준비 완료 수신 (송신자)
     */
    async handleFileReady(message: any): Promise<void> {
        const { fileId } = message;
        const state = this.activeTransfers.get(fileId);

        if (!state) return;

        state.status = 'transferring';
        await this.sendNextChunk(state);
    }

    /**
     * 청크 전송
     */
    private async sendNextChunk(state: TransferState): Promise<void> {
        if (state.status !== 'transferring' || state.currentChunk >= state.totalChunks) {
            return;
        }

        const fileHandle = await fs.promises.open(state.filePath, 'r');
        const buffer = Buffer.alloc(CHUNK_SIZE);
        const position = state.currentChunk * CHUNK_SIZE;

        const { bytesRead } = await fileHandle.read(buffer, 0, CHUNK_SIZE, position);
        await fileHandle.close();

        const chunkData = buffer.slice(0, bytesRead);
        const checksum = this.calculateChunkChecksum(chunkData);

        this.send({
            type: 'file-chunk',
            fileId: state.id,
            chunkIndex: state.currentChunk,
            totalChunks: state.totalChunks,
            data: Array.from(chunkData),
            checksum,
        });

        state.currentChunk++;
        state.transferredBytes += bytesRead;

        this.notifyProgress(state);
    }

    /**
     * 청크 수신
     */
    async handleFileChunk(message: any): Promise<void> {
        const { fileId, chunkIndex, data, checksum } = message;
        const state = this.activeTransfers.get(fileId);

        if (!state || state.direction !== 'receive') return;

        const chunkData = new Uint8Array(data);

        // 체크섬 검증
        const calculatedChecksum = this.calculateChunkChecksum(Buffer.from(chunkData));
        if (calculatedChecksum !== checksum) {
            // 재전송 요청
            this.send({
                type: 'file-chunk-retry',
                fileId,
                chunkIndex,
            });
            return;
        }

        // 청크 저장
        state.chunks = state.chunks || [];
        state.chunks[chunkIndex] = chunkData;
        state.transferredBytes += chunkData.length;
        state.currentChunk = chunkIndex + 1;

        this.notifyProgress(state);

        // 청크 수신 확인
        this.send({
            type: 'file-chunk-ack',
            fileId,
            chunkIndex,
        });

        // 모든 청크 수신 완료 시 파일 저장
        if (state.currentChunk >= state.totalChunks) {
            await this.saveReceivedFile(state);
        }
    }

    /**
     * 청크 확인 수신
     */
    async handleChunkAck(message: any): Promise<void> {
        const { fileId, chunkIndex } = message;
        const state = this.activeTransfers.get(fileId);

        if (!state || state.direction !== 'send') return;

        if (state.currentChunk < state.totalChunks) {
            await this.sendNextChunk(state);
        } else {
            // 전송 완료
            state.status = 'completed';
            this.notifyProgress(state);
            this.send({
                type: 'file-complete',
                fileId,
            });
        }
    }

    /**
     * 수신된 파일 저장
     */
    private async saveReceivedFile(state: TransferState): Promise<void> {
        if (!state.chunks) return;

        try {
            // 모든 청크를 하나의 버퍼로 합침
            const totalLength = state.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const fileBuffer = Buffer.alloc(totalLength);

            let offset = 0;
            for (const chunk of state.chunks) {
                fileBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            // 파일 저장
            await fs.promises.writeFile(state.filePath, fileBuffer);

            // 체크섬 검증
            const fileChecksum = await this.calculateFileChecksum(state.filePath);
            if (state.expectedChecksum && fileChecksum !== state.expectedChecksum) {
                state.status = 'failed';
                this.notifyProgress(state);
                return;
            }

            state.status = 'completed';
            this.notifyProgress(state);

            this.send({
                type: 'file-complete',
                fileId: state.id,
            });
        } catch (error) {
            state.status = 'failed';
            this.notifyProgress(state);
        }
    }

    /**
     * 전송 취소
     */
    cancelTransfer(fileId: string): void {
        const state = this.activeTransfers.get(fileId);
        if (!state) return;

        state.status = 'cancelled';
        this.notifyProgress(state);

        this.send({
            type: 'file-cancel',
            fileId,
        });

        this.activeTransfers.delete(fileId);
    }

    /**
     * 전송 일시정지
     */
    pauseTransfer(fileId: string): void {
        const state = this.activeTransfers.get(fileId);
        if (!state) return;

        state.status = 'paused';
        this.notifyProgress(state);
    }

    /**
     * 전송 재개
     */
    async resumeTransfer(fileId: string): Promise<void> {
        const state = this.activeTransfers.get(fileId);
        if (!state || state.status !== 'paused') return;

        state.status = 'transferring';
        if (state.direction === 'send') {
            await this.sendNextChunk(state);
        }
    }

    /**
     * 메시지 처리
     */
    handleMessage(message: any): void {
        switch (message.type) {
            case 'file-start':
                this.handleFileStart(message);
                break;
            case 'file-ready':
                this.handleFileReady(message);
                break;
            case 'file-chunk':
                this.handleFileChunk(message);
                break;
            case 'file-chunk-ack':
                this.handleChunkAck(message);
                break;
            case 'file-chunk-retry':
                // 청크 재전송 로직
                break;
            case 'file-complete':
                const state = this.activeTransfers.get(message.fileId);
                if (state) {
                    state.status = 'completed';
                    this.notifyProgress(state);
                }
                break;
            case 'file-cancel':
                this.activeTransfers.delete(message.fileId);
                break;
        }
    }

    // Private helpers
    private send(data: any): boolean {
        return this.sendFunction ? this.sendFunction(data) : false;
    }

    private notifyProgress(state: TransferState): void {
        const now = Date.now();
        const elapsed = (now - state.startTime) / 1000;
        const speed = elapsed > 0 ? state.transferredBytes / elapsed : 0;
        const remaining = speed > 0 ? (state.fileSize - state.transferredBytes) / speed : 0;

        const progress: TransferProgress = {
            fileId: state.id,
            fileName: state.fileName,
            totalBytes: state.fileSize,
            transferredBytes: state.transferredBytes,
            progress: Math.round((state.transferredBytes / state.fileSize) * 100),
            speed,
            remainingTime: Math.round(remaining),
            status: state.status,
        };

        if (this.onProgress) {
            this.onProgress(progress);
        }

        if (this.mainWindow) {
            this.mainWindow.webContents.send('file-progress', progress);
        }
    }

    private generateId(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    private calculateChunkChecksum(data: Buffer): string {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    private async calculateFileChecksum(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    private registerIPCHandlers(): void {
        ipcMain.handle('send-file', async (_, filePath: string) => {
            try {
                const fileId = await this.startSend(filePath);
                return { success: true, fileId };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('select-file', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openFile'],
            });
            return result.canceled ? null : result.filePaths[0];
        });

        ipcMain.handle('cancel-transfer', async (_, fileId: string) => {
            this.cancelTransfer(fileId);
            return { success: true };
        });
    }
}

interface TransferState {
    id: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    totalChunks: number;
    currentChunk: number;
    transferredBytes: number;
    status: TransferProgress['status'];
    direction: 'send' | 'receive';
    startTime: number;
    lastProgressTime: number;
    expectedChecksum?: string;
    chunks?: Uint8Array[];
}

// 싱글톤
let instance: FileTransferManager | null = null;

export function getFileTransferManager(): FileTransferManager {
    if (!instance) {
        instance = new FileTransferManager();
    }
    return instance;
}
