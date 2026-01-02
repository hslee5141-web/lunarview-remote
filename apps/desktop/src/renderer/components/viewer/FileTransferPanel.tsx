import React from 'react';
import Icon from '../Icon';
import { FileTransferProgress } from '../../hooks/useFileTransfer';

interface FileTransferPanelProps {
    fileTransfers: FileTransferProgress[];
}

export function FileTransferPanel({ fileTransfers }: FileTransferPanelProps) {
    if (fileTransfers.length === 0) return null;

    const getStatusColor = (status: FileTransferProgress['status']) => {
        switch (status) {
            case 'completed': return '#4ade80';
            case 'failed': return '#f87171';
            default: return '#facc15';
        }
    };

    const getStatusText = (transfer: FileTransferProgress) => {
        switch (transfer.status) {
            case 'completed': return '완료';
            case 'failed': return '실패';
            default: return `${transfer.progress}%`;
        }
    };

    return (
        <div className="file-transfer-panel">
            <h4 className="file-transfer-header">
                <Icon name="upload" size={14} /> 파일 전송
            </h4>
            {fileTransfers.map((transfer, idx) => (
                <div
                    key={idx}
                    className={`file-transfer-item ${idx > 0 ? 'with-border' : ''}`}
                >
                    <div className="file-transfer-info">
                        <span className="file-name">{transfer.fileName}</span>
                        <span
                            className="file-status"
                            style={{ color: getStatusColor(transfer.status) }}
                        >
                            {getStatusText(transfer)}
                        </span>
                    </div>
                    {transfer.status !== 'completed' && transfer.status !== 'failed' && (
                        <div className="file-progress-bar">
                            <div
                                className="file-progress-fill"
                                style={{ width: `${transfer.progress}%` }}
                            />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
