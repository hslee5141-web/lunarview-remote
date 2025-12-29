import React, { useState } from 'react';
import Icon from './Icon';

interface DashboardProps {
    connectionId: string;
    password: string;
    onRefreshPassword: () => void;
}

function Dashboard({ connectionId, password, onRefreshPassword }: DashboardProps) {
    const [copied, setCopied] = useState<'id' | 'pwd' | null>(null);

    const copyToClipboard = async (text: string, type: 'id' | 'pwd') => {
        await navigator.clipboard.writeText(text);
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
                        {connectionId || '000-000-000'}
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
