import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface ConnectionPanelProps {
    onConnect: (id: string, password: string) => void;
    error: string;
}

interface RecentConnection {
    id: string;
    name: string;
    lastConnected: string;
}

function ConnectionPanel({ onConnect, error }: ConnectionPanelProps) {
    const [remoteId, setRemoteId] = useState('');
    const [remotePwd, setRemotePwd] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [recentConnections, setRecentConnections] = useState<RecentConnection[]>([]);
    const [connectionStep, setConnectionStep] = useState<string>('');

    // 최근 연결 기록 로드
    useEffect(() => {
        loadRecentConnections();
    }, []);

    const loadRecentConnections = async () => {
        try {
            const saved = localStorage.getItem('recentConnections');
            if (saved) {
                setRecentConnections(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load recent connections:', e);
        }
    };

    const saveRecentConnection = (id: string) => {
        const existing = recentConnections.filter(c => c.id !== id);
        const newConnection: RecentConnection = {
            id,
            name: `PC-${id.slice(-4)}`,
            lastConnected: new Date().toISOString()
        };
        const updated = [newConnection, ...existing].slice(0, 5); // 최대 5개
        setRecentConnections(updated);
        localStorage.setItem('recentConnections', JSON.stringify(updated));
    };

    const deleteRecentConnection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = recentConnections.filter(c => c.id !== id);
        setRecentConnections(updated);
        localStorage.setItem('recentConnections', JSON.stringify(updated));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!remoteId || !remotePwd) return;

        setIsConnecting(true);
        setConnectionStep('서버에 연결 중...');

        const cleanId = remoteId.replace(/\D/g, '');

        // 연결 기록 저장
        saveRecentConnection(cleanId);

        // 단계별 상태 업데이트 시뮬레이션
        setTimeout(() => setConnectionStep('상대방 응답 대기 중...'), 1000);
        setTimeout(() => setConnectionStep('P2P 연결 설정 중...'), 2000);

        await onConnect(cleanId, remotePwd);
        setIsConnecting(false);
        setConnectionStep('');
    };

    const handleQuickConnect = (connection: RecentConnection) => {
        setRemoteId(formatId(connection.id));
        // 비밀번호 입력 필드에 포커스
        const pwdInput = document.querySelector('input[type="password"]') as HTMLInputElement;
        pwdInput?.focus();
    };

    const formatId = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 9);
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
    };

    const formatDate = (isoString: string) => {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return '오늘';
        if (days === 1) return '어제';
        if (days < 7) return `${days}일 전`;
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    };

    return (
        <div className="connection-panel">
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        <Icon name="link" size={18} />
                        원격 컴퓨터에 연결
                    </h2>
                    <p className="card-subtitle">상대방의 연결 ID와 비밀번호를 입력하세요</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label">연결 ID</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="000-000-000"
                            value={remoteId}
                            onChange={(e) => setRemoteId(formatId(e.target.value))}
                            maxLength={11}
                            autoFocus
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">비밀번호</label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="••••"
                            value={remotePwd}
                            onChange={(e) => setRemotePwd(e.target.value.toUpperCase())}
                            maxLength={6}
                        />
                    </div>

                    {error && (
                        <div className="error-message">
                            <Icon name="alert" size={16} />
                            <div>
                                <strong>{error}</strong>
                                <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                                    연결 ID와 비밀번호를 확인하거나, 상대방이 앱을 실행 중인지 확인하세요.
                                </p>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={!remoteId || !remotePwd || isConnecting}
                    >
                        {isConnecting ? (
                            <>
                                <Icon name="refresh" size={16} />
                                {connectionStep || '연결 중...'}
                            </>
                        ) : (
                            <>
                                <Icon name="rocket" size={16} />
                                연결하기
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* 최근 연결 */}
            <div className="card" style={{ marginTop: '20px' }}>
                <div className="card-header">
                    <h2 className="card-title">
                        <Icon name="clock" size={18} />
                        최근 연결
                    </h2>
                </div>
                {recentConnections.length > 0 ? (
                    <div className="recent-connections">
                        {recentConnections.map((conn) => (
                            <div
                                key={conn.id}
                                className="recent-connection-item"
                                onClick={() => handleQuickConnect(conn)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.05)',
                                    marginBottom: '8px',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Icon name="monitor" size={20} />
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{conn.name}</div>
                                        <div style={{ fontSize: '12px', opacity: 0.6 }}>
                                            {formatId(conn.id)}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', opacity: 0.5 }}>
                                        {formatDate(conn.lastConnected)}
                                    </span>
                                    <button
                                        className="btn-icon-small"
                                        onClick={(e) => deleteRecentConnection(conn.id, e)}
                                        title="삭제"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            opacity: 0.5,
                                            padding: '4px'
                                        }}
                                    >
                                        <Icon name="x" size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <Icon name="folder" size={40} />
                        <p style={{ marginTop: '12px' }}>
                            아직 연결 기록이 없습니다
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ConnectionPanel;
