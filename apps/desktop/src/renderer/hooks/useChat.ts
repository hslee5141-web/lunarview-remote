import React, { useState, useRef, useCallback } from 'react';

export interface ChatMessage {
    id: string;
    sender: 'local' | 'remote';
    text: string;
    timestamp: Date;
}

interface UseChatReturn {
    showChat: boolean;
    chatMessages: ChatMessage[];
    chatInput: string;
    unreadMessages: number;
    chatMessagesRef: React.RefObject<HTMLDivElement | null>;
    setChatInput: (value: string) => void;
    sendChatMessage: () => void;
    toggleChat: () => void;
    addRemoteMessage: (text: string) => void;
}

export function useChat(): UseChatReturn {
    const [showChat, setShowChat] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [unreadMessages, setUnreadMessages] = useState(0);
    const chatMessagesRef = useRef<HTMLDivElement | null>(null);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            chatMessagesRef.current?.scrollTo({
                top: chatMessagesRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }, []);

    const sendChatMessage = useCallback(() => {
        if (!chatInput.trim()) return;

        const text = chatInput.trim();
        const newMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: 'local',
            text: text,
            timestamp: new Date()
        };

        setChatMessages(prev => [...prev, newMessage]);
        setChatInput('');
        scrollToBottom();

        // 실제 메시지 전송
        window.electronAPI.sendChatMessage(text);
    }, [chatInput, scrollToBottom]);

    const toggleChat = useCallback(() => {
        setShowChat(prev => {
            if (!prev) {
                setUnreadMessages(0);
            }
            return !prev;
        });
    }, []);

    const addRemoteMessage = useCallback((text: string) => {
        const newMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: 'remote',
            text,
            timestamp: new Date()
        };

        setChatMessages(prev => [...prev, newMessage]);

        if (!showChat) {
            setUnreadMessages(prev => prev + 1);
        }

        scrollToBottom();
    }, [showChat, scrollToBottom]);

    // 수신 메시지 리스너 등록
    React.useEffect(() => {
        const cleanup = window.electronAPI.onChatMessage((text: string) => {
            addRemoteMessage(text);
        });
        return () => {
            cleanup();
        };
    }, [addRemoteMessage]);

    return {
        showChat,
        chatMessages,
        chatInput,
        unreadMessages,
        chatMessagesRef,
        setChatInput,
        sendChatMessage,
        toggleChat,
        addRemoteMessage
    };
}
