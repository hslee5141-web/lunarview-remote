import React from 'react';
import Icon from './Icon';
import '../styles/plan.css';

interface UpgradePromptProps {
    feature: string;
    message: string;
    onClose: () => void;
}

export default function UpgradePrompt({ feature, message, onClose }: UpgradePromptProps) {
    const handleUpgrade = () => {
        window.open('https://lunarview.app/pricing', '_blank');
    };

    return (
        <div className="upgrade-prompt-overlay" onClick={onClose}>
            <div className="upgrade-prompt" onClick={e => e.stopPropagation()}>
                <div className="upgrade-icon">
                    <Icon name="lock" size={32} />
                </div>
                <h3>{feature} 기능 제한</h3>
                <p>{message}</p>
                <div className="upgrade-benefits">
                    <div className="benefit">
                        <Icon name="check" size={16} />
                        <span>무제한 연결 시간</span>
                    </div>
                    <div className="benefit">
                        <Icon name="check" size={16} />
                        <span>파일 전송 기능</span>
                    </div>
                    <div className="benefit">
                        <Icon name="check" size={16} />
                        <span>4K 고해상도 지원</span>
                    </div>
                    <div className="benefit">
                        <Icon name="check" size={16} />
                        <span>워터마크 제거</span>
                    </div>
                </div>
                <div className="upgrade-actions">
                    <button className="upgrade-btn primary" onClick={handleUpgrade}>
                        <Icon name="zap" size={16} />
                        플랜 업그레이드
                    </button>
                    <button className="upgrade-btn secondary" onClick={onClose}>
                        나중에
                    </button>
                </div>
            </div>
        </div>
    );
}
