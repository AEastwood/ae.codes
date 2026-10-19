import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { useMusicPlayer } from '../../hooks/useMusicPlayer';
import { lyricsTimeline } from '../../utils/lyrics';
import KaraokeLine from '../KaraokeLine';
import { playCurtains } from './curtains/curtainTransition';

// The stage only downloads when the gig opens
const GigStage = lazy(() => import('./stage2d/GigStage2D'));

// How long a lyric stays up after its last word
const LYRIC_HOLD_SECONDS = 1.5;
// The reduced-motion crossfade, matching .gig-overlay's transition
const FADE_MS = 500;
// Stopping this close to the end of the song counts as the song finishing, which closes the gig
const END_SLACK_SECONDS = 1.5;

/*
  How the gig comes and goes: the curtains, a plain crossfade for reduced motion, or straight away
  where there's nothing to animate with (jsdom)
*/
function transitionStyle() {
    if (typeof window.matchMedia !== 'function' || typeof Element.prototype.animate !== 'function') return 'instant';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'fade' : 'curtains';
}

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

function GigOverlay({ fade = false, leaving = false, onClose, onStageStatus, showStage = true }) {
    const { currentTime, getPlaybackTime, isPlaying, togglePlayPause } = useMusicPlayer();
    const [status, setStatus] = useState('loading');
    // Behind the curtains it's there at once; the reduced-motion crossfade starts it hidden
    const [shown, setShown] = useState(!fade);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const lyric = useMemo(() => lyricAt(currentTime), [currentTime]);

    // Fade in on the next frame so the transition has something to start from
    useEffect(() => {
        closeRef.current?.focus();
        if (!fade) return undefined;
        const frame = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(frame);
    }, [fade]);

    // The curtains hold closed until the stage is drawing
    useEffect(() => {
        onStageStatus?.(status);
    }, [onStageStatus, status]);

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
            className={`gig-overlay fixed inset-0 z-[100] text-gray-100 ${shown && !(fade && leaving) ? 'is-shown' : ''} ${fade ? '' : 'is-instant'}`}
            role="dialog"
            aria-modal="true"
            aria-label="Feel Good Inc. live"
            inert={leaving}
        >
            {showStage ? (
                <Suspense fallback={null}>
                    <GigStage
                        getPlaybackTime={getPlaybackTime}
                        isPlaying={isPlaying}
                        onReady={handleReady}
                        onError={handleError}
                    />
                </Suspense>
            ) : null}

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
                        <p className="text-sm text-gray-300">The stage couldn&apos;t start in this browser.</p>
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
    fade: PropTypes.bool,
    leaving: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onStageStatus: PropTypes.func,
    showStage: PropTypes.bool
};

