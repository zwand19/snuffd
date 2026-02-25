const { Router } = require('express');
const { query } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.put('/answers/:id', requireAdmin, async (req, res) => {
  const { text, points_override } = req.body;
  let i = 1;
  const setClauses = [];
  const values = [];
  if (text !== undefined) { setClauses.push(`text = $${i++}`); values.push(text); }
  if (points_override !== undefined) { setClauses.push(`points_override = $${i++}`); values.push(points_override || null); }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No updates' });
  }
  values.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE answers SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/answers/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM answers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { week_id, text, points, sort_order } = req.body;
  if (!week_id || !text) {
    return res.status(400).json({ error: 'week_id and text are required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO questions (week_id, text, points, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [week_id, text, points || 1, sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { text, points, sort_order } = req.body;
  let i = 1;
  const setClauses = [];
  const values = [];
  if (text !== undefined) { setClauses.push(`text = $${i++}`); values.push(text); }
  if (points !== undefined) { setClauses.push(`points = $${i++}`); values.push(points); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${i++}`); values.push(sort_order); }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No updates' });
  }
  values.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE questions SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
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
    await query('DELETE FROM questions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/answers', requireAdmin, async (req, res) => {
  const { text, points_override, sort_order } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Answer text is required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO answers (question_id, text, points_override, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, text, points_override || null, sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/clone', requireAdmin, async (req, res) => {
  const qId = req.params.id;
  try {
    const { rows: [orig] } = await query('SELECT * FROM questions WHERE id = $1', [qId]);
    if (!orig) {
      return res.status(404).json({ error: 'Question not found' });
    }

    let newText = orig.text;
    const match = newText.match(/#(\d+)$/);
    if (match) {
      newText = newText.replace(/#(\d+)$/, `#${parseInt(match[1]) + 1}`);
    }

    const { rows: [maxRow] } = await query(
      'SELECT MAX(sort_order) as m FROM questions WHERE week_id = $1',
      [orig.week_id]
    );
    const nextOrder = (parseInt(maxRow?.m) || 0) + 1;

    const { rows: [cloned] } = await query(
      'INSERT INTO questions (week_id, text, points, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [orig.week_id, newText, orig.points, nextOrder]
    );

    const { rows: answers } = await query(
      'SELECT * FROM answers WHERE question_id = $1 ORDER BY sort_order ASC, id ASC',
      [qId]
    );
    for (const a of answers) {
      await query(
        'INSERT INTO answers (question_id, text, points_override, sort_order) VALUES ($1, $2, $3, $4)',
        [cloned.id, a.text, a.points_override, a.sort_order]
      );
    }

    const { rows: clonedAnswers } = await query(
      'SELECT * FROM answers WHERE question_id = $1 ORDER BY sort_order ASC, id ASC',
      [cloned.id]
    );
    res.json({ ...cloned, answers: clonedAnswers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/add-contestants', requireAdmin, async (req, res) => {
  const qId = req.params.id;
  try {
    const { rows: contestants } = await query(
      'SELECT * FROM contestants WHERE eliminated = 0 ORDER BY name ASC'
    );
    const { rows: existingAnswers } = await query(
      'SELECT text FROM answers WHERE question_id = $1',
      [qId]
    );
    const existing = existingAnswers.map(a => a.text.toLowerCase());
    const { rows: [maxRow] } = await query(
      'SELECT MAX(sort_order) as m FROM answers WHERE question_id = $1',
      [qId]
    );
    let maxOrder = parseInt(maxRow?.m) || 0;

    let added = 0;
    for (const c of contestants) {
      if (!existing.includes(c.name.toLowerCase())) {
        await query(
          'INSERT INTO answers (question_id, text, sort_order) VALUES ($1, $2, $3)',
          [qId, c.name, maxOrder + added + 1]
        );
        added++;
      }
    }

    const { rows: answers } = await query(
      'SELECT * FROM answers WHERE question_id = $1 ORDER BY sort_order ASC, id ASC',
      [qId]
    );
    res.json({ added, answers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/resolve', requireAdmin, async (req, res) => {
  const { answer_id } = req.body;
  if (!answer_id) {
    return res.status(400).json({ error: 'answer_id is required' });
  }
  const qId = req.params.id;
  try {
    await query('UPDATE answers SET is_correct = 0 WHERE question_id = $1', [qId]);
    await query('UPDATE answers SET is_correct = 1 WHERE id = $1 AND question_id = $2', [answer_id, qId]);
    await query('UPDATE questions SET resolved = 1 WHERE id = $1', [qId]);

    const { rows: [question] } = await query('SELECT * FROM questions WHERE id = $1', [qId]);
    const { rows: answers } = await query(
      'SELECT * FROM answers WHERE question_id = $1 ORDER BY sort_order ASC, id ASC',
      [qId]
    );
    res.json({ ...question, answers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/unresolve', requireAdmin, async (req, res) => {
  const qId = req.params.id;
  try {
    await query('UPDATE answers SET is_correct = 0 WHERE question_id = $1', [qId]);
    await query('UPDATE questions SET resolved = 0 WHERE id = $1', [qId]);
    const { rows: [question] } = await query('SELECT * FROM questions WHERE id = $1', [qId]);
    res.json(question);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
