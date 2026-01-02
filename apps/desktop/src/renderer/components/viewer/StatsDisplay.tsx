import React from 'react';
import Icon from '../Icon';

interface NetworkStats {
    fps: number;
    rtt: number;
    bitrate: number;
    quality: string;
}

interface StatsDisplayProps {
    stats: NetworkStats;
    showStats: boolean;
    connectionState: RTCIceConnectionState;
}

export function StatsDisplay({ stats, showStats, connectionState }: StatsDisplayProps) {
    if (!showStats) return null;
    if (connectionState !== 'connected' && connectionState !== 'completed' && stats.fps === 0) {
        return null;
    }

    const getQualityColor = () => {
        switch (stats.quality) {
            case 'excellent': return '#4ade80';
            case 'good': return '#facc15';
            case 'limited': return '#f87171';
            default: return '#9ca3af';
        }
    };

    const formatBitrate = (bps: number) => {
        if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
        if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
        return `${bps} bps`;
    };

    const getRttColor = () => {
        if (stats.rtt < 50) return '#4ade80';
        if (stats.rtt < 100) return '#facc15';
        return '#f87171';
    };

    return (
        <div className="stats-display">
            <span className="stat-item" title="프레임 레이트">
                <Icon name="activity" size={12} /> {stats.fps} FPS
            </span>
            <span className="stat-item" title="지연 시간" style={{ color: getRttColor() }}>
                <Icon name="timer" size={12} /> {stats.rtt}ms
            </span>
            <span className="stat-item" title="비트레이트">
                <Icon name="chart" size={12} /> {formatBitrate(stats.bitrate)}
            </span>
            <span className="stat-item" title="품질" style={{ color: getQualityColor() }}>
                ● {stats.quality}
            </span>
        </div>
    );
}
