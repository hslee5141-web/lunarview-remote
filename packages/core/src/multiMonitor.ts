/**
 * Multi-Monitor Service
 * 듀얼/멀티 모니터 지원
 */

export interface MonitorInfo {
    id: string;
    name: string;
    width: number;
    height: number;
    x: number; // 모니터 위치 (가상 데스크톱 기준)
    y: number;
    scaleFactor: number;
    isPrimary: boolean;
    isActive: boolean; // 현재 캡처 중인지
}

export interface MonitorLayout {
    monitors: MonitorInfo[];
    totalWidth: number;
    totalHeight: number;
    primaryIndex: number;
}

export interface MonitorSettings {
    showAllMonitors: boolean; // 모든 모니터 동시 표시
    autoSwitchOnCursor: boolean; // 커서 이동 시 자동 전환
    captureMouseMonitor: boolean; // 마우스가 있는 모니터만 캡처
}

const DEFAULT_SETTINGS: MonitorSettings = {
    showAllMonitors: false,
    autoSwitchOnCursor: true,
    captureMouseMonitor: true,
};

class MultiMonitorService {
    private monitors: MonitorInfo[] = [];
    private activeMonitorId: string | null = null;
    private settings: MonitorSettings;
    private onMonitorChange: ((monitor: MonitorInfo) => void) | null = null;
    private onLayoutChange: ((layout: MonitorLayout) => void) | null = null;

    constructor() {
        this.settings = this.loadSettings();
    }

