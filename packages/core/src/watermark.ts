/**
 * Watermark Service
 * 화면 워터마크 - 보안 및 유출 방지
 */

export interface WatermarkSettings {
    enabled: boolean;
    text: string;
    showUserName: boolean;
    showConnectionId: boolean;
    showTimestamp: boolean;
    showIpAddress: boolean;
    opacity: number; // 0-100
    fontSize: number;
    color: string;
    position: 'tile' | 'center' | 'corners';
    rotation: number; // degrees
}

export interface UserInfo {
    name: string;
    connectionId: string;
    ipAddress?: string;
}

const DEFAULT_SETTINGS: WatermarkSettings = {
    enabled: false,
    text: '',
    showUserName: true,
    showConnectionId: true,
    showTimestamp: true,
    showIpAddress: false,
    opacity: 15,
    fontSize: 14,
    color: '#ffffff',
    position: 'tile',
    rotation: -30,
};

class WatermarkService {
    private settings: WatermarkSettings;
    private userInfo: UserInfo | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    constructor() {
        this.settings = this.loadSettings();
    }

    /**
     * 설정 로드
     */
    private loadSettings(): WatermarkSettings {
        const saved = localStorage.getItem('lunarview-watermark-settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    }

    /**
     * 설정 저장
     */
    saveSettings(settings: Partial<WatermarkSettings>): void {
        this.settings = { ...this.settings, ...settings };
        localStorage.setItem('lunarview-watermark-settings', JSON.stringify(this.settings));
    }

    /**
     * 사용자 정보 설정
     */
    setUserInfo(info: UserInfo): void {
        this.userInfo = info;
    }

    /**
     * 워터마크 활성화/비활성화
     */
    toggle(): boolean {
        this.settings.enabled = !this.settings.enabled;
        this.saveSettings({});
        return this.settings.enabled;
    }

    /**
     * 워터마크 텍스트 생성
     */
    private generateWatermarkText(): string {
        const parts: string[] = [];

        if (this.settings.text) {
            parts.push(this.settings.text);
        }

        if (this.settings.showUserName && this.userInfo?.name) {
            parts.push(this.userInfo.name);
        }

        if (this.settings.showConnectionId && this.userInfo?.connectionId) {
            parts.push(this.userInfo.connectionId);
        }

        if (this.settings.showTimestamp) {
            parts.push(new Date().toLocaleString('ko-KR'));
        }

        if (this.settings.showIpAddress && this.userInfo?.ipAddress) {
            parts.push(this.userInfo.ipAddress);
        }

        return parts.join(' | ');
    }

    /**
     * 캔버스에 워터마크 렌더링
     */
    render(targetCanvas: HTMLCanvasElement): void {
        if (!this.settings.enabled) return;

        const ctx = targetCanvas.getContext('2d');
        if (!ctx) return;

        const text = this.generateWatermarkText();
        if (!text) return;

        ctx.save();
        ctx.font = `${this.settings.fontSize}px Inter, sans-serif`;
        ctx.fillStyle = this.settings.color;
        ctx.globalAlpha = this.settings.opacity / 100;

        switch (this.settings.position) {
            case 'tile':
                this.renderTiled(ctx, targetCanvas.width, targetCanvas.height, text);
                break;
            case 'center':
                this.renderCenter(ctx, targetCanvas.width, targetCanvas.height, text);
                break;
            case 'corners':
                this.renderCorners(ctx, targetCanvas.width, targetCanvas.height, text);
                break;
        }

        ctx.restore();
    }

    /**
     * 타일 패턴 렌더링
     */
    private renderTiled(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        text: string
    ): void {
        const textWidth = ctx.measureText(text).width;
        const spacing = textWidth + 100;
        const rowHeight = this.settings.fontSize + 80;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let y = -rowHeight; y < height + rowHeight; y += rowHeight) {
            for (let x = -spacing; x < width + spacing; x += spacing) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate((this.settings.rotation * Math.PI) / 180);
                ctx.fillText(text, 0, 0);
                ctx.restore();
            }
        }
    }

    /**
     * 중앙 렌더링
     */
    private renderCenter(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        text: string
    ): void {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${this.settings.fontSize * 2}px Inter, sans-serif`;

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate((this.settings.rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }

    /**
     * 코너 렌더링
     */
    private renderCorners(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        text: string
    ): void {
        const padding = 20;

        // 좌상단
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, padding, padding);

        // 우상단
        ctx.textAlign = 'right';
        ctx.fillText(text, width - padding, padding);

        // 좌하단
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillText(text, padding, height - padding);

        // 우하단
        ctx.textAlign = 'right';
        ctx.fillText(text, width - padding, height - padding);
    }

    /**
     * 워터마크 이미지 생성 (오버레이용)
     */
    createOverlayImage(width: number, height: number): string {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // 투명 배경
        ctx.clearRect(0, 0, width, height);

        // 설정 임시 저장
        const wasEnabled = this.settings.enabled;
        this.settings.enabled = true;

        this.render(canvas);

        this.settings.enabled = wasEnabled;

        return canvas.toDataURL('image/png');
    }

    /**
     * 설정 가져오기
     */
    getSettings(): WatermarkSettings {
        return { ...this.settings };
    }

    /**
     * 활성화 여부
     */
    isEnabled(): boolean {
        return this.settings.enabled;
    }
}

// 싱글톤 인스턴스
let instance: WatermarkService | null = null;

export function getWatermarkService(): WatermarkService {
    if (!instance) {
        instance = new WatermarkService();
    }
    return instance;
}

export default WatermarkService;
