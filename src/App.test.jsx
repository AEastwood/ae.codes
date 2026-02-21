import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./context/MusicPlayerContext', () => ({
    // eslint-disable-next-line react/prop-types
    MusicPlayerProvider: ({ children }) => <>{children}</>
}));

vi.mock('./components/Name', () => ({
    default: () => <div>Name Component</div>
}));

vi.mock('./components/ProfilePicture', () => ({
    default: () => <div>Profile Component</div>
}));

vi.mock('./components/Socials', () => ({
    default: () => <div>Socials Component</div>
}));

vi.mock('./components/eastereggs/KonamiCode', () => ({
    default: () => <div>Konami Component</div>
}));

describe('App', () => {
    it('renders top-level sections', () => {
        render(<App />);

        expect(screen.getByText('Konami Component')).toBeInTheDocument();
        expect(screen.getByText('Profile Component')).toBeInTheDocument();
        expect(screen.getByText('Name Component')).toBeInTheDocument();
        expect(screen.getByText('Socials Component')).toBeInTheDocument();
    });
});
