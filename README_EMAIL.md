# Email Receiving Feature - Complete Guide 📧

**Receive emails automatically and process them through your RAG pipeline!**

This guide covers everything you need to know about the email receiving feature, including architecture, setup methods, configuration, testing, and production deployment.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Methods Comparison](#methods-comparison)
4. [Quick Start](#quick-start)
5. [Gmail Push Setup (Recommended)](#gmail-push-setup-recommended)
6. [IMAP Polling Setup (Fallback)](#imap-polling-setup-fallback)
7. [Configuration Reference](#configuration-reference)
8. [Testing Guide](#testing-guide)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)
11. [Security Considerations](#security-considerations)

---

## Overview

The email receiving feature allows your RAG endpoint to automatically process incoming emails and search through indexed documents based on the email content. This enables:

- **Automated document queries** via email
- **Hands-free operation** - no need for manual API calls
- **Integration with existing workflows** - just send an email!
- **Real-time processing** with Gmail Push Notifications (<2 seconds)
- **No third-party services required** - works directly with Google APIs

### How It Works

1. You send an email to your configured Gmail address
2. The subject line must contain `[prompt]` (or your custom tag)
3. The system extracts the email body content
4. Content is processed through the RAG pipeline:
   - Embeddings are generated
   - Vector database is searched
   - Relevant document chunks are retrieved
5. Results are logged to console (or sent back via email if configured)

---

## Architecture

### Gmail Push Notifications Flow (Recommended ⭐)

```
┌─────────────┐     Gmail Watch API      ┌──────────────────┐
│   Gmail     │◄──── Watch Request ─────►│  Your Server     │
│             │                          │                  │
│ New Email   │                          │ [startGmailPush] │
│ Arrives     │                          └────────┬─────────┘
└─────────────┘                                   │
         │                                        ▼
         ▼                               ┌──────────────────┐
┌──────────────────┐                     │  Webhook Server  │
│ Google Cloud     │   Pub/Sub Push      │  (port 8080)     │
│ Pub/Sub Topic    │◄─── Notification ───│                  │
│                  │                     └────────┬─────────┘
│ gmail-push-topic │                              ▼
└──────────────────┐                     ┌──────────────────┐
                   │                     │  Email Processor │
                   │                     │ - Fetch email    │
                   │                     │ - Process RAG    │
                   │                     └──────────────────┘
```

**Key Components:**

1. **Gmail Watch API**: Registers interest in mailbox changes
2. **Google Cloud Pub/Sub**: Message queue for push notifications
3. **Webhook Server**: Receives notifications from Google
4. **Email Processor**: Fetches full email and runs RAG pipeline

### IMAP Polling Flow (Fallback)

```
┌─────────────┐     IMAP IDLE/Poll      ┌──────────────────┐
│   Gmail     │◄──── Connection ───────►│  Your Server     │
│             │                         │                  │
│ New Email   │                         │ [startIMAPIdle]  │
│ Arrives     │                         └────────┬─────────┘
└─────────────┘                                  │
         │                                       ▼
         ▼                               ┌──────────────────┐
         │                               │  Email Processor │
         └──────────────────────────────►│ - Fetch email    │
                                         │ - Process RAG    │
                                         └──────────────────┘
```

**Key Components:**

1. **IMAP Connection**: Persistent connection to Gmail server
2. **IDLE Mode / Polling**: Real-time or periodic checking for new messages
3. **Email Processor**: Fetches full email and runs RAG pipeline

### Complete System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG Endpoint Server                       │
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐   │
│  │  Email Service   │◄───────►│     Gmail (Port 993)    │   │
│  │  (Push or Poll)  │  TLS    │     [IMAP Server]       │   │
│  └────────┬─────────┘         └─────────────────────────┘   │
│           │ New email notification                          │
│           ▼                                                  │
│  ┌──────────────────┐                                        │
│  │ Email Processor  │                                        │
│  │ - Extract body   │                                        │
│  │ - Filter [prompt]│                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐         ┌─────────────────────────┐   │
│  │ Embedding Engine │◄───────►│    Local/Cloud API      │   │
│  │ (Generate vector)│         │    (LM Studio, etc.)    │   │
│  └────────┬─────────┘         └─────────────────────────┘   │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                        │
│  │ Vector Database  │                                        │
│  │ (Search chunks)  │                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                        │
│  │   Results Log    │                                        │
│  │ (Console output) │                                        │
│  └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Methods Comparison

| Feature | Gmail Push ⭐ | IMAP Polling | Webhook Services |
|---------|--------------|--------------|------------------|
| **Setup Time** | ~10 minutes | ~5 minutes | ~15 minutes |
| **Latency** | <2 seconds | ~10 seconds | 1-30 seconds |
| **Third-Party Required** | ❌ No | ❌ No | ✅ Yes (Mailgun, etc.) |
| **Cost** | Free tier available | Free | Paid plans |
| **Reliability** | High (Google API) | Medium (polling) | High (service SLA) |
| **Complexity** | Medium (OAuth setup) | Low | Medium |
| **Works Through Xfinity** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Production Ready** | ✅ Yes | ⚠️ Testing only | ✅ Yes |

### Recommendation

- **For Production**: Use **Gmail Push Notifications** - instant delivery, no polling overhead
- **For Quick Testing**: Use **IMAP Polling** - simplest setup, no Google Cloud account needed
- **For Other Email Providers**: Use **Webhook Services** (Mailgun/SendGrid)

---

## Quick Start

Choose one of the following methods based on your needs:

### Method 1: Gmail Push Notifications (Recommended ⭐)

See complete guide: **[docs/GMAIL_PUSH_SETUP.md](docs/GMAIL_PUSH_SETUP.md)**

**What you'll configure:**
1. Google Cloud Project with Gmail API and Pub/Sub enabled
2. OAuth 2.0 credentials for authentication  
3. Cloud Pub/Sub topic and subscription for push notifications
4. Webhook endpoint to receive instant email notifications

### Method 2: IMAP Polling (Fallback)

See complete guide: **[docs/GMAIL_IMAP_SETUP.md](docs/GMAIL_IMAP_SETUP.md)**

**What you'll configure:**
1. Enable IMAP in Gmail settings
2. Generate app-specific password from Google Account security
3. Add credentials to `.env` file

### Method 3: Webhook Services (Alternative)

See complete guide: **[EMAIL_RECEIVING.md](EMAIL_RECEIVING.md)** (webhook section)

**What you'll configure:**
1. Sign up for Mailgun/SendGrid/AWS SES
2. Configure email forwarding rules
3. Point webhook URL to your server

---

## Gmail Push Setup (Recommended ⭐)

### Prerequisites

- Google Cloud account
- Gmail address with IMAP enabled
- Node.js 18+ installed
- gcloud CLI installed

### Step-by-Step Guide

#### 1. Create Google Cloud Project

```bash
# Install gcloud CLI if needed
curl https://sdk.cloud.google.com | bash
gcloud auth login

# Create and set project
PROJECT_ID="gmail-push-$(date +%Y%m%d)"
gcloud projects create $PROJECT_ID --quiet
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --quiet
```

#### 2. Create OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Add redirect URI: `http://localhost:8080/oauth2callback`
5. Copy your **Client ID** and **Client Secret**

#### 3. Get Refresh Token

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

# Run it (replace with your credentials from Step 2)
node /tmp/get-token.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

#### 4. Create Pub/Sub Resources

```bash
PROJECT_ID="your-project-id"
TOPIC_NAME="gmail-push-topic"
SUBSCRIPTION_NAME="gmail-push-subscription"

gcloud pubsub topics create $TOPIC_NAME --quiet
gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
    --topic=$TOPIC_NAME \
    --quiet
```

#### 5. Update .env File

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

#### 6. Start ngrok for Local Testing

In a **separate terminal**:

```bash
npm install -g ngrok
ngrok http 8080
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `.env`:

```env
GMAIL_PUSH_WEBHOOK_URL=https://abc123.ngrok.io/gmail-push
```

#### 7. Update Pub/Sub Subscription

```bash
NGROK_URL="https://abc123.ngrok.io"  # Replace with your URL

gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=$NGROK_URL/gmail-push \
    --push-auth-token-audience=$NGROK_URL \
    --project=your-project-id
```

#### 8. Start Your Server

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

#### 9. Test It! 🎉

Send an email to your Gmail address with `[prompt]` in the subject:

**Subject:** `[prompt] Test push notification`  
**Body:** `This should trigger instant processing!`

Within **1-2 seconds**, you'll see logs showing the email was processed through the RAG pipeline.

---

## IMAP Polling Setup (Fallback)

### Prerequisites

- Gmail address
- Node.js 18+ installed
- No Google Cloud account needed!

### Step-by-Step Guide

#### 1. Enable IMAP in Gmail

1. Go to [Gmail Settings → Forwarding and POP/IMAP](https://mail.google.com/mail/u/0/#settings/fwdandpop)
2. Select **"Enable IMAP"**
3. Click **"Save Changes"**

#### 2. Generate App Password

1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to **App passwords**
4. Select app: **Mail**, device: **Other**
5. Copy the 16-character password

#### 3. Update .env File

```env
# IMAP Configuration
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=xxxx xxxx xxxx xxxx  # 16-character app password (no spaces)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993

# Subject tag for filtering
EMAIL_SUBJECT_TAG=[prompt]
```

#### 4. Start Server

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

#### 5. Test It! 🎉

Send an email with `[prompt]` in the subject. Within **10 seconds**, it will be processed automatically.

---

## Configuration Reference

### Environment Variables

#### Required (IMAP Polling)

| Variable | Description | Example |
|----------|-------------|---------|
| `IMAP_USER` | Gmail address | `your-email@gmail.com` |
| `IMAP_PASSWORD` | App-specific password | `xxxx xxxx xxxx xxxx` |
| `IMAP_HOST` | IMAP server | `imap.gmail.com` |
| `IMAP_PORT` | IMAP port | `993` |

#### Required (Gmail Push)

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_PROJECT_ID` | GCP project ID | `gmail-push-20250101` |
| `GOOGLE_CLIENT_ID` | OAuth Client ID | `xxxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret | `GOCSPX-xxxxx` |
| `GOOGLE_REFRESH_TOKEN` | OAuth refresh token | `1//04xxxxx` |
| `GOOGLE_PUBSUB_TOPIC_NAME` | Full topic path | `projects/proj-id/topics/topic-name` |
| `GMAIL_PUSH_WEBHOOK_URL` | Public webhook URL | `https://abc.ngrok.io/gmail-push` |

#### Optional (Both Methods)

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_SUBJECT_TAG` | Subject filter tag | `[prompt]` |
| `GMAIL_PUSH_WEBHOOK_PORT` | Webhook server port | `8080` |
| `EMAIL_WEBHOOK_PORT` | HTTP webhook port (for alternatives) | `3000` |

---

## Testing Guide

### Quick Test Checklist

1. ✅ Server starts without errors
2. ✅ Gmail watch is active OR IMAP connection established
3. ✅ Send test email with `[prompt]` in subject
4. ✅ See processing logs within expected time (<2s for Push, <10s for Polling)
5. ✅ RAG results logged to console

### Run Interactive Test Suite

```bash
cd rag_endpoint
./scripts/test-email-receiving.sh
```

This will guide you through all tests step-by-step!

### Manual Testing

#### Send Test Email #1 - Basic Functionality

```
To: your-email@gmail.com
Subject: [prompt] Test RAG endpoint basic functionality
Body: This is a test message to verify the email receiving system works correctly. Please process this through the RAG pipeline and log the results.
```

**Expected Logs (Gmail Push):**
```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 123456790
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
```

**Expected Logs (IMAP Polling):**
```
[IMAP Service] New message detected in INBOX
[IMAP Service] Subject contains [prompt] tag - processing...
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
```

#### Send Test Email #2 - Without Tag (Should Be Ignored)

```
To: your-email@gmail.com
Subject: Regular email without prompt tag
Body: This email should be ignored by the system.
```

**Expected Behavior:**
- ✅ Email received in Gmail inbox
- ✅ Server logs show message detected but NOT processed
- ✅ No RAG pipeline execution

#### Send Test Email #3 - Complex Query

```
To: your-email@gmail.com
Subject: [prompt] Search for information about Spencer Heywood's resume and work experience
Body: Can you please search through all indexed documents to find any resumes, cover letters, job applications, or professional profiles related to Spencer Heywood? I'm particularly interested in his technical skills, previous employment history, and educational background. Please provide a comprehensive summary of what you find.
```

**Expected Behavior:**
- ✅ Email processed successfully
- ✅ Embeddings generated for longer text
- ✅ Multiple relevant document chunks returned (if any exist)
- ✅ Results logged with scores and content snippets

---

## Troubleshooting

### Gmail Push Issues

| Problem | Solution |
|---------|----------|
| "Invalid OAuth client" | Verify Client ID/Secret match Google Cloud Console |
| Webhook not received | Check ngrok is running, verify URL in Pub/Sub subscription |
| Watch expired | Restart server - it auto-renews 24h before expiration |
| No notifications | Ensure email has `[prompt]` in subject (case-sensitive) |

### IMAP Polling Issues

| Problem | Solution |
|---------|----------|
| "Authentication failed" | Use app password, not regular Gmail password |
| "IMAP not enabled" | Enable IMAP in Gmail settings |
| Connection timeout | Verify port 993 is open (not blocked by firewall) |
| No emails detected | Wait for next poll cycle (10 seconds) |

### Debug Commands

```bash
# Check if watch is active (Gmail Push)
curl -X GET "https://gmail.googleapis.com/gmail/v1/users/me/watchOnly" \
  --header "Authorization: Bearer $(gcloud auth print-access-token)"

# Check Pub/Sub messages
gcloud pubsub subscriptions pull gmail-push-subscription \
  --project=$GOOGLE_PROJECT_ID

# Test IMAP connection (requires node-imap)
node -e "require('./emailService').createIMAPConnection({\
  HOST:'imap.gmail.com',PORT:993,\
  USER:'your-email@gmail.com',PASSWORD:'app-password'\
}).then(c => console.log('Connected')).catch(e => console.error(e))"

# Check server logs
pm2 logs rag-endpoint --lines 100
```

---

## Production Deployment

### Deploy with PM2

```bash
# Install PM2 globally
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

### Production Checklist

- [ ] Static public URL (replace ngrok)
- [ ] HTTPS certificate (Let's Encrypt or cloud provider SSL)
- [ ] Environment variables in secrets manager
- [ ] Firewall rules allow webhook port
- [ ] Process manager running (PM2/systemd)
- [ ] Monitoring and alerting configured

### Production .env Example

```env
# Gmail Push - Production Settings
GOOGLE_PROJECT_ID=prod-rag-endpoint
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REFRESH_TOKEN=1//04xxxxxxxxx
GOOGLE_PUBSUB_TOPIC_NAME=projects/proj-id/topics/gmail-push-topic

# Production webhook URL (must be HTTPS)
GMAIL_PUSH_WEBHOOK_PORT=8080
GMAIL_PUSH_WEBHOOK_URL=https://api.yourdomain.com/gmail-push

# IMAP fallback (if needed)
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=xxxx xxxx xxxx xxxx
```

### Update Pub/Sub for Production

```bash
gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=https://api.yourdomain.com/gmail-push \
    --push-auth-token-audience=https://api.yourdomain.com \
    --project=your-production-project-id
```

---

## Security Considerations

### Webhook Authentication

Google sends verification headers with every webhook request:

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

### Token Security

- **Never commit** refresh tokens to Git (`.env` is in `.gitignore`)
- Use environment variables or secrets manager
- Rotate tokens periodically (every 6 months)
- Revoke compromised tokens at [Google Account Permissions](https://myaccount.google.com/permissions)

### Environment Variable Security

```bash
# Ensure .env is in .gitignore
echo ".env" >> .gitignore

# Use file permissions to protect sensitive files
chmod 600 .env

# Consider using secrets manager for production (AWS Secrets Manager, HashiCorp Vault, etc.)
```

---

## Additional Resources

### Documentation Files

- **[README.md](README.md)** - Main project documentation
- **[QUICKSTART.md](QUICKSTART.md)** - 10-minute setup guide
- **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** - Comprehensive testing guide with sign-off template
- **[docs/GMAIL_PUSH_SETUP.md](docs/GMAIL_PUSH_SETUP.md)** - Gmail Push walkthrough with screenshots
- **[docs/PUSH_QUICKSTART.md](docs/PUSH_QUICKSTART.md)** - Get started in 10 minutes
- **[docs/GMAIL_IMAP_SETUP.md](docs/GMAIL_IMAP_SETUP.md)** - IMAP configuration guide

### Testing Scripts

- **`./scripts/test-email-receiving.sh`** - Interactive test suite (run after setup)

### Official Google Documentation

- [Gmail Push API Guide](https://developers.google.com/gmail/api/guides/push)
- [Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs/overview)
- [OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)

### Community & Support

- Stack Overflow: Tag `gmail-api`, `google-cloud-pubsub`
- Google Cloud Support: https://cloud.google.com/support
- GitHub Issues: Report bugs in your project repository

---

## Cost Estimate

Gmail Push Notifications are **free** within Google Cloud's generous limits:

| Service | Free Tier | Overage Cost |
|---------|-----------|--------------|
| Gmail API | 1M requests/day | $0.50 per 1K requests |
| Pub/Sub | 10GB/month | $0.10 per GB |
| Webhook hosting | Depends on provider | - |

**For typical usage (<100 emails/day):** **$0/month** 🎉

---

## Next Steps & Enhancements

### Immediate (After Testing Complete)

1. **Deploy to Production** with PM2 or systemd
2. **Set Up Monitoring** for service health and email processing metrics
3. **Update Gmail Push Subscription** to production webhook URL

### Short-Term Enhancements (1-2 Weeks)

1. **Auto-Response with RAG Results** - Send search results back via email
2. **Attachment Processing** - Extract text from PDF/Word attachments
3. **Email Threading Support** - Keep conversations organized by thread ID

### Medium-Term Enhancements (1-2 Months)

1. **Multiple Gmail Account Support** - Monitor several mailboxes simultaneously
2. **Advanced Filtering Rules** - Filter by sender, label, content length
3. **Web Dashboard** - View processing history and monitor service status

### Long-Term Enhancements (3+ Months)

1. **Multi-Provider Support** - Outlook/Office 365, Yahoo Mail, custom IMAP servers
2. **Natural Language Response Generation** - Use LLM to generate human-readable summaries
3. **Analytics & Insights Dashboard** - Track usage patterns and optimize performance

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

## Support & Getting Help

### Common Issues & Solutions

1. **Server won't start**: Check `.env` configuration and ensure all required variables are set
2. **Authentication errors**: Verify app password (IMAP) or OAuth credentials (Push)
3. **No emails processed**: Confirm `[prompt]` tag is in subject line (case-sensitive)
4. **Webhook not received**: Check ngrok/production URL is accessible and subscription is updated

### Getting Help

1. Check server logs for `[Gmail Push]`, `[IMAP Service]`, or `[Email Webhook]` messages
2. Review Google Cloud Pub/Sub message logs
3. Test with a simple email before complex prompts
4. Verify all environment variables are correctly set in `.env`

---

**That's it!** Your RAG endpoint now receives and processes emails automatically. Whether you choose Gmail Push Notifications for instant delivery or IMAP polling for simplicity, you're all set! 🚀📧

For any questions, refer to the specific setup guides linked above or run the interactive test suite:

```bash
./scripts/test-email-receiving.sh
```

Happy emailing! ✨