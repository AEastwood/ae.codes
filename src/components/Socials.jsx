import React, { useState, useEffect } from 'react';
import socials from '../data/socials';
import Button from './Button';

function Socials({ showEasterEggs, setShowGamesModal, setShowLeaderboardsModal }) {
    const easterEggs = socials?.easterEggs;
    const icons = socials?.links;

    return (
        <div className="flex gap-8">
            {socials && icons.map((link) => {
                return (
                    <a key={link.name} href={link.url} target="_blank" rel="noreferrer">
                        <Button key={link.name} socialIcon={link} />
                    </a>
                );
            })}

            {/* Easter Eggs */}
            {easterEggs && showEasterEggs && (
                <div className="flex gap-8">
                    <Button key={easterEggs.games.name} socialIcon={easterEggs.games} onClick={() => setShowGamesModal(true)} />
                </div>
            )}
        </div>
    );
}

export default Socials; 