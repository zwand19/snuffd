import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { api } from '../api';

export default function WeekDetail({ user, setAppError }) {
  const { id } = useParams();
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const [week, setWeek] = useState(null);
  const [picks, setPicks] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [torchAssignments, setTorchAssignments] = useState([]);
  const [expandedQuestions, setExpandedQuestions] = useState({});

  useEffect(() => {
    if (isAuthenticated) {
      loadWeek();
    }
  }, [id, isAuthenticated]);

  async function loadWeek() {
    try {
      const [data, torches] = await Promise.all([
        api.getWeek(id),
        api.getTorchWeek(id),
      ]);
      setWeek(data);
      setTorchAssignments(torches);
      const existing = {};
      for (const q of data.questions) {
        if (q.my_picks && q.my_picks.length > 0) {
          if (q.required_answers > 1) {
            existing[q.id] = q.my_picks.map(p => p.answer_id);
          } else {
            existing[q.id] = q.my_picks[0].answer_id;
          }
        }
      }
      setPicks(existing);
    } catch (err) {
      console.error('Failed to load week:', err);
      if (setAppError) {
        setAppError(err.status === 0 ? 'server_down' : err.status === 401 ? 'session_expired' : null);
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const pickArray = Object.entries(picks).flatMap(([question_id, answer]) => {
        const answers = Array.isArray(answer) ? answer : [answer];
        return answers.map(answer_id => ({
          question_id: parseInt(question_id),
          answer_id: parseInt(answer_id),
        }));
      });
      await api.submitPicks(pickArray);
      setMessage('Picks submitted!');
      setExpandedQuestions({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
      loadWeek();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Log in to view this week's poll.</p>
        <button onClick={() => loginWithRedirect()} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Login
        </button>
      </div>
    );
  }

  if (!week) {
    return <div className="loading"><p>Loading...</p></div>;
  }

  const isLocked = week.is_locked;
  const answeredCount = week.questions.filter(q => {
    if (q.required_answers > 1) {
      return Array.isArray(picks[q.id]) && picks[q.id].length === q.required_answers;
    }
    return picks[q.id] != null;
  }).length;
  const totalQuestions = week.questions.length;

  return (
    <div className="week-detail">
      <div className="week-header">
        <Link to="/" className="back-link">← Back to Dashboard</Link>
        <h1>{week.title || `Week ${week.week_number}`}</h1>
        <div className="week-meta">
          {isLocked ? (
            <span className="badge badge-locked">🔒 Locked</span>
          ) : (
            <span className="badge badge-open">🟢 Open</span>
          )}
          <span className="lock-time">
            {isLocked ? 'Locked' : 'Locks'}: {new Date(week.lock_time).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
            })}
          </span>
        </div>
      </div>

      {torchAssignments.length > 0 && (
        <div className="card torch-week-card">
          <div className="card-header">
            <h2>🔦 Torches This Week</h2>
          </div>
          <div className="torch-assignments">
            {torchAssignments.map(ta => (
              <div key={ta.user_id} className={`torch-assignment ${ta.user_id === user?.id ? 'highlight-row' : ''}`}>
                <span className="torch-user">{ta.user_name}</span>
                <span className="torch-arrow">→</span>
                <span className="torch-contestant">{ta.contestant_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className={`alert ${message.includes('!') ? 'alert-success' : 'alert-error'}`}>
          {message}
        </div>
      )}

      {message.includes('!') && user && !torchAssignments.some(t => t.user_id === user.id) && (
        <div className="alert alert-torch-nudge">
          🔦 You haven't lit your torch yet! Head to the <Link to="/">Dashboard</Link> to pick a contestant and start earning torch points.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {week.questions.map((q, qi) => {
          const isMulti = q.required_answers > 1;
          const currentPicks = isMulti
            ? (Array.isArray(picks[q.id]) ? picks[q.id] : [])
            : [];
          const pickedAnswers = isMulti
            ? currentPicks.map(id => q.answers.find(a => a.id === id)).filter(Boolean)
            : (picks[q.id] ? [q.answers.find(a => a.id === picks[q.id])].filter(Boolean) : []);
          const isFullyPicked = isMulti
            ? pickedAnswers.length === q.required_answers
            : pickedAnswers.length === 1;
          const isCollapsed = !isLocked && isFullyPicked && !expandedQuestions[q.id];

          return (
            <div key={q.id} className={`card question-card ${q.resolved ? 'resolved' : ''}`}>
              <div className="question-header">
                <span className="question-number">Q{qi + 1}</span>
                <span className="question-text">{q.text}</span>
                <span className="question-points">
                  {isMulti ? `${q.points} pt${q.points !== 1 ? 's' : ''} each` : `${q.points} pt${q.points !== 1 ? 's' : ''}`}
                </span>
                {isMulti && !isLocked && (
                  <span className="badge badge-pick-count">
                    {currentPicks.length}/{q.required_answers}
                  </span>
                )}
                {q.resolved && <span className="badge badge-resolved">✓ Resolved</span>}
              </div>

              {isCollapsed ? (
                <div className="answers-list">
                  {pickedAnswers.map((pa, pi) => (
                    <div key={pa.id} className="answer-option selected" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="answer-text" style={{ flex: 1 }}>{pa.text}</span>
                      {pa.points_override != null && (
                        <span className="answer-points">{pa.points_override} pts</span>
                      )}
                      {pi === pickedAnswers.length - 1 && (
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() => setExpandedQuestions({ ...expandedQuestions, [q.id]: true })}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="answers-list">
                  {q.answers.map(a => {
                    const isSelected = isMulti
                      ? currentPicks.includes(a.id)
                      : picks[q.id] === a.id;
                    const isCorrect = a.is_correct;
                    const wasMyPick = q.my_picks?.some(p => p.answer_id === a.id);

                    return (
                      <label
                        key={a.id}
                        className={[
                          'answer-option',
                          isSelected ? 'selected' : '',
                          isLocked && isCorrect ? 'correct' : '',
                          isLocked && wasMyPick && !isCorrect && q.resolved ? 'incorrect' : '',
                        ].join(' ')}
                      >
                        {!isLocked && isMulti && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelected && currentPicks.length >= q.required_answers}
                            onChange={() => {
                              if (isSelected) {
                                setPicks({ ...picks, [q.id]: currentPicks.filter(id => id !== a.id) });
                              } else if (currentPicks.length < q.required_answers) {
                                setPicks({ ...picks, [q.id]: [...currentPicks, a.id] });
                              }
                              if (currentPicks.length + (isSelected ? -1 : 1) === q.required_answers) {
                                setExpandedQuestions({ ...expandedQuestions, [q.id]: false });
                              }
                            }}
                          />
                        )}
                        {!isLocked && !isMulti && (
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={a.id}
                            checked={isSelected}
                            onChange={() => {
                              setPicks({ ...picks, [q.id]: a.id });
                              setExpandedQuestions({ ...expandedQuestions, [q.id]: false });
                            }}
                          />
                        )}
                        <span className="answer-text">{a.text}</span>
                        {a.points_override != null && (
                          <span className="answer-points">{a.points_override} pts</span>
                        )}
                        {isLocked && isCorrect && <span className="correct-marker">✓</span>}
                        {isLocked && wasMyPick && <span className="my-pick-marker">Your pick</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              {isLocked && q.picks && q.picks.length > 0 && (
                <div className="pick-summary">
                  <h4>Picks</h4>
                  <div className="pick-list">
                    {q.answers.map(a => {
                      const pickers = q.picks.filter(p => p.answer_id === a.id);
                      if (pickers.length === 0) {
                        return null;
                      }
                      return (
                        <div key={a.id} className={`pick-group ${a.is_correct ? 'correct-group' : ''}`}>
                          <span className="pick-answer">{a.text}:</span>
                          <span className="pick-users">{pickers.map(p => p.user_name).join(', ')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!isLocked && totalQuestions > 0 && (
          <div className="submit-area">
            <p className="pick-count">{answeredCount} of {totalQuestions} questions answered</p>
            <button
              type="submit"
              className="btn btn-primary btn-lg submit-btn"
              disabled={submitting || answeredCount === 0}
            >
              {submitting ? 'Submitting...' : 'Submit Picks'}
            </button>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Picks aren't final — you can come back and change them any time before lock.
            </p>
          </div>
        )}

        {totalQuestions === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="text-muted">No questions yet for this week.</p>
          </div>
        )}
      </form>
    </div>
  );
}
