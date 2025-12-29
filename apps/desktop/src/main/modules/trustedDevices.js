/**
 * LunarView - Trusted Devices Module
 * 신뢰할 수 있는 장치 관리 및 고정 비밀번호
 */

const Store = require('electron-store');
const crypto = require('crypto');

const store = new Store({
    name: 'lunarview-trusted-devices',
    encryptionKey: 'lunarview-trusted-key-2024'
});

// 암호화 키 (실제 환경에서는 더 안전한 방식 사용)
const ENCRYPTION_KEY = crypto.scryptSync('lunarview-secret', 'salt', 32);
const IV_LENGTH = 16;

/**
 * 문자열 암호화
 */
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * 문자열 복호화
 */
function decrypt(text) {
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return null;
    }
}

/**
 * 고정 비밀번호 관리
 */
const fixedPassword = {
    // 고정 비밀번호 설정
    set: (password) => {
        store.set('fixedPassword', encrypt(password));
        store.set('useFixedPassword', true);
    },

    // 고정 비밀번호 가져오기
    get: () => {
        const encrypted = store.get('fixedPassword');
        if (!encrypted) return null;
        return decrypt(encrypted);
    },

    // 고정 비밀번호 사용 여부
    isEnabled: () => {
        return store.get('useFixedPassword', false);
    },

    // 고정 비밀번호 비활성화 (랜덤 모드로 전환)
    disable: () => {
        store.set('useFixedPassword', false);
    },

    // 고정 비밀번호 삭제
    remove: () => {
        store.delete('fixedPassword');
        store.delete('useFixedPassword');
    }
};

/**
 * 신뢰할 수 있는 장치 관리
 */
const trustedDevices = {
    // 신뢰 장치 목록 가져오기
    getAll: () => {
        return store.get('trustedDevices', []);
    },

    // 신뢰 장치 추가
    add: (device) => {
        const devices = trustedDevices.getAll();
        const newDevice = {
            id: crypto.randomUUID(),
            deviceId: device.deviceId,
            name: device.name || '알 수 없는 장치',
            addedAt: new Date().toISOString(),
            lastConnected: new Date().toISOString()
        };
        devices.push(newDevice);
        store.set('trustedDevices', devices);
        return newDevice;
    },

    // 신뢰 장치 제거
    remove: (deviceId) => {
        const devices = trustedDevices.getAll().filter(d => d.deviceId !== deviceId);
        store.set('trustedDevices', devices);
        return devices;
    },

    // 장치가 신뢰 목록에 있는지 확인
    isTrusted: (deviceId) => {
        return trustedDevices.getAll().some(d => d.deviceId === deviceId);
    },

    // 마지막 연결 시간 업데이트
    updateLastConnected: (deviceId) => {
        const devices = trustedDevices.getAll();
        const device = devices.find(d => d.deviceId === deviceId);
        if (device) {
            device.lastConnected = new Date().toISOString();
            store.set('trustedDevices', devices);
        }
    },

    // 전체 삭제
    clear: () => {
        store.set('trustedDevices', []);
    }
};

/**
 * 저장된 연결 (빠른 재연결용)
 */
const savedConnections = {
    // 연결 저장 (비밀번호 암호화)
    save: (connection) => {
        const connections = savedConnections.getAll();
        const existing = connections.find(c => c.remoteId === connection.remoteId);

        const savedConn = {
            id: existing?.id || crypto.randomUUID(),
            remoteId: connection.remoteId,
            name: connection.name || `PC ${connection.remoteId.slice(-4)}`,
            password: encrypt(connection.password),
            savedAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };

        if (existing) {
            // 업데이트
            Object.assign(existing, savedConn);
        } else {
            connections.push(savedConn);
        }

        // 최대 20개 유지
        if (connections.length > 20) {
            connections.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
            connections.length = 20;
        }

        store.set('savedConnections', connections);
        return savedConn;
    },

    // 저장된 연결 목록
    getAll: () => {
        return store.get('savedConnections', []);
    },

    // 연결 정보 가져오기 (비밀번호 복호화)
    get: (remoteId) => {
        const connections = savedConnections.getAll();
        const conn = connections.find(c => c.remoteId === remoteId);
        if (!conn) return null;

        return {
            ...conn,
            password: decrypt(conn.password)
        };
    },

    // 연결 삭제
    remove: (remoteId) => {
        const connections = savedConnections.getAll().filter(c => c.remoteId !== remoteId);
        store.set('savedConnections', connections);
        return connections;
    },

    // 마지막 사용 업데이트
    updateLastUsed: (remoteId) => {
        const connections = savedConnections.getAll();
        const conn = connections.find(c => c.remoteId === remoteId);
        if (conn) {
            conn.lastUsed = new Date().toISOString();
            store.set('savedConnections', connections);
        }
    },

    // 연결 이름 변경
    rename: (remoteId, newName) => {
        const connections = savedConnections.getAll();
        const conn = connections.find(c => c.remoteId === remoteId);
        if (conn) {
            conn.name = newName;
            store.set('savedConnections', connections);
        }
    },

    // 전체 삭제
    clear: () => {
        store.set('savedConnections', []);
    }
};

module.exports = {
    fixedPassword,
    trustedDevices,
    savedConnections,
    encrypt,
    decrypt
};
