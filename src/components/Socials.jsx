import PropTypes from 'prop-types';
import socials from '../data/socials';
import Button from './Button';

function Socials({ showEasterEggs, setShowGamesModal }) {
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

Socials.propTypes = {
    showEasterEggs: PropTypes.bool.isRequired,
    setShowGamesModal: PropTypes.func.isRequired
};

export default Socials; 