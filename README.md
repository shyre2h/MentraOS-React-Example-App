# MentraOS React Example App

This example demonstrates how to build a React-based webview for MentraOS apps using the `@mentra/react` library.  Check out the full [MentraOS React Documentation](https://docs.mentra.glass/react-webviews) for more details.

## Prerequisites

- Node.js 18+ and Bun installed
- MentraOS installed on your phone
- An MentraOS Developer Console account

## Quick Start

### 1. Setup Your Repo

1. Create a new repo from this template using the `Use this template` dropdown in the upper right or the following command: `gh repo create --template Mentra-Community/MentraOS-React-Example-App`

    ![Create repo from template](https://github.com/user-attachments/assets/c10e14e8-2dc5-4dfa-adac-dd334c1b73a5)

2. Clone your new repo locally: `git clone <your-repo-url>`

### 2. Set Up Environment

1. [Install bun](https://bun.sh/docs/installation)

2. cd into your repo, then type `bun install`

3. Create a `.env` file by copying the example:

  ```bash
  cp .env.example .env
  ```

  Edit `.env` with your app details:

  ```env
  PORT=3000
  PACKAGE_NAME=com.yourname.reactexampleapp
  MENTRAOS_API_KEY=your_api_key_from_console
  ```

### 3. Register Your App

1. Go to [console.mentra.glass](https://console.mentra.glass/)
2. Click "Create App"
3. Set your package name (must match `.env`)
4. Enter your public URL (later, update this to your ngrok URL)
5. Add the MICROPHONE permission (required for transcriptions)
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
ngrok http --url=<YOUR_NGROK_URL> 5173
```

## Architecture

```
┌─────────────────────┐
│   MentraOS Manager  │
│        App          │
└──────────┬──────────┘
           │ Opens webview with token
           ▼
┌─────────────────────┐
│   React Frontend    │
│   (@mentra/react)   │
└──────────┬──────────┘
           │ Authenticated SSE connection
           ▼
┌─────────────────────┐
│   Backend Server    │
│    (@mentra/sdk)    │
└──────────┬──────────┘
           │ Receives transcriptions
           ▼
┌─────────────────────┐
│   MentraOS Session  │
│   (Smart Glasses)   │
└─────────────────────┘
```

## How It Works

### Frontend (React)

1. **Authentication**: The `MentraAuthProvider` automatically extracts and verifies the user token
2. **SSE Connection**: Establishes a Server-Sent Events connection to receive live updates
3. **UI Updates**: Displays transcripts in real-time with connection status

### Backend (Express + MentraOS SDK)

1. **Session Management**: Handles MentraOS sessions when users activate the app
2. **Transcript Relay**: Receives transcription events and forwards them via SSE
3. **Authentication**: SDK middleware validates user tokens automatically

## Project Structure

```
MentraOS-React-Example-App/
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
  const { frontendToken } = useMentraAuth();
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
3. **Testing Auth**: Test through the MentraOS manager app for proper authentication

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
- Ensure you're opening the webview from the MentraOS manager app
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

- [MentraOS Docs](https://docs.mentra.glass)
- [React Webviews Guide](https://docs.mentra.glass/react-webviews)
- [Deployment Guide](DEPLOYMENT-single-server.md)
- [Seperate Frontend/Backend Servers Deployment Guide](DEPLOYMENT-separate-servers.md)
- [Discord Community](https://discord.gg/5ukNvkEAqT)