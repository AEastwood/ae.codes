import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useCdn } from '../../../../hooks/useCdn';
import { useEscapeKey } from '../../../../hooks/useEscapeKey';
import GameOverScreen from '../GameOverScreen';

const FPS = 60;
const FRAME_TIME = 1000 / FPS;
const GRAVITY = 0.4;
const JUMP_FORCE = -8;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const PIPE_SPEED = 3;
const PIPE_SPAWN_RATE = 90;

export default function Game({ onExit }) {
    const canvasRef = useRef(null);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const playerSpriteRef = useRef(null);
    const { getUri } = useCdn();
    useEscapeKey(onExit);

    const playerRef = useRef({ x: 100, y: 200, width: 40, height: 40 });
    const pipesRef = useRef([]);
    const velocityRef = useRef(0);
    const frameCountRef = useRef(0);
    const gameLoopRef = useRef();
    const timeRef = useRef(0);
    const lastTimeRef = useRef(0);

    const resetGame = () => {
        setGameOver(false);
        setScore(0);
        playerRef.current = { x: 100, y: 200, width: 40, height: 40 };
        pipesRef.current = [];
        velocityRef.current = 0;
        frameCountRef.current = 0;
        timeRef.current = 0;
        lastTimeRef.current = 0;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let active = true;

        const playerSprite = new Image();
        playerSprite.src = getUri('images/me.jpeg');
        playerSpriteRef.current = playerSprite;

        const handleJump = () => {
            if (!gameOver) {
                velocityRef.current = JUMP_FORCE;
            }
        };

        const gameLoop = (timestamp) => {
            if (!active) return;

            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const deltaTime = timestamp - lastTimeRef.current;
            timeRef.current += deltaTime;
            lastTimeRef.current = timestamp;

            while (timeRef.current >= FRAME_TIME) {
                velocityRef.current += GRAVITY;
                playerRef.current.y += velocityRef.current;

                frameCountRef.current++;
                if (frameCountRef.current % PIPE_SPAWN_RATE === 0) {
                    const minHeight = 50;
                    const maxHeight = canvas.height - PIPE_GAP - minHeight;
                    const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;
                    pipesRef.current.push({ x: canvas.width, topHeight, passed: false });
                }

                pipesRef.current = pipesRef.current.filter(pipe => {
                    pipe.x -= PIPE_SPEED;

                    if (
                        playerRef.current.x + playerRef.current.width > pipe.x &&
                        playerRef.current.x < pipe.x + PIPE_WIDTH &&
                        (playerRef.current.y < pipe.topHeight ||
                            playerRef.current.y + playerRef.current.height > pipe.topHeight + PIPE_GAP)
                    ) {
                        setGameOver(true);
                    }

                    if (!pipe.passed && playerRef.current.x > pipe.x + PIPE_WIDTH) {
                        pipe.passed = true;
                        setScore(prev => prev + 1);
                    }

                    return pipe.x > -PIPE_WIDTH;
                });

                if (playerRef.current.y < 0 || playerRef.current.y > canvas.height) {
                    setGameOver(true);
                }

                timeRef.current -= FRAME_TIME;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            pipesRef.current.forEach(pipe => {
                ctx.fillStyle = '#75b753';
                ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
                const bottomY = pipe.topHeight + PIPE_GAP;
                ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, canvas.height - bottomY);
            });

            ctx.save();
            ctx.translate(
                playerRef.current.x + playerRef.current.width / 2,
                playerRef.current.y + playerRef.current.height / 2
            );
            ctx.rotate(velocityRef.current * 0.04);

            const sprite = playerSpriteRef.current;
            if (sprite?.complete && sprite.naturalWidth > 0) {
                ctx.drawImage(
                    sprite,
                    -playerRef.current.width / 2,
                    -playerRef.current.height / 2,
                    playerRef.current.width,
                    playerRef.current.height
                );
            } else {
                ctx.fillStyle = '#e8b84b';
                ctx.fillRect(
                    -playerRef.current.width / 2,
                    -playerRef.current.height / 2,
                    playerRef.current.width,
                    playerRef.current.height
                );
            }
            ctx.restore();

            if (!gameOver) {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            }
        };

        gameLoopRef.current = requestAnimationFrame(gameLoop);

        const handleKeyDown = (e) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameOver, getUri]);

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={750}
                height={600}
                className="bg-[#4ec0ca] rounded-lg shadow-lg"
            />
            {/* Score display */}
            <div className="absolute top-4 right-4 text-white font-mono text-2xl">
                {score}
            </div>
            {/* Game over overlay */}
            {gameOver && <GameOverScreen game={{ name: 'Flappy Bird' }} score={score} onSubmit={resetGame} />}
        </div>
    );
}

Game.propTypes = {
    onExit: PropTypes.func.isRequired
};