    /**
     * 설정 로드
     */
    private loadSettings(): MonitorSettings {
        const saved = localStorage.getItem('lunarview-monitor-settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    }

    /**
     * 설정 저장
     */
    saveSettings(settings: Partial<MonitorSettings>): void {
        this.settings = { ...this.settings, ...settings };
        localStorage.setItem('lunarview-monitor-settings', JSON.stringify(this.settings));
    }

    /**
     * 모니터 목록 업데이트 (Electron에서 호출)
     */
    updateMonitors(monitors: Omit<MonitorInfo, 'isActive'>[]): void {
        this.monitors = monitors.map((m, i) => ({
            ...m,
            isActive: this.activeMonitorId === m.id || (this.activeMonitorId === null && m.isPrimary),
        }));

        // 기본 활성 모니터 설정
        if (!this.activeMonitorId) {
            const primary = this.monitors.find(m => m.isPrimary);
            if (primary) {
                this.activeMonitorId = primary.id;
                primary.isActive = true;
            }
        }

        if (this.onLayoutChange) {
            this.onLayoutChange(this.getLayout());
        }
    }

    /**
     * 모니터 목록 가져오기
     */
    getMonitors(): MonitorInfo[] {
        return [...this.monitors];
    }

    /**
     * 레이아웃 정보 가져오기
     */
    getLayout(): MonitorLayout {
        let minX = 0, minY = 0, maxX = 0, maxY = 0;

        for (const monitor of this.monitors) {
            minX = Math.min(minX, monitor.x);
            minY = Math.min(minY, monitor.y);
            maxX = Math.max(maxX, monitor.x + monitor.width);
            maxY = Math.max(maxY, monitor.y + monitor.height);
        }

        return {
            monitors: this.monitors,
            totalWidth: maxX - minX,
            totalHeight: maxY - minY,
            primaryIndex: this.monitors.findIndex(m => m.isPrimary),
        };
    }

    /**
     * 활성 모니터 가져오기
     */
    getActiveMonitor(): MonitorInfo | null {
        return this.monitors.find(m => m.isActive) || null;
    }

    /**
     * 모니터 전환
     */
    switchMonitor(monitorId: string): MonitorInfo | null {
        const monitor = this.monitors.find(m => m.id === monitorId);
        if (!monitor) return null;

        // 이전 활성 모니터 비활성화
        for (const m of this.monitors) {
            m.isActive = false;
        }

        // 새 모니터 활성화
        monitor.isActive = true;
        this.activeMonitorId = monitorId;

        if (this.onMonitorChange) {
            this.onMonitorChange(monitor);
        }

        return monitor;
    }

    /**
     * 다음 모니터로 전환
     */
    switchToNext(): MonitorInfo | null {
        const currentIndex = this.monitors.findIndex(m => m.isActive);
        const nextIndex = (currentIndex + 1) % this.monitors.length;
        return this.switchMonitor(this.monitors[nextIndex].id);
    }

    /**
     * 이전 모니터로 전환
     */
    switchToPrevious(): MonitorInfo | null {
        const currentIndex = this.monitors.findIndex(m => m.isActive);
        const prevIndex = (currentIndex - 1 + this.monitors.length) % this.monitors.length;
        return this.switchMonitor(this.monitors[prevIndex].id);
    }

    /**
     * 주 모니터로 전환
     */
    switchToPrimary(): MonitorInfo | null {
        const primary = this.monitors.find(m => m.isPrimary);
        return primary ? this.switchMonitor(primary.id) : null;
    }

    /**
     * 모니터 개수
     */
    getMonitorCount(): number {
        return this.monitors.length;
    }

    /**
     * 멀티 모니터 여부
     */
    hasMultipleMonitors(): boolean {
        return this.monitors.length > 1;
    }

    /**
     * 좌표를 특정 모니터 좌표로 변환
     */
    convertToMonitorCoords(
        globalX: number,
        globalY: number,
        monitorId?: string
    ): { x: number; y: number; monitor: MonitorInfo } | null {
        const monitor = monitorId
            ? this.monitors.find(m => m.id === monitorId)
            : this.getActiveMonitor();

        if (!monitor) return null;

        return {
            x: globalX - monitor.x,
            y: globalY - monitor.y,
            monitor,
        };
    }

    /**
     * 모니터 좌표를 글로벌 좌표로 변환
     */
    convertToGlobalCoords(
        localX: number,
        localY: number,
        monitorId?: string
    ): { x: number; y: number } | null {
        const monitor = monitorId
            ? this.monitors.find(m => m.id === monitorId)
            : this.getActiveMonitor();

        if (!monitor) return null;

        return {
            x: localX + monitor.x,
            y: localY + monitor.y,
        };
    }

    /**
     * 좌표가 포함된 모니터 찾기
     */
    getMonitorAtPoint(globalX: number, globalY: number): MonitorInfo | null {
        return this.monitors.find(m =>
            globalX >= m.x &&
            globalX < m.x + m.width &&
            globalY >= m.y &&
            globalY < m.y + m.height
        ) || null;
    }

    /**
     * 썸네일 레이아웃 생성 (모니터 선택 UI용)
     */
    getThumbnailLayout(maxWidth: number, maxHeight: number): Array<{
        monitor: MonitorInfo;
        x: number;
        y: number;
        width: number;
        height: number;
    }> {
        const layout = this.getLayout();
        const scale = Math.min(
            maxWidth / layout.totalWidth,
            maxHeight / layout.totalHeight
        );

        // 최소 오프셋 계산
        let minX = Infinity, minY = Infinity;
        for (const m of this.monitors) {
            minX = Math.min(minX, m.x);
            minY = Math.min(minY, m.y);
        }

        return this.monitors.map(monitor => ({
            monitor,
            x: (monitor.x - minX) * scale,
            y: (monitor.y - minY) * scale,
            width: monitor.width * scale,
            height: monitor.height * scale,
        }));
    }

    /**
     * 설정 가져오기
     */
    getSettings(): MonitorSettings {
        return { ...this.settings };
    }

    /**
     * 이벤트 핸들러
     */
    onMonitorChanged(callback: (monitor: MonitorInfo) => void): void {
        this.onMonitorChange = callback;
    }

    onLayoutChanged(callback: (layout: MonitorLayout) => void): void {
        this.onLayoutChange = callback;
    }
}

// 싱글톤 인스턴스
let instance: MultiMonitorService | null = null;

export function getMultiMonitorService(): MultiMonitorService {
    if (!instance) {
        instance = new MultiMonitorService();
    }
    return instance;
}

export default MultiMonitorService;
