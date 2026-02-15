import { fireEvent, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import { describe, expect, it, vi } from 'vitest';
import StartScreen from './StartScreen';

vi.mock('./Leaderboard', () => ({
    default: () => <div>Leaderboard</div>
}));

function MockGameComponent({ onExit }) {
    return <button onClick={onExit}>Exit via Escape</button>;
}

MockGameComponent.propTypes = {
    onExit: PropTypes.func.isRequired
};

describe('StartScreen', () => {
    it('shows instructions then starts the selected game', () => {
        const onExit = vi.fn();
        const game = {
            component: MockGameComponent,
            controls: ['Space - Jump'],
            instructions: 'Do not crash',
            name: 'Runner'
        };

        render(<StartScreen game={game} onExit={onExit} />);
        expect(screen.getByText('Do not crash')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Start Game'));
        fireEvent.click(screen.getByText('Exit via Escape'));
        expect(onExit).toHaveBeenCalledTimes(1);
    });
});
