# Gmail Push Notifications Setup Guide

This guide walks you through setting up **real-time email notifications** using Google's official Gmail Push API with Cloud Pub/Sub. No polling required - instant delivery when emails arrive!

---

## Overview

Gmail Push Notifications work by:
1. Your server registers a webhook endpoint with Google
2. Google publishes to a Cloud Pub/Sub topic when new emails arrive
3. Pub/Sub delivers the notification to your webhook URL
4. Your server fetches and processes the email immediately

**Benefits:**
- ✅ **Instant delivery** (sub-second latency)
- ✅ **No polling overhead** - saves resources
- ✅ **Official Google API** - production-ready
- ✅ **Works through firewalls** - uses HTTPS webhooks
- ✅ **Scalable** - handles high email volume

---

## Prerequisites

### Required Accounts & Services

1. **Google Cloud Project** (free tier available)
2. **Gmail Account** with IMAP enabled
3. **Public Webhook URL** (ngrok for testing, cloud server for production)

### What You'll Need

- Google Cloud Console access
- Node.js 18+ installed
- `gcloud` CLI (optional but recommended)
- A public URL for receiving webhooks

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create or select project"** → **"New Project"**
3. Name it something like `gmail-push-endpoint`
4. Click **"Create"**

### Enable Required APIs

In your new project:

1. Navigate to **APIs & Services** → **Library**
2. Search and enable these APIs:
   - **Gmail API**
   - **Cloud Pub/Sub API**
3. Wait for activation (usually instant)

---

## Step 2: Create OAuth 2.0 Credentials

### Create OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **"External"** user type
3. Fill in required fields:
   - App name: `RAG Email Endpoint`
   - User support email: your-email@gmail.com
   - Developer contact: your-email@gmail.com
4. Click **"Save and Continue"**
5. Skip Scopes (click "Save and Continue")
6. Skip Test users for now (add later if needed)

### Create OAuth Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **"Web application"**
4. Name: `gmail-push-client`
5. Add authorized redirect URI:
   - For testing: `http://localhost:8080/oauth2callback`
   - For production: `https://your-domain.com/oauth2callback`
6. Click **"Create"**

**Save these values:**
- **Client ID**: `xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com`
- **Client Secret**: `GOCSPX-xxxxxxxxxxxxxxxx`

---

## Step 3: Get OAuth Refresh Token

You need a refresh token to authenticate without user interaction.

### Option A: Using OAuth Playground (Recommended)

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the **⚙️ Settings** icon
3. Check **"Use your own OAuth credentials"**
4. Enter your Client ID and Client Secret
5. Close settings

### Authorize Gmail API

1. In Step 1, find and select: **`https://www.googleapis.com/auth/gmail.watch`**
2. Click **"Authorize APIs"**
3. Sign in with your Gmail account
4. Grant permissions (you may see "This app isn't verified" - click "Advanced" → "Go to...")
5. Copy the **Authorization code** from Step 2
6. Paste into Step 2 and click **"Exchange authorization code for tokens"**
7. Copy the **Refresh token** from Step 3

### Option B: Using Node.js Script

Create `get-refresh-token.js`:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:8080/oauth2callback'
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.watch'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oauth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        console.log('Your refresh token:', token.refresh_token);
        console.log('\nAdd this to your .env file as GOOGLE_REFRESH_TOKEN');
    });
});
```

Run it:
```bash
node get-refresh-token.js
# Follow the prompt, paste the authorization code
# Copy the refresh token that's displayed
```

---

## Step 4: Create Pub/Sub Topic & Subscription

### Using Google Cloud Console

1. Go to **Cloud Pub/Sub** → **Topics**
2. Click **"Create Topic"**
3. Name: `gmail-push-topic`
4. Keep default settings
5. Click **"Create"**

### Create Subscription

1. In the topic details, click **"Create subscription"**
2. Name: `gmail-push-subscription`
3. Type: **Push**
4. Push endpoint URL: (leave blank for now - we'll set this after deploying webhook)
5. Click **"Create"**

### Using gcloud CLI (Alternative)

```bash
# Set your project ID
export GOOGLE_PROJECT_ID="your-project-id"

# Create topic
gcloud pubsub topics create gmail-push-topic \
  --project=$GOOGLE_PROJECT_ID

# Create subscription
gcloud pubsub subscriptions create gmail-push-subscription \
  --topic=gmail-push-topic \
  --project=$GOOGLE_PROJECT_ID \
  --push-endpoint=http://localhost:8080/gmail-push \
  --push-auth-token-audience=http://localhost:8080
