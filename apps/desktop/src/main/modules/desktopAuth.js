/**
 * LunarView - Desktop App Authentication Module
 * 데스크톱 앱 인증 관리
 */

const Store = require('electron-store');
const { net } = require('electron');

const store = new Store({
    name: 'lunarview-auth',
    encryptionKey: 'lunarview-secure-key-2024'
});

// 설정 로드
const APP_CONFIG = require('../config');

// API 서버 URL
const API_BASE = APP_CONFIG.API_URL;

// 현재 인증 상태
let authState = {
    isLoggedIn: false,
    user: null,
    accessToken: null,
    refreshToken: null
};

/**
 * 저장된 인증 정보 로드
 */
function loadStoredAuth() {
    const savedAuth = store.get('auth');
    if (savedAuth) {
        authState = {
            isLoggedIn: !!savedAuth.accessToken,
            user: savedAuth.user || null,
            accessToken: savedAuth.accessToken || null,
            refreshToken: savedAuth.refreshToken || null
        };
    }
    return authState;
}

/**
 * 인증 정보 저장
 */
function saveAuth() {
    store.set('auth', {
        user: authState.user,
        accessToken: authState.accessToken,
        refreshToken: authState.refreshToken
    });
}

/**
 * 인증 정보 삭제
 */
function clearAuth() {
    authState = {
        isLoggedIn: false,
        user: null,
        accessToken: null,
        refreshToken: null
    };
    store.delete('auth');
}

/**
 * HTTP 요청 헬퍼
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(authState.accessToken ? { 'Authorization': `Bearer ${authState.accessToken}` } : {}),
        ...options.headers
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        const data = await response.json();

        // 401 응답시 토큰 갱신 시도
        if (response.status === 401 && authState.refreshToken) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                // 재시도
                headers['Authorization'] = `Bearer ${authState.accessToken}`;
                const retryResponse = await fetch(url, { ...options, headers });
                return await retryResponse.json();
            }
        }

        return data;
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

/**
 * 로그인
 */
async function login(email, password) {
    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (data.success) {
            authState = {
                isLoggedIn: true,
                user: data.user,
                accessToken: data.token,
                refreshToken: data.refreshToken
            };
            saveAuth();
            return { success: true, user: data.user };
        }

        return { success: false, error: data.error || '로그인에 실패했습니다.' };
    } catch (error) {
        return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
}

/**
 * 회원가입
 */
async function register(email, password, name) {
    try {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name })
        });

        if (data.success) {
            authState = {
                isLoggedIn: true,
                user: data.user,
                accessToken: data.token,
                refreshToken: data.refreshToken
            };
            saveAuth();
            return { success: true, user: data.user };
        }

        return { success: false, error: data.error || '회원가입에 실패했습니다.' };
    } catch (error) {
        return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
}

/**
 * 로그아웃
 */
async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    }
    clearAuth();
    return { success: true };
}

/**
 * 토큰 갱신
 */
async function refreshAccessToken() {
    try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success && data.token) {
            authState.accessToken = data.token;
            if (data.refreshToken) {
                authState.refreshToken = data.refreshToken;
            }
            saveAuth();
            return true;
        }
    } catch (error) {
        console.error('Token refresh error:', error);
    }

    clearAuth();
    return false;
}

/**
 * 현재 사용자 정보 가져오기
 */
async function getCurrentUser() {
    if (!authState.accessToken) {
        return null;
    }

    try {
        const data = await apiRequest('/auth/me');
        if (data.success && data.user) {
            // 체험 기간 정보 병합
            const userWithTrial = { ...data.user, trial: data.trial };
            authState.user = userWithTrial;
            saveAuth();
            return userWithTrial;
        }
    } catch (error) {
        console.error('Get user error:', error);
    }

    return authState.user;
}

/**
 * 인증 상태 반환
 */
function getAuthState() {
    return {
        isLoggedIn: authState.isLoggedIn,
        user: authState.user
    };
}

/**
 * 사용자 플랜 반환
 */
function getUserPlan() {
    return authState.user?.plan || 'free';
}

/**
 * 초기화
 */
function init() {
    loadStoredAuth();

    // 저장된 토큰이 있으면 사용자 정보 갱신
    if (authState.accessToken) {
        getCurrentUser().catch(console.error);
    }
}

module.exports = {
    init,
    login,
    register,
    logout,
    getCurrentUser,
    getAuthState,
    getUserPlan,
    refreshAccessToken,
    setSession: (accessToken, refreshToken) => {
        authState.accessToken = accessToken;
        authState.refreshToken = refreshToken;
        authState.isLoggedIn = true;
        saveAuth();
        return true;
    }
};
