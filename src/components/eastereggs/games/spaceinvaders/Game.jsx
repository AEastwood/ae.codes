import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import GameOverScreen from '../GameOverScreen';
import { useEscapeKey } from '../../../../hooks/useEscapeKey';

const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 600;
const PLAYER_WIDTH = 56;
const PLAYER_HEIGHT = 18;
const PLAYER_SPEED = 7;
const BULLET_SPEED = 9;
const ENEMY_BULLET_SPEED = 5;
const ENEMY_WIDTH = 34;
const ENEMY_HEIGHT = 22;
const ENEMY_ROWS = 4;
const ENEMY_COLS = 8;
const ENEMY_X_GAP = 16;
const ENEMY_Y_GAP = 18;
const ENEMY_START_X = 70;
const ENEMY_START_Y = 60;
const ENEMY_STEP_DOWN = 18;
const ENEMY_BASE_SPEED = 1.2;
const SHOOT_COOLDOWN_MS = 180;
const ENEMY_SHOOT_INTERVAL_MS = 650;

function createEnemyFormation() {
    const enemies = [];

    for (let row = 0; row < ENEMY_ROWS; row++) {
        for (let col = 0; col < ENEMY_COLS; col++) {
            enemies.push({
                x: ENEMY_START_X + col * (ENEMY_WIDTH + ENEMY_X_GAP),
                y: ENEMY_START_Y + row * (ENEMY_HEIGHT + ENEMY_Y_GAP),
                alive: true
            });
        }
    }

    return enemies;
}

