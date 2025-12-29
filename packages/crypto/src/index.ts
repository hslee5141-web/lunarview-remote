/**
 * Cryptographic utilities for secure communication
 * 보안 통신을 위한 암호화 유틸리티
 */

// Web Crypto API를 사용한 암호화 모듈

/**
 * AES-GCM 키 생성
 */
export async function generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: 256,
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * RSA 키쌍 생성
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * ECDH 키쌍 생성 (키 교환용)
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256',
        },
        true,
        ['deriveKey', 'deriveBits']
    );
}

/**
 * ECDH 키 교환으로 공유 비밀 키 생성
 */
export async function deriveSharedKey(
    privateKey: CryptoKey,
    publicKey: CryptoKey
): Promise<CryptoKey> {
    return await crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: publicKey,
        },
        privateKey,
        {
            name: 'AES-GCM',
            length: 256,
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * AES-GCM으로 데이터 암호화
 */
export async function encryptAES(
    data: Uint8Array,
    key: CryptoKey
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        key,
        data
    );

    return {
        ciphertext: new Uint8Array(ciphertext),
        iv,
    };
}

/**
 * AES-GCM으로 데이터 복호화
 */
export async function decryptAES(
    ciphertext: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
): Promise<Uint8Array> {
    const plaintext = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        key,
        ciphertext
    );

    return new Uint8Array(plaintext);
}

/**
 * 공개키를 Base64로 내보내기
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Base64 공개키 가져오기
 */
export async function importPublicKey(
    keyData: string,
    algorithm: 'RSA-OAEP' | 'ECDH'
): Promise<CryptoKey> {
    const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

    if (algorithm === 'RSA-OAEP') {
        return await crypto.subtle.importKey(
            'spki',
            binaryKey,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256',
            },
            true,
            ['encrypt']
        );
    } else {
        return await crypto.subtle.importKey(
            'spki',
            binaryKey,
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            true,
            []
        );
    }
}

/**
 * 안전한 랜덤 바이트 생성
 */
export function randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * SHA-256 해시 생성
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
}

/**
 * HMAC-SHA256 서명 생성
 */
export async function hmacSign(
    data: Uint8Array,
    keyData: Uint8Array
): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        {
            name: 'HMAC',
            hash: 'SHA-256',
        },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, data);
    return new Uint8Array(signature);
}

/**
 * 비밀번호 해싱 (Argon2 대신 PBKDF2 사용 - Web Crypto 호환)
 */
export async function hashPassword(
    password: string,
    salt: Uint8Array
): Promise<Uint8Array> {
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );

    const hash = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        passwordKey,
        256
    );

    return new Uint8Array(hash);
}
