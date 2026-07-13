import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import { AuthProvider, useAuth } from './AuthContext';
import SignIn from './SignIn';

function Hello() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <div className="Hello">
        <img width="200" alt="icon" src={icon} />
      </div>
      <h1>Corsa Race Timer</h1>
      {user && (
        <div className="Hello">
          <p>Signed in as {user.email}</p>
          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
