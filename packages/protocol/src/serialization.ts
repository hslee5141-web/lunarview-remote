/**
 * Packet Serialization/Deserialization
 * 패킷 직렬화 및 역직렬화 유틸리티
 */

import { Packet, PacketType } from './types';

const HEADER_SIZE = 6; // type(1) + flags(1) + size(4)

/**
 * 패킷을 바이너리로 직렬화
 */
export function serializePacket(packet: Packet): Uint8Array {
    const payload = packet.payload;
    const buffer = new ArrayBuffer(HEADER_SIZE + payload.length);
    const view = new DataView(buffer);

    // Header
    view.setUint8(0, packet.type);
    view.setUint8(1, 0); // flags (reserved)
    view.setUint32(2, payload.length, true); // little-endian

    // Payload
    const result = new Uint8Array(buffer);
    result.set(payload, HEADER_SIZE);

    return result;
}

/**
 * 바이너리를 패킷으로 역직렬화
 */
export function deserializePacket(data: Uint8Array): Packet {
    if (data.length < HEADER_SIZE) {
        throw new Error('Invalid packet: too short');
    }

    const view = new DataView(data.buffer, data.byteOffset);
    const type = view.getUint8(0) as PacketType;
    const size = view.getUint32(2, true);

    if (data.length < HEADER_SIZE + size) {
        throw new Error('Invalid packet: payload incomplete');
    }

    const payload = data.slice(HEADER_SIZE, HEADER_SIZE + size);

    return {
        type,
        timestamp: Date.now(),
        payload,
    };
}

/**
 * JSON 데이터를 패킷 페이로드로 인코딩
 */
export function encodeJSON<T>(data: T): Uint8Array {
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
}

/**
 * 패킷 페이로드를 JSON으로 디코딩
 */
export function decodeJSON<T>(payload: Uint8Array): T {
    const json = new TextDecoder().decode(payload);
    return JSON.parse(json);
}

/**
 * 마우스 이벤트 패킷 생성
 */
export function createMouseEventPacket(event: {
    type: string;
    x: number;
    y: number;
    button?: number;
}): Uint8Array {
    const packet: Packet = {
        type: PacketType.MOUSE_EVENT,
        timestamp: Date.now(),
        payload: encodeJSON(event),
    };
    return serializePacket(packet);
}

/**
 * 키보드 이벤트 패킷 생성
 */
export function createKeyboardEventPacket(event: {
    type: string;
    key: string;
    keyCode: number;
    modifiers: number;
}): Uint8Array {
    const packet: Packet = {
        type: PacketType.KEYBOARD_EVENT,
        timestamp: Date.now(),
        payload: encodeJSON(event),
    };
    return serializePacket(packet);
}

/**
 * 화면 프레임 패킷 생성
 */
export function createScreenFramePacket(frameData: Uint8Array, metadata: {
    width: number;
    height: number;
    isKeyFrame: boolean;
}): Uint8Array {
    // 메타데이터를 앞에 붙이고 프레임 데이터를 뒤에 붙임
    const metaBytes = encodeJSON(metadata);
    const metaSize = new Uint8Array(4);
    new DataView(metaSize.buffer).setUint32(0, metaBytes.length, true);

    const payload = new Uint8Array(4 + metaBytes.length + frameData.length);
    payload.set(metaSize, 0);
    payload.set(metaBytes, 4);
    payload.set(frameData, 4 + metaBytes.length);

    const packet: Packet = {
        type: PacketType.SCREEN_FRAME,
        timestamp: Date.now(),
        payload,
    };
    return serializePacket(packet);
}
