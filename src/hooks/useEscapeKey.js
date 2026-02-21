import { useEffect } from 'react';

export function useEscapeKey(onEscape, enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const handleEscape = (event) => {
            if (event.code === 'Escape') {
                onEscape();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [enabled, onEscape]);
}
