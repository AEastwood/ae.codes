import { useState } from "react";
import PropTypes from 'prop-types';
import Icon from "./Icon.jsx";

export default function Button({ onClick, socialIcon }) {
    const [hoverTimeout, setHoverTimeout] = useState(null);

    // Handle auto-redirect for LinkedIn (accessibility improvement)
    const handleMouseEnter = () => {
        if (socialIcon.name === 'LinkedIn') {
            const timeout = setTimeout(() => {
                window.location.href = socialIcon.url;
            }, 1500);
            setHoverTimeout(timeout);
        }
    };

    const handleMouseLeave = () => {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            setHoverTimeout(null);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (onClick) {
                onClick();
            } else if (socialIcon.name === 'LinkedIn') {
                window.location.href = socialIcon.url;
            }
        }
    };

    return (
        <button
            className="w-8 h-8"
            title={socialIcon.name}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onKeyDown={handleKeyDown}
            type="button"
            onClick={onClick}
        >
            <Icon name={socialIcon.name} icon={socialIcon.icon} />
        </button>
    );
}

Button.propTypes = {
    onClick: PropTypes.func,
    socialIcon: PropTypes.shape({
        name: PropTypes.string.isRequired,
        url: PropTypes.string.isRequired,
        icon: PropTypes.string.isRequired
    }).isRequired
};
