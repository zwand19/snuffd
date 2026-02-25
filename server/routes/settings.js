const { Router } = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/game_phase', requireAuth, async (req, res) => {
  try {
    const { rows: [row] } = await query(
      "SELECT value FROM game_settings WHERE key = 'game_phase'"
    );
    res.json({ game_phase: row?.value || 'pre_merge' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/game_phase', requireAdmin, async (req, res) => {
  const { game_phase } = req.body;
  const valid = ['pre_merge', 'post_merge', 'pre_finale'];
  if (!valid.includes(game_phase)) {
    return res.status(400).json({ error: `Must be one of: ${valid.join(', ')}` });
  }
  try {
    await query(
      "INSERT INTO game_settings (key, value) VALUES ('game_phase', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [game_phase]
    );
    res.json({ game_phase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
