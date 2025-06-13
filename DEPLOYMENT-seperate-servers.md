# Separate Servers Deployment Guide

This guide covers deploying the AugmentOS React Example App using a **two-server architecture** where the backend API and React frontend are deployed independently on separate servers or services.

## Architecture Overview

```
┌─────────────────┐    HTTPS/API calls    ┌─────────────────┐
│   Frontend      │ ──────────────────────▶│   Backend       │
│   (React SPA)   │                        │   (Express API) │
│   Static Files  │◀────── SSE/WebSocket ──│   AugmentOS SDK │
└─────────────────┘                        └─────────────────┘
     Port 80/443                               Port 3000
```

**Benefits:**
- Independent scaling of frontend and backend
- Frontend can be served from CDN
- Backend can be optimized for API performance
- Better separation of concerns

**Considerations:**
- Requires CORS configuration
- More complex deployment process
- Need to manage two separate services

## Prerequisites

- Bun ≥ 1.0.0 (for backend)
- Node.js ≥ 18 or Bun (for frontend build)
- Your AugmentOS TPA package name and API key
- Two hosting environments or services

## Code Modifications Required

### 1. Backend Modifications

First, you need to modify the backend to support CORS and remove static file serving. Create a new file `src/backend-separate.ts`:

```typescript
import { TpaServer, TpaSession, AuthenticatedRequest } from '@augmentos/sdk';
import express from 'express';
import cors from 'cors';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set'); })();
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY ?? (() => { throw new Error('AUGMENTOS_API_KEY is not set'); })();
const PORT = parseInt(process.env.PORT || '3000');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://your-frontend-domain.com';

interface TranscriptData {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

class ExampleReactAppBackend extends TpaServer {
  private sseConnections = new Map<string, express.Response[]>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY,
      port: PORT,
    });
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const app = this.getExpressApp();

    // Configure CORS for separate frontend
    app.use(cors({
      origin: [
        FRONTEND_URL,
        'http://localhost:5173', // Vite dev server
        'https://localhost:5173', // HTTPS dev
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Security headers
    app.use((req, res, next) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      next();
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
        'Access-Control-Allow-Origin': FRONTEND_URL,
        'Access-Control-Allow-Credentials': 'true',
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
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        environment: process.env.NODE_ENV,
        frontendUrl: FRONTEND_URL
      });
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        message: 'AugmentOS React Example Backend API',
        frontend: FRONTEND_URL,
        health: '/api/health'
      });
    });
  }

  private sendTranscriptUpdate(userId: string, transcript: TranscriptData): void {
    const connections = this.sseConnections.get(userId);
    if (connections) {
      const data = JSON.stringify({ type: 'transcript', ...transcript });
      connections.forEach(res => res.write(`data: ${data}\n\n`));
    }
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
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

const app = new ExampleReactAppBackend();
app.start().catch(console.error);
```

### 2. Frontend Configuration

Update your `vite.config.ts` to point to the separate backend:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/frontend',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://your-backend-domain.com',
        changeOrigin: true,
        secure: true
      }
    }
  },
  define: {
    // Make backend URL available to frontend
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'https://your-backend-domain.com')
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

### 3. Package.json Updates

Add separate build and deployment scripts:

```json
{
  "scripts": {
    "dev": "concurrently \"bun run dev:backend\" \"bun run dev:frontend\"",
    "dev:backend": "bun --watch src/index.ts",
    "dev:backend-separate": "bun --watch src/backend-separate.ts",
    "dev:frontend": "vite",
    "build": "vite build",
    "build:frontend": "vite build",
    "build:backend": "echo 'Backend uses source files directly'",
    "start:backend": "bun run src/backend-separate.ts",
    "start:frontend": "serve -s dist/frontend -l 3000",
    "preview": "vite preview"
  },
  "devDependencies": {
    // ... existing deps
    "cors": "^2.8.5",
    "serve": "^14.2.0"
  }
}
```

## Deployment Strategies

### Option 1: Container-Based Deployment

#### Backend Dockerfile
```dockerfile
# Backend Dockerfile
FROM oven/bun:1.1.0-slim
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
RUN bun install --production

# Copy source code
COPY src/ ./src/
COPY augmentos-react/ ./augmentos-react/

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start backend
CMD ["bun", "run", "src/backend-separate.ts"]
```

#### Frontend Dockerfile
```dockerfile
# Frontend Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY augmentos-react/ ./augmentos-react/
RUN npm install

# Copy source and build
COPY . .
RUN npm run build:frontend

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist/frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Nginx Configuration for Frontend
```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        # Enable gzip compression
        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

        # Handle React Router
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Cache static assets
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # Security headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
```

### Option 2: Platform-as-a-Service Deployment

#### Backend on Railway/Render/Heroku
```bash
# Backend deployment
git subtree push --prefix=backend heroku-backend main

