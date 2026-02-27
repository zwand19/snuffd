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

function EmailComposer({ onClose }) {
  const [subject, setSubject] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  async function send() {
    if (!subject.trim() || !markdown.trim()) {
      return;
    }
    if (!confirm(`Send this email to ALL users?`)) {
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await api.emailUsers({ subject: subject.trim(), markdown: markdown.trim() });
      setResult(res);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--primary)', marginBottom: '1.5rem' }}>
      <div className="card-header">
        <h2>📧 Compose Email</h2>
        <button onClick={onClose} className="btn btn-sm btn-ghost">✕</button>
      </div>

      {result && (
        <div className={`alert ${result.error ? 'alert-error' : 'alert-success'}`}>
          {result.error || `Sent to ${result.sent}/${result.total} users${result.failed ? ` (${result.failed} failed)` : ''}!`}
        </div>
      )}

      <div style={{ padding: '0 1rem 1rem' }}>
        <div className="form-row">
          <label>Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Email subject line"
            className="input"
          />
        </div>
        <div className="form-row">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Body (Markdown)</label>
            <button
              onClick={() => setPreviewing(!previewing)}
              className="btn btn-xs"
            >
              {previewing ? 'Edit' : 'Preview'}
            </button>
          </div>
          {previewing ? (
            <div
              className="email-preview"
              style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                padding: '16px',
                minHeight: '150px',
                color: 'var(--text)',
                lineHeight: 1.7,
              }}
              dangerouslySetInnerHTML={{ __html: simpleMarkdown(markdown) }}
            />
          ) : (
            <textarea
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              placeholder={"Hey {{name}},\n\nThis week's picks are live! Head over and make your selections before lock time.\n\n**Don't forget** to check the torch standings too.\n\n— Snuffd Admin"}
              className="input"
              rows={8}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.9rem' }}
            />
          )}
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Use <code>{'{{name}}'}</code> to insert each user's name. Supports **bold**, *italic*, lists, links, etc.
          </p>
        </div>
        <button
          onClick={send}
          disabled={sending || !subject.trim() || !markdown.trim()}
          className="btn btn-primary"
        >
          {sending ? 'Sending...' : 'Send to All Users'}
        </button>
      </div>
    </div>
  );
}

function simpleMarkdown(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  return html;
}

function UsersTab({ users, torchRankings, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [torchMsg, setTorchMsg] = useState('');
  const [showEmail, setShowEmail] = useState(false);

  function startEdit(u) {
    setEditing(u.id);
    setEditName(u.name);
  }

  async function saveName(id) {
    await api.updateUser(id, { name: editName });
    setEditing(null);
    onRefresh();
  }

  async function deleteUser(u) {
    if (!confirm(`Delete ${u.name} (${u.email})? This removes all their picks, torches, and history.`)) {
      return;
    }
    try {
      await api.deleteUser(u.id);
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  }

  const noTorchUsers = users.filter(u => !torchRankings.some(t => t.user_id === u.id));

  async function assignRandomTorches(userIds) {
    setTorchMsg('');
    try {
      const result = await api.assignRandomTorches(userIds);
      const names = result.assigned.map(a => a.contestant_name).join(', ');
      setTorchMsg(`Assigned ${result.assigned.length} torch(es): ${names}!`);
      onRefresh();
    } catch (err) {
      setTorchMsg(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => setShowEmail(!showEmail)}
          className={`btn ${showEmail ? 'btn-ghost' : 'btn-primary'}`}
        >
          {showEmail ? 'Hide Email Composer' : '📧 Email All Users'}
        </button>
      </div>

      {showEmail && <EmailComposer onClose={() => setShowEmail(false)} />}

      {noTorchUsers.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--warning)', marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2>🚫🔦 No Torch ({noTorchUsers.length})</h2>
            <button
              className="btn btn-sm btn-warning"
              onClick={() => assignRandomTorches(noTorchUsers.map(u => u.id))}
            >
              Assign Random to All
            </button>
          </div>
          {torchMsg && (
            <div className={`alert ${torchMsg.includes('!') ? 'alert-success' : 'alert-error'}`}>
              {torchMsg}
            </div>
          )}
          <div className="user-chips">
            {noTorchUsers.map(u => (
              <span key={u.id} className="chip chip-warning" style={{ cursor: 'pointer' }} onClick={() => assignRandomTorches([u.id])}>
                {u.name}
              </span>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Click a name to assign individually.
          </p>
        </div>
      )}

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
              {!u.is_admin && (
                <button onClick={() => deleteUser(u)} className="btn btn-sm btn-danger">Delete</button>
              )}
            </div>
          )}
          {u.is_admin ? <span className="badge badge-admin">Admin</span> : null}
        </div>
      ))}
    </div>
    </div>
  );
}

