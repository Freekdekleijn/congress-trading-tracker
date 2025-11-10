import { useState } from 'react';
import { HomePage } from './components/HomePage';
import { MemberDetailPage } from './components/MemberDetailPage';

type Screen = 'home' | 'detail';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const handleMemberSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    setCurrentScreen('detail');
  };

  const handleBack = () => {
    setSelectedMemberId(null);
    setCurrentScreen('home');
  };

  return (
    <>
      {currentScreen === 'home' && (
        <HomePage onMemberSelect={handleMemberSelect} />
      )}
      {currentScreen === 'detail' && selectedMemberId && (
        <MemberDetailPage memberId={selectedMemberId} onBack={handleBack} />
      )}
    </>
  );
}

export default App;
