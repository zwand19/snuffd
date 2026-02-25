const { Router } = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM contestants ORDER BY eliminated ASC, sort_order ASC, name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, season } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO contestants (name, season) VALUES ($1, $2) RETURNING *',
      [name, season || 'current']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name, eliminated, eliminated_week } = req.body;
  let i = 1;
  const setClauses = [];
  const values = [];
  if (name !== undefined) { setClauses.push(`name = $${i++}`); values.push(name); }
  if (eliminated !== undefined) { setClauses.push(`eliminated = $${i++}`); values.push(eliminated ? 1 : 0); }
  if (eliminated_week !== undefined) { setClauses.push(`eliminated_week = $${i++}`); values.push(eliminated_week); }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No updates' });
  }
  values.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE contestants SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM contestants WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
