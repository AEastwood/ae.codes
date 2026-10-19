import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

// A stand-in music player that just flips state, so pressing play on the real photo drives the real gig
vi.mock('./context/MusicPlayerContext', async () => {
    const { useMemo, useState } = await import('react');
    const { MusicPlayerContext } = await import('./context/MusicPlayerContextObject');
    return {
        // eslint-disable-next-line react/prop-types
        MusicPlayerProvider: ({ children }) => {
            const [isPlaying, setIsPlaying] = useState(false);
            const value = useMemo(() => ({
                currentTime: 0,
                duration: 200,
                getPlaybackTime: () => 0,
                isPlaying,
                progress: 0,
                seekByProgress: () => {},
                togglePlayPause: () => setIsPlaying((playing) => !playing)
            }), [isPlaying]);
            return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
        }
    };
});

vi.mock('./components/AnimatedBackground', () => ({
    default: () => null
}));

vi.mock('./components/Name', () => ({
    default: () => <div>Name Component</div>
}));

vi.mock('./components/SingingMouth', () => ({
    default: () => null
}));

vi.mock('./components/Socials', () => ({
    default: () => <div>Socials Component</div>
}));

vi.mock('./components/gig/stage2d/GigStage2D', () => ({
    default: () => <div data-testid="gig-stage" />
}));

vi.mock('./components/eastereggs/KonamiCode', () => ({
    default: () => <div>Konami Component</div>
}));

describe('App', () => {
    it('renders top-level sections', () => {
        render(<App />);

        expect(screen.getByText('Konami Component')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Adam Eastwood' })).toBeInTheDocument();
        expect(screen.getByText('Name Component')).toBeInTheDocument();
        expect(screen.getByText('Socials Component')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('goes to the gig when play is pressed on the photo, and back to the page with the music on', async () => {
        render(<App />);

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play music' })));
        expect(screen.getByRole('dialog', { name: 'Feel Good Inc. live' })).toBeInTheDocument();
        expect(await screen.findByTestId('gig-stage')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close gig' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // Still playing: the photo offers pause, and the pill offers the gig again
        expect(screen.getAllByRole('button', { name: 'Pause music' }).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: /back to the gig/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('also goes to the gig from the artwork itself', async () => {
        render(<App />);

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toggle music from artwork' })));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await screen.findByTestId('gig-stage');
    });
});
