import { useState } from 'react'
import Name from './components/Name'
import ProfilePicture from './components/ProfilePicture'
import Socials from './components/Socials'
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
        {/* Konami Code */}
        <KonamiCode
          setEasterEggsEnabled={setEasterEggsEnabled}
          showGamesModal={showGamesModal}
          setShowGamesModal={setShowGamesModal}
        />

        {/* My Profile Picture */}
        <ProfilePicture />

        {/* My Name */}
        <Name />

        {/* My Socials */}
        <Socials
          showEasterEggs={easterEggsEnabled}
          setShowGamesModal={setShowGamesModal}
        />
      </div>
    </MusicPlayerProvider>
  )
}

export default App
