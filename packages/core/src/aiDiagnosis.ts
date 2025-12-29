/**
 * AI Diagnosis Service
 * AI 기반 문제 진단 - 화면 캡처 후 AI가 해결책 제안
 */

export interface DiagnosisRequest {
    id: string;
    screenshot: string; // base64
    context?: string;
    timestamp: number;
}

export interface DiagnosisSuggestion {
    title: string;
    description: string;
    steps?: string[];
    confidence: number; // 0-100
    category: 'error' | 'warning' | 'tip' | 'info';
}

export interface DiagnosisResult {
    id: string;
    requestId: string;
    summary: string;
    suggestions: DiagnosisSuggestion[];
    detectedIssues: string[];
    timestamp: number;
    processingTime: number;
}

export interface DiagnosisHistory {
    request: DiagnosisRequest;
    result: DiagnosisResult | null;
    status: 'pending' | 'completed' | 'failed';
    error?: string;
}

export interface DiagnosisSettings {
    enabled: boolean;
    autoDetect: boolean; // 자동 오류 감지
    saveHistory: boolean;
    maxHistory: number;
    apiEndpoint?: string;
}

const DEFAULT_SETTINGS: DiagnosisSettings = {
    enabled: true,
    autoDetect: false,
    saveHistory: true,
    maxHistory: 50,
};

class AIDiagnosisService {
    private settings: DiagnosisSettings;
    private history: DiagnosisHistory[] = [];
    private pendingRequest: DiagnosisRequest | null = null;
    private onDiagnosisComplete: ((result: DiagnosisResult) => void) | null = null;
    private onDiagnosisStart: (() => void) | null = null;

    constructor() {
        this.settings = this.loadSettings();
        this.history = this.loadHistory();
    }

