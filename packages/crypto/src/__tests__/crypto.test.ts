/**
 * Unit Tests for Crypto Module
 * 암호화 모듈 단위 테스트
 */

// Note: These tests require a browser-like environment with Web Crypto API
// In Node.js, use a polyfill like @peculiar/webcrypto

describe('Crypto Module', () => {
    // Mock Web Crypto for Node.js environment
    beforeAll(() => {
        if (typeof globalThis.crypto === 'undefined') {
            const { Crypto } = require('@peculiar/webcrypto');
            globalThis.crypto = new Crypto();
        }
    });

    describe('generateAESKey', () => {
        it('should generate a valid AES-256-GCM key', async () => {
            const { generateAESKey } = await import('../index');
            const key = await generateAESKey();

            expect(key).toBeDefined();
            expect(key.type).toBe('secret');
            expect(key.algorithm.name).toBe('AES-GCM');
        });
    });

    describe('generateECDHKeyPair', () => {
        it('should generate a valid ECDH key pair', async () => {
            const { generateECDHKeyPair } = await import('../index');
            const keyPair = await generateECDHKeyPair();

            expect(keyPair.publicKey).toBeDefined();
            expect(keyPair.privateKey).toBeDefined();
            expect(keyPair.publicKey.type).toBe('public');
            expect(keyPair.privateKey.type).toBe('private');
        });
    });

    describe('encryptAES / decryptAES', () => {
        it('should encrypt and decrypt data correctly', async () => {
            const { generateAESKey, encryptAES, decryptAES } = await import('../index');

            const key = await generateAESKey();
            const plaintext = new TextEncoder().encode('Hello, World!');

            const { ciphertext, iv } = await encryptAES(plaintext, key);
            expect(ciphertext.length).toBeGreaterThan(0);

            const decrypted = await decryptAES(ciphertext, key, iv);
            const decryptedText = new TextDecoder().decode(decrypted);

            expect(decryptedText).toBe('Hello, World!');
        });

        it('should produce different ciphertext for same plaintext', async () => {
            const { generateAESKey, encryptAES } = await import('../index');

            const key = await generateAESKey();
            const plaintext = new TextEncoder().encode('Same message');

            const result1 = await encryptAES(plaintext, key);
            const result2 = await encryptAES(plaintext, key);

            // IV가 다르므로 암호문도 달라야 함
            expect(result1.ciphertext).not.toEqual(result2.ciphertext);
        });
    });

    describe('deriveSharedKey', () => {
        it('should derive the same shared key from both sides', async () => {
            const {
                generateECDHKeyPair,
                deriveSharedKey,
                encryptAES,
                decryptAES
            } = await import('../index');

            // Alice generates key pair
            const aliceKeyPair = await generateECDHKeyPair();

            // Bob generates key pair
            const bobKeyPair = await generateECDHKeyPair();

            // Both derive shared key
            const aliceSharedKey = await deriveSharedKey(
                aliceKeyPair.privateKey,
                bobKeyPair.publicKey
            );

            const bobSharedKey = await deriveSharedKey(
                bobKeyPair.privateKey,
                aliceKeyPair.publicKey
            );

            // Test that both keys produce same encryption/decryption
            const message = new TextEncoder().encode('Secret message');
            const { ciphertext, iv } = await encryptAES(message, aliceSharedKey);
            const decrypted = await decryptAES(ciphertext, bobSharedKey, iv);

            expect(new TextDecoder().decode(decrypted)).toBe('Secret message');
        });
    });

    describe('hashPassword', () => {
        it('should produce consistent hash for same password and salt', async () => {
            const { hashPassword, randomBytes } = await import('../index');

            const password = 'mySecurePassword123';
            const salt = randomBytes(16);

            const hash1 = await hashPassword(password, salt);
            const hash2 = await hashPassword(password, salt);

            expect(hash1).toEqual(hash2);
        });

        it('should produce different hash for different salts', async () => {
            const { hashPassword, randomBytes } = await import('../index');

            const password = 'mySecurePassword123';
            const salt1 = randomBytes(16);
            const salt2 = randomBytes(16);

            const hash1 = await hashPassword(password, salt1);
            const hash2 = await hashPassword(password, salt2);

            expect(hash1).not.toEqual(hash2);
        });
    });

    describe('sha256', () => {
        it('should produce correct SHA-256 hash', async () => {
            const { sha256 } = await import('../index');

            const data = new TextEncoder().encode('hello');
            const hash = await sha256(data);

            expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
        });
    });

    describe('randomBytes', () => {
        it('should generate random bytes of specified length', async () => {
            const { randomBytes } = await import('../index');

            const bytes16 = randomBytes(16);
            const bytes32 = randomBytes(32);

            expect(bytes16.length).toBe(16);
            expect(bytes32.length).toBe(32);
        });

        it('should generate different values each time', async () => {
            const { randomBytes } = await import('../index');

            const bytes1 = randomBytes(16);
            const bytes2 = randomBytes(16);

            expect(bytes1).not.toEqual(bytes2);
        });
    });
});
