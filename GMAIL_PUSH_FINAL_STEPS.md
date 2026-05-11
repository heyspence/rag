# Gmail Push Setup - Final Steps

## ✅ What's Already Done

The following has been completed automatically:

- ✅ **Gmail Push code added** to `emailService.js` (350+ lines)
- ✅ **Environment variables configured** in `.env`:
  ```bash
  GOOGLE_PROJECT_ID=<your-project-id>
  GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=<your-client-secret>
  GOOGLE_PUBSUB_TOPIC_NAME=projects/<your-project-id>/topics/gmail-push-topic
  GMAIL_PUSH_WEBHOOK_PORT=8080
  GMAIL_PUSH_WEBHOOK_URL=https://mcp.spencerheywood.com/gmail-push
  ```
  > ℹ️ **Note:** Actual credentials are stored in `.env` file (not committed to git)
- ✅ **Token retrieval script created**: `get-gmail-refresh-token.js`
- ✅ **Validation script created**: `validate-gmail-setup.js`

---

## 🎯 Manual Steps You Need to Complete (5 minutes)

### Step 1: Add OAuth Redirect URI (Required!)

**This is the most common failure point - don't skip it!**

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your OAuth client ID (`876080557574-...`)
3. Scroll to **"Authorized redirect URIs"**
4. Click **"ADD URI"**
5. Enter exactly: `http://localhost:8081/oauth2callback`
6. Click **"SAVE"** at the bottom

> ⚠️ **Important:** The port must be `8081` (not 8080) to avoid conflicts with your main server.

---

### Step 2: Enable Gmail API

1. Open [Google Cloud Console → Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=rag-project-496000)
2. If you see a blue **"ENABLE"** button, click it
3. Wait ~10 seconds for activation

---

### Step 3: Enable Cloud Pub/Sub API