function intersects(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

export default function Game({ onExit }) {
    const canvasRef = useRef(null);
    const gameLoopRef = useRef(null);
    const keysRef = useRef({ left: false, right: false, shoot: false });
    const lastShotAtRef = useRef(0);
    const lastEnemyShotAtRef = useRef(0);
    const scoreRef = useRef(0);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    useEscapeKey(onExit);

    const playerRef = useRef({
        x: (CANVAS_WIDTH - PLAYER_WIDTH) / 2,
        y: CANVAS_HEIGHT - 48,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT
    });
    const playerBulletsRef = useRef([]);
    const enemyBulletsRef = useRef([]);
    const enemiesRef = useRef(createEnemyFormation());
    const enemyDirectionRef = useRef(1);
    const enemySpeedRef = useRef(ENEMY_BASE_SPEED);

    const resetGame = () => {
        playerRef.current = {
            x: (CANVAS_WIDTH - PLAYER_WIDTH) / 2,
            y: CANVAS_HEIGHT - 48,
            width: PLAYER_WIDTH,
            height: PLAYER_HEIGHT
        };
        playerBulletsRef.current = [];
        enemyBulletsRef.current = [];
        enemiesRef.current = createEnemyFormation();
        enemyDirectionRef.current = 1;
        enemySpeedRef.current = ENEMY_BASE_SPEED;
        scoreRef.current = 0;
        lastShotAtRef.current = 0;
        lastEnemyShotAtRef.current = 0;
        setScore(0);
        setGameOver(false);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const shootPlayerBullet = () => {
            const now = performance.now();
            if (now - lastShotAtRef.current < SHOOT_COOLDOWN_MS) return;

            lastShotAtRef.current = now;
            playerBulletsRef.current.push({
                x: playerRef.current.x + playerRef.current.width / 2 - 2,
                y: playerRef.current.y - 10,
                width: 4,
                height: 10
            });
        };

        const updatePlayer = () => {
            if (keysRef.current.left) {
                playerRef.current.x = Math.max(0, playerRef.current.x - PLAYER_SPEED);
            }
            if (keysRef.current.right) {
                playerRef.current.x = Math.min(
                    CANVAS_WIDTH - playerRef.current.width,
                    playerRef.current.x + PLAYER_SPEED
                );
            }
            if (keysRef.current.shoot) {
                shootPlayerBullet();
            }
        };

        const updateBullets = () => {
            playerBulletsRef.current = playerBulletsRef.current
                .map((bullet) => ({ ...bullet, y: bullet.y - BULLET_SPEED }))
                .filter((bullet) => bullet.y + bullet.height > 0);

            enemyBulletsRef.current = enemyBulletsRef.current
                .map((bullet) => ({ ...bullet, y: bullet.y + ENEMY_BULLET_SPEED }))
                .filter((bullet) => bullet.y < CANVAS_HEIGHT);
        };

        const updateEnemies = () => {
            const aliveEnemies = enemiesRef.current.filter((enemy) => enemy.alive);
            if (aliveEnemies.length === 0) {
                enemiesRef.current = createEnemyFormation();
                enemySpeedRef.current = Math.min(enemySpeedRef.current + 0.22, 4);
                enemyDirectionRef.current = 1;
                return;
            }

            let minX = Infinity;
            let maxX = -Infinity;
            aliveEnemies.forEach((enemy) => {
                minX = Math.min(minX, enemy.x);
                maxX = Math.max(maxX, enemy.x + ENEMY_WIDTH);
            });

            const hitsRight = maxX >= CANVAS_WIDTH - 8 && enemyDirectionRef.current > 0;
            const hitsLeft = minX <= 8 && enemyDirectionRef.current < 0;

            if (hitsRight || hitsLeft) {
                enemyDirectionRef.current *= -1;
                enemiesRef.current = enemiesRef.current.map((enemy) =>
                    enemy.alive ? { ...enemy, y: enemy.y + ENEMY_STEP_DOWN } : enemy
                );
            } else {
                enemiesRef.current = enemiesRef.current.map((enemy) =>
                    enemy.alive
                        ? { ...enemy, x: enemy.x + enemyDirectionRef.current * enemySpeedRef.current }
                        : enemy
                );
            }
        };

        const maybeShootEnemyBullet = () => {
            const now = performance.now();
            if (now - lastEnemyShotAtRef.current < ENEMY_SHOOT_INTERVAL_MS) return;

            const aliveEnemies = enemiesRef.current.filter((enemy) => enemy.alive);
            if (aliveEnemies.length === 0) return;

            const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            enemyBulletsRef.current.push({
                x: shooter.x + ENEMY_WIDTH / 2 - 2,
                y: shooter.y + ENEMY_HEIGHT,
                width: 4,
                height: 10
            });
            lastEnemyShotAtRef.current = now;
        };

        const handleCollisions = () => {
            const playerBox = playerRef.current;

            enemyBulletsRef.current = enemyBulletsRef.current.filter((bullet) => {
                if (intersects(bullet, playerBox)) {
                    setGameOver(true);
                    return false;
                }
                return true;
            });

            if (gameOver) return;

            playerBulletsRef.current = playerBulletsRef.current.filter((bullet) => {
                const enemyIndex = enemiesRef.current.findIndex(
                    (enemy) => enemy.alive && intersects(bullet, { ...enemy, width: ENEMY_WIDTH, height: ENEMY_HEIGHT })
                );

                if (enemyIndex >= 0) {
                    enemiesRef.current[enemyIndex] = { ...enemiesRef.current[enemyIndex], alive: false };
                    scoreRef.current += 10;
                    setScore(scoreRef.current);
                    return false;
                }
                return true;
            });

            const invaderReachedBottom = enemiesRef.current.some(
                (enemy) => enemy.alive && enemy.y + ENEMY_HEIGHT >= playerRef.current.y
            );
            if (invaderReachedBottom) {
                setGameOver(true);
            }
        };

        const render = () => {
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.fillStyle = '#0a1025';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.fillStyle = '#39ff14';
            ctx.fillRect(
                playerRef.current.x,
                playerRef.current.y,
                playerRef.current.width,
                playerRef.current.height
            );

            ctx.fillStyle = '#76ffea';
            playerBulletsRef.current.forEach((bullet) => {
                ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
            });

            ctx.fillStyle = '#ff6b6b';
            enemyBulletsRef.current.forEach((bullet) => {
                ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
            });

            enemiesRef.current.forEach((enemy) => {
                if (!enemy.alive) return;
                ctx.fillStyle = '#ffe66d';
                ctx.fillRect(enemy.x, enemy.y, ENEMY_WIDTH, ENEMY_HEIGHT);
                ctx.fillStyle = '#0a1025';
                ctx.fillRect(enemy.x + 7, enemy.y + 6, 6, 6);
                ctx.fillRect(enemy.x + ENEMY_WIDTH - 13, enemy.y + 6, 6, 6);
            });
        };

        const gameLoop = () => {
            if (!gameOver) {
                updatePlayer();
                updateBullets();
                updateEnemies();
                maybeShootEnemyBullet();
                handleCollisions();
            }

            render();

            if (!gameOver) {
                gameLoopRef.current = requestAnimationFrame(gameLoop);
            }
        };

        gameLoopRef.current = requestAnimationFrame(gameLoop);

        const handleKeyDown = (event) => {
            if (event.code === 'ArrowLeft') keysRef.current.left = true;
            if (event.code === 'ArrowRight') keysRef.current.right = true;
            if (event.code === 'Space') {
                event.preventDefault();
                keysRef.current.shoot = true;
            }
        };

        const handleKeyUp = (event) => {
            if (event.code === 'ArrowLeft') keysRef.current.left = false;
            if (event.code === 'ArrowRight') keysRef.current.right = false;
            if (event.code === 'Space') keysRef.current.shoot = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [gameOver]);

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="bg-[#0a1025] rounded-lg shadow-lg"
            />
            <div className="absolute top-4 right-4 text-white font-mono text-2xl">
                {score}
            </div>
            {gameOver && <GameOverScreen game={{ name: 'Space Invaders' }} score={score} onSubmit={resetGame} />}
        </div>
    );
}

Game.propTypes = {
    onExit: PropTypes.func.isRequired
};
