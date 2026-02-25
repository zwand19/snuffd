# Snuffd - Survivor Fantasy League

## Setup

### 1. Auth0 Configuration
1. Create a **Single Page Application** in Auth0
2. Create an **API** with identifier `https://snuffd-api`
3. Set allowed callback/logout/web origins to `http://localhost:5173`
4. Copy your domain and client ID

### 2. Environment Variables
```bash
cp .env.example .env
# Fill in your Auth0 credentials and optional Slack webhook URL
```

### 3. Install & Run
```bash
npm run install:all
npm run dev
```

Server runs on `:3001`, client on `:5173` (proxied).

## Stack
- **Frontend**: React + Vite + Auth0 SPA SDK
- **Backend**: Express + better-sqlite3
- **Auth**: Auth0 JWT
- **DB**: SQLite (zero config, stored as `snuffd.db`)

## Admin
The email `zwand19@gmail.com` is auto-granted admin on first login.
