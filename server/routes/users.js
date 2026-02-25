const { Router } = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, is_admin, created_at FROM users ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const { rows } = await query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, is_admin, created_at',
      [name, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
