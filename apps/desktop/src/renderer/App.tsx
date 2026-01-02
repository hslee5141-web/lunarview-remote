import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import RemoteViewer from './components/RemoteViewer';
import ConnectionPanel from './components/ConnectionPanel';
import SettingsPage from './components/SettingsPage';
import HelpPage from './components/HelpPage';
import FileTransferPage from './components/FileTransferPage';
import HistoryPage, { historyStorage } from './components/HistoryPage';
import TitleBar from './components/TitleBar';
import Icon from './components/Icon';
import AuthModal from './components/AuthModal';
import UserMenu from './components/UserMenu';
import SessionTimer from './components/SessionTimer';
import UpgradePrompt from './components/UpgradePrompt';
import UpdateNotification from './components/UpdateNotification';
import WatermarkOverlay from './components/WatermarkOverlay';
import SpaceBackground from './components/SpaceBackground';
import { useTheme } from './contexts/ThemeContext';
import './styles/themes.css';
import './styles/components.css';
import './styles/auth.css';
import './styles/plan.css';
import './styles/space-background.css';
import './types/electron.d';

type ViewMode = 'host' | 'viewer' | 'connected' | 'settings' | 'help' | 'files' | 'history';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'session-active';

function App() {
    const [viewMode, setViewMode] = useState<ViewMode>('host');
    const [connectionId, setConnectionId] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [isViewer, setIsViewer] = useState(false);
    const [error, setError] = useState<string>('');
    const [p2pConnected, setP2pConnected] = useState(false);
    const { theme } = useTheme();

    // 인증 및 플랜 관련 상태
    const [user, setUser] = useState<any>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showUpgradePrompt, setShowUpgradePrompt] = useState<{ feature: string; message: string } | null>(null);
    const [showWatermark, setShowWatermark] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<any>(null);

    const handleUpdateDownload = () => {
        window.electronAPI.downloadUpdate();
    };

    const handleUpdateInstall = () => {
        window.electronAPI.installUpdate();
    };

    const closeUpdateNotification = () => {
        setUpdateStatus(null);
    };

    useEffect(() => {
        // 이벤트 리스너 등록 및 cleanup 함수 수집
        const cleanups: Array<(() => void) | void> = [];

        cleanups.push(
            window.electronAPI.onConnectionStatus((newStatus: string) => {
                setStatus(newStatus as ConnectionStatus);
                if (newStatus === 'session-active') {
                    setViewMode('connected');
                    // 세션 시작 시 워터마크 확인
                    window.electronAPI.planShouldShowWatermark().then(setShowWatermark);
                    // 세션 시작
                    window.electronAPI.planStartSession();
                } else if (newStatus === 'connected') {
                    setError('');
                    // 세션 종료
                    window.electronAPI.planEndSession();
                    setShowWatermark(false);
                }
            })
        );

        cleanups.push(
            window.electronAPI.onCredentialsUpdated?.((data: { connectionId: string; password: string }) => {
                setConnectionId(data.connectionId);
                setPassword(data.password);
            })
        );

        cleanups.push(
            window.electronAPI.onSessionEnded?.(() => {
                setViewMode('host');
                setIsViewer(false);
                window.electronAPI.planEndSession();
                setShowWatermark(false);
            })
        );

        cleanups.push(
            window.electronAPI.onConnectionError?.((errorMsg: string) => {
                setError(errorMsg);
                setStatus('connected');
            })
        );

        cleanups.push(
            window.electronAPI.onP2PStatus?.((data: { connected: boolean }) => {
                setP2pConnected(data.connected);
            })
        );

        cleanups.push(
            window.electronAPI.onUpdateStatus((data: any) => {
                setUpdateStatus(data);
                // 다운로드 완료 시 자동 알림 표시 (선택 사항)
                if (data.event === 'downloaded') {
                    // console.log('Update downloaded');
                }
            })
        );

        const initCredentials = async () => {
            const id = await window.electronAPI.getConnectionId();
            const pwd = await window.electronAPI.getPassword();
            if (id) setConnectionId(id);
            if (pwd) setPassword(pwd);
        };

        // 사용자 인증 상태 초기화
        const initAuth = async () => {
            try {
                const authUser = await window.electronAPI.authGetUser();
                if (authUser) {
                    setUser(authUser);
                }
            } catch (e) {
                console.log('Not logged in');
            }
        };

        const timeout = setTimeout(() => {
            initCredentials();
            initAuth();
        }, 1500);

        // Cleanup 함수
        return () => {
            clearTimeout(timeout);
            cleanups.forEach(cleanup => cleanup?.());
        };
    }, []);

    const handleConnect = async (remoteId: string, remotePwd: string) => {
        // 플랜 제한 확인
        const canConnect = await window.electronAPI.planCanStartConnection();
        if (!canConnect.allowed) {
            setShowUpgradePrompt({
                feature: '연결 제한',
                message: canConnect.message || '연결 횟수를 초과했습니다.'
            });
            return;
        }

        setError('');
        setIsViewer(true);
        try {
            const success = await window.electronAPI.connect(remoteId, remotePwd);
            if (!success) {
                setError('서버에 연결할 수 없습니다');
                setIsViewer(false);
                // 실패 기록 저장
                historyStorage.addRecord({
                    name: `PC-${remoteId.slice(-4)}`,
                    remoteId: remoteId,
                    duration: '-',
                    type: 'outgoing',
                    status: 'failed'
                });
            } else {
                // 성공 기록 저장
                historyStorage.addRecord({
                    name: `PC-${remoteId.slice(-4)}`,
                    remoteId: remoteId,
                    duration: '연결됨',
                    type: 'outgoing',
                    status: 'success'
                });
            }
        } catch (err: any) {
            setError(err.message || '연결 실패');
            setIsViewer(false);
            // 에러 기록 저장
            historyStorage.addRecord({
                name: `PC-${remoteId.slice(-4)}`,
                remoteId: remoteId,
                duration: '-',
                type: 'outgoing',
                status: 'failed'
            });
        }
    };

    const handleDisconnect = async () => {
        setViewMode('host');
        setIsViewer(false);
        setStatus('connected');
        await window.electronAPI.disconnect();
    };

    const handleRefreshPassword = async () => {
        const newPwd = await window.electronAPI.refreshPassword?.() ||
            await window.electronAPI.getPassword();
        setPassword(newPwd);
    };

    // 인증 핸들러
    const handleLoginSuccess = useCallback((loggedInUser: any) => {
        setUser(loggedInUser);
    }, []);

    const handleLogout = useCallback(async () => {
        await window.electronAPI.authLogout();
        setUser(null);
    }, []);

    // 세션 시간 만료 핸들러
    const handleSessionExpired = useCallback(() => {
        handleDisconnect();
        setShowUpgradePrompt({
            feature: '세션 시간 만료',
            message: '무료 플랜의 세션 시간(30분)이 만료되었습니다.'
        });
    }, []);

    const isActiveView = (mode: ViewMode) => viewMode === mode;

    return (
        <div className="app" data-theme={theme}>
            <SpaceBackground />
            <TitleBar />

            {/* 메뉴 바 - 타이틀바 아래 별도 영역 */}
            <div className="menu-bar">
                <nav className="app-nav">
                    <button
                        className={`nav-btn ${isActiveView('host') ? 'active' : ''}`}
                        onClick={() => setViewMode('host')}
                    // 세션 중에도 홈 화면 확인 가능하도록 허용
                    >
                        <Icon name="home" size={14} />
                        내 컴퓨터
                    </button>
                    <button
                        className={`nav-btn ${isActiveView('viewer') || isActiveView('connected') ? 'active' : ''}`}
                        onClick={() => {
                            if (status === 'session-active') {
                                setViewMode('connected');
                            } else {
                                setViewMode('viewer');
                            }
                        }}
                    >
                        <Icon name="link" size={14} />
                        {status === 'session-active' ? '원격 화면' : '원격 연결'}
                    </button>
                    {status === 'session-active' && (
                        <button
                            className={`nav-btn ${isActiveView('files') ? 'active' : ''}`}
                            onClick={() => setViewMode('files')}
                        >
                            <Icon name="folder" size={14} />
                            파일 전송
                        </button>
                    )}
                    <button
                        className={`nav-btn ${isActiveView('history') ? 'active' : ''}`}
                        onClick={() => setViewMode('history')}
                    >
                        <Icon name="clock" size={14} />
                        기록
                    </button>
                </nav>
                <div className="menu-bar-right">
                    <div className="titlebar-status">
                        <span className={`status-dot ${status === 'session-active' || status === 'connected' ? 'connected' : ''}`}></span>
                        {status === 'session-active' && (
                            <span className="status-text">
                                <Icon name={p2pConnected ? 'zap' : 'cloud'} size={12} />
                                {p2pConnected ? 'P2P' : '릴레이'}
                            </span>
                        )}
                    </div>
                    <button
                        className={`nav-btn-icon ${isActiveView('settings') ? 'active' : ''}`}
                        onClick={() => setViewMode('settings')}
                        title="설정"
                    >
                        <Icon name="settings" size={16} />
                    </button>
                    <button
                        className={`nav-btn-icon ${isActiveView('help') ? 'active' : ''}`}
                        onClick={() => setViewMode('help')}
                        title="도움말"
                    >
                        <Icon name="help" size={16} />
                    </button>
                    <div className="divider-vertical" style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 8px' }} />
                    <UserMenu
                        user={user}
                        onLogin={() => setShowAuthModal(true)}
                        onLogout={handleLogout}
                    />
                </div>
            </div>

            <main className="app-content">
                <div className="main-panel fade-in">
                    {viewMode === 'host' && (
                        <Dashboard
                            connectionId={connectionId}
                            password={password}
                            onRefreshPassword={handleRefreshPassword}
                        />
                    )}

                    {viewMode === 'viewer' && (
                        <ConnectionPanel
                            onConnect={handleConnect}
                            error={error}
                        />
                    )}

                    {viewMode === 'connected' && (
                        <>
                            <RemoteViewer
                                onDisconnect={handleDisconnect}
                                isViewer={isViewer}
                            />
                            <WatermarkOverlay visible={showWatermark} />
                            <SessionTimer
                                isActive={status === 'session-active'}
                                onTimeExpired={handleSessionExpired}
                            />
                        </>
                    )}

                    {viewMode === 'settings' && <SettingsPage />}
                    {viewMode === 'help' && <HelpPage />}
                    {viewMode === 'files' && <FileTransferPage />}
                    {viewMode === 'history' && <HistoryPage />}
                </div>
            </main>

            {/* 사용자 메뉴 - 타이틀바 우측에 추가될 위치 */}

            {/* 인증 모달 */}
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                onLoginSuccess={handleLoginSuccess}
            />

            {/* 업데이트 알림 */}
            <UpdateNotification
                status={updateStatus}
                onDownload={handleUpdateDownload}
                onInstall={handleUpdateInstall}
                onClose={closeUpdateNotification}
            />

            {/* 업그레이드 안내 */}
            {showUpgradePrompt && (
                <UpgradePrompt
                    feature={showUpgradePrompt.feature}
                    message={showUpgradePrompt.message}
                    onClose={() => setShowUpgradePrompt(null)}
                />
            )}
        </div>
    );
}

export default App;

