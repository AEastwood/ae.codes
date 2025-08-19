import { useEffect } from "react";
import PropTypes from 'prop-types';
import GamesModal from "../modals/GamesModal";
import MediaPlayer from "./MediaPlayer";

export default function KonamiCode({
    setEasterEggsEnabled,
    setShowGamesModal,
    showGamesModal,
}) {
    useEffect(() => {
        const buttonCombination = [
            "ArrowUp",
            "ArrowUp",
            "ArrowDown",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "ArrowLeft",
            "ArrowRight",
            "KeyB",
            "KeyA"
        ];

        let index = 0;

        const handleKeydown = (event) => {
            if (event.code !== buttonCombination[index]) {
                index = 0;
                return;
            }

            index++;
            setEasterEggsEnabled(index === buttonCombination.length);
        };

        document.addEventListener("keydown", handleKeydown);
        
        return () => {
            document.removeEventListener("keydown", handleKeydown);
        };
    }, [setEasterEggsEnabled]);

    return (
        <>
            <MediaPlayer />
            <GamesModal visible={showGamesModal} setShowGamesModal={setShowGamesModal} />
        </>
    );
}

KonamiCode.propTypes = {
    setEasterEggsEnabled: PropTypes.func.isRequired,
    setShowGamesModal: PropTypes.func.isRequired,
    showGamesModal: PropTypes.bool.isRequired
};