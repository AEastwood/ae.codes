import React, { useEffect, useState } from 'react';
import { useApi } from '../../../hooks/useApi';

export default function Leaderboard({ game }) {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getHighScores } = useApi();

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const scores = await getHighScores(game.name);
        setScores(scores);
      } catch (error) {
        console.error('Failed to fetch scores:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchScores();
  }, [game.name, getHighScores]);

  if (loading) {
    return <div className="p-4">Loading scores...</div>;
  }

  return (
    <div className="w-1/2 px-4">
      <h3 className="text-xl font-bold mb-4">Leaderboard</h3>
      <div className="overflow-y-auto max-h-60">
        {scores.length === 0 ? (
          <div>No Scores</div>
        ) : (
          <>
            {scores.map((score, index) => (
              <div className="flex justify-between" key={index}>
                <div>{score.player ?? 'Anonymous'}</div>
                <div>{score.score ?? 0}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}