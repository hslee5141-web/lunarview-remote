/**
 * Multi-Cursor Collaboration Service
 * 멀티 커서 협업 - 여러 사용자가 동시에 마우스 제어
 */

export interface CursorUser {
    id: string;
    name: string;
    color: string;
    avatar?: string;
}

export interface CursorPosition {
    userId: string;
    x: number;
    y: number;
    isClicking: boolean;
    timestamp: number;
}

export interface CollaborationSession {
    id: string;
    hostId: string;
    participants: CursorUser[];
    createdAt: number;
    settings: CollaborationSettings;
}

export interface CollaborationSettings {
    maxParticipants: number;
    allowMultipleControl: boolean;
    showCursorTrail: boolean;
    cursorSize: 'small' | 'medium' | 'large';
}

// 커서 색상 팔레트
const CURSOR_COLORS = [
    '#8b5cf6', // Purple (host)
    '#06b6d4', // Cyan
    '#10b981', // Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#ec4899', // Pink
    '#6366f1', // Indigo
    '#14b8a6', // Teal
];

const DEFAULT_SETTINGS: CollaborationSettings = {
    maxParticipants: 5,
    allowMultipleControl: true,
    showCursorTrail: true,
    cursorSize: 'medium',
};

class MultiCursorService {
    private session: CollaborationSession | null = null;
    private cursors: Map<string, CursorPosition> = new Map();
    private localUser: CursorUser | null = null;
    private onCursorUpdate: ((cursors: CursorPosition[]) => void) | null = null;
    private onParticipantChange: ((participants: CursorUser[]) => void) | null = null;
    private cursorTrails: Map<string, Array<{ x: number; y: number; timestamp: number }>> = new Map();

    /**
     * 협업 세션 시작 (호스트)
     */
    startSession(hostName: string): CollaborationSession {
        const hostId = this.generateId();

        this.localUser = {
            id: hostId,
            name: hostName,
            color: CURSOR_COLORS[0],
        };

        this.session = {
            id: this.generateId(),
            hostId,
            participants: [this.localUser],
            createdAt: Date.now(),
            settings: DEFAULT_SETTINGS,
        };

        return this.session;
    }

    /**
     * 세션 참가 (게스트)
     */
    joinSession(sessionId: string, userName: string): CursorUser {
        if (!this.session || this.session.id !== sessionId) {
            throw new Error('Invalid session');
        }

        if (this.session.participants.length >= this.session.settings.maxParticipants) {
            throw new Error('Session is full');
        }

        const userId = this.generateId();
        const colorIndex = this.session.participants.length % CURSOR_COLORS.length;

        this.localUser = {
            id: userId,
            name: userName,
            color: CURSOR_COLORS[colorIndex],
        };

        this.session.participants.push(this.localUser);
        this.notifyParticipantChange();

        return this.localUser;
    }

    /**
     * 세션 나가기
     */
    leaveSession(): void {
        if (!this.session || !this.localUser) return;

        this.session.participants = this.session.participants.filter(
            p => p.id !== this.localUser?.id
        );

        this.cursors.delete(this.localUser.id);
        this.cursorTrails.delete(this.localUser.id);
        this.notifyParticipantChange();

        this.localUser = null;

        // 호스트가 나가면 세션 종료
        if (this.session.participants.length === 0) {
            this.session = null;
        }
    }

    /**
     * 커서 위치 업데이트
     */
    updateCursor(x: number, y: number, isClicking: boolean = false): void {
        if (!this.localUser) return;

        const position: CursorPosition = {
            userId: this.localUser.id,
            x,
            y,
            isClicking,
            timestamp: Date.now(),
        };

        this.cursors.set(this.localUser.id, position);

        // 커서 트레일 업데이트
        if (this.session?.settings.showCursorTrail) {
            this.updateCursorTrail(this.localUser.id, x, y);
        }

        this.notifyCursorUpdate();
    }

    /**
     * 원격 커서 위치 수신
     */
    receiveRemoteCursor(position: CursorPosition): void {
        this.cursors.set(position.userId, position);

        if (this.session?.settings.showCursorTrail) {
            this.updateCursorTrail(position.userId, position.x, position.y);
        }

        this.notifyCursorUpdate();
    }

