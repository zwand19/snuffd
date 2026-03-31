import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { api } from '../api';

export default function Dashboard({ user, setAppError }) {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const [weeks, setWeeks] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [upcomingWeek, setUpcomingWeek] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [torchRankings, setTorchRankings] = useState([]);
  const [myTorch, setMyTorch] = useState(null);
  const [contestants, setContestants] = useState([]);
  const [showTorchPicker, setShowTorchPicker] = useState(false);
  const [torchMessage, setTorchMessage] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadData();
  }, [isAuthenticated, user?.id, user?.in_league]);

  async function loadData() {
    try {
      const [weeksData, rankingsData, torchData, contestantsData] = await Promise.all([
        api.getWeeks(),
        api.getRankings(),
        api.getTorchRankings(),
        api.getContestants(),
      ]);
      setWeeks(weeksData);
      setRankings(rankingsData);
      setTorchRankings(torchData);
      setContestants(contestantsData);

      if (user) {
        const mine = torchData.find(t => t.user_id === user.id);
        setMyTorch(mine || null);
      }

      const now = new Date();
      const upcoming = weeksData.find(w => new Date(w.lock_time) > now);
      setUpcomingWeek(upcoming);
      if (upcoming) {
        const status = await api.getSubmissionStatus(upcoming.id);
        setSubmissionStatus(status);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      if (setAppError) {
        setAppError(err.status === 0 ? 'server_down' : err.status === 401 ? 'session_expired' : null);
      }
    }
  }

  async function handleTorchPick(contestantId) {
    setTorchMessage('');
    try {
      const result = await api.pickTorch(contestantId);
      setTorchMessage(
        result.action === 'initial'
          ? `Torch lit for ${result.contestant_name}!`
          : (result.action === 'forced_switch' || result.action === 'free_switch')
            ? `Switched torch to ${result.contestant_name} (no penalty)!`
            : `Switched torch to ${result.contestant_name} (-${result.penalty} points)`
      );
      setShowTorchPicker(false);
      loadData();
    } catch (err) {
      setTorchMessage(err.message);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="hero">
        <div className="hero-content">
          <h1 className="hero-title">SNUFFD</h1>
          <p className="hero-subtitle">Survivor Fantasy League</p>
          <p className="hero-desc">Outwit. Outplay. Out-predict.</p>
          <button onClick={() => loginWithRedirect()} className="btn btn-primary btn-lg">
            Enter Tribal Council
          </button>
        </div>
      </div>
    );
  }

  const lockedWeeks = weeks
    .filter(w => new Date(w.lock_time) <= new Date())
    .sort((a, b) => b.week_number - a.week_number);

  const inLeague = !!user?.in_league;

  return (
    <div className="dashboard">
      <div className="banner">
        <h1>🔥 SNUFFD 🔥</h1>
        <p>Survivor Fantasy League</p>
      </div>

      {user && !inLeague && (
        <div className="app-banner app-banner-warning" style={{ marginBottom: '1rem' }}>
          <span>View-only: you are not in the league yet. An admin can add you when you are ready to play.</span>
        </div>
      )}

      {upcomingWeek && (
        <div className="card upcoming-card">
          <div className="card-header">
            <h2>📋 {upcomingWeek.title || 'Poll'}</h2>
            <span className="lock-time">
              Locks: {new Date(upcomingWeek.lock_time).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
              })}
            </span>
          </div>
          {inLeague ? (
            <Link to={`/weeks/${upcomingWeek.id}`} className="btn btn-primary">
              Submit Your Picks
            </Link>
          ) : (
            <Link to={`/weeks/${upcomingWeek.id}`} className="btn btn-secondary">
              View Poll (read-only)
            </Link>
          )}
          {submissionStatus && (
            <div className="submission-tracker">
              <div className="submitted">
                <h4>✅ Submitted ({submissionStatus.users.filter(u => u.submitted).length})</h4>
                <div className="user-chips">
                  {submissionStatus.users.filter(u => u.submitted).map(u => {
                    const hasTorch = torchRankings.some(t => t.user_id === u.id);
                    return (
                      <span key={u.id} className={`chip ${hasTorch ? 'chip-success' : 'chip-no-torch'}`}>
                        {u.name}{!hasTorch ? ' 🚫🔦' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="not-submitted">
                <h4>⏳ Waiting ({submissionStatus.users.filter(u => !u.submitted).length})</h4>
                <div className="user-chips">
                  {submissionStatus.users.filter(u => !u.submitted).map(u => (
                    <span key={u.id} className="chip chip-warning">{u.name}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>🏆 League Standings</h2>
        </div>
        <div className="table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Potential</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r, i) => (
                <tr key={r.id} className={r.id === user?.id ? 'highlight-row' : ''}>
                  <td className="rank-cell">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="score-cell">{r.score}</td>
                  <td className="potential-cell">
                    <span className="potential-tooltip-wrap">
                      {r.potentialScore}
                      <span className="potential-tooltip" role="tooltip">
                        <span className="potential-tooltip-line">Poll potential: {r.pollPotential}</span>
                        <span className="potential-tooltip-line">Torch score: {r.torchScore}</span>
                        <span className="potential-tooltip-note">
                          Torch streak bonus and other torch bonuses are not included in this potential.
                        </span>
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
              {rankings.length === 0 && (
                <tr><td colSpan="4" className="empty-cell">No scores yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>🔦 Torch Standings</h2>
          {inLeague && (!myTorch ? (
            <button onClick={() => setShowTorchPicker(true)} className="btn btn-primary btn-sm">
              Light Your Torch
            </button>
          ) : (
            <button onClick={() => setShowTorchPicker(!showTorchPicker)} className="btn btn-sm">
              {showTorchPicker ? 'Cancel' : 'Switch Torch'}
            </button>
          ))}
        </div>

        <details className="torch-info">
          <summary>More Info</summary>
          <div className="torch-info-body">
            <p>Each player carries a torch for a contestant. That torch burns brightly at <strong>35 points</strong> when the season starts. Before any week, you can pass your torch to a different contestant — but you'll lose points. If your contestant is eliminated, you lose extra points and must pick someone new. You'll want to swap off contestants you feel have too much heat!</p>
            <p>At the end of the game, all players will have a torch for someone in the finale since you grab new contestants as yours get eliminated. You'll then get points based on how well they do in that episode + how many points your torch is worth + how long you've held that same torch.</p>
            <div className="torch-info-columns">
              <div>
                <h5>Swaps</h5>
                <ul>
                  <li>Pre-merge: <strong>-2</strong></li>
                  <li>Post-merge: <strong>-3</strong></li>
                  <li>Pre-finale: <strong>-4</strong></li>
                </ul>
              </div>
              <div>
                <h5>Elimination Penalty</h5>
                <ul>
                  <li>Pre-merge: <strong>-5</strong></li>
                  <li>Post-merge / pre-finale: <strong>-7</strong></li>
                </ul>
              </div>
              <div>
                <h5>Finale Scoring</h5>
                <ul>
                  <li>Winner: all points + up to <strong>6 bonus</strong> for consecutive weeks held</li>
                  <li>Runner-up (FTC loss): <strong>half</strong> points (rounded down)</li>
                  <li>Eliminated in finale: <strong>1/3</strong> points</li>
                </ul>
              </div>
              <div>
                <h5>Bonuses</h5>
                <ul>
                  <li>Idol played (prevents elim): <strong>+2</strong></li>
                  <li>Individual immunity win: <strong>+1</strong></li>
                  <li>Visits the Sanctuary: <strong>+1</strong></li>
                </ul>
              </div>
            </div>
            <p className="torch-info-note">If the Sole Survivor is someone you once held a torch for but switched off, you get a <strong>30% deduction</strong> on your final torch score. Half points are rounded down. "Post-merge" means after Earn the Merge if applicable.</p>
          </div>
        </details>

        {torchMessage && (
          <div className={`alert ${torchMessage.includes('!') ? 'alert-success' : 'alert-error'}`}>
            {torchMessage}
          </div>
        )}

        {myTorch && (
          <div className="torch-my-status">
            <span className="torch-icon">🔦</span>
            <span>
              Your torch: <strong>{myTorch.contestant_name}</strong> — <strong>{myTorch.points}</strong> pts
            </span>
            {myTorch.needs_switch ? (
              <span className="badge badge-warning">Must Switch</span>
            ) : null}
          </div>
        )}

        {inLeague && showTorchPicker && (
          <div className="torch-picker">
            <h4>Pick a contestant to carry your torch</h4>
            {!myTorch && <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Your torch starts at 35 points. You can voluntarily switch for a penalty later, or be penalized & forced to re-pick if your torch is snuffed.</p>}
            <div className="torch-picker-grid">
              {contestants.filter(c => !c.eliminated).map(c => (
                <button
                  key={c.id}
                  className={`torch-pick-btn ${myTorch?.contestant_id === c.id ? 'current' : ''}`}
                  onClick={() => handleTorchPick(c.id)}
                  disabled={myTorch?.contestant_id === c.id}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Carrying For</th>
                <th>Pts</th>
                {torchRankings.some(t => t.torchScore !== null) && <th>Score</th>}
              </tr>
            </thead>
            <tbody>
              {torchRankings.map((t, i) => (
                <tr key={t.user_id} className={t.user_id === user?.id ? 'highlight-row' : ''}>
                  <td className="rank-cell">{i + 1}</td>
                  <td>{t.user_name}</td>
                  <td className="torch-contestant-cell">
                    {t.contestant_name || '—'}
                    {t.needs_switch ? <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>Must Switch</span> : null}
                  </td>
                  <td className="score-cell">{t.points}</td>
                  {torchRankings.some(tr => tr.torchScore !== null) && (
                    <td className="torch-score-cell">{t.torchScore ?? '—'}</td>
                  )}
                </tr>
              ))}
              {torchRankings.length === 0 && (
                <tr><td colSpan="5" className="empty-cell">No torches yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lockedWeeks.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>📅 Past Polls</h2>
          </div>
          <div className="week-grid">
            {lockedWeeks.map(w => (
              <Link key={w.id} to={`/weeks/${w.id}`} className="week-link">
                <span className="week-number">{w.title || 'Poll'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
