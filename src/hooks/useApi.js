export const useApi = () => {
    {/* API URL */ }
    const API_URL = 'https://api.ae.codes';

    {/* Get high scores */ }
    const getHighScores = async (game) => {
        try {
            const response = await fetch(`${API_URL}/scores/${game.name.toLowerCase()}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                }
            });

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
            const response = await fetch(`${API_URL}/scores`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game: game.toLowerCase(),
                    name: name,
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