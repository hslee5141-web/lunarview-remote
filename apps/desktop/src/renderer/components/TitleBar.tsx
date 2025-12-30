import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import '../types/electron.d';

function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => {
            if (window.electronAPI?.windowIsMaximized) {
                const maximized = await window.electronAPI.windowIsMaximized();
                setIsMaximized(maximized);
            }
        };
        checkMaximized();

        const handleResize = () => checkMaximized();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleMinimize = () => {
        window.electronAPI?.windowMinimize();
    };

    const handleMaximize = async () => {
        await window.electronAPI?.windowMaximize();
        const maximized = await window.electronAPI?.windowIsMaximized();
        setIsMaximized(maximized);
    };

    const handleClose = () => {
        window.electronAPI?.windowClose();
    };

    return (
        <div className="custom-titlebar">
            {/* 전체 드래그 영역 */}
            <div className="titlebar-drag-area">
                <div className="titlebar-logo">
                    <Icon name="lunarview" size={16} />
                    <span>LunarView</span>
                </div>
            </div>

            {/* 윈도우 컨트롤 */}
            <div className="titlebar-controls">
                <button
                    className="titlebar-btn titlebar-btn-minimize"
                    onClick={handleMinimize}
                    aria-label="Minimize"
                >
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <rect width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button
                    className="titlebar-btn titlebar-btn-maximize"
                    onClick={handleMaximize}
                    aria-label={isMaximized ? 'Restore' : 'Maximize'}
                >
                    {isMaximized ? (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <path d="M2 0h6v2h2v6h-2v2h-6v-2h-2v-6h2v-2zm1 2v5h5v-5h-5z" fill="currentColor" fillRule="evenodd" />
                        </svg>
                    ) : (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <rect width="10" height="10" rx="0" fill="none" stroke="currentColor" strokeWidth="1" />
                        </svg>
                    )}
                </button>
                <button
                    className="titlebar-btn titlebar-btn-close"
                    onClick={handleClose}
                    aria-label="Close"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M1 0l4 4 4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4-4-4z" fill="currentColor" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default TitleBar;
