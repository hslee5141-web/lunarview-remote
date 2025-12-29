/**
 * Command Palette Service
 * 빠른 명령 팔레트 (Cmd+K / Ctrl+K)
 */

export interface Command {
    id: string;
    title: string;
    description?: string;
    icon?: string;
    shortcut?: string;
    category: CommandCategory;
    action: () => void | Promise<void>;
    enabled?: () => boolean;
}

export type CommandCategory =
    | 'connection'
    | 'view'
    | 'tools'
    | 'settings'
    | 'help'
    | 'recent';

export interface CommandPaletteState {
    isOpen: boolean;
    query: string;
    selectedIndex: number;
    results: Command[];
}

class CommandPaletteService {
    private commands: Map<string, Command> = new Map();
    private recentCommands: string[] = [];
    private state: CommandPaletteState = {
        isOpen: false,
        query: '',
        selectedIndex: 0,
        results: [],
    };
    private onStateChange: ((state: CommandPaletteState) => void) | null = null;
    private maxRecentCommands = 5;

    constructor() {
        this.loadRecentCommands();
        this.registerDefaultCommands();
        this.setupKeyboardShortcut();
    }

    /**
     * 기본 명령 등록
     */
    private registerDefaultCommands(): void {
        // 연결 관련
        this.register({
            id: 'connection:connect',
            title: '새 연결',
            description: '원격 PC에 연결합니다',
            icon: '🔗',
            shortcut: 'Ctrl+N',
            category: 'connection',
            action: () => console.log('Connect'),
        });

        this.register({
            id: 'connection:disconnect',
            title: '연결 해제',
            description: '현재 연결을 종료합니다',
            icon: '🔌',
            category: 'connection',
            action: () => console.log('Disconnect'),
        });

        this.register({
            id: 'connection:favorites',
            title: '즐겨찾기 열기',
            description: '저장된 연결 목록을 봅니다',
            icon: '⭐',
            shortcut: 'Ctrl+B',
            category: 'connection',
            action: () => console.log('Favorites'),
        });

        // 뷰 관련
        this.register({
            id: 'view:fullscreen',
            title: '전체 화면',
            description: '전체 화면 모드로 전환합니다',
            icon: '⛶',
            shortcut: 'F11',
            category: 'view',
            action: () => document.documentElement.requestFullscreen?.(),
        });

        this.register({
            id: 'view:pip',
            title: 'PIP 모드',
            description: '작은 창으로 보기',
            icon: '🪟',
            category: 'view',
            action: () => console.log('PIP'),
        });

        this.register({
            id: 'view:switch-monitor',
            title: '모니터 전환',
            description: '다른 모니터로 전환합니다',
            icon: '🖥️',
            shortcut: 'Ctrl+M',
            category: 'view',
            action: () => console.log('Switch Monitor'),
        });

        // 도구 관련
        this.register({
            id: 'tools:whiteboard',
            title: '화이트보드',
            description: '화면에 그리기 도구 열기',
            icon: '✏️',
            shortcut: 'Ctrl+D',
            category: 'tools',
            action: () => console.log('Whiteboard'),
        });

        this.register({
            id: 'tools:screenshot',
            title: '화면 캡처',
            description: '현재 화면을 캡처합니다',
            icon: '📷',
            shortcut: 'Ctrl+Shift+S',
            category: 'tools',
            action: () => console.log('Screenshot'),
        });

        this.register({
            id: 'tools:record',
            title: '녹화 시작/중지',
            description: '세션 녹화를 시작하거나 중지합니다',
            icon: '🔴',
            shortcut: 'Ctrl+R',
            category: 'tools',
            action: () => console.log('Record'),
        });

        this.register({
            id: 'tools:clipboard',
            title: '클립보드 동기화',
            description: '클립보드 내용을 전송합니다',
            icon: '📋',
            shortcut: 'Ctrl+Shift+V',
            category: 'tools',
            action: () => console.log('Clipboard'),
        });

        this.register({
            id: 'tools:file-transfer',
            title: '파일 전송',
            description: '파일 전송 창을 엽니다',
            icon: '📁',
            shortcut: 'Ctrl+T',
            category: 'tools',
            action: () => console.log('File Transfer'),
        });

        this.register({
            id: 'tools:ai-diagnose',
            title: 'AI 문제 진단',
            description: 'AI가 현재 화면을 분석하고 해결책을 제안합니다',
            icon: '🤖',
            shortcut: 'Ctrl+Shift+A',
            category: 'tools',
            action: () => console.log('AI Diagnose'),
        });

        // 설정 관련
        this.register({
            id: 'settings:open',
            title: '설정 열기',
            description: '설정 페이지를 엽니다',
            icon: '⚙️',
            shortcut: 'Ctrl+,',
            category: 'settings',
            action: () => console.log('Settings'),
        });

        this.register({
            id: 'settings:privacy',
            title: '프라이버시 모드 토글',
            description: '민감한 창 블러 처리 켜기/끄기',
            icon: '🔒',
            shortcut: 'Ctrl+P',
            category: 'settings',
            action: () => console.log('Privacy Mode'),
        });

        this.register({
            id: 'settings:watermark',
            title: '워터마크 토글',
            description: '화면 워터마크 켜기/끄기',
            icon: '💧',
            category: 'settings',
            action: () => console.log('Watermark'),
        });

        // 도움말
        this.register({
            id: 'help:shortcuts',
            title: '단축키 보기',
            description: '모든 단축키 목록을 봅니다',
            icon: '⌨️',
            shortcut: 'Ctrl+/',
            category: 'help',
            action: () => console.log('Shortcuts'),
        });

        this.register({
            id: 'help:about',
            title: '정보',
            description: 'LunarView 버전 정보',
            icon: 'ℹ️',
            category: 'help',
            action: () => console.log('About'),
        });
    }

