/**
 * Desktop App Configuration
 */

// 개발/배포 환경에 따라 URL 자동 설정
// const isDev = process.env.NODE_ENV === 'development';
const isDev = false; // 배포 서버 테스트를 위해 임시로 false 설정

// 로컬 개발 서버 URL
const LOCAL_SERVER_URL = 'localhost:8080';

// 나중에 Render 배포 URL로 교체할 곳
// 예: 'lunarview-server.onrender.com'
const PROD_SERVER_URL = 'lunarview-server.onrender.com';

const SERVER_HOST = isDev ? LOCAL_SERVER_URL : PROD_SERVER_URL;

const CONFIG = {
    // WebSocket URL (Signal Server)
    WS_URL: isDev ? `ws://${LOCAL_SERVER_URL}` : `wss://${PROD_SERVER_URL}`,

    // API URL (REST API)
    API_URL: isDev ? `http://${LOCAL_SERVER_URL}/api` : `https://${PROD_SERVER_URL}/api`,

    // Auth
    TOKEN_STORAGE_KEY: 'auth_token',
    USER_STORAGE_KEY: 'user_info',

    // App Info
    APP_NAME: 'LunarView',
    VERSION: '1.0.0',

    // Reconnect
    RECONNECT_INTERVAL: 3000,
};

module.exports = CONFIG;
