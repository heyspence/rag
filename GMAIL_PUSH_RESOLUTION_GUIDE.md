# Gmail Push Notifications - Resolution Guide

**Issue:** `Error sending test message to Cloud PubSub: User not authorized to perform this action`  
**Status:** ⚠️ Requires Manual Resolution  
**Last Updated:** May 11, 2026

---

## Problem Summary

Your Gmail Push notification system is **95% configured correctly**. The remaining 5% requires fixing a Pub/Sub authorization issue that prevents Gmail from sending push notifications to your webhook.

### What's Working ✅
- Environment variables (`.env`) - All present and valid
- OAuth credentials - Valid refresh token, can access Gmail API
- Webhook server endpoints - GET/POST both respond correctly on port 8080
- Pub/Sub topic exists - `gmail-push-topic` created in Google Cloud Console

### What's Failing ❌
- **Gmail Watch Setup** - Cannot publish to Pub/Sub topic due to authorization error

---

## Root Cause Analysis

When Gmail tries to set up a watch, it needs to:
1. Send a test message to the Pub/Sub topic (to verify connectivity)
2. Google's service account must have permission to publish to that topic

The error "User not authorized" occurs because **the subscription was created but Google hasn't granted its own service account permission yet**, OR the subscription configuration has an issue preventing proper authorization propagation.

---

## Step-by-Step Resolution

### Step 1: Verify Subscription Actually Exists and is Active

**Console URL:**  
https://console.cloud.google.com/cloudpubsub/subscription/list?project=rag-project-496000

**What to Check:**
1. Look for subscription named `gmail-push-subscription`
2. Click on it to view details
3. Verify these settings match exactly:

| Setting | Expected Value |
|---------|---------------|
| **Topic** | `gmail-push-topic` |
| **Delivery Type** | Push (not Pull) |
| **Push Endpoint URL** | `https://mcp.spencerheywood.com/gmail-push` |
| **Ack Deadline** | 10 seconds (minimum) |

**If subscription doesn't exist:** Create it now using the instructions in Step 2.

---

### Step 2: Delete and Recreate Subscription (Recommended Fix)

Sometimes permissions don't propagate correctly on first creation. Deleting and recreating often fixes this.

#### 2a. Delete Existing Subscription
1. Go to: https://console.cloud.google.com/cloudpubsub/subscription/detail/gmail-push-subscription?project=rag-project-496000
2. Click the **trash/delete icon** (top right)
3. Confirm deletion

#### 2b. Wait 2 Minutes
Give Google Cloud time to fully clean up resources and revoke permissions.

#### 2c. Create New Subscription
1. Go to: https://console.cloud.google.com/cloudpubsub/subscription/create?project=rag-project-496000

2. **Configure these exact settings:**

```
Subscription name: gmail-push-subscription
Topic: gmail-push-topic (select from dropdown)
Delivery type: PUSH ✓

Push Endpoint URL: https://mcp.spencerheywood.com/gmail-push

Advanced Settings:
  - Ack deadline: 10 seconds
  - Message retention: 7 days (minimum for Gmail watch)
```

3. **DO NOT check these boxes:**
   - ❌ Enable authentication (leave unchecked for now)
   - ❌ Enable payload unwrapping
   - ❌ Write to BigQuery
   - ❌ Write to Cloud Storage

4. Click **CREATE**

#### 2d. Wait 5-10 Minutes After Creation
Google needs time to:
- Verify your webhook URL (sends GET request with challenge token)
- Grant its service account permission to publish to the topic
- Propagate IAM changes across all regions

**During this wait, your server must be running** so Google can verify the webhook endpoint.

---

### Step 3: Start Your Server During Subscription Setup

Your webhook server **must be running** when you create the subscription because Google will immediately send a verification request.

```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
npm start
```

**Expected output during startup:**
```
[Gmail Push] ✓ Webhook server listening on port 8080
[Gmail Push] ✓ Webhook URL: https://mcp.spencerheywood.com/gmail-push
```

**Verify webhook is accessible from outside your network:**
```bash
# From a different machine or use ngrok
curl "https://mcp.spencerheywood.com/gmail-push?x-goog-channel-token=test"
# Expected: HTTP 200 with "Webhook verified"
```

