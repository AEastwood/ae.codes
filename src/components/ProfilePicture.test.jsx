import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfilePicture from './ProfilePicture';

vi.mock('../hooks/useCdn', () => ({
    useCdn: () => ({
        getUri: () => 'https://cdn.example.com/images/me-gorillaz.png'
    })
}));

class MockAudio {
    static instances = [];

    constructor() {
        this.currentTime = 0;
        this.duration = 120;
        this.listeners = {};
        this.play = vi.fn(() => Promise.resolve());
        this.pause = vi.fn();
        MockAudio.instances.push(this);
    }

    addEventListener(type, callback) {
        this.listeners[type] = callback;
    }

    removeEventListener(type) {
        delete this.listeners[type];
    }

    emit(type) {
        if (this.listeners[type]) {
            this.listeners[type]();
        }
    }
}

describe('ProfilePicture', () => {
    afterEach(() => {
        MockAudio.instances = [];
        vi.unstubAllGlobals();
    });

    it('dispatches play state when play button is clicked', async () => {
        vi.stubGlobal('Audio', MockAudio);
        const musicStateHandler = vi.fn();
        window.addEventListener('musicState', musicStateHandler);

        render(<ProfilePicture />);
        const playButton = screen.getByRole('button', { name: /play/i });
        await act(async () => {
            fireEvent.click(playButton);
            await Promise.resolve();
        });

        window.removeEventListener('musicState', musicStateHandler);

        expect(musicStateHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: { isPlaying: true }
            })
        );
    });

    it('responds to musicSeek and dispatches updated progress', () => {
        vi.stubGlobal('Audio', MockAudio);
        const progressHandler = vi.fn();
        window.addEventListener('musicProgress', progressHandler);

        render(<ProfilePicture />);
        const audio = MockAudio.instances[0];
        window.dispatchEvent(new CustomEvent('musicSeek', {
            detail: { progress: 50 }
        }));
        window.removeEventListener('musicProgress', progressHandler);

        expect(audio.currentTime).toBe(60);
        expect(progressHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: expect.objectContaining({
                    progress: 50
                })
            })
        );
    });
});
