export const useApi = () => {
    // API URL
    const API_URL = import.meta.env.VITE_API_URL || 'https://api.ae.codes';

    // Get high scores
    const getHighScores = async (game) => {
        // Input validation
        if (!game || !game.name || typeof game.name !== 'string') {
            throw new Error('Invalid game parameter: game.name is required and must be a string');
        }

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

    // Submit high score
    const submitHighScore = async (game, name, score) => {
        // Input validation
        if (!game || typeof game !== 'string') {
            throw new Error('Invalid game parameter: game is required and must be a string');
        }
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new Error('Invalid name parameter: name is required and must be a non-empty string');
        }
        if (!score || typeof score !== 'number' || score < 0) {
            throw new Error('Invalid score parameter: score is required and must be a non-negative number');
        }

        try {
            const response = await fetch(`${API_URL}/scores`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game: game.toLowerCase(),
                    name: name.trim(),
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