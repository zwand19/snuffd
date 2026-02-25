import { useEffect, useState } from 'react';
import { api } from '../api';

function ContestantsTab({ contestants, onRefresh }) {
  const [name, setName] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    await api.createContestant({ name: name.trim() });
    setName('');
    onRefresh();
  }

  async function toggleEliminated(c) {
    await api.updateContestant(c.id, { eliminated: !c.eliminated });
    onRefresh();
  }

  async function remove(id) {
    if (!confirm('Delete contestant?')) {
      return;
    }
    await api.deleteContestant(id);
    onRefresh();
  }

  return (
    <div>
      <form onSubmit={add} className="inline-form">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Contestant name"
          className="input"
        />
        <button type="submit" className="btn btn-primary">Add</button>
      </form>
      <div className="contestant-list">
        {contestants.map(c => (
          <div key={c.id} className={`contestant-item ${c.eliminated ? 'eliminated' : ''}`}>
            <span className="contestant-name">{c.name}</span>
            <div className="contestant-actions">
              <button
                onClick={() => toggleEliminated(c)}
                className={`btn btn-sm ${c.eliminated ? 'btn-success' : 'btn-danger'}`}
              >
                {c.eliminated ? 'Reinstate' : 'Eliminate'}
              </button>
              <button onClick={() => remove(c.id)} className="btn btn-sm btn-ghost">✕</button>
            </div>
          </div>
        ))}
        {contestants.length === 0 && (
          <p className="text-muted" style={{ padding: '1rem' }}>No contestants added yet.</p>
        )}
      </div>
    </div>
  );
}

