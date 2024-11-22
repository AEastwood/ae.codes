import React, { useState } from 'react';
import Game from './Game';
import GameOverScreen from '../GameOverScreen';

function Runner({ playerName }) {
    const [isGameOver, setIsGameOver] = useState(false);
    const [score, setScore] = useState(0);

    const handleGameOver = (finalScore) => {
        setScore(finalScore);
        setIsGameOver(true);
    };

    const handleRestart = () => {
        setIsGameOver(false);
        setScore(0);
    };

    return (
        <div>
            {isGameOver ? (
                <GameOverScreen
                    score={score}
                    playerName={playerName}
                    game="Runner"
                    onRestart={handleRestart}
                />
            ) : (
                <Game onGameOver={handleGameOver} />
            )}
        </div>
    );
}

export default Runner; 