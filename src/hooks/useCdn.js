const CDN_BASE = import.meta.env.VITE_CDN_BASE || 'https://cdn.esg.sh/ae-codes';

export function useCdn() {
    const getUri = (path) => {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        return `${CDN_BASE}/${cleanPath}`;
    };

    return { getUri };
}