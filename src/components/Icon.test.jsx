import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Icon from './Icon';

vi.mock('../hooks/useCdn', () => ({
    useCdn: () => ({
        getUri: (path) => `https://cdn.example.com/${path.replace(/^\//, '')}`
    })
}));

describe('Icon', () => {
    it('renders icon image with CDN URI and alt text', () => {
        render(<Icon name="GitHub" icon="/images/socials/github.svg" />);
        const image = screen.getByRole('img', { name: 'GitHub icon' });

        expect(image).toHaveAttribute('src', 'https://cdn.example.com/images/socials/github.svg');
    });
});
