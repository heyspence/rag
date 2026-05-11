# Email Receiving Setup Guide

This guide explains how to configure your RAG endpoint to receive and process incoming emails. **Gmail Push Notifications** is now the recommended method - no polling, instant delivery when emails arrive! Emails with a specific subject tag (e.g., `[prompt]`) are automatically processed through the RAG pipeline for document retrieval and analysis.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Setting Up Email Providers](#setting-up-email-providers)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The email receiving feature allows your RAG endpoint to:

- **Receive emails** via HTTP webhook from various email providers
- **Filter by subject tag** (default: `[prompt]`) to process only relevant messages
- **Extract content** from both plain text and HTML email bodies
- **Process through RAG pipeline** to search indexed documents for relevant information
- **Return results** as JSON responses to the email provider

### How It Works

#### Option 1: Gmail Push Notifications (Recommended ⭐)

```
Email Sender → Gmail → Google Cloud Pub/Sub → Webhook POST → Your Server
                                                    ↓
                                          Filter by Subject Tag
                                                    ↓
                                  Process Content Through RAG Pipeline
                                                    ↓
                                        Return Results via Response
```

**Benefits:**
- ✅ **Instant delivery** (sub-second latency)
- ✅ **No polling overhead** - saves resources and battery
- ✅ **Official Google API** - production-ready and reliable
- ✅ **Works through firewalls** - uses HTTPS webhooks
- ✅ **Free tier available** - no third-party service required

#### Option 2: Webhook Services (Alternative)

```
Email Sender → Email Provider (Mailgun/SendGrid/AWS SES) → Webhook POST → Your Server
                                                              ↓
                                                    Filter by Subject Tag
                                                              ↓
                                              Process Content Through RAG Pipeline
                                                              ↓
                                                  Return Results via Response
```

---

## Prerequisites

Before setting up email receiving, ensure you have:

1. **Node.js** installed (LTS version recommended)
2. **Dependencies installed**: `npm install`
3. **Public server access** or use a tunneling service like ngrok for local development

### For Gmail Push Notifications (Recommended):
- Google Cloud account (free tier available)
- Gmail address with IMAP enabled
- ~10 minutes to configure OAuth and Pub/Sub

### For Webhook Services (Alternative):
- Email provider account (Mailgun, SendGrid, AWS SES, etc.)

---

## Configuration

### Quick Start: Gmail Push Notifications (Recommended ⭐)

For instant, real-time email delivery with no polling, see the dedicated setup guide:

👉 **[Gmail Push Setup Guide](docs/GMAIL_PUSH_SETUP.md)** - Complete walkthrough  
👉 **[Quick Start Guide](docs/PUSH_QUICKSTART.md)** - Get started in 10 minutes

### Basic Configuration (Required for All Methods)

Copy `.env.example` to `.env` and configure the following:

```bash
cp .env.example .env
```

Edit your `.env` file with these settings:

```env
# Email Webhook Server Port (HTTP, separate from MCP stdio)
EMAIL_WEBHOOK_PORT=3000

# Subject tag that triggers RAG processing
# Emails without this tag are acknowledged but not processed
EMAIL_SUBJECT_TAG=[prompt]

# Gmail Push Notifications (optional - for real-time delivery)
GOOGLE_PROJECT_ID=your-gcp-project-id
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//04xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_PUBSUB_TOPIC_NAME=projects/your-project-id/topics/gmail-push-topic
GMAIL_PUSH_WEBHOOK_PORT=8080
GMAIL_PUSH_WEBHOOK_URL=https://your-domain.com/gmail-push
```

### 2. Start the Server

Run your server to start both the MCP transport and email webhook:

```bash
npm start
```

You should see output like this if Gmail Push is configured:

```
[IMAP Service] Starting Gmail Push Notifications...
[Gmail Push] ✓ Gmail watch active - History ID: 123456789
[Gmail Push] ✓ Webhook server listening on port 8080
[Email Webhook] Server started on port 3000
[Email Webhook] Webhook URL: http://localhost:3000/webhook/email
[RAG Server] Starting MCP server...
[RAG Server] ✓ MCP server connected and ready
```

Or if using IMAP polling (fallback):

```
[IMAP Service] Using IMAP polling as fallback...
[IMAP Service] ✓ Polling mode active - checking every 10 seconds
[Email Webhook] Server started on port 3000
```

---

## Setting Up Email Providers

### Option 1: Gmail Push Notifications (Recommended ⭐)

**Best for:** Real-time delivery, no third-party services, free tier available

See the dedicated setup guides:
- **[Complete Setup Guide](docs/GMAIL_PUSH_SETUP.md)** - Full walkthrough with screenshots
- **[Quick Start Guide](docs/PUSH_QUICKSTART.md)** - Get started in 10 minutes

**What you'll configure:**
1. Google Cloud Project with Gmail API and Pub/Sub enabled
2. OAuth 2.0 credentials for authentication
3. Cloud Pub/Sub topic and subscription for push notifications
4. Webhook endpoint to receive instant email notifications

**Benefits over IMAP polling:**
- **Instant delivery** (sub-second vs 10-second polling delay)
- **No connection overhead** - Google pushes when emails arrive
- **Battery efficient** - No constant IMAP connections
- **Production-ready** - Official Google API with auto-renewal

---

### Option 2: Gmail IMAP Polling (Fallback)

**Best for:** Simple setup, no Google Cloud account needed

If you don't want to set up Google Cloud Push Notifications, the system automatically falls back to IMAP polling:

1. Enable IMAP in your Gmail settings
2. Generate an app-specific password from Google Account security
3. Add credentials to `.env`:

```env
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password  # 16-character app password, not regular password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
```

The server will poll for new emails every 10 seconds and process them automatically.

---

### Option 3: Mailgun (Webhook Alternative)

**Best for:** Custom domains, email sending + receiving in one place

---

#### Step 1: Sign Up and Verify Domain

1. Create an account at [mailgun.com](https://www.mailgun.com/)
2. Add and verify your sending domain in the Mailgun dashboard
3. Configure DNS records as instructed (MX records for receiving)

#### Step 2: Create a Route

1. Navigate to **Sending → Routes** in the Mailgun dashboard
2. Click **Create a route**
3. Set up the filter and action:

```
Filter:    Subject matches "[prompt]"
Action:    forward("https://your-server-ip:3000/webhook/email")
```

#### Step 3: Test

Send an email to your Mailgun address with `[prompt]` in the subject line.

---

### Option 4: Local Development with ngrok

For testing Gmail Push or webhooks locally without exposing your server:

```bash
# Install ngrok if not already installed
npm install -g ngrok

# Start your RAG server (uses port 8080 for Gmail Push webhook)
npm start

# In a new terminal, create the tunnel to the webhook port
ngrok http 8080
```

Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`) and update your `.env`:

```env
GMAIL_PUSH_WEBHOOK_URL=https://abc123.ngrok.io/gmail-push
```

Then update the Pub/Sub subscription with this URL:

```bash
gcloud pubsub subscriptions update gmail-push-subscription \
    --push-endpoint=https://abc123.ngrok.io/gmail-push \
    --project=your-project-id
```

---

## Testing Your Setup

### Test Gmail Push Notifications

1. **Send a test email** to your Gmail address with `[prompt]` in the subject:

   **Subject:** `[prompt] Test push notification`  
   **Body:** `This should trigger instant processing!`

2. **Watch the logs** - within 1-2 seconds you should see:

```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 123456790
[IMAP Service] Processing email through RAG pipeline...
[IMAP Service] Found X relevant document chunks
```

### Test IMAP Polling (Fallback)

1. Send a test email with `[prompt]` in the subject
2. Wait up to 10 seconds for the next poll cycle
3. Check logs for processing output

### Manual Webhook Test

Test your endpoint directly with curl:

---

---

## Troubleshooting

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "[prompt] What is the quarterly sales report?",
    "from": "user@example.com",
    "to": "inbox@yourdomain.com",
    "body_text": "Can you provide information about Q3 sales figures and revenue trends?"
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Email processed successfully",
  "subject": "[prompt] What is the quarterly sales report?",
  "from": "user@example.com",
  "to": "inbox@yourdomain.com",
  "resultsCount": 5,
  "results": [
    {
      "chunkId": "documents/report.pdf#L123",
      "documentPath": "documents/report.pdf",
      "score": 0.87,
      "content": "Q3 sales figures show a 15% increase..."
    }
  ]
}
```

### Test Without Subject Tag

Emails without the subject tag should be acknowledged but not processed:

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Regular email without prompt tag",
    "from": "user@example.com",
    "body_text": "This should be ignored."
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Email received but skipped (no matching subject tag)",
  "subject": "Regular email without prompt tag"
}
```

### Real Email Test

1. Send an actual email to your configured email address
2. Include `[prompt]` in the subject line
3. Check your server logs for webhook processing output
4. Verify the response from your email provider

---

## Webhook Payload Formats

Your webhook endpoint supports multiple email provider formats:

### Mailgun Format

```json
{
  "subject": "[prompt] Question about documents",
  "from": "sender@example.com",
  "to": "recipient@yourdomain.com",
  "body_text": "Plain text content here",
  "body_html": "<p>HTML content here</p>"
}
```

### SendGrid Format

```json
{
  "headers": "{\"subject\":\"[prompt] Question\",\"from\":\"sender@example.com\"}",
  "text": "Plain text content",
  "html": "<p>HTML content</p>"
}
```

### AWS SES SNS Format

```json
{
  "Message": "{\"subject\":\"[prompt] Question\",\"source\":\"sender@example.com\",\"destination\":[\"recipient@yourdomain.com\"],\"content\":{\"text\":{\"body\":\"Content here\"}}}"
}
```

---

## Troubleshooting

### Webhook Not Receiving Emails

**Problem**: Email provider reports webhook delivery failures.

**Solutions**:
1. Verify your server is running and accessible: `curl http://your-server-ip:3000/health`
2. Check firewall settings allow inbound connections on the configured port
3. Ensure SSL certificate is valid if using HTTPS (required by most providers)
4. Review email provider logs for specific error messages

### Subject Tag Not Matching

**Problem**: Emails with `[prompt]` are being skipped.

**Solutions**:
1. Verify `EMAIL_SUBJECT_TAG` in your `.env` matches exactly (case-sensitive)
2. Check the actual subject line received by logging webhook payloads
3. Some providers may modify subjects - check raw headers

### Empty Email Content

**Problem**: Webhook receives email but content is empty.

**Solutions**:
1. Ensure emails include a body (not just attachments)
2. Try sending with both plain text and HTML versions
3. Check if your email provider strips content in forwarding

### CORS Issues

**Problem**: Browser-based testing fails with CORS errors.

**Solutions**:
1. Email providers don't typically have CORS issues (they make server-to-server requests)
2. For browser testing, add CORS middleware to your Express app:

```javascript
const cors = require('cors');
app.use(cors());
```

### Server Not Accessible Publicly

**Problem**: External services cannot reach your local server.

**Solutions**:
1. Use ngrok for development: `ngrok http 3000`
2. Deploy to a cloud service (AWS EC2, Heroku, DigitalOcean)
3. Configure port forwarding on your router (not recommended for production)

---

## Security Considerations

### Authentication

For production use, add webhook authentication:

```javascript
// Verify webhook signature from email provider
app.post('/webhook/email', (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    // Validate signature against expected value
    if (!isValidSignature(signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    // Process email...
});
```

### Rate Limiting

Prevent abuse with rate limiting:

```javascript
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.post('/webhook/email', webhookLimiter, async (req, res) => {
    // ...
});
```

### Input Validation

Always validate and sanitize incoming data before processing.

---

---

## Comparison: Which Method Should You Use?

| Feature | Gmail Push ⭐ | IMAP Polling | Webhook Services |
|---------|---------------|--------------|------------------|
| **Latency** | Instant (<1s) | 10 seconds | Instant |
| **Setup Complexity** | Medium (10 min) | Easy (5 min) | Medium |
| **Third-Party Required** | No (Google only) | No | Yes |
| **Cost** | Free tier available | Free | Paid plans |
| **Reliability** | Very High | High | High |
| **Best For** | Production use | Quick testing | Custom domains |

---

## Next Steps

Once email receiving is configured:

1. **Monitor logs** for successful email processing
2. **Adjust search parameters** in `.env` to tune RAG results  
3. **Add auto-response emails** using `EmailService.sendEmail()` to send RAG results back to sender
4. **Set up production deployment** with PM2 or systemd for reliability
5. **Configure Gmail filters** to auto-label `[prompt]` emails for better organization

---

## Support & Resources

### Documentation
- **[Gmail Push Setup Guide](docs/GMAIL_PUSH_SETUP.md)** - Complete setup walkthrough
- **[Quick Start Guide](docs/PUSH_QUICKSTART.md)** - Get started in 10 minutes  
- **[IMAP Setup Guide](docs/GMAIL_IMAP_SETUP.md)** - Alternative IMAP configuration

### For Issues or Questions:

1. Check server logs for `[Gmail Push]` or `[IMAP Service]` prefixed messages
2. Review Google Cloud Pub/Sub message logs
3. Test with a simple email before complex prompts
4. Verify all environment variables are correctly set in `.env`

### Official Resources:
- [Gmail Push API Documentation](https://developers.google.com/gmail/api/guides/push)
- [Cloud Pub/Sub Overview](https://cloud.google.com/pubsub/docs/overview)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)