# Separate Server Deployment Guide

This guide covers deploying the MentraOS React Example App when you want to run the **frontend** and **backend** on separate servers or hosting platforms. This architecture provides greater flexibility, better scaling options, and allows different teams to manage frontend and backend deployments independently.

## Architecture Overview

In a separate server deployment:

```
┌─────────────────────┐    HTTPS      ┌─────────────────────┐
│   Frontend Server   │ ────────────► │   Backend Server    │
│  (React/Vite App)   │   API Calls   │ (Express/Bun API)   │
│                     │               │                     │
│ • Static files      │               │ • /api/* routes     │
│ • HTML/CSS/JS       │               │ • SSE endpoints     │
│ • Served by CDN/    │               │ • MentraOS SDK      │
│   Static hosting    │               │ • Authentication    │
└─────────────────────┘               └─────────────────────┘
           │                                     │
           │                                     │
           ▼                                     ▼
┌─────────────────────┐               ┌─────────────────────┐
│  MentraOS Manager   │               │   MentraOS Cloud    │
│       App           │               │    (Sessions)       │
└─────────────────────┘               └─────────────────────┘
```

## Prerequisites

- **Two separate hosting environments** (e.g., Vercel + Railway, Netlify + Render)
- **Custom domains or known URLs** for both frontend and backend
- **HTTPS enabled** on both servers (required for MentraOS)
- **CORS configuration** properly set up

## Step-by-Step Configuration

### 1. Backend Server Modifications

#### Update Environment Variables

Create or update your backend `.env` file:

```env
# Core MentraOS Configuration
PACKAGE_NAME=com.yourorg.yourapp
MENTRAOS_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=production

# CORS Configuration
FRONTEND_URLS=https://yourapp.vercel.app,https://yourapp-staging.vercel.app
ALLOWED_ORIGINS=https://yourapp.vercel.app,https://yourapp-staging.vercel.app

# Optional: Add staging/dev URLs for development
# FRONTEND_URLS=https://yourapp.vercel.app,http://localhost:5173
```

#### Modify Backend Code

Update your `src/index.ts` to remove static file serving and add proper CORS:

