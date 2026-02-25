import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { api } from '../api';

export default function WeekDetail({ user }) {
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
        if (q.my_pick) {
          existing[q.id] = q.my_pick.answer_id;
        }
      }
      setPicks(existing);
    } catch (err) {
      console.error('Failed to load week:', err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const pickArray = Object.entries(picks).map(([question_id, answer_id]) => ({
        question_id: parseInt(question_id),
        answer_id: parseInt(answer_id),
      }));
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
  const answeredCount = Object.keys(picks).length;
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

      <form onSubmit={handleSubmit}>
        {week.questions.map((q, qi) => {
          const pickedAnswer = picks[q.id] ? q.answers.find(a => a.id === picks[q.id]) : null;
          const isCollapsed = !isLocked && pickedAnswer && !expandedQuestions[q.id];

          return (
            <div key={q.id} className={`card question-card ${q.resolved ? 'resolved' : ''}`}>
              <div className="question-header">
                <span className="question-number">Q{qi + 1}</span>
                <span className="question-text">{q.text}</span>
                <span className="question-points">
                  {q.points} pt{q.points !== 1 ? 's' : ''}
                </span>
                {q.resolved && <span className="badge badge-resolved">✓ Resolved</span>}
              </div>

              {isCollapsed ? (
                <div className="answers-list">
                  <div className="answer-option selected">
                    <span className="answer-text">{pickedAnswer.text}</span>
                    {pickedAnswer.points_override != null && (
                      <span className="answer-points">{pickedAnswer.points_override} pts</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => setExpandedQuestions({ ...expandedQuestions, [q.id]: true })}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="answers-list">
                  {q.answers.map(a => {
                    const isSelected = picks[q.id] === a.id;
                    const isCorrect = a.is_correct;
                    const wasMyPick = q.my_pick?.answer_id === a.id;

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
                        {!isLocked && (
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
