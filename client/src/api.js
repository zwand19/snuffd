let getTokenFn = null;

export function setGetToken(fn) {
  getTokenFn = fn;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const token = getTokenFn ? await getTokenFn() : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(BASE_URL + path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
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
  addContestantAnswers: (qId) => request(`/api/questions/${qId}/add-contestants`, { method: 'POST' }),
  resolveQuestion: (qId, answerId) => request(`/api/questions/${qId}/resolve`, { method: 'POST', body: JSON.stringify({ answer_id: answerId }) }),
  unresolveQuestion: (qId) => request(`/api/questions/${qId}/unresolve`, { method: 'POST' }),

  submitPicks: (picks) => request('/api/picks', { method: 'POST', body: JSON.stringify({ picks }) }),
  getRankings: () => request('/api/picks/rankings'),
  getSubmissionStatus: (weekId) => request(`/api/picks/status/${weekId}`),

  getTorches: () => request('/api/torches'),
  getTorchHistory: () => request('/api/torches/history'),
  getTorchWeek: (weekId) => request(`/api/torches/week/${weekId}`),
  pickTorch: (contestant_id) => request('/api/torches/pick', { method: 'POST', body: JSON.stringify({ contestant_id }) }),
  getTorchRankings: () => request('/api/torches/rankings'),
  resolveTorch: (contestant_id, result) => request('/api/torches/resolve', { method: 'POST', body: JSON.stringify({ contestant_id, result }) }),
  unresolveTorch: (contestant_id) => request('/api/torches/unresolve', { method: 'POST', body: JSON.stringify({ contestant_id }) }),
};
