# Email Receiving Feature - Testing Checklist & Next Steps

Complete testing guide for the RAG endpoint email receiving feature. Follow these checklists to verify everything works correctly before going live.

---

## Quick Reference

| Method | Setup Time | Test Latency | Recommended For |
|--------|------------|--------------|-----------------|
| **Gmail Push** ⭐ | 10 minutes | <2 seconds | Production use |
| **IMAP Polling** | 5 minutes | ~10 seconds | Quick testing |

---

## Phase 1: Pre-Testing Setup Verification ✅

### Gmail Push Notifications (Recommended)

Before testing email receiving, verify your Google Cloud setup:

```bash
# Check gcloud authentication
gcloud auth list

# Verify project is set
gcloud config get-value project

# Confirm APIs are enabled
gcloud services list --filter="gmail.googleapis.com"
gcloud services list --filter="pubsub.googleapis.com"

# Verify Pub/Sub resources exist
gcloud pubsub topics describe gmail-push-topic
gcloud pubsub subscriptions describe gmail-push-subscription
```

**Expected Output:** All commands should return resource details without errors.

### IMAP Polling (Fallback)

Before testing, verify Gmail configuration:

1. **IMAP Enabled**: [Gmail Settings → Forwarding and POP/IMAP](https://mail.google.com/mail/u/0/#settings/fwdandpop)
   - ✅ "Enable IMAP" is selected
   
2. **App Password Generated**: [Google Account → Security → App passwords](https://myaccount.google.com/apppasswords)
   - ✅ 2-Step Verification is enabled
   - ✅ App password created for "Mail" on "Other device"
   - ✅ 16-character password copied (no spaces when used in .env)

---

## Phase 2: Environment Configuration Check 🔧

### Verify `.env` File Contents

```bash
# Display your environment variables (be careful with secrets!)
cat .env | grep -E "^(GOOGLE_|IMAP_|EMAIL_|GMAIL_)"
```

#### For Gmail Push, verify these are set:

| Variable | Should Look Like | Status |
|----------|------------------|--------|
| `GOOGLE_PROJECT_ID` | `gmail-push-20250101` (no spaces) | ⬜ |
| `GOOGLE_CLIENT_ID` | `xxxxx.apps.googleusercontent.com` | ⬜ |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxxxxxxx` | ⬜ |
| `GOOGLE_REFRESH_TOKEN` | `1//04xxxxxxxxxxxxxxxxxxx` (long string) | ⬜ |
| `GOOGLE_PUBSUB_TOPIC_NAME` | `projects/your-id/topics/gmail-push-topic` | ⬜ |
| `GMAIL_PUSH_WEBHOOK_URL` | `https://abc123.ngrok.io/gmail-push` or production URL | ⬜ |

#### For IMAP Polling, verify these are set:

| Variable | Should Look Like | Status |
|----------|------------------|--------|
| `IMAP_USER` | `your-email@gmail.com` | ⬜ |
| `IMAP_PASSWORD` | `xxxx xxxx xxxx xxxx` (16 chars, spaces ok) | ⬜ |
| `IMAP_HOST` | `imap.gmail.com` | ⬜ |
| `IMAP_PORT` | `993` | ⬜ |

---

## Phase 3: Server Startup Test 🚀

### Start the Server

```bash
cd rag_endpoint
npm start
```

### Expected Output - Gmail Push

```
[IMAP Service] Starting Gmail Push Notifications...
[Gmail Push] Using existing Pub/Sub topic: projects/your-id/topics/gmail-push-topic
[Gmail Push] Updated existing subscription: gmail-push-subscription
[Gmail Push] ✓ Gmail watch active - History ID: 123456789
[Gmail Push] ✓ Expiration: 2025-XX-XXTXX:XX:XX.XXXZ
[Gmail Push] Starting webhook server to receive push notifications...
[Gmail Push] ✓ Webhook server listening on port 8080
[RAG Server] Starting MCP server...
[RAG Server] ✓ MCP server connected and ready
```

**Checklist:**
- ⬜ No errors in startup logs
- ⬜ Gmail watch is active with a History ID
- ⬜ Webhook server is listening on port 8080
- ⬜ Expiration date is shown (should be ~7 days out)

### Expected Output - IMAP Polling

```
[IMAP Service] Using IMAP polling as fallback...
[IMAP Service] ✓ Connected to IMAP server
[IMAP Service] ✓ Opened INBOX (X total messages)
[IMAP Service] ✓ IDLE mode active - waiting for new emails
[RAG Server] Starting MCP server...
[RAG Server] ✓ MCP server connected and ready
```

**Checklist:**
- ⬜ No authentication errors
- ⬜ IMAP connection established successfully
- ⬜ INBOX opened with message count shown
- ⬜ IDLE mode or polling is active

---

## Phase 4: Webhook Endpoint Test (Gmail Push Only) 🌐

### Verify ngrok is Running (Local Testing)

```bash
# In a separate terminal, check ngrok status
ngrok http 8080
```

**Expected Output:**
- ✅ HTTPS URL displayed (e.g., `https://abc123.ngrok.io`)
- ✅ No connection errors
- ✅ Webhook requests visible in ngrok web UI at `http://localhost:4040`

### Test Webhook Health Endpoint

```bash
# Replace with your actual ngrok or production URL
curl http://localhost:8080/health
```

**Expected Response:**
```json
{"status":"ok","service":"gmail-push-webhook"}
```

### Verify Pub/Sub Subscription Points to Correct URL

```bash
gcloud pubsub subscriptions describe gmail-push-subscription \
  --format="value(pushConfig.pushEndpoint)"
```

**Expected Output:** Your ngrok or production webhook URL (e.g., `https://abc123.ngrok.io/gmail-push`)

If incorrect, update it:
```bash
NGROK_URL="https://your-ngrok-url.ngrok.io"  # Replace with actual URL

gcloud pubsub subscriptions update gmail-push-subscription \
  --push-endpoint=$NGROK_URL/gmail-push \
  --push-auth-token-audience=$NGROK_URL \
  --project=YOUR_PROJECT_ID
```

---

## Phase 5: Email Receiving Test 📧

### Test Email #1 - Basic Functionality

**Send this email to your Gmail address:**

```
To: your-email@gmail.com
Subject: [prompt] Test RAG endpoint basic functionality
Body: This is a test message to verify the email receiving system works correctly. Please process this through the RAG pipeline and log the results.
```

**Expected Server Logs (Gmail Push):**
```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 123456790
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
[IMAP Service] Email processed successfully via IMAP
```

**Expected Server Logs (IMAP Polling):**
```
[IMAP Service] New message detected in INBOX
[IMAP Service] Subject contains [prompt] tag - processing...
[IMAP Service] Processing email through RAG pipeline...
[Embedding Engine] Generating embeddings for prompt...
[Vector Database] Found X relevant document chunks
[IMAP Service] Email processed successfully via IMAP
```

**Checklist:**
- ⬜ Email received in Gmail inbox
- ⬜ Notification appears within 2 seconds (Push) or 10 seconds (Polling)
- ⬜ Server logs show email processing started
- ⬜ RAG pipeline executed without errors
- ⬜ Results logged to console

---

### Test Email #2 - Subject Tag Filtering

**Send this email WITHOUT the `[prompt]` tag:**

```
To: your-email@gmail.com
Subject: Regular email without prompt tag
Body: This email should be ignored by the system.
```

**Expected Behavior:**
- ⬜ Email received in Gmail inbox
- ⬜ Server logs show message detected but NOT processed (or skipped)
- ⬜ No RAG pipeline execution
- ⬜ No error messages

---

### Test Email #3 - Case Sensitivity

**Send this email with incorrect case:**

```
To: your-email@gmail.com
Subject: [PROMPT] This has wrong case
Body: Testing if subject tag is case-sensitive.
```

**Expected Behavior (default config):**
- ⬜ Email NOT processed (tag must be exactly `[prompt]`)
- ⬜ Logs may show "subject does not match filter" message

---

### Test Email #4 - HTML Content Extraction

**Send this email with HTML formatting:**

```
To: your-email@gmail.com
Subject: [prompt] Test HTML content extraction
Body (HTML): <html><body><h1>Test</h1><p>This is a <strong>formatted</strong> message.</p></body></html>
```

**Expected Behavior:**
- ⬜ Email processed successfully
- ⬜ Plain text extracted from HTML body
- ⬜ RAG pipeline executed with extracted content

---

### Test Email #5 - Long Prompt / Complex Query

**Send a longer, more complex prompt:**

```
To: your-email@gmail.com
Subject: [prompt] Search for information about Spencer Heywood's resume and work experience
Body: Can you please search through all indexed documents to find any resumes, cover letters, job applications, or professional profiles related to Spencer Heywood? I'm particularly interested in his technical skills, previous employment history, and educational background. Please provide a comprehensive summary of what you find.
```

**Expected Behavior:**
- ⬜ Email processed successfully
- ⬜ Embeddings generated for longer text
- ⬜ Multiple relevant document chunks returned (if any exist)
- ⬜ Results logged with scores and content snippets

---

## Phase 6: Error Handling Tests 🐛

### Test #1 - Invalid OAuth Credentials (Gmail Push)

**Steps:**
1. Temporarily change `GOOGLE_CLIENT_ID` in `.env` to an invalid value
2. Restart the server
3. Send a test email

**Expected Behavior:**
- ⬜ Server logs show authentication error on startup
- ⬜ Gmail watch fails to establish
- ⬜ Clear error message displayed (not cryptic)

**Recovery:** Restore correct credentials and restart.

---

### Test #2 - Invalid IMAP Password (IMAP Polling)

**Steps:**
1. Temporarily change `IMAP_PASSWORD` in `.env` to an invalid value
2. Restart the server
3. Wait for polling cycle

**Expected Behavior:**
- ⬜ Server logs show authentication failed error
- ⬜ Connection retry logic activates (if implemented)
- ⬜ Clear error message displayed

**Recovery:** Restore correct app password and restart.

---

### Test #3 - Network Interruption

**Steps:**
1. Start the server with working configuration
2. Disconnect network or stop ngrok (for Gmail Push)
3. Send a test email
4. Reconnect network/restore ngrok

**Expected Behavior:**
- ⬜ Server handles connection loss gracefully
- ⬜ No crash or unhandled exception
- ⬜ Service recovers when connection restored
- ⬜ Email processed after reconnection (may be delayed)

---

### Test #4 - Duplicate Email Prevention

**Steps:**
1. Send a test email with `[prompt]` in subject
2. Immediately send the exact same email again
3. Check server logs

**Expected Behavior:**
- ⬜ First email processed successfully
- ⬜ Second email either:
  - Not processed (duplicate detection working), OR
  - Processed but logged as duplicate
- ⬜ No errors or crashes

---

## Phase 7: Performance Tests ⚡

### Test #1 - Latency Measurement (Gmail Push)

**Steps:**
1. Note the exact time you send a test email
2. Check server logs for processing timestamp
3. Calculate difference

**Expected Result:** <2 seconds from send to processing start

---

### Test #2 - Latency Measurement (IMAP Polling)

**Steps:**
1. Note the exact time you send a test email
2. Check when next polling cycle occurs
3. Calculate difference

**Expected Result:** <10 seconds from send to processing start (depends on poll interval)

---

### Test #3 - High Volume Test

**Steps:**
1. Send 5-10 emails with `[prompt]` in subject within 1 minute
2. Monitor server logs and resource usage

**Expected Behavior:**
- ⬜ All emails processed without crashes
- ⬜ No memory leaks or performance degradation
- ⬜ Processing queue handles multiple requests (if implemented)
- ⬜ Gmail API rate limits not exceeded

---

## Phase 8: Production Readiness Checklist 🚢

### Security

- [ ] `.env` file is in `.gitignore` and never committed to Git
- [ ] OAuth refresh token stored securely (not in plain text if possible)
- [ ] Webhook URL uses HTTPS (required for production by Google)
- [ ] Firewall rules configured to allow only necessary ports
- [ ] Rate limiting implemented on webhook endpoint

### Reliability

- [ ] Process manager running (PM2, systemd, etc.)
- [ ] Auto-restart configured on crash or system boot
- [ ] Watch expiration auto-renewal working (Gmail Push)
- [ ] Graceful shutdown handling tested (SIGINT/SIGTERM)
- [ ] Error logging to file or monitoring service

### Monitoring

- [ ] Server logs accessible and reviewable
- [ ] Alert configured for service downtime
- [ ] Email processing success/failure metrics tracked
- [ ] Latency monitoring in place

### Documentation

- [ ] `.env.example` updated with all required variables
- [ ] Setup documentation complete and accurate
- [ ] Troubleshooting guide covers common issues
- [ ] Runbook created for incident response

---

## Phase 9: Next Steps & Enhancements 🎯

### Immediate (After Testing Complete)

1. **Deploy to Production**
   ```bash
   # Install PM2 if not already installed
   npm install -g pm2
   
   # Start with process manager
   pm2 start index.js --name rag-endpoint
   
   # Enable auto-start on boot
   pm2 startup
   pm2 save
   ```

2. **Set Up Monitoring**
   - Configure log aggregation (e.g., Winston, CloudWatch)
   - Set up uptime monitoring (e.g., UptimeRobot, Pingdom)
   - Create alerts for service failures

3. **Update Gmail Push Subscription**
   ```bash
   # Update to production webhook URL
   gcloud pubsub subscriptions update gmail-push-subscription \
     --push-endpoint=https://api.yourdomain.com/gmail-push \
     --push-auth-token-audience=https://api.yourdomain.com \
     --project=your-production-project-id
   ```

---

### Short-Term Enhancements (1-2 Weeks)

#### 1. Auto-Response with RAG Results

Currently, results are logged to console. Add email response:

```javascript
// In emailService.js or processing logic
async function sendRagResultsToSender(emailData, ragResults) {
    const response = generateEmailResponse(ragResults);
    
    await sendEmail({
        to: emailData.from,
        subject: `Re: ${emailData.subject}`,
        body: response.htmlContent,
        text: response.plainText
    });
}
```

#### 2. Attachment Processing

Extract and index content from PDF/Word attachments:

```javascript
// Add to email processing pipeline
async function extractAttachmentContent(rawEmail) {
    // Parse MIME parts for attachments
    // Extract text from PDFs using pdf-parse
    // Extract text from Word docs using mammoth
    // Return combined text for RAG processing
}
```

#### 3. Email Threading Support

Keep conversations organized by thread ID:

```javascript
// Store and retrieve by Message-ID or Thread-ID
const threadId = email.headers['message-id'];
await storeEmailThread(threadId, processedResults);
```

---

### Medium-Term Enhancements (1-2 Months)

#### 1. Multiple Gmail Account Support

Monitor several mailboxes simultaneously:

```javascript
// Add account configuration to .env
EMAIL_ACCOUNTS=[
  {user:'account1@gmail.com', password:'app-pass-1'},
  {user:'account2@gmail.com', password:'app-pass-2'}
]
```

#### 2. Advanced Filtering Rules

Beyond subject tag, add more filters:

```javascript
// Add to .env
EMAIL_FILTER_SENDERS=allowed@example.com,trusted@domain.org
EMAIL_FILTER_LABELS=prompts,urgent
EMAIL_MIN_LENGTH=10  // Minimum body length to process
```

#### 3. Web Dashboard

Create a simple UI for monitoring and management:

- View recent email processing history
- Monitor service status
- Manually trigger reprocessing
- Configure settings without editing `.env`

---

### Long-Term Enhancements (3+ Months)

#### 1. Multi-Provider Support

Add support for other email providers beyond Gmail:

- Outlook/Office 365 (via Graph API)
- Yahoo Mail
- Custom IMAP servers

#### 2. Natural Language Response Generation

Use LLM to generate human-readable responses instead of raw RAG results:

```javascript
// Generate natural language summary
const response = await llm.generate({
    prompt: `Summarize these search results for the user's question: ${emailBody}`,
    context: ragResults.map(r => r.content).join('\n')
});
```

#### 3. Analytics & Insights Dashboard

Track usage patterns and optimize performance:

- Most common queries
- Average response time
- Success/failure rates
- Document retrieval accuracy metrics

---

## Troubleshooting Quick Reference 🛠️

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Invalid OAuth client" | Client ID/Secret mismatch | Verify in Google Cloud Console |
| Webhook not received | ngrok stopped or URL wrong | Restart ngrok, update subscription |
| Watch expired | Server restarted after 7 days | Restart server to auto-renew |
| Authentication failed (IMAP) | Using regular password | Generate app-specific password |
| No emails detected | IMAP not enabled | Enable in Gmail settings |
| Connection timeout | Port blocked by firewall | Verify port 993 is open |
| Empty email content | Email has no body | Send email with actual text |
| Subject tag not matching | Case sensitivity issue | Use exactly `[prompt]` (lowercase) |

---

## Support Resources 📚

### Project Documentation

- **[Gmail Push Setup Guide](docs/GMAIL_PUSH_SETUP.md)** - Complete walkthrough
- **[Quick Start Guide](docs/PUSH_QUICKSTART.md)** - 10-minute setup
- **[IMAP Setup Guide](docs/GMAIL_IMAP_SETUP.md)** - Alternative configuration
- **[Email Receiving Overview](EMAIL_RECEIVING.md)** - Full feature documentation

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

## Testing Sign-Off Template ✅

Use this template when you've completed testing:

```markdown
# Email Receiving Feature - Test Sign-Off

