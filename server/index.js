require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const { jwtCheck, loadUser, syncUser } = require('./middleware/auth');
const usersRoutes = require('./routes/users');
const weeksRoutes = require('./routes/weeks');
const contestantsRoutes = require('./routes/contestants');
const picksRoutes = require('./routes/picks');
const questionsRoutes = require('./routes/questions');
const torchesRoutes = require('./routes/torches');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? [process.env.ALLOWED_ORIGIN, 'http://localhost:5173']
  : ['http://localhost:5173'];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/sync', jwtCheck, syncUser);

app.use('/api/users', jwtCheck, loadUser, usersRoutes);
app.use('/api/weeks', jwtCheck, loadUser, weeksRoutes);
app.use('/api/contestants', jwtCheck, loadUser, contestantsRoutes);
app.use('/api/picks', jwtCheck, loadUser, picksRoutes);
app.use('/api/questions', jwtCheck, loadUser, questionsRoutes);
app.use('/api/torches', jwtCheck, loadUser, torchesRoutes);

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Snuffd server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
