import { AppServer, AppSession, AuthenticatedRequest } from '@mentra/sdk';
import express from 'express';
import path from 'path';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

/**
 * Interface for transcript data
 */
interface TranscriptData {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

/**
 * ExampleReactApp - MentraOS app that demonstrates React frontend integration
 * with live transcript updates using Server-Sent Events
 */
class ExampleReactApp extends AppServer {
  /** Map to store active SSE connections by userId */
  private sseConnections = new Map<string, express.Response[]>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    this.setupRoutes();
  }

  /**
   * Set up Express routes for the application
   */
  private setupRoutes(): void {
    const app = this.getExpressApp();

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../dist/frontend')));
    }

    // 🔧 Root route: serve React index.html in production, placeholder in dev
    app.get('/', (req, res) => {
      if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
      } else {
        res.send('<h1>Ultra-Fast Karaoke React Webview</h1><p>Dev mode running — build frontend for production.</p>');
      }
    });

    // SSE endpoint for live transcript updates
    app.get('/api/transcripts', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      if (!this.sseConnections.has(userId)) {
        this.sseConnections.set(userId, []);
      }
      this.sseConnections.get(userId)!.push(res);

      res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

      req.on('close', () => {
        const connections = this.sseConnections.get(userId);
        if (connections) {
          const index = connections.indexOf(res);
          if (index > -1) {
            connections.splice(index, 1);
          }
          if (connections.length === 0) {
            this.sseConnections.delete(userId);
          }
        }
      });
    });

    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // 🔧 Catch-all for React Router in production
    if (process.env.NODE_ENV === 'production') {
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
      });
    }
  }

  private sendTranscriptUpdate(userId: string, transcript: TranscriptData): void {
    const connections = this.sseConnections.get(userId);
    if (connections) {
      const data = JSON.stringify({
        type: 'transcript',
        ...transcript
      });

      connections.forEach(res => {
        res.write(`data: ${data}\n\n`);
      });
    }
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session: ${sessionId} for user ${userId}`);

    session.layouts.showTextWall("React Example App - Open the webview to see live transcripts!");

    const transcriptionHandler = session.events.onTranscription((data) => {
      this.sendTranscriptUpdate(userId, {
        text: data.text,
        timestamp: Date.now(),
        isFinal: data.isFinal
      });

      if (data.isFinal) {
        session.layouts.showTextWall(`You said: ${data.text}`);
      }
    });

    this.addCleanupHandler(transcriptionHandler);

    session.events.onDisconnected(() => {
      console.log(`Session ${sessionId} disconnected.`);
      const connections = this.sseConnections.get(userId);
      if (connections) {
        connections.forEach(res => res.end());
        this.sseConnections.delete(userId);
      }
    });
  }
}

// Start the server
const app = new ExampleReactApp();
app.start().catch(console.error);
