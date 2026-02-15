import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Leaderboard from './Leaderboard';

const getHighScores = vi.fn();

vi.mock('../../../hooks/useApi', () => ({
    useApi: () => ({ getHighScores })
}));

describe('Leaderboard', () => {
    it('renders high scores from API', async () => {
        getHighScores.mockResolvedValueOnce([
            { name: 'Alice', score: 9 },
            { name: 'Bob', score: 7 }
        ]);

        render(<Leaderboard game={{ name: 'Runner' }} />);

        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('9')).toBeInTheDocument();
        });
    });

    it('shows empty state when API returns no scores', async () => {
        getHighScores.mockResolvedValueOnce([]);
        render(<Leaderboard game={{ name: 'Runner' }} />);

        await waitFor(() => {
            expect(screen.getByText('No Scores')).toBeInTheDocument();
        });
    });
});
