import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface DashboardProps {
    connectionId: string;
    password: string;
    onRefreshPassword: () => void;
}

interface ScreenSource {
    id: string;
    name: string;
    width: number;
    height: number;
}

function Dashboard({ connectionId, password, onRefreshPassword }: DashboardProps) {
    const [copied, setCopied] = useState<'id' | 'pwd' | null>(null);
    const [screens, setScreens] = useState<ScreenSource[]>([]);
    const [selectedScreen, setSelectedScreen] = useState<string>('');

    // 모니터 목록 로드
    useEffect(() => {
        loadScreens();

        // 창 이동 시 디스플레이 변경 감지
        const cleanup = window.electronAPI.onDisplayChanged?.((data) => {
            console.log('[Dashboard] Display changed, updating selection...');
            updateScreenForDisplay(data.bounds.x);
        });

        return () => cleanup?.();
    }, []);

    // 디스플레이 위치에 따라 화면 선택 업데이트
    const updateScreenForDisplay = async (displayX: number) => {
        try {
            const sources = await window.electronAPI.getScreens();
            if (sources.length > 1) {
                // bounds.x로 모니터 위치 비교 (0이면 1번 모니터, 그 외 2번 모니터)
                const matchingIndex = displayX === 0 ? 0 : 1;
                const newScreen = sources[matchingIndex] || sources[0];

                // 이미 선택된 모니터와 같으면 업데이트 하지 않음 (진동 방지)
                if (selectedScreen === newScreen.id) {
                    return;
                }

                setSelectedScreen(newScreen.id);
                localStorage.setItem('selectedScreen', newScreen.id);
                console.log('[Dashboard] Auto-updated to:', newScreen.name);
            }
        } catch (e) {
            console.error('Failed to update screen:', e);
        }
    };

    const loadScreens = async () => {
        try {
            const sources = await window.electronAPI.getScreens();
            setScreens(sources);

            // 자동 선택 로직
            if (sources.length > 0 && !selectedScreen) {
                // 저장된 값이 있으면 사용
                const saved = localStorage.getItem('selectedScreen');
                if (saved && sources.some(s => s.id === saved)) {
                    setSelectedScreen(saved);
                } else if (sources.length > 1) {
                    // 듀얼 모니터: 앱 창이 있는 모니터 감지
                    const currentDisplay = await window.electronAPI.getCurrentDisplay?.();
                    if (currentDisplay) {
                        // screen source ID 형식: "screen:0:0", "screen:1:0" 등
                        // display 순서와 매칭 시도
                        const displays = sources.map((s, i) => ({ source: s, index: i }));
                        // bounds.x로 모니터 위치 비교
                        const matchingIndex = currentDisplay.bounds.x === 0 ? 0 : 1;
                        const autoSelect = sources[matchingIndex] || sources[0];
                        setSelectedScreen(autoSelect.id);
                        localStorage.setItem('selectedScreen', autoSelect.id);
                        console.log('[Dashboard] Auto-selected app monitor:', autoSelect.name);
                    } else {
                        setSelectedScreen(sources[0].id);
                    }
                } else {
                    setSelectedScreen(sources[0].id);
                }
            }
        } catch (e) {
            console.error('Failed to load screens:', e);
        }
    };

    const handleScreenChange = (screenId: string) => {
        setSelectedScreen(screenId);
        localStorage.setItem('selectedScreen', screenId);
        // WebRTCManager에 알림
        window.electronAPI.setSelectedScreen?.(screenId);
    };

    // 연결 ID 포맷팅 (123456789 -> 123-456-789)
    const formatConnectionId = (id: string) => {
        const digits = id.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
    };

    const copyToClipboard = async (text: string, type: 'id' | 'pwd') => {
        // ID 복사 시 하이픈 제거
        const copyText = type === 'id' ? text.replace(/\D/g, '') : text;
        await navigator.clipboard.writeText(copyText);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="dashboard">
            {/* 연결 ID 카드 */}
            <div className="card credentials-card">
                <div className="card-header">
                    <h2 className="card-title">
                        <Icon name="key" size={18} />
                        내 연결 정보
                    </h2>
                </div>

                <div className="credential-display">
                    <div className="credential-label">연결 ID</div>
                    <div
                        className="credential-value"
                        onClick={() => copyToClipboard(connectionId, 'id')}
                        title="클릭하여 복사"
                    >
                        {formatConnectionId(connectionId) || '000-000-000'}
                    </div>
                    {copied === 'id' && (
                        <div className="copy-toast">
                            <Icon name="check" size={14} /> 복사됨
                        </div>
                    )}
                </div>

                <div className="credential-display">
                    <div className="credential-label">비밀번호</div>
                    <div
                        className="credential-value"
                        onClick={() => copyToClipboard(password, 'pwd')}
                        title="클릭하여 복사"
                        style={{ fontSize: '24px' }}
                    >
                        {password || '••••'}
                    </div>
                    {copied === 'pwd' && (
                        <div className="copy-toast">
                            <Icon name="check" size={14} /> 복사됨
                        </div>
                    )}
                </div>

                <div className="credential-actions">
                    <button className="btn btn-secondary" onClick={onRefreshPassword}>
                        <Icon name="refresh" size={16} />
                        비밀번호 변경
                    </button>
                </div>
            </div>

            {/* 모니터 선택 카드 */}
            {screens.length > 1 && (
                <div className="card">
                    <div className="card-header">
                        <h2 className="card-title">
                            <Icon name="monitor" size={18} />
                            공유할 모니터
                        </h2>
                    </div>
                    <div className="monitor-selector">
                        <select
                            className="setting-select"
                            value={selectedScreen}
                            onChange={(e) => handleScreenChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                fontSize: '14px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                color: 'inherit'
                            }}
                        >
                            {screens.map((screen, index) => (
                                <option key={screen.id} value={screen.id}>
                                    모니터 {index + 1}: {screen.name} ({screen.width}×{screen.height})
                                </option>
                            ))}
                        </select>
                        <p style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px' }}>
                            💡 듀얼 모니터: 공유할 모니터와 다른 모니터에서 뷰어를 실행하면 거울 효과 없이 테스트할 수 있습니다.
                        </p>
                    </div>
                </div>
            )}

            {/* 안내 카드 */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        <Icon name="arrow-right" size={18} />
                        사용 방법
                    </h2>
                </div>
                <div className="guide-steps">
                    <div className="guide-step">
                        <span className="step-number">1</span>
                        <span>위의 연결 ID와 비밀번호를 상대방에게 알려주세요</span>
                    </div>
                    <div className="guide-step">
                        <span className="step-number">2</span>
                        <span>상대방이 접속하면 화면 공유가 시작됩니다</span>
                    </div>
                    <div className="guide-step">
                        <span className="step-number">3</span>
                        <span>클릭으로 ID/비밀번호를 클립보드에 복사하세요</span>
                    </div>
                </div>
            </div>

            {/* 보안 카드 */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        <Icon name="shield" size={18} />
                        보안
                    </h2>
                </div>
                <div className="security-features">
                    <div className="security-item">
                        <Icon name="check-circle" size={16} className="security-icon" />
                        <span>종단간 암호화 (AES-256)</span>
                    </div>
                    <div className="security-item">
                        <Icon name="check-circle" size={16} className="security-icon" />
                        <span>P2P 직접 연결 시도</span>
                    </div>
                    <div className="security-item">
                        <Icon name="check-circle" size={16} className="security-icon" />
                        <span>세션 자동 타임아웃</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
