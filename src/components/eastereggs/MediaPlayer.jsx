import React, { useEffect, useRef, useState } from "react";

export default function MediaPlayer({ url, visible }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    {/* Media Player */ }
    useEffect(() => {
        if (!visible) {
            audioRef.current?.pause();
            setIsPlaying(false);
        }
    }, [visible]);

    {/* Toggle Play */ }
    const togglePlay = () => {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    {/* Dynamic Render */ }
    if (!visible) return null;

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#181818] rounded-xl px-4 py-3 flex items-center gap-4 text-white shadow-xl">
            {/* Album Art */}
            <div className="w-12 h-12 bg-[#282828] rounded-lg flex-shrink-0 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#b3b3b3]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
            </div>

            {/* Song Info */}
            <div className="min-w-[180px]">
                <div className="font-medium text-sm text-[#fff]">Halo 3</div>
            </div>

            {/* Pause Button */}
            <div className="flex items-center gap-2">
                <button
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:scale-105 transition-transform"
                >
                    <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </button>
            </div>
        </div>
    );
}   