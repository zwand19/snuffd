const { Router } = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM weeks ORDER BY week_number ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: weekRows } = await query('SELECT * FROM weeks WHERE id = $1', [req.params.id]);
    const week = weekRows[0];
    if (!week) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const { rows: questions } = await query(
      'SELECT * FROM questions WHERE week_id = $1 ORDER BY sort_order ASC, id ASC',
      [week.id]
    );
    const qIds = questions.map(q => q.id);

    let answers = [];
    let picks = [];
    let myPicks = [];

    if (qIds.length > 0) {
      const ph = qIds.map((_, i) => `$${i + 1}`).join(',');

      const { rows: answerRows } = await query(
        `SELECT * FROM answers WHERE question_id IN (${ph}) ORDER BY sort_order ASC, id ASC`,
        qIds
      );
      answers = answerRows;

      const isLocked = new Date(week.lock_time) <= new Date();
      if (isLocked || req.user?.is_admin) {
        const { rows: pickRows } = await query(
          `SELECT p.*, u.name as user_name FROM picks p
           JOIN users u ON p.user_id = u.id
           WHERE p.question_id IN (${ph})
           ORDER BY u.name ASC`,
          qIds
        );
        picks = pickRows;
      }

      if (req.user) {
        const myPh = qIds.map((_, i) => `$${i + 2}`).join(',');
        const { rows: myPickRows } = await query(
          `SELECT * FROM picks WHERE user_id = $1 AND question_id IN (${myPh})`,
          [req.user.id, ...qIds]
        );
        myPicks = myPickRows;
      }
    }

    const isLocked = new Date(week.lock_time) <= new Date();
    res.json({
      ...week,
      is_locked: isLocked,
      questions: questions.map(q => ({
        ...q,
        answers: answers.filter(a => a.question_id === q.id),
        picks: picks.filter(p => p.question_id === q.id),
        my_picks: myPicks.filter(p => p.question_id === q.id),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { week_number, title, lock_time } = req.body;
  if (!week_number) {
    return res.status(400).json({ error: 'Week number is required' });
  }

  let lockTime = lock_time;
  if (!lockTime) {
    const now = new Date();
    const day = now.getUTCDay();
    const daysUntilWed = (3 - day + 7) % 7 || 7;
    const wed = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(),
      now.getUTCDate() + daysUntilWed, 1, 0, 0
    ));
    lockTime = wed.toISOString();
  }

  try {
    const { rows } = await query(
      'INSERT INTO weeks (week_number, title, lock_time) VALUES ($1, $2, $3) RETURNING *',
      [week_number, title || `Week ${week_number}`, lockTime]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { week_number, title, lock_time } = req.body;
  let i = 1;
  const setClauses = [];
  const values = [];
  if (week_number !== undefined) { setClauses.push(`week_number = $${i++}`); values.push(week_number); }
  if (title !== undefined) { setClauses.push(`title = $${i++}`); values.push(title); }
  if (lock_time !== undefined) { setClauses.push(`lock_time = $${i++}`); values.push(lock_time); }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }
  values.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE weeks SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
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
    await query('DELETE FROM weeks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
