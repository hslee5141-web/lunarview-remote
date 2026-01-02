import React, { useEffect, useRef, useState } from 'react';
import { webRTCManager } from '../utils/WebRTCManager';
import '../styles/RemoteViewer.css';

interface RemoteViewerProps {
    onDisconnect: () => void;
    isViewer?: boolean;
}

interface NetworkStats {
    fps: number;
    rtt: number;
    bitrate: number;
    quality: string;
}

function RemoteViewer({ onDisconnect, isViewer = false }: RemoteViewerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showToolbar, setShowToolbar] = useState(true);
    const [gameMode, setGameMode] = useState(false);
    const [connectionState, setConnectionState] = useState<RTCIceConnectionState>('new');
    const [showStats, setShowStats] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('high');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [stats, setStats] = useState<NetworkStats>({
        fps: 0,
        rtt: 0,
        bitrate: 0,
        quality: 'connecting'
    });

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let isMounted = true;

        // Initialize WebRTC based on role
        if (isViewer) {
            webRTCManager.startViewer();
            webRTCManager.on('remote-stream', (stream: MediaStream) => {
                if (!isMounted) return;
                console.log('[RemoteViewer] Received remote stream', stream.id);
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    console.log(`[RemoteViewer] Video loaded: ${video.videoWidth}x${video.videoHeight}`);
                    video.play().catch(e => console.error('Error playing video:', e));
                };
            });
        } else {
            webRTCManager.startHost();
        }

        // Connection state 핸들러
        webRTCManager.on('connection-state-change', (state: RTCIceConnectionState) => {
            if (!isMounted) return;
            setConnectionState(state);
        });

        // 비디오 통계 핸들러
        webRTCManager.on('stats', (videoStats: any) => {
            if (!isMounted) return;
            setStats(prev => ({
                ...prev,
                fps: videoStats.framesPerSecond || prev.fps,
                quality: videoStats.qualityLimitationReason === 'none' ? 'excellent' :
                    videoStats.qualityLimitationReason === 'bandwidth' ? 'limited' : 'good'
            }));
        });

        // 네트워크 통계 핸들러
        webRTCManager.on('network-stats', (networkStats: any) => {
            if (!isMounted) return;
            setStats(prev => ({
                ...prev,
                rtt: Math.round(networkStats.rtt || 0),
                bitrate: networkStats.availableBandwidth || prev.bitrate
            }));
        });

        // 재연결 상태 핸들러
        webRTCManager.on('reconnecting', (attempt: number) => {
            if (!isMounted) return;
            setIsReconnecting(true);
            console.log(`[RemoteViewer] Reconnecting... attempt ${attempt}`);
        });

        webRTCManager.on('reconnect-failed', () => {
            if (!isMounted) return;
            setIsReconnecting(false);
            console.log('[RemoteViewer] Reconnect failed');
        });

        // Cleanup - React Strict Mode에서 두 번 호출되므로 즉시 close하지 않음
        return () => {
            isMounted = false;
            // 리스너만 제거하고, close는 onDisconnect에서 처리
            webRTCManager.removeAllListeners();
        };
    }, [isViewer]);

    // Input Handling
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isViewer) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = video.getBoundingClientRect();
            const videoRatio = video.videoWidth / video.videoHeight;
            const elementRatio = rect.width / rect.height;

            let drawWidth = rect.width;
            let drawHeight = rect.height;
            let startX = 0;
            let startY = 0;

            if (elementRatio > videoRatio) {
                drawWidth = rect.height * videoRatio;
                startX = (rect.width - drawWidth) / 2;
            } else {
                drawHeight = rect.width / videoRatio;
                startY = (rect.height - drawHeight) / 2;
            }

            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;

            let x = (clientX - startX) / drawWidth;
            let y = (clientY - startY) / drawHeight;

            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));

            window.electronAPI.sendMouseEvent({ type: 'move', x, y } as any);
        };

        const handleMouseDown = (e: MouseEvent) => {
            window.electronAPI.sendMouseEvent({ type: 'down', button: e.button } as any);
        };

        const handleMouseUp = (e: MouseEvent) => {
            window.electronAPI.sendMouseEvent({ type: 'up', button: e.button } as any);
        };

        const handleScroll = (e: WheelEvent) => {
            e.preventDefault();
            window.electronAPI.sendMouseEvent({
                type: 'scroll',
                deltaY: e.deltaY
            } as any);
        };

        video.addEventListener('mousemove', handleMouseMove);
        video.addEventListener('mousedown', handleMouseDown);
        video.addEventListener('mouseup', handleMouseUp);
        video.addEventListener('wheel', handleScroll, { passive: false });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement === video || document.body.contains(e.target as Node)) {
                window.electronAPI.sendKeyboardEvent({
                    type: 'down',
                    key: e.key,
                    keyCode: e.keyCode,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                } as any);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            window.electronAPI.sendKeyboardEvent({
                type: 'up',
                key: e.key,
                keyCode: e.keyCode,
            } as any);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        video.focus();

        return () => {
            video.removeEventListener('mousemove', handleMouseMove);
            video.removeEventListener('mousedown', handleMouseDown);
            video.removeEventListener('mouseup', handleMouseUp);
            video.removeEventListener('wheel', handleScroll);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isViewer]);

    // 앱 단축키 (뷰어/호스트 공통)
    useEffect(() => {
        const handleAppShortcuts = (e: KeyboardEvent) => {
            // F11: 전체화면 토글
            if (e.key === 'F11') {
                e.preventDefault();
                toggleFullscreen();
            }
            // Esc: 연결 해제 (전체화면이 아닐 때)
            if (e.key === 'Escape' && !document.fullscreenElement) {
                onDisconnect();
            }
            // F9: 통계 표시 토글
            if (e.key === 'F9') {
                e.preventDefault();
                setShowStats(prev => !prev);
            }
            // F8: 오디오 토글
            if (e.key === 'F8') {
                e.preventDefault();
                toggleAudio();
            }
        };

        window.addEventListener('keydown', handleAppShortcuts);
        return () => window.removeEventListener('keydown', handleAppShortcuts);
    }, [onDisconnect]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const toggleGameMode = async () => {
        const newMode = !gameMode;
        setGameMode(newMode);
        await window.electronAPI.setGameMode?.(newMode);
    };

    const toggleAudio = () => {
        const newState = !audioEnabled;
        setAudioEnabled(newState);
        webRTCManager.setAudioEnabled(newState);
    };

    const changeQuality = (preset: 'low' | 'medium' | 'high') => {
        setQualityPreset(preset);
        webRTCManager.setQualityPreset(preset);
    };

    const getQualityColor = () => {
        if (stats.quality === 'excellent') return '#4ade80';
        if (stats.quality === 'good') return '#facc15';
        if (stats.quality === 'limited') return '#f87171';
        return '#9ca3af';
    };

    const formatBitrate = (bps: number) => {
        if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
        if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
        return `${bps} bps`;
    };

    return (
        <div className="remote-viewer">
            {/* 재연결 오버레이 */}
            {isReconnecting && (
                <div className="reconnect-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100,
                    color: '#fff',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div className="spinner" style={{
                        width: '40px',
                        height: '40px',
                        border: '3px solid rgba(255,255,255,0.3)',
                        borderTop: '3px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <span>재연결 중...</span>
                </div>
            )}

            {showToolbar && (
                <div className="toolbar">
                    <div className="toolbar-left">
                        <span className="connection-status">
                            <span className={`status-dot ${connectionState === 'connected' ? 'connected' : 'connecting'}`}></span>
                            {isViewer ? '원격 연결됨' : '화면 공유 중'} ({connectionState})
                        </span>
                    </div>

                    <div className="toolbar-center">
                        {/* 실시간 통계 표시 */}
                        {showStats && connectionState === 'connected' && (
                            <div className="stats-display" style={{
                                display: 'flex',
                                gap: '12px',
                                fontSize: '12px',
                                color: '#e5e7eb',
                                background: 'rgba(0,0,0,0.5)',
                                padding: '4px 10px',
                                borderRadius: '4px'
                            }}>
                                <span title="프레임 레이트">🎬 {stats.fps} FPS</span>
                                <span title="지연 시간" style={{ color: stats.rtt < 50 ? '#4ade80' : stats.rtt < 100 ? '#facc15' : '#f87171' }}>
                                    ⏱️ {stats.rtt}ms
                                </span>
                                <span title="비트레이트">📊 {formatBitrate(stats.bitrate)}</span>
                                <span title="품질" style={{ color: getQualityColor() }}>
                                    ● {stats.quality}
                                </span>
                            </div>
                        )}
                        <button
                            className={`tool-btn game-mode ${gameMode ? 'active' : ''}`}
                            onClick={toggleGameMode}
                            title="게임 모드 (60fps)"
                        >
                            🎮
                        </button>
                        <button
                            className={`tool-btn ${audioEnabled ? 'active' : ''}`}
                            onClick={toggleAudio}
                            title={audioEnabled ? '오디오 켜짐' : '오디오 꺼짐'}
                        >
                            {audioEnabled ? '🔊' : '🔇'}
                        </button>
                        <select
                            className="quality-select"
                            value={qualityPreset}
                            onChange={(e) => changeQuality(e.target.value as 'low' | 'medium' | 'high')}
                            title="품질 설정"
                            style={{
                                background: 'rgba(0,0,0,0.5)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="low">저화질</option>
                            <option value="medium">중화질</option>
                            <option value="high">고화질</option>
                        </select>
                        <button
                            className={`tool-btn ${showStats ? 'active' : ''}`}
                            onClick={() => setShowStats(!showStats)}
                            title="통계 표시"
                            style={{ fontSize: '14px' }}
                        >
                            📈
                        </button>
                    </div>

                    <div className="toolbar-right">
                        <button
                            className="tool-btn"
                            onClick={toggleFullscreen}
                            title="전체 화면"
                        >
                            {isFullscreen ? '🔲' : '⛶'}
                        </button>
                        <button
                            className="tool-btn disconnect"
                            onClick={onDisconnect}
                            title="연결 해제"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            <div className="canvas-container">
                {!isViewer && (
                    <div className="host-overlay">
                        <h2>🖥️ 화면 공유 중</h2>
                        <p>상대방이 귀하의 화면을 보고 있습니다</p>
                        <p>WebRTC 연결 상태: {connectionState}</p>
                        {gameMode && <p className="game-mode-badge">🎮 게임 모드 활성</p>}
                        {connectionState === 'connected' && (
                            <div className="host-stats" style={{
                                marginTop: '16px',
                                fontSize: '14px',
                                color: '#9ca3af'
                            }}>
                                <p>📊 {stats.fps} FPS | ⏱️ {stats.rtt}ms | {formatBitrate(stats.bitrate)}</p>
                            </div>
                        )}
                    </div>
                )}
                <video
                    ref={videoRef}
                    className="remote-canvas"
                    autoPlay
                    playsInline
                    muted
                    tabIndex={0}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
                />
            </div>

            <button
                className="toggle-toolbar"
                onClick={() => setShowToolbar(!showToolbar)}
            >
                {showToolbar ? '▲' : '▼'}
            </button>
        </div>
    );
}

export default RemoteViewer;
