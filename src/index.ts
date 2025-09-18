import express from 'express';
import path from 'path';
import { existsSync } from 'fs';

const PORT = parseInt(process.env.PORT || '3000', 10);

type TranscriptData = { text: string; timestamp: number; isFinal: boolean };

const app = express();
const sseConnections = new Map<string, express.Response[]>();

const distPath = path.join(__dirname, '../dist/frontend');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
} else {
  // If the frontend isn't built, don't register the wildcard route so dev mode (Vite) can proxy.
  console.warn(`Frontend bundle not found at ${distPath}`);
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

app.get('/api/transcripts', (req, res) => {
  // Support either a token query param or explicit userId for identifying the SSE recipient.
  const userId = String(req.query.userId || req.query.token || 'anonymous');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Basic CORS headers to allow WebViews and remote frontends to connect during dev.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (!sseConnections.has(userId)) sseConnections.set(userId, []);
  sseConnections.get(userId)!.push(res);

  // Announce connection
  res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

  req.on('close', () => {
    const conns = sseConnections.get(userId) || [];
    const idx = conns.indexOf(res);
    if (idx !== -1) conns.splice(idx, 1);
    if (conns.length === 0) sseConnections.delete(userId);
  });
});

export function broadcastTranscript(userId: string, transcript: TranscriptData) {
  const conns = sseConnections.get(userId) || [];
  const payload = JSON.stringify({ type: 'transcript', ...transcript });
  conns.forEach((r) => r.write(`data: ${payload}\n\n`));
}

app.listen(PORT, () => console.log(`Example server listening at http://localhost:${PORT}`));

export default app;