    /**
     * 설정 로드
     */
    private loadSettings(): DiagnosisSettings {
        const saved = localStorage.getItem('lunarview-ai-settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    }

    /**
     * 설정 저장
     */
    saveSettings(settings: Partial<DiagnosisSettings>): void {
        this.settings = { ...this.settings, ...settings };
        localStorage.setItem('lunarview-ai-settings', JSON.stringify(this.settings));
    }

    /**
     * 히스토리 로드
     */
    private loadHistory(): DiagnosisHistory[] {
        if (!this.settings.saveHistory) return [];
        const saved = localStorage.getItem('lunarview-ai-history');
        return saved ? JSON.parse(saved) : [];
    }

    /**
     * 히스토리 저장
     */
    private saveHistory(): void {
        if (!this.settings.saveHistory) return;
        localStorage.setItem('lunarview-ai-history', JSON.stringify(this.history));
    }

    /**
     * 화면 캡처 및 진단 요청
     */
    async diagnose(canvas: HTMLCanvasElement, context?: string): Promise<DiagnosisResult> {
        if (!this.settings.enabled) {
            throw new Error('AI Diagnosis is disabled');
        }

        // 화면 캡처
        const screenshot = canvas.toDataURL('image/jpeg', 0.8);

        const request: DiagnosisRequest = {
            id: this.generateId(),
            screenshot,
            context,
            timestamp: Date.now(),
        };

        this.pendingRequest = request;

        // 히스토리에 추가
        const historyEntry: DiagnosisHistory = {
            request,
            result: null,
            status: 'pending',
        };
        this.history.unshift(historyEntry);

        if (this.onDiagnosisStart) {
            this.onDiagnosisStart();
        }

        try {
            // AI 분석 실행
            const result = await this.analyzeWithAI(request);

            // 결과 저장
            historyEntry.result = result;
            historyEntry.status = 'completed';
            this.saveHistory();

            if (this.onDiagnosisComplete) {
                this.onDiagnosisComplete(result);
            }

            return result;
        } catch (error) {
            historyEntry.status = 'failed';
            historyEntry.error = error instanceof Error ? error.message : 'Unknown error';
            this.saveHistory();
            throw error;
        } finally {
            this.pendingRequest = null;
            this.trimHistory();
        }
    }

    /**
     * AI 분석 (실제 구현에서는 API 호출)
     */
    private async analyzeWithAI(request: DiagnosisRequest): Promise<DiagnosisResult> {
        const startTime = Date.now();

        // 시뮬레이션을 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 실제 구현에서는 AI API 호출
        // const response = await fetch(this.settings.apiEndpoint, {
        //     method: 'POST',
        //     body: JSON.stringify({ image: request.screenshot, context: request.context }),
        // });

        // 데모용 결과 생성
        const result: DiagnosisResult = {
            id: this.generateId(),
            requestId: request.id,
            summary: this.generateDemoSummary(),
            suggestions: this.generateDemoSuggestions(),
            detectedIssues: this.generateDemoIssues(),
            timestamp: Date.now(),
            processingTime: Date.now() - startTime,
        };

        return result;
    }

    /**
     * 데모 요약 생성
     */
    private generateDemoSummary(): string {
        const summaries = [
            '화면을 분석한 결과, 시스템이 정상적으로 작동하고 있습니다.',
            '몇 가지 최적화 가능한 항목이 발견되었습니다.',
            '오류 대화상자가 감지되었습니다. 해결책을 확인하세요.',
            '네트워크 연결 문제가 감지되었습니다.',
        ];
        return summaries[Math.floor(Math.random() * summaries.length)];
    }

    /**
     * 데모 제안 생성
     */
    private generateDemoSuggestions(): DiagnosisSuggestion[] {
        const allSuggestions: DiagnosisSuggestion[] = [
            {
                title: '시스템 재시작 권장',
                description: '오랜 시간 동안 실행된 프로세스가 감지되었습니다.',
                steps: ['작업을 저장하세요', '시스템을 재시작하세요', '문제가 지속되면 다시 진단하세요'],
                confidence: 85,
                category: 'tip',
            },
            {
                title: '디스크 공간 부족',
                description: '저장 공간이 10% 미만입니다.',
                steps: ['불필요한 파일을 삭제하세요', '휴지통을 비우세요'],
                confidence: 92,
                category: 'warning',
            },
            {
                title: '네트워크 연결 확인',
                description: 'DNS 응답 시간이 느립니다.',
                steps: ['네트워크 어댑터를 재시작하세요', 'DNS 설정을 확인하세요'],
                confidence: 78,
                category: 'info',
            },
            {
                title: '응용 프로그램 오류',
                description: '응답하지 않는 프로그램이 감지되었습니다.',
                steps: ['작업 관리자를 열어 프로그램을 종료하세요', '프로그램을 다시 실행하세요'],
                confidence: 88,
                category: 'error',
            },
        ];

        // 랜덤하게 1-3개 선택
        const count = Math.floor(Math.random() * 3) + 1;
        return allSuggestions.sort(() => Math.random() - 0.5).slice(0, count);
    }

    /**
     * 데모 이슈 생성
     */
    private generateDemoIssues(): string[] {
        const issues = [
            '높은 CPU 사용률',
            '메모리 부족 경고',
            '응답 없는 프로세스',
            '네트워크 지연',
            '디스크 I/O 병목',
        ];
        const count = Math.floor(Math.random() * 3);
        return issues.sort(() => Math.random() - 0.5).slice(0, count);
    }

    /**
     * 히스토리 정리
     */
    private trimHistory(): void {
        if (this.history.length > this.settings.maxHistory) {
            this.history = this.history.slice(0, this.settings.maxHistory);
            this.saveHistory();
        }
    }

    /**
     * 히스토리 가져오기
     */
    getHistory(): DiagnosisHistory[] {
        return [...this.history];
    }

    /**
     * 히스토리 삭제
     */
    clearHistory(): void {
        this.history = [];
        this.saveHistory();
    }

    /**
     * 설정 가져오기
     */
    getSettings(): DiagnosisSettings {
        return { ...this.settings };
    }

    /**
     * 진단 중인지 확인
     */
    isPending(): boolean {
        return this.pendingRequest !== null;
    }

    /**
     * 이벤트 핸들러
     */
    onComplete(callback: (result: DiagnosisResult) => void): void {
        this.onDiagnosisComplete = callback;
    }

    onStart(callback: () => void): void {
        this.onDiagnosisStart = callback;
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}

// 싱글톤 인스턴스
let instance: AIDiagnosisService | null = null;

export function getAIDiagnosisService(): AIDiagnosisService {
    if (!instance) {
        instance = new AIDiagnosisService();
    }
    return instance;
}

export default AIDiagnosisService;