```

---

## Step 5: Configure Environment Variables

Update your `.env` file with these new variables:

```bash
# Gmail Push Notifications Configuration
GOOGLE_PROJECT_ID=your-gcp-project-id
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//04xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Pub/Sub Topic (full path)
GOOGLE_PUBSUB_TOPIC_NAME=projects/your-gcp-project-id/topics/gmail-push-topic

# Webhook Configuration
GMAIL_PUSH_WEBHOOK_PORT=8080
GMAIL_PUSH_WEBHOOK_URL=http://localhost:8080/gmail-push  # Update for production!
```

**Important Notes:**
- `GOOGLE_PUBSUB_TOPIC_NAME` must be the **full path**, not just the topic name
- `GMAIL_PUSH_WEBHOOK_URL` must be **publicly accessible** (not localhost in production)
- Keep your `.env` file secure - never commit to Git

---

## Step 6: Test with ngrok (Local Development)

For local testing, use ngrok to create a public tunnel:

```bash
# Install ngrok if you haven't already
npm install -g ngrok

# Start your RAG endpoint server
cd rag_endpoint
npm start

# In a separate terminal, create the tunnel
ngrok http 8080
```

Copy the HTTPS URL shown (e.g., `https://abc123.ngrok.io`) and update your `.env`:

```bash
GMAIL_PUSH_WEBHOOK_URL=https://abc123.ngrok.io/gmail-push
```

**Note:** ngrok URLs change on restart. For production, use a static domain.

---

## Step 7: Start the Server

```bash
cd rag_endpoint
npm start
```

You should see output like this if everything is configured correctly:

```
[IMAP Service] Starting Gmail Push Notifications...
[Gmail Push] Using existing Pub/Sub topic: projects/your-project-id/topics/gmail-push-topic
[Gmail Push] Updated existing subscription: gmail-push-subscription
[Gmail Push] ✓ Gmail watch active - History ID: 123456789
[Gmail Push] ✓ Expiration: 2025-06-15T12:00:00.000Z
[Gmail Push] Starting webhook server to receive push notifications...
[Gmail Push] ✓ Webhook server listening on port 8080
[Gmail Push] Webhook URL: http://localhost:8080/gmail-push
```

---

## Step 8: Test Email Receiving

### Send a Test Email

From any email account, send to your Gmail address:

**Subject:** `[prompt] Test push notification`  
**Body:** `This should trigger instant processing!`

### Watch the Logs

Within **1-2 seconds**, you should see:

```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 123456790
[IMAP Service] Processing email through RAG pipeline...
[IMAP Service] Found X relevant document chunks
[IMAP Service] Email processed successfully via IMAP
```

---

## Architecture Diagram

```
┌─────────────┐     Gmail Push API      ┌──────────────────┐
│   Gmail     │◄──── Watch Request ────►│  Your Server     │
│             │                         │                  │
│ New Email   │                         │ [startIMAPIdle]  │
│ Arrives     │                         └────────┬─────────┘
└─────────────┘                                  │
         │                                       │
         ▼                                       ▼
┌──────────────────┐                    ┌──────────────────┐
│ Google Cloud     │   Pub/Sub Push     │  Webhook Server  │
│ Pub/Sub Topic    │◄─── Notification ──│  (port 8080)     │
│                  │                    │                  │
│ gmail-push-topic │                    │ [startPushWebhook]│
└──────────────────┘                    └────────┬─────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │  Email Processor │
                                        │ - Fetch email    │
                                        │ - Process RAG    │
                                        └──────────────────┘
```

---

## Important: Watch Expiration & Auto-Renewal

Gmail watch subscriptions **expire after ~7 days**. The code automatically renews them 24 hours before expiration.

**What happens:**
1. Google sets an `expiration` timestamp when you call `watch()`
2. Code schedules renewal at `expiration - 24 hours`
3. Renewal calls `watch()` again with new expiration
4. Process repeats indefinitely

**Manual Renewal (if needed):**
```bash
# Restart the server to trigger immediate renewal
Ctrl+C
npm start
```

---

## Production Deployment Checklist

### Before Going Live:

- [ ] **Static Public URL**: Replace ngrok with a real domain
- [ ] **HTTPS Certificate**: Use Let's Encrypt or cloud provider SSL
- [ ] **Environment Variables**: Store securely (AWS Secrets Manager, etc.)
- [ ] **Firewall Rules**: Allow inbound traffic on webhook port
- [ ] **Process Manager**: Use PM2 or systemd to keep server running
- [ ] **Monitoring**: Set up logging and alerting

