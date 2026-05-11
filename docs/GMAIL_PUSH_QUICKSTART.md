# Gmail Push Notifications - Quick Start Guide

Complete your Gmail Push setup in 5 minutes! 🚀

---

## ✅ What You Already Have

Based on your current `.env` file, you already have:

> ℹ️ **Note:** Actual credentials are stored in `.env` file (not committed to git)

```bash
GOOGLE_PROJECT_ID=<your-project-id>
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
GMAIL_PUSH_WEBHOOK_URL=https://mcp.spencerheywood.com/gmail-push
```

---

## 🎯 Step 1: Get Your Refresh Token (2 minutes)

### Run the token script:

```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
node get-gmail-refresh-token.js
```

### What happens next:

1. **Browser opens** automatically to Google authorization page
2. **Sign in** with your Gmail account
3. **Grant permissions** (click "Advanced" → "Go to..." if you see warning)
4. **Copy the refresh token** printed in your terminal

### Add to `.env`:

```bash
GOOGLE_REFRESH_TOKEN=<your-refresh-token>  # Paste from terminal
```

---

## 🎯 Step 2: Add Pub/Sub Topic Name (30 seconds)

Add this line to your `.env` file:

```bash
GOOGLE_PUBSUB_TOPIC_NAME=projects/<your-project-id>/topics/gmail-push-topic
```

> ⚠️ **Important:** If you haven't created the Pub/Sub topic yet, do this first in [Google Cloud Console → Cloud Pub/Sub](https://console.cloud.google.com/cloudpubsub):
> 1. Click **"Create Topic"**
> 2. Name: `gmail-push-topic`
> 3. Click **"Create"**

---

## 🎯 Step 3: Configure OAuth Redirect URI (1 minute)

**Required:** Add this redirect URI to your Google Cloud OAuth client:

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your OAuth client (`gmail-push-client` or similar)
3. Under **"Authorized redirect URIs"**, click **"Add URI"**
4. Add exactly this: `http://localhost:8081/oauth2callback`
5. Click **"Save"**

---

## 🎯 Step 4: Enable Required APIs (1 minute)

If you haven't already:

1. Go to [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library)
2. Search and enable:
   - ✅ **Gmail API**
   - ✅ **Cloud Pub/Sub API**

---

## 🎯 Step 5: Create Pub/Sub Subscription (1 minute)

Point the subscription to your webhook URL:

### Option A: Using Google Cloud Console

