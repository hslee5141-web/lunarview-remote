/**
 * Authentication System
 * 사용자/기기 인증 시스템
 */

import * as crypto from './index';

export interface AuthCredentials {
    connectionId: string;
    password: string;
    deviceId: string;
    timestamp: number;
}

export interface AuthChallenge {
    challengeId: string;
    challenge: string;
    timestamp: number;
    expiresAt: number;
}

export interface AuthResponse {
    challengeId: string;
    response: string;
    deviceFingerprint: string;
}

export interface SessionToken {
    token: string;
    sessionId: string;
    expiresAt: number;
    permissions: string[];
}

// Challenge 유효 시간 (30초)
const CHALLENGE_EXPIRY_MS = 30000;

/**
 * 인증 매니저
 */
export class AuthManager {
    private salt: Uint8Array;
    private activeChallenges: Map<string, AuthChallenge> = new Map();
    private activeSessions: Map<string, SessionToken> = new Map();

    constructor() {
        this.salt = crypto.randomBytes(16);
    }

    /**
     * 인증 챌린지 생성 (서버 측)
     */
    createChallenge(): AuthChallenge {
        const challengeId = this.generateId();
        const challenge = this.generateChallenge();
        const timestamp = Date.now();
        const expiresAt = timestamp + CHALLENGE_EXPIRY_MS;

        const authChallenge: AuthChallenge = {
            challengeId,
            challenge,
            timestamp,
            expiresAt,
        };

        this.activeChallenges.set(challengeId, authChallenge);

        // 만료 시 자동 삭제
        setTimeout(() => {
            this.activeChallenges.delete(challengeId);
        }, CHALLENGE_EXPIRY_MS);

        return authChallenge;
    }

    /**
     * 챌린지 응답 생성 (클라이언트 측)
     */
    async createChallengeResponse(
        challenge: AuthChallenge,
        password: string,
        deviceId: string
    ): Promise<AuthResponse> {
        // 비밀번호 + 챌린지를 결합하여 응답 생성
        const combined = new TextEncoder().encode(
            password + challenge.challenge + challenge.timestamp
        );

        const passwordHash = await crypto.hashPassword(password, this.salt);
        const responseHash = await crypto.sha256(
            new Uint8Array([...passwordHash, ...combined])
        );

        return {
            challengeId: challenge.challengeId,
            response: this.bytesToHex(responseHash),
            deviceFingerprint: await this.generateDeviceFingerprint(deviceId),
        };
    }

    /**
     * 챌린지 응답 검증 (서버 측)
     */
    async verifyChallengeResponse(
        response: AuthResponse,
        expectedPassword: string
    ): Promise<{ success: boolean; error?: string }> {
        const challenge = this.activeChallenges.get(response.challengeId);

        if (!challenge) {
            return { success: false, error: 'Invalid or expired challenge' };
        }

        if (Date.now() > challenge.expiresAt) {
            this.activeChallenges.delete(response.challengeId);
            return { success: false, error: 'Challenge expired' };
        }

        // 예상 응답 계산
        const combined = new TextEncoder().encode(
            expectedPassword + challenge.challenge + challenge.timestamp
        );

        const passwordHash = await crypto.hashPassword(expectedPassword, this.salt);
        const expectedHash = await crypto.sha256(
            new Uint8Array([...passwordHash, ...combined])
        );
        const expectedResponse = this.bytesToHex(expectedHash);

        if (response.response !== expectedResponse) {
            return { success: false, error: 'Invalid password' };
        }

        // 챌린지 사용됨, 삭제
        this.activeChallenges.delete(response.challengeId);

        return { success: true };
    }

    /**
     * 세션 토큰 생성
     */
    createSessionToken(
        sessionId: string,
        permissions: string[] = ['view', 'control']
    ): SessionToken {
        const token = this.generateToken();
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24시간

        const sessionToken: SessionToken = {
            token,
            sessionId,
            expiresAt,
            permissions,
        };

        this.activeSessions.set(token, sessionToken);

        return sessionToken;
    }

    /**
     * 세션 토큰 검증
     */
    verifySessionToken(token: string): SessionToken | null {
        const session = this.activeSessions.get(token);

        if (!session) return null;

        if (Date.now() > session.expiresAt) {
            this.activeSessions.delete(token);
            return null;
        }

        return session;
    }

    /**
     * 세션 종료
     */
    revokeSession(token: string): void {
        this.activeSessions.delete(token);
    }

    /**
     * 권한 확인
     */
    hasPermission(token: string, permission: string): boolean {
        const session = this.verifySessionToken(token);
        return session?.permissions.includes(permission) ?? false;
    }

    // Private methods
    private generateId(): string {
        return this.bytesToHex(crypto.randomBytes(16));
    }

    private generateChallenge(): string {
        return this.bytesToHex(crypto.randomBytes(32));
    }

    private generateToken(): string {
        return this.bytesToHex(crypto.randomBytes(32));
    }

    private async generateDeviceFingerprint(deviceId: string): Promise<string> {
        const data = new TextEncoder().encode(deviceId + navigator.userAgent);
        const hash = await crypto.sha256(data);
        return this.bytesToHex(hash).slice(0, 32);
    }

    private bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

/**
 * 2단계 인증 (TOTP)
 */
export class TOTPAuthenticator {
    private secret: Uint8Array;
    private digits = 6;
    private period = 30; // 초

    constructor(secret?: Uint8Array) {
        this.secret = secret || crypto.randomBytes(20);
    }

    /**
     * 현재 TOTP 코드 생성
     */
    async generateCode(timestamp?: number): Promise<string> {
        const time = timestamp || Date.now();
        const counter = Math.floor(time / 1000 / this.period);

        const counterBytes = new Uint8Array(8);
        new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);

        const hmac = await crypto.hmacSign(counterBytes, this.secret);

        // Dynamic truncation
        const offset = hmac[hmac.length - 1] & 0xf;
        const binary =
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);

        const otp = binary % Math.pow(10, this.digits);
        return otp.toString().padStart(this.digits, '0');
    }

    /**
     * TOTP 코드 검증
     */
    async verifyCode(code: string, window = 1): Promise<boolean> {
        const now = Date.now();

        for (let i = -window; i <= window; i++) {
            const timestamp = now + i * this.period * 1000;
            const expected = await this.generateCode(timestamp);
            if (code === expected) {
                return true;
            }
        }

        return false;
    }

    /**
     * 비밀키 내보내기 (QR 코드 생성용)
     */
    getSecretBase32(): string {
        return this.base32Encode(this.secret);
    }

    private base32Encode(data: Uint8Array): string {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let result = '';
        let bits = 0;
        let value = 0;

        for (const byte of data) {
            value = (value << 8) | byte;
            bits += 8;
            while (bits >= 5) {
                bits -= 5;
                result += alphabet[(value >>> bits) & 31];
            }
        }

        if (bits > 0) {
            result += alphabet[(value << (5 - bits)) & 31];
        }

        return result;
    }
}

// 싱글톤 인스턴스
let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
    if (!authManagerInstance) {
        authManagerInstance = new AuthManager();
    }
    return authManagerInstance;
}
