/**
 * 인증 API 라우터
 */

import { Router, Request, Response } from 'express';
import { register, login, refreshTokens, logout, getUserById, generateAccessToken, generateRefreshToken } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import passport from '../config/passport';
import { tokenQueries, userQueries } from '../models/database'; // 토큰 저장을 위해 필요

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

        const frontendUrl = process.env.FRONTEND_URL || 'https://www.lunarview-remote.com';

        // XSS 방지: 토큰과 사용자 정보를 Base64로 인코딩
        const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            plan: user.plan,
            avatar_url: user.avatar_url
        };
        const encodedData = Buffer.from(JSON.stringify({
            accessToken,
            refreshToken,
            user: safeUser
        })).toString('base64');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Success</title>
                <style>
                    body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0a0a0f; color: white; margin: 0; }
                    .container { text-align: center; }
                    h2 { margin-bottom: 8px; }
                    p { color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>로그인 성공!</h2>
                    <p>잠시만 기다려주세요...</p>
                </div>
                <script>
                    (function() {
                        try {
                            // Base64 디코딩으로 안전하게 데이터 파싱
                            const encodedData = "${encodedData}";
                            const data = JSON.parse(atob(encodedData));
                            const { accessToken, refreshToken, user } = data;
                            
                            // 1. 팝업 창인 경우 (웹 로그인) - 부모 창에 메시지 전송 후 닫기
                            if (window.opener) {
                                window.opener.postMessage({ 
                                    type: 'oauth-success', 
                                    accessToken: accessToken, 
                                    refreshToken: refreshToken, 
                                    user: user 
                                }, '${frontendUrl}');
                                setTimeout(function() { window.close(); }, 500);
                            } 
                            // 2. 직접 열린 창인 경우 (데스크톱 또는 직접 접속)
                            else {
                                // 데스크톱 앱 딥링크 시도
                                var deepLink = "lunarview://auth-callback?accessToken=" + encodeURIComponent(accessToken) + "&refreshToken=" + encodeURIComponent(refreshToken);
                                window.location.href = deepLink;
                                
                                // 딥링크 실패 시 (웹에서 직접 접속한 경우) 웹사이트로 리다이렉트
                                setTimeout(function() {
                                    localStorage.setItem('accessToken', accessToken);
                                    localStorage.setItem('refreshToken', refreshToken);
                                    localStorage.setItem('user', JSON.stringify(user));
                                    window.location.href = "${frontendUrl}";
                                }, 5000);
                            }
                        } catch (e) {
                            console.error('Auth callback error:', e);
                            document.body.innerHTML = '<div class="container"><h2>오류 발생</h2><p>인증 처리 중 문제가 발생했습니다.</p></div>';
                        }
                    })();
                </script>
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
 * 현재 사용자 정보 조회 (체험 정보 포함)
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
        const user = await getUserById(req.user!.userId);

        if (!user) {
            res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
            return;
        }

        // 체험 기간 정보 계산
        let isTrialActive = false;
        let trialDaysLeft = 0;

        if (user.trial_ends_at) {
            const trialEnds = new Date(user.trial_ends_at);
            const now = new Date();
            isTrialActive = trialEnds > now;
            trialDaysLeft = Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        }

        res.json({
            success: true,
            user,
            trial: {
                isActive: isTrialActive,
                daysLeft: trialDaysLeft,
                endsAt: user.trial_ends_at
            }
        });
    } catch (error) {
        console.error('Me route error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

// ==========================================
// 관리자 API
// ==========================================

/**
 * GET /api/auth/admin/users
 * 모든 사용자 조회 (관리자 전용)
 */
router.get('/admin/users', authMiddleware, async (req: Request, res: Response) => {
    try {
        const currentUser = await getUserById((req.user as any).userId || (req.user as any).id);

        if (!currentUser?.is_admin) {
            res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });
            return;
        }

        const users = await userQueries.findAll();
        res.json({ success: true, users });
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * PUT /api/auth/admin/users/:userId/plan
 * 사용자 플랜 변경 (관리자 전용)
 */
router.put('/admin/users/:userId/plan', authMiddleware, async (req: Request, res: Response) => {
    try {
        const currentUser = await getUserById((req.user as any).userId || (req.user as any).id);

        if (!currentUser?.is_admin) {
            res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });
            return;
        }

        const { userId } = req.params;
        const { plan } = req.body;

        if (!['free', 'personal_pro', 'business', 'team'].includes(plan)) {
            res.status(400).json({ success: false, error: '유효하지 않은 플랜입니다.' });
            return;
        }

        const updatedUser = await userQueries.updatePlan(userId, plan);
        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('Admin update plan error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * PUT /api/auth/admin/users/:userId/trial
 * 사용자 체험 기간 변경 (관리자 전용)
 */
router.put('/admin/users/:userId/trial', authMiddleware, async (req: Request, res: Response) => {
    try {
        const currentUser = await getUserById((req.user as any).userId || (req.user as any).id);

        if (!currentUser?.is_admin) {
            res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });
            return;
        }

        const { userId } = req.params;
        const { days } = req.body; // 체험 기간 연장 일수

        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + (days || 30));

        const updatedUser = await userQueries.updateTrialEndsAt(userId, trialEndsAt.toISOString());
        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('Admin update trial error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

export default router;
