import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface ConnectionRecord {
    id: string;
    name: string;
    remoteId: string;
    date: string;
    duration: string;
    type: 'incoming' | 'outgoing';
    status: 'success' | 'failed';
}

// 연결 기록 관리 유틸리티
const historyStorage = {
    getHistory: (): ConnectionRecord[] => {
        const saved = localStorage.getItem('lunarview-history');
        return saved ? JSON.parse(saved) : [];
    },

    addRecord: (record: Omit<ConnectionRecord, 'id' | 'date'>) => {
        const history = historyStorage.getHistory();
        const newRecord: ConnectionRecord = {
            ...record,
            id: Date.now().toString(),
            date: new Date().toLocaleString('ko-KR'),
        };
        history.unshift(newRecord);
        // 최대 100개만 유지
        if (history.length > 100) history.pop();
        localStorage.setItem('lunarview-history', JSON.stringify(history));
        return newRecord;
    },

    clearHistory: () => {
        localStorage.setItem('lunarview-history', JSON.stringify([]));
    },

    deleteRecord: (id: string) => {
        const history = historyStorage.getHistory().filter(r => r.id !== id);
        localStorage.setItem('lunarview-history', JSON.stringify(history));
        return history;
    }
};

// 샘플 데이터 생성 (개발용)
const generateSampleData = (): ConnectionRecord[] => {
    return [
        {
            id: '1',
            name: '업무용 PC',
            remoteId: '827053390',
            date: '2024-12-27 14:30:00',
            duration: '1시간 23분',
            type: 'outgoing',
            status: 'success'
        },
        {
            id: '2',
            name: '집 데스크톱',
            remoteId: '912847561',
            date: '2024-12-26 19:45:00',
            duration: '45분',
            type: 'outgoing',
            status: 'success'
        },
        {
            id: '3',
            name: '친구 PC',
            remoteId: '654321098',
            date: '2024-12-25 21:10:00',
            duration: '15분',
            type: 'incoming',
            status: 'success'
        },
    ];
};

