import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCdn } from './useCdn';

describe('useCdn', () => {
    it('normalizes leading slash and returns CDN URI', () => {
        const { result } = renderHook(() => useCdn());

        expect(result.current.getUri('/images/icon.svg')).toBe('https://cdn.esg.sh/ae-codes/images/icon.svg');
        expect(result.current.getUri('images/icon.svg')).toBe('https://cdn.esg.sh/ae-codes/images/icon.svg');
    });
});
