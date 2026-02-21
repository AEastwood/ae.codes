import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useGamesList } from '../../hooks/useGamesList';
import StartScreen from '../eastereggs/games/StartScreen';
import Modal from './Modal';

export default function GamesModal({ setShowGamesModal, visible }) {
    const [game, setGame] = useState(null);
    const games = useGamesList();

    useEffect(() => {
        setGame(null);
    }, [setShowGamesModal, visible]);

    // Close game
    const closeGame = () => {
        setGame(null);
    };

    // Close modal
    const closeModal = () => {
        setShowGamesModal(false);
    };

    return (
        <Modal visible={visible} onClose={game ? closeGame : closeModal} title="Games">
            {!game ? (
                <>
                    <div className="md:hidden p-8 text-center text-black">
                        <h2 className="text-xl font-bold mb-4">Screen Too Small</h2>
                        <p className="mb-4">Please use a larger screen to play</p>
                        <button
                            onClick={closeModal}
                            className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200"
                            aria-label="Close games modal"
                            type="button"
                        >
                            Close
                        </button>
                    </div>

                    <div className="hidden md:flex flex-wrap gap-4 justify-center p-8">
                        {games.map((game) => (
                            <button
                                key={game.name}
                                onClick={() => setGame(game)}
                                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                                aria-label={`Play ${game.name}`}
                                type="button"
                            >
                                {game.name}
                            </button>
                        ))}
                    </div>
                </>


            ) : (
                <StartScreen game={game} onExit={closeGame} />
            )}
        </Modal>
    );
}

GamesModal.propTypes = {
    setShowGamesModal: PropTypes.func.isRequired,
    visible: PropTypes.bool.isRequired
};