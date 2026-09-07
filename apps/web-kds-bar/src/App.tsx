import { useState } from 'react';
import Login from './pages/Login';
import Board from './pages/Board';
import { StaffNotesBanner } from './components/StaffNotesBanner';
import { isLoggedIn } from './lib/client';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;
  return (
    <>
      <StaffNotesBanner />
      <Board />
    </>
  );
}
