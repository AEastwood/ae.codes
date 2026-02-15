import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Name from './Name';

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
    it('does not dispatch seek when playback is not active', () => {
        const clickableName = setupName();
        const seekHandler = vi.fn();

        window.addEventListener('musicSeek', seekHandler);
        fireEvent.click(clickableName, { clientX: 100 });
        window.removeEventListener('musicSeek', seekHandler);

        expect(seekHandler).not.toHaveBeenCalled();
    });

    it('dispatches seek progress only when playing', () => {
        const clickableName = setupName();
        const seekHandler = vi.fn();

        window.addEventListener('musicSeek', seekHandler);
        act(() => {
            window.dispatchEvent(new CustomEvent('musicState', {
                detail: { isPlaying: true }
            }));
        });

        fireEvent.click(clickableName, { clientX: 100 });
        window.removeEventListener('musicSeek', seekHandler);

        expect(seekHandler).toHaveBeenCalledTimes(1);
        expect(seekHandler.mock.calls[0][0].detail.progress).toBe(50);
    });

    it('shows hover seek target timestamp in title', () => {
        const clickableName = setupName();

        act(() => {
            window.dispatchEvent(new CustomEvent('musicProgress', {
                detail: {
                    progress: 25,
                    currentTime: 50,
                    duration: 200
                }
            }));
            window.dispatchEvent(new CustomEvent('musicState', {
                detail: { isPlaying: true }
            }));
        });

        expect(clickableName).toHaveAttribute('title', '0:50 / 3:20');

        fireEvent.mouseMove(clickableName, { clientX: 150 });
        expect(clickableName).toHaveAttribute('title', '2:30 / 3:20');

        fireEvent.mouseLeave(clickableName);
        expect(clickableName).toHaveAttribute('title', '0:50 / 3:20');
    });
});
