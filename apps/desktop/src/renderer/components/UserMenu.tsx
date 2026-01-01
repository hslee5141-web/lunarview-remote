import React from 'react';
import Icon from './Icon';
import '../styles/plan.css';

interface UserMenuProps {
    user: {
        name: string;
        email: string;
        plan: string;
        trial?: {
            isActive: boolean;
            daysLeft: number;
        };
    } | null;
    onLogin: () => void;
    onLogout: () => void;
}

const PLAN_NAMES: Record<string, string> = {
    free: '무료',
    personal_pro: '개인 프로',
    business: '비즈니스',
    team: '팀'
};

export default function UserMenu({ user, onLogin, onLogout }: UserMenuProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    if (!user) {
        return (
            <button className="user-login-btn" onClick={onLogin}>
                <Icon name="user" size={14} />
                로그인
            </button>
        );
    }

    return (
        <div className="user-menu">
            <button className="user-menu-btn" onClick={() => setIsOpen(!isOpen)}>
                <div className="user-avatar">
                    {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="user-name">{user.name}</span>
                <span className={`plan-badge small ${user.trial?.isActive ? 'personal_pro' : user.plan}`}>
                    {user.trial?.isActive ? '체험중' : (user.plan === 'free' ? '무료' : 'PRO')}
                </span>
                <Icon name="chevronDown" size={12} />
            </button>

            {isOpen && (
                <>
                    <div className="user-menu-backdrop" onClick={() => setIsOpen(false)} />
                    <div className="user-menu-dropdown">
                        <div className="user-menu-header">
                            <div className="user-avatar large">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="user-info">
                                <span className="user-name">{user.name}</span>
                                <span className="user-email">{user.email}</span>
                            </div>
                        </div>
                        <div className="user-menu-plan">
                            <span className={`plan-badge ${user.plan}`}>
                                {user.trial?.isActive ? '무료 체험' : (PLAN_NAMES[user.plan] || '무료')}
                            </span>
                            {user.trial?.isActive && (
                                <span className="trial-days">
                                    {user.trial.daysLeft}일 남음
                                </span>
                            )}
                            {(user.plan === 'free' || user.trial?.isActive) && (
                                <a
                                    href="https://lunarview.app/pricing"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="upgrade-link"
                                >
                                    업그레이드
                                </a>
                            )}
                        </div>
                        <div className="user-menu-divider" />
                        <button className="user-menu-item" onClick={() => {
                            window.open('https://lunarview.app/dashboard', '_blank');
                            setIsOpen(false);
                        }}>
                            <Icon name="layout" size={14} />
                            대시보드
                        </button>
                        <button className="user-menu-item" onClick={() => {
                            window.open('https://lunarview.app/pricing', '_blank');
                            setIsOpen(false);
                        }}>
                            <Icon name="zap" size={14} />
                            플랜 관리
                        </button>
                        <div className="user-menu-divider" />
                        <button className="user-menu-item danger" onClick={() => {
                            onLogout();
                            setIsOpen(false);
                        }}>
                            <Icon name="logout" size={14} />
                            로그아웃
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
