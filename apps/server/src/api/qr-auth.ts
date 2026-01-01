/**
 * QR 코드 로그인 API
 * 데스크톱 앱에서 QR 표시 → 웹에서 스캔 → 로그인 승인
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.middleware';
import { generateAccessToken, generateRefreshToken } from '../services/auth.service';
import { tokenQueries, userQueries } from '../models/database';

const router = Router();

// QR 세션 저장소 (메모리 - 프로덕션에서는 Redis 권장)
interface QRSession {
    sessionId: string;
    createdAt: Date;
    expiresAt: Date;
    status: 'pending' | 'approved' | 'expired';
    userId?: string;
    accessToken?: string;
    refreshToken?: string;
    user?: any;
}

const qrSessions = new Map<string, QRSession>();

// 만료된 세션 정리 (1분마다)
setInterval(() => {
    const now = new Date();
    for (const [sessionId, session] of qrSessions.entries()) {
        if (session.expiresAt < now) {
            qrSessions.delete(sessionId);
        }
    }
}, 60 * 1000);

/**
 * POST /api/auth/qr/generate
 * QR 세션 생성 (데스크톱 앱에서 호출)
 */
router.post('/generate', (req: Request, res: Response) => {
    try {
        const sessionId = uuidv4();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5분 후 만료

        const session: QRSession = {
            sessionId,
            createdAt: now,
            expiresAt,
            status: 'pending'
        };

        qrSessions.set(sessionId, session);

        // QR 코드에 포함될 데이터 (URL로 변경하여 카메라에서 바로 인식 가능하도록)
        // const qrData = JSON.stringify({
        //     type: 'lunarview-login',
        //     sessionId,
        //     expiresAt: expiresAt.toISOString()
        // });

        // 프로덕션 도메인 사용
        const qrData = `https://lunarview-remote.com/qr-login.html?sessionId=${sessionId}`;

        res.json({
            success: true,
            sessionId,
            qrData,
            expiresAt: expiresAt.toISOString()
        });

    } catch (error) {
        console.error('QR generate error:', error);
        res.status(500).json({ success: false, error: 'QR 세션 생성 실패' });
    }
});

/**
 * GET /api/auth/qr/status/:sessionId
 * QR 세션 상태 확인 (데스크톱 앱에서 폴링)
 */
router.get('/status/:sessionId', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = qrSessions.get(sessionId);

        if (!session) {
            res.status(404).json({ success: false, error: '세션을 찾을 수 없습니다.' });
            return;
        }

        // 만료 확인
        if (session.expiresAt < new Date()) {
            session.status = 'expired';
            qrSessions.delete(sessionId);
            res.json({ success: true, status: 'expired' });
            return;
        }

        // 승인된 경우 토큰 반환
        if (session.status === 'approved') {
            qrSessions.delete(sessionId); // 일회용
            res.json({
                success: true,
                status: 'approved',
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                user: session.user
            });
            return;
        }

        res.json({
            success: true,
            status: session.status,
            expiresAt: session.expiresAt.toISOString()
        });

    } catch (error) {
        console.error('QR status error:', error);
        res.status(500).json({ success: false, error: '상태 확인 실패' });
    }
});

/**
 * POST /api/auth/qr/approve
 * QR 세션 승인 (웹에서 로그인된 사용자가 호출)
 */
router.post('/approve', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user!.userId;

        if (!sessionId) {
            res.status(400).json({ success: false, error: '세션 ID가 필요합니다.' });
            return;
        }

        const session = qrSessions.get(sessionId);

        if (!session) {
            res.status(404).json({ success: false, error: '세션을 찾을 수 없거나 만료되었습니다.' });
            return;
        }

        if (session.status !== 'pending') {
            res.status(400).json({ success: false, error: '이미 처리된 세션입니다.' });
            return;
        }

        if (session.expiresAt < new Date()) {
            session.status = 'expired';
            qrSessions.delete(sessionId);
            res.status(400).json({ success: false, error: '세션이 만료되었습니다.' });
            return;
        }

        // 사용자 정보 조회
        const user = await userQueries.findById(userId);
        if (!user) {
            res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
            return;
        }

        // 토큰 생성
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();

        // 리프레시 토큰 저장
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await tokenQueries.create(user.id, refreshToken, expiresAt.toISOString());

        // 세션 업데이트
        session.status = 'approved';
        session.userId = userId;
        session.accessToken = accessToken;
        session.refreshToken = refreshToken;
        session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            plan: user.plan,
            avatar_url: user.avatar_url
        };

        res.json({
            success: true,
            message: '로그인이 승인되었습니다. 데스크톱 앱에서 로그인됩니다.'
        });

    } catch (error) {
        console.error('QR approve error:', error);
        res.status(500).json({ success: false, error: '승인 처리 실패' });
    }
});

export default router;