### Example Production `.env`:

```bash
# Production settings (use secrets manager, don't commit!)
GOOGLE_PROJECT_ID=prod-rag-endpoint
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REFRESH_TOKEN=1//04xxxxxxxxx

GOOGLE_PUBSUB_TOPIC_NAME=projects/proj-id/topics/gmail-push-topic

# Production webhook URL (must be HTTPS)
GMAIL_PUSH_WEBHOOK_PORT=8080
GMAIL_PUSH_WEBHOOK_URL=https://api.yourdomain.com/gmail-push
```

### Deploy with PM2:

```bash
npm install -g pm2

# Start server
pm2 start index.js --name rag-endpoint

# Auto-restart on system boot
pm2 startup
pm2 save

# View logs
pm2 logs rag-endpoint

# Monitor status
pm2 monit
```

---

## Troubleshooting

### Error: "Invalid OAuth client"

**Cause:** OAuth credentials mismatch or consent screen not configured  
**Solution:** Verify Client ID/Secret in `.env` match Google Cloud Console

### Error: "Webhook verification failed"

**Cause:** Google can't reach your webhook endpoint  
**Solution:**
1. Check ngrok is running (if testing locally)
2. Verify `GMAIL_PUSH_WEBHOOK_URL` is publicly accessible
3. Test with: `curl https://your-url.ngrok.io/gmail-push?x-goog-channel-token=test`

### Error: "Permission denied" on Pub/Sub

**Cause:** Service account lacks permissions  
**Solution:** Grant these roles to your service account:
- `Pub/Sub Publisher`
- `Pub/Sub Subscriber`
- `Gmail API User`

### Watch expires unexpectedly

**Cause:** Auto-renewal failed or server restarted  
**Solution:** Restart the server - it will automatically re-establish watch

### No notifications received

**Possible causes:**
1. Email doesn't have `[prompt]` in subject (case-sensitive)
2. Gmail filters moved email before watch could detect it
3. Pub/Sub subscription push endpoint not configured correctly

**Debug steps:**
```bash
# Check if watch is active
curl -X GET "https://gmail.googleapis.com/gmail/v1/users/me/watchOnly" \
  --header "Authorization: Bearer $(gcloud auth print-access-token)"

# Check Pub/Sub messages
gcloud pubsub subscriptions pull gmail-push-subscription \
  --project=$GOOGLE_PROJECT_ID
```

---

## Security Considerations

### Webhook Authentication

Google sends these headers with every webhook request:

| Header | Description |
|--------|-------------|
| `x-goog-resource-state` | Always "create" for new messages |
| `x-goog-channel-token` | Unique token for verification |
| `x-goog-message-number` | Message sequence number |

**Verify webhook requests:**
```javascript
app.post('/gmail-push', (req, res) => {
    const token = req.headers['x-goog-channel-token'];
    
    // Verify token matches expected value
    if (!token || !isValidToken(token)) {
        return res.status(401).send('Unauthorized');
    }
    
    // Process message...
});
```

### OAuth Token Security

- **Never commit** refresh tokens to Git
- Use environment variables or secrets manager
- Rotate tokens periodically (every 6 months)
- Revoke compromised tokens in [Google Account](https://myaccount.google.com/permissions)

---

## Cost Estimate

Gmail Push Notifications are **free** within Google Cloud's generous limits:

| Service | Free Tier | Overage Cost |
|---------|-----------|--------------|
| Gmail API | 1M requests/day | $0.50 per 1K requests |
| Pub/Sub | 10GB/month | $0.10 per GB |
| Webhook hosting | Depends on provider | - |

**For typical usage (<100 emails/day):** **$0/month**

---

## Next Steps

1. ✅ Test with ngrok for local development
2. ✅ Deploy to production server with static URL
3. ✅ Set up monitoring and alerting
4. ✅ Configure Gmail filters to auto-label `[prompt]` emails
5. ✅ Add email response functionality (send RAG results back)

---

## Support Resources

- [Gmail Push API Documentation](https://developers.google.com/gmail/api/guides/push)
- [Cloud Pub/Sub Overview](https://cloud.google.com/pubsub/docs/overview)
- [OAuth 2.0 Setup Guide](https://developers.google.com/identity/protocols/oauth2)
- Project Docs: `EMAIL_RECEIVING.md`, `GMAIL_IMAP_SETUP.md`

---

**That's it!** Your RAG endpoint now receives **instant email notifications** via Google's official push API. No polling, no delays, production-ready! 🎉