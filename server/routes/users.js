const { Router } = require('express');
const nodemailer = require('nodemailer');
const { marked } = require('marked');
const { pool, query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/me', requireAuth, (req, res) => {
  console.log(`[users] /me -> ${req.user.email} id=${req.user.id} admin=${req.user.is_admin}`);
  res.json(req.user);
});

router.get('/', requireAdmin, async (req, res) => {
  console.log(`[users] list all users requested by ${req.user.email}`);
  try {
    const { rows } = await query(
      'SELECT id, email, name, is_admin, in_league, created_at FROM users ORDER BY name'
    );
    console.log(`[users] returning ${rows.length} users`);
    res.json(rows);
  } catch (err) {
    console.error('[users] list error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name, in_league } = req.body;
  if (name == null && in_league === undefined) {
    return res.status(400).json({ error: 'name and/or in_league required' });
  }
  const sets = [];
  const vals = [];
  let i = 1;
  if (name != null) {
    if (!String(name).trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    sets.push(`name = $${i++}`);
    vals.push(name);
  }
  if (in_league !== undefined) {
    sets.push(`in_league = $${i++}`);
    vals.push(in_league ? 1 : 0);
  }
  vals.push(req.params.id);
  console.log(`[users] update id=${req.params.id} by ${req.user.email} fields=${sets.join(', ')}`);
  try {
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, email, name, is_admin, in_league, created_at`,
      vals
    );
    console.log(`[users] updated user id=${req.params.id}`);
    res.json(rows[0]);
  } catch (err) {
    console.error(`[users] update error id=${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/merge', requireAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id);
  const sourceId = parseInt(req.body.source_user_id);
  if (!sourceId || sourceId === targetId) {
    return res.status(400).json({ error: 'Invalid source user' });
  }
  console.log(`[users] MERGE source=${sourceId} -> target=${targetId} by ${req.user.email}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [source] } = await client.query('SELECT id, name FROM users WHERE id = $1', [sourceId]);
    const { rows: [target] } = await client.query('SELECT id, name FROM users WHERE id = $1', [targetId]);
    if (!source || !target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    // Transfer picks that don't conflict with target's existing picks
    const { rowCount: picksTransferred } = await client.query(`
      UPDATE picks SET user_id = $1
      WHERE user_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM picks p2
          WHERE p2.user_id = $1 AND p2.question_id = picks.question_id AND p2.answer_id = picks.answer_id
        )
    `, [targetId, sourceId]);
    await client.query('DELETE FROM picks WHERE user_id = $1', [sourceId]);

    // Transfer torch if target doesn't have one
    const { rows: targetTorch } = await client.query('SELECT id FROM torches WHERE user_id = $1', [targetId]);
    let torchTransferred = false;
    if (targetTorch.length === 0) {
      const { rowCount } = await client.query('UPDATE torches SET user_id = $1 WHERE user_id = $2', [targetId, sourceId]);
      torchTransferred = rowCount > 0;
    } else {
      await client.query('DELETE FROM torches WHERE user_id = $1', [sourceId]);
    }

    const { rowCount: historyTransferred } = await client.query(
      'UPDATE torch_history SET user_id = $1 WHERE user_id = $2', [targetId, sourceId]
    );

    await client.query('DELETE FROM users WHERE id = $1', [sourceId]);
    await client.query('COMMIT');

    console.log(`[users] merged: picks=${picksTransferred} torch=${torchTransferred} history=${historyTransferred}, deleted source user ${sourceId}`);
    res.json({
      success: true,
      source_name: source.name,
      target_name: target.name,
      picks_transferred: picksTransferred,
      torch_transferred: torchTransferred,
      history_transferred: historyTransferred,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[users] merge error:`, err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const userId = req.params.id;
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  console.log(`[users] DELETE id=${userId} requested by ${req.user.email}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM torch_history WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM torches WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM picks WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    console.log(`[users] deleted user id=${userId} and all associated data`);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[users] delete error id=${userId}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/email', requireAdmin, async (req, res) => {
  const { subject, markdown, mode } = req.body;
  if (!subject || !markdown) {
    return res.status(400).json({ error: 'Subject and markdown are required' });
  }

  const rawPass = process.env.GMAIL_APP_PASSWORD;
  const rawUser = process.env.GMAIL_USER;
  console.log(`[users/email] GMAIL_APP_PASSWORD set=${!!rawPass} length=${rawPass?.length ?? 0} preview="${rawPass ? rawPass.slice(0, 4) + '****' : 'MISSING'}"`);
  console.log(`[users/email] GMAIL_USER set=${!!rawUser} value="${rawUser || '(not set, using default)'}"`);

  if (!rawPass) {
    console.error('[users/email] Aborting: GMAIL_APP_PASSWORD is not configured');
    return res.status(500).json({ error: 'GMAIL_APP_PASSWORD is not configured' });
  }

  console.log(`[users/email] request from ${req.user.email} mode=${mode} subject="${subject}"`);
  const gmailUser = rawUser || 'z.wand19@gmail.com';
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    family: 4,
    auth: {
      user: gmailUser,
      pass: rawPass,
    },
  });

  try {
    console.log('[users/email] verifying transporter connection...');
    await transporter.verify();
    console.log('[users/email] transporter verified OK');

    const bodyHtml = marked(markdown);

    if (mode === 'test') {
      console.log(`[users/email] sending test email from=${gmailUser} to=${gmailUser}`);
      await transporter.sendMail({
        from: `Snuffd <${gmailUser}>`,
        to: gmailUser,
        subject: `[TEST] ${subject}`,
        html: buildEmailHtml(bodyHtml).replace(/\{\{name\}\}/g, 'Test User'),
      });
      console.log('[users/email] test email sent successfully');
      return res.json({ sent: 1, failed: 0, total: 1 });
    }

    const { rows: users } = await query('SELECT email, name FROM users ORDER BY name');
    if (users.length === 0) {
      return res.status(400).json({ error: 'No users to email' });
    }

    if (mode === 'all') {
      console.log(`[users] sending bulk BCC email to ${users.length} users`);
      const html = buildEmailHtml(bodyHtml).replace(/\{\{name\}\}/g, 'everyone');
      await transporter.sendMail({
        from: `Snuffd <${gmailUser}>`,
        to: gmailUser,
        bcc: users.map(u => u.email),
        subject,
        html,
      });
      console.log(`[users] bulk BCC email sent to ${users.length} users`);
      return res.json({ sent: users.length, failed: 0, total: users.length });
    }

    console.log(`[users] sending individual emails to ${users.length} users`);
    const html = buildEmailHtml(bodyHtml);
    const results = await Promise.allSettled(
      users.map(u =>
        transporter.sendMail({
          from: `Snuffd <${gmailUser}>`,
          to: u.email,
          subject,
          html: html.replace(/\{\{name\}\}/g, u.name),
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[users] email results: sent=${sent} failed=${failed} total=${users.length}`);
    if (failed > 0) {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[users] email failed for ${users[i].email}:`, r.reason?.message);
        }
      });
    }
    res.json({ sent, failed, total: users.length });
  } catch (err) {
    console.error('[users/email] send error:', err.message);
    console.error('[users/email] error code:', err.code);
    console.error('[users/email] error response:', err.response);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

function buildEmailHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #1a1a2e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #e94560, #c23152); padding: 24px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 28px; letter-spacing: 2px; }
    .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
    .content { background: #16213e; padding: 32px; border-radius: 0 0 12px 12px; color: #e0e0e0; line-height: 1.7; font-size: 16px; }
    .content h1, .content h2, .content h3 { color: #e94560; margin-top: 24px; }
    .content h1 { font-size: 24px; }
    .content h2 { font-size: 20px; }
    .content h3 { font-size: 17px; }
    .content a { color: #e94560; }
    .content strong { color: #fff; }
    .content ul, .content ol { padding-left: 20px; }
    .content li { margin-bottom: 6px; }
    .content blockquote { border-left: 3px solid #e94560; margin: 16px 0; padding: 8px 16px; background: rgba(233,69,96,0.1); border-radius: 0 8px 8px 0; }
    .content code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 14px; }
    .content pre { background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; overflow-x: auto; }
    .content pre code { background: none; padding: 0; }
    .content hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0; }
    .content table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .content th, .content td { padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); text-align: left; }
    .content th { background: rgba(233,69,96,0.2); color: #fff; }
    .footer { text-align: center; padding: 20px; color: rgba(255,255,255,0.3); font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🔥 Snuffd</h1>
      <p>Survivor Fantasy League</p>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      Snuffd — The tribe has spoken.
    </div>
  </div>
</body>
</html>`;
}

module.exports = router;
