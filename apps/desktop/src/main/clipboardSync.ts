/**
 * Clipboard Synchronization Module
 * 클립보드 동기화 기능
 */

import { clipboard, ipcMain, BrowserWindow, nativeImage } from 'electron';

export interface ClipboardContent {
    type: 'text' | 'image' | 'html' | 'rtf' | 'files';
    data: string | Uint8Array;
    timestamp: number;
}

type SendFunction = (data: any) => boolean;

export class ClipboardSync {
    private sendFunction: SendFunction | null = null;
    private mainWindow: BrowserWindow | null = null;
    private lastContent: string = '';
    private watchInterval: NodeJS.Timeout | null = null;
    private isEnabled = true;
    private syncDirection: 'both' | 'send' | 'receive' = 'both';

    /**
     * 초기화
     */
    initialize(mainWindow: BrowserWindow, sendFn: SendFunction): void {
        this.mainWindow = mainWindow;
        this.sendFunction = sendFn;
        this.registerIPCHandlers();
    }

    /**
     * 클립보드 감시 시작
     */
    startWatching(intervalMs = 500): void {
        if (this.watchInterval) {
            this.stopWatching();
        }

        // 초기 내용 저장
        this.lastContent = clipboard.readText();

        this.watchInterval = setInterval(() => {
            if (!this.isEnabled || this.syncDirection === 'receive') return;
            this.checkClipboardChange();
        }, intervalMs);
    }

    /**
     * 클립보드 감시 중지
     */
    stopWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
    }

    /**
     * 클립보드 변경 감지 및 동기화
     */
    private checkClipboardChange(): void {
        const currentText = clipboard.readText();

        if (currentText !== this.lastContent && currentText.length > 0) {
            this.lastContent = currentText;
            this.sendClipboardContent({
                type: 'text',
                data: currentText,
                timestamp: Date.now(),
            });
        }
    }

    /**
     * 클립보드 내용 전송
     */
    private sendClipboardContent(content: ClipboardContent): void {
        if (!this.sendFunction) return;

        this.sendFunction({
            type: 'clipboard-sync',
            content,
        });

        this.notifyRenderer('clipboard-sent', content);
    }

    /**
     * 원격 클립보드 내용 수신
     */
    handleRemoteClipboard(message: any): void {
        if (!this.isEnabled || this.syncDirection === 'send') return;

        const { content } = message;

        if (!content) return;

        switch (content.type) {
            case 'text':
                this.setTextClipboard(content.data as string);
                break;
            case 'image':
                this.setImageClipboard(content.data as Uint8Array);
                break;
            case 'html':
                this.setHTMLClipboard(content.data as string);
                break;
        }

        this.notifyRenderer('clipboard-received', content);
    }

    /**
     * 텍스트 클립보드 설정
     */
    private setTextClipboard(text: string): void {
        this.lastContent = text; // 자체 감지 방지
        clipboard.writeText(text);
    }

    /**
     * 이미지 클립보드 설정
     */
    private setImageClipboard(imageData: Uint8Array): void {
        try {
            const image = nativeImage.createFromBuffer(Buffer.from(imageData));
            clipboard.writeImage(image);
        } catch (error) {
            console.error('Failed to set image clipboard:', error);
        }
    }

    /**
     * HTML 클립보드 설정
     */
    private setHTMLClipboard(html: string): void {
        clipboard.writeHTML(html);
    }

    /**
     * 현재 클립보드 읽기
     */
    getCurrentClipboard(): ClipboardContent {
        const text = clipboard.readText();
        const html = clipboard.readHTML();
        const image = clipboard.readImage();

        if (!image.isEmpty()) {
            return {
                type: 'image',
                data: image.toPNG(),
                timestamp: Date.now(),
            };
        }

        if (html && html.length > 0) {
            return {
                type: 'html',
                data: html,
                timestamp: Date.now(),
            };
        }

        return {
            type: 'text',
            data: text,
            timestamp: Date.now(),
        };
    }

    /**
     * 수동으로 현재 클립보드 동기화
     */
    syncNow(): void {
        if (!this.isEnabled || this.syncDirection === 'receive') return;

        const content = this.getCurrentClipboard();
        this.sendClipboardContent(content);
    }

    /**
     * 동기화 활성화/비활성화
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (!enabled) {
            this.stopWatching();
        }
    }

    /**
     * 동기화 방향 설정
     */
    setSyncDirection(direction: 'both' | 'send' | 'receive'): void {
        this.syncDirection = direction;
    }

    /**
     * 메시지 처리
     */
    handleMessage(message: any): void {
        if (message.type === 'clipboard-sync') {
            this.handleRemoteClipboard(message);
        }
    }

    // Private helpers
    private notifyRenderer(channel: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    private registerIPCHandlers(): void {
        ipcMain.handle('clipboard-sync-now', async () => {
            this.syncNow();
            return { success: true };
        });

        ipcMain.handle('clipboard-set-enabled', async (_, enabled: boolean) => {
            this.setEnabled(enabled);
            return { success: true };
        });

        ipcMain.handle('clipboard-set-direction', async (_, direction: string) => {
            this.setSyncDirection(direction as any);
            return { success: true };
        });

        ipcMain.handle('clipboard-get-current', async () => {
            return this.getCurrentClipboard();
        });

        ipcMain.handle('clipboard-write-text', async (_, text: string) => {
            clipboard.writeText(text);
            return { success: true };
        });
    }
}

// 싱글톤
let instance: ClipboardSync | null = null;

export function getClipboardSync(): ClipboardSync {
    if (!instance) {
        instance = new ClipboardSync();
    }
    return instance;
}
