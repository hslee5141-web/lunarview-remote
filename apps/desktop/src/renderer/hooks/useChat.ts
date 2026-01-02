import { useState, useRef, useCallback } from 'react';

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

        const newMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: 'local',
            text: chatInput.trim(),
            timestamp: new Date()
        };

        setChatMessages(prev => [...prev, newMessage]);
        setChatInput('');
        scrollToBottom();

        console.log('[useChat] Message sent:', newMessage.text);
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
