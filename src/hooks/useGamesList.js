import RunnerGame from '../components/eastereggs/games/runner/Game';
import FlappyBird from '../components/eastereggs/games/flappybird/Game';
import TetrisGame from '../components/eastereggs/games/tetris/Game';
import SpaceInvadersGame from '../components/eastereggs/games/spaceinvaders/Game';

/**
 * Hook to get the list of available games.
 * @returns {Array} Array of game objects with component, instructions, controls, and name.
 */
export const useGamesList = () => {
    return [
        {
            component: FlappyBird,
            instructions: 'You know the rules, get through the pipes without hitting them!',
            controls: ['Space or Left Mouse Button - Flap'],
            name: 'Flappy Bird'
        },
        {
            component: RunnerGame,
            instructions: 'Avoid the obstacles and jump to clear them',
            controls: ['Space or Left Mouse Button - Jump'],
            name: 'Runner'
        },
        {
            component: TetrisGame,
            instructions: 'Clear the lines to score points',
            controls: ['Arrow Up - Rotate', 'Arrow Down - Soft Drop', 'Arrow Left - Move Left', 'Arrow Right - Move Right'],
            name: 'Tetris'
        },
        {
            component: SpaceInvadersGame,
            instructions: 'Defend your position and shoot down incoming invaders before they reach you.',
            controls: ['Arrow Left / Arrow Right - Move', 'Space - Shoot', 'Escape - Exit'],
            name: 'Space Invaders'
        }
    ];
};
