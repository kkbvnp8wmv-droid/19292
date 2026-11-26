// Poker Club 伺服器入口：API + 即時同步 + 前端靜態檔案
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import * as db from './db.js';
import { TableManager } from './game/manager.js';
import { TournamentHub } from './game/tournament.js';
import { createApi } from './routes/api.js';
import { attachRealtime } from './realtime.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

db.seedIfNeeded();

const app = express();
app.use(express.json({ limit: '256kb' }));

const manager = new TableManager();
manager.notifications = new Map();
const hub = new TournamentHub(manager);
manager.tournamentHub = hub;

manager.loadFromDb();
hub.start();

const server = http.createServer(app);
const io = attachRealtime(server, manager, hub);
manager.attach(io);

app.use('/api', createApi(manager, hub));

const distDir = path.join(process.cwd(), 'dist');
app.use(express.static(distDir, { maxAge: '1h', index: false }));

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  const indexFile = path.join(distDir, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  return res
    .status(503)
    .send('前端尚未建置，請執行 npm run build（開發時可使用 npm run dev）。');
});

// 定期清理私人房間以外的空桌，避免記憶體成長
setInterval(() => {
  for (const [id, table] of manager.tables) {
    if (table.tournamentId) continue;
    const rec = db.getTableRecord(id);
    if (!rec) {
      manager.tables.delete(id);
      continue;
    }
    if (table.occupiedSeats().length === 0 && rec.kind === 'private' && Date.now() - table.createdAt > 6 * 3600 * 1000) {
      manager.destroyTable(id);
      db.removeTableRecord(id);
    }
  }
}, 5 * 60 * 1000).unref?.();

server.listen(PORT, HOST, () => {
  console.log(`Poker Club server listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => {
  db.persistNow();
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  db.persistNow();
  server.close(() => process.exit(0));
});
