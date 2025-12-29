/**
 * LunarView - Plan Restrictions Module
 * 플랜별 기능 제한 관리
 */

// 플랜 타입
const PLANS = {
    FREE: 'free',
    PERSONAL_PRO: 'personal_pro',
    BUSINESS: 'business',
    TEAM: 'team'
};

// 플랜별 제한 설정
const PLAN_LIMITS = {
    [PLANS.FREE]: {
        name: '무료',
        sessionDuration: 30 * 60 * 1000,  // 30분 (밀리초)
        maxDailyConnections: 5,
        fileTransfer: false,
        multiMonitor: false,
        maxResolution: 720,               // 720p
        simultaneousSessions: 1,
        watermark: true,
        clipboard: true,
        audioStream: false,
        gameMode: false,
        priority: 'low'
    },
    [PLANS.PERSONAL_PRO]: {
        name: '개인 프로',
        sessionDuration: null,            // 무제한
        maxDailyConnections: null,        // 무제한
        fileTransfer: true,
        multiMonitor: true,
        maxResolution: 1080,              // 1080p
        simultaneousSessions: 2,
        watermark: false,
        clipboard: true,
        audioStream: true,
        gameMode: true,
        priority: 'normal'
    },
    [PLANS.BUSINESS]: {
        name: '비즈니스',
        sessionDuration: null,
        maxDailyConnections: null,
        fileTransfer: true,
        multiMonitor: true,
        maxResolution: 2160,              // 4K
        simultaneousSessions: 5,
        watermark: false,
        clipboard: true,
        audioStream: true,
        gameMode: true,
        priority: 'high'
    },
    [PLANS.TEAM]: {
        name: '팀',
        sessionDuration: null,
        maxDailyConnections: null,
        fileTransfer: true,
        multiMonitor: true,
        maxResolution: 2160,              // 4K
        simultaneousSessions: 10,
        watermark: false,
        clipboard: true,
        audioStream: true,
        gameMode: true,
        priority: 'highest'
    }
};

// 현재 사용자 상태
let currentUser = null;
let sessionStartTime = null;
let dailyConnectionCount = 0;
let lastConnectionDate = null;

/**
 * 사용자 정보 설정
 */
function setUser(user) {
    currentUser = user;

    // 일일 연결 카운트 리셋 (날짜가 바뀌면)
    const today = new Date().toDateString();
    if (lastConnectionDate !== today) {
        dailyConnectionCount = 0;
        lastConnectionDate = today;
    }
}

/**
 * 사용자 정보 초기화
 */
function clearUser() {
    currentUser = null;
    sessionStartTime = null;
}

/**
 * 현재 플랜 가져오기
 */
function getCurrentPlan() {
    return currentUser?.plan || PLANS.FREE;
}

/**
 * 플랜 제한 가져오기
 */
function getPlanLimits(plan = null) {
    const targetPlan = plan || getCurrentPlan();
    return PLAN_LIMITS[targetPlan] || PLAN_LIMITS[PLANS.FREE];
}

/**
 * 기능 사용 가능 여부 확인
 */
function canUseFeature(feature) {
    const limits = getPlanLimits();

    switch (feature) {
        case 'fileTransfer':
            return limits.fileTransfer;
        case 'multiMonitor':
            return limits.multiMonitor;
        case 'audioStream':
            return limits.audioStream;
        case 'gameMode':
            return limits.gameMode;
        case 'clipboard':
            return limits.clipboard;
        default:
            return true;
    }
}

/**
 * 연결 시작 가능 여부 확인
 */
function canStartConnection() {
    const limits = getPlanLimits();

    // 일일 연결 제한 확인
    if (limits.maxDailyConnections !== null) {
        const today = new Date().toDateString();
        if (lastConnectionDate !== today) {
            dailyConnectionCount = 0;
            lastConnectionDate = today;
        }

        if (dailyConnectionCount >= limits.maxDailyConnections) {
            return {
                allowed: false,
                reason: 'daily_limit',
                message: `일일 연결 횟수(${limits.maxDailyConnections}회)를 초과했습니다.`,
                upgradeMessage: '프로 플랜으로 업그레이드하면 무제한 연결이 가능합니다.'
            };
        }
    }

    return { allowed: true };
}

/**
 * 세션 시작
 */
function startSession() {
    sessionStartTime = Date.now();
    dailyConnectionCount++;

    const limits = getPlanLimits();

    // 세션 시간 제한이 있으면 타이머 반환
    if (limits.sessionDuration !== null) {
        return {
            duration: limits.sessionDuration,
            warningAt: limits.sessionDuration - (5 * 60 * 1000) // 5분 전 경고
        };
    }

    return null;
}

/**
 * 세션 종료
 */
function endSession() {
    sessionStartTime = null;
}

/**
 * 남은 세션 시간 확인
 */
function getRemainingSessionTime() {
    const limits = getPlanLimits();

    if (limits.sessionDuration === null || !sessionStartTime) {
        return null; // 무제한
    }

    const elapsed = Date.now() - sessionStartTime;
    const remaining = limits.sessionDuration - elapsed;

    return Math.max(0, remaining);
}

/**
 * 세션 만료 여부 확인
 */
function isSessionExpired() {
    const remaining = getRemainingSessionTime();
    return remaining !== null && remaining <= 0;
}

/**
 * 최대 해상도 가져오기
 */
function getMaxResolution() {
    return getPlanLimits().maxResolution;
}

/**
 * 워터마크 표시 여부
 */
function shouldShowWatermark() {
    return getPlanLimits().watermark;
}

/**
 * 업그레이드 필요 기능 목록
 */
function getRequiredUpgradeFeatures() {
    const limits = getPlanLimits();
    const required = [];

    if (!limits.fileTransfer) required.push('파일 전송');
    if (!limits.multiMonitor) required.push('멀티 모니터');
    if (!limits.audioStream) required.push('오디오 스트리밍');
    if (!limits.gameMode) required.push('게임 모드');
    if (limits.watermark) required.push('워터마크 제거');
    if (limits.sessionDuration !== null) required.push('무제한 연결 시간');

    return required;
}

/**
 * 플랜 비교 정보
 */
function getPlanComparison() {
    const current = getCurrentPlan();
    const allPlans = Object.keys(PLAN_LIMITS).map(plan => ({
        id: plan,
        ...PLAN_LIMITS[plan],
        isCurrent: plan === current
    }));

    return allPlans;
}

module.exports = {
    PLANS,
    PLAN_LIMITS,
    setUser,
    clearUser,
    getCurrentPlan,
    getPlanLimits,
    canUseFeature,
    canStartConnection,
    startSession,
    endSession,
    getRemainingSessionTime,
    isSessionExpired,
    getMaxResolution,
    shouldShowWatermark,
    getRequiredUpgradeFeatures,
    getPlanComparison
};
