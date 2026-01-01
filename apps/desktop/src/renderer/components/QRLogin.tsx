import React, { useState, useEffect, useCallback } from 'react';
import Icon from './Icon';

interface QRLoginProps {
    onLoginSuccess: (user: any) => void;
}

interface QRState {
    status: 'loading' | 'ready' | 'waiting' | 'approved' | 'expired' | 'error';
    sessionId?: string;
    qrDataUrl?: string;
    expiresAt?: string;
    error?: string;
}

const API_URL = 'https://lunarview-server.onrender.com';

export default function QRLogin({ onLoginSuccess }: QRLoginProps) {
    const [state, setState] = useState<QRState>({ status: 'loading' });
    const [timeLeft, setTimeLeft] = useState<number>(0);

    // QR 세션 생성
    const generateQRSession = useCallback(async () => {
        setState({ status: 'loading' });

        try {
            const response = await fetch(`${API_URL}/api/auth/qr/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.success) {
                // QR 코드 생성 (브라우저에서)
                const QRCode = (await import('qrcode')).default;
                const qrDataUrl = await QRCode.toDataURL(data.qrData, {
                    width: 200,
                    margin: 2,
                    color: {
                        dark: '#1a1a2e',
                        light: '#ffffff'
                    }
                });

                setState({
                    status: 'ready',
                    sessionId: data.sessionId,
                    qrDataUrl,
                    expiresAt: data.expiresAt
                });

                // 만료 시간 계산
                const expiresAt = new Date(data.expiresAt).getTime();
                const now = Date.now();
                setTimeLeft(Math.floor((expiresAt - now) / 1000));
            } else {
                setState({ status: 'error', error: data.error });
            }
        } catch (error: any) {
            setState({ status: 'error', error: '서버에 연결할 수 없습니다.' });
        }
    }, []);

    // 상태 폴링
    useEffect(() => {
        if (state.status !== 'ready' || !state.sessionId) return;

        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_URL}/api/auth/qr/status/${state.sessionId}`);
                const data = await response.json();

                if (data.success) {
                    if (data.status === 'approved') {
                        clearInterval(pollInterval);
                        setState(prev => ({ ...prev, status: 'approved' }));

                        // 토큰 저장 및 로그인 처리
                        if (data.accessToken && data.user) {
                            // 메인 프로세스에 토큰 전달
                            window.electronAPI.setAuthTokens({
                                accessToken: data.accessToken,
                                refreshToken: data.refreshToken,
                                user: data.user
                            });
                            onLoginSuccess(data.user);
                        }
                    } else if (data.status === 'expired') {
                        clearInterval(pollInterval);
                        setState(prev => ({ ...prev, status: 'expired' }));
                    }
                }
            } catch (error) {
                // 폴링 실패는 무시
            }
        }, 3000); // 3초마다 폴링

        return () => clearInterval(pollInterval);
    }, [state.status, state.sessionId, onLoginSuccess]);

    // 타이머 업데이트
    useEffect(() => {
        if (timeLeft <= 0) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setState(prevState => ({ ...prevState, status: 'expired' }));
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft]);

    // 초기 QR 생성
    useEffect(() => {
        generateQRSession();
    }, [generateQRSession]);

    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="qr-login">
            <div className="qr-login-header">
                <Icon name="smartphone" size={24} />
                <h3>QR 코드로 로그인</h3>
            </div>

            <p className="qr-login-desc">
                웹 또는 모바일에서 로그인 후<br />
                QR 코드를 스캔하세요
            </p>

            <div className="qr-code-container">
                {state.status === 'loading' && (
                    <div className="qr-loading">
                        <div className="spinner"></div>
                        <span>QR 코드 생성 중...</span>
                    </div>
                )}

                {state.status === 'ready' && state.qrDataUrl && (
                    <>
                        <img src={state.qrDataUrl} alt="QR Code" className="qr-code-image" />
                        <div className="qr-timer">
                            <Icon name="clock" size={14} />
                            <span>{formatTime(timeLeft)} 남음</span>
                        </div>
                    </>
                )}

                {state.status === 'approved' && (
                    <div className="qr-approved">
                        <Icon name="check-circle" size={48} />
                        <span>로그인 성공!</span>
                    </div>
                )}

                {state.status === 'expired' && (
                    <div className="qr-expired">
                        <Icon name="alert-circle" size={48} />
                        <span>QR 코드가 만료되었습니다</span>
                        <button onClick={generateQRSession} className="qr-refresh-btn">
                            <Icon name="refresh-cw" size={14} />
                            다시 생성
                        </button>
                    </div>
                )}

                {state.status === 'error' && (
                    <div className="qr-error">
                        <Icon name="x-circle" size={48} />
                        <span>{state.error}</span>
                        <button onClick={generateQRSession} className="qr-refresh-btn">
                            다시 시도
                        </button>
                    </div>
                )}
            </div>

            <div className="qr-login-steps">
                <div className="qr-step">
                    <span className="step-num">1</span>
                    <span>웹사이트에서 로그인</span>
                </div>
                <div className="qr-step">
                    <span className="step-num">2</span>
                    <span>QR 스캐너 열기</span>
                </div>
                <div className="qr-step">
                    <span className="step-num">3</span>
                    <span>이 코드 스캔</span>
                </div>
            </div>
        </div>
    );
}
