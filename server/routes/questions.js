const { Router } = require('express');
const { pool, query } = require('../db');
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

router.post('/answers/:id/eliminate', requireAdmin, async (req, res) => {
  const { eliminated } = req.body;
  console.log(`[questions] answer id=${req.params.id} eliminated=${eliminated} by ${req.user.email}`);
  try {
    const { rows } = await query(
      'UPDATE answers SET is_eliminated = $1 WHERE id = $2 RETURNING *',
      [eliminated ? 1 : 0, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(`[questions] eliminate answer error id=${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/answers/:id/correct', requireAdmin, async (req, res) => {
  const { correct } = req.body;
  console.log(`[questions] answer id=${req.params.id} correct=${correct} by ${req.user.email}`);
  try {
    const { rows } = await query(
      'UPDATE answers SET is_correct = $1 WHERE id = $2 RETURNING *',
      [correct ? 1 : 0, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(`[questions] correct answer error id=${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/answers/:id/occurrences', requireAdmin, async (req, res) => {
  const { occurrences } = req.body;
  console.log(`[questions] answer id=${req.params.id} occurrences=${occurrences} by ${req.user.email}`);
  try {
    const { rows } = await query(
      'UPDATE answers SET occurrences = $1 WHERE id = $2 RETURNING *',
      [Math.max(0, occurrences || 0), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(`[questions] occurrences error id=${req.params.id}:`, err.message);
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
  const { week_id, text, points, sort_order, required_answers, scoring_type, estimated_occurrences } = req.body;
  if (!week_id || !text) {
    return res.status(400).json({ error: 'week_id and text are required' });
  }
  console.log(`[questions] create week_id=${week_id} text="${text}" points=${points || 1} by ${req.user.email}`);
  try {
    const { rows } = await query(
      'INSERT INTO questions (week_id, text, points, sort_order, required_answers, scoring_type, estimated_occurrences) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [week_id, text, points || 1, sort_order || 0, required_answers || 1, scoring_type || 'standard', estimated_occurrences || 0]
    );
    console.log(`[questions] created id=${rows[0].id}`);
    res.json(rows[0]);
  } catch (err) {
    console.error('[questions] create error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { text, points, sort_order, required_answers, scoring_type, estimated_occurrences } = req.body;
  let i = 1;
  const setClauses = [];
  const values = [];
  if (text !== undefined) { setClauses.push(`text = $${i++}`); values.push(text); }
  if (points !== undefined) { setClauses.push(`points = $${i++}`); values.push(points); }
  if (sort_order !== undefined) { setClauses.push(`sort_order = $${i++}`); values.push(sort_order); }
  if (required_answers !== undefined) { setClauses.push(`required_answers = $${i++}`); values.push(required_answers); }
  if (scoring_type !== undefined) { setClauses.push(`scoring_type = $${i++}`); values.push(scoring_type); }
  if (estimated_occurrences !== undefined) { setClauses.push(`estimated_occurrences = $${i++}`); values.push(estimated_occurrences); }
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
  console.log(`[questions] DELETE id=${req.params.id} by ${req.user.email}`);
  try {
    await query('DELETE FROM questions WHERE id = $1', [req.params.id]);
    console.log(`[questions] deleted id=${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[questions] delete error id=${req.params.id}:`, err.message);
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
  console.log(`[questions] clone id=${qId} by ${req.user.email}`);
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
      'INSERT INTO questions (week_id, text, points, sort_order, required_answers, scoring_type, estimated_occurrences) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [orig.week_id, newText, orig.points, nextOrder, orig.required_answers || 1, orig.scoring_type || 'standard', orig.estimated_occurrences || 0]
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
    console.log(`[questions] cloned id=${qId} -> new id=${cloned.id} answers=${clonedAnswers.length}`);
    res.json({ ...cloned, answers: clonedAnswers });
  } catch (err) {
    console.error(`[questions] clone error id=${qId}:`, err.message);
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
  const qId = req.params.id;
  console.log(`[questions] RESOLVE id=${qId} by ${req.user.email}`);
  try {
    await query('UPDATE questions SET resolved = 1 WHERE id = $1', [qId]);
    const { rows: [question] } = await query('SELECT * FROM questions WHERE id = $1', [qId]);
    const { rows: answers } = await query(
      'SELECT * FROM answers WHERE question_id = $1 ORDER BY sort_order ASC, id ASC',
      [qId]
    );
    const correctAnswers = answers.filter(a => a.is_correct).map(a => a.text);
    console.log(`[questions] resolved id=${qId} correct=[${correctAnswers.join(', ')}]`);
    res.json({ ...question, answers });
  } catch (err) {
    console.error(`[questions] resolve error id=${qId}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/unresolve', requireAdmin, async (req, res) => {
  const qId = req.params.id;
  console.log(`[questions] UNRESOLVE id=${qId} by ${req.user.email}`);
  try {
    await query('UPDATE questions SET resolved = 0 WHERE id = $1', [qId]);
    const { rows: [question] } = await query('SELECT * FROM questions WHERE id = $1', [qId]);
    console.log(`[questions] unresolved id=${qId}`);
    res.json(question);
  } catch (err) {
    console.error(`[questions] unresolve error id=${qId}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/merge', requireAdmin, async (req, res) => {
  const { week_id, text, source_question_ids, points, scoring_type, estimated_occurrences } = req.body;
  if (!week_id || !text || !Array.isArray(source_question_ids) || source_question_ids.length < 2) {
    return res.status(400).json({ error: 'week_id, text, and at least 2 source_question_ids are required' });
  }
  console.log(`[questions] MERGE week_id=${week_id} sources=[${source_question_ids.join(',')}] by ${req.user.email}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ph = source_question_ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows: sourceQuestions } = await client.query(
      `SELECT id FROM questions WHERE id IN (${ph}) AND week_id = $${source_question_ids.length + 1}`,
      [...source_question_ids, week_id]
    );
    if (sourceQuestions.length !== source_question_ids.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Some source questions not found in this week' });
    }

    const { rows: allAnswers } = await client.query(
      `SELECT * FROM answers WHERE question_id IN (${ph}) ORDER BY sort_order ASC, id ASC`,
      source_question_ids
    );
    const uniqueTexts = [...new Set(allAnswers.map(a => a.text))];

    const { rows: [maxRow] } = await client.query(
      'SELECT MAX(sort_order) as m FROM questions WHERE week_id = $1',
      [week_id]
    );
    const nextOrder = (parseInt(maxRow?.m) || 0) + 1;

    const { rows: [newQ] } = await client.query(
      `INSERT INTO questions (week_id, text, points, sort_order, required_answers, scoring_type, estimated_occurrences)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [week_id, text, points || 1, nextOrder, source_question_ids.length, scoring_type || 'standard', estimated_occurrences || 0]
    );

    const newAnswerMap = {};
    for (let i = 0; i < uniqueTexts.length; i++) {
      const { rows: [a] } = await client.query(
        'INSERT INTO answers (question_id, text, sort_order) VALUES ($1, $2, $3) RETURNING *',
        [newQ.id, uniqueTexts[i], i]
      );
      newAnswerMap[uniqueTexts[i]] = a.id;
    }

    const oldAnswerTextMap = {};
    for (const a of allAnswers) {
      oldAnswerTextMap[a.id] = a.text;
    }

    const { rows: sourcePicks } = await client.query(
      `SELECT * FROM picks WHERE question_id IN (${ph})`,
      source_question_ids
    );

    const inserted = new Set();
    for (const pick of sourcePicks) {
      const answerText = oldAnswerTextMap[pick.answer_id];
      const newAnswerId = newAnswerMap[answerText];
      const key = `${pick.user_id}-${newAnswerId}`;
      if (!newAnswerId || inserted.has(key)) {
        continue;
      }
      await client.query(
        'INSERT INTO picks (user_id, question_id, answer_id) VALUES ($1, $2, $3)',
        [pick.user_id, newQ.id, newAnswerId]
      );
      inserted.add(key);
    }

    await client.query('COMMIT');

    const { rows: newAnswers } = await client.query(
      'SELECT * FROM answers WHERE question_id = $1 ORDER BY sort_order ASC',
      [newQ.id]
    );
    console.log(`[questions] merged -> new id=${newQ.id} answers=${newAnswers.length} picks_cloned=${inserted.size}`);
    res.json({ ...newQ, answers: newAnswers, picks_cloned: inserted.size });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[questions] merge error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