# Environment variables for backend:
PACKAGE_NAME=com.yourorg.yourapp
AUGMENTOS_API_KEY=your_api_key_here
FRONTEND_URL=https://your-frontend-domain.com
NODE_ENV=production
PORT=3000
```

#### Frontend on Vercel/Netlify/Cloudflare Pages
```bash
# Build settings for frontend:
Build command: npm run build:frontend
Output directory: dist/frontend
Environment variables:
VITE_API_URL=https://your-backend-domain.com
```

### Option 3: AWS Deployment

#### Backend on ECS/Fargate
```yaml
# docker-compose.yml for backend
version: '3.8'
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "3000:3000"
    environment:
      - PACKAGE_NAME=com.yourorg.yourapp
      - AUGMENTOS_API_KEY=your_api_key_here
      - FRONTEND_URL=https://your-frontend-domain.com
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### Frontend on S3 + CloudFront
```bash
# Build and deploy frontend to S3
npm run build:frontend
aws s3 sync dist/frontend/ s3://your-frontend-bucket --delete
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

### Option 4: Google Cloud Deployment

#### Backend on Cloud Run
```bash
# Deploy backend to Cloud Run
gcloud builds submit --tag gcr.io/PROJECT-ID/augmentos-backend .
gcloud run deploy augmentos-backend \
  --image gcr.io/PROJECT-ID/augmentos-backend \
  --platform managed \
  --set-env-vars PACKAGE_NAME=com.yourorg.yourapp,AUGMENTOS_API_KEY=your_key,FRONTEND_URL=https://your-frontend.com
```

#### Frontend on Firebase Hosting
```bash
# Deploy frontend to Firebase
npm run build:frontend
firebase deploy --only hosting
```

## Environment Variables

### Backend Environment Variables
```bash
# Required
PACKAGE_NAME=com.yourorg.yourapp
AUGMENTOS_API_KEY=your_api_key_here
FRONTEND_URL=https://your-frontend-domain.com

# Optional
PORT=3000
NODE_ENV=production
```

### Frontend Environment Variables
```bash
# Required
VITE_API_URL=https://your-backend-domain.com

# Optional for development
VITE_DEV_MODE=false
```

## CORS and Security Configuration

### Backend CORS Setup
The backend must be configured to accept requests from your frontend domain:

```typescript
app.use(cors({
  origin: [
    'https://your-frontend-domain.com',
    'https://www.your-frontend-domain.com',
    // Add all your frontend domains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

### Frontend API Configuration
Update your frontend to use the backend URL:

```typescript
// src/config/api.ts
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-backend-domain.com';

// Usage in components
const response = await fetch(`${API_BASE_URL}/api/transcripts`, {
  headers: {
    'Authorization': `Bearer ${frontendToken}`,
    'Content-Type': 'application/json',
  },
  credentials: 'include',
});
```

## SSL/TLS Configuration

Both servers must use HTTPS in production:

### Backend SSL
- Use a reverse proxy (Nginx, Cloudflare, ALB) for SSL termination
- Or configure SSL directly in your hosting platform

### Frontend SSL
- Most static hosting services (Vercel, Netlify, S3+CloudFront) provide SSL automatically
- Ensure your custom domain has valid SSL certificates

## Monitoring and Health Checks

### Backend Monitoring
```bash
# Health check endpoint
curl https://your-backend-domain.com/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": 1234567890,
  "environment": "production",
  "frontendUrl": "https://your-frontend-domain.com"
}
```

### Frontend Monitoring
- Monitor static file serving
- Check for 404 errors on routes
- Monitor API call success rates

## Scaling Considerations

### Backend Scaling
- Horizontal scaling requires session management for SSE connections
- Consider using Redis for shared state
- Use load balancer with sticky sessions

### Frontend Scaling
- Static files can be served from CDN
- No server-side scaling needed
- Consider edge caching for better performance

## Troubleshooting

### Common CORS Issues
```bash
# Check CORS headers
curl -H "Origin: https://your-frontend-domain.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Authorization" \
     -X OPTIONS \
     https://your-backend-domain.com/api/health
```

### SSE Connection Issues
- Ensure proxy doesn't buffer SSE responses
- Check firewall allows persistent connections
- Verify CORS headers for SSE endpoints

### Build Issues
- Verify environment variables are set correctly
- Check API URL configuration
- Ensure all dependencies are installed

## Cost Optimization

### Backend
- Use serverless functions for low traffic
- Container instances for consistent traffic
- Auto-scaling based on CPU/memory usage

### Frontend
- Use CDN for global distribution
- Enable compression and caching
- Consider edge computing for better performance

---

This separate server architecture provides better scalability and separation of concerns, but requires more careful configuration of CORS, SSL, and environment variables. Choose this approach when you need independent scaling or want to optimize each service separately.
