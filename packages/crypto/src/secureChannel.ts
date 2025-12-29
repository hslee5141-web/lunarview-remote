/**
 * Secure Channel - End-to-End Encryption Layer
 * 종단간 암호화 채널 구현
 */

import * as crypto from './index';

export interface SecureChannelConfig {
    onMessage: (decryptedData: Uint8Array) => void;
    onError: (error: Error) => void;
}

export interface KeyExchangeResult {
    publicKey: string;
    sessionId: string;
}

export class SecureChannel {
    private sessionKey: CryptoKey | null = null;
    private myKeyPair: CryptoKeyPair | null = null;
    private peerPublicKey: CryptoKey | null = null;
    private sessionId: string = '';
    private isEstablished = false;
    private config: SecureChannelConfig;
    private sendFunction: ((data: Uint8Array) => boolean) | null = null;

    constructor(config: SecureChannelConfig) {
        this.config = config;
    }

    /**
     * 키 교환 시작 (발신자)
     */
    async initiateKeyExchange(): Promise<KeyExchangeResult> {
        // ECDH 키쌍 생성
        this.myKeyPair = await crypto.generateECDHKeyPair();
        this.sessionId = this.generateSessionId();

        // 공개키를 Base64로 인코딩
        const publicKey = await crypto.exportPublicKey(this.myKeyPair.publicKey);

        return {
            publicKey,
            sessionId: this.sessionId,
        };
    }

    /**
     * 키 교환 응답 (수신자)
     */
    async respondToKeyExchange(
        peerPublicKeyBase64: string,
        sessionId: string
    ): Promise<KeyExchangeResult> {
        this.sessionId = sessionId;

        // ECDH 키쌍 생성
        this.myKeyPair = await crypto.generateECDHKeyPair();

        // 피어의 공개키 가져오기
        this.peerPublicKey = await crypto.importPublicKey(peerPublicKeyBase64, 'ECDH');

        // 공유 비밀 키 생성
        this.sessionKey = await crypto.deriveSharedKey(
            this.myKeyPair.privateKey,
            this.peerPublicKey
        );

        this.isEstablished = true;

        // 내 공개키 반환
        const publicKey = await crypto.exportPublicKey(this.myKeyPair.publicKey);
        return { publicKey, sessionId };
    }

    /**
     * 키 교환 완료 (발신자가 응답 수신)
     */
    async completeKeyExchange(peerPublicKeyBase64: string): Promise<void> {
        if (!this.myKeyPair) {
            throw new Error('Key exchange not initiated');
        }

        // 피어의 공개키 가져오기
        this.peerPublicKey = await crypto.importPublicKey(peerPublicKeyBase64, 'ECDH');

        // 공유 비밀 키 생성
        this.sessionKey = await crypto.deriveSharedKey(
            this.myKeyPair.privateKey,
            this.peerPublicKey
        );

        this.isEstablished = true;
    }

    /**
     * 전송 함수 설정
     */
    setSendFunction(fn: (data: Uint8Array) => boolean): void {
        this.sendFunction = fn;
    }

    /**
     * 데이터 암호화 및 전송
     */
    async sendEncrypted(data: Uint8Array): Promise<boolean> {
        if (!this.isEstablished || !this.sessionKey || !this.sendFunction) {
            return false;
        }

        try {
            // AES-GCM으로 암호화
            const { ciphertext, iv } = await crypto.encryptAES(data, this.sessionKey);

            // IV + Ciphertext를 하나로 합침
            const payload = new Uint8Array(iv.length + ciphertext.length);
            payload.set(iv, 0);
            payload.set(ciphertext, iv.length);

            return this.sendFunction(payload);
        } catch (error) {
            this.config.onError(error as Error);
            return false;
        }
    }

    /**
     * 암호화된 데이터 수신 및 복호화
     */
    async receiveEncrypted(encryptedPayload: Uint8Array): Promise<void> {
        if (!this.isEstablished || !this.sessionKey) {
            this.config.onError(new Error('Secure channel not established'));
            return;
        }

        try {
            // IV (12 bytes) + Ciphertext 분리
            const iv = encryptedPayload.slice(0, 12);
            const ciphertext = encryptedPayload.slice(12);

            // AES-GCM으로 복호화
            const decrypted = await crypto.decryptAES(ciphertext, this.sessionKey, iv);

            this.config.onMessage(decrypted);
        } catch (error) {
            this.config.onError(error as Error);
        }
    }

    /**
     * 문자열 암호화 전송 (편의 메서드)
     */
    async sendEncryptedString(text: string): Promise<boolean> {
        const data = new TextEncoder().encode(text);
        return this.sendEncrypted(data);
    }

    /**
     * 채널 상태 확인
     */
    isSecure(): boolean {
        return this.isEstablished;
    }

    getSessionId(): string {
        return this.sessionId;
    }

    /**
     * 채널 종료
     */
    close(): void {
        this.sessionKey = null;
        this.myKeyPair = null;
        this.peerPublicKey = null;
        this.isEstablished = false;
    }

    // Private methods
    private generateSessionId(): string {
        const bytes = crypto.randomBytes(16);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

/**
 * 메시지 인증 코드(MAC) 생성
 */
export async function createMessageMAC(
    message: Uint8Array,
    key: Uint8Array
): Promise<Uint8Array> {
    return crypto.hmacSign(message, key);
}

/**
 * 메시지 무결성 검증
 */
export async function verifyMessageMAC(
    message: Uint8Array,
    mac: Uint8Array,
    key: Uint8Array
): Promise<boolean> {
    const expectedMAC = await crypto.hmacSign(message, key);

    if (expectedMAC.length !== mac.length) return false;

    let isEqual = true;
    for (let i = 0; i < mac.length; i++) {
        if (mac[i] !== expectedMAC[i]) isEqual = false;
    }
    return isEqual;
}
