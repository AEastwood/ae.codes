import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KaraokeLine from './KaraokeLine';

const line = {
    text: 'one two three',
    time: 10,
    end: 13,
    words: [
        { text: 'one', start: 10 },
        { text: 'two', start: 11 },
        { text: 'three', start: 12 }
    ]
};

describe('KaraokeLine', () => {
    it('fills sung words, partially fills the current word and leaves upcoming words empty', () => {
        const { container } = render(<KaraokeLine line={line} getPlaybackTime={() => 11.5} />);
        const words = container.querySelectorAll('.karaoke-word');

        expect(screen.getByLabelText('one two three')).toBeInTheDocument();
        expect(words[0].style.getPropertyValue('--word-progress')).toBe('100%');
        expect(words[1].style.getPropertyValue('--word-progress')).toBe('50%');
        expect(words[2].style.getPropertyValue('--word-progress')).toBe('0%');
    });

    it('falls back to plain text for lines without word timings', () => {
        render(<KaraokeLine line={{ text: 'plain line', time: 0, end: null, words: [] }} />);
        expect(screen.getByText('plain line')).toBeInTheDocument();
    });
});