/*
  Gig mode: pressing play anywhere on the site turns the page into stage curtains that part on a
  full-screen stage where the Gorillaz version of me performs the song live. Closing it (or the song
  ending) draws the curtains back and settles them into the page with the music still going, where a
  small "Back to the gig" pill under the name goes back in. Pausing inside the gig keeps it open.
*/
export default function GigMode() {
    const { currentTime, duration, isPlaying } = useMusicPlayer();
    // 'page', 'gig', or 'fading' while the reduced-motion crossfade takes it away
    const [view, setView] = useState('page');
    const [leaving, setLeaving] = useState(false);
    const [moving, setMoving] = useState(false);
    const [fade, setFade] = useState(false);
    // Opening through the curtains, the stage waits until the page has folded so its setup can't stall the fold
    const [showStage, setShowStage] = useState(true);
    // The pill only offers a way back after they've left the gig, and goes once the music stops
    const [canReturn, setCanReturn] = useState(false);
    const viewRef = useRef(view);
    const curtainsRef = useRef(null);
    const stageReadyRef = useRef(false);
    const pillRef = useRef(null);
    const returnFocusRef = useRef(null);
    const wasPlayingRef = useRef(isPlaying);
    const playedToRef = useRef(0);
    const fadeTimerRef = useRef(0);

    const show = useCallback((next) => {
        viewRef.current = next;
        setView(next);
    }, []);

    // Back on the page: focus the pill if it's there, otherwise wherever they were before the gig
    const settleFocus = useCallback(() => {
        requestAnimationFrame(() => {
            const active = document.activeElement;
            if (active && active !== document.body) return;
            const target = pillRef.current ?? returnFocusRef.current;
            if (target?.isConnected) target.focus();
        });
    }, []);

    const handleCovered = useCallback(() => show('page'), [show]);
    const handleFolded = useCallback(() => setShowStage(true), []);

    const handleFinish = useCallback((end) => {
        curtainsRef.current = null;
        setMoving(false);
        if (end === 'page') settleFocus();
    }, [settleFocus]);

    const handleStageStatus = useCallback((status) => {
        stageReadyRef.current = status !== 'loading';
    }, []);

    const enterGig = useCallback(() => {
        clearTimeout(fadeTimerRef.current);
        setLeaving(false);
        // Halfway through closing: turn the curtains back round
        if (curtainsRef.current) {
            curtainsRef.current.toward('gig');
            setShowStage(true);
            show('gig');
            return;
        }
        if (viewRef.current === 'gig') return;
        returnFocusRef.current = document.activeElement;
        stageReadyRef.current = false;
        const style = transitionStyle();
        const source = document.querySelector('.app');
        if (style === 'curtains' && source) {
            curtainsRef.current = playCurtains({
                source,
                direction: 'open',
                isStageReady: () => stageReadyRef.current,
                onFolded: handleFolded,
                onCovered: handleCovered,
                onFinish: handleFinish
            });
            setMoving(true);
        }
        setShowStage(!curtainsRef.current);
        setFade(style === 'fade');
        show('gig');
    }, [handleCovered, handleFinish, handleFolded, show]);

    const leaveGig = useCallback(() => {
        setCanReturn(true);
        if (curtainsRef.current) {
            setLeaving(true);
            curtainsRef.current.toward('page');
            return;
        }
        if (viewRef.current !== 'gig') return;
        setLeaving(true);
        const style = transitionStyle();
        const source = document.querySelector('.app');
        if (style === 'curtains' && source) {
            curtainsRef.current = playCurtains({
                source,
                direction: 'close',
                onCovered: handleCovered,
                onFinish: handleFinish
            });
            setMoving(true);
        } else if (style === 'fade') {
            show('fading');
            fadeTimerRef.current = setTimeout(() => {
                show('page');
                settleFocus();
            }, FADE_MS);
        } else {
            show('page');
            settleFocus();
        }
    }, [handleCovered, handleFinish, settleFocus, show]);

    useEffect(() => {
        if (isPlaying) playedToRef.current = currentTime;
    }, [currentTime, isPlaying]);

    // Before paint, so the curtains are in place before the stage underneath them ever shows
    useLayoutEffect(() => {
        const wasPlaying = wasPlayingRef.current;
        wasPlayingRef.current = isPlaying;
        if (isPlaying && !wasPlaying) {
            enterGig();
        } else if (!isPlaying && wasPlaying) {
            // The song finished rather than being paused
            if (duration > 0 && playedToRef.current >= duration - END_SLACK_SECONDS) leaveGig();
            setCanReturn(false);
        }
    }, [duration, enterGig, isPlaying, leaveGig]);

    useEffect(() => () => {
        clearTimeout(fadeTimerRef.current);
        curtainsRef.current?.cancel();
        curtainsRef.current = null;
    }, []);

    const overlayOpen = view !== 'page';

    return (
        <>
            {isPlaying && canReturn && !overlayOpen && !moving ? (
                <button
                    ref={pillRef}
                    type="button"
                    onClick={enterGig}
                    className="gig-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-sm tracking-wide"
                >
                    <MicIcon />
                    Back to the gig
                </button>
            ) : null}
            {overlayOpen ? createPortal(
                <GigOverlay
                    fade={fade}
                    leaving={leaving || view === 'fading'}
                    onClose={leaveGig}
                    onStageStatus={handleStageStatus}
                    showStage={showStage}
                />,
                document.body
            ) : null}
        </>
    );
}