**Date:** _______________  
**Tester:** _______________  
**Environment:** [ ] Development  [ ] Staging  [ ] Production

### Configuration Method
[ ] Gmail Push Notifications
[ ] IMAP Polling

### Test Results Summary

| Test Phase | Status | Notes |
|------------|--------|-------|
| Pre-Testing Setup | ⬜ Pass / ⬜ Fail | _______________ |
| Environment Config | ⬜ Pass / ⬜ Fail | _______________ |
| Server Startup | ⬜ Pass / ⬜ Fail | _______________ |
| Webhook Endpoint | ⬜ Pass / ⬜ Fail | _______________ |
| Email Receiving (Basic) | ⬜ Pass / ⬜ Fail | _______________ |
| Subject Tag Filtering | ⬜ Pass / ⬜ Fail | _______________ |
| Error Handling | ⬜ Pass / ⬜ Fail | _______________ |
| Performance Tests | ⬜ Pass / ⬜ Fail | _______________ |

### Issues Encountered

1. _________________________________________________________
2. _________________________________________________________
3. _________________________________________________________

### Sign-Off

[ ] All tests passed successfully  
[ ] Ready for production deployment  
[ ] Requires additional work (see notes)

**Signed:** _______________  
**Date:** _______________
```

---

## Final Notes 📝

Congratulations on completing the email receiving feature setup! 

**Remember:**
- Gmail Push Notifications expire after ~7 days but auto-renew 24 hours before expiration
- Always test with simple emails first, then move to complex queries
- Keep your `.env` file secure and never commit it to Git
- Monitor logs regularly in production to catch issues early

**Need Help?** Check the troubleshooting section or review the setup guides. Most issues are resolved by:
1. Verifying environment variables are correct
2. Checking server logs for error messages
3. Ensuring all prerequisites (IMAP enabled, OAuth configured) are met

Happy emailing! 📧✨