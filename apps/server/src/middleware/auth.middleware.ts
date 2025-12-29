/**
 * JWT 인증 미들웨어
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service';
import { JWTPayload } from '../types/api.types';

/**
 * JWT 인증 미들웨어
 * Authorization 헤더에서 Bearer 토큰을 추출하여 검증
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: '인증이 필요합니다.' });
        return;
    }

    const token = authHeader.substring(7); // 'Bearer ' 이후의 토큰

    const payload = verifyAccessToken(token);
    if (!payload) {
        res.status(401).json({ success: false, error: '유효하지 않거나 만료된 토큰입니다.' });
        return;
    }

    // 요청 객체에 사용자 정보 추가
    req.user = payload;
    next();
}

/**
 * 선택적 인증 미들웨어
 * 토큰이 있으면 검증하고, 없어도 통과
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = verifyAccessToken(token);
        if (payload) {
            req.user = payload;
        }
    }

    next();
}

/**
 * 플랜 검증 미들웨어
 * 특정 플랜 이상의 사용자만 접근 가능
 */
export function requirePlan(...allowedPlans: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, error: '인증이 필요합니다.' });
            return;
        }

        if (!allowedPlans.includes(req.user.plan)) {
            res.status(403).json({
                success: false,
                error: `이 기능은 ${allowedPlans.join(', ')} 플랜에서만 사용할 수 있습니다.`
            });
            return;
        }

        next();
    };
}

export default { authMiddleware, optionalAuthMiddleware, requirePlan };
