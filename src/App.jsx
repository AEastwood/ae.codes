import React, { useState } from 'react'
import Name from './components/Name'
import ProfilePicture from './components/ProfilePicture'
import Socials from './components/Socials'
import KonamiCode from './components/eastereggs/KonamiCode'

function App() {
  const [easterEggsEnabled, setEasterEggsEnabled] = useState(true);
  const [showGamesModal, setShowGamesModal] = useState(false);
  const [showLeaderboardsModal, setShowLeaderboardsModal] = useState(false);

  return (
    <div
      className="flex flex-col gap-6 h-screen bg-gradient-to-br bg-gradient-to-tr from-indigo-500 to-blue-500 text-gray-100 justify-center items-center"
    >
      {/* Konami Code */}
      <KonamiCode
        setEasterEggsEnabled={setEasterEggsEnabled}
        showGamesModal={showGamesModal}
        setShowGamesModal={setShowGamesModal}
        showLeaderboardsModal={showLeaderboardsModal}
        setShowLeaderboardsModal={setShowLeaderboardsModal}
      />

      {/* My Profile Picture */}
      <ProfilePicture />

      {/* My Name */}
      <Name />

      {/* My Socials */}
      <Socials
        showEasterEggs={easterEggsEnabled}
        setShowGamesModal={setShowGamesModal}
        setShowLeaderboardsModal={setShowLeaderboardsModal}
      />
    </div>
  )
}

export default App
