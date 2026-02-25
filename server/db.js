const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function query(sql, params) {
  return pool.query(sql, params);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      auth0_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contestants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      season TEXT NOT NULL DEFAULT 'current',
      eliminated INTEGER DEFAULT 0,
      eliminated_week INTEGER,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS weeks (
      id SERIAL PRIMARY KEY,
      week_number INTEGER NOT NULL,
      title TEXT,
      lock_time TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      points INTEGER DEFAULT 1,
      resolved INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS answers (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      points_override INTEGER,
      is_correct INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS picks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS torches (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      contestant_id INTEGER REFERENCES contestants(id),
      points INTEGER DEFAULT 35,
      needs_switch INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS torch_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      contestant_id INTEGER NOT NULL REFERENCES contestants(id),
      action TEXT NOT NULL DEFAULT 'pick',
      points_before INTEGER NOT NULL,
      points_after INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE contestants ADD COLUMN IF NOT EXISTS torch_final_result TEXT;
  `);
}

const ADMIN_EMAIL = 'z.wand19@gmail.com';

module.exports = { pool, query, initDb, ADMIN_EMAIL };
