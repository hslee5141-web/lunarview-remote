/**
 * Enhanced Signaling Server with Authentication & API
 * 인증 기능이 강화된 시그널링 서버 + REST API
 */

require('dotenv').config();
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';

// API 및 데이터베이스 임포트
import { initDatabase, getDatabase } from './models/database';
import apiRouter from './api';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// 데이터베이스 초기화 함수 (비동기)
async function initializeApp() {
    try {
        await initDatabase();
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        // 개발 환경에서는 DB 없이도 실행 가능하도록
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
}

// API 라우터 연결
app.use('/api', apiRouter);

// 연결된 클라이언트 관리
interface Client {
    id: string;
    connectionId: string;
    passwordHash: string;
    ws: WebSocket;
    isHost: boolean;
    sessionId?: string;
    connectedTo?: string;
    publicKey?: string;
    ipAddress?: string;
    connectedAt: Date;
    lastActivity: Date;
}

interface AccessLog {
    timestamp: Date;
    event: string;
    sourceId: string;
    targetId?: string;
    ipAddress?: string;
    success: boolean;
}

const clients = new Map<string, Client>();
const connectionIdMap = new Map<string, string>();
const accessLogs: AccessLog[] = [];
const blockedIPs = new Set<string>();
const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();

// 설정
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15분
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30분

// 비밀번호 해싱
function hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
}

// 접근 로그 기록
function logAccess(entry: Omit<AccessLog, 'timestamp'>): void {
    accessLogs.unshift({ ...entry, timestamp: new Date() });
    if (accessLogs.length > 1000) accessLogs.pop();
    console.log(`[${entry.success ? 'OK' : 'FAIL'}] ${entry.event}: ${entry.sourceId}${entry.targetId ? ' -> ' + entry.targetId : ''}`);
}

// IP 차단 여부 확인
function isIPBlocked(ip: string): boolean {
    if (blockedIPs.has(ip)) return true;

    const attempts = failedAttempts.get(ip);
    if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
        const elapsed = Date.now() - attempts.lastAttempt.getTime();
        if (elapsed < LOCKOUT_DURATION_MS) return true;
        failedAttempts.delete(ip);
    }

    return false;
}

// 실패 시도 기록
function recordFailedAttempt(ip: string): void {
    const attempts = failedAttempts.get(ip) || { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();
    failedAttempts.set(ip, attempts);
}

// HTTP API

// 환경 변수에서 설정 로드
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'default-admin-key-change-me';

// 관리자 인증 미들웨어
function adminAuth(req: any, res: any, next: any) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        logAccess({
            event: 'admin_auth_failed',
            sourceId: 'admin',
            ipAddress: req.ip,
            success: false
        });
        return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    next();
}

// 공개 API
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        clients: clients.size,
        timestamp: new Date().toISOString(),
    });
});

// 보호된 관리자 API
app.get('/admin/logs', adminAuth, (req, res) => {
    res.json(accessLogs.slice(0, 100));
});

app.get('/admin/clients', adminAuth, (req, res) => {
    const clientList = Array.from(clients.values()).map(c => ({
        connectionId: c.connectionId,
        isHost: c.isHost,
        connectedTo: c.connectedTo,
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity,
    }));
    res.json(clientList);
});

// 관리자 사용자 목록 API
app.get('/admin/users', adminAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT id, email, name, plan, created_at, updated_at 
            FROM users 
            ORDER BY created_at DESC
        `);
        const users = result.rows;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const stats = {
            total: users.length,
            todaySignups: users.filter((u: any) => new Date(u.created_at) >= todayStart).length,
            byPlan: {
                free: users.filter((u: any) => u.plan === 'free').length,
                personal_pro: users.filter((u: any) => u.plan === 'personal_pro').length,
                business: users.filter((u: any) => u.plan === 'business').length,
                team: users.filter((u: any) => u.plan === 'team').length
            }
        };

        res.json({ users, stats });
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// 관리자 구독 목록 API
app.get('/admin/subscriptions', adminAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT s.*, u.email, u.name 
            FROM subscriptions s 
            JOIN users u ON s.user_id = u.id 
            ORDER BY s.created_at DESC
        `);
        const subscriptions = result.rows;

        const activeCount = subscriptions.filter((s: any) => s.status === 'active' && s.plan !== 'free').length;

        res.json({ subscriptions, activeCount });
    } catch (error) {
        console.error('Admin subscriptions error:', error);
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
});

app.post('/admin/block-ip', adminAuth, (req, res) => {
    const { ip } = req.body;
    if (ip) {
        blockedIPs.add(ip);
        logAccess({ event: 'ip_blocked', sourceId: 'admin', targetId: ip, success: true });
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'IP required' });
    }
});

