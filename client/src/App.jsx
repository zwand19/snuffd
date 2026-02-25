import { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { api, setGetToken } from './api';
import Dashboard from './pages/Dashboard';
import WeekDetail from './pages/WeekDetail';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  const [dbUser, setDbUser] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      setGetToken(getAccessTokenSilently);
      api.syncUser({ email: user.email, name: user.name })
        .then(setDbUser)
        .catch(console.error);
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loading-flame" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="navbar">
        <Link to="/" className="nav-logo">
          <span className="logo-fire">🔥</span> SNUFFD
        </Link>
        <div className="nav-links">
          <Link to="/">Dashboard</Link>
          {dbUser?.is_admin ? <Link to="/admin">Admin</Link> : null}
          {isAuthenticated ? (
            <button
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              className="btn btn-sm"
            >
              Logout
            </button>
          ) : (
            <button onClick={() => loginWithRedirect()} className="btn btn-sm btn-primary">
              Login
            </button>
          )}
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard user={dbUser} />} />
          <Route path="/weeks/:id" element={<WeekDetail user={dbUser} />} />
          {dbUser?.is_admin && <Route path="/admin" element={<AdminPanel />} />}
        </Routes>
      </main>
    </div>
  );
}
