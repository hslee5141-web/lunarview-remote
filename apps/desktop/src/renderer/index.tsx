import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';

// Global Error Handlers for Renderer Crash Debugging
window.onerror = (message, source, lineno, colno, error) => {
    console.error('[Renderer Global Error]', message, source, lineno, colno, error);
    // IPC로 메인 프로세스에 에러 전송 (선택사항)
};

window.onunhandledrejection = (event) => {
    console.error('[Renderer Unhandled Rejection]', event.reason);
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <ErrorBoundary>
            <ThemeProvider>
                <App />
            </ThemeProvider>
        </ErrorBoundary>
    </React.StrictMode>
);
