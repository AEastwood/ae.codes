import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApi } from './useApi';

describe('useApi', () => {
    it('fetches high scores for a valid game', async () => {
        const mockJson = vi.fn().mockResolvedValue([{ name: 'Adam', score: 100 }]);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: mockJson,
            ok: true
        }));

        const { result } = renderHook(() => useApi());
        const scores = await result.current.getHighScores({ name: 'Runner' });

        expect(scores).toEqual([{ name: 'Adam', score: 100 }]);
        expect(fetch).toHaveBeenCalledWith(
            'https://api.ae.codes/scores/runner',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('submits high score payload', async () => {
        const mockJson = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: mockJson,
            ok: true
        }));

        const { result } = renderHook(() => useApi());
        await result.current.submitHighScore('Runner', 'Adam', 42);

        expect(fetch).toHaveBeenCalledWith(
            'https://api.ae.codes/scores',
            expect.objectContaining({
                method: 'POST'
            })
        );
    });

    it('validates invalid game input', async () => {
        const { result } = renderHook(() => useApi());
        await expect(result.current.getHighScores(null)).rejects.toThrow('Invalid game parameter');
    });
});
