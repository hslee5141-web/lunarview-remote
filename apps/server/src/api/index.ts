/**
 * API 라우터 통합
 */

import { Router } from 'express';
import authRouter from './auth';
import subscriptionRouter from './subscription';
import qrAuthRouter from './qr-auth';

const apiRouter = Router();

// 인증 API
apiRouter.use('/auth', authRouter);

// QR 코드 로그인 API
apiRouter.use('/auth/qr', qrAuthRouter);

// 구독/결제 API
apiRouter.use('/subscription', subscriptionRouter);

// API 상태 확인
apiRouter.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'LunarView API is running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

export default apiRouter;
