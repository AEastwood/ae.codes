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

    return (
        <>
            {/* My Name */}
            <div className="flex flex-col gap-3 tracking-wider mb-3 text-center">
                <div
                    ref={containerRef}
                    className="text-4xl lg:text-6xl font-semibold antialiased drop-shadow relative inline-block"
                >
                    <span className="text-white">Adam Eastwood</span>
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
