# Gmail IMAP Configuration for Email Receiving
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=abcdefghijklmnop  # Your 16-character app password (no spaces)
IMAP_FOLDER=INBOX

# Subject tag that triggers RAG processing
EMAIL_SUBJECT_TAG=[prompt]
```

**Replace:**
- `your-email@gmail.com` with your actual Gmail address
- `abcdefghijklmnop` with the 16-character app password you generated

---

## Step 4: Install Dependencies (If Not Already Done)

```bash
cd rag_endpoint
npm install imap
```

The `imap` package was already added to your `package.json`, so this should complete quickly.

---

## Step 5: Start Your Server

Run your RAG endpoint server:

```bash
npm start
```

You should see output like this if IMAP is configured correctly:

```
[RAG Server] Initializing RAG endpoint...
[RAG Server] Documents folder: /path/to/documents
[RAG Server] Embedding API URL: http://localhost:1234/v1
[RAG Server] IMAP email receiving is configured
[Email Service] Loading credentials from environment...
[IMAP Service] Loading IMAP credentials from environment...
[IMAP Service] IMAP_USER: your-email@gmail.com
[IMAP Service] IMAP_PASSWORD present: true
[IMAP Service] IMAP_HOST: imap.gmail.com
[IMAP Service] IMAP_PORT: 993
[IMAP Service] Creating IMAP connection...
[IMAP Service] ✓ IMAP connection ready
[IMAP Service] ✓ Opened INBOX (42 total messages)
[IMAP Service] Starting IDLE monitoring...
[IMAP Service] ✓ IDLE mode active - waiting for new emails
[RAG Server] Starting MCP server...
[RAG Server] ✓ MCP server connected and ready
```

---

## Step 6: Test It Works

### Send a Test Email

From any email account, send an email to your Gmail address with:

**Subject:** `[prompt] Test RAG endpoint`  
**Body:** `This is a test message to verify the IMAP integration works correctly.`

### Watch Your Server Logs

Within 1-2 seconds of receiving the email in Gmail, you should see:

```
[IMAP Service] New email detected in INBOX (total: 43)
[IMAP Service] Found 1 new email(s) with tag [prompt]
[IMAP Service] Email from: sender@example.com
[IMAP Service] Subject: [prompt] Test RAG endpoint
[IMAP Service] Processing email through RAG pipeline...
[IMAP Service] Found 5 relevant document chunks
[IMAP Service] ✓ Email marked as read
```

---

## How It Works

```
┌─────────────┐     Gmail IMAP (port 993)      ┌──────────────────┐
│   Your      │◄──── Persistent Connection ───►│    Gmail         │
│   Server    │        with IDLE mode          │    Servers       │
│             │                                │                  │
│  [IMAP]     │◄──── Push Notification ────────│  New Email       │
│             │      (exists: N+1)             │  Arrives         │
└─────────────┘                                └──────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  RAG Processing Pipeline                                    │
│  1. Fetch email content                                     │
│  2. Generate embedding                                      │
│  3. Search vector database                                  │
│  4. Return relevant document chunks                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Error: "Invalid credentials" or "Authentication failed"

**Cause:** Using regular Gmail password instead of app-specific password  
**Solution:** Generate a new app password from Google Account settings (Step 2 above)

### Error: "IMAP not installed"

**Cause:** Missing `imap` package dependency  
**Solution:** Run `npm install imap` in the project directory

### Connection works but no emails are processed

**Possible causes:**
1. Email subject doesn't contain `[prompt]` tag (case-sensitive)
2. Email is already marked as read (only processes UNSEEN emails)
3. Gmail filters moved email to another folder

**Solution:** Check your server logs for "Found X new email(s)" message

### Error: "TLS certificate verification failed"

**Cause:** Self-signed certificates or network interference  
**Solution:** The code already has `rejectUnauthorized: false` for Gmail - this should not occur. If it does, check your firewall/antivirus.

### IDLE stops working after some time

**Cause:** Gmail may disconnect idle connections periodically  
**Solution:** The code automatically reconnects. Check logs for "IMAP connection closed" messages.

### Emails from specific senders are blocked by Gmail

**Cause:** Gmail's spam filter or security settings  
**Solution:** Mark the sender as "Not Spam" and add to contacts

---

## Advanced Configuration

### Change Subject Tag

Edit `.env` to use a different trigger:

```env
EMAIL_SUBJECT_TAG=[rag]  # or [query], [search], etc.
```

### Monitor Different Folder

By default, monitors the INBOX. To monitor a custom folder:

```env
IMAP_FOLDER=MyFolder
```

Create this folder in Gmail first, then move emails there with filters.

### Adjust Search Parameters

Tune how many results are returned per email:

```env
RAG_SEARCH_TOP_K=10      # Number of document chunks to return
RAG_SEARCH_MIN_SCORE=0.5 # Minimum similarity score (0.0 - 1.0)
```

---

## Security Considerations

### App Password Storage

- The app password is stored in `.env` which is git-ignored
- Never commit your `.env` file to version control
- Use environment variables in production instead of `.env` files

### Connection Encryption

- IMAP uses TLS/SSL on port 993 (encrypted by default)
- All communication with Gmail is encrypted in transit

### Rate Limiting

Gmail has API rate limits. The current implementation:
- Processes one email at a time
- Marks emails as read after processing
- Avoids duplicate processing with UID tracking

---

## Comparison: IMAP vs Webhook Services

| Feature | Gmail IMAP (This Setup) | Mailgun/Webhook |
|---------|------------------------|-----------------|
| Cost | Free | Free tier available |
| Third-party services | None required | Required |
| Real-time | Yes (IDLE push) | Yes (webhook POST) |
| Xfinity compatible | ✅ Port 993 open | ✅ HTTPS works |
| Setup complexity | Medium | Easy |
| Gmail dependency | Yes | No |
| Email storage | Your Gmail inbox | Their servers |

---

## Graceful Shutdown

When you stop the server (Ctrl+C), the IMAP connection closes cleanly:

```bash
^C
[RAG Server] Shutting down...
[IMAP Service] Stopping IDLE watcher...
[IMAP Service] ✓ IDLE watcher stopped successfully
[IMAP Service] Closing IMAP connection...
[IMAP Service] IMAP service stopped
```

---

## Next Steps

1. **Monitor logs** for successful email processing
2. **Add response emails** using the existing `EmailService` to send back RAG results
3. **Set up Gmail filters** to automatically label or organize `[prompt]` emails
4. **Consider production deployment** with PM2 or similar process manager

---

## Support & Resources

- [Gmail IMAP Settings](https://support.google.com/mail/answer/7126229)
- [Google App Passwords](https://support.google.com/accounts/answer/185833)
- [IMAP Node.js Package](https://github.com/andrewrk/node-imap)

---

**That's it!** Your RAG endpoint now receives emails directly from Gmail with real-time notifications. No third-party services, no port 25 issues, completely free. 🎉