function QuestionEditor({ question: q, index, onAddContestants, onAddAnswer, onRemoveAnswer, onResolve, onUnresolve, onDelete, onClone, onUpdate }) {
  const [newAnswerText, setNewAnswerText] = useState('');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const [points, setPoints] = useState(q.points);
  const [requiredAnswers, setRequiredAnswers] = useState(q.required_answers || 1);
  const [editingAnswerId, setEditingAnswerId] = useState(null);
  const [editAnswerPts, setEditAnswerPts] = useState('');
  const [correctIds, setCorrectIds] = useState(
    q.answers.filter(a => a.is_correct).map(a => a.id)
  );
  const isMulti = (q.required_answers || 1) > 1;

  async function saveQuestion() {
    await api.updateQuestion(q.id, { text, points, required_answers: requiredAnswers });
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

  function startEditPoints(a) {
    setEditingAnswerId(a.id);
    setEditAnswerPts(a.points_override != null ? String(a.points_override) : '');
  }

  async function saveAnswerPoints(aId) {
    const val = editAnswerPts.trim() === '' ? null : parseInt(editAnswerPts);
    await api.updateAnswer(aId, { points_override: val });
    setEditingAnswerId(null);
    onUpdate();
  }

  async function toggleEliminated(a) {
    await api.eliminateAnswer(a.id, !a.is_eliminated);
    onUpdate();
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
            <input
              type="number" value={requiredAnswers}
              onChange={e => setRequiredAnswers(parseInt(e.target.value) || 1)}
              className="input input-sm" style={{ width: '70px' }} min="1"
            />
            <span className="input-label">picks</span>
            <button onClick={saveQuestion} className="btn btn-sm btn-primary">Save</button>
            <button onClick={() => setEditing(false)} className="btn btn-sm">Cancel</button>
          </div>
        ) : (
          <>
            <span className="question-text flex-1">{q.text}</span>
            <span className="question-points">
              {q.points} pts{isMulti ? ` · pick ${q.required_answers}` : ''}
            </span>
            <button onClick={() => setEditing(true)} className="btn btn-sm">Edit</button>
            <button onClick={onClone} className="btn btn-sm btn-secondary">Clone</button>
            <button onClick={onDelete} className="btn btn-sm btn-danger">Delete</button>
          </>
        )}
      </div>

      <div className="answers-editor">
        {q.answers.map(a => (
          <div key={a.id} className={`answer-edit-item ${a.is_correct ? 'correct' : ''} ${a.is_eliminated ? 'eliminated' : ''}`}>
            {!q.resolved && (
              <input
                type="checkbox"
                checked={correctIds.includes(a.id)}
                disabled={a.is_eliminated}
                onChange={() => {
                  setCorrectIds(prev =>
                    prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]
                  );
                }}
                title="Toggle correct"
              />
            )}
            <span className={`answer-text flex-1 ${a.is_eliminated ? 'text-strikethrough' : ''}`}>{a.text}</span>
            {editingAnswerId === a.id ? (
              <div className="inline-form" style={{ marginBottom: 0, gap: '0.3rem' }}>
                <input
                  type="number"
                  value={editAnswerPts}
                  onChange={e => setEditAnswerPts(e.target.value)}
                  placeholder="pts"
                  className="input input-sm"
                  style={{ width: '60px' }}
                  onKeyDown={e => e.key === 'Enter' && saveAnswerPoints(a.id)}
                  autoFocus
                />
                <button onClick={() => saveAnswerPoints(a.id)} className="btn btn-xs btn-primary">Save</button>
                <button onClick={() => setEditingAnswerId(null)} className="btn btn-xs">✕</button>
              </div>
            ) : (
              <button
                onClick={() => startEditPoints(a)}
                className="btn btn-xs"
                title="Edit point value"
              >
                {a.points_override != null ? `${a.points_override} pts` : 'Set pts'}
              </button>
            )}
            {!q.resolved && (
              <button
                onClick={() => toggleEliminated(a)}
                className={`btn btn-xs ${a.is_eliminated ? 'btn-warning' : 'btn-danger'}`}
                title={a.is_eliminated ? 'Reinstate answer' : 'Mark incorrect'}
              >
                {a.is_eliminated ? '↩' : '✗'}
              </button>
            )}
            {a.is_correct && <span className="badge badge-correct">Correct</span>}
            {a.is_eliminated && !q.resolved && <span className="badge badge-eliminated">Eliminated</span>}
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
        {!q.resolved && (
          <button
            onClick={() => onResolve(correctIds)}
            className="btn btn-sm btn-success"
            disabled={correctIds.length === 0}
          >
            Resolve ({correctIds.length} correct)
          </button>
        )}
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
  const [newQRequired, setNewQRequired] = useState(1);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [randomMsg, setRandomMsg] = useState('');

  useEffect(() => { loadWeek(); loadStatus(); }, [weekId]);

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

  async function loadStatus() {
    try {
      const data = await api.getSubmissionStatus(weekId);
      setSubmissionStatus(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function assignRandomPicks(userIds) {
    setRandomMsg('');
    try {
      const result = await api.assignRandomPicks(weekId, userIds);
      setRandomMsg(`Assigned random picks to ${result.count} user(s)!`);
      loadStatus();
    } catch (err) {
      setRandomMsg(err.message);
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
    await api.createQuestion({ week_id: weekId, text: newQText.trim(), points: newQPoints, required_answers: newQRequired });
    setNewQText('');
    setNewQPoints(1);
    setNewQRequired(1);
    loadWeek();
  }

  async function deleteQuestion(qId) {
    if (!confirm('Delete this question and all answers?')) {
      return;
    }
    await api.deleteQuestion(qId);
    loadWeek();
  }

  async function cloneQuestion(qId) {
    await api.cloneQuestion(qId);
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

      {submissionStatus && (() => {
        const missing = submissionStatus.users.filter(u => !u.submitted);
        return missing.length > 0 ? (
          <div className="card" style={{ borderLeft: '3px solid var(--warning)' }}>
            <div className="card-header">
              <h2>⏳ Missing Picks ({missing.length})</h2>
              <button
                className="btn btn-sm btn-warning"
                onClick={() => assignRandomPicks(missing.map(u => u.id))}
              >
                Assign Random to All
              </button>
            </div>
            {randomMsg && (
              <div className={`alert ${randomMsg.includes('!') ? 'alert-success' : 'alert-error'}`}>
                {randomMsg}
              </div>
            )}
            <div className="user-chips">
              {missing.map(u => (
                <span key={u.id} className="chip chip-warning" style={{ cursor: 'pointer' }} onClick={() => assignRandomPicks([u.id])}>
                  {u.name}
                </span>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Click a name to assign random picks individually.
            </p>
          </div>
        ) : null;
      })()}

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
        <input
          type="number" value={newQRequired}
          onChange={e => setNewQRequired(parseInt(e.target.value) || 1)}
          className="input input-sm" min="1" style={{ width: '70px' }}
        />
        <span className="input-label">picks</span>
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
          onClone={() => cloneQuestion(q.id)}
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
  const [gamePhase, setGamePhase] = useState('pre_merge');

  useEffect(() => { loadTorches(); loadPhase(); }, []);

  async function loadTorches() {
    try {
      const data = await api.getTorchRankings();
      setTorchRankings(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadPhase() {
    try {
      const data = await api.getGamePhase();
      setGamePhase(data.game_phase);
    } catch (err) {
      console.error(err);
    }
  }

  async function changePhase(phase) {
    setMessage('');
    try {
      await api.setGamePhase(phase);
      setGamePhase(phase);
      setMessage(`Game phase set to ${phase.replace(/_/g, ' ')}!`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function awardBonus(contestantId, bonusType) {
    setMessage('');
    try {
      const result = await api.awardTorchBonus(contestantId, bonusType);
      const label = bonusType === 'idol_played' ? 'Idol played' : 'Immunity win';
      setMessage(`${label}: +${result.amount} to ${result.affected} torch(es) for ${result.contestant_name}!`);
      loadTorches();
      onRefresh();
    } catch (err) {
      setMessage(err.message);
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
  const activeContestants = contestants.filter(c => !c.eliminated);
  const phaseLabels = { pre_merge: 'Pre-Merge', post_merge: 'Post-Merge', pre_finale: 'Pre-Finale' };

  return (
    <div>
      {message && (
        <div className={`alert ${message.includes('!') || !message.includes('error') ? 'alert-success' : 'alert-error'}`}>
          {message}
        </div>
      )}

      <h3>Game Phase</h3>
      <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        Controls swap and elimination penalty amounts.
      </p>
      <div className="inline-form" style={{ marginBottom: '1.5rem' }}>
        {Object.entries(phaseLabels).map(([key, label]) => (
          <button
            key={key}
            className={`btn btn-sm ${gamePhase === key ? 'btn-primary' : ''}`}
            onClick={() => changePhase(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <h3>Award Bonuses</h3>
      <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        Awards points to all players carrying a torch for this contestant.
      </p>
      <div className="torch-resolve-list" style={{ marginBottom: '1.5rem' }}>
        {activeContestants.map(c => (
          <div key={c.id} className="torch-resolve-item">
            <span className="contestant-name">{c.name}</span>
            <div className="torch-resolve-actions">
              <button onClick={() => awardBonus(c.id, 'idol_played')} className="btn btn-xs btn-primary">Idol +2</button>
              <button onClick={() => awardBonus(c.id, 'immunity_win')} className="btn btn-xs btn-secondary">Immunity +1</button>
            </div>
          </div>
        ))}
      </div>

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

export default function AdminPanel({ setAppError }) {
  const [tab, setTab] = useState('weeks');
  const [contestants, setContestants] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [users, setUsers] = useState([]);
  const [torchRankings, setTorchRankings] = useState([]);
  const [editingWeekId, setEditingWeekId] = useState(null);
  const [newWeekNum, setNewWeekNum] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [c, w, u, tr] = await Promise.all([
        api.getContestants(),
        api.getWeeks(),
        api.getUsers(),
        api.getTorchRankings(),
      ]);
      setContestants(c);
      setWeeks(w);
      setUsers(u);
      setTorchRankings(tr);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      if (setAppError) {
        setAppError(err.status === 0 ? 'server_down' : err.status === 401 ? 'session_expired' : null);
      }
    }
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
        <UsersTab users={users} torchRankings={torchRankings} onRefresh={loadAll} />
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