```typescript
import { TpaServer, TpaSession, AuthenticatedRequest } from '@mentra/sdk';
import express from 'express';
import cors from 'cors';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

// Parse allowed origins from environment
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000'  // Local testing
];

/**
 * Interface for transcript data
 */
interface TranscriptData {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

/**
 * ExampleReactApp - MentraOS app backend server for separate deployment
 */
class ExampleReactApp extends TpaServer {
  /** Map to store active SSE connections by userId */
  private sseConnections = new Map<string, express.Response[]>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    this.setupCors();
    this.setupRoutes();
  }

  /**
   * Configure CORS for separate frontend/backend deployment
   */
  private setupCors(): void {
    const app = this.getExpressApp();

    // CORS configuration for separate servers
    app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }

        // Log rejected origins for debugging
        console.warn(`CORS blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin'
      ],
      exposedHeaders: ['Content-Type', 'Authorization']
    }));

    // Handle preflight requests
    app.options('*', cors());
  }

  /**
   * Set up Express routes for the API-only backend
   */
  private setupRoutes(): void {
    const app = this.getExpressApp();

    // Root endpoint to verify backend is running
    app.get('/', (req, res) => {
      res.json({
        status: 'MentraOS React Example Backend',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // SSE endpoint for live transcript updates
    app.get('/api/transcripts', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Set up SSE headers with CORS
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'X-Accel-Buffering': 'no', // Disable nginx buffering for SSE
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
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        cors: {
          allowedOrigins: ALLOWED_ORIGINS,
          requestOrigin: req.headers.origin
        }
      });
    });

    // 404 handler for API routes
    app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
      });
    });
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
        try {
          res.write(`data: ${data}\n\n`);
        } catch (error) {
          console.error('Error sending SSE data:', error);
        }
      });
    }
  }

  /**
   * Handle new MentraOS sessions
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

app.start().then(() => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📍 Allowed origins:`, ALLOWED_ORIGINS);
}).catch(console.error);
```

#### Update Backend Package.json

Create a production-focused `package.json` for the backend:

```json
{
  "name": "mentraos-react-example-backend",
  "version": "1.0.0",
  "description": "MentraOS React Example App - Backend API Server",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "echo 'No build step needed for Bun'",
    "start": "bun run src/index.ts",
    "start:prod": "NODE_ENV=production bun run src/index.ts",
    "test": "echo 'Tests not configured yet'"
  },
  "engines": {
    "bun": ">=1.0.0",
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@mentra/sdk": "^1.1.20",
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 2. Frontend Server Modifications

#### Update Environment Variables

Create a frontend `.env` file:

```env
# Backend API URL (change to your deployed backend URL)
VITE_BACKEND_URL=https://your-backend-api.railway.app

# Optional: Environment indicator
VITE_ENVIRONMENT=production
```

#### Create Frontend-only Package.json

Update your frontend `package.json` to remove backend dependencies:

```json
{
  "name": "mentraos-react-example-frontend",
  "version": "1.0.0",
  "description": "MentraOS React Example App - Frontend",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "@mentra/react": "^0.2.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "@tailwindcss/postcss": "^4.1.10",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.4.24",
    "tailwindcss": "^4.0.0-alpha.2"
  }
}
```

#### Update Vite Configuration

Modify `vite.config.ts` for production builds without proxy:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Optimize for production
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mentra: ['@mentra/react']
        }
      }
    }
  },
  server: {
    port: 5173,
    // Remove proxy configuration for separate deployment
    // The frontend will use VITE_BACKEND_URL directly
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Ensure environment variables are available
  define: {
    // Make sure Vite env vars are properly defined
    'import.meta.env.VITE_BACKEND_URL': JSON.stringify(process.env.VITE_BACKEND_URL || 'http://localhost:3000')
  }
});
```

#### Update Frontend API Calls

Modify your React components to use the backend URL from environment variables:

```typescript
// src/frontend/components/TranscriptDisplay.tsx
import React, { useState, useEffect } from 'react';
import { useMentraAuth } from '@mentra/react';

/**
 * Get the backend URL from environment variables
 */
const getBackendUrl = (): string => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  return backendUrl.replace(/\/$/, ''); // Remove trailing slash
};

/**
 * Component that displays live transcripts from MentraOS sessions
 */
