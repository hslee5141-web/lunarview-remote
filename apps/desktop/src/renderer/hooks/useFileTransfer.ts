import { useState, useCallback, DragEvent } from 'react';

export interface FileTransferProgress {
    fileName: string;
    progress: number;
    status: 'sending' | 'receiving' | 'completed' | 'failed' | 'saving';
    error?: string;
}

interface UseFileTransferReturn {
    isDragOver: boolean;
    fileTransfers: FileTransferProgress[];
    handleDragEnter: (e: DragEvent<HTMLDivElement>, isViewer: boolean) => void;
    handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
    handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
    handleDrop: (e: DragEvent<HTMLDivElement>, isViewer: boolean) => Promise<void>;
    updateFileProgress: (progress: { fileName: string; progress: number; status: string; error?: string }) => void;
}

export function useFileTransfer(): UseFileTransferReturn {
    const [isDragOver, setIsDragOver] = useState(false);
    const [fileTransfers, setFileTransfers] = useState<FileTransferProgress[]>([]);

    const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>, isViewer: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        if (isViewer && e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, isViewer: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!isViewer) return;

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        console.log('[useFileTransfer] Dropped files:', files.map(f => f.name));

        for (const file of files) {
            const filePath = (file as any).path;
            if (filePath) {
                try {
                    await window.electronAPI.sendFile(filePath);
                } catch (err) {
                    console.error('[useFileTransfer] Transfer error:', err);
                    setFileTransfers(prev => [...prev, {
                        fileName: file.name,
                        progress: 0,
                        status: 'failed',
                        error: 'Transfer failed'
                    }]);
                }
            }
        }
    }, []);

    const updateFileProgress = useCallback((progress: { fileName: string; progress: number; status: string; error?: string }) => {
        const transferProgress: FileTransferProgress = {
            ...progress,
            status: progress.status as FileTransferProgress['status']
        };

        setFileTransfers(prev => {
            const existing = prev.findIndex(f => f.fileName === transferProgress.fileName);
            if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = transferProgress;

                if (transferProgress.status === 'completed' || transferProgress.status === 'failed') {
                    setTimeout(() => {
                        setFileTransfers(p => p.filter(f => f.fileName !== transferProgress.fileName));
                    }, 3000);
                }
                return updated;
            }
            return [...prev, transferProgress];
        });
    }, []);

    return {
        isDragOver,
        fileTransfers,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        updateFileProgress
    };
}
