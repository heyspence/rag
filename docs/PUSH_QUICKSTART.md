# Gmail Push Notifications - Quick Start Guide

Get real-time email notifications for your RAG endpoint in under 10 minutes! No polling, instant delivery when emails arrive.

---

## What You'll Need

- ✅ Google Cloud account (free tier available)
- ✅ Gmail address with IMAP enabled
- ✅ ~5 minutes to configure
- ✅ ngrok (for local testing) or a public URL

---

## Quick Setup (10 Minutes)

### Step 1: Create Google Cloud Project

```bash
# Install gcloud CLI if needed
curl https://sdk.cloud.google.com | bash

# Login
gcloud auth login

# Create project
PROJECT_ID="gmail-push-$(date +%Y%m%d)"
gcloud projects create $PROJECT_ID --quiet

# Set as active project
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --quiet
```

### Step 2: Create OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Add redirect URI: `http://localhost:8080/oauth2callback`
5. Copy your **Client ID** and **Client Secret**

### Step 3: Get Refresh Token

Run this script to get your OAuth refresh token:

```bash
# Create the script
cat > /tmp/get-token.js << 'EOF'
const { google } = require('googleapis');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    'http://localhost:8080/oauth2callback'
);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.watch'],
});

console.log('\n📋 Step 1: Visit this URL and authorize:');
console.log(authUrl);
console.log('\n📋 Step 2: Paste the authorization code here:');

process.stdin.once('data', async (code) => {
    const { tokens } = await oauth2Client.getToken(code.toString().trim());
    console.log('\n✅ Your Refresh Token:');
    console.log(tokens.refresh_token);
    console.log('\nAdd this to your .env file as GOOGLE_REFRESH_TOKEN\n');
});
EOF

# Run it (replace with your actual credentials)
node /tmp/get-token.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

### Step 4: Create Pub/Sub Topic & Subscription

```bash
PROJECT_ID="your-project-id"  # Replace with your project ID
TOPIC_NAME="gmail-push-topic"
SUBSCRIPTION_NAME="gmail-push-subscription"

# Create topic
gcloud pubsub topics create $TOPIC_NAME --quiet

# Create subscription (we'll update the endpoint after ngrok starts)
gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
    --topic=$TOPIC_NAME \
    --quiet
```

### Step 5: Install Dependencies

```bash
cd rag_endpoint
npm install googleapis @google-cloud/pubsub
```

### Step 6: Update .env File

Add these lines to your `.env` file:

```bash
# Gmail Push Notifications
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//04xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_PUBSUB_TOPIC_NAME=projects/your-project-id/topics/gmail-push-topic

# Webhook (update with ngrok URL after starting)
GMAIL_PUSH_WEBHOOK_PORT=8080
GMAIL_PUSH_WEBHOOK_URL=http://localhost:8080/gmail-push
```

### Step 7: Start ngrok (Local Testing)

In a **separate terminal**:

```bash
# Install ngrok if needed
npm install -g ngrok

# Create tunnel to webhook port
ngrok http 8080
```

Copy the HTTPS URL shown (e.g., `https://abc123.ngrok.io`) and update your `.env`:

```bash
GMAIL_PUSH_WEBHOOK_URL=https://abc123.ngrok.io/gmail-push
```

### Step 8: Update Pub/Sub Subscription

Update the subscription with your ngrok URL:

```bash
NGROK_URL="https://abc123.ngrok.io"  # Replace with your actual URL

gcloud pubsub subscriptions update $SUBSCRIPTION_NAME \
    --push-endpoint=$NGROK_URL/gmail-push \
    --push-auth-token-audience=$NGROK_URL
```

### Step 9: Start Your Server

```bash
cd rag_endpoint
npm start
```

You should see:

```
[IMAP Service] Starting Gmail Push Notifications...
[Gmail Push] Created Pub/Sub topic: gmail-push-topic
[Gmail Push] Updated existing subscription: gmail-push-subscription
[Gmail Push] ✓ Gmail watch active - History ID: 123456789
[Gmail Push] ✓ Webhook server listening on port 8080
```

### Step 10: Test It! 🎉

Send an email to your Gmail address with `[prompt]` in the subject:

**Subject:** `[prompt] Test push notification`  
**Body:** `This should trigger instant processing!`

Within **1-2 seconds**, you'll see:

```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 123456790
[IMAP Service] Processing email through RAG pipeline...
[IMAP Service] Found X relevant document chunks
```

---

## Architecture Overview

```
┌──────────┐    Gmail Push API    ┌─────────────┐
│  Gmail   │◄── Watch Request ───►│ Your Server │
│          │                      │             │
│ New Email│                      │ [startIMAP] │
│ Arrives  │                      └──────┬──────┘
└──────────┘                             │
     │                                   ▼
     ▼                          ┌─────────────┐
┌─────────────┐                 │   Webhook   │
│ Google Pub/ │◄─ Push Notif ───│  Server     │
│    Sub      │                 │ (port 8080) │
└─────────────┘                 └──────┬──────┘
                                       ▼
                              ┌─────────────┐
                              │ Email Proc. │
                              │   RAG API   │
                              └─────────────┘
```

---

## Important Notes

### ⚠️ Watch Expiration

Gmail watch subscriptions expire after ~7 days. **The code auto-renews them 24 hours before expiration.** No action needed!

### 🔒 Security

- Never commit `.env` to Git (it's already in `.gitignore`)
- Use HTTPS for production webhooks
- Rotate OAuth tokens periodically

### 🚀 Production Deployment

For production, replace ngrok with:
- A cloud server with static IP
- Domain name with SSL certificate
- Process manager (PM2/systemd)

See `GMAIL_PUSH_SETUP.md` for full deployment guide.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid OAuth client" | Verify Client ID/Secret match Google Cloud Console |
| Webhook not received | Check ngrok is running, verify URL in subscription |
| Watch expired | Restart server - it auto-renews |
| No notifications | Ensure email has `[prompt]` in subject (case-sensitive) |

###