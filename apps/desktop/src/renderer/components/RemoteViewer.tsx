import React, { useEffect, useRef, useState } from 'react';
import { webRTCManager } from '../utils/WebRTCManager';
import '../styles/RemoteViewer.css';

interface RemoteViewerProps {
    onDisconnect: () => void;
    isViewer?: boolean;
}

function RemoteViewer({ onDisconnect, isViewer = false }: RemoteViewerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showToolbar, setShowToolbar] = useState(true);
    const [gameMode, setGameMode] = useState(false);
    const [connectionState, setConnectionState] = useState<RTCIceConnectionState>('new');

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Initialize WebRTC based on role
        if (isViewer) {
            webRTCManager.startViewer();
            webRTCManager.on('remote-stream', (stream: MediaStream) => {
                console.log('[RemoteViewer] Received remote stream');
                video.srcObject = stream;
                video.play().catch(e => console.error('Error playing video:', e));
            });
        } else {
            webRTCManager.startHost();
            // Optional: Show local stream for host if needed, but we have an overlay
            /*
            webRTCManager.on('local-stream', (stream: MediaStream) => {
                video.srcObject = stream;
                video.muted = true;
                video.play();
            });
            */
        }

        webRTCManager.on('connection-state-change', (state: RTCIceConnectionState) => {
            setConnectionState(state);
        });

        // Cleanup
        return () => {
            webRTCManager.close();
            webRTCManager.removeAllListeners();
        };
    }, [isViewer]);

    // Input Handling
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isViewer) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = video.getBoundingClientRect();
            // Normalize coordinates 0..1
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
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

        // Attach listeners to video container or video element
        // Video might capture events, but we need to ensure focus
        video.addEventListener('mousemove', handleMouseMove);
        video.addEventListener('mousedown', handleMouseDown);
        video.addEventListener('mouseup', handleMouseUp);
        video.addEventListener('wheel', handleScroll, { passive: false });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement === video || document.body.contains(e.target as Node)) {
                // e.preventDefault(); // Be careful blocking defaults globally if not focused
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

        // Focus video to receive inputs
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
        // Note: WebRTC constraints might need updatng if we want to dynamic switch, 
        // but for now we set maxFrameRate 60 in WebRTCManager.
    };

    return (
        <div className="remote-viewer">
            {showToolbar && (
                <div className="toolbar">
                    <div className="toolbar-left">
                        <span className="connection-status">
                            <span className={`status-dot ${connectionState === 'connected' ? 'connected' : 'connecting'}`}></span>
                            {isViewer ? '원격 연결됨' : '화면 공유 중'} ({connectionState})
                        </span>
                    </div>

                    <div className="toolbar-center">
                        <button
                            className={`tool-btn game-mode ${gameMode ? 'active' : ''}`}
                            onClick={toggleGameMode}
                            title="게임 모드 (60fps)"
                        >
                            🎮
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
                    </div>
                )}
                <video
                    ref={videoRef}
                    className="remote-canvas" // Keeping class name for styles
                    autoPlay
                    playsInline
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
