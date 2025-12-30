import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import '../styles/auth.css';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: (user: any) => void;
}

export default function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    useEffect(() => {
        // OAuth 로그인 성공 리스너
        const removeListener = window.electronAPI.onOAuthSuccess(async (data: any) => {
            setLoading(true);
            try {
                // 세션은 이미 메인 프로세스에 설정되었으므로 사용자 정보만 가져옴
                const user = await window.electronAPI.authGetUser();
                if (user) {
                    onLoginSuccess(user);
                    onClose();
                } else {
                    setError('사용자 정보를 가져오는데 실패했습니다.');
                }
            } catch (err: any) {
                setError('로그인 처리 중 오류가 발생했습니다.');
            }
            setLoading(false);
        });

        return () => removeListener();
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'register') {
                if (password !== confirmPassword) {
                    setError('비밀번호가 일치하지 않습니다.');
                    setLoading(false);
                    return;
                }
                if (password.length < 8) {
                    setError('비밀번호는 8자 이상이어야 합니다.');
                    setLoading(false);
                    return;
                }
                const result = await window.electronAPI.authRegister(email, password, name);
                if (result.success) {
                    onLoginSuccess(result.user);
                    onClose();
                } else {
                    setError(result.error || '회원가입에 실패했습니다.');
                }
            } else {
                const result = await window.electronAPI.authLogin(email, password);
                if (result.success) {
                    onLoginSuccess(result.user);
                    onClose();
                } else {
                    setError(result.error || '로그인에 실패했습니다.');
                }
            }
        } catch (err: any) {
            setError(err.message || '서버에 연결할 수 없습니다.');
        }

        setLoading(false);
    };

    const switchMode = () => {
        setMode(mode === 'login' ? 'register' : 'login');
        setError('');
    };

    return (
        <div className="auth-modal-overlay" onClick={onClose}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
                <button className="auth-modal-close" onClick={onClose}>
                    <Icon name="x" size={18} />
                </button>

                <div className="auth-modal-header">
                    <div className="auth-logo">
                        <Icon name="monitor" size={32} />
                    </div>
                    <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>
                    <p>{mode === 'login' ? 'LunarView 계정으로 로그인하세요.' : '새 계정을 만들어 시작하세요.'}</p>
                </div>

                {/* 소셜 로그인 버튼 */}
                <div className="social-auth">
                    <button
                        className="social-btn google"
                        onClick={() => window.electronAPI.openExternal('https://lunarview-server.onrender.com/api/auth/google')}
                    >
                        <div className="social-icon">
                            <Icon name="google" size={18} />
                        </div>
                        <span>Google로 계속하기</span>
                    </button>
                    <button
                        className="social-btn github"
                        onClick={() => window.electronAPI.openExternal('https://lunarview-server.onrender.com/api/auth/github')}
                    >
                        <div className="social-icon">
                            <Icon name="github" size={18} />
                        </div>
                        <span>GitHub로 계속하기</span>
                    </button>
                </div>

                <div className="auth-divider">
                    <span>또는 이메일로</span>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {mode === 'register' && (
                        <div className="auth-field">
                            <label>이름</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="홍길동"
                                required
                            />
                        </div>
                    )}

                    <div className="auth-field">
                        <label>이메일</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="example@email.com"
                            required
                        />
                    </div>

                    <div className="auth-field">
                        <label>비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="auth-field">
                            <label>비밀번호 확인</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    )}

                    {error && <div className="auth-error">{error}</div>}

                    <button
                        type="submit"
                        className="auth-submit"
                        disabled={loading}
                    >
                        {loading ? '처리 중...' : (mode === 'login' ? '로그인' : '회원가입')}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>
                        {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
                    </span>
                    <button type="button" onClick={switchMode} className="auth-switch">
                        {mode === 'login' ? '회원가입' : '로그인'}
                    </button>
                </div>
            </div>
        </div>
    );
}