---

### Step 4: Verify Webhook Verification Succeeded

After creating the subscription, check if Google successfully verified your webhook:

**Console URL:**  
https://console.cloud.google.com/cloudpubsub/subscription/detail/gmail-push-subscription?project=rag-project-496000

Look for these indicators:
- ✅ **Status:** Active (not "Verification failed")
- ✅ **Push endpoint:** Shows your URL without error icon
- ✅ **Last verification time:** Should show recent timestamp

**If verification failed:**
1. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
2. Ensure port 443 is open and forwarding to port 8080
3. Verify SSL certificate is valid for `mcp.spencerheywood.com`

---

### Step 5: Test Gmail Watch Setup Again

After waiting 10 minutes post-subscription creation, test the watch setup:

```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
node -e "
require('dotenv').config();
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:8081/oauth2callback'
);

oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

console.log('Testing Gmail watch setup...');
gmail.users.watch({
  userId: 'me',
  requestBody: {
    topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
    labelIds: ['INBOX']
  }
}).then(response => {
  console.log('✅ SUCCESS! Watch created:');
  console.log('   History ID:', response.data.historyId);
  console.log('   Expiration:', new Date(parseInt(response.data.expiration)).toLocaleString());
  process.exit(0);
}).catch(error => {
  console.error('❌ Still failing:', error.message);
  if (error.code === 403) {
    console.log('\\n📋 Permissions may still be propagating.');
    console.log('   Wait another 5-10 minutes and try again.');
  }
  process.exit(1);
});
"
```

**Expected output if successful:**
```
Testing Gmail watch setup...
✅ SUCCESS! Watch created:
   History ID: 2847563921
   Expiration: 5/18/2026, 2:00:00 AM
```

---

### Step 6: Add Yourself as Test User (If Not Already Done)

Since your OAuth app is not verified by Google, you must explicitly add yourself:

**Console URL:**  
https://console.cloud.google.com/apis/credentials/consent?project=rag-project-496000

1. Scroll to **"Test users"** section
2. Click **"+ Add Users"**
3. Enter: `spencer.heywood2000@gmail.com`
4. Click **Save**

---

### Step 7: Final End-to-End Test

Once the watch setup succeeds, test the complete flow:

#### 7a. Start Your RAG Server
```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
npm start
```

Look for this output:
```
[Gmail Push] ✓ Gmail watch active - History ID: xxxxxxxx
[Gmail Push] ✓ Webhook server listening on port 8080
```

#### 7b. Send Test Email
Send an email to `spencer.heywood2000@gmail.com` with:
- **Subject:** `[prompt] Test Gmail Push Notifications`
- **Body:** Any test content (e.g., "This should trigger instant processing!")

#### 7c. Watch Server Logs
Within 1-5 seconds, you should see:
```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: xxxxx
[Gmail Push] Processing new message: <message-id>
[Gmail Push] Found [prompt] tag - processing through RAG pipeline
[Email Processor] Email saved to emails/ folder
```

#### 7d. Verify Email Was Processed
Check that the email appears in your `emails/` directory:
```bash
ls -la emails/ | head -20
```

---

## Troubleshooting Common Issues

### Issue: "Subscription not found" when creating watch

**Cause:** Topic or subscription doesn't exist, or name mismatch.

**Solution:**
1. Verify topic exists: https://console.cloud.google.com/cloudpubsub/topic/list?project=rag-project-496000
2. Verify subscription exists: https://console.cloud.google.com/cloudpubsub/subscription/list?project=rag-project-496000
3. Check `.env` file has correct full path:
   ```env
   GOOGLE_PUBSUB_TOPIC_NAME=projects/rag-project-496000/topics/gmail-push-topic
   ```

---

### Issue: Webhook verification fails during subscription creation

**Cause:** Google cannot reach your webhook URL.

**Debug Steps:**
```bash
# 1. Test from external network (not localhost)
curl -v "https://mcp.spencerheywood.com/gmail-push?x-goog-channel-token=test"

# Expected: HTTP 200 with "Webhook verified"

# 2. Check nginx configuration
sudo nginx -t
sudo systemctl status nginx

# 3. Verify port forwarding
netstat -tlnp | grep 8080

# 4. Check firewall
sudo ufw status
# Should allow port 443 (HTTPS)
```

