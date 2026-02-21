import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useCdn } from '../hooks/useCdn';
import { MusicPlayerContext } from './MusicPlayerContextObject';

export function MusicPlayerProvider({ children }) {
    const { getUri } = useCdn();
    const trackSrc = getUri('audio/feel-good-inc.mp3');
    const audioRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const progress = useMemo(() => {
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        return Math.min(100, (currentTime / duration) * 100);
    }, [currentTime, duration]);

    const syncFromAudio = useCallback((audio) => {
        const safeDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        const safeCurrentTime = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
        setDuration(safeDuration);
        setCurrentTime(safeCurrentTime);
    }, []);

    useEffect(() => {
        const audio = new Audio(trackSrc);
        audioRef.current = audio;

        const handleTimeUpdate = () => {
            syncFromAudio(audio);
            if (audio.duration && audio.currentTime >= audio.duration) {
                audio.pause();
                audio.currentTime = 0;
                setIsPlaying(false);
                syncFromAudio(audio);
            }
        };

        const handleLoadedMetadata = () => {
            syncFromAudio(audio);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            audio.currentTime = 0;
            syncFromAudio(audio);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
            audio.pause();
            audioRef.current = null;
        };
    }, [syncFromAudio, trackSrc]);

    const play = useCallback(async () => {
        if (!audioRef.current) return;
        try {
            await audioRef.current.play();
            setIsPlaying(true);
        } catch (error) {
            console.error('Unable to start audio playback:', error);
            setIsPlaying(false);
        }
    }, []);

    const pause = useCallback(() => {
        if (!audioRef.current) return;
        audioRef.current.pause();
        setIsPlaying(false);
    }, []);

    const togglePlayPause = useCallback(() => {
        if (isPlaying) {
            pause();
            return;
        }
        play();
    }, [isPlaying, pause, play]);

    const seekByProgress = useCallback((pct) => {
        if (!audioRef.current) return;
        const audio = audioRef.current;
        if (!Number.isFinite(pct) || !audio.duration) return;
        const clampedProgress = Math.max(0, Math.min(100, pct));
        audio.currentTime = (clampedProgress / 100) * audio.duration;
        syncFromAudio(audio);
    }, [syncFromAudio]);

    const value = useMemo(() => ({
        currentTime,
        duration,
        isPlaying,
        progress,
        seekByProgress,
        togglePlayPause
    }), [currentTime, duration, isPlaying, progress, seekByProgress, togglePlayPause]);

    return (
        <MusicPlayerContext.Provider value={value}>
            {children}
        </MusicPlayerContext.Provider>
    );
}

MusicPlayerProvider.propTypes = {
    children: PropTypes.node.isRequired
};
