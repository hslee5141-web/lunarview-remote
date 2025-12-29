import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeName = 'modern-dark' | 'minimal-light' | 'professional' | 'lunar-space';

interface ThemeContextType {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
    themes: { id: ThemeName; name: string; icon: string }[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEMES = [
    { id: 'lunar-space' as ThemeName, name: '루나 스페이스', icon: '🌙' },
    { id: 'modern-dark' as ThemeName, name: '모던 다크', icon: '🎮' },
    { id: 'minimal-light' as ThemeName, name: '미니멀 라이트', icon: '☀️' },
    { id: 'professional' as ThemeName, name: '프로페셔널', icon: '💼' },
];

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<ThemeName>(() => {
        const saved = localStorage.getItem('theme');
        return (saved as ThemeName) || 'lunar-space';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
}