1. Open [Google Cloud Console → Pub/Sub API](https://console.cloud.google.com/apis/library/pubsub.googleapis.com?project=rag-project-496000)
2. If you see a blue **"ENABLE"** button, click it
3. Wait ~10 seconds for activation

---

### Step 4: Create Pub/Sub Topic

1. Open [Cloud Pub/Sub → Topics](https://console.cloud.google.com/cloudpubsub/topic/list?project=rag-project-496000)
2. Click **"+ CREATE TOPIC"** (top left)
3. Set **Topic ID** to exactly: `gmail-push-topic`
4. Leave all other settings as default
5. Click **"CREATE"**

---

### Step 5: Create Pub/Sub Subscription

1. Open [Cloud Pub/Sub → Subscriptions](https://console.cloud.google.com/cloudpubsub/subscription/list?project=rag-project-496000)
2. Click **"+ CREATE SUBSCRIPTION"**
3. Fill in:
   - **Subscription ID**: `gmail-push-subscription`
   - **Topic**: Select `gmail-push-topic` (or type to find it)
   - **Delivery type**: **Push**
   - **Push endpoint URL**: `https://mcp.spencerheywood.com/gmail-push`
4. Click **"CREATE"**

---

### Step 6: Get Your Refresh Token

Run the automated script:

```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
node get-gmail-refresh-token.js
```

**What happens:**
1. Browser opens automatically to Google authorization page
2. Sign in with your Gmail account
3. Grant permissions (click "Advanced" → "Go to..." if you see warning)
4. **Copy the refresh token** printed in your terminal

Then add it to your `.env` file:

```bash
# Add this line to .env (paste the actual token from terminal):
GOOGLE_REFRESH_TOKEN=<your-refresh-token>
```

---

### Step 7: Configure Nginx (Production Only)

If you haven't already, add this to your nginx config file:

**Location:** `/etc/nginx/sites-available/mcp.spencerheywood.com` or similar

```nginx
location /gmail-push {
    proxy_pass http://127.0.0.1:8080/gmail-push;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🧪 Testing Your Setup

### Option 1: Run Validation Script (Recommended First)

```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
node validate-gmail-setup.js
```

This will check:
- ✅ All environment variables are present
- ✅ OAuth credentials work
- ✅ Pub/Sub topic exists
- ✅ Webhook configuration is valid

### Option 2: Start Server and Test

```bash
# Start your RAG endpoint server
npm start
```

**Expected output if configured correctly:**

```
[Gmail Push] ✓ Gmail watch active - History ID: 1234567890
[Gmail Push] ✓ Expiration: 2025-01-XXTXX:XX:XX.XXXZ
[Gmail Push] ✓ Webhook server listening on port 8080
[Gmail Push] ✓ Webhook URL: https://mcp.spencerheywood.com/gmail-push
```

### Test the Webhook Endpoint

From any machine, test that Google can reach your webhook:

```bash
curl -X POST https://mcp.spencerheywood.com/gmail-push \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response:** `HTTP/1.1 200 OK` with `{"received":true}`

### Send a Test Email

From any email account, send to `spencer.heywood2000@gmail.com`:

- **Subject:** `[prompt] Test Gmail Push webhook`
- **Body:** `This should trigger instant processing!`

**Watch the logs** - within 1-2 seconds you should see:

```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 1234567891
[Gmail Push] Processing new message: xxxxxxxxxx
[Gmail Push] Found [prompt] tag - processing through RAG pipeline
[Gmail Push] ✓ Email saved to: ./Emails/gmail_2025-01-XXTXX...json
```

---

## 📋 Complete Checklist

Before you're done, verify all of these are complete:

- [ ] OAuth redirect URI added: `http://localhost:8081/oauth2callback`
- [ ] Gmail API enabled in Google Cloud Console
- [ ] Pub/Sub API enabled in Google Cloud Console
- [ ] Pub/Sub topic created: `gmail-push-topic`
- [ ] Pub/Sub subscription created with push endpoint: `https://mcp.spencerheywood.com/gmail-push`
- [ ] Refresh token obtained and added to `.env` as `GOOGLE_REFRESH_TOKEN`
- [ ] Nginx configured with `/gmail-push` route (production only)
- [ ] Validation script passes: `node validate-gmail-setup.js`
- [ ] Server starts without errors
- [ ] Test email triggers processing within 2 seconds

---

## 🐛 Troubleshooting

### Error: `redirect_uri_mismatch`

**Cause:** Redirect URI not added to OAuth client  
**Fix:** Complete Step 1 above - add `http://localhost:8081/oauth2callback` to your OAuth client

### Error: `invalid_scope` or `403 Forbidden`

**Cause:** Gmail API not enabled  
**Fix:** Complete Step 2 above - enable Gmail API in Google Cloud Console

### Error: `invalid_grant` when getting refresh token

**Cause:** Refresh token is invalid, expired, or revoked  
**Fix:** 
1. Go to [Google Account → Security → Third-party apps](https://myaccount.google.com/permissions)
2. Revoke access for your app if listed
3. Run `node get-gmail-refresh-token.js` again

### Error: Pub/Sub topic not found

**Cause:** Topic doesn't exist in Google Cloud  
**Fix:** Complete Step 4 above - create the topic manually

### No notifications received after sending email

**Possible causes:**
1. Email subject doesn't contain `[prompt]` (case-sensitive)
2. Gmail filters moved email before watch could detect it
3. Pub/Sub subscription push endpoint URL is wrong
4. Nginx not forwarding `/gmail-push` route correctly

**Debug steps:**
```bash
# Check if server is listening
netstat -tlnp | grep 8080

# Test webhook manually
curl https://mcp.spencerheywood.com/gmail-push -X POST -H "Content-Type: application/json" -d '{}'

# Check Pub/Sub messages (if any queued)
gcloud pubsub subscriptions pull gmail-push-subscription \
  --project=rag-project-496000
```

### Watch expires after 7 days

**This is normal!** The code auto-renews 24 hours before expiration.  
If it fails, just restart the server: `npm start`

---

## 📚 What Each File Does

| File | Purpose |
|------|---------|
| `emailService.js` | Main implementation - Gmail Push functions added (lines 798-1150) |
| `.env` | Configuration with all required variables |
| `get-gmail-refresh-token.js` | Interactive script to obtain OAuth refresh token |
| `validate-gmail-setup.js` | Validates your setup before running main app |
| `GMAIL_PUSH_FINAL_STEPS.md` | This file - final manual steps guide |

---

## 🎉 You're Ready!

Once all manual steps are complete, your RAG endpoint will:

- ✅ Receive **instant email notifications** (<2 seconds latency)
- ✅ Process emails with `[prompt]` in subject automatically
- ✅ Auto-renew Gmail watch before expiration (every 7 days)
- ✅ Work through residential ISPs (no port forwarding needed)
- ✅ Scale to high email volume without polling overhead

---

## 🆘 Need Help?

If you get stuck:

1. **Run the validator:** `node validate-gmail-setup.js` - it will tell you what's missing
2. **Check Google Cloud Console:** Verify APIs are enabled and resources exist
3. **Review logs:** Start server with `npm start` and watch for error messages
4. **Test incrementally:** Get OAuth working first, then Pub/Sub, then webhook

Good luck! 🚀