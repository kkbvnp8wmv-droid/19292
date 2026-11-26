import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/auth';
import { Shell } from './components/Shell';
import { LogoMark } from './components/Logo';
import AuthPage from './pages/Auth';
import Lobby from './pages/Lobby';
import Tables from './pages/Tables';
import TablePage from './pages/TablePage';
import Rooms from './pages/Rooms';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import Clubs from './pages/Clubs';
import ClubDetail from './pages/ClubDetail';
import Friends from './pages/Friends';
import Leaderboard from './pages/Leaderboard';
import Missions from './pages/Missions';
import Profile from './pages/Profile';
import PlayerProfile from './pages/PlayerProfile';
import SettingsPage from './pages/Settings';

function Splash() {
  return (
    <div className="splash">
      <LogoMark size={64} />
      <div className="splash-name">POKER CLUB</div>
      <div className="spinner" style={{ marginTop: 18 }} />
    </div>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function AuthGate() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthGate />} />
      <Route
        path="/table/:id"
        element={
          <Guard>
            <TablePage />
          </Guard>
        }
      />
      <Route
        element={
          <Guard>
            <Shell />
          </Guard>
        }
      >
        <Route index element={<Lobby />} />
        <Route path="/tables" element={<Tables />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/clubs" element={<Clubs />} />
        <Route path="/clubs/:id" element={<ClubDetail />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/missions" element={<Missions />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
