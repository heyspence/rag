# Email Receiving Setup Guide

This guide explains how to configure your RAG endpoint to receive and process incoming emails via webhook. Emails with a specific subject tag (e.g., `[prompt]`) are automatically processed through the RAG pipeline for document retrieval and analysis.

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
4. **Email provider account** (Mailgun, SendGrid, AWS SES, etc.)

---

## Configuration

### 1. Environment Variables

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
```

### 2. Start the Server

Run your server to start both the MCP transport and email webhook:

```bash
npm start
```

You should see output like:

```
[Email Webhook] Server started on port 3000
[Email Webhook] Webhook URL: http://localhost:3000/webhook/email
[Email Webhook] Health check: http://localhost:3000/health
[Email Webhook] Status: http://localhost:3000/status
[Email Webhook] Filtering emails with subject tag: [prompt]
[RAG Server] Starting MCP server...
[RAG Server] ✓ MCP server connected and ready
```

### 3. Verify the Webhook is Running

Test your webhook endpoints:

```bash
# Health check
curl http://localhost:3000/health

# Status endpoint
curl http://localhost:3000/status
```

---

## Setting Up Email Providers

### Option 1: Mailgun (Recommended)

Mailgun is the easiest option for receiving emails and forwarding to webhooks.

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

### Option 2: SendGrid Inbound Parse

SendGrid can parse incoming emails and POST them to your webhook.

#### Step 1: Set Up Inbound Parse

1. Log into [sendgrid.com](https://sendgrid.com/)
2. Navigate to **Settings → Inbound Parse**
3. Add a hostname (e.g., `mail.yourdomain.com`)
4. Set the destination URL: `http://your-server-ip:3000/webhook/email`
5. Select **"POST the raw, full MIME message"**

#### Step 2: Configure DNS

Point your MX records to SendGrid's inbound servers as instructed.

---

### Option 3: AWS SES Receipt Rules

Since you're already using AWS SES for sending, this integrates seamlessly.

#### Step 1: Create S3 Bucket (Optional)

Create an S3 bucket to store raw email data if needed:

```bash
aws s3 mb s3://your-email-bucket-name --region us-east-2
```

#### Step 2: Create SNS Topic

1. Go to **SNS → Topics** in AWS Console
2. Create a new topic (e.g., `email-webhook-topic`)
3. Add an HTTP/S subscription with your webhook URL

#### Step 3: Configure Receipt Rule Set

1. Navigate to **SES → Email Receiving → Receipt Rule Sets**
2. Create a new rule set and activate it
3. Add a recipient domain (e.g., `yourdomain.com`)
4. Add condition: **Header → Subject contains "[prompt]"**
5. Add action: **SNS** → Select your topic

#### Step 4: Verify HTTPS Certificate

AWS SES requires valid SSL certificates for HTTPS endpoints. Use AWS ACM to create and validate a certificate for your domain, or use HTTP (not recommended for production).

---

### Option 4: Local Development with ngrok

For testing locally without exposing your server:

```bash
# Install ngrok if not already installed
npm install -g ngrok

# Start your RAG server
npm start

# In a new terminal, create the tunnel
ngrok http 3000
```

Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`) and use it as your webhook URL in your email provider's settings.

---

## Testing

### Manual Webhook Test

Test your endpoint directly with curl:

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

## Next Steps

Once email receiving is configured:

1. **Monitor logs** for successful email processing
2. **Adjust search parameters** in `.env` to tune RAG results
3. **Add response emails** using the existing `EmailService` to send back results
4. **Set up logging** to a file or monitoring service for production use

---

## Support

For issues or questions:

1. Check server logs: Look for `[Email Webhook]` prefixed messages
2. Review email provider delivery logs
3. Test with curl before sending real emails
4. Verify all environment variables are correctly set