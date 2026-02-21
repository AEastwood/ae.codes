import { useCdn } from '../hooks/useCdn';
import { useMusicPlayer } from '../hooks/useMusicPlayer';

export default function ProfilePicture() {
    const { getUri } = useCdn();
    const { isPlaying, togglePlayPause } = useMusicPlayer();
    const pausedImageSrc = getUri('images/me.jpeg');

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
                        aria-label={isPlaying ? 'Pause music' : 'Play music'}
                        type="button"
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

                <div
                    className="mx-auto relative z-20 w-48 mb-2 rounded-md overflow-hidden transition duration-250 hover:shadow-xl hover:cursor-pointer"
                    onClick={togglePlayPause}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            togglePlayPause();
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Toggle music from artwork"
                >
                    <img
                        className="profile-picture block w-full h-auto"
                        src={pausedImageSrc}
                        alt="Adam Eastwood"
                        loading="eager"
                    />
                    <img
                        className={`profile-picture absolute inset-0 block w-full h-full object-cover transition-opacity duration-500 ease-in-out ${
                            isPlaying ? 'opacity-100 visible' : 'opacity-0 invisible'
                        }`}
                        src={getUri('images/me-gorillaz.png')}
                        alt="Adam Eastwood Gorillaz"
                        loading="lazy"
                    />
                </div>
            </div>
        </div>
    )
}


