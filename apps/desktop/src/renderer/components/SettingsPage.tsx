import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import ThemeSelector from './ThemeSelector';
import '../types/electron.d';

interface Settings {
    // 연결 설정
    quality: 'auto' | 'low' | 'medium' | 'high';
    framerate: 30 | 60;
    gameMode: boolean;
    audioEnabled: boolean;

    // 보안 설정
    autoRefreshPassword: boolean;
    sessionTimeout: number;
    requirePassword: boolean;

    // 핫키 설정
    hotkeyPreset: string;

    // 알림 설정
    notifyOnConnect: boolean;
    notifyOnDisconnect: boolean;
    soundEnabled: boolean;

    // 시작 설정
    startWithSystem: boolean;
    startMinimized: boolean;
}

const defaultSettings: Settings = {
    quality: 'auto',
    framerate: 60,
    gameMode: false,
    audioEnabled: true,
    autoRefreshPassword: true,
    sessionTimeout: 60,
    requirePassword: true,
    hotkeyPreset: 'default',
    notifyOnConnect: true,
    notifyOnDisconnect: true,
    soundEnabled: true,
    startWithSystem: false,
    startMinimized: false,
};

function SettingsPage() {
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('lunarview-settings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    });
    const [activeTab, setActiveTab] = useState<'general' | 'connection' | 'security' | 'notifications'>('general');
    const [appVersion, setAppVersion] = useState('--');

    useEffect(() => {
        localStorage.setItem('lunarview-settings', JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        // 앱 버전 로드
        window.electronAPI?.getAppVersion?.().then(version => {
            setAppVersion(version || '1.0.0');
        }).catch(() => setAppVersion('1.0.0'));
    }, []);

    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));

        // Electron API 연동
        if (window.electronAPI) {
            switch (key) {
                case 'quality':
                    window.electronAPI.setQuality?.(value as 'auto' | 'low' | 'medium' | 'high');
                    break;
                case 'framerate':
                    window.electronAPI.setFramerate?.(value as number);
                    break;
                case 'gameMode':
                    window.electronAPI.setGameMode?.(value as boolean);
                    break;
                case 'audioEnabled':
                    window.electronAPI.setAudioEnabled?.(value as boolean);
                    break;
                case 'hotkeyPreset':
                    window.electronAPI.setHotkeyPreset?.(value as string);
                    break;
                case 'sessionTimeout':
                    window.electronAPI.setSessionTimeout?.(value as number);
                    break;
                case 'startWithSystem':
                    window.electronAPI.setAutoLaunch?.(value as boolean);
                    break;
                case 'notifyOnConnect':
                case 'notifyOnDisconnect':
                case 'soundEnabled':
                    window.electronAPI.setNotificationSettings?.({
                        notifyOnConnect: key === 'notifyOnConnect' ? value as boolean : settings.notifyOnConnect,
                        notifyOnDisconnect: key === 'notifyOnDisconnect' ? value as boolean : settings.notifyOnDisconnect,
                        soundEnabled: key === 'soundEnabled' ? value as boolean : settings.soundEnabled
                    });
                    break;
            }
        }
    };

    const resetSettings = () => {
        if (confirm('모든 설정을 초기화하시겠습니까?')) {
            setSettings(defaultSettings);
        }
    };

    const tabs = [
        { id: 'general', label: '일반', icon: 'settings' },
        { id: 'connection', label: '연결', icon: 'link' },
        { id: 'security', label: '보안', icon: 'shield' },
        { id: 'notifications', label: '알림', icon: 'bell' },
    ];

    return (
        <div className="settings-page">
            <h2 className="page-title">
                <Icon name="settings" size={20} />
                설정
            </h2>

            {/* 탭 네비게이션 */}
            <div className="settings-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    >
                        <Icon name={tab.icon} size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="settings-content">
                {/* 일반 설정 */}
                {activeTab === 'general' && (
                    <>
                        <div className="settings-section">
                            <h3 className="section-title">테마</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">앱 테마</span>
                                    <span className="setting-description">앱의 외관을 변경합니다</span>
                                </div>
                                <ThemeSelector />
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="section-title">시작</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">시스템 시작 시 실행</span>
                                    <span className="setting-description">컴퓨터 시작 시 LunarView 자동 실행</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.startWithSystem}
                                        onChange={(e) => updateSetting('startWithSystem', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">최소화 상태로 시작</span>
                                    <span className="setting-description">시작 시 트레이로 최소화</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.startMinimized}
                                        onChange={(e) => updateSetting('startMinimized', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="section-title">핫키</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">핫키 프리셋</span>
                                    <span className="setting-description">단축키 설정을 선택합니다</span>
                                </div>
                                <select
                                    className="setting-select"
                                    value={settings.hotkeyPreset}
                                    onChange={(e) => updateSetting('hotkeyPreset', e.target.value)}
                                >
                                    <option value="default">기본</option>
                                    <option value="classic">클래식 스타일</option>
                                    <option value="compact">간편 스타일</option>
                                    <option value="custom">사용자 정의</option>
                                </select>
                            </div>
                        </div>
                    </>
                )}

                {/* 연결 설정 */}
                {activeTab === 'connection' && (
                    <>
                        <div className="settings-section">
                            <h3 className="section-title">화면 품질</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">화면 품질</span>
                                    <span className="setting-description">원격 화면 해상도 설정</span>
                                </div>
                                <select
                                    className="setting-select"
                                    value={settings.quality}
                                    onChange={(e) => updateSetting('quality', e.target.value as Settings['quality'])}
                                >
                                    <option value="auto">자동 (네트워크에 따라)</option>
                                    <option value="high">높음 (1080p)</option>
                                    <option value="medium">보통 (720p)</option>
                                    <option value="low">낮음 (480p)</option>
                                </select>
                            </div>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">프레임레이트</span>
                                    <span className="setting-description">초당 프레임 수</span>
                                </div>
                                <select
                                    className="setting-select"
                                    value={settings.framerate}
                                    onChange={(e) => updateSetting('framerate', parseInt(e.target.value) as 30 | 60)}
                                >
                                    <option value={60}>60 fps (고품질)</option>
                                    <option value={30}>30 fps (절약)</option>
                                </select>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="section-title">게임 모드</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">게임 모드 활성화</span>
                                    <span className="setting-description">저지연 입력, 높은 프레임레이트 최적화</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.gameMode}
                                        onChange={(e) => updateSetting('gameMode', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="section-title">오디오</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">원격 오디오 전송</span>
                                    <span className="setting-description">원격 PC의 소리를 스트리밍</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.audioEnabled}
                                        onChange={(e) => updateSetting('audioEnabled', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </>
                )}

                {/* 보안 설정 */}
                {activeTab === 'security' && (
                    <>
                        <div className="settings-section">
                            <h3 className="section-title">접근 제어</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">연결 시 비밀번호 필수</span>
                                    <span className="setting-description">모든 연결에 비밀번호 요구</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.requirePassword}
                                        onChange={(e) => updateSetting('requirePassword', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">비밀번호 자동 갱신</span>
                                    <span className="setting-description">연결 시마다 새 비밀번호 생성</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoRefreshPassword}
                                        onChange={(e) => updateSetting('autoRefreshPassword', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="section-title">세션</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">세션 타임아웃</span>
                                    <span className="setting-description">비활성 시 자동 연결 해제</span>
                                </div>
                                <select
                                    className="setting-select"
                                    value={settings.sessionTimeout}
                                    onChange={(e) => updateSetting('sessionTimeout', parseInt(e.target.value))}
                                >
                                    <option value={0}>없음</option>
                                    <option value={15}>15분</option>
                                    <option value={30}>30분</option>
                                    <option value={60}>1시간</option>
                                    <option value={120}>2시간</option>
                                </select>
                            </div>
                        </div>
                    </>
                )}

                {/* 알림 설정 */}
                {activeTab === 'notifications' && (
                    <>
                        <div className="settings-section">
                            <h3 className="section-title">연결 알림</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">연결 시 알림</span>
                                    <span className="setting-description">누군가 연결하면 알림 표시</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.notifyOnConnect}
                                        onChange={(e) => updateSetting('notifyOnConnect', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">연결 해제 시 알림</span>
                                    <span className="setting-description">연결이 종료되면 알림 표시</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.notifyOnDisconnect}
                                        onChange={(e) => updateSetting('notifyOnDisconnect', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="section-title">소리</h3>
                            <div className="setting-item">
                                <div className="setting-info">
                                    <span className="setting-label">알림 소리</span>
                                    <span className="setting-description">이벤트 발생 시 소리 재생</span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.soundEnabled}
                                        onChange={(e) => updateSetting('soundEnabled', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 하단 버튼 */}
            <div className="settings-footer">
                <button className="btn btn-secondary" onClick={resetSettings}>
                    <Icon name="refresh" size={14} />
                    설정 초기화
                </button>
            </div>
        </div>
    );
}

export default SettingsPage;
