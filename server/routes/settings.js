const { Router } = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/game_phase', requireAuth, async (req, res) => {
  try {
    const { rows: [row] } = await query(
      "SELECT value FROM game_settings WHERE key = 'game_phase'"
    );
    const phase = row?.value || 'pre_merge';
    console.log(`[settings] game_phase=${phase} for ${req.user.email}`);
    res.json({ game_phase: phase });
  } catch (err) {
    console.error('[settings] get game_phase error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/game_phase', requireAdmin, async (req, res) => {
  const { game_phase } = req.body;
  const valid = ['pre_merge', 'post_merge', 'pre_finale'];
  if (!valid.includes(game_phase)) {
    return res.status(400).json({ error: `Must be one of: ${valid.join(', ')}` });
  }
  console.log(`[settings] game_phase -> ${game_phase} by ${req.user.email}`);
  try {
    await query(
      "INSERT INTO game_settings (key, value) VALUES ('game_phase', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [game_phase]
    );
    console.log(`[settings] game_phase updated to ${game_phase}`);
    res.json({ game_phase });
  } catch (err) {
    console.error('[settings] update game_phase error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
