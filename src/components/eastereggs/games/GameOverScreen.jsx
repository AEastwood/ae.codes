import React, { useEffect, useState } from 'react';
import { useApi } from '../../../hooks/useApi';

export default function GameOverScreen({ game, score, onSubmit }) {
    const [submittable, setSubmittable] = useState(false);
    const [playerName, setPlayerName] = useState('');
    const [showNameInput, setShowNameInput] = useState(false);
    const { submitHighScore } = useApi();

    const handleCancel = () => {
        setPlayerName('');
        setShowNameInput(false);
    };

    {/* Handle submit score */ }
    const handleSubmitScore = () => {
        if (playerName.trim()) {
            console.log(`Submitting score ${score} for player ${playerName}, ${game}`);
            setShowNameInput(false);
            onSubmit();
        }
    };

    {/* Set submittable state */ }
    useEffect(() => {
        setSubmittable(score > 0);
    }, [score]);

    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 rounded-lg">
            <div className="text-white text-center w-full">
                <h2 className="text-4xl font-bold mb-4">Game Over!</h2>
                <p className="text-2xl mb-4">Score: {score}</p>
                {showNameInput ? (
                    <div className="mb-4 w-2/4 mx-auto">
                        <input
                            type="text"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            placeholder="Enter your name"
                            className="px-4 py-2 text-black rounded-lg mb-2 w-full"
                            minLength={3}
                            maxLength={20}
                        />
                        <div className="flex gap-4 mt-2">
                            <button
                                onClick={handleSubmitScore}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed w-1/2"
                                disabled={!playerName.trim() || playerName.length < 3 || playerName.length > 20}
                            >
                                Submit
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 bg-gray-300 text-black rounded-lg hover:bg-gray-600 w-1/2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-4 w-2/4 mx-auto">
                        <button
                            onClick={onSubmit}
                            className={`px-4 py-2 bg-green-500 text-black rounded-lg hover:bg-green-600 ${score > 0 ? 'w-1/2' : 'w-full'}`}
                        >
                            Play Again
                        </button>
                        {score > 0 && (
                            <button
                                onClick={() => setShowNameInput(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-1/2"
                            >
                                Submit Score
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}