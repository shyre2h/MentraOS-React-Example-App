# Production Deployment Guide

This guide covers deploying the AugmentOS React Example App to production. The application uses a **single server architecture** where one Express/Bun server handles both the API routes and serves the compiled React frontend.

## Quick Start

### Prerequisites
- Bun ≥ 1.0.0
- Your AugmentOS TPA package name and API key
- HTTPS-capable hosting environment

### Environment Variables
Set these environment variables in production:

```bash
PACKAGE_NAME=com.yourorg.yourapp        # Your TPA package name
AUGMENTOS_API_KEY=your_api_key_here     # Your TPA API key
PORT=3000                               # Optional, defaults to 3000
NODE_ENV=production                     # Required for production mode
```

## Deployment Options

### Option 1: Platform-as-a-Service

**Railway:**

Railway provides a modern deployment platform with automatic builds using Nixpacks. Here's a quick guide, or check out our full [Railway Deployment Guide](https://docs.augmentos.org/railway-deployment) for more details.

#### Prerequisites
- GitHub/GitLab repository with your code
- Railway account (sign up at [railway.app](https://railway.app))
- Railway CLI (optional, but recommended)

#### Method 1: Web Dashboard Deployment (Recommended)

1. **Connect Repository:**
   - Go to [railway.app](https://railway.app) and sign in
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your AugmentOS React Example App repository
   - Railway will automatically detect it's a Node.js/Bun project

2. **Configure Environment Variables:**
   In the Railway dashboard, go to your service → Variables tab and add:
   ```
   PACKAGE_NAME=com.yourorg.yourapp
   AUGMENTOS_API_KEY=your_api_key_here
   NODE_ENV=production
   PORT=3000
   ```

3. **Deploy:**
   - Railway will automatically trigger a deployment when you push to your main branch
   - Initial deployment will take 2-3 minutes

**Render:**
1. Connect your GitHub repository
2. Set build command: `bun run build:prod`
3. Set start command: `bun run start:prod`
4. Add environment variables in dashboard

**Heroku:**
```bash
# Add buildpack for Bun
heroku buildpacks:add https://github.com/xhyrom/heroku-buildpack-bun.git

# Deploy
git push heroku main
```


### Option 2: Bare Metal / VM

#### Ubuntu/Debian
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and setup
git clone <your-repo-url>
cd AugmentOS-React-Example-App

# Install dependencies and build
bun install --production
bun run build

# Create systemd service
sudo tee /etc/systemd/system/augmentos-app.service > /dev/null <<EOF
[Unit]
Description=AugmentOS React Example App
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/AugmentOS-React-Example-App
Environment=NODE_ENV=production
Environment=PACKAGE_NAME=com.yourorg.yourapp
Environment=AUGMENTOS_API_KEY=your_api_key_here
Environment=PORT=3000
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable augmentos-app
sudo systemctl start augmentos-app
```

#### Using PM2 (Alternative Process Manager)
```bash
# Install PM2
bun add -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'augmentos-app',
    script: 'bun',
    args: 'run src/index.ts',
    env: {
      NODE_ENV: 'production',
      PACKAGE_NAME: 'com.yourorg.yourapp',
      AUGMENTOS_API_KEY: 'your_api_key_here',
      PORT: 3000
    }
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## HTTPS and Reverse Proxy

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Important for SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### Cloudflare Setup
1. Add your domain to Cloudflare
2. Set SSL/TLS mode to "Full (strict)"
3. Enable "Always Use HTTPS"
4. The app will work with Cloudflare's default settings

## Monitoring and Health Checks

The application includes a health check endpoint at `/api/health`. Configure your load balancer or monitoring system to check this endpoint:

```bash
curl https://yourdomain.com/api/health
# Expected response: {"status":"ok","timestamp":1234567890}
```

## Security Considerations

1. **Environment Variables**: Never commit API keys to version control
2. **HTTPS**: Always use HTTPS in production
3. **Firewall**: Only expose necessary ports (80, 443)
4. **Updates**: Keep dependencies updated regularly
5. **Logging**: Monitor application logs for errors

## Scaling

### Horizontal Scaling
The application can be horizontally scaled, but note:
- SSE connections are stored in memory per instance
- Consider using Redis for shared state if scaling beyond 2-3 instances
- Use a load balancer with sticky sessions for SSE connections

### Vertical Scaling
- Start with 1 CPU, 1GB RAM
- Monitor memory usage (SSE connections consume memory)
- Scale up based on concurrent user load

## Troubleshooting

### Common Issues

**"Token validation failed":**
- Check system clock synchronization
- Verify AUGMENTOS_API_KEY is correct
- Ensure PACKAGE_NAME matches your registered TPA

**SSE connections not working:**
- Verify proxy settings don't buffer responses
- Check firewall allows persistent connections
- Ensure HTTPS is properly configured

**Build failures:**
- Verify Bun version ≥ 1.0.0
- Check all dependencies are available
- Ensure sufficient disk space for build

### Logs
```bash
# Docker logs
docker logs <container-id>

# Systemd logs
sudo journalctl -u augmentos-app -f

# PM2 logs
pm2 logs augmentos-app
```

## Performance Optimization

1. **Enable gzip compression** in your reverse proxy
2. **Set proper cache headers** for static assets
3. **Use CDN** for static assets if needed
4. **Monitor memory usage** for SSE connections
5. **Set up log rotation** to prevent disk space issues

## Backup and Recovery

- **Code**: Ensure your repository is backed up
- **Environment variables**: Document all required environment variables
- **No persistent data**: This application doesn't store data, so no database backups needed

---

For additional help, refer to the [AugmentOS documentation](https://docs.augmentos.com) or contact support.