import PropTypes from 'prop-types';

export default function MediaPlayer({ visible = false }) {
    if (!visible) return null;

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#181818] rounded-xl px-4 py-3 flex items-center gap-4 text-white shadow-xl">
            <div className="w-12 h-12 bg-[#282828] rounded-lg flex-shrink-0 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#b3b3b3]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
            </div>
            <div className="min-w-[180px]">
                <div className="font-medium text-sm text-[#fff]">Feel Good Inc.</div>
            </div>
        </div>
    );
}

MediaPlayer.propTypes = {
    visible: PropTypes.bool
};