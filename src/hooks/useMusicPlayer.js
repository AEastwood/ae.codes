import { useContext } from 'react';
import { MusicPlayerContext } from '../context/MusicPlayerContextObject';

export function useMusicPlayer() {
    const context = useContext(MusicPlayerContext);
    if (!context) {
        throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
    }
    return context;
}
