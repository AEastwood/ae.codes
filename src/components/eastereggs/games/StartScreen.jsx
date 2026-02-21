import { useState } from 'react';
import PropTypes from 'prop-types';
import Leaderboard from './Leaderboard';
import GameErrorBoundary from './GameErrorBoundary';

export default function StartScreen({ game, onExit }) {
  const [startedGame, setStartedGame] = useState(false);
  const { name: gameName, instructions } = game;

  {/* Start the game */ }
  const startGame = () => {
    setStartedGame(true);
  }

  return (
    <div>
      {!startedGame ? (
        <div className="flex gap-4 text-black p-8">
          <div className="w-1/2">
            <h2 className="text-2xl font-bold mb-4">{gameName}</h2>
            <div className="mb-6 text-lg">
              {instructions}
            </div>
            <div className="mb-6">
              <h3 className="font-bold mb-2">Controls</h3>
              <ul>
                {game.controls.map((control, index) => (
                  <li key={index}>{control}</li>
                ))}
              </ul>
            </div>

            <button onClick={startGame} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
              Start Game
            </button>
          </div>

          <Leaderboard game={game} />
        </div>
      ) : (
        <GameErrorBoundary>
          <game.component onExit={onExit} />
        </GameErrorBoundary>
      )}
    </div>
  );
}

StartScreen.propTypes = {
  game: PropTypes.shape({
    component: PropTypes.elementType.isRequired,
    controls: PropTypes.arrayOf(PropTypes.string).isRequired,
    instructions: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired
  }).isRequired,
  onExit: PropTypes.func.isRequired
};