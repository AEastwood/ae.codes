import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Button from './Button';

vi.mock('./Icon.jsx', () => ({
    default: ({ name }) => <span>{name}</span>
}));

describe('Button', () => {
    const linkedInIcon = {
        icon: '/images/socials/linkedin.svg',
        name: 'LinkedIn',
        url: 'https://linkedin.com/in/test'
    };

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls onClick when Enter key is pressed', () => {
        const onClick = vi.fn();
        render(<Button socialIcon={linkedInIcon} onClick={onClick} />);

        fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('auto-redirect timer is cancelled on mouse leave', () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
        render(<Button socialIcon={linkedInIcon} />);
        const button = screen.getByRole('button');

        fireEvent.mouseEnter(button);
        fireEvent.mouseLeave(button);

        expect(clearTimeoutSpy).toHaveBeenCalled();
    });
});