    /**
     * 커서 트레일 업데이트
     */
    private updateCursorTrail(userId: string, x: number, y: number): void {
        if (!this.cursorTrails.has(userId)) {
            this.cursorTrails.set(userId, []);
        }

        const trail = this.cursorTrails.get(userId)!;
        const now = Date.now();

        // 새 포인트 추가
        trail.push({ x, y, timestamp: now });

        // 500ms 이상 된 포인트 제거
        while (trail.length > 0 && now - trail[0].timestamp > 500) {
            trail.shift();
        }

        // 최대 20개 포인트
        while (trail.length > 20) {
            trail.shift();
        }
    }

    /**
     * 모든 커서 위치 가져오기
     */
    getAllCursors(): Array<CursorPosition & { user: CursorUser }> {
        const result: Array<CursorPosition & { user: CursorUser }> = [];

        this.cursors.forEach((position, userId) => {
            const user = this.session?.participants.find(p => p.id === userId);
            if (user) {
                result.push({ ...position, user });
            }
        });

        return result;
    }

    /**
     * 커서 트레일 가져오기
     */
    getCursorTrail(userId: string): Array<{ x: number; y: number; opacity: number }> {
        const trail = this.cursorTrails.get(userId) || [];
        const now = Date.now();

        return trail.map(point => ({
            x: point.x,
            y: point.y,
            opacity: 1 - (now - point.timestamp) / 500,
        }));
    }

    /**
     * 커서 렌더링 (Canvas에 그리기)
     */
    renderCursors(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
        const cursors = this.getAllCursors();

        for (const cursor of cursors) {
            // 본인 커서는 건너뛰기
            if (cursor.userId === this.localUser?.id) continue;

            const x = cursor.x * scaleX;
            const y = cursor.y * scaleY;

            // 커서 트레일 그리기
            if (this.session?.settings.showCursorTrail) {
                const trail = this.getCursorTrail(cursor.userId);
                if (trail.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(trail[0].x * scaleX, trail[0].y * scaleY);

                    for (let i = 1; i < trail.length; i++) {
                        ctx.lineTo(trail[i].x * scaleX, trail[i].y * scaleY);
                    }

                    ctx.strokeStyle = cursor.user.color + '40';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                }
            }

            // 커서 그리기
            ctx.save();
            ctx.translate(x, y);

            // 클릭 효과
            if (cursor.isClicking) {
                ctx.beginPath();
                ctx.arc(0, 0, 20, 0, Math.PI * 2);
                ctx.fillStyle = cursor.user.color + '30';
                ctx.fill();
            }

            // 커서 아이콘 (화살표)
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, 20);
            ctx.lineTo(5, 15);
            ctx.lineTo(10, 24);
            ctx.lineTo(14, 22);
            ctx.lineTo(9, 13);
            ctx.lineTo(15, 11);
            ctx.closePath();

            ctx.fillStyle = cursor.user.color;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 사용자 이름 표시
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillStyle = cursor.user.color;
            ctx.textAlign = 'left';
            ctx.fillText(cursor.user.name, 18, 20);

            ctx.restore();
        }
    }

    /**
     * 설정 업데이트
     */
    updateSettings(settings: Partial<CollaborationSettings>): void {
        if (!this.session) return;
        this.session.settings = { ...this.session.settings, ...settings };
    }

    /**
     * 현재 세션 정보
     */
    getSession(): CollaborationSession | null {
        return this.session;
    }

    /**
     * 현재 사용자 정보
     */
    getCurrentUser(): CursorUser | null {
        return this.localUser;
    }

    /**
     * 이벤트 핸들러 설정
     */
    onCursorChanged(callback: (cursors: CursorPosition[]) => void): void {
        this.onCursorUpdate = callback;
    }

    onParticipantsChanged(callback: (participants: CursorUser[]) => void): void {
        this.onParticipantChange = callback;
    }

    private notifyCursorUpdate(): void {
        if (this.onCursorUpdate) {
            this.onCursorUpdate(Array.from(this.cursors.values()));
        }
    }

    private notifyParticipantChange(): void {
        if (this.onParticipantChange && this.session) {
            this.onParticipantChange(this.session.participants);
        }
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}

// 싱글톤 인스턴스
let instance: MultiCursorService | null = null;

export function getMultiCursorService(): MultiCursorService {
    if (!instance) {
        instance = new MultiCursorService();
    }
    return instance;
}

export default MultiCursorService;
