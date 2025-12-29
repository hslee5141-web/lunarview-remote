import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import '../styles/plan.css';

interface SessionTimerProps {
    isActive: boolean;
    onTimeExpired: () => void;
}

export default function SessionTimer({ isActive, onTimeExpired }: SessionTimerProps) {
    const [remainingTime, setRemainingTime] = useState<number | null>(null);
    const [showWarning, setShowWarning] = useState(false);

    useEffect(() => {
        if (!isActive) {
            setRemainingTime(null);
            setShowWarning(false);
            return;
        }

        const checkTime = async () => {
            const time = await window.electronAPI.planGetRemainingTime();
            setRemainingTime(time);

            if (time !== null) {
                // 5분 이하면 경고
                if (time <= 5 * 60 * 1000 && time > 0) {
                    setShowWarning(true);
                }
                // 시간 만료
                if (time <= 0) {
                    onTimeExpired();
                }
            }
        };

        checkTime();
        const interval = setInterval(checkTime, 1000);

        return () => clearInterval(interval);
    }, [isActive, onTimeExpired]);

    if (remainingTime === null || !isActive) {
        return null;
    }

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`session-timer ${showWarning ? 'warning' : ''}`}>
            <Icon name="clock" size={14} />
            <span>남은 시간: {formatTime(remainingTime)}</span>
            {showWarning && (
                <a href="https://lunarview.app/pricing" target="_blank" rel="noopener noreferrer" className="timer-upgrade">
                    업그레이드
                </a>
            )}
        </div>
    );
}
