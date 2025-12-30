/**
 * 인증 API 라우터
 */

import { Router, Request, Response } from 'express';
import { register, login, refreshTokens, logout, getUserById, generateAccessToken, generateRefreshToken } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import passport from '../config/passport';
import { tokenQueries } from '../models/database'; // 토큰 저장을 위해 필요

const router = Router();

// ==========================================
// OAuth Routes
// ==========================================

// Google Login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed', session: false }),
    async (req: Request, res: Response) => {
        handleOAuthSuccess(req, res);
    }
);

// GitHub Login
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback',
    passport.authenticate('github', { failureRedirect: '/login?error=github_auth_failed', session: false }),
    async (req: Request, res: Response) => {
        handleOAuthSuccess(req, res);
    }
);

/**
 * OAuth 성공 핸들러
 * JWT 토큰 발급 및 리다이렉트
 */
async function handleOAuthSuccess(req: Request, res: Response) {
    try {
        const user = req.user as any;

        // 토큰 생성
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();

        // 리프레시 토큰 저장
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7일
        await tokenQueries.create(user.id, refreshToken, expiresAt.toISOString());

        // 딥링크 리다이렉트 (데스크톱 앱)
        // 웹에서도 이 링크를 처리할 수 있도록 라우팅 필요
        // 예: lunarview://auth-callback?token=...&refresh=...
        // 또는 웹은 /auth-callback 라우트로 이동

        // 클라이언트 타입 감지 (User-Agent 등) - 혹은 쿼리 파라미터로 state 전달 가능
        // 지금은 단순하게 웹 페이지로 리다이렉트하되, 딥링크를 실행하는 JS가 포함된 페이지로 보낼 수도 있음.
        // 하지만 가장 깔끔한 건:
        // 성공 페이지를 렌더링하고, 그 페이지가 window.location.href = "lunarview://..." 를 시도.

        // 여기서는 URL 쿼리 파라미터로 토큰을 전달하는 간단한 HTML 응답을 보냅니다.
        // 실제로는 프론트엔드 URL로 리다이렉트하는 것이 좋습니다.

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'; // 웹 뷰어 주소

        // 웹 뷰어로 리다이렉트 -> 웹 뷰어가 URL 파라미터 읽고 처리 -> 데스크톱이면 딥링크 호출?
        // 아니면 직접 HTML 응답

        res.send(`
            <html>
            <head>
                <title>Login Success</title>
                <script>
                    const accessToken = "${accessToken}";
                    const refreshToken = "${refreshToken}";
                    const user = ${JSON.stringify(user)};
                    
                    // 1. 데스크톱 앱 딥링크 시도
                    window.location.href = "lunarview://auth-callback?accessToken=" + accessToken + "&refreshToken=" + refreshToken;
                    
                    // 2. 웹 뷰어용 메시지 (부모 창이 있다면)
                    if (window.opener) {
                        window.opener.postMessage({ type: 'oauth-success', accessToken, refreshToken, user }, '*');
                        window.close();
                    }
                    
                    // 3. 1초 뒤 웹 대시보드로 이동 (데스크톱 앱이 없거나 웹 로그인인 경우)
                    setTimeout(() => {
                        window.location.href = "${frontendUrl}/auth/callback?accessToken=" + accessToken + "&refreshToken=" + refreshToken;
                    }, 1000);
                </script>
                <style>
                    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0a0a0f; color: white; }
                    .container { text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>로그인 성공!</h2>
                    <p>앱으로 돌아가는 중입니다...</p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('OAuth success handler error:', error);
        res.status(500).send('Authentication successful but failed to generate token.');
    }
}

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
