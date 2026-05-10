cp .env.example .env
```

Edit `.env` with these minimum settings:

```env
# Email Webhook Port (must be accessible from internet)
EMAIL_WEBHOOK_PORT=3000

# Subject tag that triggers processing
EMAIL_SUBJECT_TAG=[prompt]
```

---

## Step 2: Start the Server

```bash
npm start
```

You should see:

```
[Email Webhook] Server started on port 3000
[Email Webhook] Webhook URL: http://localhost:3000/webhook/email
[Email Webhook] Filtering emails with subject tag: [prompt]
```

---

## Step 3: Make Your Server Accessible

### For Local Testing (Development)

Use ngrok to create a public tunnel:

```bash
# Install ngrok
npm install -g ngrok

# Create tunnel (in separate terminal)
ngrok http 3000
```

Copy the HTTPS URL shown (e.g., `https://abc123.ngrok.io`)

### For Production

Deploy to a cloud server with a public IP or domain.

---

## Step 4: Configure Email Provider

### Option A: Mailgun (Easiest)

1. Sign up at [mailgun.com](https://www.mailgun.com/)
2. Verify your domain
3. Create a route:
   - **Filter**: `Subject matches "[prompt]"`
   - **Action**: `forward("https://your-url.ngrok.io/webhook/email")`

### Option B: Test Manually with curl

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "[prompt] What is in the quarterly report?",
    "from": "test@example.com",
    "body_text": "Please summarize Q3 sales data."
  }'
```

---

## Step 5: Send a Test Email

Send an email to your configured address with `[prompt]` in the subject:

**Subject:** `[prompt] Tell me about our sales figures`

**Body:** `Can you provide information from the quarterly reports?`

---

## Expected Response

```json
{
  "success": true,
  "message": "Email processed successfully",
  "subject": "[prompt] Tell me about our sales figures",
  "from": "test@example.com",
  "resultsCount": 5,
  "results": [
    {
      "chunkId": "documents/report.pdf#L123",
      "documentPath": "documents/report.pdf",
      "score": 0.87,
      "content": "Q3 sales figures show..."
    }
  ]
}
```

---

## Verify It's Working

Check your server logs for:

```
[Email Webhook] Received incoming email request
[Email Webhook] From: test@example.com
[Email Webhook] Subject: [prompt] Tell me about our sales figures
[Email Webhook] Email contains target tag [prompt], processing...
[Email Webhook] Found 5 relevant document chunks
[Email Webhook] Email processed successfully
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No webhook received | Check ngrok is running, verify URL in email provider |
| Emails skipped | Ensure `[prompt]` is exactly in subject line (case-sensitive) |
| Empty results | Add more documents to `./documents` folder, reindex |
| Connection refused | Verify port 3000 is open and server is running |

---

## Next Steps

- Read full documentation: [`EMAIL_RECEIVING.md`](EMAIL_RECEIVING.md)
- Configure AWS SES for production use
- Add response email functionality using `EmailService`
- Set up rate limiting and authentication for security

---

**That's it!** Your RAG endpoint is now receiving and processing emails. 🎉