import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnimatedBackground from './AnimatedBackground';

const mockMusicPlayer = {
    isPlaying: false,
    getPlaybackTime: () => 0
};

vi.mock('../hooks/useMusicPlayer', () => ({
    useMusicPlayer: () => mockMusicPlayer
}));

describe('AnimatedBackground', () => {
    it('renders a hidden decorative canvas while music is paused', () => {
        mockMusicPlayer.isPlaying = false;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const { container } = render(<AnimatedBackground />);

        const canvas = container.querySelector('canvas');
        expect(canvas).toHaveAttribute('aria-hidden', 'true');
        expect(canvas).not.toHaveClass('is-active');
    });

    it('fades in and loads the spectrum when music plays', () => {
        mockMusicPlayer.isPlaying = true;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(32) });
        vi.stubGlobal('fetch', fetchMock);
        const { container } = render(<AnimatedBackground />);

        expect(container.querySelector('canvas')).toHaveClass('is-active');
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('feel-good-inc-spectrum.bin'));
        vi.unstubAllGlobals();
    });
});
