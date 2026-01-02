import { useState, useRef, useCallback } from 'react';

interface UseRecordingOptions {
    onError?: (error: Error) => void;
}

interface UseRecordingReturn {
    isRecording: boolean;
    recordingDuration: number;
    startRecording: (stream: MediaStream) => void;
    stopRecording: () => void;
    toggleRecording: (stream: MediaStream | null) => void;
    formatRecordingTime: (seconds: number) => string;
}

export function useRecording(options: UseRecordingOptions = {}): UseRecordingReturn {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const formatRecordingTime = useCallback((seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, []);

    const downloadRecording = useCallback(() => {
        if (recordedChunksRef.current.length === 0) return;

        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `LunarView_Recording_${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        recordedChunksRef.current = [];
        setRecordingDuration(0);
    }, []);

    const startRecording = useCallback((stream: MediaStream) => {
        try {
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : 'video/webm';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            recordedChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                downloadRecording();
            };

            mediaRecorder.start(1000);
            mediaRecorderRef.current = mediaRecorder;
            setIsRecording(true);
            setRecordingDuration(0);

            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

            console.log('[useRecording] Started');
        } catch (err) {
            console.error('[useRecording] Failed to start:', err);
            options.onError?.(err as Error);
        }
    }, [downloadRecording, options]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
            setIsRecording(false);

            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }

            console.log('[useRecording] Stopped');
        }
    }, [isRecording]);

    const toggleRecording = useCallback((stream: MediaStream | null) => {
        if (isRecording) {
            stopRecording();
        } else if (stream) {
            startRecording(stream);
        } else {
            console.error('[useRecording] No stream available');
        }
    }, [isRecording, startRecording, stopRecording]);

    return {
        isRecording,
        recordingDuration,
        startRecording,
        stopRecording,
        toggleRecording,
        formatRecordingTime
    };
}
