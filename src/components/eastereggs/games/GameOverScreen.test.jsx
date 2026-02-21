import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GameOverScreen from './GameOverScreen';

const submitHighScore = vi.fn();

vi.mock('../../../hooks/useApi', () => ({
    useApi: () => ({ submitHighScore })
}));

describe('GameOverScreen', () => {
    it('allows replay action', () => {
        const onSubmit = vi.fn();
        render(<GameOverScreen game={{ name: 'Runner' }} score={10} onSubmit={onSubmit} />);

        fireEvent.click(screen.getByText('Play Again'));
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('submits score with player name', async () => {
        submitHighScore.mockResolvedValueOnce({ ok: true });
        render(<GameOverScreen game={{ name: 'Runner' }} score={10} onSubmit={vi.fn()} />);

        fireEvent.click(screen.getByText('Submit Score'));
        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Adam' }
        });
        fireEvent.click(screen.getByText('Submit'));

        await waitFor(() => {
            expect(submitHighScore).toHaveBeenCalledWith({ name: 'Runner' }, 'Adam', 10);
            expect(screen.getByText('Score Submitted!')).toBeInTheDocument();
        });
    });
});
