/**
 * Unit Tests for Protocol Module
 * 프로토콜 모듈 단위 테스트
 */

import {
    serializePacket,
    deserializePacket,
    encodeJSON,
    decodeJSON,
    createMouseEventPacket,
    createKeyboardEventPacket,
    PacketType,
} from '../src/serialization';
import type { Packet } from '../src/types';

describe('Protocol Serialization', () => {
    describe('serializePacket / deserializePacket', () => {
        it('should serialize and deserialize a packet correctly', () => {
            const payload = new Uint8Array([1, 2, 3, 4, 5]);
            const packet: Packet = {
                type: PacketType.MOUSE_EVENT,
                timestamp: Date.now(),
                payload,
            };

            const serialized = serializePacket(packet);
            const deserialized = deserializePacket(serialized);

            expect(deserialized.type).toBe(PacketType.MOUSE_EVENT);
            expect(deserialized.payload).toEqual(payload);
        });

        it('should handle empty payload', () => {
            const packet: Packet = {
                type: PacketType.HEARTBEAT,
                timestamp: Date.now(),
                payload: new Uint8Array(0),
            };

            const serialized = serializePacket(packet);
            const deserialized = deserializePacket(serialized);

            expect(deserialized.type).toBe(PacketType.HEARTBEAT);
            expect(deserialized.payload.length).toBe(0);
        });

        it('should handle large payload', () => {
            const payload = new Uint8Array(1024 * 1024); // 1MB
            for (let i = 0; i < payload.length; i++) {
                payload[i] = i % 256;
            }

            const packet: Packet = {
                type: PacketType.SCREEN_FRAME,
                timestamp: Date.now(),
                payload,
            };

            const serialized = serializePacket(packet);
            const deserialized = deserializePacket(serialized);

            expect(deserialized.payload.length).toBe(payload.length);
            expect(deserialized.payload[0]).toBe(0);
            expect(deserialized.payload[255]).toBe(255);
        });

        it('should throw on invalid packet data', () => {
            const tooShort = new Uint8Array([1, 2, 3]);
            expect(() => deserializePacket(tooShort)).toThrow('Invalid packet');
        });
    });

    describe('encodeJSON / decodeJSON', () => {
        it('should encode and decode JSON correctly', () => {
            const data = { foo: 'bar', num: 42, nested: { arr: [1, 2, 3] } };
            const encoded = encodeJSON(data);
            const decoded = decodeJSON<typeof data>(encoded);

            expect(decoded).toEqual(data);
        });

        it('should handle special characters', () => {
            const data = { text: '한글 테스트 🎉', unicode: '日本語' };
            const encoded = encodeJSON(data);
            const decoded = decodeJSON<typeof data>(encoded);

            expect(decoded.text).toBe('한글 테스트 🎉');
            expect(decoded.unicode).toBe('日本語');
        });
    });

    describe('createMouseEventPacket', () => {
        it('should create a mouse event packet', () => {
            const mouseEvent = { type: 'move', x: 0.5, y: 0.5 };
            const packet = createMouseEventPacket(mouseEvent);

            expect(packet).toBeInstanceOf(Uint8Array);
            expect(packet.length).toBeGreaterThan(6); // Header + payload
        });
    });

    describe('createKeyboardEventPacket', () => {
        it('should create a keyboard event packet', () => {
            const keyEvent = { type: 'down', key: 'a', keyCode: 65, modifiers: 0 };
            const packet = createKeyboardEventPacket(keyEvent);

            expect(packet).toBeInstanceOf(Uint8Array);
            expect(packet.length).toBeGreaterThan(6);
        });
    });
});
