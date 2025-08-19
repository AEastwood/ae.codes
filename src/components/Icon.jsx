
import PropTypes from 'prop-types';
import { useCdn } from "../hooks/useCdn";

function Icon({ name, icon }) {
    const { getUri } = useCdn();

    return (
        <img
            className="hover:scale-[1.3] transition rounded"
            src={getUri(icon)}
            alt={`${name} icon`}
            title={name}
        />
    )
}

Icon.propTypes = {
    name: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired
};

export default Icon;
