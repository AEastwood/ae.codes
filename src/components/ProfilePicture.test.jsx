import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfilePicture from './ProfilePicture';

vi.mock('../hooks/useCdn', () => ({
    useCdn: () => ({
        getUri: (path) => `https://cdn.example.com/${path}`
    })
}));

const mockMusicPlayer = {
    isPlaying: false,
    togglePlayPause: vi.fn()
};

vi.mock('../hooks/useMusicPlayer', () => ({
    useMusicPlayer: () => mockMusicPlayer
}));

describe('ProfilePicture', () => {
    it('toggles playback when play button is clicked', () => {
        mockMusicPlayer.isPlaying = false;
        mockMusicPlayer.togglePlayPause.mockClear();
        render(<ProfilePicture />);

        const playButton = screen.getByRole('button', { name: /play/i });
        fireEvent.click(playButton);
        expect(mockMusicPlayer.togglePlayPause).toHaveBeenCalledTimes(1);
    });

    it('shows gorillaz image overlay only when playing', () => {
        mockMusicPlayer.isPlaying = true;
        render(<ProfilePicture />);

        const pausedImage = screen.getByAltText('Adam Eastwood');
        const gorillazImage = screen.getByAltText('Adam Eastwood Gorillaz');

        expect(pausedImage).toHaveAttribute('src', 'https://cdn.example.com/images/me.jpeg');
        expect(gorillazImage).toHaveClass('opacity-100');
        expect(gorillazImage).toHaveClass('visible');
    });
});
