const { Router } = require('express');
const { pool, query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { picks } = req.body;
  if (!Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ error: 'Picks array is required' });
  }

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const delPh = uniqueQIds.map((_, i) => `$${i + 2}`).join(',');
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

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/rankings', requireAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { rows: users } = await query('SELECT id, name FROM users ORDER BY name');
    const { rows: startedQuestions } = await query(
      `SELECT q.id, q.points, q.resolved
       FROM questions q JOIN weeks w ON q.week_id = w.id
       WHERE w.lock_time <= $1`,
      [now]
    );
    const { rows: allAnswers } = await query(
      'SELECT id, question_id, points_override, is_correct FROM answers'
    );
    const { rows: allPicks } = await query(
      'SELECT user_id, question_id, answer_id FROM picks'
    );

    const answerMap = {};
    const correctAnswerIds = new Set();
    for (const a of allAnswers) {
      answerMap[a.id] = a;
      if (a.is_correct) {
        correctAnswerIds.add(a.id);
      }
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
        if (q.resolved) {
          if (correctAnswerIds.has(pick.answer_id)) {
            const pickedAnswer = answerMap[pick.answer_id];
            const earned = pickedAnswer?.points_override ?? q.points;
            score += earned;
            potentialScore += earned;
          }
        } else {
          const pickedAnswer = answerMap[pick.answer_id];
          const possiblePoints = pickedAnswer?.points_override ?? q.points;
          potentialScore += possiblePoints;
        }
      }

      return { id: user.id, name: user.name, score, potentialScore };
    });

    rankings.sort((a, b) => b.score - a.score || b.potentialScore - a.potentialScore);
    res.json(rankings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/status/:weekId', requireAuth, async (req, res) => {
  const weekId = req.params.weekId;
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

module.exports = router;
