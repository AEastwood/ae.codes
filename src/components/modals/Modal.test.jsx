import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
    it('renders children only when visible', () => {
        const { rerender } = render(
            <Modal visible={false} onClose={vi.fn()}>
                <div>Modal Body</div>
            </Modal>
        );
        expect(screen.queryByText('Modal Body')).not.toBeInTheDocument();

        rerender(
            <Modal visible={true} onClose={vi.fn()}>
                <div>Modal Body</div>
            </Modal>
        );
        expect(screen.getByText('Modal Body')).toBeInTheDocument();
    });

    it('calls onClose when escape is pressed', () => {
        const onClose = vi.fn();
        render(
            <Modal visible={true} onClose={onClose}>
                <div>Modal Body</div>
            </Modal>
        );

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
