/**
 * LunarView 인증 공통 스크립트
 * 모든 페이지에서 로그인 상태를 관리합니다.
 */

const API_BASE = 'http://localhost:8080/api';

// 인증 상태 관리
const Auth = {
    // 토큰 가져오기
    getToken() {
        return localStorage.getItem('accessToken');
    },

    // 사용자 정보 가져오기
    getUser() {
        const userStr = localStorage.getItem('user');
        if (!userStr) return null;
        try {
            return JSON.parse(userStr);
        } catch {
            return null;
        }
    },

    // 로그인 여부 확인
    isLoggedIn() {
        return !!this.getToken() && !!this.getUser();
    },

    // 로그아웃
    async logout() {
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        window.location.href = '/';
    },

    // 인증 헤더 가져오기
    getAuthHeaders() {
        const token = this.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    // 인증된 API 요청
    async fetchWithAuth(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        // 401 응답 시 토큰 갱신 시도
        if (response.status === 401) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${this.getToken()}`;
                return fetch(url, { ...options, headers, credentials: 'include' });
            } else {
                this.logout();
            }
        }

        return response;
    },

    // 토큰 갱신
    async refreshToken() {
        try {
            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await response.json();
            if (data.success && data.token) {
                localStorage.setItem('accessToken', data.token);
                return true;
            }
        } catch (error) {
            console.error('Token refresh error:', error);
        }
        return false;
    }
};

// 네비게이션 UI 업데이트
function updateNavUI() {
    const navGuest = document.getElementById('nav-guest');
    const navUser = document.getElementById('nav-user');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');

    if (!navGuest || !navUser) return;

    if (Auth.isLoggedIn()) {
        const user = Auth.getUser();
        navGuest.style.display = 'none';
        navUser.style.display = 'flex';

        if (user && userName) {
            userName.textContent = user.name || user.email;
            if (userAvatar && user.name) {
                userAvatar.textContent = user.name.charAt(0).toUpperCase();
            }
        }
    } else {
        navGuest.style.display = 'flex';
        navUser.style.display = 'none';
    }
}

// 드롭다운 토글
function initDropdown() {
    const dropdownBtn = document.getElementById('userDropdownBtn');
    const dropdownMenu = document.getElementById('userDropdownMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });

        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
                dropdownMenu.classList.remove('show');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            Auth.logout();
        });
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    updateNavUI();
    initDropdown();
});

// 전역 접근 가능하도록 export
window.Auth = Auth;
window.updateNavUI = updateNavUI;
