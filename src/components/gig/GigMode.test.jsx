import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GigMode from './GigMode';

const mockMusicPlayerState = {
    currentTime: 0,
    getPlaybackTime: () => 0,
    isPlaying: false,
    togglePlayPause: vi.fn()
};

vi.mock('../../hooks/useMusicPlayer', () => ({
    useMusicPlayer: () => mockMusicPlayerState
}));

// WebGL isn't available in jsdom, so the lazy stage is swapped for a stub that reports ready
vi.mock('./GigStage', async () => {
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

describe('GigMode', () => {
    beforeEach(() => {
        mockMusicPlayerState.isPlaying = false;
        mockMusicPlayerState.currentTime = 0;
        mockMusicPlayerState.togglePlayPause.mockClear();
    });

    it('only offers the gig while music is playing', () => {
        const { rerender } = render(<GigMode />);
        expect(screen.queryByRole('button', { name: /watch the gig/i })).not.toBeInTheDocument();

        mockMusicPlayerState.isPlaying = true;
        rerender(<GigMode />);
        expect(screen.getByRole('button', { name: /watch the gig/i })).toBeInTheDocument();
    });

    it('opens the full-screen stage and closes it again', async () => {
        mockMusicPlayerState.isPlaying = true;
        render(<GigMode />);

        fireEvent.click(screen.getByRole('button', { name: /watch the gig/i }));
        expect(screen.getByRole('dialog', { name: 'Feel Good Inc. live' })).toBeInTheDocument();
        expect(await screen.findByTestId('gig-stage')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText('Setting up the stage')).not.toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Close gig' })).toHaveFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Close gig' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on Escape', async () => {
        mockMusicPlayerState.isPlaying = true;
        render(<GigMode />);

        fireEvent.click(screen.getByRole('button', { name: /watch the gig/i }));
        await screen.findByTestId('gig-stage');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays open when the music is paused, with its own play control', async () => {
        mockMusicPlayerState.isPlaying = true;
        const { rerender } = render(<GigMode />);
        fireEvent.click(screen.getByRole('button', { name: /watch the gig/i }));
        await screen.findByTestId('gig-stage');

        fireEvent.click(screen.getByRole('button', { name: 'Pause music' }));
        expect(mockMusicPlayerState.togglePlayPause).toHaveBeenCalledTimes(1);

        mockMusicPlayerState.isPlaying = false;
        await act(async () => rerender(<GigMode />));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Play music' })).toBeInTheDocument();
    });

    it('shows the karaoke line being sung', async () => {
        mockMusicPlayerState.isPlaying = true;
        mockMusicPlayerState.currentTime = 60;
        render(<GigMode />);
        fireEvent.click(screen.getByRole('button', { name: /watch the gig/i }));
        await screen.findByTestId('gig-stage');

        expect(document.querySelectorAll('.gig-lyric .karaoke-word').length).toBeGreaterThan(1);
    });
});
