/**
 * Base Service Class
 * 모든 서비스의 기본 클래스 - 싱글톤, 에러 처리, 로깅 표준화
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ServiceConfig {
    name: string;
    debug?: boolean;
    storagePrefix?: string;
}

export abstract class BaseService {
    protected readonly serviceName: string;
    protected readonly debug: boolean;
    protected readonly storagePrefix: string;

    constructor(config: ServiceConfig) {
        this.serviceName = config.name;
        this.debug = config.debug ?? false;
        this.storagePrefix = config.storagePrefix ?? 'lunarview';
    }

    /**
     * 로깅
     */
    protected log(level: LogLevel, message: string, data?: any): void {
        if (level === 'debug' && !this.debug) return;

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.serviceName}]`;

        switch (level) {
            case 'debug':
                console.debug(`${prefix} ${message}`, data ?? '');
                break;
            case 'info':
                console.info(`${prefix} ${message}`, data ?? '');
                break;
            case 'warn':
                console.warn(`${prefix} ${message}`, data ?? '');
                break;
            case 'error':
                console.error(`${prefix} ${message}`, data ?? '');
                break;
        }
    }

    /**
     * localStorage 안전하게 가져오기
     */
    protected getStorage<T>(key: string, defaultValue: T): T {
        try {
            const fullKey = `${this.storagePrefix}-${key}`;
            const saved = localStorage.getItem(fullKey);
            if (saved) {
                return { ...defaultValue, ...JSON.parse(saved) };
            }
        } catch (error) {
            this.log('error', `Failed to load storage: ${key}`, error);
        }
        return defaultValue;
    }

    /**
     * localStorage 안전하게 저장하기
     */
    protected setStorage<T>(key: string, value: T): boolean {
        try {
            const fullKey = `${this.storagePrefix}-${key}`;
            localStorage.setItem(fullKey, JSON.stringify(value));
            return true;
        } catch (error) {
            this.log('error', `Failed to save storage: ${key}`, error);
            return false;
        }
    }

    /**
     * localStorage 삭제
     */
    protected removeStorage(key: string): boolean {
        try {
            const fullKey = `${this.storagePrefix}-${key}`;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            this.log('error', `Failed to remove storage: ${key}`, error);
            return false;
        }
    }

    /**
     * 안전한 함수 실행 (에러 처리)
     */
    protected safeExecute<T>(fn: () => T, fallback: T): T {
        try {
            return fn();
        } catch (error) {
            this.log('error', 'Execution failed', error);
            return fallback;
        }
    }

    /**
     * 안전한 비동기 함수 실행
     */
    protected async safeExecuteAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            this.log('error', 'Async execution failed', error);
            return fallback;
        }
    }

    /**
     * ID 생성
     */
    protected generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }

    /**
     * 디버그 모드 토글
     */
    setDebug(enabled: boolean): void {
        (this as any).debug = enabled;
    }
}

/**
 * 싱글톤 데코레이터 헬퍼
 */
export function createSingleton<T>(factory: () => T): () => T {
    let instance: T | null = null;
    return () => {
        if (!instance) {
            instance = factory();
        }
        return instance;
    };
}
