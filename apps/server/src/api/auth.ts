/**
 * 인증 API 라우터
 */

import { Router, Request, Response } from 'express';
import { register, login, refreshTokens, logout, getUserById } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/auth/register
 * 회원가입
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        // 입력 검증
        if (!email || !password || !name) {
            res.status(400).json({ success: false, error: '이메일, 비밀번호, 이름은 필수입니다.' });
            return;
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({ success: false, error: '올바른 이메일 형식이 아닙니다.' });
            return;
        }

        // 비밀번호 강도 검증
        if (password.length < 8) {
            res.status(400).json({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' });
            return;
        }

        const result = await register(email, password, name);

        if (!result.success) {
            res.status(400).json(result);
            return;
        }

        // 쿠키에 리프레시 토큰 설정
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7일
        });

        res.status(201).json({
            success: true,
            user: result.user,
            token: result.accessToken
        });
    } catch (error) {
        console.error('Register route error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * POST /api/auth/login
 * 로그인
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // 입력 검증
        if (!email || !password) {
            res.status(400).json({ success: false, error: '이메일과 비밀번호는 필수입니다.' });
            return;
        }

        const result = await login(email, password);

        if (!result.success) {
            res.status(401).json(result);
            return;
        }

        // 쿠키에 리프레시 토큰 설정
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7일
        });

        res.json({
            success: true,
            user: result.user,
            token: result.accessToken
        });
    } catch (error) {
        console.error('Login route error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * POST /api/auth/logout
 * 로그아웃
 */
router.post('/logout', (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
        logout(refreshToken);
    }

    res.clearCookie('refreshToken');
    res.json({ success: true, message: '로그아웃되었습니다.' });
});

/**
 * POST /api/auth/refresh
 * 토큰 갱신
 */
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

        if (!refreshToken) {
            res.status(401).json({ success: false, error: '리프레시 토큰이 필요합니다.' });
            return;
        }

        const result = await refreshTokens(refreshToken);

        if (!result.success) {
            res.clearCookie('refreshToken');
            res.status(401).json(result);
            return;
        }

        // 새 리프레시 토큰을 쿠키에 설정
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7일
        });

        res.json({
            success: true,
            token: result.accessToken
        });
    } catch (error) {
        console.error('Refresh route error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * GET /api/auth/me
 * 현재 사용자 정보 조회
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
        const user = await getUserById(req.user!.userId);

        if (!user) {
            res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
            return;
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Me route error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

export default router;
