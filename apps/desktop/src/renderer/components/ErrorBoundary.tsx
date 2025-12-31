import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트 합니다.
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    color: 'white',
                    backgroundColor: '#1e1e1e',
                    height: '100vh',
                    overflow: 'auto',
                    fontFamily: 'monospace'
                }}>
                    <h1>⚠️ 오류가 발생했습니다.</h1>
                    <h2 style={{ color: '#ff6b6b' }}>{this.state.error && this.state.error.toString()}</h2>
                    <br />
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <br />
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 20px',
                            background: '#007acc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        앱 새로고침
                    </button>
                    <button
                        onClick={() => {
                            if (window.electronAPI && window.electronAPI.authLogout) {
                                window.electronAPI.authLogout().then(() => window.location.reload());
                            } else {
                                window.location.reload();
                            }
                        }}
                        style={{
                            padding: '10px 20px',
                            background: '#444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginLeft: '10px'
                        }}
                    >
                        로그아웃 및 초기화
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