function HistoryPage() {
    const [history, setHistory] = useState<ConnectionRecord[]>([]);
    const [savedConnections, setSavedConnections] = useState<any[]>([]);
    const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing' | 'saved'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [reconnecting, setReconnecting] = useState<string | null>(null);

    useEffect(() => {
        let savedHistory = historyStorage.getHistory();
        // 개발용: 히스토리가 비어있으면 샘플 데이터 생성
        if (savedHistory.length === 0) {
            savedHistory = generateSampleData();
            localStorage.setItem('lunarview-history', JSON.stringify(savedHistory));
        }
        setHistory(savedHistory);

        // 저장된 연결 로드
        loadSavedConnections();
    }, []);

    const loadSavedConnections = async () => {
        const connections = await window.electronAPI.savedConnectionsGetAll();
        setSavedConnections(connections);
    };

    const handleClearHistory = () => {
        if (confirm('모든 연결 기록을 삭제하시겠습니까?')) {
            historyStorage.clearHistory();
            setHistory([]);
        }
    };

    const handleDeleteRecord = (id: string) => {
        const updated = historyStorage.deleteRecord(id);
        setHistory(updated);
    };

    const handleReconnect = async (remoteId: string) => {
        setReconnecting(remoteId);

        try {
            // 저장된 연결 정보 가져오기
            const savedConn = await window.electronAPI.savedConnectionsGet(remoteId);

            if (savedConn && savedConn.password) {
                // 저장된 비밀번호로 연결
                const success = await window.electronAPI.connect(remoteId, savedConn.password);
                if (success) {
                    // 마지막 사용 시간 업데이트는 메인 프로세스에서 처리
                } else {
                    alert('연결에 실패했습니다. 비밀번호가 변경되었을 수 있습니다.');
                }
            } else {
                // 저장된 비밀번호 없음 - 비밀번호 입력 요청
                const password = prompt(`${remoteId}의 비밀번호를 입력하세요:`);
                if (password) {
                    const success = await window.electronAPI.connect(remoteId, password);
                    if (success) {
                        // 비밀번호 저장 여부 확인
                        if (confirm('이 연결을 저장하시겠습니까? (다음에 비밀번호 없이 연결)')) {
                            await window.electronAPI.savedConnectionsSave({
                                remoteId,
                                password,
                                name: `PC ${remoteId.slice(-4)}`
                            });
                            loadSavedConnections();
                        }
                    } else {
                        alert('연결에 실패했습니다.');
                    }
                }
            }
        } catch (error: any) {
            alert(`연결 오류: ${error.message || '알 수 없는 오류'}`);
        }

        setReconnecting(null);
    };

    const handleRemoveSavedConnection = async (remoteId: string) => {
        if (confirm('저장된 연결을 삭제하시겠습니까?')) {
            await window.electronAPI.savedConnectionsRemove(remoteId);
            loadSavedConnections();
        }
    };

    // 필터링된 히스토리
    const filteredHistory = history.filter(record => {
        const matchesFilter = filter === 'all' || record.type === filter;
        const matchesSearch = searchTerm === '' ||
            record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            record.remoteId.includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    return (
        <div className="history-page">
            <h2 className="page-title">
                <Icon name="clock" size={20} />
                연결 기록
                <span className="record-count">{history.length}개</span>
            </h2>

            {/* 검색 및 필터 */}
            <div className="history-toolbar">
                <div className="search-box">
                    <Icon name="search" size={16} />
                    <input
                        type="text"
                        placeholder="이름 또는 ID로 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-buttons">
                    <button
                        className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        전체
                    </button>
                    <button
                        className={`filter-btn ${filter === 'outgoing' ? 'active' : ''}`}
                        onClick={() => setFilter('outgoing')}
                    >
                        <Icon name="arrow-right" size={12} />
                        발신
                    </button>
                    <button
                        className={`filter-btn ${filter === 'incoming' ? 'active' : ''}`}
                        onClick={() => setFilter('incoming')}
                    >
                        <Icon name="arrow-down" size={12} />
                        수신
                    </button>
                </div>
            </div>

            {filteredHistory.length === 0 ? (
                <div className="empty-state-large">
                    <div className="empty-icon">
                        <Icon name="clock" size={48} />
                    </div>
                    <h3>{searchTerm ? '검색 결과가 없습니다' : '연결 기록이 없습니다'}</h3>
                    <p>{searchTerm ? '다른 검색어를 시도해 보세요' : '원격 연결 후 여기에 기록이 표시됩니다'}</p>
                </div>
            ) : (
                <div className="history-list">
                    {filteredHistory.map((record) => (
                        <div key={record.id} className={`history-item ${record.status}`}>
                            <div className="history-icon">
                                <Icon
                                    name={record.type === 'incoming' ? 'arrow-down' : 'arrow-right'}
                                    size={16}
                                />
                            </div>
                            <div className="history-info">
                                <div className="history-name-row">
                                    <span className="history-name">{record.name}</span>
                                    <span className="history-id">{record.remoteId}</span>
                                </div>
                                <span className="history-meta">
                                    {record.date} · {record.duration}
                                    {record.status === 'failed' && (
                                        <span className="status-badge failed">실패</span>
                                    )}
                                </span>
                            </div>
                            <div className="history-actions">
                                <button
                                    className="btn btn-primary btn-small"
                                    onClick={() => handleReconnect(record.remoteId)}
                                >
                                    <Icon name="link" size={14} />
                                    연결
                                </button>
                                <button
                                    className="btn btn-icon btn-small"
                                    onClick={() => handleDeleteRecord(record.id)}
                                    title="삭제"
                                >
                                    <Icon name="trash" size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="history-footer">
                <button
                    className="btn btn-secondary"
                    onClick={handleClearHistory}
                    disabled={history.length === 0}
                >
                    <Icon name="trash" size={14} />
                    전체 기록 삭제
                </button>
                <span className="history-info-text">
                    최근 100개의 기록이 저장됩니다
                </span>
            </div>
        </div>
    );
}

// 다른 컴포넌트에서 사용할 수 있도록 export
export { historyStorage };
export default HistoryPage;
