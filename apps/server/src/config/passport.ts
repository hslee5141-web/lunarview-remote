
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, userQueries } from '../models/database';
import { User, UserPlan } from '../types/api.types';

// 환경 변수 (선택적 - OAuth 제공자별로 설정 가능)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const API_URL = process.env.API_URL || 'https://lunarview-server.onrender.com';

// Passport 직렬화
passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await userQueries.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Google Strategy (환경 변수가 있을 때만 등록)
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${API_URL}/api/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            const googleId = profile.id;
            const displayName = profile.displayName;
            const photo = profile.photos?.[0]?.value;

            if (!email) {
                return done(new Error('No email found directly from Google'), undefined);
            }

            const pool = getDatabase();

            // 1. Provider ID로 찾기
            const existingUserByProvider = await pool.query(
                'SELECT * FROM users WHERE provider_id = $1 AND provider = $2',
                [googleId, 'google']
            );

            if (existingUserByProvider.rows.length > 0) {
                return done(null, existingUserByProvider.rows[0]);
            }

            // 2. 이메일로 찾기 (계정 연동 ?)
            const existingUserByEmail = await userQueries.findByEmail(email);
            if (existingUserByEmail) {
                // 기존 계정이 있으면 업데이트 (provider 정보 추가)
                await pool.query(
                    'UPDATE users SET provider = $1, provider_id = $2, avatar_url = COALESCE(avatar_url, $3), updated_at = CURRENT_TIMESTAMP WHERE id = $4',
                    ['google', googleId, photo, existingUserByEmail.id]
                );
                return done(null, { ...existingUserByEmail, provider: 'google', provider_id: googleId });
            }

            // 3. 새 사용자 생성 (30일 무료 체험)
            const userId = uuidv4();
            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + 30);

            const newUser = await userQueries.create(
                userId,
                email,
                null,
                displayName,
                'free',
                'google',
                googleId,
                photo,
                trialEndsAt.toISOString()
            );

            return done(null, newUser);

        } catch (error) {
            return done(error as Error, undefined);
        }
    }));
    console.log('✅ Google OAuth enabled');
} else {
    console.warn('⚠️ Google OAuth disabled (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
}

// GitHub Strategy (환경 변수가 있을 때만 등록)
if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: `${API_URL}/api/auth/github/callback`,
        scope: ['user:email']
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
            const githubId = profile.id;
            const displayName = profile.displayName || profile.username;
            const photo = profile.photos?.[0]?.value;

            // 이메일 가져오기 (GitHub는 public email이 없을 수 있음)
            let email = profile.emails?.[0]?.value;

            // 이메일이 없으면 실패 처리 (혹은 API 호출로 가져와야 함 - passport-github2는 scope에 따라 가져옴)
            if (!email) {
                return done(new Error('No public email found on GitHub account'), undefined);
            }

            const pool = getDatabase();

            // 1. Provider ID로 찾기
            const existingUserByProvider = await pool.query(
                'SELECT * FROM users WHERE provider_id = $1 AND provider = $2',
                [githubId, 'github']
            );

            if (existingUserByProvider.rows.length > 0) {
                return done(null, existingUserByProvider.rows[0]);
            }

            // 2. 이메일로 찾기
            const existingUserByEmail = await userQueries.findByEmail(email);
            if (existingUserByEmail) {
                await pool.query(
                    'UPDATE users SET provider = $1, provider_id = $2, avatar_url = COALESCE(avatar_url, $3), updated_at = CURRENT_TIMESTAMP WHERE id = $4',
                    ['github', githubId, photo, existingUserByEmail.id]
                );
                return done(null, { ...existingUserByEmail, provider: 'github', provider_id: githubId });
            }

            // 3. 새 사용자 생성 (30일 무료 체험)
            const userId = uuidv4();
            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + 30);

            const newUser = await userQueries.create(
                userId,
                email,
                null,
                displayName,
                'free',
                'github',
                githubId,
                photo,
                trialEndsAt.toISOString()
            );

            return done(null, newUser);

        } catch (error) {
            return done(error, null);
        }
    }));
    console.log('✅ GitHub OAuth enabled');
} else {
    console.warn('⚠️ GitHub OAuth disabled (missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET)');
}

export default passport;

