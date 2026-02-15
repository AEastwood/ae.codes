import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GamesModal from './GamesModal';

vi.mock('../../utils/games', () => ({
    useGamesList: () => [
        {
            component: () => <div>Mock Game</div>,
            controls: ['Space - Jump'],
            instructions: 'Mock instructions',
            name: 'Runner'
        }
    ]
}));

vi.mock('../eastereggs/games/StartScreen', () => ({
    default: ({ game, onExit }) => (
        <div>
            <span>{game.name} Start</span>
            <button onClick={onExit} type="button">Exit Game</button>
        </div>
    )
}));

describe('GamesModal', () => {
    it('renders game list and opens selected game', () => {
        render(<GamesModal visible={true} setShowGamesModal={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play Runner' }));
        expect(screen.getByText('Runner Start')).toBeInTheDocument();
    });

    it('closes modal when close button clicked on list screen', () => {
        const setShowGamesModal = vi.fn();
        render(<GamesModal visible={true} setShowGamesModal={setShowGamesModal} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
        expect(setShowGamesModal).toHaveBeenCalledWith(false);
    });
});
