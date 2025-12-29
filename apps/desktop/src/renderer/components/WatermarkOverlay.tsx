import React from 'react';
import '../styles/plan.css';

interface WatermarkOverlayProps {
    visible: boolean;
}

export default function WatermarkOverlay({ visible }: WatermarkOverlayProps) {
    if (!visible) return null;

    return (
        <div className="watermark-overlay">
            <div className="watermark-text">
                LunarView Free
            </div>
        </div>
    );
}
