import React, { useEffect, useRef, useState } from 'react';
import { useCdn } from '../../../../hooks/useCdn';
import GameOverScreen from '../GameOverScreen';

export default function Game({ onExit }) {
    const canvasRef = useRef(null);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const playerSpriteRef = useRef(null);
    const { getUri } = useCdn();
    
    {/* Game constants */}
    const FPS = 60;
    const FRAME_TIME = 1000 / FPS;
    
    {/* Game state refs */}
    const playerRef = useRef({ x: 50, y: 200, width: 40, height: 40 });
    const obstaclesRef = useRef([]);
    const isJumpingRef = useRef(false);
    const jumpVelocityRef = useRef(0);
    const gameLoopRef = useRef();
    const timeRef = useRef(0);
    const lastTimeRef = useRef(0);
    const groundLevel = 300;

    {/* Reset game state to initial values */}
    const resetGame = () => {
        setGameOver(false);
        setScore(0);
        playerRef.current = { x: 50, y: 200, width: 40, height: 40 };
        obstaclesRef.current = [];
        isJumpingRef.current = false;
        jumpVelocityRef.current = 0;
        timeRef.current = 0;
        lastTimeRef.current = 0;
        
        // Restart game loop
        if (gameLoopRef.current) {
            cancelAnimationFrame(gameLoopRef.current);
            try {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            } catch (e) {}
        }
    };

    {/* Handle player jump action */}
    const handleJump = () => {
        if (!isJumpingRef.current && playerRef.current.y >= groundLevel - playerRef.current.height) {
            isJumpingRef.current = true;
            jumpVelocityRef.current = -15;
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        {/* Load player sprite image */}
        const playerSprite = new Image();
        playerSprite.src = getUri('images/me.webp');
        playerSpriteRef.current = playerSprite;

        {/* Main game loop */}
        const gameLoop = (timestamp) => {
            {/* Calculate delta time for smooth animation */}
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const deltaTime = timestamp - lastTimeRef.current;
            timeRef.current += deltaTime;
            lastTimeRef.current = timestamp;

            {/* Update game state at fixed time intervals */}
            while (timeRef.current >= FRAME_TIME) {
                {/* Update player physics */}
                if (isJumpingRef.current || playerRef.current.y < groundLevel - playerRef.current.height) {
                    playerRef.current.y += jumpVelocityRef.current;
                    jumpVelocityRef.current += 0.8; // Gravity

                    if (playerRef.current.y >= groundLevel - playerRef.current.height) {
                        playerRef.current.y = groundLevel - playerRef.current.height;
                        isJumpingRef.current = false;
                        jumpVelocityRef.current = 0;
                    }
                }

                {/* Generate new obstacles */}
                if (Math.random() < 0.02) {
                    obstaclesRef.current.push({
                        x: canvas.width,
                        y: groundLevel - 20,
                        width: 20,
                        height: 20,
                        speed: 5
                    });
                }

                {/* Update obstacles and check collisions */}
                obstaclesRef.current = obstaclesRef.current.filter(obstacle => {
                    obstacle.x -= obstacle.speed || 5;
                    
                    {/* Check collision with player */}
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

                {/* Update score */}
                setScore(prev => prev + 1);


                timeRef.current -= FRAME_TIME;
            }

            {/* Render game elements */}
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            {/* Draw ground */}
            ctx.fillStyle = '#000';
            ctx.fillRect(0, groundLevel, canvas.width, 2);

            {/* Draw player sprite or fallback rectangle */}
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

            {/* Draw obstacles */}
            obstaclesRef.current.forEach(obstacle => {
                ctx.fillStyle = '#f00';
                ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            });

            if (!gameOver) {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            }
        };

        {/* Start game loop */}
        gameLoopRef.current = requestAnimationFrame(gameLoop);

        {/* Setup event listeners */}
        const handleKeyDown = (e) => {
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

        {/* Cleanup event listeners and game loop */}
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
                height={400}
                className="bg-white rounded-lg shadow-lg"
            />
            
            {/* Score display */}
            <div className="absolute top-4 right-4 text-black font-mono text-2xl">
                Score: {score}
            </div>

            {/* Game over overlay */}
            {gameOver && (
                <GameOverScreen 
                    game='Runner'
                    score={score} 
                    onSubmit={() => {
                        // Ensure game loop is stopped before resetting
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