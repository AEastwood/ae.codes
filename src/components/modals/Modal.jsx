import { useEffect } from 'react';
import PropTypes from 'prop-types';

function Modal({ children, onClose, visible }) {

    // Add Close Modal on Escape Key Event Listener
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    if (!visible) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div className="fixed inset-0 bg-black bg-opacity-75 transition-opacity" />

            <div className="relative z-50 w-full md:w-[750px] bg-white border border-gray-100 shadow-xl rounded-lg shadow-xl">
                <div className="absolute -top-8 left-0 right-0 flex w-full justify-between">
                    <div id="modal-title" className="text-xl select-none">Games</div>

                    <button
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {children}
            </div>
        </div>
    );
}

Modal.propTypes = {
    children: PropTypes.node.isRequired,
    onClose: PropTypes.func.isRequired,
    visible: PropTypes.bool.isRequired
};

export default Modal; 