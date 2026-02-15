import { describe, expect, it } from 'vitest';
import { useGamesList } from './games';

describe('useGamesList', () => {
    it('returns configured games including Space Invaders', () => {
        const games = useGamesList();
        const names = games.map((game) => game.name);

        expect(names).toContain('Flappy Bird');
        expect(names).toContain('Runner');
        expect(names).toContain('Tetris');
        expect(names).toContain('Space Invaders');
    });
});
