import { TpaServer, TpaSession, AuthenticatedRequest } from '@augmentos/sdk';
import express from 'express';
import path from 'path';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY ?? (() => { throw new Error('AUGMENTOS_API_KEY is not set in .env file'); })();
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
 * ExampleReactApp - AugmentOS app that demonstrates React frontend integration
 * with live transcript updates using Server-Sent Events
 */
class ExampleReactApp extends TpaServer {
  /** Map to store active SSE connections by userId */
  private sseConnections = new Map<string, express.Response[]>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY,
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
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
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
   * Handle new AugmentOS sessions
   * @param session - The TPA session instance
   * @param sessionId - Unique session identifier
   * @param userId - User identifier
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session: ${sessionId} for user ${userId}`);

    // Show welcome message
    session.layouts.showTextWall("React Example App - Open the webview to see live transcripts!");

    // Listen for transcriptions and relay them to the frontend
    const transcriptionHandler = session.events.onTranscription((data) => {
      // Send both interim and final transcriptions
      this.sendTranscriptUpdate(userId, {
        text: data.text,
        timestamp: Date.now(),
        isFinal: data.isFinal
      });

      // Also show final transcriptions on the glasses
      if (data.isFinal) {
        session.layouts.showTextWall(`You said: ${data.text}`);
      }
    });

    // Clean up handlers when session ends
    this.addCleanupHandler(transcriptionHandler);

    // Handle session disconnect
    session.events.onDisconnected(() => {
      console.log(`Session ${sessionId} disconnected.`);
      // Close any SSE connections for this user
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