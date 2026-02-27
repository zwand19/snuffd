const { Router } = require('express');
const { pool, query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendSlackNotification } = require('../slack');

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { picks } = req.body;
  if (!Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ error: 'Picks array is required' });
  }

  console.log(`[picks] submit ${picks.length} picks for user ${req.user.email} id=${req.user.id}`);
  try {
    const uniqueQIds = [...new Set(picks.map(p => p.question_id))];
    const ph = uniqueQIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: questions } = await query(
      `SELECT q.id, q.required_answers, w.lock_time FROM questions q
       JOIN weeks w ON q.week_id = w.id
       WHERE q.id IN (${ph})`,
      uniqueQIds
    );

    if (questions.length !== uniqueQIds.length) {
      return res.status(400).json({ error: 'Invalid question IDs' });
    }

    for (const q of questions) {
      if (new Date(q.lock_time) <= new Date()) {
        console.warn(`[picks] user ${req.user.email} attempted to pick on locked question id=${q.id}`);
        return res.status(400).json({ error: 'Poll is locked' });
      }
    }

    const reqMap = {};
    for (const q of questions) {
      reqMap[q.id] = q.required_answers || 1;
    }
    const picksByQ = {};
    for (const p of picks) {
      if (!picksByQ[p.question_id]) {
        picksByQ[p.question_id] = [];
      }
      picksByQ[p.question_id].push(p);
    }
    for (const [qId, qPicks] of Object.entries(picksByQ)) {
      const required = reqMap[parseInt(qId)];
      if (qPicks.length !== required) {
        return res.status(400).json({
          error: `Question requires exactly ${required} answer(s), got ${qPicks.length}`
        });
      }
    }

    const delPh = uniqueQIds.map((_, i) => `$${i + 2}`).join(',');
    const { rows: existingPicks } = await query(
      `SELECT question_id FROM picks WHERE user_id = $1 AND question_id IN (${delPh})`,
      [req.user.id, ...uniqueQIds]
    );
    const isEdit = existingPicks.length > 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM picks WHERE user_id = $1 AND question_id IN (${delPh})`,
        [req.user.id, ...uniqueQIds]
      );
      for (const pick of picks) {
        await client.query(
          'INSERT INTO picks (user_id, question_id, answer_id) VALUES ($1, $2, $3)',
          [req.user.id, pick.question_id, pick.answer_id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(`[picks] saved ${picks.length} picks for user ${req.user.email} across ${uniqueQIds.length} question(s)`);
    const action = isEdit ? 'edited their poll picks' : 'submitted poll picks';
    sendSlackNotification(`📊 *${req.user.name}* ${action} (${uniqueQIds.length} question${uniqueQIds.length !== 1 ? 's' : ''})`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[picks] submit error for user ${req.user.email}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/rankings', requireAuth, async (req, res) => {
  console.log(`[picks] rankings requested by ${req.user.email}`);
  try {
    const now = new Date().toISOString();
    const { rows: users } = await query('SELECT id, name FROM users ORDER BY name');
    const { rows: startedQuestions } = await query(
      `SELECT q.id, q.points, q.resolved, q.scoring_type, q.estimated_occurrences
       FROM questions q JOIN weeks w ON q.week_id = w.id
       WHERE w.lock_time <= $1`,
      [now]
    );
    const { rows: allAnswers } = await query(
      'SELECT id, question_id, points_override, is_correct, is_eliminated, occurrences FROM answers'
    );
    const { rows: allPicks } = await query(
      'SELECT user_id, question_id, answer_id FROM picks'
    );

    const answerMap = {};
    const answersByQuestion = {};
    for (const a of allAnswers) {
      answerMap[a.id] = a;
      if (!answersByQuestion[a.question_id]) {
        answersByQuestion[a.question_id] = [];
      }
      answersByQuestion[a.question_id].push(a);
    }

    const picksByUser = {};
    for (const p of allPicks) {
      if (!picksByUser[p.user_id]) {
        picksByUser[p.user_id] = [];
      }
      picksByUser[p.user_id].push(p);
    }

    const startedQIds = new Set(startedQuestions.map(q => q.id));
    const questionMap = {};
    for (const q of startedQuestions) {
      questionMap[q.id] = q;
    }

    const rankings = users.map(user => {
      let score = 0;
      let potentialScore = 0;
      const userPicks = (picksByUser[user.id] || []).filter(p => startedQIds.has(p.question_id));

      for (const pick of userPicks) {
        const q = questionMap[pick.question_id];
        if (!q) {
          continue;
        }
        const pickedAnswer = answerMap[pick.answer_id];
        const basePoints = pickedAnswer?.points_override ?? q.points;

        if (q.scoring_type === 'occurrence') {
          const earned = basePoints * (pickedAnswer?.occurrences || 0);
          score += earned;
          potentialScore += earned;
          if (!q.resolved) {
            const totalOcc = (answersByQuestion[q.id] || [])
              .reduce((sum, a) => sum + (a.occurrences || 0), 0);
            const remaining = Math.max(0, (q.estimated_occurrences || 0) - totalOcc);
            potentialScore += remaining * basePoints;
          }
        } else {
          if (pickedAnswer?.is_correct) {
            score += basePoints;
            potentialScore += basePoints;
          } else if (q.resolved || pickedAnswer?.is_eliminated) {
            // resolved wrong or eliminated — no points
          } else {
            potentialScore += basePoints;
          }
        }
      }

      return { id: user.id, name: user.name, score, potentialScore };
    });

    rankings.sort((a, b) => b.score - a.score || b.potentialScore - a.potentialScore);
    console.log(`[picks] rankings: ${rankings.length} users, top score=${rankings[0]?.score ?? 0}`);
    res.json(rankings);
  } catch (err) {
    console.error('[picks] rankings error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/status/:weekId', requireAuth, async (req, res) => {
  const weekId = req.params.weekId;
  console.log(`[picks] status for week id=${weekId} requested by ${req.user.email}`);
  try {
    const { rows: users } = await query('SELECT id, name FROM users ORDER BY name');
    const { rows: [countRow] } = await query(
      'SELECT COUNT(*) as count FROM questions WHERE week_id = $1',
      [weekId]
    );
    const questionCount = parseInt(countRow.count);

    if (questionCount === 0) {
      return res.json({
        users: users.map(u => ({ ...u, submitted: false, pickCount: 0 })),
        questionCount,
      });
    }

    const { rows: pickCounts } = await query(
      `SELECT p.user_id, COUNT(*) as count FROM picks p
       JOIN questions q ON p.question_id = q.id
       WHERE q.week_id = $1
       GROUP BY p.user_id`,
      [weekId]
    );
    const pickCountMap = {};
    for (const pc of pickCounts) {
      pickCountMap[pc.user_id] = parseInt(pc.count);
    }

    const status = users.map(user => {
      const pickCount = pickCountMap[user.id] || 0;
      return { ...user, submitted: pickCount > 0, pickCount };
    });

    res.json({ users: status, questionCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/random/:weekId', requireAdmin, async (req, res) => {
  const { user_ids } = req.body;
  const weekId = req.params.weekId;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids array is required' });
  }
  console.log(`[picks] random picks for week id=${weekId} users=${user_ids.length} by ${req.user.email}`);

  try {
    const { rows: questions } = await query(
      'SELECT id, required_answers FROM questions WHERE week_id = $1',
      [weekId]
    );
    if (questions.length === 0) {
      return res.status(400).json({ error: 'No questions for this week' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const userId of user_ids) {
        for (const q of questions) {
          const { rows: answers } = await client.query(
            'SELECT id FROM answers WHERE question_id = $1 ORDER BY RANDOM() LIMIT $2',
            [q.id, q.required_answers || 1]
          );
          await client.query(
            'DELETE FROM picks WHERE user_id = $1 AND question_id = $2',
            [userId, q.id]
          );
          for (const a of answers) {
            await client.query(
              'INSERT INTO picks (user_id, question_id, answer_id) VALUES ($1, $2, $3)',
              [userId, q.id, a.id]
            );
          }
        }
      }
      await client.query('COMMIT');
      console.log(`[picks] random picks saved for ${user_ids.length} users in week id=${weekId}`);
      res.json({ success: true, count: user_ids.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[picks] random error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
