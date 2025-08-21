import { useState, useRef, useEffect } from "react";
import { useCdn } from '../hooks/useCdn';
import feelGoodInc from '../assets/music/feel-good-inc.mp3';

export default function ProfilePicture() {
    const { getUri } = useCdn();
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef(null);

    useEffect(() => {
        const audio = new Audio(feelGoodInc);
        audioRef.current = audio;
        
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const newProgress = (audio.currentTime / audio.duration) * 100;
                
                // If progress hits 100%, reset to 0 and stop playing
                if (newProgress >= 100) {
                    setProgress(0);
                    setIsPlaying(false);
                    audio.pause();
                    audio.currentTime = 0;
                    window.dispatchEvent(new CustomEvent('musicProgress', { detail: { progress: 0 } }));
                } else {
                    setProgress(newProgress);
                    window.dispatchEvent(new CustomEvent('musicProgress', { detail: { progress: newProgress } }));
                }
            }
        });

        audio.addEventListener('ended', () => {
            setIsPlaying(false);
            setProgress(0);
        });

        const handleSeek = (event) => {
            const pct = Math.max(0, Math.min(100, event.detail?.progress ?? 0));
            if (audio.duration) {
                audio.currentTime = (pct / 100) * audio.duration;
                setProgress(pct);
            }
        };

        window.addEventListener('musicSeek', handleSeek);

        return () => {
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
            } else {
                audioRef.current.play();
                setIsPlaying(true);
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


