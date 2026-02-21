import { useState, useEffect, useRef, useCallback } from 'react';

export default function Name() {
    const [currentTaglineIndex, setCurrentTaglineIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(true);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [hoverProgress, setHoverProgress] = useState(null);
    const [isDraggingSeek, setIsDraggingSeek] = useState(false);
    const containerRef = useRef(null);

    const taglines = [
        "Building digital empires one commit at a time.",
        "Architecting tomorrow's solutions today.",
        "Debugging the universe, one bug at a time.",
        "Crafting elegant solutions to complex problems.",
        "Transforming ideas into reality through technology.",
        "Mastering the art of the impossible.",
        "Building bridges between humans and machines.",
        "Creating order from digital chaos.",
        "Solving puzzles that don't exist yet.",
        "Building systems that scale beyond imagination.",
        "Turning complexity into simplicity.",
        "Creating tools that empower humanity.",
        "Building the infrastructure of tomorrow.",
        "Creating digital experiences that matter.",
        "Building solutions that last generations.",
        "Turning vision into executable reality.",
        "Creating technology that serves people.",
        "Building platforms that connect the world.",
        "Transforming challenges into opportunities.",
        "Creating systems that think for themselves.",
        "Building tools that make life better.",
        "Transforming ideas into market reality.",
        "Creating technology that adapts and learns.",
        "Building solutions that scale globally.",
        "Creating platforms that empower creators.",
        "Building systems that never sleep.",
        "Transforming data into actionable insights.",
        "Creating technology that thinks ahead.",
        "Building solutions that solve tomorrow's problems.",
        "Transforming complexity into clarity.",
        "Creating technology that works for everyone.",
        "Building platforms that change lives.",
        "Transforming ideas into digital gold.",
        "Creating systems that scale infinitely.",
        "Building tools that transform industries.",
        "Transforming challenges into victories."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setIsVisible(false);
            
            setTimeout(() => {
                setCurrentTaglineIndex(Math.floor(Math.random() * taglines.length));
                setIsVisible(true);
            }, 350);
        }, 3000);

        return () => clearInterval(interval);
    }, [taglines.length]);

    useEffect(() => {
        const handleProgressUpdate = (event) => {
            const value = Number(event?.detail?.progress);
            if (!Number.isFinite(value)) return;
            setProgress(Math.max(0, Math.min(100, value)));

            const nextDuration = Number(event?.detail?.duration);
            if (Number.isFinite(nextDuration)) {
                setDuration(Math.max(0, nextDuration));
            }
        };
        window.addEventListener('musicProgress', handleProgressUpdate);
        return () => {
            window.removeEventListener('musicProgress', handleProgressUpdate);
        };
    }, []);

    const formatTimestamp = (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

        const wholeSeconds = Math.floor(seconds);
        const minutes = Math.floor(wholeSeconds / 60);
        const remainingSeconds = wholeSeconds % 60;

        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const getProgressFromClientX = useCallback((clientX) => {
        if (!containerRef.current) return;

        const bounds = containerRef.current.getBoundingClientRect();
        if (bounds.width <= 0) return null;

        const offsetX = clientX - bounds.left;
        return Math.max(0, Math.min(100, (offsetX / bounds.width) * 100));
    }, []);

    const handleNameMouseMove = (event) => {
        const nextProgress = getProgressFromClientX(event.clientX);
        if (nextProgress == null) return;
        setHoverProgress(nextProgress);
    };

    const handleNameMouseLeave = () => {
        if (isDraggingSeek) return;
        setHoverProgress(null);
    };

    const seekToClientX = useCallback((clientX) => {
        if (duration <= 0) return;
        const seekProgress = getProgressFromClientX(clientX);
        if (seekProgress == null) return;
        setHoverProgress(seekProgress);
        window.dispatchEvent(new CustomEvent('musicSeek', {
            detail: { progress: seekProgress }
        }));
    }, [duration, getProgressFromClientX]);

    const handleSeekMouseDown = (event) => {
        if (duration <= 0) return;
        event.preventDefault();
        setIsDraggingSeek(true);
        seekToClientX(event.clientX);
    };

    useEffect(() => {
        if (!isDraggingSeek) return;

        const handleMouseMove = (event) => {
            seekToClientX(event.clientX);
        };

        const handleMouseUp = (event) => {
            seekToClientX(event.clientX);
            setIsDraggingSeek(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingSeek, seekToClientX]);

    const canSeek = duration > 0;
    const seekPreviewProgress = hoverProgress ?? progress;
    const seekPreviewTime = (seekPreviewProgress / 100) * duration;

    return (
        <>
            {/* My Name */}
            <div className="flex flex-col gap-3 tracking-wider mb-3 text-center">
                <div
                    ref={containerRef}
                    className={`text-4xl lg:text-6xl font-semibold antialiased drop-shadow relative inline-block select-none ${
                        canSeek ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    onMouseMove={handleNameMouseMove}
                    onMouseLeave={handleNameMouseLeave}
                    onMouseDown={handleSeekMouseDown}
                >
                    <span
                        className="name-progress-text relative"
                        data-text="Adam Eastwood"
                        style={{ '--music-progress': `${progress}%` }}
                    >
                        Adam Eastwood
                    </span>
                    {hoverProgress != null && canSeek ? (
                        <>
                            <div
                                className="absolute z-[9999] -top-9 -translate-x-1/2 px-2 py-1 rounded-md bg-black/80 text-white text-xs whitespace-nowrap pointer-events-none"
                                style={{ left: `${hoverProgress}%` }}
                                aria-hidden="true"
                            >
                                {formatTimestamp(seekPreviewTime)} / {formatTimestamp(duration)}
                            </div>
                        </>
                    ) : null}
                </div>

                <div 
                    className={`lg:text-lg text-center text-gray-150 transition-opacity duration-300 ${
                        isVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                >
                    {taglines[currentTaglineIndex]}
                </div>
            </div>
        </>
    )
}
