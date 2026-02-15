import { useState, useRef, useEffect } from "react";
import { useCdn } from '../hooks/useCdn';
import feelGoodInc from '../assets/music/feel-good-inc.mp3';

export default function ProfilePicture() {
    const { getUri } = useCdn();
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    useEffect(() => {
        const audio = new Audio(feelGoodInc);
        audioRef.current = audio;

        const handleTimeUpdate = () => {
            if (audio.duration) {
                const newProgress = (audio.currentTime / audio.duration) * 100;
                window.dispatchEvent(new CustomEvent('musicProgress', {
                    detail: { progress: Math.min(100, newProgress) }
                }));
                if (newProgress >= 100) {
                    setIsPlaying(false);
                    audio.pause();
                    audio.currentTime = 0;
                    window.dispatchEvent(new CustomEvent('musicProgress', {
                        detail: { progress: 0 }
                    }));
                }
            }
        };

        const handleEnded = () => {
            setIsPlaying(false);
            window.dispatchEvent(new CustomEvent('musicState', {
                detail: { isPlaying: false }
            }));
            window.dispatchEvent(new CustomEvent('musicProgress', {
                detail: { progress: 0 }
            }));
        };

        const handleSeek = (event) => {
            const pct = Number(event?.detail?.progress);
            if (!Number.isFinite(pct) || !audio.duration) return;

            const clampedProgress = Math.max(0, Math.min(100, pct));
            audio.currentTime = (clampedProgress / 100) * audio.duration;
            window.dispatchEvent(new CustomEvent('musicProgress', {
                detail: { progress: clampedProgress }
            }));
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        window.addEventListener('musicSeek', handleSeek);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            window.removeEventListener('musicSeek', handleSeek);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const togglePlayPause = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
                window.dispatchEvent(new CustomEvent('musicState', {
                    detail: { isPlaying: false }
                }));
            } else {
                audioRef.current.play()
                    .then(() => {
                        setIsPlaying(true);
                        window.dispatchEvent(new CustomEvent('musicState', {
                            detail: { isPlaying: true }
                        }));
                    })
                    .catch((error) => {
                        console.error('Unable to start audio playback:', error);
                        setIsPlaying(false);
                        window.dispatchEvent(new CustomEvent('musicState', {
                            detail: { isPlaying: false }
                        }));
                    });
            }
        }
    };

    return (
        <div className="relative">
            <div className="relative group">
                {/* Hover play/pause button */}
                <div className="absolute inset-0 z-30 pointer-events-none">
                    <button
                        onClick={togglePlayPause}
                        className={`pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full shadow-lg transition hover:scale-110 ${
                            isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? (
                            <svg className="size-10 bg-gray-800 rounded-full" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg className="size-10 bg-gray-800 rounded-full" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                </div>

                <img
                    className="mx-auto relative z-20 profile-picture rounded-md w-48 mb-2 transition duration-250 hover:shadow-xl hover:cursor-pointer"
                    src={getUri('images/me-gorillaz.png')}
                    alt="Adam Eastwood"
                    onClick={togglePlayPause}
                />
            </div>
        </div>
    )
}


