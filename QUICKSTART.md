# Quick Start Guide - Email Receiving Feature 🚀

Get your RAG endpoint receiving emails in **under 10 minutes**! This guide covers both methods so you can choose what works best for you.

---

## Choose Your Method

| Method | Setup Time | Latency | Best For |
|--------|------------|---------|----------|
| **Gmail Push** ⭐ | ~10 min | <2 seconds | Production use |
| **IMAP Polling** | ~5 min | ~10 seconds | Quick testing |

---

## Method 1: Gmail Push Notifications (Recommended)

### Prerequisites
- Google Cloud account
- Gmail address with IMAP enabled
- Node.js 18+ installed

### Step 1: Install Dependencies

```bash
cd rag_endpoint
npm install googleapis @google-cloud/pubsub express
```

### Step 2: Create Google Cloud Project

```bash
# Install gcloud CLI if needed
curl https://sdk.cloud.google.com | bash
gcloud auth login

# Create project
PROJECT_ID="gmail-push-$(date +%Y%m%d)"
gcloud projects create $PROJECT_ID --quiet
gcloud config set project $PROJECT_ID

# Enable APIs
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --quiet
```

### Step 3: Create OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Add redirect URI: `http://localhost:8080/oauth2callback`
5. Copy your **Client ID** and **Client Secret**

### Step 4: Get Refresh Token

```bash
# Create token script
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

console.log('\n📋 Visit this URL and authorize:');
console.log(authUrl);
console.log('\n📋 Paste the authorization code here:');

process.stdin.once('data', async (code) => {
    const { tokens } = await oauth2Client.getToken(code.toString().trim());
    console.log('\n✅ Your Refresh Token:');
    console.log(tokens.refresh_token);
});
EOF

# Run it (replace with your credentials from Step 3)
node /tmp/get-token.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

### Step 5: Create Pub/Sub Resources

```bash
PROJECT_ID="your-project-id"
TOPIC_NAME="gmail-push-topic"
SUBSCRIPTION_NAME="gmail-push-subscription"

gcloud pubsub topics create $TOPIC_NAME --quiet
gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
    --topic=$TOPIC_NAME \
    --quiet
```

### Step 6: Update .env File

Add these lines to your `.env` file:

```env
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

### Step 7: Start ngrok for Local Testing

In a **separate terminal**:

```bash
npm install -g ngrok
ngrok http 8080
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `.env`:

```env
GMAIL_PUSH_WEBHOOK_URL=https://abc123.ngrok.io/gmail-push
```

### Step 8: Update Pub/Sub Subscription

```bash
NGROK_URL="https://abc123.ngrok.io"  # Replace with your URL

gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=$NGROK_URL/gmail-push \
    --push-auth-token-audience=$NGROK_URL \
    --project=your-project-id
```

### Step 9: Start Your Server

```bash
cd rag_endpoint
npm start
```

You should see:

```
[IMAP Service] Starting Gmail Push Notifications...
[Gmail Push] ✓ Gmail watch active - History ID: 123456789
[Gmail Push] ✓ Webhook server listening on port 8080
[RAG Server] ✓ MCP server connected and ready
```

### Step 10: Test It! 🎉

Send an email to your Gmail address with `[prompt]` in the subject:

**Subject:** `[prompt] Test push notification`  
**Body:** `This should trigger instant processing!`

Within **1-2 seconds**, you'll see logs showing the email was processed through the RAG pipeline.

---

## Method 2: IMAP Polling (Fallback)

If you don't want to set up Google Cloud Push, use simple IMAP polling:

### Step 1: Enable IMAP in Gmail

1. Go to [Gmail Settings → Forwarding and POP/IMAP](https://mail.google.com/mail/u/0/#settings/fwdandpop)
2. Select **"Enable IMAP"**
3. Click **"Save Changes"**

### Step 2: Generate App Password

1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to **App passwords**
4. Select app: **Mail**, device: **Other**
5. Copy the 16-character password

### Step 3: Update .env File

```env
# IMAP Configuration
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=xxxx xxxx xxxx xxxx  # 16-character app password (no spaces)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993

# Subject tag for filtering
EMAIL_SUBJECT_TAG=[prompt]
```

### Step 4: Start Server

```bash
cd rag_endpoint
npm start
```

You should see:

```
[IMAP Service] Using IMAP polling as fallback...
[IMAP Service] ✓ Polling mode active - checking every 10 seconds
[RAG Server] ✓ MCP server connected and ready
```

### Step 5: Test It! 🎉

Send an email with `[prompt]` in the subject. Within **10 seconds**, it will be processed automatically.

---

## Expected Logs When Email Arrives

### Gmail Push (Instant)

```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 123456790
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
```

### IMAP Polling (Within 10 seconds)

```
[IMAP Service] New message detected in INBOX
[IMAP Service] Subject contains [prompt] tag - processing...
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
```

---

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| "Invalid OAuth client" | Verify Client ID/Secret match Google Cloud Console |
| Webhook not received | Check ngrok is running, verify URL in Pub/Sub subscription |
| Watch expired | Restart server - it auto-renews 24h before expiration |
| Authentication failed (IMAP) | Use app password, NOT regular Gmail password |
| No emails detected | Wait for next poll cycle (10 seconds) or check IMAP enabled |

---

## Run Interactive Test Suite

For a guided testing experience:

```bash
cd rag_endpoint
./scripts/test-email-receiving.sh
```

This will walk you through all tests step-by-step!

---

## Next Steps After Testing

### Deploy to Production

```bash
# Install PM2 globally
npm install -g pm2

# Start with process manager
pm2 start index.js --name rag-endpoint

# Enable auto-start on boot
pm2 startup
pm2 save

# Monitor logs
pm2 logs rag-endpoint
```

### Set Up Production Webhook URL

Replace ngrok with your production HTTPS endpoint:

```env
GMAIL_PUSH_WEBHOOK_URL=https://api.yourdomain.com/gmail-push
```

Then update the Pub/Sub subscription:

```bash
gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=https://api.yourdomain.com/gmail-push \
    --push-auth-token-audience=https://api.yourdomain.com \
    --project=your-project-id
```

---

## Additional Resources

- **[README_EMAIL.md](README_EMAIL.md)** - Complete feature overview with architecture diagrams
- **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** - Comprehensive testing guide  
- **[docs/GMAIL_PUSH_SETUP.md](docs/GMAIL_PUSH_SETUP.md)** - Detailed Gmail Push walkthrough
- **[docs/GMAIL_IMAP_SETUP.md](docs/GMAIL_IMAP_SETUP.md)** - IMAP configuration guide

---

## Email Format for Testing

Send emails in this format to test the feature:

```
To: your-email@gmail.com
Subject: [prompt] Your question or prompt here
Body: Additional context or details about what you want to search for
```

**Examples:**

1. **Simple query:**
   ```
   Subject: [prompt] What is in the quarterly sales report?
   Body: Can you provide details about Q3 revenue and growth metrics?
   ```

2. **Complex search:**
   ```
   Subject: [prompt] Search for information about Spencer Heywood's resume
   Body: Please find any resumes, cover letters, or job applications related to Spencer Heywood. I'm interested in his technical skills and work history.
   ```

---

**That's it!** Your RAG endpoint now receives and processes emails automatically. Whether you choose Gmail Push Notifications for instant delivery or IMAP polling for simplicity, you're all set! 🚀📧