import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import GameOverScreen from '../GameOverScreen';

export default function Game({ onExit }) {
    const canvasRef = useRef(null);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);

    // Game constants
    const BLOCK_SIZE = 30;
    const BOARD_WIDTH = 15;
    const BOARD_HEIGHT = 20;

    // Tetromino shapes
    const TETROMINOES = {
        I: [[1, 1, 1, 1]],
        O: [[1, 1], [1, 1]],
        T: [[0, 1, 0], [1, 1, 1]],
        L: [[1, 0], [1, 0], [1, 1]],
        J: [[0, 1], [0, 1], [1, 1]],
        S: [[0, 1, 1], [1, 1, 0]],
        Z: [[1, 1, 0], [0, 1, 1]]
    };

    const COLORS = {
        I: '#00f0f0',
        O: '#f0f000',
        T: '#a000f0',
        L: '#f0a000',
        J: '#0000f0',
        S: '#00f000',
        Z: '#f00000'
    };

    // Game state refs
    const boardRef = useRef(Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0)));
    const currentPieceRef = useRef(null);
    const currentPosRef = useRef({ x: 0, y: 0 });
    const timeRef = useRef(0);
    const lastTimeRef = useRef(0);
    const dropCounterRef = useRef(0);
    const dropIntervalRef = useRef(1000);
    const gameLoopRef = useRef();
    const nextPieceRef = useRef(null);
    const nextPieceCanvasRef = useRef(null);

    // Generate new tetromino piece
    const generatePiece = () => {
        if (nextPieceRef.current) {
            currentPieceRef.current = nextPieceRef.current;
        } else {
            const pieces = Object.keys(TETROMINOES);
            const piece = pieces[Math.floor(Math.random() * pieces.length)];
            currentPieceRef.current = {
                shape: TETROMINOES[piece],
                color: COLORS[piece]
            };
        }

        // Generate next piece
        const pieces = Object.keys(TETROMINOES);
        const piece = pieces[Math.floor(Math.random() * pieces.length)];
        nextPieceRef.current = {
            shape: TETROMINOES[piece],
            color: COLORS[piece]
        };

        currentPosRef.current = {
            x: Math.floor(BOARD_WIDTH / 2) - Math.floor(currentPieceRef.current.shape[0].length / 2),
            y: 0
        };

        // Check for game over
        if (!isValidMove(0, 0)) {
            setGameOver(true);
        }
    };

    // Check if move is valid
    const isValidMove = (offsetX, offsetY) => {
        const piece = currentPieceRef.current.shape;
        for (let y = 0; y < piece.length; y++) {
            for (let x = 0; x < piece[y].length; x++) {
                if (piece[y][x]) {
                    const newX = x + currentPosRef.current.x + offsetX;
                    const newY = y + currentPosRef.current.y + offsetY;

                    if (
                        newX < 0 ||
                        newX >= BOARD_WIDTH ||
                        newY >= BOARD_HEIGHT ||
                        (newY >= 0 && boardRef.current[newY][newX])
                    ) {
                        return false;
                    }
                }
            }
        }
        return true;
    };

    // Merge piece with board
    const mergePiece = () => {
        const piece = currentPieceRef.current.shape;
        for (let y = 0; y < piece.length; y++) {
            for (let x = 0; x < piece[y].length; x++) {
                if (piece[y][x]) {
                    const boardY = y + currentPosRef.current.y;
                    if (boardY >= 0) {
                        boardRef.current[boardY][x + currentPosRef.current.x] = currentPieceRef.current.color;
                    }
                }
            }
        }
    };

    // Clear completed lines
    const clearLines = () => {
        let linesCleared = 0;

        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (boardRef.current[y].every(cell => cell !== 0)) {
                boardRef.current.splice(y, 1);
                boardRef.current.unshift(Array(BOARD_WIDTH).fill(0));
                linesCleared++;
                y++;
            }
        }

        if (linesCleared > 0) {
            setScore((prev) => {
                const nextScore = prev + (linesCleared * 100);
                dropIntervalRef.current = Math.max(100, 1000 - (nextScore * 2));
                return nextScore;
            });
        }
    };

    // Rotate piece
    const rotatePiece = () => {
        const piece = currentPieceRef.current.shape;
        const newPiece = piece[0].map((_, i) =>
            piece.map(row => row[i]).reverse()
        );

        const prevPiece = currentPieceRef.current.shape;
        currentPieceRef.current.shape = newPiece;

        if (!isValidMove(0, 0)) {
            currentPieceRef.current.shape = prevPiece;
        }
    };

    // Reset game state
    const resetGame = () => {
        boardRef.current = Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
        setGameOver(false);
        setScore(0);
        dropIntervalRef.current = 1000;
        nextPieceRef.current = null;
        generatePiece();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Generate first piece
        generatePiece();

        // Main game loop
        const gameLoop = (timestamp) => {
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const deltaTime = timestamp - lastTimeRef.current;
            timeRef.current += deltaTime;
            dropCounterRef.current += deltaTime;
            lastTimeRef.current = timestamp;

            // Handle piece dropping
            if (dropCounterRef.current > dropIntervalRef.current) {
                if (isValidMove(0, 1)) {
                    currentPosRef.current.y++;
                } else {
                    mergePiece();
                    clearLines();
                    generatePiece();
                }
                dropCounterRef.current = 0;
            }

            // Render game
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw board
            boardRef.current.forEach((row, y) => {
                row.forEach((cell, x) => {
                    if (cell) {
                        ctx.fillStyle = cell;
                        ctx.fillRect(
                            x * BLOCK_SIZE,
                            y * BLOCK_SIZE,
                            BLOCK_SIZE - 1,
                            BLOCK_SIZE - 1
                        );
                    }
                });
            });

            // Draw current piece
            if (currentPieceRef.current) {
                ctx.fillStyle = currentPieceRef.current.color;
                currentPieceRef.current.shape.forEach((row, y) => {
                    row.forEach((cell, x) => {
                        if (cell) {
                            ctx.fillRect(
                                (x + currentPosRef.current.x) * BLOCK_SIZE,
                                (y + currentPosRef.current.y) * BLOCK_SIZE,
                                BLOCK_SIZE - 1,
                                BLOCK_SIZE - 1
                            );
                        }
                    });
                });
            }

            // Draw next piece preview
            const nextCanvas = nextPieceCanvasRef.current;
            const nextCtx = nextCanvas?.getContext('2d');
            if (nextCtx && nextPieceRef.current) {
                nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
                nextCtx.fillStyle = nextPieceRef.current.color;

                const offsetX = (4 - nextPieceRef.current.shape[0].length) / 2;
                const offsetY = (4 - nextPieceRef.current.shape.length) / 2;

                nextPieceRef.current.shape.forEach((row, y) => {
                    row.forEach((cell, x) => {
                        if (cell) {
                            nextCtx.fillRect(
                                (x + offsetX) * BLOCK_SIZE,
                                (y + offsetY) * BLOCK_SIZE,
                                BLOCK_SIZE - 1,
                                BLOCK_SIZE - 1
                            );
                        }
                    });
                });
            }

            if (!gameOver) {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            }
        };

        // Start game loop
        gameLoopRef.current = requestAnimationFrame(gameLoop);

        // Setup event listeners
        const handleKeyDown = (e) => {
            if (gameOver) return;

            switch (e.code) {
                case 'ArrowLeft':
                    if (isValidMove(-1, 0)) currentPosRef.current.x--;
                    break;
                case 'ArrowRight':
                    if (isValidMove(1, 0)) currentPosRef.current.x++;
                    break;
                case 'ArrowDown':
                    if (isValidMove(0, 1)) currentPosRef.current.y++;
                    break;
                case 'ArrowUp':
                    rotatePiece();
                    break;
                case 'Space':
                    if (gameOver) {
                        resetGame();
                    }
                    break;
                case 'Escape':
                    onExit();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    // This effect intentionally controls the imperative game loop lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameOver, onExit]);

    return (
        <div className="relative flex gap-4 flex justify-center items-start bg-zinc-900 rounded-lg">
            <canvas
                ref={canvasRef}
                width={BLOCK_SIZE * BOARD_WIDTH}
                height={BLOCK_SIZE * BOARD_HEIGHT}
                className="bg-gray-800 shadow-lg"
            />

            <div className="flex flex-col gap-4">
                <div className="bg-gray-800 p-4 shadow-lg text-center">
                    <div className="text-white font-mono mb-2">SCORE</div>
                    <div className="text-white font-mono text-2xl">{score}</div>
                </div>

                <div className="bg-gray-800 p-4 shadow-lg text-center">
                    <div className="text-white font-mono mb-2">NEXT</div>
                    <canvas ref={nextPieceCanvasRef} width={BLOCK_SIZE * 4} height={BLOCK_SIZE * 4} />
                </div>
            </div>
            {gameOver && <GameOverScreen game='Tetris' score={score} onSubmit={resetGame} />}
        </div>
    );
}

Game.propTypes = {
    onExit: PropTypes.func.isRequired
};