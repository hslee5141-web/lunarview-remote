import React, { useState, useEffect } from 'react';
import Icon from './Icon';

function HelpPage() {
    const [appVersion, setAppVersion] = useState('--');

    useEffect(() => {
        window.electronAPI?.getAppVersion?.().then(version => {
            setAppVersion(version || '1.0.0');
        }).catch(() => setAppVersion('1.0.0'));
    }, []);

    return (
        <div className="help-page">
            <h2 className="page-title">
                <Icon name="help" size={20} />
                도움말
            </h2>

            <div className="help-section">
                <h3 className="section-title">LunarView 시작하기</h3>
                <div className="help-content">
                    <p>LunarView는 안전하고 빠른 원격 데스크톱 솔루션입니다.</p>
                </div>
            </div>

            <div className="help-section">
                <h3 className="section-title">내 컴퓨터 공유하기</h3>
                <div className="help-steps">
                    <div className="help-step">
                        <span className="step-number">1</span>
                        <span>연결 ID와 비밀번호를 상대방에게 알려주세요</span>
                    </div>
                    <div className="help-step">
                        <span className="step-number">2</span>
                        <span>상대방이 접속하면 화면 공유가 시작됩니다</span>
                    </div>
                    <div className="help-step">
                        <span className="step-number">3</span>
                        <span>연결을 종료하려면 "연결 끊기" 버튼을 클릭하세요</span>
                    </div>
                </div>
            </div>

            <div className="help-section">
                <h3 className="section-title">원격 컴퓨터에 접속하기</h3>
                <div className="help-steps">
                    <div className="help-step">
                        <span className="step-number">1</span>
                        <span>"원격 연결" 탭으로 이동하세요</span>
                    </div>
                    <div className="help-step">
                        <span className="step-number">2</span>
                        <span>상대방의 연결 ID와 비밀번호를 입력하세요</span>
                    </div>
                    <div className="help-step">
                        <span className="step-number">3</span>
                        <span>"연결" 버튼을 클릭하세요</span>
                    </div>
                </div>
            </div>

            <div className="help-section">
                <h3 className="section-title">단축키</h3>
                <div className="hotkey-list">
                    <div className="hotkey-item">
                        <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Del</kbd>
                        <span>원격 컴퓨터에 Ctrl+Alt+Del 전송</span>
                    </div>
                    <div className="hotkey-item">
                        <kbd>F11</kbd>
                        <span>전체 화면 전환</span>
                    </div>
                    <div className="hotkey-item">
                        <kbd>F9</kbd>
                        <span>통계 표시 토글</span>
                    </div>
                    <div className="hotkey-item">
                        <kbd>F8</kbd>
                        <span>오디오 토글</span>
                    </div>
                    <div className="hotkey-item">
                        <kbd>Esc</kbd>
                        <span>연결 해제</span>
                    </div>
                </div>
            </div>

            <div className="help-section">
                <h3 className="section-title">버전 정보</h3>
                <div className="version-info">
                    <p><strong>LunarView</strong> v{appVersion}</p>
                    <p className="text-muted">© 2024-2026 LunarView. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
}

export default HelpPage;

