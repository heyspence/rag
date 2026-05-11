# Getting Started - Email Receiving Feature 📧

**Welcome!** This guide will help you get your RAG endpoint receiving and processing emails automatically. Choose the method that works best for you:

---

## Quick Decision Guide

| If you want... | Use this method | Setup time |
|----------------|-----------------|------------|
| **Instant email delivery (<2 seconds)** | Gmail Push Notifications ⭐ | ~10 minutes |
| **Simple setup, no Google Cloud account** | IMAP Polling (Fallback) | ~5 minutes |

---

## What This Feature Does

When you send an email with `[prompt]` in the subject line to your configured Gmail address:

1. ✅ Email is received automatically (no manual forwarding needed)
2. ✅ System extracts the email body content
3. ✅ Content is processed through your RAG pipeline
4. ✅ Relevant document chunks are retrieved from your indexed documents
5. ✅ Results are logged to console (or sent back via email if configured)

**Example:**
```
To: your-email@gmail.com
Subject: [prompt] What does the quarterly sales report say?
Body: Can you provide details about Q3 revenue and growth metrics?
```

---

## Method 1: Gmail Push Notifications ⭐ (Recommended for Production)

### Why Choose This?
- **Instant delivery** - sub-second latency
- **No polling overhead** - saves resources
- **Production-ready** - official Google API
- **Free tier available** - no third-party services required

### Prerequisites
- Google Cloud account
- Gmail address with IMAP enabled
- Node.js 18+ installed

### Quick Setup (10 minutes)

#### Step 1: Install Dependencies
```bash
cd rag_endpoint
npm install googleapis @google-cloud/pubsub express
```

#### Step 2: Create Google Cloud Project
```bash
# Install gcloud CLI if needed
curl https://sdk.cloud.google.com | bash
gcloud auth login

# Create project and enable APIs
PROJECT_ID="gmail-push-$(date +%Y%m%d)"
gcloud projects create $PROJECT_ID --quiet
gcloud config set project $PROJECT_ID
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --quiet
```

#### Step 3: Get OAuth Credentials
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create **OAuth client ID** (Web application type)
3. Add redirect URI: `http://localhost:8080/oauth2callback`
4. Copy Client ID and Client Secret

#### Step 4: Get Refresh Token
```bash
# Run the token script (replace with your credentials from Step 3)
node scripts/get-oauth-token.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
# Follow prompts to get refresh token
```

#### Step 5: Create Pub/Sub Resources
```bash
gcloud pubsub topics create gmail-push-topic --quiet
gcloud pubsub subscriptions create gmail-push-subscription \
    --topic=gmail-push-topic --quiet
```

#### Step 6: Update `.env` File
Add these lines to your `.env`:
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

#### Step 7: Start ngrok for Local Testing
In a **separate terminal**:
```bash
npm install -g ngrok
ngrok http 8080
```
Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `.env`:
```env
GMAIL_PUSH_WEBHOOK_URL=https://abc123.ngrok.io/gmail-push
```

#### Step 8: Update Pub/Sub Subscription
```bash
NGROK_URL="https://abc123.ngrok.io"  # Replace with your URL
gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=$NGROK_URL/gmail-push \
    --push-auth-token-audience=$NGROK_URL \
    --project=your-project-id
```

#### Step 9: Start Your Server
```bash
cd rag_endpoint
npm start
```

**Expected output:**
```
[IMAP Service] Starting Gmail Push Notifications...
[Gmail Push] ✓ Gmail watch active - History ID: 123456789
[Gmail Push] ✓ Webhook server listening on port 8080
[RAG Server] ✓ MCP server connected and ready
```

#### Step 10: Test It! 🎉
Send an email to your Gmail with `[prompt]` in the subject. Within **1-2 seconds**, you'll see processing logs!

---

## Method 2: IMAP Polling (Fallback - Simple Setup)

### Why Choose This?
- **Simple setup** - no OAuth or Google Cloud required
- **Works with any IMAP provider** - not just Gmail
- **Free and no third-party services**
- ⚠️ **10-second polling delay** (not instant)

### Quick Setup (5 minutes)

