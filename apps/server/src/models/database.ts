/**
 * PostgreSQL 데이터베이스 모델
 * Render PostgreSQL 지원
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// 데이터베이스 연결 풀
let pool: Pool;

/**
 * 데이터베이스 초기화
 */
export async function initDatabase(): Promise<Pool> {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    pool = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });

    // 연결 테스트
    const client = await pool.connect();
    try {
        await client.query('SELECT NOW()');
        console.log('✅ PostgreSQL connected');
    } finally {
        client.release();
    }

    // 테이블 생성 및 마이그레이션
    await createTables();

    console.log('✅ Database initialized');
    return pool;
}

/**
 * 테이블 생성 및 마이그레이션
 */
async function createTables(): Promise<void> {
    const client = await pool.connect();
    try {
        // 사용자 테이블 (스키마 업데이트)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT, -- OAuth 사용자는 비밀번호 없음 (Nullable 변경)
                name TEXT NOT NULL,
                plan TEXT DEFAULT 'free' CHECK(plan IN ('free', 'personal_pro', 'business', 'team')),
                provider TEXT DEFAULT 'local', -- local, google, github
                provider_id TEXT, -- OAuth ID
                avatar_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);

        // 기존 테이블 마이그레이션 (컬럼 추가)
        try {
            await client.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'local';
                ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT;
                ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
                ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
            `);
        } catch (e) {
            console.log('Migration note: Columns might already exist or alteration skipped.');
        }

        // 구독 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                plan TEXT NOT NULL CHECK(plan IN ('free', 'personal_pro', 'business', 'team')),
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired', 'past_due')),
                billing_key TEXT,
                customer_key TEXT,
                current_period_start TIMESTAMP,
                current_period_end TIMESTAMP,
                cancelled_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
        `);

        // 연결 기록 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS connection_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                connection_id TEXT NOT NULL,
                connected_to TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP,
                duration_seconds INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_connection_logs_user ON connection_logs(user_id);
        `);

        // 리프레시 토큰 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
        `);

        console.log('✅ Tables created/migrated');
    } finally {
        client.release();
    }
}

/**
 * 데이터베이스 풀 반환
 */
export function getDatabase(): Pool {
    if (!pool) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return pool;
}

/**
 * 데이터베이스 연결 종료
 */
export async function closeDatabase(): Promise<void> {
    if (pool) {
        await pool.end();
    }
}

// ==========================================
// 사용자 관련 쿼리
// ==========================================

export const userQueries = {
    create: async (id: string, email: string, passwordHash: string | null, name: string, plan: string = 'free', provider: string = 'local', providerId: string | null = null, avatarUrl: string | null = null) => {
        const result = await pool.query(
            'INSERT INTO users (id, email, password_hash, name, plan, provider, provider_id, avatar_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [id, email, passwordHash, name, plan, provider, providerId, avatarUrl]
        );
        return result.rows[0];
    },

    findByEmail: async (email: string) => {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    },

    findById: async (id: string) => {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    },

    updatePlan: async (userId: string, plan: string) => {
        const result = await pool.query(
            'UPDATE users SET plan = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [plan, userId]
        );
        return result.rows[0];
    },

    updateProfile: async (userId: string, name: string) => {
        const result = await pool.query(
            'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [name, userId]
        );
        return result.rows[0];
    }
};

// ==========================================
// 구독 관련 쿼리
// ==========================================

export const subscriptionQueries = {
    create: async (subscription: {
        id: string;
        user_id: string;
        plan: string;
        billing_key?: string;
        customer_key?: string;
        current_period_end?: string;
    }) => {
        const result = await pool.query(
            `INSERT INTO subscriptions (id, user_id, plan, billing_key, customer_key, current_period_start, current_period_end)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6) RETURNING *`,
            [
                subscription.id,
                subscription.user_id,
                subscription.plan,
                subscription.billing_key || null,
                subscription.customer_key || null,
                subscription.current_period_end || null
            ]
        );
        return result.rows[0];
    },

    findByUserId: async (userId: string) => {
        const result = await pool.query(
            'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        return result.rows[0] || null;
    },

    updateStatus: async (subscriptionId: string, status: string) => {
        const result = await pool.query(
            'UPDATE subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, subscriptionId]
        );
        return result.rows[0];
    },

    cancel: async (subscriptionId: string) => {
        const result = await pool.query(
            `UPDATE subscriptions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [subscriptionId]
        );
        return result.rows[0];
    }
};

// ==========================================
// 리프레시 토큰 관련 쿼리
// ==========================================

export const tokenQueries = {
    create: async (userId: string, token: string, expiresAt: string) => {
        const id = uuidv4();
        const result = await pool.query(
            'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, userId, token, expiresAt]
        );
        return result.rows[0];
    },

    findByToken: async (token: string) => {
        const result = await pool.query(
            'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        return result.rows[0] || null;
    },

    deleteByToken: async (token: string) => {
        await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
    },

    deleteByUserId: async (userId: string) => {
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    },

    deleteExpired: async () => {
        await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()');
    }
};

export default { initDatabase, getDatabase, closeDatabase, userQueries, subscriptionQueries, tokenQueries };
