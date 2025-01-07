import React, { useState } from "react";
import Icon from "./Icon.jsx";

export default function Button({ onClick, socialIcon }) {
    const [hoverTimeout, setHoverTimeout] = useState(null);

    // Load easter eggs
    const handleMouseEnter = () => {
        switch (socialIcon.name) {
            case 'LinkedIn':
                const timeout = setTimeout(() => {
                    window.location.href = socialIcon.url;
                }, 1500);

                setHoverTimeout(timeout);
                break;

            default:
                return;
        }

    };

    const handleMouseLeave = () => {
        if (!hoverTimeout) return;

        clearTimeout(hoverTimeout);
        setHoverTimeout(null);
    };

    return (
        <button
            className="w-8 h-8"
            title={socialIcon.name}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            type="button"
            onClick={onClick}
        >
            <Icon name={socialIcon.name} icon={socialIcon.icon} />
        </button>
    );
}
