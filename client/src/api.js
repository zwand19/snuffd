let getTokenFn = null;
let onAuthError = null;

export function setGetToken(fn) {
  getTokenFn = fn;
}

export function setOnAuthError(fn) {
  onAuthError = fn;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let token;
  try {
    token = getTokenFn ? await getTokenFn() : null;
  } catch {
    if (onAuthError) {
      onAuthError('session_expired');
    }
    throw new ApiError('Session expired', 401);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(BASE_URL + path, { ...options, headers });
  } catch {
    throw new ApiError('Unable to reach the server. It may be waking up — try again in a moment.', 0);
  }

  if (res.status === 401) {
    if (onAuthError) {
      onAuthError('session_expired');
    }
    throw new ApiError('Session expired — please log in again.', 401);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(err.error || 'Request failed', res.status);
  }

  return res.json();
}

export const api = {
  syncUser: (data) => request('/api/auth/sync', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/api/users/me'),
  getUsers: () => request('/api/users'),
  updateUser: (id, data) => request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getWeeks: () => request('/api/weeks'),
  getWeek: (id) => request(`/api/weeks/${id}`),
  createWeek: (data) => request('/api/weeks', { method: 'POST', body: JSON.stringify(data) }),
  updateWeek: (id, data) => request(`/api/weeks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWeek: (id) => request(`/api/weeks/${id}`, { method: 'DELETE' }),

  getContestants: () => request('/api/contestants'),
  createContestant: (data) => request('/api/contestants', { method: 'POST', body: JSON.stringify(data) }),
  updateContestant: (id, data) => request(`/api/contestants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContestant: (id) => request(`/api/contestants/${id}`, { method: 'DELETE' }),

  createQuestion: (data) => request('/api/questions', { method: 'POST', body: JSON.stringify(data) }),
  updateQuestion: (id, data) => request(`/api/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuestion: (id) => request(`/api/questions/${id}`, { method: 'DELETE' }),
  addAnswer: (qId, data) => request(`/api/questions/${qId}/answers`, { method: 'POST', body: JSON.stringify(data) }),
  updateAnswer: (id, data) => request(`/api/questions/answers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAnswer: (id) => request(`/api/questions/answers/${id}`, { method: 'DELETE' }),
  cloneQuestion: (qId) => request(`/api/questions/${qId}/clone`, { method: 'POST' }),
  addContestantAnswers: (qId) => request(`/api/questions/${qId}/add-contestants`, { method: 'POST' }),
  resolveQuestion: (qId, answerIds) => request(`/api/questions/${qId}/resolve`, { method: 'POST', body: JSON.stringify({ answer_ids: Array.isArray(answerIds) ? answerIds : [answerIds] }) }),
  unresolveQuestion: (qId) => request(`/api/questions/${qId}/unresolve`, { method: 'POST' }),

  submitPicks: (picks) => request('/api/picks', { method: 'POST', body: JSON.stringify({ picks }) }),
  getRankings: () => request('/api/picks/rankings'),
  getSubmissionStatus: (weekId) => request(`/api/picks/status/${weekId}`),
  assignRandomPicks: (weekId, userIds) => request(`/api/picks/random/${weekId}`, { method: 'POST', body: JSON.stringify({ user_ids: userIds }) }),

  getGamePhase: () => request('/api/settings/game_phase'),
  setGamePhase: (game_phase) => request('/api/settings/game_phase', { method: 'PUT', body: JSON.stringify({ game_phase }) }),

  getTorches: () => request('/api/torches'),
  getTorchHistory: () => request('/api/torches/history'),
  getTorchWeek: (weekId) => request(`/api/torches/week/${weekId}`),
  pickTorch: (contestant_id) => request('/api/torches/pick', { method: 'POST', body: JSON.stringify({ contestant_id }) }),
  assignRandomTorches: (userIds) => request('/api/torches/random', { method: 'POST', body: JSON.stringify({ user_ids: userIds }) }),
  getTorchRankings: () => request('/api/torches/rankings'),
  awardTorchBonus: (contestant_id, bonus_type) => request('/api/torches/award', { method: 'POST', body: JSON.stringify({ contestant_id, bonus_type }) }),
  resolveTorch: (contestant_id, result) => request('/api/torches/resolve', { method: 'POST', body: JSON.stringify({ contestant_id, result }) }),
  unresolveTorch: (contestant_id) => request('/api/torches/unresolve', { method: 'POST', body: JSON.stringify({ contestant_id }) }),
};
