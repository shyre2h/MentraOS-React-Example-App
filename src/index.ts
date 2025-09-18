import { AppServer, AppSession, AuthenticatedRequest } from '@mentra/sdk';
import express from 'express';
import path from 'path';
import { existsSync } from 'fs';

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
    const distPath = path.join(__dirname, '../dist/frontend');
    const hasFrontendBundle = existsSync(distPath);

    if (hasFrontendBundle) {
      app.use(express.static(distPath));
    } else {
      console.warn(`Frontend bundle not found at "${distPath}" – static assets will not be served.`);
    }

            // SSE endpoint for live transcript updates
    // SSE endpoint for live transcript updates
    // Note: For simplicity in this example, we're using a middleware approach
    // In production, you'd want to verify the token from the query parameter
    app.get('/api/transcripts', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Store the connection
      if (!this.sseConnections.has(userId)) {
        this.sseConnections.set(userId, []);
      }
      this.sseConnections.get(userId)!.push(res);

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

      // Clean up on disconnect
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

    // Catch-all route for React app (in production)
    if (process.env.NODE_ENV === 'production') {
    // Catch-all route for React app when bundle exists
    if (hasFrontendBundle) {
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  /**
   * Send transcript update to all SSE connections for a user
   * @param userId - The user ID to send updates to
   * @param transcript - The transcript data to send
   */
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

  /**
   * Handle new MentraOS sessions