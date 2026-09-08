import { useState } from 'react';
import Login from './pages/Login';
import Board from './pages/Board';
import { StaffNotesBanner } from '@la-piazzetta/shared-components';
import { isLoggedIn } from '@la-piazzetta/api-client';

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
