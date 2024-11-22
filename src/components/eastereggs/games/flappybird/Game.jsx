import React, { useEffect, useRef, useState } from 'react';
import { useCdn } from '../../../../hooks/useCdn';
import GameOverScreen from '../GameOverScreen';

export default function Game({ onExit }) {
    const canvasRef = useRef(null);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const playerSpriteRef = useRef(null);
    const { getUri } = useCdn();

    {/* Game constants */ }
    const FPS = 60;
    const FRAME_TIME = 1000 / FPS;
    const GRAVITY = 0.4;
    const JUMP_FORCE = -8;
    const PIPE_WIDTH = 60;
    const PIPE_GAP = 150;
    const PIPE_SPEED = 3;
    const PIPE_SPAWN_RATE = 90;

    {/* Game state refs */ }
    const playerRef = useRef({ x: 100, y: 200, width: 40, height: 40 });
    const pipesRef = useRef([]);
    const velocityRef = useRef(0);
    const frameCountRef = useRef(0);
    const gameLoopRef = useRef();
    const timeRef = useRef(0);
    const lastTimeRef = useRef(0);

    {/* Reset game state to initial values */ }
    const resetGame = () => {
        setGameOver(false);
        setScore(0);
        playerRef.current = { x: 100, y: 200, width: 40, height: 40 };
        pipesRef.current = [];
        velocityRef.current = 0;
        frameCountRef.current = 0;
    };

    {/* Handle player jump action */ }
    const handleJump = () => {
        if (!gameOver) {
            velocityRef.current = JUMP_FORCE;
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        {/* Load player sprite image */ }
        const playerSprite = new Image();
        playerSprite.src = getUri('images/me.webp');
        playerSpriteRef.current = playerSprite;

        {/* Main game loop */ }
        const gameLoop = (timestamp) => {
            {/* Calculate delta time for smooth animation */ }
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const deltaTime = timestamp - lastTimeRef.current;
            timeRef.current += deltaTime;
            lastTimeRef.current = timestamp;

            {/* Update game state at fixed time intervals */ }
            while (timeRef.current >= FRAME_TIME) {
                {/* Update player physics */ }
                velocityRef.current += GRAVITY;
                playerRef.current.y += velocityRef.current;

                {/* Generate new pipes */ }
                frameCountRef.current++;
                if (frameCountRef.current % PIPE_SPAWN_RATE === 0) {
                    const minHeight = 50;
                    const maxHeight = canvas.height - PIPE_GAP - minHeight;
                    const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;

                    pipesRef.current.push({
                        x: canvas.width,
                        topHeight,
                        passed: false
                    });
                }

                {/* Update and check pipe collisions */ }
                pipesRef.current = pipesRef.current.filter(pipe => {
                    pipe.x -= PIPE_SPEED;

                    {/* Check collision with pipes */ }
                    if (
                        playerRef.current.x + playerRef.current.width > pipe.x &&
                        playerRef.current.x < pipe.x + PIPE_WIDTH &&
                        (playerRef.current.y < pipe.topHeight ||
                            playerRef.current.y + playerRef.current.height > pipe.topHeight + PIPE_GAP)
                    ) {
                        setGameOver(true);
                    }

                    {/* Update score when passing pipe */ }
                    if (!pipe.passed && playerRef.current.x > pipe.x + PIPE_WIDTH) {
                        pipe.passed = true;
                        setScore(prev => prev + 1);
                    }

                    return pipe.x > -PIPE_WIDTH;
                });

                {/* Check if player hits canvas boundaries */ }
                if (playerRef.current.y < 0 || playerRef.current.y > canvas.height) {
                    setGameOver(true);
                }

                timeRef.current -= FRAME_TIME;
            }

            {/* Render game elements */ }
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            {/* Draw pipes */ }
            pipesRef.current.forEach(pipe => {
                ctx.fillStyle = '#75b753';
                ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
                const bottomY = pipe.topHeight + PIPE_GAP;
                ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, canvas.height - bottomY);
            });

            {/* Draw player with rotation based on velocity */ }
            ctx.save();
            ctx.translate(
                playerRef.current.x + playerRef.current.width / 2,
                playerRef.current.y + playerRef.current.height / 2
            );
            ctx.rotate(velocityRef.current * 0.04);

            if (playerSpriteRef.current?.complete) {
                ctx.drawImage(
                    playerSpriteRef.current,
                    -playerRef.current.width / 2,
                    -playerRef.current.height / 2,
                    playerRef.current.width,
                    playerRef.current.height
                );
            } else {
                ctx.fillStyle = '#00f';
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

        {/* Start game loop */ }
        gameLoopRef.current = requestAnimationFrame(gameLoop);

        {/* Setup event listeners */ }
        const handleKeyDown = (e) => {
            if (gameOver) return;
            
            if (e.code === 'Space') {
                if (gameOver) {
                    resetGame();
                } else {
                    handleJump();
                }
            }
            if (e.code === 'Escape') {
                onExit();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('click', handleJump);

        {/* Cleanup event listeners and game loop */ }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('click', handleJump);
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [gameOver, onExit]);

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
            {gameOver && <GameOverScreen game='Flappy Bird' score={score} onSubmit={resetGame} />}
        </div>
    );
}