const TranscriptDisplay: React.FC = () => {
  const { frontendToken, isAuthenticated, userId } = useMentraAuth();
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !frontendToken) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');
    setError(null);

    const backendUrl = getBackendUrl();
    const eventSource = new EventSource(
      `${backendUrl}/api/transcripts?token=${encodeURIComponent(frontendToken)}`
    );

    eventSource.onopen = () => {
      setConnectionStatus('connected');
      console.log('SSE connection established');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'transcript') {
          setTranscripts(prev => [
            ...prev,
            `${data.isFinal ? '[FINAL]' : '[INTERIM]'} ${data.text}`
          ]);
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (event) => {
      console.error('SSE connection error:', event);
      setConnectionStatus('disconnected');
      setError('Connection to backend failed. Check your network and backend status.');
    };

    return () => {
      eventSource.close();
      setConnectionStatus('disconnected');
    };
  }, [isAuthenticated, frontendToken]);

  const connectionStatusColor = {
    disconnected: 'text-red-500',
    connecting: 'text-yellow-500',
    connected: 'text-green-500'
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Live Transcripts</h1>
          <div className={`text-sm font-medium ${connectionStatusColor[connectionStatus]}`}>
            ● {connectionStatus.toUpperCase()}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-medium">Connection Error</p>
            <p className="text-sm">{error}</p>
            <p className="text-xs mt-2">Backend URL: {getBackendUrl()}</p>
          </div>
        )}

        {!isAuthenticated ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Please authenticate through the MentraOS manager app.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              User: {userId} | Backend: {getBackendUrl()}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto">
              {transcripts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {connectionStatus === 'connected'
                    ? "Start speaking to see transcripts appear here..."
                    : "Connecting to transcript stream..."}
                </p>
              ) : (
                <div className="space-y-2">
                  {transcripts.map((transcript, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded ${
                        transcript.startsWith('[FINAL]')
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {transcript}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TranscriptDisplay;
```

### 3. Deployment Configurations

#### Backend Deployment Options

**Option A: Railway**

1. **Connect Repository:**
   - Go to [railway.app](https://railway.app)
   - Create new project from GitHub repo
   - Set root directory to your backend folder if in monorepo

2. **Environment Variables:**
   ```env
   PACKAGE_NAME=com.yourorg.yourapp
   MENTRAOS_API_KEY=your_api_key_here
   NODE_ENV=production
   PORT=3000
   ALLOWED_ORIGINS=https://yourapp.vercel.app,https://yourapp-staging.vercel.app
   ```

3. **Deployment Settings:**
   - Build Command: `bun install`
   - Start Command: `bun run start:prod`

**Option B: Render.com**

1. **Create Web Service:**
   - Connect your repository
   - Environment: `Node`
   - Build Command: `bun install`
   - Start Command: `bun run start:prod`

2. **Environment Variables:** (Same as Railway)

**Option C: Heroku**

```bash
# Add Bun buildpack
heroku buildpacks:add https://github.com/xhyrom/heroku-buildpack-bun.git

# Configure environment variables
heroku config:set PACKAGE_NAME=com.yourorg.yourapp
heroku config:set MENTRAOS_API_KEY=your_api_key
heroku config:set ALLOWED_ORIGINS=https://yourapp.vercel.app

# Deploy
git push heroku main
```

#### Frontend Deployment Options

**Option A: Vercel**

1. **Connect Repository:**
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Set root directory to your frontend folder if in monorepo

2. **Build Settings:**
   - Framework Preset: `Vite`
   - Build Command: `bun run build`
   - Output Directory: `dist`

3. **Environment Variables:**
   ```env
   VITE_BACKEND_URL=https://your-backend-api.railway.app
   VITE_ENVIRONMENT=production
   ```

**Option B: Netlify**

1. **Build Settings:**
   - Build Command: `bun install && bun run build`
   - Publish Directory: `dist`

2. **Environment Variables:** (Same as Vercel)

3. **Netlify Redirects (`public/_redirects`):**
   ```
   /*    /index.html   200
   ```

**Option C: AWS S3 + CloudFront**

1. **Build locally:**
   ```bash
   bun run build
   ```

2. **Upload to S3:**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name/
   ```

3. **Configure CloudFront** for SPA routing

### 4. Testing the Deployment

#### Backend Testing

```bash
# Test health endpoint
curl https://your-backend-api.railway.app/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": 1234567890,
  "cors": {
    "allowedOrigins": ["https://yourapp.vercel.app"],
    "requestOrigin": null
  }
}
```

#### Frontend Testing

1. **Local Testing with Remote Backend:**
   ```bash
   # Set backend URL in .env.local
   echo "VITE_BACKEND_URL=https://your-backend-api.railway.app" > .env.local

   # Run frontend locally
   bun run dev
   ```

2. **Production Testing:**
   - Open your deployed frontend URL
   - Check browser console for CORS errors
   - Test authentication flow through MentraOS app
   - Verify SSE connection in Network tab

### 5. Monitoring and Troubleshooting

#### Common Issues

**CORS Errors:**
```bash
# Check if backend allows your frontend origin
curl -H "Origin: https://yourapp.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: authorization" \
     -X OPTIONS \
     https://your-backend-api.railway.app/api/health
```

**SSE Connection Issues:**
- Check Network tab for SSE connections
- Verify authentication token is being sent
- Check backend logs for connection errors

**Environment Variable Issues:**
```typescript
// Add debug logging to frontend
console.log('Backend URL:', import.meta.env.VITE_BACKEND_URL);
console.log('Environment:', import.meta.env.VITE_ENVIRONMENT);
```

#### Health Monitoring

Set up monitoring for both servers:

**Backend Monitoring:**
- Health check endpoint: `/api/health`
- Monitor SSE connection count
- Track authentication failures

**Frontend Monitoring:**
- Monitor build times and deployment success
- Track client-side errors with error boundaries
- Monitor API call success rates
