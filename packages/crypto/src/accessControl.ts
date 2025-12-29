/**
 * Access Control and Logging
 * 접근 제어 및 로깅 시스템
 */

export interface AccessLogEntry {
    id: string;
    timestamp: Date;
    eventType: 'connect' | 'disconnect' | 'auth_success' | 'auth_failure' | 'transfer' | 'control';
    sourceId: string;
    targetId?: string;
    ipAddress?: string;
    details?: string;
    success: boolean;
}

export interface AccessRule {
    id: string;
    type: 'allow' | 'deny';
    criteria: {
        ipPattern?: string;
        connectionIdPattern?: string;
        timeRange?: { start: string; end: string };
    };
    priority: number;
}

/**
 * 접근 로그 관리
 */
export class AccessLogger {
    private logs: AccessLogEntry[] = [];
    private maxLogs = 1000;
    private onLogCallback: ((entry: AccessLogEntry) => void) | null = null;

    /**
     * 로그 기록
     */
    log(entry: Omit<AccessLogEntry, 'id' | 'timestamp'>): AccessLogEntry {
        const fullEntry: AccessLogEntry = {
            ...entry,
            id: this.generateId(),
            timestamp: new Date(),
        };

        this.logs.unshift(fullEntry);

        // 로그 수 제한
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }

        if (this.onLogCallback) {
            this.onLogCallback(fullEntry);
        }

        return fullEntry;
    }

    /**
     * 연결 시도 로그
     */
    logConnectionAttempt(
        sourceId: string,
        targetId: string,
        success: boolean,
        ipAddress?: string
    ): void {
        this.log({
            eventType: success ? 'connect' : 'auth_failure',
            sourceId,
            targetId,
            ipAddress,
            success,
            details: success ? 'Connection established' : 'Connection rejected',
        });
    }

    /**
     * 인증 로그
     */
    logAuthentication(
        sourceId: string,
        success: boolean,
        reason?: string
    ): void {
        this.log({
            eventType: success ? 'auth_success' : 'auth_failure',
            sourceId,
            success,
            details: reason,
        });
    }

    /**
     * 연결 해제 로그
     */
    logDisconnection(sourceId: string, reason?: string): void {
        this.log({
            eventType: 'disconnect',
            sourceId,
            success: true,
            details: reason || 'Session ended',
        });
    }

    /**
     * 파일 전송 로그
     */
    logFileTransfer(
        sourceId: string,
        targetId: string,
        fileName: string,
        success: boolean
    ): void {
        this.log({
            eventType: 'transfer',
            sourceId,
            targetId,
            success,
            details: `File: ${fileName}`,
        });
    }

    /**
     * 로그 조회
     */
    getLogs(options?: {
        limit?: number;
        eventType?: string;
        sourceId?: string;
        since?: Date;
    }): AccessLogEntry[] {
        let result = [...this.logs];

        if (options?.eventType) {
            result = result.filter(l => l.eventType === options.eventType);
        }

        if (options?.sourceId) {
            result = result.filter(l => l.sourceId === options.sourceId);
        }

        if (options?.since) {
            result = result.filter(l => l.timestamp >= options.since!);
        }

        if (options?.limit) {
            result = result.slice(0, options.limit);
        }

        return result;
    }

    /**
     * 로그 콜백 설정
     */
    onLog(callback: (entry: AccessLogEntry) => void): void {
        this.onLogCallback = callback;
    }

    /**
     * 로그 내보내기
     */
    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }

    /**
     * 로그 초기화
     */
    clearLogs(): void {
        this.logs = [];
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
}

/**
 * 접근 제어 관리
 */
export class AccessController {
    private rules: AccessRule[] = [];
    private blockedIPs: Set<string> = new Set();
    private trustedDevices: Set<string> = new Set();

    /**
     * 규칙 추가
     */
    addRule(rule: Omit<AccessRule, 'id'>): AccessRule {
        const fullRule: AccessRule = {
            ...rule,
            id: this.generateId(),
        };

        this.rules.push(fullRule);
        this.rules.sort((a, b) => b.priority - a.priority);

        return fullRule;
    }

    /**
     * 규칙 삭제
     */
    removeRule(ruleId: string): boolean {
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index >= 0) {
            this.rules.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * 접근 허용 여부 확인
     */
    checkAccess(context: {
        ipAddress?: string;
        connectionId?: string;
        time?: Date;
    }): { allowed: boolean; reason?: string } {
        // 차단된 IP 확인
        if (context.ipAddress && this.blockedIPs.has(context.ipAddress)) {
            return { allowed: false, reason: 'IP blocked' };
        }

        // 규칙 평가
        for (const rule of this.rules) {
            if (this.matchesRule(rule, context)) {
                return {
                    allowed: rule.type === 'allow',
                    reason: rule.type === 'allow' ? 'Rule matched' : 'Access denied by rule',
                };
            }
        }

        // 기본: 허용
        return { allowed: true };
    }

    /**
     * IP 차단
     */
    blockIP(ip: string): void {
        this.blockedIPs.add(ip);
    }

    /**
     * IP 차단 해제
     */
    unblockIP(ip: string): void {
        this.blockedIPs.delete(ip);
    }

    /**
     * 신뢰할 수 있는 기기 추가
     */
    trustDevice(deviceId: string): void {
        this.trustedDevices.add(deviceId);
    }

    /**
     * 기기 신뢰 해제
     */
    untrustDevice(deviceId: string): void {
        this.trustedDevices.delete(deviceId);
    }

    /**
     * 신뢰할 수 있는 기기인지 확인
     */
    isDeviceTrusted(deviceId: string): boolean {
        return this.trustedDevices.has(deviceId);
    }

    private matchesRule(rule: AccessRule, context: any): boolean {
        const { criteria } = rule;

        if (criteria.ipPattern && context.ipAddress) {
            if (!this.matchPattern(criteria.ipPattern, context.ipAddress)) {
                return false;
            }
        }

        if (criteria.connectionIdPattern && context.connectionId) {
            if (!this.matchPattern(criteria.connectionIdPattern, context.connectionId)) {
                return false;
            }
        }

        if (criteria.timeRange && context.time) {
            const time = context.time.toTimeString().slice(0, 5);
            if (time < criteria.timeRange.start || time > criteria.timeRange.end) {
                return false;
            }
        }

        return true;
    }

    private matchPattern(pattern: string, value: string): boolean {
        // 간단한 와일드카드 매칭
        const regex = new RegExp(
            '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        return regex.test(value);
    }

    private generateId(): string {
        return 'rule_' + Date.now().toString(36);
    }
}

// 싱글톤 인스턴스
let loggerInstance: AccessLogger | null = null;
let controllerInstance: AccessController | null = null;

export function getAccessLogger(): AccessLogger {
    if (!loggerInstance) {
        loggerInstance = new AccessLogger();
    }
    return loggerInstance;
}

export function getAccessController(): AccessController {
    if (!controllerInstance) {
        controllerInstance = new AccessController();
    }
    return controllerInstance;
}