**Nginx Configuration Should Include:**
```nginx
location /gmail-push {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

### Issue: Watch expires after 7 days

**Cause:** Gmail watches have a maximum 7-day lifetime.

**Solution:** Your code already handles auto-renewal! Check `emailService.js`:
- Watches are renewed 24 hours before expiration
- Look for `[Gmail Push] Renewing watch...` in logs

To manually verify renewal is working:
```bash
# Check current watch status
node -e "const es = require('./emailService'); console.log(es.getGmailPushStatus())"
```

---

### Issue: No notifications received after setup succeeds

**Possible Causes:**
1. Email doesn't match filter criteria (must have `[prompt]` in subject)
2. Watch is monitoring wrong labels (should be INBOX)
3. Subscription push endpoint misconfigured

**Debug Steps:**
```bash
# 1. Check watch configuration in console
# https://console.cloud.google.com/cloudpubsub/subscription/detail/gmail-push-subscription?project=rag-project-496000

# 2. Check Cloud Logging for delivery errors
# https://console.cloud.google.com/logs/query;query=resource.type%3D%22pubsub_subscription%22?project=rag-project-496000

# 3. Verify email has [prompt] tag in subject line
```

---

### Issue: "Invalid OAuth scope" error

**Cause:** Refresh token was obtained with wrong scopes.

**Solution:** Get a new refresh token with correct scopes:
```bash
node get-gmail-refresh-token.js
# Follow browser prompts
# Ensure URL includes: scope=https://www.googleapis.com/auth/gmail.modify
```

---

## Alternative: Use IMAP IDLE Instead (If Push Still Fails)

If Gmail Push continues to have issues, you can fall back to IMAP IDLE which doesn't require Pub/Sub:

**Enable in `.env`:**
```env
IMAP_SERVER=imap.gmail.com
IMAP_PORT=993
IMAP_USER=spencer.heywood2000@gmail.com
IMAP_PASSWORD=<app-specific-password>
```

**Get Gmail App Password:**
1. Go to: https://myaccount.google.com/apppasswords
2. Generate password for "Mail" on "Other device"
3. Add to `.env` as `IMAP_PASSWORD`

**Note:** IMAP IDLE has ~5-10 second latency vs sub-second for Push, but is more reliable for personal use cases.

---

## Verification Checklist

Use this checklist to confirm everything is working:

- [ ] Pub/Sub topic `gmail-push-topic` exists
- [ ] Pub/Sub subscription `gmail-push-subscription` exists with PUSH delivery
- [ ] Subscription push endpoint = `https://mcp.spencerheywood.com/gmail-push`
- [ ] Webhook URL responds to GET requests (Google verification)
- [ ] OAuth test user added: `spencer.heywood2000@gmail.com`
- [ ] Gmail watch setup succeeds without authorization error
- [ ] Server logs show `[Gmail Push] ✓ Gmail watch active`
- [ ] Test email with `[prompt]` subject triggers instant processing
- [ ] Email appears in `emails/` folder within 5 seconds

---

## Support Resources

- **Gmail Push API Guide:** https://developers.google.com/gmail/api/guides/push
- **Cloud Pub/Sub Documentation:** https://cloud.google.com/pubsub/docs/overview
- **OAuth 2.0 Setup:** https://developers.google.com/identity/protocols/oauth2
- **Project Docs:** `README_EMAIL.md`, `GETTING_STARTED_EMAIL.md`

---

## Quick Reference Commands

```bash
# Test environment configuration
node test_gmail_push_simple.js

# Test standalone Gmail Push (includes webhook server)
node test_gmail_push_standalone.js

# Validate full setup
node validate-gmail-setup.js

# Get new OAuth refresh token
node get-gmail-refresh-token.js

# Start RAG endpoint with Gmail Push
npm start

# Check if watch is active
node -e "const es = require('./emailService'); console.log(es.getGmailPushStatus())"
```

---

**Document Version:** 1.0  
**Last Updated:** May 11, 2026  
**Author:** Automated Resolution System