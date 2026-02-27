const { Router } = require('express');
const nodemailer = require('nodemailer');
const { marked } = require('marked');
const { pool, query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, is_admin, created_at FROM users ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const { rows } = await query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, is_admin, created_at',
      [name, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const userId = req.params.id;
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM torch_history WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM torches WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM picks WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/email', requireAdmin, async (req, res) => {
  const { subject, markdown } = req.body;
  if (!subject || !markdown) {
    return res.status(400).json({ error: 'Subject and markdown are required' });
  }
  if (!process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'GMAIL_APP_PASSWORD is not configured' });
  }

  const gmailUser = process.env.GMAIL_USER || 'z.wand19@gmail.com';
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    const { rows: users } = await query('SELECT email, name FROM users ORDER BY name');
    if (users.length === 0) {
      return res.status(400).json({ error: 'No users to email' });
    }

    const bodyHtml = marked(markdown);
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
    res.json({ sent, failed, total: users.length });
  } catch (err) {
    console.error(err);
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
