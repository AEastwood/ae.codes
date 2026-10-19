import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { useMusicPlayer } from '../../hooks/useMusicPlayer';
import { lyricsTimeline } from '../../utils/lyrics';
import KaraokeLine from '../KaraokeLine';

// three.js and the stage only download when someone opens the gig
const GigStage = lazy(() => import('./GigStage'));

// How long a lyric stays up after its last word
const LYRIC_HOLD_SECONDS = 1.5;

function MicIcon() {
    return (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" fill="currentColor" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
        </svg>
    );
}

// The line being sung right now, hidden again once it's finished
function lyricAt(time) {
    let active = null;
    for (const lyric of lyricsTimeline) {
        if (time < lyric.time) break;
        active = lyric;
    }
    if (!active) return null;
    const lastWord = active.words[active.words.length - 1]?.start ?? active.time;
    return time <= (active.end ?? lastWord + 0.6) + LYRIC_HOLD_SECONDS ? active : null;
}

function GigOverlay({ onClose }) {
    const { currentTime, getPlaybackTime, isPlaying, togglePlayPause } = useMusicPlayer();
    const [status, setStatus] = useState('loading');
    const [shown, setShown] = useState(false);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const lyric = useMemo(() => lyricAt(currentTime), [currentTime]);

    // Fade in on the next frame so the transition has something to start from
    useEffect(() => {
        const frame = requestAnimationFrame(() => setShown(true));
        closeRef.current?.focus();
        return () => cancelAnimationFrame(frame);
    }, []);

    // Escape closes; Tab stays inside the overlay
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled)');
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleReady = useCallback(() => setStatus('ready'), []);
    const handleError = useCallback(() => setStatus('error'), []);

    return (
        <div
            ref={dialogRef}
            className={`gig-overlay fixed inset-0 z-[100] text-gray-100 ${shown ? 'is-shown' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Feel Good Inc. live"
        >
            <Suspense fallback={null}>
                <GigStage
                    getPlaybackTime={getPlaybackTime}
                    isPlaying={isPlaying}
                    onReady={handleReady}
                    onError={handleError}
                />
            </Suspense>

            <div className="gig-vignette absolute inset-0 pointer-events-none" aria-hidden="true" />

            {status !== 'ready' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none" role="status">
                    {status === 'loading' ? (
                        <>
                            <div className="gig-loading flex gap-2" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                            </div>
                            <p className="text-sm tracking-widest uppercase text-gray-300">Setting up the stage</p>
                        </>
                    ) : (
                        <p className="text-sm text-gray-300">The stage needs WebGL, which this browser can&apos;t run.</p>
                    )}
                </div>
            ) : null}

            <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close gig"
                className="gig-control absolute top-4 right-4 size-11 flex items-center justify-center rounded-full"
            >
                <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-4 pb-6 pt-16 gig-footer">
                <div className="gig-lyric text-xl lg:text-3xl text-center min-h-9 max-w-3xl" aria-live="off">
                    {lyric ? <KaraokeLine key={lyric.time} line={lyric} getPlaybackTime={getPlaybackTime} /> : null}
                </div>
                <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Pause music' : 'Play music'}
                    className="gig-control size-12 flex items-center justify-center rounded-full"
                >
                    {isPlaying ? (
                        <svg className="size-6" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M6 4a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm8 0a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" />
                        </svg>
                    ) : (
                        <svg className="size-6 translate-x-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M6.3 3.2A1 1 0 0 0 4.8 4v12a1 1 0 0 0 1.5.86l10-6a1 1 0 0 0 0-1.72l-10-6Z" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}

GigOverlay.propTypes = {
    onClose: PropTypes.func.isRequired
};

/*
  "Watch the gig": a pill that shows while the music plays and opens a full-screen 3D stage where
  the Gorillaz version of me performs the song live. The overlay stays open if the music is paused.
*/
export default function GigMode() {
    const { isPlaying } = useMusicPlayer();
    const [open, setOpen] = useState(false);
    const pillRef = useRef(null);

    const close = useCallback(() => {
        setOpen(false);
        // Back to where they were, if the pill is still there to focus
        requestAnimationFrame(() => pillRef.current?.focus());
    }, []);

    return (
        <>
            {isPlaying ? (
                <button
                    ref={pillRef}
                    type="button"
                    onClick={() => setOpen(true)}
                    className="gig-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-sm tracking-wide"
                >
                    <MicIcon />
                    Watch the gig
                </button>
            ) : null}
            {open ? createPortal(<GigOverlay onClose={close} />, document.body) : null}
        </>
    );
}
