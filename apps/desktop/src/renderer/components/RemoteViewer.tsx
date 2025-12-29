import React, { useEffect, useRef, useState } from 'react';
import '../styles/RemoteViewer.css';

interface RemoteViewerProps {
    onDisconnect: () => void;
    isViewer?: boolean;
}

function RemoteViewer({ onDisconnect, isViewer = false }: RemoteViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [quality, setQuality] = useState<'auto' | 'high' | 'medium' | 'low' | 'game'>('auto');
    const [showToolbar, setShowToolbar] = useState(true);
    const [fps, setFps] = useState(0);
    const [gameMode, setGameMode] = useState(false);
    const [frameSize, setFrameSize] = useState(0);
    const frameCountRef = useRef(0);
    const lastFpsUpdateRef = useRef(Date.now());
    const frameSizeRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 원격 화면 프레임 수신 리스너
        window.electronAPI.onScreenFrame((frameData: string) => {
            frameCountRef.current++;
            frameSizeRef.current = frameData.length * 0.75 / 1024; // KB 단위

            // FPS 계산
            const now = Date.now();
            if (now - lastFpsUpdateRef.current >= 1000) {
                setFps(frameCountRef.current);
                setFrameSize(Math.round(frameSizeRef.current));
                frameCountRef.current = 0;
                lastFpsUpdateRef.current = now;
            }

            // Base64 프레임 데이터를 이미지로 변환
            const img = new Image();
            img.onload = () => {
                if (canvas.width !== img.width) canvas.width = img.width;
                if (canvas.height !== img.height) canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            };
            img.src = `data:image/jpeg;base64,${frameData}`;
        });

        // 뷰어인 경우에만 입력 이벤트 전송
        if (isViewer) {
            const handleMouseMove = (e: MouseEvent) => {
                const rect = canvas.getBoundingClientRect();
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

            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mousedown', handleMouseDown);
            canvas.addEventListener('mouseup', handleMouseUp);
            canvas.addEventListener('wheel', handleScroll, { passive: false });

            const handleKeyDown = (e: KeyboardEvent) => {
                if (document.activeElement === canvas) {
                    e.preventDefault();
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
                if (document.activeElement === canvas) {
                    e.preventDefault();
                    window.electronAPI.sendKeyboardEvent({
                        type: 'up',
                        key: e.key,
                        keyCode: e.keyCode,
                    } as any);
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            canvas.focus();

            return () => {
                canvas.removeEventListener('mousemove', handleMouseMove);
                canvas.removeEventListener('mousedown', handleMouseDown);
                canvas.removeEventListener('mouseup', handleMouseUp);
                canvas.removeEventListener('wheel', handleScroll);
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
            };
        }
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
        if (newMode) {
            setQuality('game');
        } else {
            setQuality('auto');
        }
    };

    const handleQualityChange = async (newQuality: string) => {
        setQuality(newQuality as any);
        if (newQuality === 'game') {
            setGameMode(true);
            await window.electronAPI.setGameMode?.(true);
        } else {
            setGameMode(false);
            await window.electronAPI.setGameMode?.(false);
            if (newQuality !== 'auto') {
                await window.electronAPI.setQuality?.(newQuality);
                await window.electronAPI.setAutoQuality?.(false);
            } else {
                await window.electronAPI.setAutoQuality?.(true);
            }
        }
    };

    return (
        <div className="remote-viewer">
            {showToolbar && (
                <div className="toolbar">
                    <div className="toolbar-left">
                        <span className="connection-status">
                            <span className={`status-dot ${gameMode ? 'game' : 'connected'}`}></span>
                            {isViewer ? '원격 연결됨' : '화면 공유 중'}
                        </span>
                        <span className="fps-indicator">
                            {fps} FPS
                            {frameSize > 0 && <span className="frame-size"> · {frameSize}KB</span>}
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
                        <button className="tool-btn" title="클립보드">📋</button>
                        <button className="tool-btn" title="파일 전송">📁</button>
                        <select
                            className="quality-select"
                            value={quality}
                            onChange={(e) => handleQualityChange(e.target.value)}
                        >
                            <option value="auto">🔄 자동</option>
                            <option value="game">🎮 게임 (60fps)</option>
                            <option value="high">✨ 고품질</option>
                            <option value="medium">📊 중간</option>
                            <option value="low">📉 저품질</option>
                        </select>
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
                        {gameMode && <p className="game-mode-badge">🎮 게임 모드 활성</p>}
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className="remote-canvas"
                    tabIndex={0}
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
