import React, { useEffect, useRef, useState } from 'react';
import { webRTCManager } from '../utils/WebRTCManager';
import Icon from './Icon';
import { ChatPanel, FileTransferPanel, StatsDisplay } from './viewer';
import { useRecording, useChat, useFileTransfer } from '../hooks';
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

    // 기본 상태
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showToolbar, setShowToolbar] = useState(true);
    const [gameMode, setGameMode] = useState(false);
    const [connectionState, setConnectionState] = useState<RTCIceConnectionState>('new');
    const [showStats, setShowStats] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('high');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [stats, setStats] = useState<NetworkStats>({
        fps: 0, rtt: 0, bitrate: 0, quality: 'connecting'
    });

    // 멀티 모니터
    const [availableScreens, setAvailableScreens] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedScreen, setSelectedScreen] = useState<string>('');

    // 커스텀 훅
    const recording = useRecording();
    const chat = useChat();
    const fileTransfer = useFileTransfer();

    // Refs
    const toolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mousePosRef = useRef<{ x: number, y: number } | null>(null);
    const rafRef = useRef<number | null>(null);

    const TOOLBAR_HIDE_DELAY = 3000;

    // 툴바 자동 숨김
    const showToolbarTemporarily = () => {
        setShowToolbar(true);
        if (toolbarTimeoutRef.current) clearTimeout(toolbarTimeoutRef.current);
        toolbarTimeoutRef.current = setTimeout(() => setShowToolbar(false), TOOLBAR_HIDE_DELAY);
    };

    // WebRTC 초기화
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let isMounted = true;

        if (isViewer) {
            webRTCManager.startViewer();
            const existingStream = webRTCManager.getRemoteStream();
            if (existingStream) {
                video.srcObject = existingStream;
                video.onloadedmetadata = () => video.play().catch(console.error);
            }
            webRTCManager.on('remote-stream', (stream: MediaStream) => {
                if (!isMounted) return;
                video.srcObject = stream;
                video.onloadedmetadata = () => video.play().catch(console.error);
            });
        } else {
            webRTCManager.startHost();
            window.electronAPI.getScreens().then(screens => {
                if (!isMounted) return;
                setAvailableScreens(screens);
                if (screens.length > 0 && !selectedScreen) setSelectedScreen(screens[0].id);
            });
        }

        webRTCManager.on('connection-state-change', (state: RTCIceConnectionState) => {
            if (isMounted) setConnectionState(state);
        });

        webRTCManager.on('stats', (videoStats: any) => {
            if (!isMounted) return;
            setStats(prev => ({
                ...prev,
                fps: videoStats.framesPerSecond || prev.fps,
                quality: videoStats.qualityLimitationReason === 'none' ? 'excellent' :
                    videoStats.qualityLimitationReason === 'bandwidth' ? 'limited' : 'good'
            }));
        });

        webRTCManager.on('network-stats', (networkStats: any) => {
            if (!isMounted) return;
            setStats(prev => ({
                ...prev,
                rtt: Math.round(networkStats.rtt || 0),
                bitrate: networkStats.availableBandwidth || prev.bitrate
            }));
        });

        webRTCManager.on('reconnecting', () => isMounted && setIsReconnecting(true));
        webRTCManager.on('reconnect-failed', () => isMounted && setIsReconnecting(false));

        const cleanupFileProgress = window.electronAPI.onFileProgress(fileTransfer.updateFileProgress);

        return () => {
            isMounted = false;
            webRTCManager.removeAllListeners();
            cleanupFileProgress?.();
            if (toolbarTimeoutRef.current) clearTimeout(toolbarTimeoutRef.current);
        };
    }, [isViewer, selectedScreen, fileTransfer.updateFileProgress]);

    // 입력 핸들링
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isViewer) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = video.getBoundingClientRect();
            mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

            if (rafRef.current === null) {
                rafRef.current = requestAnimationFrame(() => {
                    if (!mousePosRef.current || !video) return;
                    const rect = video.getBoundingClientRect();
                    const videoRatio = video.videoWidth / video.videoHeight;
                    const elementRatio = rect.width / rect.height;

                    let drawWidth = rect.width, drawHeight = rect.height, startX = 0, startY = 0;
                    if (elementRatio > videoRatio) {
                        drawWidth = rect.height * videoRatio;
                        startX = (rect.width - drawWidth) / 2;
                    } else {
                        drawHeight = rect.width / videoRatio;
                        startY = (rect.height - drawHeight) / 2;
                    }

                    let x = Math.max(0, Math.min(1, (mousePosRef.current.x - startX) / drawWidth));
                    let y = Math.max(0, Math.min(1, (mousePosRef.current.y - startY) / drawHeight));
                    window.electronAPI.sendMouseEvent({ type: 'move', x, y } as any);
                    rafRef.current = null;
                });
            }
        };

        const handleMouseDown = (e: MouseEvent) => window.electronAPI.sendMouseEvent({ type: 'down', button: e.button } as any);
        const handleMouseUp = (e: MouseEvent) => window.electronAPI.sendMouseEvent({ type: 'up', button: e.button } as any);
        const handleScroll = (e: WheelEvent) => {
            e.preventDefault();
            window.electronAPI.sendMouseEvent({ type: 'scroll', deltaY: e.deltaY } as any);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            window.electronAPI.sendKeyboardEvent({
                type: 'down', key: e.key, keyCode: e.keyCode,
                ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey
            } as any);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            window.electronAPI.sendKeyboardEvent({ type: 'up', key: e.key, keyCode: e.keyCode } as any);
        };

        video.addEventListener('mousemove', handleMouseMove);
        video.addEventListener('mousedown', handleMouseDown);
        video.addEventListener('mouseup', handleMouseUp);
        video.addEventListener('wheel', handleScroll, { passive: false });
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
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isViewer]);

    // 단축키
    useEffect(() => {
        const handleShortcuts = (e: KeyboardEvent) => {
            if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
            if (e.key === 'Escape' && !document.fullscreenElement) onDisconnect();
            if (e.key === 'F9') { e.preventDefault(); setShowStats(p => !p); }
            if (e.key === 'F8') { e.preventDefault(); toggleAudio(); }
        };
        window.addEventListener('keydown', handleShortcuts);
        return () => window.removeEventListener('keydown', handleShortcuts);
    }, [onDisconnect]);

    // 헬퍼 함수
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
        await webRTCManager.setGameMode(newMode);
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

    const handleRecordingToggle = () => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        recording.toggleRecording(stream);
    };

    return (
        <div
            className={`remote-viewer ${isViewer ? 'viewer-mode' : ''}`}
            onMouseMove={showToolbarTemporarily}
            onMouseEnter={showToolbarTemporarily}
            onDragEnter={(e) => fileTransfer.handleDragEnter(e, isViewer)}
            onDragOver={fileTransfer.handleDragOver}
            onDragLeave={fileTransfer.handleDragLeave}
            onDrop={(e) => fileTransfer.handleDrop(e, isViewer)}
        >
            {/* 드래그 오버레이 */}
            {fileTransfer.isDragOver && (
                <div className="drag-overlay">
                    <div className="drag-overlay-content">
                        <Icon name="upload" size={48} />
                        <p style={{ fontSize: '18px', marginTop: '12px', color: '#fff' }}>파일을 여기에 놓으세요</p>
                        <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>원격 PC로 전송됩니다</p>
                    </div>
                </div>
            )}

            {/* 파일 전송 패널 */}
            <FileTransferPanel fileTransfers={fileTransfer.fileTransfers} />

            {/* 채팅 패널 */}
            <ChatPanel
                showChat={chat.showChat}
                chatMessages={chat.chatMessages}
                chatInput={chat.chatInput}
                chatMessagesRef={chat.chatMessagesRef}
                onInputChange={chat.setChatInput}
                onSendMessage={chat.sendChatMessage}
                onClose={chat.toggleChat}
            />

            {/* 재연결 오버레이 */}
            {isReconnecting && (
                <div className="reconnect-overlay">
                    <div className="spinner" />
                    <span>재연결 중...</span>
                </div>
            )}

            {/* 툴바 */}
            <div className={`toolbar ${showToolbar ? '' : 'hidden'}`}>
                <div className="toolbar-left">
                    <span className="connection-status">
                        <span className={`status-dot ${connectionState === 'connected' ? 'connected' : 'connecting'}`} />
                        {isViewer ? '원격 연결됨' : '화면 공유 중'} ({connectionState})
                    </span>
                </div>

                <div className="toolbar-center">
                    <StatsDisplay stats={stats} showStats={showStats} connectionState={connectionState} />
                    <button className={`tool-btn ${gameMode ? 'active' : ''}`} onClick={toggleGameMode} title="게임 모드">
                        <Icon name="gamepad" size={16} />
                    </button>
                    <button className={`tool-btn ${audioEnabled ? 'active' : ''}`} onClick={toggleAudio} title="오디오">
                        <Icon name={audioEnabled ? 'volume' : 'volume-x'} size={16} />
                    </button>
                    <select className="quality-select" value={qualityPreset} onChange={(e) => changeQuality(e.target.value as any)}>
                        <option value="low">저화질</option>
                        <option value="medium">중화질</option>
                        <option value="high">고화질</option>
                    </select>
                    <button className={`tool-btn ${showStats ? 'active' : ''}`} onClick={() => setShowStats(!showStats)} title="통계">
                        <Icon name="chart" size={16} />
                    </button>
                    {isViewer && (
                        <button
                            className={`tool-btn ${recording.isRecording ? 'active' : ''}`}
                            onClick={handleRecordingToggle}
                            title={recording.isRecording ? '녹화 중지' : '화면 녹화'}
                            style={{ background: recording.isRecording ? 'rgba(239,68,68,0.3)' : undefined }}
                        >
                            <Icon name={recording.isRecording ? 'stop' : 'video'} size={16} />
                            {recording.isRecording && (
                                <span style={{ marginLeft: '6px', fontSize: '11px', color: '#ef4444', fontFamily: 'monospace' }}>
                                    {recording.formatRecordingTime(recording.recordingDuration)}
                                </span>
                            )}
                        </button>
                    )}
                </div>

                <div className="toolbar-right">
                    <button className={`tool-btn ${chat.showChat ? 'active' : ''}`} onClick={chat.toggleChat} title="채팅" style={{ position: 'relative' }}>
                        <Icon name="message" size={16} />
                        {chat.unreadMessages > 0 && (
                            <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', background: '#ef4444', borderRadius: '50%', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {chat.unreadMessages}
                            </span>
                        )}
                    </button>
                    <button className="tool-btn" onClick={toggleFullscreen} title="전체 화면">
                        <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={16} />
                    </button>
                    <button className="tool-btn disconnect" onClick={onDisconnect} title="연결 해제">
                        <Icon name="x" size={16} />
                    </button>
                </div>
            </div>

            {/* 비디오 영역 */}
            <div className="canvas-container">
                {!isViewer && (
                    <div className="host-overlay">
                        <h2><Icon name="monitor" size={24} /> 화면 공유 중</h2>
                        <p>상대방이 귀하의 화면을 보고 있습니다</p>
                        <p>WebRTC 연결 상태: {connectionState}</p>
                        {gameMode && <p className="game-mode-badge"><Icon name="gamepad" size={14} /> 게임 모드 활성</p>}
                    </div>
                )}
                <video
                    ref={videoRef}
                    className={`remote-canvas ${isViewer ? 'viewer-mode' : ''}`}
                    autoPlay playsInline muted tabIndex={0}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
                />
            </div>

            <button className="toggle-toolbar" onClick={() => setShowToolbar(!showToolbar)}>
                {showToolbar ? '▲' : '▼'}
            </button>
        </div>
    );
}

export default RemoteViewer;