app.delete('/admin/block-ip', adminAuth, (req, res) => {
    const { ip } = req.body;
    if (ip && blockedIPs.has(ip)) {
        blockedIPs.delete(ip);
        logAccess({ event: 'ip_unblocked', sourceId: 'admin', targetId: ip, success: true });
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'IP not found in blocklist' });
    }
});

app.post('/admin/disconnect', adminAuth, (req, res) => {
    const { connectionId } = req.body;
    const clientId = connectionIdMap.get(connectionId);
    if (clientId) {
        const client = clients.get(clientId);
        if (client) {
            client.ws.close(4001, 'Disconnected by admin');
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Client not found' });
        }
    } else {
        res.status(400).json({ error: 'connectionId required' });
    }
});

// WebSocket 연결 처리
wss.on('connection', (ws: WebSocket, req) => {
    const clientId = uuidv4();
    const ipAddress = req.socket.remoteAddress || 'unknown';

    // IP 차단 확인
    if (isIPBlocked(ipAddress)) {
        ws.close(4003, 'IP blocked');
        logAccess({ event: 'connection_blocked', sourceId: clientId, ipAddress, success: false });
        return;
    }

    console.log(`Client connected: ${clientId} from ${ipAddress}`);

    ws.on('message', (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(clientId, ws, message, ipAddress);
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    });

    ws.on('close', () => {
        const client = clients.get(clientId);
        if (client) {
            // 연결된 상대방에게 연결 해제 알림
            if (client.connectedTo) {
                const partner = clients.get(client.connectedTo);
                if (partner) {
                    sendMessage(partner.ws, {
                        type: 'disconnected',
                        reason: 'Partner disconnected',
                    });
                    partner.connectedTo = undefined;
                }
            }

            logAccess({
                event: 'disconnect',
                sourceId: client.connectionId,
                ipAddress: client.ipAddress,
                success: true
            });

            connectionIdMap.delete(client.connectionId);
            clients.delete(clientId);
        }
        console.log(`Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
    });

    // Heartbeat
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);

    ws.on('close', () => clearInterval(pingInterval));
});

function handleMessage(clientId: string, ws: WebSocket, message: any, ipAddress: string) {
    // 클라이언트 활성 시간 업데이트
    const client = clients.get(clientId);
    if (client) {
        client.lastActivity = new Date();
    }

    switch (message.type) {
        case 'register':
            handleRegister(clientId, ws, message, ipAddress);
            break;
        case 'connect':
            handleConnect(clientId, message, ipAddress);
            break;
        case 'key-exchange':
            handleKeyExchange(clientId, message);
            break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
            handleSignaling(clientId, message);
            break;
        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice-candidate':
            handleWebRTCSignaling(clientId, message);
            break;
        case 'relay':
            handleRelay(clientId, message);
            break;
        case 'screen-frame':
            handleScreenFrame(clientId, message);
            break;
        case 'mouse-event':
        case 'keyboard-event':
            handleInputEvent(clientId, message);
            break;
        case 'file-chunk':
        case 'clipboard-sync':
            // 파일 청크와 클립보드도 상대방에게 릴레이
            handleInputEvent(clientId, message);
            break;
        case 'disconnect':
            handleDisconnect(clientId);
            break;
        case 'ping':
            sendMessage(ws, { type: 'pong' });
            break;
        default:
            console.warn(`Unknown message type: ${message.type}`);
    }
}

function handleRegister(clientId: string, ws: WebSocket, message: any, ipAddress: string) {
    const { connectionId, password, isHost, publicKey } = message;

    // 비밀번호 해싱 (salt는 connectionId 사용)
    const passwordHash = hashPassword(password, connectionId);

    const client: Client = {
        id: clientId,
        connectionId,
        passwordHash,
        ws,
        isHost,
        publicKey,
        ipAddress,
        connectedAt: new Date(),
        lastActivity: new Date(),
    };

    clients.set(clientId, client);
    connectionIdMap.set(connectionId, clientId);

    logAccess({
        event: 'register',
        sourceId: connectionId,
        ipAddress,
        success: true
    });

    sendMessage(ws, {
        type: 'registered',
        clientId,
        connectionId,
    });

    console.log(`Client registered: ${connectionId} (${isHost ? 'Host' : 'Viewer'})`);
}

function handleConnect(clientId: string, message: any, ipAddress: string) {
    const { targetConnectionId, password } = message;
    const client = clients.get(clientId);

    if (!client) return;

    const targetClientId = connectionIdMap.get(targetConnectionId);
    if (!targetClientId) {
        sendMessage(client.ws, {
            type: 'connect-error',
            error: 'Connection ID not found',
        });
        logAccess({
            event: 'connect_attempt',
            sourceId: client.connectionId,
            targetId: targetConnectionId,
            ipAddress,
            success: false
        });
        return;
    }

    const targetClient = clients.get(targetClientId);
    if (!targetClient) {
        sendMessage(client.ws, {
            type: 'connect-error',
            error: 'Target not available',
        });
        return;
    }

    // 비밀번호 확인
    const passwordHash = hashPassword(password, targetConnectionId);
    if (targetClient.passwordHash !== passwordHash) {
        recordFailedAttempt(ipAddress);
        sendMessage(client.ws, {
            type: 'connect-error',
            error: 'Invalid password',
        });
        logAccess({
            event: 'auth_failed',
            sourceId: client.connectionId,
            targetId: targetConnectionId,
            ipAddress,
            success: false
        });
        return;
    }

    // 세션 생성
    const sessionId = uuidv4();
    client.sessionId = sessionId;
    client.connectedTo = targetClientId;
    targetClient.sessionId = sessionId;
    targetClient.connectedTo = clientId;

    logAccess({
        event: 'connect_success',
        sourceId: client.connectionId,
        targetId: targetConnectionId,
        ipAddress,
        success: true
    });

    // 양쪽에 연결 성공 알림 (공개키 포함)
    sendMessage(client.ws, {
        type: 'connect-success',
        sessionId,
        targetConnectionId,
        targetPublicKey: targetClient.publicKey,
    });

    sendMessage(targetClient.ws, {
        type: 'incoming-connection',
        sessionId,
        fromConnectionId: client.connectionId,
        fromPublicKey: client.publicKey,
    });

    console.log(`Session created: ${sessionId} between ${client.connectionId} and ${targetConnectionId}`);
}

function handleKeyExchange(clientId: string, message: any) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (!partner) return;

    // 공개키 교환 메시지 전달
    sendMessage(partner.ws, {
        type: 'key-exchange',
        publicKey: message.publicKey,
        sessionId: message.sessionId,
    });
}

function handleSignaling(clientId: string, message: any) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (!partner) return;

    sendMessage(partner.ws, message);
}

function handleWebRTCSignaling(clientId: string, message: any) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (!partner) return;

    // WebRTC 시그널링 메시지를 상대방에게 전달
    sendMessage(partner.ws, message);
    console.log(`[WebRTC] ${message.type} from ${client.connectionId} to ${partner.connectionId}`);
}

function handleRelay(clientId: string, message: any) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (!partner) return;

    sendMessage(partner.ws, {
        type: 'relayed',
        data: message.data,
    });
}

function handleScreenFrame(clientId: string, message: any) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (!partner) return;

    // 화면 프레임을 상대방에게 전달
    sendMessage(partner.ws, {
        type: 'screen-frame',
        frame: message.frame,
    });
}

function handleInputEvent(clientId: string, message: any) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (!partner) return;

    // 입력 이벤트를 상대방에게 전달
    sendMessage(partner.ws, message);
}

function handleDisconnect(clientId: string) {
    const client = clients.get(clientId);
    if (!client || !client.connectedTo) return;

    const partner = clients.get(client.connectedTo);
    if (partner) {
        sendMessage(partner.ws, {
            type: 'disconnected',
            reason: 'Partner disconnected',
        });
        partner.connectedTo = undefined;
        partner.sessionId = undefined;
    }

    client.connectedTo = undefined;
    client.sessionId = undefined;

    logAccess({
        event: 'session_end',
        sourceId: client.connectionId,
        success: true
    });
}

function sendMessage(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// 비활성 세션 정리 (5분마다)
setInterval(() => {
    const now = new Date();
    for (const [clientId, client] of clients.entries()) {
        const inactive = now.getTime() - client.lastActivity.getTime();
        if (inactive > SESSION_TIMEOUT_MS) {
            console.log(`Session timeout: ${client.connectionId}`);
            client.ws.close(4002, 'Session timeout');
        }
    }
}, 5 * 60 * 1000);

// 서버 시작
const PORT = process.env.PORT || 8080;

async function startServer() {
    // PostgreSQL 연결
    await initializeApp();

    server.listen(PORT, () => {
        console.log(`🚀 Remote Desktop Server running on port ${PORT}`);
        console.log(`   WebSocket: ws://localhost:${PORT}`);
        console.log(`   Health: http://localhost:${PORT}/health`);
        console.log(`   🔒 Security features enabled`);
        console.log(`   🐘 PostgreSQL connected`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
