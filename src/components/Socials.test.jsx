import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Socials from './Socials';

vi.mock('./Button', () => ({
    default: ({ socialIcon, onClick }) => (
        <button onClick={onClick} type="button">
            {socialIcon.name}
        </button>
    )
}));

describe('Socials', () => {
    it('renders social links from configuration', () => {
        render(<Socials showEasterEggs={false} setShowGamesModal={vi.fn()} />);
        expect(screen.getByText('GitHub')).toBeInTheDocument();
        expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    });

    it('shows easter egg game button and opens modal callback', () => {
        const setShowGamesModal = vi.fn();
        render(<Socials showEasterEggs={true} setShowGamesModal={setShowGamesModal} />);

        fireEvent.click(screen.getByText('Games'));
        expect(setShowGamesModal).toHaveBeenCalledWith(true);
    });
});
