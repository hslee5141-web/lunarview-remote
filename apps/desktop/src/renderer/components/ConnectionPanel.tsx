import React, { useState } from 'react';
import Icon from './Icon';

interface ConnectionPanelProps {
    onConnect: (id: string, password: string) => void;
    error: string;
}

function ConnectionPanel({ onConnect, error }: ConnectionPanelProps) {
    const [remoteId, setRemoteId] = useState('');
    const [remotePwd, setRemotePwd] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!remoteId || !remotePwd) return;

        setIsConnecting(true);
        await onConnect(remoteId.replace(/\D/g, ''), remotePwd);
        setIsConnecting(false);
    };

    const formatId = (value: string) => {
        return value.replace(/\D/g, '').slice(0, 9);
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
                            placeholder="000000000"
                            value={remoteId}
                            onChange={(e) => setRemoteId(formatId(e.target.value))}
                            maxLength={9}
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
                            {error}
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
                                연결 중...
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
                <div className="empty-state">
                    <Icon name="folder" size={40} />
                    <p style={{ marginTop: '12px' }}>
                        아직 연결 기록이 없습니다
                    </p>
                </div>
            </div>
        </div>
    );
}

export default ConnectionPanel;
