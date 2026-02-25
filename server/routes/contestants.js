const { Router } = require('express');
const { pool, query } = require('../db');
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE contestants SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    const updated = rows[0];

    if (eliminated && updated.eliminated) {
      const { rows: affected } = await client.query(
        'SELECT * FROM torches WHERE contestant_id = $1',
        [updated.id]
      );
      for (const torch of affected) {
        const newPoints = Math.max(0, torch.points - 3);
        await client.query(
          'UPDATE torches SET points = $1, needs_switch = 1 WHERE id = $2',
          [newPoints, torch.id]
        );
        await client.query(
          `INSERT INTO torch_history (user_id, contestant_id, action, points_before, points_after)
           VALUES ($1, $2, 'eliminated', $3, $4)`,
          [torch.user_id, updated.id, torch.points, newPoints]
        );
      }
    }

    await client.query('COMMIT');
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
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