1. Go to [Cloud Pub/Sub → Subscriptions](https://console.cloud.google.com/cloudpubsub/subscription/list)
2. Click **"Create Subscription"**
3. Name: `gmail-push-subscription`
4. Topic: Select `gmail-push-topic` (or create it first)
5. **Delivery type:** Push
6. **Push endpoint URL:** `https://mcp.spencerheywood.com/gmail-push`
7. Click **"Create"**

### Option B: Using gcloud CLI

```bash
gcloud pubsub subscriptions create gmail-push-subscription \
  --topic=gmail-push-topic \
  --project=<your-project-id> \
  --push-endpoint=https://mcp.spencerheywood.com/gmail-push \
  --push-auth-token-audience=https://mcp.spencerheywood.com
```

---

## 🎯 Step 6: Configure Nginx (1 minute)

Add this to your nginx config file (likely `/etc/nginx/sites-available/mcp.spencerheywood.com`):

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

## 🎯 Step 7: Add Gmail Push Code to emailService.js (2 minutes)

If you haven't already added the Gmail Push functions, append this before `module.exports` in `emailService.js`:

```javascript
// Gmail Push Notifications
let gmailWatchExpiration = null;
let renewTimer = null;

async function setupGmailPush() {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:8081/oauth2callback'
        );

        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Create Pub/Sub topic if it doesn't exist (optional, can be done manually)
        const pubsub = new PubSub();
        await pubsub.topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME).createIfNotExists();

        // Set up watch
        const response = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
                labelIds: ['INBOX']
            }
        });

        gmailWatchExpiration = new Date(response.data.expiration);
        
        console.log('[Gmail Push] ✓ Gmail watch active - History ID:', response.data.historyId);
        console.log('[Gmail Push] ✓ Expiration:', gmailWatchExpiration.toISOString());

        // Schedule renewal 24 hours before expiration
        const renewTime = new Date(gmailWatchExpiration.getTime() - 24 * 60 * 60 * 1000);
        const timeUntilRenewal = renewTime - new Date();
        
        if (timeUntilRenewal > 0) {
            renewTimer = setTimeout(() => {
                console.log('[Gmail Push] Renewing Gmail watch...');
                setupGmailPush().catch(console.error);
            }, timeUntilRenewal);
        }

        return response.data;
    } catch (error) {
        console.error('[Gmail Push] Error setting up watch:', error.message);
        throw error;
    }
}

async function stopGmailPush() {
    if (renewTimer) clearTimeout(renewTimer);
    
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:8081/oauth2callback'
        );

        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        await gmail.users.stop({ userId: 'me' });
        
        console.log('[Gmail Push] ✓ Gmail watch stopped');
    } catch (error) {
        console.error('[Gmail Push] Error stopping watch:', error.message);
    }
}

async function getGmailPushStatus() {
    return {
        active: !!gmailWatchExpiration,
        expiration: gmailWatchExpiration?.toISOString(),
        renewTimerActive: !!renewTimer
    };
}

// Start webhook server to receive push notifications
function startPushWebhook(port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080) {
    const webhookApp = express();

    webhookApp.post('/gmail-push', (req, res) => {
        console.log('[Gmail Push] Received notification from Google');
        
        // Acknowledge immediately (Google requires this within 10 seconds)
        res.status(200).json({ received: true });

        const message = req.body.message;
        if (message && message.userId) {
            console.log('[Gmail Push] New email notification - History ID:', message.historyId);
            
            // Fetch and process the email asynchronously
            processGmailNotification(message).catch(console.error);
        }
    });

    webhookApp.get('/gmail-push', (req, res) => {
        // Google verifies the endpoint with GET request
        const challenge = req.query['x-goog-channel-token'];
        if (challenge) {
            console.log('[Gmail Push] Webhook verification successful');
            res.status(200).send('Webhook verified');
        } else {
            res.status(404).send('Not found');
        }
    });

    webhookApp.listen(port, () => {
        console.log(`[Gmail Push] ✓ Webhook server listening on port ${port}`);
        console.log(`[Gmail Push] ✓ Webhook URL: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`);
    });

    return webhookApp;
}

async function processGmailNotification(message) {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:8081/oauth2callback'
        );

        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Get messages from history
        const response = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: message.historyId,
            labelIds: ['INBOX']
        });

        if (response.data.history) {
            for (const historyItem of response.data.history) {
                if (historyItem.messagesAdded) {
                    for (const msg of historyItem.messagesAdded) {
                        console.log('[Gmail Push] Processing new message:', msg.message.id);
                        
                        // Fetch full email content
                        const email = await gmail.users.messages.get({
                            userId: 'me',
                            id: msg.message.id,
                            format: 'full'
                        });

                        // Process through RAG pipeline (reuse existing IMAP logic)
                        await processEmailContent(email.data);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[Gmail Push] Error processing notification:', error.message);
    }
}

// Export Gmail Push functions
module.exports.setupGmailPush = setupGmailPush;
module.exports.stopGmailPush = stopGmailPush;
module.exports.getGmailPushStatus = getGmailPushStatus;
module.exports.startPushWebhook = startPushWebhook;
```

---

## 🎯 Step 8: Start Your Server & Test! (1 minute)

### Start the server:

```bash
cd /etc/STORAGE/PROJECTS/RAG/rag_endpoint
npm start
```

### Expected output if configured correctly:

```
[Gmail Push] ✓ Gmail watch active - History ID: 1234567890
[Gmail Push] ✓ Expiration: 2025-01-XXTXX:XX:XX.XXXZ
[Gmail Push] ✓ Webhook server listening on port 8080
[Gmail Push] ✓ Webhook URL: https://mcp.spencerheywood.com/gmail-push
```

### Test the webhook endpoint:

```bash
curl -X POST https://mcp.spencerheywood.com/gmail-push \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response: `HTTP/1.1 200 OK` with `{"received":true}`

### Send a test email:

From any email account, send to your Gmail address:

- **Subject:** `[prompt] Test Gmail Push webhook`
- **Body:** `This should trigger instant processing!`

### Watch the logs:

Within **1-2 seconds**, you should see:

```
[Gmail Push] Received notification from Google
[Gmail Push] New email notification - History ID: 1234567891
[IMAP Service] Processing email through RAG pipeline...
[IMAP Service] Email processed successfully via Gmail Push
```

---

## 📋 Your Final `.env` File Should Look Like This:

```bash
# Existing AWS credentials (keep these)
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1

# Gmail Push Configuration ✅
GOOGLE_PROJECT_ID=<your-project-id>
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REFRESH_TOKEN=<your-refresh-token>  # From Step 1

# Pub/Sub Configuration ✅
GOOGLE_PUBSUB_TOPIC_NAME=projects/<your-project-id>/topics/gmail-push-topic

# Webhook Configuration ✅
GMAIL_PUSH_WEBHOOK_PORT=8080
GMAIL_PUSH_WEBHOOK_URL=https://mcp.spencerheywood.com/gmail-push
```

> ⚠️ **Security Note:** Never commit your `.env` file to version control. Add it to `.gitignore`.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| `redirect_uri_mismatch` | Add `http://localhost:8081/oauth2callback` to OAuth client (Step 3) |
| `invalid_scope` | Enable Gmail API in Google Cloud Console (Step 4) |
| No notifications received | Check Pub/Sub subscription push endpoint URL matches exactly |
| Watch expires after 7 days | Auto-renewal is built-in, but restart server if needed |
| Webhook returns 404 | Verify nginx config and reload with `sudo systemctl reload nginx` |

---

## ✅ Success Checklist

- [ ] Refresh token obtained and added to `.env`
- [ ] Pub/Sub topic created (`gmail-push-topic`)
- [ ] Pub/Sub subscription configured with webhook URL
- [ ] OAuth redirect URI added: `http://localhost:8081/oauth2callback`
- [ ] Gmail API enabled in Google Cloud Console
- [ ] Nginx configured with `/gmail-push` route
- [ ] Gmail Push code added to `emailService.js`
- [ ] Server starts without errors
- [ ] Test email triggers processing within 2 seconds

---

## 🎉 You're Done!

Your RAG endpoint now receives **instant email notifications** via Google's official Push API. No polling, no delays, production-ready!

For detailed documentation, see:
- `docs/GMAIL_PUSH_SETUP.md` - Full setup guide
- `README_EMAIL.md` - Complete feature overview
- `TESTING_CHECKLIST.md` - Comprehensive testing guide

---

**Questions?** Check the troubleshooting section above or review the full setup guide. 🚀