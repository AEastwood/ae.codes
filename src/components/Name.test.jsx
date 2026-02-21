import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Name from './Name';

const mockMusicPlayerState = {
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    progress: 0,
    seekByProgress: vi.fn()
};

vi.mock('../hooks/useMusicPlayer', () => ({
    useMusicPlayer: () => mockMusicPlayerState
}));

function setupName() {
    render(<Name />);
    const textNode = screen.getByText('Adam Eastwood');
    const clickableName = textNode.parentElement;

    vi.spyOn(clickableName, 'getBoundingClientRect').mockReturnValue({
        bottom: 100,
        height: 40,
        left: 0,
        right: 200,
        top: 60,
        width: 200,
        x: 0,
        y: 60,
        toJSON: () => ({})
    });

    return clickableName;
}

describe('Name seek behavior', () => {
    it('does not seek when track duration is unavailable', () => {
        mockMusicPlayerState.duration = 0;
        mockMusicPlayerState.progress = 0;
        mockMusicPlayerState.currentTime = 0;
        mockMusicPlayerState.seekByProgress.mockClear();

        const clickableName = setupName();
        fireEvent.mouseDown(clickableName, { clientX: 100 });
        expect(mockMusicPlayerState.seekByProgress).not.toHaveBeenCalled();
    });

    it('seeks using progress when duration is known', () => {
        mockMusicPlayerState.duration = 200;
        mockMusicPlayerState.progress = 25;
        mockMusicPlayerState.currentTime = 50;
        mockMusicPlayerState.seekByProgress.mockClear();

        const clickableName = setupName();
        fireEvent.mouseDown(clickableName, { clientX: 100 });
        expect(mockMusicPlayerState.seekByProgress).toHaveBeenCalledTimes(1);
        expect(mockMusicPlayerState.seekByProgress).toHaveBeenCalledWith(50);
    });

    it('shows hover seek target timestamp in tooltip', () => {
        mockMusicPlayerState.duration = 200;
        mockMusicPlayerState.progress = 25;
        mockMusicPlayerState.currentTime = 50;
        mockMusicPlayerState.seekByProgress.mockClear();

        const clickableName = setupName();

        fireEvent.mouseMove(clickableName, { clientX: 150 });
        expect(screen.getByText('2:30 / 3:20')).toBeInTheDocument();

        fireEvent.mouseLeave(clickableName);
        expect(screen.queryByText('2:30 / 3:20')).not.toBeInTheDocument();
    });
});
