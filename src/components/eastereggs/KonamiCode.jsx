import React, { useEffect, useState } from "react";
import GamesModal from "../modals/GamesModal";
import MediaPlayer from "./MediaPlayer";

export default function buttonCombination({
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
    }, []);

    return (
        <>
            <MediaPlayer />
            <GamesModal visible={showGamesModal} setShowGamesModal={setShowGamesModal} />
        </>
    );
}