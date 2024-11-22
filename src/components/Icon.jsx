import React from "react";
import { useCdn } from "../hooks/useCdn";

function Icon(props) {
    const { getUri } = useCdn();

    return (
        <img
            className="hover:scale-[1.3] transition rounded"
            src={getUri(props.icon)}
            alt={props.name}
        />
    )
}

export default Icon;
