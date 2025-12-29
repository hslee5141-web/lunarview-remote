import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

function ThemeSelector() {
    const { theme, setTheme, themes } = useTheme();

    return (
        <div className="theme-selector">
            {themes.map((t) => (
                <button
                    key={t.id}
                    className={`theme-btn ${theme === t.id ? 'active' : ''}`}
                    data-theme={t.id}
                    onClick={() => setTheme(t.id)}
                    title={t.name}
                />
            ))}
        </div>
    );
}

export default ThemeSelector;
