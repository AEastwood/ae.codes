export const useApi = () => {
    const API_URL = '';

    {/* Get high scores */ }
    const getHighScores = async (game) => {
        try {
            // const response = await fetch(`${API_URL}/api/leaderboard/${game.name}`);
            const response = await fetch(`https://mocki.io/v1/36dc45d4-6b02-4386-a261-5accd475787e`);

            if (!response.ok) {
                throw new Error(`Failed to get high scores! Status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting high scores:', error);
            throw error;
        }
    };

    {/* Submit high score */ }
    const submitHighScore = async (game, name, score) => {
        try {
            const response = await fetch(`${API_URL}/api/leaderboard`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game: game.name,
                    player: name,
                    score: score,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to submit high score! Status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error submitting high score:', error);
            throw error;
        }
    };

    return {
        submitHighScore,
        getHighScores
    };
}; 