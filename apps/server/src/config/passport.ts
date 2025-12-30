
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, userQueries } from '../models/database';
import { User, UserPlan } from '../types/api.types';

// 환경 변수 확인
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'your-github-client-id';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'your-github-client-secret';
const API_URL = process.env.API_URL || 'http://localhost:3000';

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

// Google Strategy
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

        // 3. 새 사용자 생성
        const userId = uuidv4();
        // userQueries.create 호출 (passwordHash=null)
        // create 함수 서명: (id, email, passwordHash, name, plan, provider, providerId, avatarUrl)
        const newUser = await userQueries.create(
            userId,
            email,
            null,
            displayName,
            'free',
            'google',
            googleId,
            photo
        );

        return done(null, newUser);

    } catch (error) {
        return done(error as Error, undefined);
    }
}));

// GitHub Strategy
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

        // 3. 새 사용자 생성
        const userId = uuidv4();
        const newUser = await userQueries.create(
            userId,
            email,
            null,
            displayName,
            'free',
            'github',
            githubId,
            photo
        );

        return done(null, newUser);

    } catch (error) {
        return done(error, null);
    }
}));

export default passport;