function UsersTab({ users, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');

  function startEdit(u) {
    setEditing(u.id);
    setEditName(u.name);
  }

  async function saveName(id) {
    await api.updateUser(id, { name: editName });
    setEditing(null);
    onRefresh();
  }

  return (
    <div className="users-list">
      {users.map(u => (
        <div key={u.id} className="user-item">
          <span className="user-email">{u.email}</span>
          {editing === u.id ? (
            <div className="inline-form" style={{ marginBottom: 0 }}>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="input input-sm"
                onKeyDown={e => e.key === 'Enter' && saveName(u.id)}
              />
              <button onClick={() => saveName(u.id)} className="btn btn-sm btn-primary">Save</button>
              <button onClick={() => setEditing(null)} className="btn btn-sm">Cancel</button>
            </div>
          ) : (
            <div className="user-name-row">
              <span>{u.name}</span>
              <button onClick={() => startEdit(u)} className="btn btn-sm">Edit</button>
            </div>
          )}
          {u.is_admin ? <span className="badge badge-admin">Admin</span> : null}
        </div>
      ))}
    </div>
  );
}

function QuestionEditor({ question: q, index, onAddContestants, onAddAnswer, onRemoveAnswer, onResolve, onUnresolve, onDelete, onUpdate }) {
  const [newAnswerText, setNewAnswerText] = useState('');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const [points, setPoints] = useState(q.points);

  async function saveQuestion() {
    await api.updateQuestion(q.id, { text, points });
    setEditing(false);
    onUpdate();
  }

  function handleAddAnswer(e) {
    e.preventDefault();
    if (!newAnswerText.trim()) {
      return;
    }
    onAddAnswer(newAnswerText.trim());
    setNewAnswerText('');
  }

  return (
    <div className={`card question-edit-card ${q.resolved ? 'resolved' : ''}`}>
      <div className="question-edit-header">
        <span className="question-number">Q{index + 1}</span>
        {editing ? (
          <div className="inline-form flex-1" style={{ marginBottom: 0 }}>
            <input value={text} onChange={e => setText(e.target.value)} className="input flex-1" />
            <input
              type="number" value={points}
              onChange={e => setPoints(parseInt(e.target.value) || 1)}
              className="input input-sm" style={{ width: '70px' }} min="1"
            />
            <span className="input-label">pts</span>
            <button onClick={saveQuestion} className="btn btn-sm btn-primary">Save</button>
            <button onClick={() => setEditing(false)} className="btn btn-sm">Cancel</button>
          </div>
        ) : (
          <>
            <span className="question-text flex-1">{q.text}</span>
            <span className="question-points">{q.points} pts</span>
            <button onClick={() => setEditing(true)} className="btn btn-sm">Edit</button>
            <button onClick={onDelete} className="btn btn-sm btn-danger">Delete</button>
          </>
        )}
      </div>

      <div className="answers-editor">
        {q.answers.map(a => (
          <div key={a.id} className={`answer-edit-item ${a.is_correct ? 'correct' : ''}`}>
            <span className="answer-text flex-1">{a.text}</span>
            {a.points_override != null && (
              <span className="answer-points">{a.points_override} pts</span>
            )}
            {!q.resolved && (
              <button
                onClick={() => onResolve(a.id)}
                className="btn btn-xs btn-success"
                title="Mark correct"
              >✓</button>
            )}
            {a.is_correct && <span className="badge badge-correct">Correct</span>}
            <button onClick={() => onRemoveAnswer(a.id)} className="btn btn-xs btn-ghost">✕</button>
          </div>
        ))}
        {q.answers.length === 0 && (
          <p className="text-muted" style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
            No answers yet — add some below or use "All Contestants"
          </p>
        )}
      </div>

      <div className="question-actions">
        <form onSubmit={handleAddAnswer} className="inline-form" style={{ marginBottom: 0 }}>
          <input
            value={newAnswerText}
            onChange={e => setNewAnswerText(e.target.value)}
            placeholder="Add answer..."
            className="input input-sm"
          />
          <button type="submit" className="btn btn-sm">Add</button>
        </form>
        <button onClick={onAddContestants} className="btn btn-sm btn-secondary">+ All Contestants</button>
        {q.resolved && (
          <button onClick={onUnresolve} className="btn btn-sm btn-warning">Unresolve</button>
        )}
      </div>
    </div>
  );
}

function WeekEditor({ weekId, onBack, onRefresh }) {
  const [week, setWeek] = useState(null);
  const [title, setTitle] = useState('');
  const [lockTime, setLockTime] = useState('');
  const [newQText, setNewQText] = useState('');
  const [newQPoints, setNewQPoints] = useState(1);

  useEffect(() => { loadWeek(); }, [weekId]);

  async function loadWeek() {
    const data = await api.getWeek(weekId);
    setWeek(data);
    setTitle(data.title || '');
    if (data.lock_time) {
      const d = new Date(data.lock_time);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setLockTime(local.toISOString().slice(0, 16));
    }
  }

  async function saveDetails() {
    await api.updateWeek(weekId, {
      title,
      lock_time: new Date(lockTime).toISOString(),
    });
    onRefresh();
  }

  async function addQuestion(e) {
    e.preventDefault();
    if (!newQText.trim()) {
      return;
    }
    await api.createQuestion({ week_id: weekId, text: newQText.trim(), points: newQPoints });
    setNewQText('');
    setNewQPoints(1);
    loadWeek();
  }

  async function deleteQuestion(qId) {
    if (!confirm('Delete this question and all answers?')) {
      return;
    }
    await api.deleteQuestion(qId);
    loadWeek();
  }

  async function addContestantAnswers(qId) {
    await api.addContestantAnswers(qId);
    loadWeek();
  }

  async function addAnswer(qId, text) {
    await api.addAnswer(qId, { text });
    loadWeek();
  }

  async function removeAnswer(aId) {
    await api.deleteAnswer(aId);
    loadWeek();
  }

  async function resolve(qId, answerId) {
    await api.resolveQuestion(qId, answerId);
    loadWeek();
  }

  async function unresolve(qId) {
    await api.unresolveQuestion(qId);
    loadWeek();
  }

  if (!week) {
    return <p>Loading...</p>;
  }

  return (
    <div className="week-editor">
      <button onClick={onBack} className="btn btn-sm back-btn">← Back to Weeks</button>
      <h2>Edit: {week.title || `Week ${week.week_number}`}</h2>

      <div className="week-settings">
        <div className="form-row">
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="input" />
        </div>
        <div className="form-row">
          <label>Lock Time</label>
          <input
            type="datetime-local"
            value={lockTime}
            onChange={e => setLockTime(e.target.value)}
            className="input"
          />
        </div>
        <button onClick={saveDetails} className="btn btn-primary">Save Details</button>
      </div>

      <h3>Questions</h3>
      <form onSubmit={addQuestion} className="inline-form">
        <input
          value={newQText}
          onChange={e => setNewQText(e.target.value)}
          placeholder="Question text"
          className="input flex-1"
        />
        <input
          type="number" value={newQPoints}
          onChange={e => setNewQPoints(parseInt(e.target.value) || 1)}
          className="input input-sm" min="1" style={{ width: '70px' }}
        />
        <span className="input-label">pts</span>
        <button type="submit" className="btn btn-primary">Add Question</button>
      </form>

      {week.questions.map((q, qi) => (
        <QuestionEditor
          key={q.id}
          question={q}
          index={qi}
          onAddContestants={() => addContestantAnswers(q.id)}
          onAddAnswer={(text) => addAnswer(q.id, text)}
          onRemoveAnswer={removeAnswer}
          onResolve={(aId) => resolve(q.id, aId)}
          onUnresolve={() => unresolve(q.id)}
          onDelete={() => deleteQuestion(q.id)}
          onUpdate={loadWeek}
        />
      ))}

      {week.questions.length === 0 && (
        <p className="text-muted" style={{ padding: '1rem' }}>
          No questions yet. Add one above to get started.
        </p>
      )}
    </div>
  );
}

function TorchesTab({ contestants, onRefresh }) {
  const [torchRankings, setTorchRankings] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => { loadTorches(); }, []);

  async function loadTorches() {
    try {
      const data = await api.getTorchRankings();
      setTorchRankings(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function resolve(contestantId, result) {
    setMessage('');
    try {
      await api.resolveTorch(contestantId, result);
      setMessage(`Resolved as ${result.replace('_', ' ')}`);
      loadTorches();
      onRefresh();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function unresolve(contestantId) {
    setMessage('');
    try {
      await api.unresolveTorch(contestantId);
      setMessage('Result cleared');
      loadTorches();
      onRefresh();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const finalists = contestants.filter(c => !c.eliminated || c.torch_final_result);

  return (
    <div>
      {message && (
        <div className={`alert ${message.includes('!') || !message.includes('error') ? 'alert-success' : 'alert-error'}`}>
          {message}
        </div>
      )}

      <h3>Season Results</h3>
      <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
        Set final placements to calculate torch bonus scores.
      </p>
      <div className="torch-resolve-list">
        {finalists.map(c => (
          <div key={c.id} className="torch-resolve-item">
            <span className="contestant-name">{c.name}</span>
            {c.torch_final_result ? (
              <div className="torch-resolve-actions">
                <span className="badge badge-resolved">{c.torch_final_result.replace('_', ' ')}</span>
                <button onClick={() => unresolve(c.id)} className="btn btn-xs btn-ghost">Clear</button>
              </div>
            ) : (
              <div className="torch-resolve-actions">
                <button onClick={() => resolve(c.id, 'winner')} className="btn btn-xs btn-success">Winner</button>
                <button onClick={() => resolve(c.id, 'runner_up')} className="btn btn-xs btn-warning">Runner-Up</button>
                <button onClick={() => resolve(c.id, 'final_week')} className="btn btn-xs">Final Week</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: '2rem' }}>Torch Standings</h3>
      <div className="table-wrap">
        <table className="rankings-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Carrying For</th>
              <th>Points</th>
              <th>Status</th>
              {torchRankings.some(t => t.torchScore !== null) && <th>Final Score</th>}
            </tr>
          </thead>
          <tbody>
            {torchRankings.map(t => (
              <tr key={t.user_id}>
                <td>{t.user_name}</td>
                <td>{t.contestant_name || '—'}</td>
                <td className="score-cell">{t.points}</td>
                <td>
                  {t.needs_switch ? <span className="badge badge-warning">Must Switch</span> : <span className="badge badge-open">Active</span>}
                </td>
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
  );
}

export default function AdminPanel() {
  const [tab, setTab] = useState('weeks');
  const [contestants, setContestants] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingWeekId, setEditingWeekId] = useState(null);
  const [newWeekNum, setNewWeekNum] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [c, w, u] = await Promise.all([
      api.getContestants(),
      api.getWeeks(),
      api.getUsers(),
    ]);
    setContestants(c);
    setWeeks(w);
    setUsers(u);
  }

  async function createWeek(e) {
    e.preventDefault();
    if (!newWeekNum) {
      return;
    }
    await api.createWeek({ week_number: parseInt(newWeekNum) });
    setNewWeekNum('');
    loadAll();
  }

  async function deleteWeek(id) {
    if (!confirm('Delete this week and all its questions?')) {
      return;
    }
    await api.deleteWeek(id);
    loadAll();
  }

  return (
    <div className="admin-panel">
      <h1>⚙️ Admin Panel</h1>
      <div className="tab-bar">
        {['weeks', 'contestants', 'torches', 'users'].map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); setEditingWeekId(null); }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'contestants' && (
        <ContestantsTab contestants={contestants} onRefresh={loadAll} />
      )}

      {tab === 'torches' && (
        <TorchesTab contestants={contestants} onRefresh={loadAll} />
      )}

      {tab === 'users' && (
        <UsersTab users={users} onRefresh={loadAll} />
      )}

      {tab === 'weeks' && !editingWeekId && (
        <div>
          <form onSubmit={createWeek} className="inline-form">
            <input
              type="number" value={newWeekNum}
              onChange={e => setNewWeekNum(e.target.value)}
              placeholder="Week #" className="input" min="1"
              style={{ width: '100px' }}
            />
            <button type="submit" className="btn btn-primary">Create Week</button>
          </form>
          <div className="weeks-list">
            {weeks.map(w => (
              <div key={w.id} className="week-list-item">
                <div>
                  <strong>Week {w.week_number}</strong>
                  {w.title && w.title !== `Week ${w.week_number}` ? ` — ${w.title}` : ''}
                  <span className="lock-time-small">
                    {new Date(w.lock_time).toLocaleString()}
                  </span>
                </div>
                <div>
                  <button onClick={() => setEditingWeekId(w.id)} className="btn btn-sm btn-primary">
                    Edit
                  </button>
                  <button onClick={() => deleteWeek(w.id)} className="btn btn-sm btn-danger">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {weeks.length === 0 && (
              <p className="text-muted" style={{ padding: '1rem' }}>No weeks created yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'weeks' && editingWeekId && (
        <WeekEditor
          weekId={editingWeekId}
          onBack={() => setEditingWeekId(null)}
          onRefresh={loadAll}
        />
      )}
    </div>
  );
}
