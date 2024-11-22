import React, { useState } from 'react';
import Leaderboard from './Leaderboard';

export default function StartScreen({ game }) {
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
        <game.component />
      )}
    </div>
  );
}