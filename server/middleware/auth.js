const { auth } = require('express-oauth2-jwt-bearer');
const { query, ADMIN_EMAIL } = require('../db');
const { sendSlackNotification } = require('../slack');

const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
});

async function loadUser(req, res, next) {
  const sub = req.auth?.payload?.sub;
  if (!sub) {
    return next();
  }
  try {
    const { rows } = await query('SELECT * FROM users WHERE auth0_id = $1', [sub]);
    req.user = rows[0] || null;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function syncUser(req, res) {
  const sub = req.auth?.payload?.sub;
  const { email, name } = req.body;
  if (!sub || !email) {
    return res.status(400).json({ error: 'Missing user info' });
  }

  try {
    let { rows } = await query('SELECT * FROM users WHERE auth0_id = $1', [sub]);
    let user = rows[0];
    if (!user) {
      const isAdmin = email.toLowerCase() === ADMIN_EMAIL ? 1 : 0;
      const displayName = name || email.split('@')[0];
      const inserted = await query(
        'INSERT INTO users (auth0_id, email, name, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
        [sub, email.toLowerCase(), displayName, isAdmin]
      );
      user = inserted.rows[0];
      sendSlackNotification(`New Snuffd player joined: ${displayName} (${email})`);
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { jwtCheck, loadUser, requireAuth, requireAdmin, syncUser };
