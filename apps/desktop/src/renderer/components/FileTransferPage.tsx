import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import '../types/electron.d';

interface TransferProgress {
    fileId: string;
    fileName: string;
    totalBytes: number;
    transferredBytes: number;
    progress: number;
    speed: number;
    remainingTime: number;
    status: 'pending' | 'transferring' | 'paused' | 'completed' | 'failed' | 'cancelled';
}

interface FileItem {
    name: string;
    path: string;
    size: string;
    status: 'ready' | 'transferring' | 'completed' | 'failed';
}

function FileTransferPage() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [transfers, setTransfers] = useState<TransferProgress[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [canUseFileTransfer, setCanUseFileTransfer] = useState(true);

    useEffect(() => {
        // 파일 전송 기능 사용 가능 여부 확인
        const checkFeature = async () => {
            const allowed = await window.electronAPI.planCanUseFeature?.('fileTransfer');
            setCanUseFileTransfer(allowed !== false);
        };
        checkFeature();

        // 파일 진행 상황 리스너
        const cleanup = window.electronAPI.onFileProgress?.((progress: any) => {
            setTransfers(prev => {
                const existing = prev.findIndex(t => t.fileId === progress.fileId);
                if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = progress;
                    return updated;
                }
                return [...prev, progress];
            });
        });

        return () => cleanup?.();
    }, []);

    const handleFileSelect = async () => {
        try {
            const result = await window.electronAPI.selectFile?.();
            if (result && result.path) {
                setFiles(prev => [...prev, {
                    name: result.name || 'file.txt',
                    path: result.path,
                    size: result.size || '0 KB',
                    status: 'ready'
                }]);
            }
        } catch (e) {
            console.error('File select error:', e);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFiles = e.dataTransfer.files;
        for (let i = 0; i < droppedFiles.length; i++) {
            const file = droppedFiles[i];
            const filePath = (file as any).path;
            if (filePath) {
                setFiles(prev => [...prev, {
                    name: file.name,
                    path: filePath,
                    size: formatSize(file.size),
                    status: 'ready'
                }]);
            }
        }
    };

    const handleSendFile = async (index: number) => {
        const file = files[index];
        if (file && file.path) {
            setFiles(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], status: 'transferring' };
                return updated;
            });
            await window.electronAPI.sendFile(file.path);
        }
    };

    const handleSendAll = async () => {
        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'ready') {
                await handleSendFile(i);
            }
        }
    };

    const handleRemoveFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    };

    const formatSpeed = (bytesPerSec: number): string => {
        return `${formatSize(bytesPerSec)}/s`;
    };

    const getStatusLabel = (status: string): string => {
        switch (status) {
            case 'ready': return '대기 중';
            case 'transferring': return '전송 중';
            case 'completed': return '완료';
            case 'failed': return '실패';
            default: return status;
        }
    };

    return (
        <div className="file-transfer-page">
            <h2 className="page-title">
                <Icon name="folder" size={20} />
                파일 전송
            </h2>

            {!canUseFileTransfer ? (
                <div className="upgrade-notice">
                    <div className="upgrade-icon">
                        <Icon name="lock" size={48} />
                    </div>
                    <h3>프로 기능</h3>
                    <p>파일 전송은 프로 플랜 이상에서 사용할 수 있습니다.</p>
                    <p className="text-muted">업그레이드하면 무제한 파일 전송, 멀티모니터, 오디오 스트리밍 등을 이용할 수 있습니다.</p>
                    <button
                        className="btn btn-primary"
                        style={{ marginTop: '16px' }}
                        onClick={() => window.electronAPI.openExternal('https://lunarview.kr/pricing')}
                    >
                        <Icon name="star" size={16} />
                        프로 플랜 알아보기
                    </button>
                </div>
            ) : (
                <div
                    className={`transfer-dropzone ${isDragging ? 'dragging' : ''}`}
                    onClick={handleFileSelect}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                >
                    <Icon name="upload" size={32} />
                    <p>파일을 드래그하거나 클릭하여 선택하세요</p>
                    <span className="text-muted">최대 2GB까지 전송 가능</span>
                </div>
            )}

            {files.length > 0 && (
                <div className="transfer-list">
                    <h3 className="section-title">전송 대기 ({files.filter(f => f.status === 'ready').length}개)</h3>
                    {files.map((file, idx) => (
                        <div key={idx} className="transfer-item">
                            <Icon name="file" size={16} />
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">{file.size}</span>
                            <span className={`file-status status-${file.status}`}>
                                {getStatusLabel(file.status)}
                            </span>
                            {file.status === 'ready' && (
                                <>
                                    <button className="btn-icon" onClick={() => handleSendFile(idx)} title="전송">
                                        <Icon name="upload" size={14} />
                                    </button>
                                    <button className="btn-icon" onClick={() => handleRemoveFile(idx)} title="삭제">
                                        <Icon name="trash" size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                    <button
                        className="btn btn-primary btn-full"
                        style={{ marginTop: '16px' }}
                        onClick={handleSendAll}
                        disabled={files.filter(f => f.status === 'ready').length === 0}
                    >
                        <Icon name="upload" size={16} />
                        모두 전송
                    </button>
                </div>
            )}

            {transfers.length > 0 && (
                <div className="transfer-list" style={{ marginTop: '16px' }}>
                    <h3 className="section-title">전송 진행</h3>
                    {transfers.filter(t => t.status === 'transferring').map((transfer) => (
                        <div key={transfer.fileId} className="transfer-item">
                            <Icon name="file" size={16} />
                            <div className="transfer-progress-info">
                                <span className="file-name">{transfer.fileName}</span>
                                <div className="transfer-progress-bar">
                                    <div
                                        className="transfer-progress-fill"
                                        style={{ width: `${transfer.progress}%` }}
                                    />
                                </div>
                            </div>
                            <span className="file-size">{transfer.progress}%</span>
                            <span className="file-speed">{formatSpeed(transfer.speed)}</span>
                        </div>
                    ))}
                </div>
            )}

            {files.length === 0 && transfers.length === 0 && (
                <div className="transfer-history">
                    <h3 className="section-title">최근 전송 기록</h3>
                    <div className="empty-state">
                        <Icon name="folder" size={24} />
                        <p>전송 기록이 없습니다</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileTransferPage;