    /**
     * 키보드 단축키 설정
     */
    private setupKeyboardShortcut(): void {
        if (typeof window === 'undefined') return;

        window.addEventListener('keydown', (e) => {
            // Cmd+K or Ctrl+K
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }

            // Escape to close
            if (e.key === 'Escape' && this.state.isOpen) {
                this.close();
            }

            // Arrow navigation
            if (this.state.isOpen) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.selectNext();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.selectPrevious();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executeSelected();
                }
            }
        });
    }

    /**
     * 명령 등록
     */
    register(command: Command): void {
        this.commands.set(command.id, command);
    }

    /**
     * 명령 해제
     */
    unregister(id: string): void {
        this.commands.delete(id);
    }

    /**
     * 팔레트 토글
     */
    toggle(): void {
        if (this.state.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * 팔레트 열기
     */
    open(): void {
        this.state = {
            isOpen: true,
            query: '',
            selectedIndex: 0,
            results: this.getRecentCommandsList(),
        };
        this.notifyStateChange();
    }

    /**
     * 팔레트 닫기
     */
    close(): void {
        this.state = {
            ...this.state,
            isOpen: false,
            query: '',
            selectedIndex: 0,
        };
        this.notifyStateChange();
    }

    /**
     * 검색
     */
    search(query: string): void {
        this.state.query = query;
        this.state.selectedIndex = 0;

        if (!query.trim()) {
            this.state.results = this.getRecentCommandsList();
        } else {
            const lowerQuery = query.toLowerCase();
            this.state.results = Array.from(this.commands.values())
                .filter(cmd => {
                    const enabled = cmd.enabled ? cmd.enabled() : true;
                    if (!enabled) return false;

                    return (
                        cmd.title.toLowerCase().includes(lowerQuery) ||
                        cmd.description?.toLowerCase().includes(lowerQuery) ||
                        cmd.category.includes(lowerQuery)
                    );
                })
                .sort((a, b) => {
                    // 최근 사용 우선
                    const aRecent = this.recentCommands.indexOf(a.id);
                    const bRecent = this.recentCommands.indexOf(b.id);
                    if (aRecent !== -1 && bRecent === -1) return -1;
                    if (bRecent !== -1 && aRecent === -1) return 1;

                    // 제목 매칭 우선
                    const aTitle = a.title.toLowerCase().startsWith(lowerQuery);
                    const bTitle = b.title.toLowerCase().startsWith(lowerQuery);
                    if (aTitle && !bTitle) return -1;
                    if (bTitle && !aTitle) return 1;

                    return a.title.localeCompare(b.title);
                });
        }

        this.notifyStateChange();
    }

    /**
     * 다음 항목 선택
     */
    selectNext(): void {
        if (this.state.results.length === 0) return;
        this.state.selectedIndex = (this.state.selectedIndex + 1) % this.state.results.length;
        this.notifyStateChange();
    }

    /**
     * 이전 항목 선택
     */
    selectPrevious(): void {
        if (this.state.results.length === 0) return;
        this.state.selectedIndex =
            (this.state.selectedIndex - 1 + this.state.results.length) % this.state.results.length;
        this.notifyStateChange();
    }

    /**
     * 선택된 명령 실행
     */
    async executeSelected(): Promise<void> {
        const command = this.state.results[this.state.selectedIndex];
        if (command) {
            await this.execute(command.id);
        }
    }

    /**
     * 명령 실행
     */
    async execute(id: string): Promise<void> {
        const command = this.commands.get(id);
        if (!command) return;

        // 최근 명령 업데이트
        this.addToRecent(id);

        // 팔레트 닫기
        this.close();

        // 명령 실행
        try {
            await command.action();
        } catch (error) {
            console.error(`Command execution failed: ${id}`, error);
        }
    }

    /**
     * 최근 명령 추가
     */
    private addToRecent(id: string): void {
        this.recentCommands = [
            id,
            ...this.recentCommands.filter(c => c !== id),
        ].slice(0, this.maxRecentCommands);

        localStorage.setItem('lunarview-recent-commands', JSON.stringify(this.recentCommands));
    }

    /**
     * 최근 명령 로드
     */
    private loadRecentCommands(): void {
        const saved = localStorage.getItem('lunarview-recent-commands');
        if (saved) {
            this.recentCommands = JSON.parse(saved);
        }
    }

    /**
     * 최근 명령 목록
     */
    private getRecentCommandsList(): Command[] {
        return this.recentCommands
            .map(id => this.commands.get(id))
            .filter((cmd): cmd is Command => !!cmd);
    }

    /**
     * 모든 명령 가져오기
     */
    getAllCommands(): Command[] {
        return Array.from(this.commands.values());
    }

    /**
     * 카테고리별 명령 가져오기
     */
    getCommandsByCategory(category: CommandCategory): Command[] {
        return Array.from(this.commands.values())
            .filter(cmd => cmd.category === category);
    }

    /**
     * 상태 가져오기
     */
    getState(): CommandPaletteState {
        return { ...this.state };
    }

    /**
     * 상태 변경 리스너
     */
    onChanged(callback: (state: CommandPaletteState) => void): void {
        this.onStateChange = callback;
    }

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }
}

// 싱글톤 인스턴스
let instance: CommandPaletteService | null = null;

export function getCommandPaletteService(): CommandPaletteService {
    if (!instance) {
        instance = new CommandPaletteService();
    }
    return instance;
}

export default CommandPaletteService;
