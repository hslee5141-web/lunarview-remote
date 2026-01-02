import React from 'react';
import Icon from '../Icon';
import { ChatMessage } from '../../hooks/useChat';

interface ChatPanelProps {
    showChat: boolean;
    chatMessages: ChatMessage[];
    chatInput: string;
    chatMessagesRef: React.RefObject<HTMLDivElement | null>;
    onInputChange: (value: string) => void;
    onSendMessage: () => void;
    onClose: () => void;
}

export function ChatPanel({
    showChat,
    chatMessages,
    chatInput,
    chatMessagesRef,
    onInputChange,
    onSendMessage,
    onClose
}: ChatPanelProps) {
    if (!showChat) return null;

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <span className="chat-title">
                    <Icon name="message" size={14} /> 채팅
                </span>
                <button className="chat-close-btn" onClick={onClose}>
                    <Icon name="x" size={16} />
                </button>
            </div>

            <div ref={chatMessagesRef as React.RefObject<HTMLDivElement>} className="chat-messages">
                {chatMessages.length === 0 ? (
                    <p className="chat-empty">메시지가 없습니다</p>
                ) : (
                    chatMessages.map(msg => (
                        <div
                            key={msg.id}
                            className={`chat-message ${msg.sender === 'local' ? 'local' : 'remote'}`}
                        >
                            <span className="chat-bubble">
                                {msg.text}
                            </span>
                            <p className="chat-timestamp">
                                {msg.timestamp.toLocaleTimeString()}
                            </p>
                        </div>
                    ))
                )}
            </div>

            <div className="chat-input-container">
                <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
                    placeholder="메시지 입력..."
                    className="chat-input"
                />
                <button onClick={onSendMessage} className="chat-send-btn">
                    <Icon name="send" size={16} />
                </button>
            </div>
        </div>
    );
}
