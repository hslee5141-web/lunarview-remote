/**
 * API 타입 정의
 */

// 사용자 플랜 타입
export type UserPlan = 'free' | 'personal_pro' | 'business' | 'team';

// 구독 상태 타입
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'past_due';

// 사용자 인터페이스
export interface User {
    id: string;
    email: string;
    password_hash: string;
    name: string;
    plan: UserPlan;
    provider?: string;
    provider_id?: string;
    avatar_url?: string;
    trial_ends_at?: string;
    is_admin?: boolean;
    created_at: string;
    updated_at: string;
}

// 구독 인터페이스
export interface Subscription {
    id: string;
    user_id: string;
    plan: UserPlan;
    status: SubscriptionStatus;
    billing_key?: string;
    customer_key?: string;
    current_period_start?: string;
    current_period_end?: string;
    cancelled_at?: string;
    created_at: string;
    updated_at: string;
}

// 연결 기록 인터페이스
export interface ConnectionLog {
    id: string;
    user_id: string;
    connection_id: string;
    connected_to?: string;
    started_at: string;
    ended_at?: string;
    duration_seconds?: number;
}

// API 요청/응답 타입

// 회원가입
export interface RegisterRequest {
    email: string;
    password: string;
    name: string;
}

export interface RegisterResponse {
    success: boolean;
    user?: Omit<User, 'password_hash'>;
    token?: string;
    error?: string;
}

// 로그인
export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    success: boolean;
    user?: Omit<User, 'password_hash'>;
    token?: string;
    error?: string;
}

// 구독 체크아웃
export interface CheckoutRequest {
    plan: UserPlan;
    billingCycle: 'monthly' | 'yearly';
}

export interface CheckoutResponse {
    success: boolean;
    checkoutUrl?: string;
    orderId?: string;
    error?: string;
}

// JWT 페이로드
export interface JWTPayload {
    userId: string;
    email: string;
    plan: UserPlan;
    iat?: number;
    exp?: number;
}

// Express Request 확장 (Passport 타입을 위해 User 인터페이스 확장)
declare global {
    namespace Express {
        // Passport의 User 인터페이스를 JWTPayload와 병합
        interface User extends JWTPayload { }
    }
}
