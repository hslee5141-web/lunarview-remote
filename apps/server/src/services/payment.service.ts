/**
 * 구독/결제 서비스
 * 토스페이먼츠 빌링 연동
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, subscriptionQueries, userQueries } from '../models/database';
import { UserPlan, Subscription } from '../types/api.types';

// 토스페이먼츠 설정
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_sk_XXXXXXXXXXXXXXXX';
const TOSS_BASE_URL = 'https://api.tosspayments.com/v1';

// 플랜 가격 (원화)
export const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
    personal_pro: { monthly: 5900, yearly: 58800 }, // 연간 = 10개월
    business: { monthly: 9900, yearly: 99000 },     // 연간 = 10개월
    team: { monthly: 19900, yearly: 199000 }        // 연간 = 10개월
};

// 플랜 이름 (한글)
export const PLAN_NAMES: Record<string, string> = {
    free: '무료',
    personal_pro: '개인 프로',
    business: '비즈니스',
    team: '팀'
};

/**
 * 결제 세션 생성 (토스페이먼츠)
 */
export async function createCheckoutSession(
    userId: string,
    plan: UserPlan,
    billingCycle: 'monthly' | 'yearly'
): Promise<{
    success: boolean;
    orderId?: string;
    amount?: number;
    orderName?: string;
    customerKey?: string;
    error?: string;
}> {
    try {
        if (plan === 'free') {
            return { success: false, error: '무료 플랜은 결제가 필요하지 않습니다.' };
        }

        const prices = PLAN_PRICES[plan];
        if (!prices) {
            return { success: false, error: '유효하지 않은 플랜입니다.' };
        }

        const amount = billingCycle === 'monthly' ? prices.monthly : prices.yearly;
        const orderId = `ORDER_${Date.now()}_${uuidv4().substring(0, 8)}`;
        const customerKey = `CUSTOMER_${userId}`;
        const periodText = billingCycle === 'monthly' ? '월간' : '연간';
        const orderName = `LunarView ${PLAN_NAMES[plan]} ${periodText} 구독`;

        return {
            success: true,
            orderId,
            amount,
            orderName,
            customerKey
        };
    } catch (error) {
        console.error('Checkout session error:', error);
        return { success: false, error: '결제 세션 생성 중 오류가 발생했습니다.' };
    }
}

/**
 * 결제 승인 (토스페이먼츠 카드 빌링)
 */
export async function confirmPayment(
    userId: string,
    paymentKey: string,
    orderId: string,
    amount: number,
    plan: UserPlan,
    billingCycle: 'monthly' | 'yearly'
): Promise<{
    success: boolean;
    subscription?: any;
    error?: string;
}> {
    try {
        // 토스페이먼츠 결제 승인 API 호출
        const response = await fetch(`${TOSS_BASE_URL}/payments/confirm`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paymentKey,
                orderId,
                amount
            })
        });

        const paymentData = await response.json() as { billingKey?: string; customerKey?: string; message?: string };

        if (!response.ok) {
            return { success: false, error: paymentData.message || '결제 승인 실패' };
        }

        // 구독 기간 계산
        const now = new Date();
        const periodEnd = new Date(now);
        if (billingCycle === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // 구독 생성
        const subscriptionId = uuidv4();
        await subscriptionQueries.create({
            id: subscriptionId,
            user_id: userId,
            plan,
            billing_key: paymentData.billingKey || undefined,
            customer_key: paymentData.customerKey || undefined,
            current_period_end: periodEnd.toISOString()
        });

        // 사용자 플랜 업데이트
        await userQueries.updatePlan(userId, plan);

        return {
            success: true,
            subscription: {
                id: subscriptionId,
                plan,
                status: 'active',
                current_period_end: periodEnd.toISOString()
            }
        };
    } catch (error) {
        console.error('Payment confirmation error:', error);
        return { success: false, error: '결제 처리 중 오류가 발생했습니다.' };
    }
}

/**
 * 현재 구독 조회
 */
export async function getSubscription(userId: string): Promise<Subscription | null> {
    return await subscriptionQueries.findByUserId(userId) as Subscription | null;
}

/**
 * 구독 취소
 */
export async function cancelSubscription(userId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
}> {
    try {
        const subscription = await subscriptionQueries.findByUserId(userId) as Subscription | undefined;

        if (!subscription) {
            return { success: false, error: '활성 구독이 없습니다.' };
        }

        if (subscription.status === 'cancelled') {
            return { success: false, error: '이미 취소된 구독입니다.' };
        }

        // 구독 상태 업데이트
        await subscriptionQueries.cancel(subscription.id);

        // 현재 결제 기간이 끝나면 무료로 다운그레이드됨
        // (스케줄러에서 처리)

        return {
            success: true,
            message: `구독이 취소되었습니다. ${subscription.current_period_end}까지 서비스를 이용하실 수 있습니다.`
        };
    } catch (error) {
        console.error('Subscription cancellation error:', error);
        return { success: false, error: '구독 취소 중 오류가 발생했습니다.' };
    }
}

/**
 * 무료 플랜으로 변경
 */
export async function downgradeToFree(userId: string): Promise<void> {
    await userQueries.updatePlan(userId, 'free');
}

export default {
    PLAN_PRICES,
    PLAN_NAMES,
    createCheckoutSession,
    confirmPayment,
    getSubscription,
    cancelSubscription,
    downgradeToFree
};
