import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KonamiCode from './KonamiCode';

vi.mock('../modals/GamesModal', () => ({
    default: ({ visible }) => <div>{visible ? 'Modal Open' : 'Modal Closed'}</div>
}));

describe('KonamiCode', () => {
    it('enables easter eggs after full key sequence', () => {
        const setEasterEggsEnabled = vi.fn();

        render(
            <KonamiCode
                setEasterEggsEnabled={setEasterEggsEnabled}
                setShowGamesModal={vi.fn()}
                showGamesModal={false}
            />
        );

        const sequence = [
            'ArrowUp',
            'ArrowUp',
            'ArrowDown',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'ArrowLeft',
            'ArrowRight',
            'KeyB',
            'KeyA'
        ];

        sequence.forEach((code) => {
            fireEvent.keyDown(document, { code });
        });

        expect(setEasterEggsEnabled).toHaveBeenLastCalledWith(true);
    });
});
