import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import '../styles/components.css';

interface UpdateStatus {
    event: string;
    version?: string;
    releaseNotes?: string;
    progress?: {
        percent: number;
        bytesPerSecond: number;
        transferred: number;
        total: number;
    };
    error?: string;
}

interface UpdateNotificationProps {
    status: UpdateStatus | null;
    onDownload: () => void;
    onInstall: () => void;
    onClose: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ status, onDownload, onInstall, onClose }) => {
    if (!status) return null;

    const { event, version, progress, error } = status;

    if (event === 'checking') return null; // 확인 중에는 조용히
    if (event === 'not-available') return null; // 없으면 조용히

    return (
        <div className="update-notification slide-in-bottom">
            <div className="update-content">
                <div className="update-icon">
                    <Icon name="download" size={20} />
                </div>
                <div className="update-info">
                    {event === 'available' && (
                        <>
                            <h4>새 버전 업데이트 ({version})</h4>
                            <p>새로운 기능과 성능 향상이 포함되어 있습니다.</p>
                        </>
                    )}
                    {event === 'downloading' && (
                        <>
                            <h4>업데이트 다운로드 중...</h4>
                            <div className="progress-bar-container">
                                <div
                                    className="progress-bar-fill"
                                    style={{ width: `${progress?.percent || 0}%` }}
                                />
                            </div>
                            <span className="progress-text">{progress?.percent}% 완료</span>
                        </>
                    )}
                    {event === 'downloaded' && (
                        <>
                            <h4>업데이트 준비 완료</h4>
                            <p>지금 재시작하여 업데이트를 적용하시겠습니까?</p>
                        </>
                    )}
                    {event === 'error' && (
                        <>
                            <h4>업데이트 오류</h4>
                            <p>{error || '알 수 없는 오류가 발생했습니다.'}</p>
                        </>
                    )}
                </div>
            </div>

            <div className="update-actions">
                {event === 'available' && (
                    <button className="btn-primary" onClick={onDownload}>
                        다운로드
                    </button>
                )}
                {event === 'downloaded' && (
                    <button className="btn-primary" onClick={onInstall}>
                        재시작
                    </button>
                )}
                <button className="btn-secondary" onClick={onClose}>
                    닫기
                </button>
            </div>

            <style>{`
                .update-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 360px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                    padding: 16px;
                    z-index: 1000;
                    animation: slideUp 0.3s ease-out;
                }
                .update-content {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .update-icon {
                    width: 40px;
                    height: 40px;
                    background: var(--accent-primary-dim);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--accent-primary);
                }
                .update-info h4 {
                    margin: 0 0 4px 0;
                    font-size: 14px;
                    color: var(--text-primary);
                }
                .update-info p {
                    margin: 0;
                    font-size: 13px;
                    color: var(--text-secondary);
                }
                .progress-bar-container {
                    width: 100%;
                    height: 6px;
                    background: var(--bg-hover);
                    border-radius: 3px;
                    margin: 8px 0;
                    overflow: hidden;
                }
                .progress-bar-fill {
                    height: 100%;
                    background: var(--accent-primary);
                    transition: width 0.3s ease;
                }
                .progress-text {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                .update-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .btn-primary {
                    background: var(--accent-primary);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 8px 16px;
                    font-size: 13px;
                    cursor: pointer;
                }
                .btn-secondary {
                    background: transparent;
                    color: var(--text-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    padding: 8px 16px;
                    font-size: 13px;
                    cursor: pointer;
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default UpdateNotification;
