import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GigMode from './GigMode';
import { playCurtains } from './curtains/curtainTransition';

const mockMusicPlayerState = {
    currentTime: 0,
    duration: 200,
    getPlaybackTime: () => 0,
    isPlaying: false,
    togglePlayPause: vi.fn()
};

vi.mock('../../hooks/useMusicPlayer', () => ({
    useMusicPlayer: () => mockMusicPlayerState
}));

// WebGL isn't available in jsdom, so the lazy stage is swapped for a stub that reports ready
vi.mock('./stage2d/GigStage2D', async () => {
    const { useEffect } = await import('react');
    return {
        default: function MockGigStage({ onReady }) {
            useEffect(() => {
                onReady?.('placeholder');
            }, [onReady]);
            return <div data-testid="gig-stage" />;
        }
    };
});

// The curtains need real layout and the Web Animations API; tests drive their callbacks by hand
vi.mock('./curtains/curtainTransition', () => ({
    playCurtains: vi.fn(() => ({ toward: vi.fn(), cancel: vi.fn() }))
}));

// Re-renders with the music player in a new state, as the provider would
async function setPlayer(rerender, changes) {
    Object.assign(mockMusicPlayerState, changes);
    await act(async () => rerender(<GigMode />));
}

// Renders with the music paused, then presses play
async function startMusic() {
    const view = render(<GigMode />);
    await setPlayer(view.rerender, { isPlaying: true, currentTime: 1 });
    return view;
}

function stubMotion({ reduce }) {
    vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: reduce && query.includes('reduce'), media: query })));
    if (!Element.prototype.animate) {
        Element.prototype.animate = vi.fn();
        return () => delete Element.prototype.animate;
    }
    return () => {};
}

describe('GigMode', () => {
    beforeEach(() => {
        Object.assign(mockMusicPlayerState, { isPlaying: false, currentTime: 0, duration: 200 });
        mockMusicPlayerState.togglePlayPause.mockClear();
        playCurtains.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens the gig when the music starts playing', async () => {
        render(<GigMode />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await startMusic();
        expect(screen.getByRole('dialog', { name: 'Feel Good Inc. live' })).toBeInTheDocument();
        expect(await screen.findByTestId('gig-stage')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText('Setting up the stage')).not.toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Close gig' })).toHaveFocus();
    });

    it('closes back to the page with the music still going, and offers a way back in', async () => {
        const { rerender } = await startMusic();
        await screen.findByTestId('gig-stage');
        // No pill while the gig itself is up
        expect(screen.queryByRole('button', { name: /back to the gig/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close gig' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(mockMusicPlayerState.togglePlayPause).not.toHaveBeenCalled();

        const pill = screen.getByRole('button', { name: /back to the gig/i });
        await waitFor(() => expect(pill).toHaveFocus());
        fireEvent.click(pill);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await screen.findByTestId('gig-stage');

        // Pausing on the page takes the pill away again
        fireEvent.click(screen.getByRole('button', { name: 'Close gig' }));
        await setPlayer(rerender, { isPlaying: false });
        expect(screen.queryByRole('button', { name: /back to the gig/i })).not.toBeInTheDocument();
    });

    it('closes on Escape', async () => {
        await startMusic();
        await screen.findByTestId('gig-stage');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays open when the music is paused, with its own play control', async () => {
        const { rerender } = await startMusic();
        await screen.findByTestId('gig-stage');

        fireEvent.click(screen.getByRole('button', { name: 'Pause music' }));
        expect(mockMusicPlayerState.togglePlayPause).toHaveBeenCalledTimes(1);

        await setPlayer(rerender, { isPlaying: false, currentTime: 30 });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Play music' })).toBeInTheDocument();

        // Playing again from inside the gig just carries on
        await setPlayer(rerender, { isPlaying: true });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('closes when the song finishes', async () => {
        const { rerender } = await startMusic();
        await screen.findByTestId('gig-stage');
        await setPlayer(rerender, { currentTime: 199.6 });

        // The player rewinds to the start when the song ends
        await setPlayer(rerender, { isPlaying: false, currentTime: 0 });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /back to the gig/i })).not.toBeInTheDocument();
    });

    it('shows the karaoke line being sung', async () => {
        const { rerender } = await startMusic();
        await setPlayer(rerender, { currentTime: 60 });
        await screen.findByTestId('gig-stage');

        expect(document.querySelectorAll('.gig-lyric .karaoke-word').length).toBeGreaterThan(1);
    });

    it('crossfades instead of running the curtains when motion is reduced', async () => {
        const restore = stubMotion({ reduce: true });
        try {
            await startMusic();
            const dialog = screen.getByRole('dialog');
            expect(playCurtains).not.toHaveBeenCalled();
            await waitFor(() => expect(dialog).toHaveClass('is-shown'));

            fireEvent.click(screen.getByRole('button', { name: 'Close gig' }));
            // Fades out first, then goes
            expect(dialog).not.toHaveClass('is-shown');
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        } finally {
            restore();
        }
    });

    it('runs the curtains both ways, unmounting the gig only once it is covered', async () => {
        const restore = stubMotion({ reduce: false });
        try {
            const appRoot = document.createElement('div');
            appRoot.className = 'app';
            document.body.appendChild(appRoot);
            await startMusic();

            expect(playCurtains).toHaveBeenCalledTimes(1);
            const opening = playCurtains.mock.calls[0][0];
            expect(opening).toMatchObject({ source: appRoot, direction: 'open' });
            // The gig is there at once behind the curtains; the stage starts once the page has folded
            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveClass('is-shown');
            expect(screen.queryByTestId('gig-stage')).not.toBeInTheDocument();
            expect(opening.isStageReady()).toBe(false);
            act(() => opening.onFolded());
            await screen.findByTestId('gig-stage');
            await waitFor(() => expect(opening.isStageReady()).toBe(true));
            act(() => opening.onFinish('gig'));

            fireEvent.click(screen.getByRole('button', { name: 'Close gig' }));
            expect(playCurtains).toHaveBeenCalledTimes(2);
            const closing = playCurtains.mock.calls[1][0];
            expect(closing.direction).toBe('close');
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /back to the gig/i })).not.toBeInTheDocument();

            act(() => closing.onCovered());
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            act(() => closing.onFinish('page'));
            expect(screen.getByRole('button', { name: /back to the gig/i })).toBeInTheDocument();
            appRoot.remove();
        } finally {
            restore();
        }
    });

    it('turns the curtains back round when closed halfway through opening', async () => {
        const restore = stubMotion({ reduce: false });
        try {
            const appRoot = document.createElement('div');
            appRoot.className = 'app';
            document.body.appendChild(appRoot);
            await startMusic();
            const controller = playCurtains.mock.results[0].value;

            fireEvent.keyDown(document, { key: 'Escape' });
            expect(controller.toward).toHaveBeenCalledWith('page');
            expect(playCurtains).toHaveBeenCalledTimes(1);
            appRoot.remove();
        } finally {
            restore();
        }
    });
});
