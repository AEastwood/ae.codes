import { useState, useEffect, useRef } from 'react';

export default function Name() {
    const [currentTaglineIndex, setCurrentTaglineIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(true);
    const [progress, setProgress] = useState(0);
    const containerRef = useRef(null);

    const taglines = [
        "Building digital empires one commit at a time.",
        "Architecting tomorrow's solutions today.",
        "Debugging the universe, one bug at a time.",
        "Crafting elegant solutions to complex problems.",
        "Leading teams through the digital wilderness.",
        "Transforming ideas into reality through technology.",
        "Mastering the art of the impossible.",
        "Building bridges between humans and machines.",
        "Creating order from digital chaos.",
        "Leading the charge into the future.",
        "Solving puzzles that don't exist yet.",
        "Building systems that scale beyond imagination.",
        "Turning complexity into simplicity.",
        "Creating tools that empower humanity.",
        "Leading innovation from the front lines.",
        "Building the infrastructure of tomorrow.",
        "Transforming businesses through technology.",
        "Creating digital experiences that matter.",
        "Leading teams to build the impossible.",
        "Building solutions that last generations.",
        "Turning vision into executable reality.",
        "Creating technology that serves people.",
        "Leading the digital transformation revolution.",
        "Building platforms that connect the world.",
        "Transforming challenges into opportunities.",
        "Creating systems that think for themselves.",
        "Leading the charge toward automation.",
        "Building tools that make life better.",
        "Transforming ideas into market reality.",
        "Creating technology that adapts and learns.",
        "Leading teams through digital evolution.",
        "Building solutions that scale globally.",
        "Transforming businesses with smart technology.",
        "Creating platforms that empower creators.",
        "Leading innovation in the digital age.",
        "Building systems that never sleep.",
        "Transforming data into actionable insights.",
        "Creating technology that thinks ahead.",
        "Leading the way to digital excellence.",
        "Building solutions that solve tomorrow's problems.",
        "Transforming complexity into clarity.",
        "Creating technology that works for everyone.",
        "Leading teams to build the future.",
        "Building platforms that change lives.",
        "Transforming ideas into digital gold.",
        "Creating systems that scale infinitely.",
        "Leading the digital revolution.",
        "Building tools that transform industries.",
        "Transforming challenges into victories."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setIsVisible(false);
            
            setTimeout(() => {
                setCurrentTaglineIndex((prevIndex) => 
                    (prevIndex + 1) % taglines.length
                );
                setIsVisible(true);
            }, 300);
        }, 3000);

        return () => clearInterval(interval);
    }, [taglines.length]);

    // Listen for music progress updates from ProfilePicture
    useEffect(() => {
        const handleProgressUpdate = (event) => {
            if (event.detail && typeof event.detail.progress === 'number') {
                setProgress(event.detail.progress);
            }
        };

        window.addEventListener('musicProgress', handleProgressUpdate);
        return () => window.removeEventListener('musicProgress', handleProgressUpdate);
    }, []);

    const handleSeekByClick = (e) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        window.dispatchEvent(new CustomEvent('musicSeek', { detail: { progress: pct * 100 } }));
    };

    return (
        <>
            {/* My Name */}
            <div className="flex flex-col gap-3 tracking-wider mb-3 text-center">
                <div
                    ref={containerRef}
                    className="text-6xl xl:text-6xl font-semibold antialiased drop-shadow relative inline-block cursor-pointer select-none"
                    onClick={handleSeekByClick}
                >
                    {/* Base white text (always visible) */}
                    <span className="text-white select-none">Adam Eastwood</span>

                    {/* Rainbow overlay clipped to progress width */}
                    <span
                        className="absolute inset-0 pointer-events-none overflow-hidden"
                        style={{ width: `${progress}%` }}
                    >
                        <span
                            className="block"
                            style={{
                                background: `linear-gradient(90deg, #ff0000 0%, #ff8000 16.66%, #ffff00 33.33%, #00ff00 50%, #0080ff 66.66%, #8000ff 83.33%, #ff0080 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                whiteSpace: 'nowrap',
                                transition: 'width 0.1s ease'
                            }}
                        >
                            Adam Eastwood
                        </span>
                    </span>
                </div>

                <div 
                    className={`text-lg text-center text-gray-150 transition-opacity duration-300 ${
                        isVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                >
                    {taglines[currentTaglineIndex]}
                </div>
            </div>
        </>
    )
}
