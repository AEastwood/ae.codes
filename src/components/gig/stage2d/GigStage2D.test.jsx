import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import GigStage2D from './GigStage2D';

describe('GigStage2D', () => {
    it('renders a full-size canvas and reports when canvas 2D is unavailable', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const onError = vi.fn();
        const { container } = render(<GigStage2D getPlaybackTime={() => 0} isPlaying={false} onError={onError} />);
        const canvas = container.querySelector('canvas');
        expect(canvas).toHaveClass('absolute', 'inset-0');
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});
