import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { api, setGetToken, setOnAuthError } from './api';
import Dashboard from './pages/Dashboard';
import WeekDetail from './pages/WeekDetail';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  const [dbUser, setDbUser] = useState(null);
  const [appError, setAppError] = useState(null);

  const handleAuthError = useCallback(() => {
    setAppError('session_expired');
  }, []);

  useEffect(() => {
    setOnAuthError(handleAuthError);
  }, [handleAuthError]);

  useEffect(() => {
    if (isAuthenticated) {
      setGetToken(getAccessTokenSilently);
      setAppError(null);
      api.syncUser({ email: user.email, name: user.name })
        .then(setDbUser)
        .catch((err) => {
          if (err.status === 0) {
            setAppError('server_down');
          }
        });
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
      {appError === 'session_expired' && (
        <div className="app-banner app-banner-error">
          <span>Your session has expired.</span>
          <button onClick={() => loginWithRedirect()} className="btn btn-sm btn-primary">
            Log in again
          </button>
        </div>
      )}
      {appError === 'server_down' && (
        <div className="app-banner app-banner-warning">
          <span>Server is waking up — hang tight, this usually takes ~30 seconds.</span>
          <button onClick={() => { setAppError(null); window.location.reload(); }} className="btn btn-sm">
            Retry
          </button>
        </div>
      )}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard user={dbUser} setAppError={setAppError} />} />
          <Route path="/weeks/:id" element={<WeekDetail user={dbUser} setAppError={setAppError} />} />
          {dbUser?.is_admin && <Route path="/admin" element={<AdminPanel setAppError={setAppError} />} />}
        </Routes>
      </main>
    </div>
  );
}
