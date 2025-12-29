import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/space-background.css';

/**
 * 루나 스페이스 테마 배경
 * 별과 초승달 장식 효과
 */
export default function SpaceBackground() {
    const { theme } = useTheme();

    if (theme !== 'lunar-space') return null;

    return (
        <div className="space-background">
            {/* 별들 */}
            <div className="stars stars-small"></div>
            <div className="stars stars-medium"></div>
            <div className="stars stars-large"></div>

            {/* 초승달 */}
            <div className="crescent-moon">
                <div className="moon-glow"></div>
            </div>

            {/* 보라색 오로라 효과 */}
            <div className="aurora"></div>
        </div>
    );
}
