import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayerProvider } from './MusicPlayerContext';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { MockAudio } from '../test/mocks/MockAudio';

vi.mock('../hooks/useCdn', () => ({
    useCdn: () => ({
        getUri: (path) => `https://cdn.example.com/${path}`
    })
}));

function MusicConsumer() {
    const { currentTime, duration, isPlaying, progress, seekByProgress, togglePlayPause } = useMusicPlayer();

    return (
        <div>
            <div>playing:{String(isPlaying)}</div>
            <div>current:{currentTime}</div>
            <div>duration:{duration}</div>
            <div>progress:{Math.round(progress)}</div>
            <button type="button" onClick={togglePlayPause}>toggle</button>
            <button type="button" onClick={() => seekByProgress(50)}>seek-half</button>
        </div>
    );
}

describe('MusicPlayerProvider', () => {
    beforeEach(() => {
        MockAudio.reset();
        vi.stubGlobal('Audio', MockAudio);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('toggles into playing state when playback starts', async () => {
        render(
            <MusicPlayerProvider>
                <MusicConsumer />
            </MusicPlayerProvider>
        );

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
            await Promise.resolve();
        });

        expect(screen.getByText('playing:true')).toBeInTheDocument();
    });

    it('seeks by progress and updates current time', async () => {
        render(
            <MusicPlayerProvider>
                <MusicConsumer />
            </MusicPlayerProvider>
        );

        const audio = MockAudio.instances[0];
        audio.duration = 200;
        audio.currentTime = 0;

        act(() => {
            audio.emit('loadedmetadata');
        });

        fireEvent.click(screen.getByRole('button', { name: 'seek-half' }));
        expect(screen.getByText('current:100')).toBeInTheDocument();
        expect(screen.getByText('progress:50')).toBeInTheDocument();
    });
});
