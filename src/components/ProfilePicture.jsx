import ConfettiExplosion from 'react-confetti-explosion';
import { useState } from "react";
import { useCdn } from '../hooks/useCdn';

// Constants
const EXPLOSION_DURATION = 7000;
const PROFILE_IMAGE_SIZE = 'w-48';
const HOVER_SCALE = 'hover:scale-[1.08]';
const TRANSITION_DURATION = 'transition duration-250';
const HOVER_SHADOW = 'hover:shadow-xl';
const HOVER_CURSOR = 'hover:cursor-pointer';

export default function ProfilePicture() {
    const { getUri } = useCdn();
    const [isExploding, setIsExploding] = useState(false);

    const handleClick = () => {
        setIsExploding(true);
        // Easter egg console message - only in development
        if (import.meta.env.DEV) {
            console.log(`%c
####        ####      #######        ####         ##        ###           ####         ##      #### 
####     ######   ##############    ######      ####       #####         ######      #####    #####
####   ######   ######     ######   ########    ####      #######        ######     ######     ####
#### #####     ######        #####  #########   ####     #########      ########   ########    ####
#########      #####         #####  ########### ####    #### ######     ######### #########    ####
##########     #####         #####  ####  ##########   ####   ######    ### ######### ######   ####
#### #######   ######        #####  ####    ########   ##############  ####  #######  %#####   ####
####   #######  ######      #####   ####     #######  ####      #####  ####   #####    #####   ####
####     ####### ##############     ####       ##### ####        ##### ###     ####    ######  ####
####        #####    #######         ##          ##  ###          #### ###      #       ####   ####
        `, 'color: red;');
        }
    }

    return (
        <div className="relative">
            <img
                className={`mx-auto relative z-20 profile-picture rounded-md ${PROFILE_IMAGE_SIZE} mb-2 ${
                    !isExploding ? `${HOVER_SCALE} ${TRANSITION_DURATION} ${HOVER_SHADOW} ${HOVER_CURSOR}` : ''
                }`}
                src={getUri('images/me-gorillaz.png')}
                alt="Adam Eastwood"
                title="Adam Eastwood (Psst... Inspect me! then click me!)"
                onClick={handleClick}
            />

            <div className="w-full inherit pb-[50%] ml-[50%] absolute top-0 left-0 z-10">
                {isExploding && (
                    <ConfettiExplosion
                        duration={EXPLOSION_DURATION}
                        height="110vh"
                        width={1500}
                        force={0.65}
                        particleSize={10}
                        onComplete={() => setIsExploding(false)}
                    />
                )}
            </div>
        </div>

    )
}


