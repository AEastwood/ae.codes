import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useCdn } from '../../../../hooks/useCdn';
import { useEscapeKey } from '../../../../hooks/useEscapeKey';
import GameOverScreen from '../GameOverScreen';

const FRAME_TIME = 1000 / 60;
const GROUND_LEVEL = 300;

export default function Game({ onExit }) {
    const canvasRef = useRef(null);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const playerSpriteRef = useRef(null);
    const { getUri } = useCdn();
    useEscapeKey(onExit);

    const playerRef = useRef({ x: 50, y: 200, width: 40, height: 40 });
    const obstaclesRef = useRef([]);
    const isJumpingRef = useRef(false);
    const jumpVelocityRef = useRef(0);
    const gameLoopRef = useRef();
    const timeRef = useRef(0);
    const lastTimeRef = useRef(0);

    const resetGame = () => {
        setGameOver(false);
        setScore(0);
        playerRef.current = { x: 50, y: 200, width: 40, height: 40 };
        obstaclesRef.current = [];
        isJumpingRef.current = false;
        jumpVelocityRef.current = 0;
        timeRef.current = 0;
        lastTimeRef.current = 0;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const playerSprite = new Image();
        playerSprite.src = getUri('images/me.jpeg');
        playerSpriteRef.current = playerSprite;

        let active = true;

        const handleJump = () => {
            if (!isJumpingRef.current && playerRef.current.y >= GROUND_LEVEL - playerRef.current.height) {
                isJumpingRef.current = true;
                jumpVelocityRef.current = -15;
            }
        };

        const gameLoop = (timestamp) => {
            if (!active) return;
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const deltaTime = timestamp - lastTimeRef.current;
            timeRef.current += deltaTime;
            lastTimeRef.current = timestamp;

            while (timeRef.current >= FRAME_TIME) {
                if (isJumpingRef.current || playerRef.current.y < GROUND_LEVEL - playerRef.current.height) {
                    playerRef.current.y += jumpVelocityRef.current;
                    jumpVelocityRef.current += 0.8;

                    if (playerRef.current.y >= GROUND_LEVEL - playerRef.current.height) {
                        playerRef.current.y = GROUND_LEVEL - playerRef.current.height;
                        isJumpingRef.current = false;
                        jumpVelocityRef.current = 0;
                    }
                }

                if (Math.random() < 0.02) {
                    obstaclesRef.current.push({
                        x: canvas.width,
                        y: GROUND_LEVEL - 20,
                        width: 20,
                        height: 20,
                        speed: 5
                    });
                }

                obstaclesRef.current = obstaclesRef.current.filter(obstacle => {
                    obstacle.x -= obstacle.speed;

                    if (
                        playerRef.current.x < obstacle.x + obstacle.width &&
                        playerRef.current.x + playerRef.current.width > obstacle.x &&
                        playerRef.current.y < obstacle.y + obstacle.height &&
                        playerRef.current.y + playerRef.current.height > obstacle.y
                    ) {
                        setGameOver(true);
                        return false;
                    }

                    return obstacle.x > -obstacle.width;
                });

                setScore(prev => prev + 1);

                timeRef.current -= FRAME_TIME;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#000';
            ctx.fillRect(0, GROUND_LEVEL, canvas.width, 2);

            if (playerSpriteRef.current?.complete) {
                ctx.drawImage(
                    playerSpriteRef.current,
                    playerRef.current.x,
                    playerRef.current.y,
                    playerRef.current.width,
                    playerRef.current.height
                );
            } else {
                ctx.fillStyle = '#00f';
                ctx.fillRect(
                    playerRef.current.x,
                    playerRef.current.y,
                    playerRef.current.width,
                    playerRef.current.height
                );
            }

            obstaclesRef.current.forEach(obstacle => {
                ctx.fillStyle = '#f00';
                ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            });

            if (!gameOver) {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            }
        };

        gameLoopRef.current = requestAnimationFrame(gameLoop);

        const handleKeyDown = (e) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Space') {
                if (gameOver) {
                    resetGame();
                } else {
                    handleJump();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('click', handleJump);

        return () => {
            active = false;
            window.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('click', handleJump);
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [gameOver, getUri]);

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={750}
                height={400}
                className="bg-white rounded-lg shadow-lg"
            />
            <div className="absolute top-4 right-4 text-black font-mono text-2xl">
                Score: {score}
            </div>
            {gameOver && (
                <GameOverScreen
                    game={{ name: 'Runner' }}
                    score={score}
                    onSubmit={() => {
                        if (gameLoopRef.current) {
                            cancelAnimationFrame(gameLoopRef.current);
                        }
                        resetGame();
                    }}
                />
            )}
        </div>
    );
}

Game.propTypes = {
    onExit: PropTypes.func.isRequired
};
