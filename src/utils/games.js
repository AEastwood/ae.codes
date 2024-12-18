import RunnerGame from '../components/eastereggs/games/runner/Game';
import FlappyBird from '../components/eastereggs/games/flappybird/Game';

export const useGamesList = () => {
    return [
        {
            component: RunnerGame,
            instructions: 'Avoid the obstacles and jump to clear them',
            controls: ['Space or Left Mouse Button - Jump'],
            name: 'Runner'
        },
        {
            component: FlappyBird,
            instructions: 'You know the rules, get through the pipes without hitting them!',
            controls: ['Space or Left Mouse Button - Flap'],
            name: 'Flappy Bird'
        }
    ];
};