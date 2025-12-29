/**
 * 구독/결제 API 라우터
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
    createCheckoutSession,
    confirmPayment,
    getSubscription,
    cancelSubscription,
    PLAN_PRICES,
    PLAN_NAMES
} from '../services/payment.service';
import { UserPlan } from '../types/api.types';

const router = Router();

/**
 * GET /api/subscription
 * 현재 구독 상태 조회
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const subscription = await getSubscription(req.user!.userId);

        res.json({
            success: true,
            subscription: subscription || {
                plan: req.user!.plan,
                status: 'active'
            },
            currentPlan: req.user!.plan,
            planName: PLAN_NAMES[req.user!.plan]
        });
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * GET /api/subscription/plans
 * 이용 가능한 플랜 목록
 */
router.get('/plans', (req: Request, res: Response) => {
    const plans = Object.entries(PLAN_PRICES).map(([key, prices]) => ({
        id: key,
        name: PLAN_NAMES[key],
        monthlyPrice: prices.monthly,
        yearlyPrice: prices.yearly,
        yearlyMonthlyEquivalent: Math.round(prices.yearly / 12)
    }));

    res.json({
        success: true,
        plans: [
            { id: 'free', name: '무료', monthlyPrice: 0, yearlyPrice: 0 },
            ...plans
        ]
    });
});

/**
 * POST /api/subscription/checkout
 * 결제 세션 생성
 */
router.post('/checkout', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { plan, billingCycle } = req.body;

        // 입력 검증
        if (!plan || !billingCycle) {
            res.status(400).json({ success: false, error: '플랜과 결제 주기는 필수입니다.' });
            return;
        }

        if (!['personal_pro', 'business', 'team'].includes(plan)) {
            res.status(400).json({ success: false, error: '유효하지 않은 플랜입니다.' });
            return;
        }

        if (!['monthly', 'yearly'].includes(billingCycle)) {
            res.status(400).json({ success: false, error: '유효하지 않은 결제 주기입니다.' });
            return;
        }

        const result = await createCheckoutSession(
            req.user!.userId,
            plan as UserPlan,
            billingCycle as 'monthly' | 'yearly'
        );

        if (!result.success) {
            res.status(400).json(result);
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * POST /api/subscription/confirm
 * 결제 승인 (토스페이먼츠 콜백 후 호출)
 */
router.post('/confirm', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { paymentKey, orderId, amount, plan, billingCycle } = req.body;

        // 입력 검증
        if (!paymentKey || !orderId || !amount || !plan || !billingCycle) {
            res.status(400).json({ success: false, error: '필수 결제 정보가 누락되었습니다.' });
            return;
        }

        const result = await confirmPayment(
            req.user!.userId,
            paymentKey,
            orderId,
            amount,
            plan as UserPlan,
            billingCycle as 'monthly' | 'yearly'
        );

        if (!result.success) {
            res.status(400).json(result);
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * POST /api/subscription/cancel
 * 구독 취소
 */
router.post('/cancel', authMiddleware, async (req: Request, res: Response) => {
    try {
        const result = await cancelSubscription(req.user!.userId);

        if (!result.success) {
            res.status(400).json(result);
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

/**
 * POST /api/subscription/webhook
 * 토스페이먼츠 웹훅 (결제 상태 변경 알림)
 */
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const { eventType, data } = req.body;

        console.log('Webhook received:', eventType, data);

        // TODO: 웹훅 시그니처 검증
        // TODO: 결제 상태에 따른 처리
        // - DONE: 결제 완료
        // - CANCELED: 결제 취소
        // - PARTIAL_CANCELED: 부분 취소
        // - ABORTED: 결제 실패
        // - EXPIRED: 결제 만료

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: '웹훅 처리 실패' });
    }
});

export default router;
