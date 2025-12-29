/**
 * Event Bus
 * 서비스 간 통신을 위한 이벤트 시스템
 */

export type EventHandler<T = any> = (data: T) => void;

export interface EventSubscription {
    unsubscribe: () => void;
}

class EventBus {
    private handlers: Map<string, Set<EventHandler>> = new Map();
    private onceHandlers: Map<string, Set<EventHandler>> = new Map();

    /**
     * 이벤트 구독
     */
    on<T = any>(event: string, handler: EventHandler<T>): EventSubscription {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);

        return {
            unsubscribe: () => {
                this.handlers.get(event)?.delete(handler);
            },
        };
    }

    /**
     * 일회성 이벤트 구독
     */
    once<T = any>(event: string, handler: EventHandler<T>): EventSubscription {
        if (!this.onceHandlers.has(event)) {
            this.onceHandlers.set(event, new Set());
        }
        this.onceHandlers.get(event)!.add(handler);

        return {
            unsubscribe: () => {
                this.onceHandlers.get(event)?.delete(handler);
            },
        };
    }

    /**
     * 이벤트 구독 해제
     */
    off(event: string, handler?: EventHandler): void {
        if (handler) {
            this.handlers.get(event)?.delete(handler);
            this.onceHandlers.get(event)?.delete(handler);
        } else {
            this.handlers.delete(event);
            this.onceHandlers.delete(event);
        }
    }

    /**
     * 이벤트 발행
     */
    emit<T = any>(event: string, data?: T): void {
        // 일반 핸들러 실행
        this.handlers.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`[EventBus] Error in handler for "${event}":`, error);
            }
        });

        // 일회성 핸들러 실행 및 제거
        const onceSet = this.onceHandlers.get(event);
        if (onceSet) {
            onceSet.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[EventBus] Error in once handler for "${event}":`, error);
                }
            });
            this.onceHandlers.delete(event);
        }
    }

    /**
     * 모든 이벤트 정리
     */
    clear(): void {
        this.handlers.clear();
        this.onceHandlers.clear();
    }

    /**
     * 특정 이벤트의 리스너 수 확인
     */
    listenerCount(event: string): number {
        const regular = this.handlers.get(event)?.size || 0;
        const once = this.onceHandlers.get(event)?.size || 0;
        return regular + once;
    }

    /**
     * 등록된 모든 이벤트 이름
     */
    eventNames(): string[] {
        const names = new Set([
            ...this.handlers.keys(),
            ...this.onceHandlers.keys(),
        ]);
        return Array.from(names);
    }
}

// 싱글톤 인스턴스
let instance: EventBus | null = null;

export function getEventBus(): EventBus {
    if (!instance) {
        instance = new EventBus();
    }
    return instance;
}

// 미리 정의된 이벤트 타입
export const Events = {
    // 연결 이벤트
    CONNECTION_STARTED: 'connection:started',
    CONNECTION_ESTABLISHED: 'connection:established',
    CONNECTION_FAILED: 'connection:failed',
    CONNECTION_CLOSED: 'connection:closed',

    // 화면 캡처 이벤트
    CAPTURE_STARTED: 'capture:started',
    CAPTURE_STOPPED: 'capture:stopped',
    CAPTURE_FRAME: 'capture:frame',

    // 입력 이벤트
    MOUSE_EVENT: 'input:mouse',
    KEYBOARD_EVENT: 'input:keyboard',

    // 기능 이벤트
    PRIVACY_MODE_CHANGED: 'privacy:changed',
    RECORDING_STARTED: 'recording:started',
    RECORDING_STOPPED: 'recording:stopped',
    MONITOR_CHANGED: 'monitor:changed',
    WHITEBOARD_TOGGLED: 'whiteboard:toggled',

    // 설정 이벤트
    SETTINGS_CHANGED: 'settings:changed',
    THEME_CHANGED: 'theme:changed',
} as const;

export type EventName = typeof Events[keyof typeof Events];

export default EventBus;
