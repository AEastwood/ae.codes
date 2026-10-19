import { useState } from 'react'
import AnimatedBackground from './components/AnimatedBackground'
import Name from './components/Name'
import ProfilePicture from './components/ProfilePicture'
import Socials from './components/Socials'
import GigMode from './components/gig/GigMode'
import KonamiCode from './components/eastereggs/KonamiCode'
import { MusicPlayerProvider } from './context/MusicPlayerContext'

function App() {
  const [easterEggsEnabled, setEasterEggsEnabled] = useState(false);
  const [showGamesModal, setShowGamesModal] = useState(false);

  return (
    <MusicPlayerProvider>
      <div
        className="app flex flex-col gap-6 h-screen text-gray-100 justify-center items-center"
      >
        <AnimatedBackground />

        <KonamiCode
          setEasterEggsEnabled={setEasterEggsEnabled}
          showGamesModal={showGamesModal}
          setShowGamesModal={setShowGamesModal}
        />

        <ProfilePicture />

        {/* Pressing play opens the gig; its "Back to the gig" pill floats under the name so it doesn't push the icons around */}
        <div className="relative flex flex-col items-center">
          <Name />
          <div className="absolute top-[calc(100%-0.85rem)] left-1/2 -translate-x-1/2 z-30">
            <GigMode />
          </div>
        </div>

        <Socials
          showEasterEggs={easterEggsEnabled}
          setShowGamesModal={setShowGamesModal}
        />
      </div>
    </MusicPlayerProvider>
  )
}

export default App
