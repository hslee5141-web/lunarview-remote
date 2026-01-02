/**
 * React Hooks for Remote Desktop Connection
 * 원격 연결 관리를 위한 React 훅
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type ConnectionStatus =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'session-active'
    | 'error';

interface UseConnectionReturn {
    status: ConnectionStatus;
    error: string | null;
    connect: (connectionId: string, password: string) => Promise<boolean>;
    disconnect: () => void;
}

/**
 * 원격 연결 관리 훅
 */
export function useConnection(): UseConnectionReturn {
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 연결 상태 리스너
        window.electronAPI.onConnectionStatus((newStatus: string) => {
            setStatus(newStatus as ConnectionStatus);
            if (newStatus === 'error') {
                setError('Connection failed');
            }
        });
    }, []);

    const connect = useCallback(async (connectionId: string, password: string) => {
        setStatus('connecting');
        setError(null);

        try {
            const success = await window.electronAPI.connect(connectionId, password);
            if (success) {
                setStatus('session-active');
                return true;
            } else {
                setStatus('error');
                setError('Connection refused');
                return false;
            }
        } catch (err: any) {
            setStatus('error');
            setError(err.message || 'Connection failed');
            return false;
        }
    }, []);

    const disconnect = useCallback(() => {
        window.electronAPI.disconnect();
        setStatus('disconnected');
        setError(null);
    }, []);

    return { status, error, connect, disconnect };
}

/**
 * 화면 프레임 수신 훅
 */
export function useScreenFrames(canvasRef: React.RefObject<HTMLCanvasElement>) {
    const [fps, setFps] = useState(0);
    const [latency, setLatency] = useState(0);
    const frameCountRef = useRef(0);
    const lastFpsUpdateRef = useRef(Date.now());

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        window.electronAPI.onScreenFrame((frameData: ArrayBuffer) => {
            frameCountRef.current++;

            // FPS 계산
            const now = Date.now();
            if (now - lastFpsUpdateRef.current >= 1000) {
                setFps(frameCountRef.current);
                frameCountRef.current = 0;
                lastFpsUpdateRef.current = now;
            }

            // 프레임 렌더링
            const blob = new Blob([frameData], { type: 'image/jpeg' });
            const img = new Image();
            img.onload = () => {
                if (canvas.width !== img.width) canvas.width = img.width;
                if (canvas.height !== img.height) canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(blob);
        });
    }, [canvasRef]);

    return { fps, latency };
}

/**
 * 입력 이벤트 전송 훅
 */
export function useInputHandler(canvasRef: React.RefObject<HTMLCanvasElement>) {
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // 마우스 이벤트
        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            window.electronAPI.sendMouseEvent({ type: 'move', x, y } as any);
        };

        const handleMouseDown = (e: MouseEvent) => {
            window.electronAPI.sendMouseEvent({
                type: 'down',
                button: e.button
            } as any);
        };

        const handleMouseUp = (e: MouseEvent) => {
            window.electronAPI.sendMouseEvent({
                type: 'up',
                button: e.button
            } as any);
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            window.electronAPI.sendMouseEvent({
                type: 'scroll',
                deltaX: e.deltaX,
                deltaY: e.deltaY,
            } as any);
        };

        // 키보드 이벤트
        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            window.electronAPI.sendKeyboardEvent({
                type: 'down',
                key: e.key,
                keyCode: e.keyCode,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                metaKey: e.metaKey,
            } as any);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            e.preventDefault();
            window.electronAPI.sendKeyboardEvent({
                type: 'up',
                key: e.key,
                keyCode: e.keyCode,
            } as any);
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // 캔버스에 포커스가 있을 때만 키보드 이벤트 처리
        canvas.tabIndex = 0;
        canvas.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('keyup', handleKeyUp);

        return () => {
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('wheel', handleWheel);
            canvas.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('keyup', handleKeyUp);
        };
    }, [canvasRef]);
}

/**
 * 파일 전송 훅 (간단 버전 - 레거시)
 */
export function useSimpleFileTransfer() {
    const [progress, setProgress] = useState(0);
    const [isTransferring, setIsTransferring] = useState(false);

    useEffect(() => {
        window.electronAPI.onFileProgress((progressData: any) => {
            const value = typeof progressData === 'number' ? progressData : progressData?.progress ?? 0;
            setProgress(value);
            setIsTransferring(value > 0 && value < 100);
        });
    }, []);

    const sendFile = useCallback(async (filePath: string) => {
        setIsTransferring(true);
        setProgress(0);
        try {
            await window.electronAPI.sendFile(filePath);
        } finally {
            setIsTransferring(false);
        }
    }, []);

    return { progress, isTransferring, sendFile };
}
