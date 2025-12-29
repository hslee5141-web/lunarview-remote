/**
 * Privacy Mode Service
 * 프라이버시 모드 - 특정 앱/창 자동 블러 처리
 */

export interface PrivacyRule {
    id: string;
    name: string;
    type: 'app' | 'title' | 'class';
    pattern: string;
    enabled: boolean;
}

export interface PrivacySettings {
    enabled: boolean;
    rules: PrivacyRule[];
    blurIntensity: number; // 0-100
    showPlaceholder: boolean;
}

// 기본 프라이버시 규칙 (민감한 앱들)
const DEFAULT_RULES: PrivacyRule[] = [
    { id: '1', name: 'KakaoTalk', type: 'app', pattern: 'kakaotalk', enabled: true },
    { id: '2', name: 'Discord', type: 'app', pattern: 'discord', enabled: true },
    { id: '3', name: 'Slack', type: 'app', pattern: 'slack', enabled: true },
    { id: '4', name: '은행 앱', type: 'title', pattern: '은행|뱅킹|banking', enabled: true },
    { id: '5', name: '비밀번호 관리자', type: 'app', pattern: '1password|lastpass|bitwarden', enabled: true },
    { id: '6', name: '이메일', type: 'title', pattern: 'gmail|outlook|mail', enabled: false },
];

const DEFAULT_SETTINGS: PrivacySettings = {
    enabled: false,
    rules: DEFAULT_RULES,
    blurIntensity: 50,
    showPlaceholder: true,
};

class PrivacyModeService {
    private settings: PrivacySettings;
    private activeWindows: Map<string, { title: string; appName: string }> = new Map();
    private onSettingsChange: ((settings: PrivacySettings) => void) | null = null;

    constructor() {
        this.settings = this.loadSettings();
    }

    /**
     * 설정 로드
     */
    private loadSettings(): PrivacySettings {
        const saved = localStorage.getItem('lunarview-privacy-settings');
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
        return DEFAULT_SETTINGS;
    }

    /**
     * 설정 저장
     */
    private saveSettings(): void {
        localStorage.setItem('lunarview-privacy-settings', JSON.stringify(this.settings));
        if (this.onSettingsChange) {
            this.onSettingsChange(this.settings);
        }
    }

    /**
     * 프라이버시 모드 활성화/비활성화
     */
    toggle(): boolean {
        this.settings.enabled = !this.settings.enabled;
        this.saveSettings();
        return this.settings.enabled;
    }

    /**
     * 프라이버시 모드 상태 확인
     */
    isEnabled(): boolean {
        return this.settings.enabled;
    }

    /**
     * 설정 가져오기
     */
    getSettings(): PrivacySettings {
        return { ...this.settings };
    }

    /**
     * 설정 업데이트
     */
    updateSettings(updates: Partial<PrivacySettings>): void {
        this.settings = { ...this.settings, ...updates };
        this.saveSettings();
    }

    /**
     * 규칙 추가
     */
    addRule(rule: Omit<PrivacyRule, 'id'>): PrivacyRule {
        const newRule: PrivacyRule = {
            ...rule,
            id: Date.now().toString(),
        };
        this.settings.rules.push(newRule);
        this.saveSettings();
        return newRule;
    }

    /**
     * 규칙 삭제
     */
    removeRule(id: string): void {
        this.settings.rules = this.settings.rules.filter(r => r.id !== id);
        this.saveSettings();
    }

    /**
     * 규칙 토글
     */
    toggleRule(id: string): void {
        const rule = this.settings.rules.find(r => r.id === id);
        if (rule) {
            rule.enabled = !rule.enabled;
            this.saveSettings();
        }
    }

    /**
     * 창이 프라이버시 보호 대상인지 확인
     */
    shouldBlur(windowTitle: string, appName: string): boolean {
        if (!this.settings.enabled) return false;

        const titleLower = windowTitle.toLowerCase();
        const appLower = appName.toLowerCase();

        for (const rule of this.settings.rules) {
            if (!rule.enabled) continue;

            const pattern = new RegExp(rule.pattern, 'i');

            switch (rule.type) {
                case 'app':
                    if (pattern.test(appLower)) return true;
                    break;
                case 'title':
                    if (pattern.test(titleLower)) return true;
                    break;
                case 'class':
                    // 윈도우 클래스 이름 매칭 (플랫폼별 구현 필요)
                    break;
            }
        }

        return false;
    }

    /**
     * 블러 영역 계산 (실제 화면 캡처에서 사용)
     */
    getBlurRegions(
        windows: Array<{ title: string; appName: string; bounds: { x: number; y: number; width: number; height: number } }>
    ): Array<{ x: number; y: number; width: number; height: number; ruleName: string }> {
        if (!this.settings.enabled) return [];

        const regions: Array<{ x: number; y: number; width: number; height: number; ruleName: string }> = [];

        for (const window of windows) {
            const matchedRule = this.settings.rules.find(rule => {
                if (!rule.enabled) return false;
                const pattern = new RegExp(rule.pattern, 'i');

                if (rule.type === 'app') return pattern.test(window.appName.toLowerCase());
                if (rule.type === 'title') return pattern.test(window.title.toLowerCase());
                return false;
            });

            if (matchedRule) {
                regions.push({
                    ...window.bounds,
                    ruleName: matchedRule.name,
                });
            }
        }

        return regions;
    }

    /**
     * 이미지에 블러 적용 (Canvas 사용)
     */
    applyBlurToImage(
        imageData: ImageData,
        regions: Array<{ x: number; y: number; width: number; height: number }>,
        canvasCtx: CanvasRenderingContext2D
    ): ImageData {
        // 원본 이미지 그리기
        canvasCtx.putImageData(imageData, 0, 0);

        // 각 영역에 블러 적용
        for (const region of regions) {
            canvasCtx.save();

            // 블러 필터 적용
            canvasCtx.filter = `blur(${this.settings.blurIntensity / 5}px)`;

            // 영역 클리핑
            canvasCtx.beginPath();
            canvasCtx.rect(region.x, region.y, region.width, region.height);
            canvasCtx.clip();

            // 블러된 영역 다시 그리기
            canvasCtx.drawImage(canvasCtx.canvas, 0, 0);

            canvasCtx.restore();

            // 플레이스홀더 표시
            if (this.settings.showPlaceholder) {
                canvasCtx.save();
                canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                canvasCtx.fillRect(region.x, region.y, region.width, region.height);

                canvasCtx.fillStyle = '#8b5cf6';
                canvasCtx.font = 'bold 16px Inter, sans-serif';
                canvasCtx.textAlign = 'center';
                canvasCtx.textBaseline = 'middle';
                canvasCtx.fillText(
                    '🔒 프라이버시 보호됨',
                    region.x + region.width / 2,
                    region.y + region.height / 2
                );
                canvasCtx.restore();
            }
        }

        return canvasCtx.getImageData(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height);
    }

    /**
     * 설정 변경 리스너
     */
    onSettingsChanged(callback: (settings: PrivacySettings) => void): void {
        this.onSettingsChange = callback;
    }
}

// 싱글톤 인스턴스
let instance: PrivacyModeService | null = null;

export function getPrivacyModeService(): PrivacyModeService {
    if (!instance) {
        instance = new PrivacyModeService();
    }
    return instance;
}

export default PrivacyModeService;