#### Step 1: Enable IMAP in Gmail
1. Go to [Gmail Settings → Forwarding and POP/IMAP](https://mail.google.com/mail/u/0/#settings/fwdandpop)
2. Select **"Enable IMAP"**
3. Click **"Save Changes"**

#### Step 2: Generate App Password
1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to **App passwords**
4. Select app: **Mail**, device: **Other**
5. Copy the 16-character password

#### Step 3: Update `.env` File
```env
# IMAP Configuration
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=xxxx xxxx xxxx xxxx  # 16-character app password (no spaces)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993

# Subject tag for filtering
EMAIL_SUBJECT_TAG=[prompt]
```

#### Step 4: Start Server
```bash
cd rag_endpoint
npm start
```

**Expected output:**
```
[IMAP Service] Using IMAP polling as fallback...
[IMAP Service] ✓ Connected to IMAP server
[IMAP Service] ✓ Opened INBOX (X total messages)
[IMAP Service] ✓ IDLE mode active - waiting for new emails
[RAG Server] ✓ MCP server connected and ready
```

#### Step 5: Test It! 🎉
Send an email with `[prompt]` in the subject. Within **10 seconds**, it will be processed automatically!

---

## Testing Your Setup

### Run Interactive Test Suite (Recommended)
```bash
cd rag_endpoint
./scripts/test-email-receiving.sh
```
This guided script walks you through all tests step-by-step!

### Manual Quick Test
Send this email to your configured Gmail address:

**Subject:** `[prompt] Test RAG endpoint basic functionality`  
**Body:** `This is a test message to verify the email receiving system works correctly. Please process this through the RAG pipeline and log the results.`

**Expected logs (Gmail Push):**
```
[Gmail Push] Received notification from Google
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
```

**Expected logs (IMAP Polling):**
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

## Production Deployment

### Deploy with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start server with auto-restart
pm2 start index.js --name rag-endpoint

# Enable auto-start on system boot
pm2 startup
pm2 save

# Monitor logs
pm2 logs rag-endpoint
```

### Update for Production Webhook URL
Replace ngrok with your production HTTPS endpoint:
```env
GMAIL_PUSH_WEBHOOK_URL=https://api.yourdomain.com/gmail-push
```

Then update the Pub/Sub subscription:
```bash
gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=https://api.yourdomain.com/gmail-push \
    --push-auth-token-audience=https://api.yourdomain.com \
    --project=your-production-project-id
```

---

## Documentation Reference

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[README_EMAIL.md](README_EMAIL.md)** | Complete feature overview with architecture diagrams | Understanding how it works |
| **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** | Comprehensive testing guide with sign-off template | Before going live |
| **[docs/GMAIL_PUSH_SETUP.md](docs/GMAIL_PUSH_SETUP.md)** | Gmail Push walkthrough with screenshots | Detailed setup guide |
| **[docs/GMAIL_IMAP_SETUP.md](docs/GMAIL_IMAP_SETUP.md)** | IMAP configuration guide | IMAP polling setup |

---

## Security Best Practices ⚠️

1. **Never commit `.env` to Git** - it's already in `.gitignore`, but double-check
2. **Use app passwords, not regular Gmail password** (for IMAP)
3. **Store OAuth refresh tokens securely** - rotate every 6 months
4. **Use HTTPS webhooks in production** - never expose HTTP endpoints publicly
5. **Monitor server logs regularly** - catch issues early

---

## Next Steps After Testing

### Immediate (After Testing Complete)
1. ✅ Deploy to production with PM2 or systemd
2. ✅ Set up monitoring for service health and email processing metrics
3. ✅ Update Gmail Push subscription to production webhook URL

### Short-Term Enhancements (Optional)
- **Auto-response with RAG results** - Send search results back via email
- **Attachment processing** - Extract text from PDF/Word attachments
- **Email threading support** - Keep conversations organized by thread ID

---

## Email Format Examples

### Simple Query
```
To: your-email@gmail.com
Subject: [prompt] What is in the quarterly sales report?
Body: Can you provide details about Q3 revenue and growth metrics?
```

### Complex Search
```
To: your-email@gmail.com
Subject: [prompt] Search for information about Spencer Heywood's resume
Body: Please find any resumes, cover letters, or job applications related to Spencer Heywood. I'm interested in his technical skills and work history.
```

---

## Support & Getting Help

### Common Issues
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

## Cost Estimate

- **Gmail Push**: Free tier includes 1,000,000 API calls/month (plenty for personal use)
- **IMAP Polling**: Completely free - no API costs
- **ngrok**: Free tier available for local testing ($5-25/month for production)

---

**That's it!** You're ready to receive and process emails automatically. Whether you choose Gmail Push Notifications for instant delivery or IMAP polling for simplicity, your RAG endpoint is now equipped to handle email-based queries! 🚀📧

For any questions, refer to the detailed guides linked above or run the interactive test suite:
```bash
./scripts/test-email-receiving.sh
```

Happy emailing! ✨