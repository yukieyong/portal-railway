# Student Coding & AI Progress Portal

A coding & AI learning tracker for Malaysian classrooms. Students log in, earn XP and
badges, and mark topics/projects as done. Admins manage students and learning items.

## Run locally

```
node server.js
```

Then open http://localhost:3000

## Deploy to Railway

1. Push these files to a GitHub repo (`server.js`, `index.html`, `package.json`).
2. On railway.com: **New Project → Deploy from GitHub repo** → pick the repo.
3. Railway runs `npm start` automatically (no build step, zero dependencies).
4. (Optional) Add a variable `ADMIN_PIN` to set your own admin PIN (default `admin`).

## Notes

- Database: a JSON file (`data.json`) created next to `server.js` on first run.
  Railway's filesystem is ephemeral — data resets on redeploy/restart unless you
  attach a Railway Volume mounted at `/appdata` (then set env var
  `DATA_DIR=/appdata`) or upgrade to a hosted database later.
- Demo logins: student password `1234` · admin PIN `admin` (change in production
  via the `ADMIN_PIN` variable; student passwords are set by the admin per student).
