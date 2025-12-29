/**
 * Whiteboard Overlay Service
 * 화면 위 그리기/주석 도구
 */

export type ToolType = 'pen' | 'highlighter' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'arrow' | 'text';

export interface DrawingPoint {
    x: number;
    y: number;
    pressure?: number;
}

export interface DrawingPath {
    id: string;
    tool: ToolType;
    points: DrawingPoint[];
    color: string;
    width: number;
    opacity: number;
    timestamp: number;
}

export interface TextAnnotation {
    id: string;
    x: number;
    y: number;
    text: string;
    color: string;
    fontSize: number;
    timestamp: number;
}

export interface WhiteboardState {
    isActive: boolean;
    currentTool: ToolType;
    currentColor: string;
    currentWidth: number;
    paths: DrawingPath[];
    texts: TextAnnotation[];
}

const TOOL_DEFAULTS: Record<ToolType, { width: number; opacity: number }> = {
    pen: { width: 3, opacity: 1 },
    highlighter: { width: 20, opacity: 0.4 },
    eraser: { width: 30, opacity: 1 },
    line: { width: 3, opacity: 1 },
    rectangle: { width: 3, opacity: 1 },
    circle: { width: 3, opacity: 1 },
    arrow: { width: 3, opacity: 1 },
    text: { width: 1, opacity: 1 },
};

const COLOR_PALETTE = [
    '#ef4444', '#f59e0b', '#10b981', '#06b6d4',
    '#8b5cf6', '#ec4899', '#ffffff', '#000000',
];

class WhiteboardService {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private state: WhiteboardState;
    private currentPath: DrawingPath | null = null;
    private isDrawing: boolean = false;
    private historyStack: DrawingPath[][] = [];
    private redoStack: DrawingPath[][] = [];
    private onStateChange: ((state: WhiteboardState) => void) | null = null;

    constructor() {
        this.state = {
            isActive: false,
            currentTool: 'pen',
            currentColor: COLOR_PALETTE[0],
            currentWidth: TOOL_DEFAULTS.pen.width,
            paths: [],
            texts: [],
        };
    }

    /**
     * 캔버스 초기화
     */
    initialize(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.setupEventListeners();
    }

