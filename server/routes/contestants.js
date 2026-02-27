const { Router } = require('express');
const { pool, query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM contestants ORDER BY eliminated ASC, sort_order ASC, name ASC'
    );
    console.log(`[contestants] list: ${rows.length} total (${rows.filter(c => !c.eliminated).length} active) for ${req.user.email}`);
    res.json(rows);
  } catch (err) {
    console.error('[contestants] list error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, season } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  console.log(`[contestants] create name="${name}" season="${season || 'current'}" by ${req.user.email}`);
  try {
    const { rows } = await query(
      'INSERT INTO contestants (name, season) VALUES ($1, $2) RETURNING *',
      [name, season || 'current']
    );
    console.log(`[contestants] created id=${rows[0].id} name="${name}"`);
    res.json(rows[0]);
  } catch (err) {
    console.error('[contestants] create error:', err.message);
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
  console.log(`[contestants] update id=${req.params.id} fields=${setClauses.join(',')} by ${req.user.email}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE contestants SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    const updated = rows[0];

    if (eliminated && updated.eliminated) {
      const { rows: [phaseSetting] } = await client.query(
        "SELECT value FROM game_settings WHERE key = 'game_phase'"
      );
      const phase = phaseSetting?.value || 'pre_merge';
      const elimPenalty = (phase === 'post_merge' || phase === 'pre_finale') ? 7 : 5;

      const { rows: affected } = await client.query(
        'SELECT * FROM torches WHERE contestant_id = $1',
        [updated.id]
      );
      console.log(`[contestants] ELIMINATED "${updated.name}" id=${updated.id} phase=${phase} penalty=${elimPenalty} torches_affected=${affected.length}`);
      for (const torch of affected) {
        const newPoints = Math.max(0, torch.points - elimPenalty);
        console.log(`[contestants] torch user_id=${torch.user_id} points ${torch.points} -> ${newPoints}`);
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
    console.log(`[contestants] updated id=${updated.id} name="${updated.name}"`);
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[contestants] update error id=${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  console.log(`[contestants] DELETE id=${req.params.id} by ${req.user.email}`);
  try {
    await query('DELETE FROM contestants WHERE id = $1', [req.params.id]);
    console.log(`[contestants] deleted id=${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[contestants] delete error id=${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
