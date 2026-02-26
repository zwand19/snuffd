const { Router } = require('express');
const { pool, query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: torches } = await query(
      `SELECT t.user_id, t.contestant_id, t.points, t.needs_switch,
              u.name AS user_name, c.name AS contestant_name, c.eliminated
       FROM torches t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN contestants c ON t.contestant_id = c.id
       ORDER BY t.points DESC`
    );
    res.json(torches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT th.user_id, th.contestant_id, th.action, th.points_before, th.points_after, th.created_at,
              u.name AS user_name, c.name AS contestant_name
       FROM torch_history th
       JOIN users u ON th.user_id = u.id
       JOIN contestants c ON th.contestant_id = c.id
       ORDER BY th.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/week/:weekId', requireAuth, async (req, res) => {
  try {
    const { rows: [week] } = await query('SELECT lock_time FROM weeks WHERE id = $1', [req.params.weekId]);
    if (!week) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const { rows: users } = await query('SELECT id, name FROM users ORDER BY name');
    const assignments = [];

    for (const user of users) {
      const { rows: [entry] } = await query(
        `SELECT th.contestant_id, c.name AS contestant_name
         FROM torch_history th
         JOIN contestants c ON th.contestant_id = c.id
         WHERE th.user_id = $1 AND th.created_at <= $2
         ORDER BY th.created_at DESC LIMIT 1`,
        [user.id, week.lock_time]
      );
      if (entry) {
        assignments.push({
          user_id: user.id,
          user_name: user.name,
          contestant_id: entry.contestant_id,
          contestant_name: entry.contestant_name,
        });
      }
    }

    res.json(assignments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/pick', requireAuth, async (req, res) => {
  const { contestant_id } = req.body;
  if (!contestant_id) {
    return res.status(400).json({ error: 'contestant_id is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [contestant] } = await client.query(
      'SELECT id, name, eliminated FROM contestants WHERE id = $1',
      [contestant_id]
    );
    if (!contestant) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contestant not found' });
    }
    if (contestant.eliminated) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot pick an eliminated contestant' });
    }

    const { rows: [existing] } = await client.query(
      'SELECT * FROM torches WHERE user_id = $1',
      [req.user.id]
    );

    let pointsBefore, pointsAfter, action, penalty = 0;

    if (!existing) {
      pointsBefore = 35;
      pointsAfter = 35;
      action = 'initial';
      await client.query(
        'INSERT INTO torches (user_id, contestant_id, points) VALUES ($1, $2, 35)',
        [req.user.id, contestant_id]
      );
    } else if (existing.contestant_id === contestant_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already holding torch for this contestant' });
    } else if (existing.needs_switch) {
      pointsBefore = existing.points;
      pointsAfter = existing.points;
      action = 'forced_switch';
      await client.query(
        'UPDATE torches SET contestant_id = $1, needs_switch = 0 WHERE user_id = $2',
        [contestant_id, req.user.id]
      );
    } else {
      const { rows: [lockedWeek] } = await client.query(
        "SELECT 1 FROM weeks WHERE lock_time::timestamptz <= NOW() LIMIT 1"
      );
      pointsBefore = existing.points;
      if (!lockedWeek) {
        pointsAfter = existing.points;
        action = 'free_switch';
      } else {
        const { rows: [phaseSetting] } = await client.query(
          "SELECT value FROM game_settings WHERE key = 'game_phase'"
        );
        const phase = phaseSetting?.value || 'pre_merge';
        penalty = phase === 'pre_finale' ? 4 : phase === 'post_merge' ? 3 : 2;
        pointsAfter = Math.max(0, existing.points - penalty);
        action = 'switch';
      }
      await client.query(
        'UPDATE torches SET contestant_id = $1, points = $2 WHERE user_id = $3',
        [contestant_id, pointsAfter, req.user.id]
      );
    }

    await client.query(
      `INSERT INTO torch_history (user_id, contestant_id, action, points_before, points_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, contestant_id, action, pointsBefore, pointsAfter]
    );

    await client.query('COMMIT');

    res.json({
      contestant_id,
      contestant_name: contestant.name,
      points: pointsAfter,
      action,
      penalty,
      needs_switch: 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.get('/rankings', requireAuth, async (req, res) => {
  try {
    const { rows: torches } = await query(
      `SELECT t.user_id, t.contestant_id, t.points, t.needs_switch,
              u.name AS user_name, c.name AS contestant_name,
              c.torch_final_result
       FROM torches t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN contestants c ON t.contestant_id = c.id
       ORDER BY t.points DESC`
    );

    const winnerContestant = torches.find(t => t.torch_final_result === 'winner');
    const winnerId = winnerContestant?.contestant_id;

    let lockedWeeks = [];
    let allHistory = [];
    if (winnerContestant) {
      const { rows: wks } = await query(
        "SELECT id, week_number, lock_time FROM weeks WHERE lock_time::timestamptz <= NOW() ORDER BY week_number DESC"
      );
      lockedWeeks = wks;
      const { rows: hist } = await query(
        'SELECT user_id, contestant_id, action, created_at FROM torch_history ORDER BY created_at ASC'
      );
      allHistory = hist;
    }

    const rankings = torches.map(t => {
      let torchScore = null;
      let consecutiveWeeks = 0;
      let switchedOffWinner = false;

      if (winnerId) {
        const userHist = allHistory.filter(h => h.user_id === t.user_id);
        const everHeldWinner = userHist.some(h => h.contestant_id === winnerId);
        if (everHeldWinner && t.contestant_id !== winnerId) {
          switchedOffWinner = true;
        }

        if (t.torch_final_result === 'winner') {
          for (const wk of lockedWeeks) {
            const entryAtLock = [...userHist]
              .filter(h => new Date(h.created_at) <= new Date(wk.lock_time))
              .pop();
            if (entryAtLock && entryAtLock.contestant_id === t.contestant_id) {
              consecutiveWeeks++;
            } else {
              break;
            }
          }
          consecutiveWeeks = Math.min(consecutiveWeeks, 6);
          torchScore = t.points + consecutiveWeeks;
        }
      }

      if (t.torch_final_result === 'runner_up') {
        torchScore = Math.floor(t.points / 2);
      } else if (t.torch_final_result === 'final_week') {
        torchScore = Math.floor(t.points / 3);
      }

      if (torchScore !== null && switchedOffWinner) {
        torchScore = Math.floor(torchScore * 0.7);
      }

      return {
        user_id: t.user_id,
        user_name: t.user_name,
        contestant_id: t.contestant_id,
        contestant_name: t.contestant_name,
        points: t.points,
        needs_switch: t.needs_switch,
        torch_final_result: t.torch_final_result,
        torchScore,
        consecutiveWeeks: t.torch_final_result === 'winner' ? consecutiveWeeks : undefined,
        switchedOffWinner: switchedOffWinner || undefined,
      };
    });

    rankings.sort((a, b) => {
      if (a.torchScore !== null && b.torchScore !== null) {
        return b.torchScore - a.torchScore;
      }
      return b.points - a.points;
    });

    res.json(rankings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/resolve', requireAdmin, async (req, res) => {
  const { contestant_id, result } = req.body;
  if (!contestant_id || !['winner', 'runner_up', 'final_week'].includes(result)) {
    return res.status(400).json({ error: 'contestant_id and valid result (winner, runner_up, final_week) required' });
  }
  try {
    await query(
      'UPDATE contestants SET torch_final_result = $1 WHERE id = $2',
      [result, contestant_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/award', requireAdmin, async (req, res) => {
  const { contestant_id, bonus_type } = req.body;
  const bonuses = { idol_played: 2, immunity_win: 1 };
  if (!contestant_id || !bonuses[bonus_type]) {
    return res.status(400).json({ error: 'contestant_id and bonus_type (idol_played | immunity_win) required' });
  }
  const amount = bonuses[bonus_type];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: affected } = await client.query(
      'SELECT * FROM torches WHERE contestant_id = $1',
      [contestant_id]
    );
    for (const torch of affected) {
      const newPoints = torch.points + amount;
      await client.query(
        'UPDATE torches SET points = $1 WHERE id = $2',
        [newPoints, torch.id]
      );
      await client.query(
        `INSERT INTO torch_history (user_id, contestant_id, action, points_before, points_after)
         VALUES ($1, $2, $3, $4, $5)`,
        [torch.user_id, contestant_id, bonus_type, torch.points, newPoints]
      );
    }
    await client.query('COMMIT');
    const { rows: [c] } = await query('SELECT name FROM contestants WHERE id = $1', [contestant_id]);
    res.json({ success: true, affected: affected.length, contestant_name: c?.name, amount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/random', requireAdmin, async (req, res) => {
  const { user_ids } = req.body;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids array is required' });
  }

  try {
    const { rows: contestants } = await query(
      'SELECT id, name FROM contestants WHERE eliminated = 0'
    );
    if (contestants.length === 0) {
      return res.status(400).json({ error: 'No active contestants' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const assigned = [];
      for (const userId of user_ids) {
        const { rows: [existing] } = await client.query(
          'SELECT id FROM torches WHERE user_id = $1', [userId]
        );
        if (existing) {
          continue;
        }
        const contestant = contestants[Math.floor(Math.random() * contestants.length)];
        await client.query(
          'INSERT INTO torches (user_id, contestant_id, points) VALUES ($1, $2, 35)',
          [userId, contestant.id]
        );
        await client.query(
          `INSERT INTO torch_history (user_id, contestant_id, action, points_before, points_after)
           VALUES ($1, $2, 'initial', 35, 35)`,
          [userId, contestant.id]
        );
        assigned.push({ user_id: userId, contestant_name: contestant.name });
      }
      await client.query('COMMIT');
      res.json({ success: true, assigned });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/unresolve', requireAdmin, async (req, res) => {
  const { contestant_id } = req.body;
  if (!contestant_id) {
    return res.status(400).json({ error: 'contestant_id required' });
  }
  try {
    await query(
      'UPDATE contestants SET torch_final_result = NULL WHERE id = $1',
      [contestant_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
