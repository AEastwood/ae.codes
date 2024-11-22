import ConfettiExplosion from 'react-confetti-explosion';
import React, { useState } from "react";
import { useCdn } from '../hooks/useCdn';

export default function ProfilePicture() {
    const { getUri } = useCdn();

    const [isExploding, setIsExploding] = useState(false);
    const secondsOfExplosion = 7 * 1000;

    {/* Handle click */}
    const handleClick = () => {
        setIsExploding(true);
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

    return (
        <div className="relative">
            <img
                className={
                    'mx-auto relative z-20 profile-picture rounded-md w-48 mb-2 ' + 
                    (!isExploding ? ' hover:scale-[1.08] transition duration-250 hover:shadow-xl hover:cursor-pointer' : '')
                }
                src={getUri('images/me.webp')}
                alt="Adam Eastwood"
                title="Adam Eastwood (Psst... Inspect me! then click me!)"
                onClick={handleClick}
            />

            <div className="w-full inherit pb-[50%] ml-[50%] absolute top-0 left-0 z-10">
                {isExploding && (
                    <ConfettiExplosion
                        duration={secondsOfExplosion}
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
