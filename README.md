# AugmentOS React Example App

This example demonstrates how to build a React-based webview for AugmentOS apps using the `@augmentos/react` library. It showcases:

- 🔐 **Automatic authentication** via `@augmentos/react`
- 📡 **Live transcript streaming** using Server-Sent Events (SSE)
- ⚛️ **Modern React patterns** with hooks and TypeScript
- 🎨 **Tailwind CSS styling** for clean, responsive UI
- ⚡ **Real-time updates** with connection status indicators

## Features

- **Authentication Flow**: Seamlessly authenticates users when opened from the AugmentOS manager app
- **Live Transcripts**: Displays speech-to-text transcriptions in real-time as users speak
- **Connection Status**: Visual indicators for connection state
- **Responsive Design**: Works great on all screen sizes

## Prerequisites

- Node.js 18+ and Bun installed
- AugmentOS installed on your phone
- An AugmentOS Developer Console account

## Quick Start

### 1. Clone and Install

```bash
# Clone this repository
git clone <your-repo-url>
cd AugmentOS-React-Example-App

# Install dependencies
bun install
```

### 2. Set Up Environment

Create a `.env` file by copying the example:

```bash
cp .env.example .env
```

Edit `.env` with your app details:

```env
PORT=3000
PACKAGE_NAME=com.yourname.reactexampleapp
AUGMENTOS_API_KEY=your_api_key_from_console
```

### 3. Register Your App

1. Go to [console.AugmentOS.org](https://console.AugmentOS.org/)
2. Click "Create App"
3. Set your package name (must match `.env`)
4. Enter your public URL (use ngrok for development)
5. **Add the MICROPHONE permission** (required for transcriptions)
6. Copy the API key to your `.env` file

### 4. Run the App

For development with hot reload:

```bash
bun run dev
```

This starts:
- Backend server on port 3000
- React dev server on port 5173 (with proxy to backend)

### 5. Expose with ngrok

```bash
ngrok http --url=<YOUR_NGROK_URL> 3000
```

## Architecture

```
┌─────────────────────┐
│  AugmentOS Manager  │
│        App          │
└──────────┬──────────┘
           │ Opens webview with token
           ▼
┌─────────────────────┐
│   React Frontend    │
│  (@augmentos/react) │
└──────────┬──────────┘
           │ Authenticated SSE connection
           ▼
┌─────────────────────┐
│   Backend Server    │
│  (@augmentos/sdk)   │
└──────────┬──────────┘
           │ Receives transcriptions
           ▼
┌─────────────────────┐
│  AugmentOS Session  │
│   (Smart Glasses)   │
└─────────────────────┘
```

## How It Works

### Frontend (React)

1. **Authentication**: The `AugmentosAuthProvider` automatically extracts and verifies the user token
2. **SSE Connection**: Establishes a Server-Sent Events connection to receive live updates
3. **UI Updates**: Displays transcripts in real-time with connection status

### Backend (Express + AugmentOS SDK)

1. **Session Management**: Handles AugmentOS sessions when users activate the app
2. **Transcript Relay**: Receives transcription events and forwards them via SSE
3. **Authentication**: SDK middleware validates user tokens automatically

## Project Structure

```
AugmentOS-React-Example-App/
├── src/
│   ├── index.ts              # Backend server
│   └── frontend/
│       ├── main.tsx          # React entry point
│       ├── App.tsx           # Main app component
│       ├── components/
│       │   └── TranscriptDisplay.tsx
│       └── index.css         # Tailwind CSS imports
├── index.html                # Vite entry HTML
├── vite.config.ts            # Vite configuration
├── tsconfig.json             # TypeScript config
├── package.json              # Dependencies
└── README.md                 # This file
```

## Key Components

### TranscriptDisplay Component

Handles the SSE connection and displays live transcripts:

```typescript
const TranscriptDisplay: React.FC = () => {
  const { frontendToken } = useAugmentosAuth();
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  // ... SSE connection logic
};
```

### Backend SSE Endpoint

Streams transcript updates to connected clients:

```typescript
app.get('/api/transcripts', (req: AuthenticatedRequest, res) => {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // ...
  });
  // Stream updates
});
```

## Development Tips

1. **Hot Reload**: The frontend supports hot module replacement for instant updates
2. **Backend Changes**: Backend changes require a restart (or use `bun --watch`)
3. **Testing Auth**: Test through the AugmentOS manager app for proper authentication

## Production Deployment

For production:

1. Build:
   ```bash
   bun run build:prod
   ```
2. Run:
   ```bash
   bun run start:prod
   ```

3. Deploy to your preferred hosting service.  See [DEPLOYMENT-single-server.md](DEPLOYMENT-single-server.md) for more details.

## Common Issues

### "Not Authenticated" Message
- Ensure you're opening the webview from the AugmentOS manager app
- Check that your app URL in the Developer Console is correct

### No Transcripts Appearing
- Verify MICROPHONE permission is enabled in Developer Console
- Check the browser console for SSE connection errors
- Ensure you're speaking clearly near the device

### SSE Connection Errors
- Check that your backend is running and accessible
- Verify CORS settings if frontend/backend are on different domains
- Look for authentication errors in backend logs


## Resources

- [AugmentOS Docs](https://docs.augmentos.org)
- [React Webviews Guide](https://docs.augmentos.org/react-webviews)
- [Deployment Guide](DEPLOYMENT-single-server.md)
- [Seperate Frontend/Backend Servers Deployment Guide](DEPLOYMENT-separate-servers.md)
- [Discord Community](https://discord.gg/5ukNvkEAqT)