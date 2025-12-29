/**
 * 인증 서비스
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, userQueries, tokenQueries } from '../models/database';
import { User, JWTPayload, UserPlan } from '../types/api.types';

// 환경 변수
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const SALT_ROUNDS = 12;

/**
 * 비밀번호 해싱
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 비밀번호 검증
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * JWT 액세스 토큰 생성
 */
export function generateAccessToken(user: { id: string; email: string; plan: UserPlan }): string {
    const payload: JWTPayload = {
        userId: user.id,
        email: user.email,
        plan: user.plan
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * JWT 토큰 검증
 */
export function verifyAccessToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
        return null;
    }
}

/**
 * 리프레시 토큰 생성
 */
export function generateRefreshToken(): string {
    return uuidv4() + uuidv4(); // 64자 랜덤 토큰
}

/**
 * 회원가입
 */
export async function register(email: string, password: string, name: string): Promise<{
    success: boolean;
    user?: Omit<User, 'password_hash'>;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
}> {
    try {
        // 이메일 중복 확인
        const existingUser = userQueries.findByEmail(email) as User | undefined;
        if (existingUser) {
            return { success: false, error: '이미 사용 중인 이메일입니다.' };
        }

        // 비밀번호 해싱
        const passwordHash = await hashPassword(password);

        // 사용자 생성
        const userId = uuidv4();
        const db = getDatabase();

        db.prepare(`
            INSERT INTO users (id, email, password_hash, name, plan)
            VALUES (?, ?, ?, ?, 'free')
        `).run(userId, email, passwordHash, name);

        // 생성된 사용자 조회
        const user = userQueries.findById(userId) as User;

        // 토큰 생성
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();

        // 리프레시 토큰 저장
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
        tokenQueries.create(userId, refreshToken, expiresAt.toISOString());

        // 비밀번호 해시 제외하고 반환
        const { password_hash, ...userWithoutPassword } = user;

        return {
            success: true,
            user: userWithoutPassword as Omit<User, 'password_hash'>,
            accessToken,
            refreshToken
        };
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: '회원가입 중 오류가 발생했습니다.' };
    }
}

/**
 * 로그인
 */
export async function login(email: string, password: string): Promise<{
    success: boolean;
    user?: Omit<User, 'password_hash'>;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
}> {
    try {
        // 사용자 조회
        const user = userQueries.findByEmail(email) as User | undefined;
        if (!user) {
            return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
        }

        // 비밀번호 검증
        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
        }

        // 토큰 생성
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();

        // 리프레시 토큰 저장
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
        tokenQueries.create(user.id, refreshToken, expiresAt.toISOString());

        // 비밀번호 해시 제외하고 반환
        const { password_hash, ...userWithoutPassword } = user;

        return {
            success: true,
            user: userWithoutPassword as Omit<User, 'password_hash'>,
            accessToken,
            refreshToken
        };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: '로그인 중 오류가 발생했습니다.' };
    }
}

/**
 * 토큰 갱신
 */
export async function refreshTokens(refreshToken: string): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
}> {
    try {
        // 리프레시 토큰 조회
        const tokenRecord = tokenQueries.findByToken(refreshToken) as any;
        if (!tokenRecord) {
            return { success: false, error: '유효하지 않은 토큰입니다.' };
        }

        // 사용자 조회
        const user = userQueries.findById(tokenRecord.user_id) as User | undefined;
        if (!user) {
            return { success: false, error: '사용자를 찾을 수 없습니다.' };
        }

        // 기존 토큰 삭제
        tokenQueries.deleteByToken(refreshToken);

        // 새 토큰 생성
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken();

        // 새 리프레시 토큰 저장
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
        tokenQueries.create(user.id, newRefreshToken, expiresAt.toISOString());

        return {
            success: true,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        };
    } catch (error) {
        console.error('Token refresh error:', error);
        return { success: false, error: '토큰 갱신 중 오류가 발생했습니다.' };
    }
}

/**
 * 로그아웃
 */
export function logout(refreshToken: string): void {
    try {
        tokenQueries.deleteByToken(refreshToken);
    } catch (error) {
        console.error('Logout error:', error);
    }
}

/**
 * 사용자 ID로 조회
 */
export function getUserById(userId: string): Omit<User, 'password_hash'> | null {
    const user = userQueries.findById(userId) as User | undefined;
    if (!user) return null;

    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword as Omit<User, 'password_hash'>;
}

export default {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    register,
    login,
    refreshTokens,
    logout,
    getUserById
};