    /**
     * 이벤트 리스너 설정
     */
    private setupEventListeners(): void {
        if (!this.canvas) return;

        // 마우스 이벤트
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

        // 터치 이벤트
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e, 'start'));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e, 'move'));
        this.canvas.addEventListener('touchend', () => this.stopDrawing());
    }

    /**
     * 터치 이벤트 처리
     */
    private handleTouch(e: TouchEvent, type: 'start' | 'move'): void {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas!.getBoundingClientRect();
        const mouseEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            offsetX: touch.clientX - rect.left,
            offsetY: touch.clientY - rect.top,
        } as MouseEvent;

        if (type === 'start') {
            this.startDrawing(mouseEvent);
        } else {
            this.draw(mouseEvent);
        }
    }

    /**
     * 그리기 시작
     */
    private startDrawing(e: MouseEvent): void {
        if (!this.state.isActive || !this.ctx) return;

        this.isDrawing = true;
        const point = this.getPoint(e);

        this.currentPath = {
            id: this.generateId(),
            tool: this.state.currentTool,
            points: [point],
            color: this.state.currentTool === 'eraser' ? '#000000' : this.state.currentColor,
            width: this.state.currentWidth,
            opacity: TOOL_DEFAULTS[this.state.currentTool].opacity,
            timestamp: Date.now(),
        };

        // 히스토리 저장
        this.historyStack.push([...this.state.paths]);
        this.redoStack = [];
    }

    /**
     * 그리기 진행
     */
    private draw(e: MouseEvent): void {
        if (!this.isDrawing || !this.currentPath || !this.ctx) return;

        const point = this.getPoint(e);
        this.currentPath.points.push(point);
        this.render();
    }

    /**
     * 그리기 종료
     */
    private stopDrawing(): void {
        if (!this.isDrawing || !this.currentPath) return;

        this.isDrawing = false;
        this.state.paths.push(this.currentPath);
        this.currentPath = null;
        this.notifyStateChange();
    }

    /**
     * 좌표 가져오기
     */
    private getPoint(e: MouseEvent): DrawingPoint {
        return {
            x: e.offsetX,
            y: e.offsetY,
        };
    }

    /**
     * 렌더링
     */
    render(): void {
        if (!this.ctx || !this.canvas) return;

        // 캔버스 클리어
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 저장된 경로 그리기
        for (const path of this.state.paths) {
            this.drawPath(path);
        }

        // 현재 그리는 경로
        if (this.currentPath) {
            this.drawPath(this.currentPath);
        }

        // 텍스트 주석
        for (const text of this.state.texts) {
            this.drawText(text);
        }
    }

    /**
     * 경로 그리기
     */
    private drawPath(path: DrawingPath): void {
        if (!this.ctx || path.points.length === 0) return;

        this.ctx.save();
        this.ctx.globalAlpha = path.opacity;
        this.ctx.strokeStyle = path.color;
        this.ctx.lineWidth = path.width;

        if (path.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
        }

        switch (path.tool) {
            case 'pen':
            case 'highlighter':
            case 'eraser':
                this.drawFreehand(path.points);
                break;
            case 'line':
                this.drawLine(path.points);
                break;
            case 'rectangle':
                this.drawRectangle(path.points);
                break;
            case 'circle':
                this.drawCircle(path.points);
                break;
            case 'arrow':
                this.drawArrow(path.points);
                break;
        }

        this.ctx.restore();
    }

    private drawFreehand(points: DrawingPoint[]): void {
        if (points.length < 2) return;

        this.ctx!.beginPath();
        this.ctx!.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            this.ctx!.lineTo(points[i].x, points[i].y);
        }

        this.ctx!.stroke();
    }

    private drawLine(points: DrawingPoint[]): void {
        if (points.length < 2) return;

        const start = points[0];
        const end = points[points.length - 1];

        this.ctx!.beginPath();
        this.ctx!.moveTo(start.x, start.y);
        this.ctx!.lineTo(end.x, end.y);
        this.ctx!.stroke();
    }

    private drawRectangle(points: DrawingPoint[]): void {
        if (points.length < 2) return;

        const start = points[0];
        const end = points[points.length - 1];
        const width = end.x - start.x;
        const height = end.y - start.y;

        this.ctx!.strokeRect(start.x, start.y, width, height);
    }

    private drawCircle(points: DrawingPoint[]): void {
        if (points.length < 2) return;

        const start = points[0];
        const end = points[points.length - 1];
        const radius = Math.sqrt(
            Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
        );

        this.ctx!.beginPath();
        this.ctx!.arc(start.x, start.y, radius, 0, Math.PI * 2);
        this.ctx!.stroke();
    }

    private drawArrow(points: DrawingPoint[]): void {
        if (points.length < 2) return;

        const start = points[0];
        const end = points[points.length - 1];
        const headLength = 15;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        this.ctx!.beginPath();
        this.ctx!.moveTo(start.x, start.y);
        this.ctx!.lineTo(end.x, end.y);
        this.ctx!.lineTo(
            end.x - headLength * Math.cos(angle - Math.PI / 6),
            end.y - headLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx!.moveTo(end.x, end.y);
        this.ctx!.lineTo(
            end.x - headLength * Math.cos(angle + Math.PI / 6),
            end.y - headLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx!.stroke();
    }

    private drawText(text: TextAnnotation): void {
        if (!this.ctx) return;

        this.ctx.save();
        this.ctx.font = `${text.fontSize}px Inter, sans-serif`;
        this.ctx.fillStyle = text.color;
        this.ctx.fillText(text.text, text.x, text.y);
        this.ctx.restore();
    }

    /**
     * 화이트보드 활성화/비활성화
     */
    toggle(): boolean {
        this.state.isActive = !this.state.isActive;
        this.notifyStateChange();
        return this.state.isActive;
    }

    /**
     * 도구 선택
     */
    setTool(tool: ToolType): void {
        this.state.currentTool = tool;
        this.state.currentWidth = TOOL_DEFAULTS[tool].width;
        this.notifyStateChange();
    }

    /**
     * 색상 선택
     */
    setColor(color: string): void {
        this.state.currentColor = color;
        this.notifyStateChange();
    }

    /**
     * 두께 선택
     */
    setWidth(width: number): void {
        this.state.currentWidth = width;
        this.notifyStateChange();
    }

    /**
     * 텍스트 추가
     */
    addText(x: number, y: number, text: string): TextAnnotation {
        const annotation: TextAnnotation = {
            id: this.generateId(),
            x,
            y,
            text,
            color: this.state.currentColor,
            fontSize: 16,
            timestamp: Date.now(),
        };

        this.state.texts.push(annotation);
        this.render();
        this.notifyStateChange();

        return annotation;
    }

    /**
     * 전체 지우기
     */
    clear(): void {
        this.historyStack.push([...this.state.paths]);
        this.state.paths = [];
        this.state.texts = [];
        this.render();
        this.notifyStateChange();
    }

    /**
     * 실행 취소
     */
    undo(): void {
        if (this.historyStack.length === 0) return;

        this.redoStack.push([...this.state.paths]);
        this.state.paths = this.historyStack.pop()!;
        this.render();
        this.notifyStateChange();
    }

    /**
     * 다시 실행
     */
    redo(): void {
        if (this.redoStack.length === 0) return;

        this.historyStack.push([...this.state.paths]);
        this.state.paths = this.redoStack.pop()!;
        this.render();
        this.notifyStateChange();
    }

    /**
     * 상태 가져오기
     */
    getState(): WhiteboardState {
        return { ...this.state };
    }

    /**
     * 색상 팔레트
     */
    getColorPalette(): string[] {
        return COLOR_PALETTE;
    }

    /**
     * 이미지로 내보내기
     */
    exportAsImage(): string {
        if (!this.canvas) return '';
        return this.canvas.toDataURL('image/png');
    }

    /**
     * 상태 변경 리스너
     */
    onChanged(callback: (state: WhiteboardState) => void): void {
        this.onStateChange = callback;
    }

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}

// 싱글톤 인스턴스
let instance: WhiteboardService | null = null;

export function getWhiteboardService(): WhiteboardService {
    if (!instance) {
        instance = new WhiteboardService();
    }
    return instance;
}

export default WhiteboardService;
