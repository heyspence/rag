# RAG Endpoint - Core Documentation

## Project Overview

This is an MCP-compatible RAG (Retrieval-Augmented Generation) endpoint that provides local document search and AWS SES email capabilities to LLMs via the Model Context Protocol. The system indexes text, markdown, and PDF documents using vector embeddings and allows AI assistants to search through them or send emails on behalf of the user.

### Key Capabilities

1. **Document Indexing & Search**: Automatically indexes `.txt`, `.md`, and `.pdf` files from a local documents folder using embedding models
2. **Persistent Vector Storage**: Saves document embeddings to JSON for fast restarts without re-indexing
3. **MCP Integration**: Exposes tools that LLMs can call via LM Studio or other MCP clients
4. **AWS SES Email**: Send transactional emails directly from the AI assistant using AWS Simple Email Service

### Entry Points

| Type | File | Description |
|------|------|-------------|
| **Main Application** | `index.js` | Server entry point - starts RAG engine and MCP server |
| **Email Service** | `emailService.js` | AWS SES email sending functionality (deprecated) |
| **Embedding Engine** | `embeddingEngine.js` | Vector embedding generation and document processing |
| **Vector Database** | `vectorDatabase.js` | Persistent storage and retrieval of embeddings |

---

## File Tree

```
rag_endpoint/
├── core/
│   └── README.md                 # This file - project architecture & agent guidelines
├── memory/
│   └── session_context.md        # Current session state & recent accomplishments
├── documents/                    # Source documents for indexing (user data)
│   └── SEND_EMAIL_GUIDE.md       # Example document in index
├── enhancement-tracker/          # Frontend UI for tracking document enhancements
│   ├── index.html
│   ├── server.js
│   ├── package.json
│   └── node_modules/
├── .gitignore                    # Git ignore rules
├── README.md                     # User-facing documentation
├── embeddingEngine.js            # Vector embedding engine
├── index.js                      # Main application entry point (with bulk indexing fix)
├── mcp.json                      # MCP server configuration for LM Studio
├── package-lock.json             # Dependency lock file
├── package.json                  # Node.js dependencies
├── vectorDatabase.js             # Vector storage & retrieval module
└── vector_store.json             # Persistent embedding database (auto-generated)
```

---

## Architecture Overview

### Component Flow

```
[Documents Folder] → [index.js: getAllFiles()] → [indexFile()] 
                                              ↓
                                    [chunkText() → split into chunks]
                                              ↓
                              [embeddingEngine.embedBatch()] → [vectors]
                                              ↓
                          [vectorDatabase.upsertDocument()] → [vector_store.json]
```

### Email Formatting Requirements (Updated 2026-05-10)
**ALL emails must be sent as styled HTML documents**. The `send_email` tool now requires the `htmlBody` parameter.

**Changes Made**:
1. Updated `send_email` tool schema to require `htmlBody` parameter
2. Added helper functions: `generateStyledHTML()` and `generateSimpleHTML()` in `emailService.js`
3. Updated validation to reject emails without HTML content
4. Enhanced documentation with HTML generation examples

**Why This Matters**:
- Professional appearance for all outgoing emails
- Better compatibility across email clients (Gmail, Outlook, Apple Mail)
- Inline CSS ensures styles render correctly everywhere
- Supports rich formatting: colors, fonts, layouts, and spacing

### Startup Sequence (Fixed)

**Issue Fixed (2026-05-10)**: Files were not being indexed automatically on startup with LM Studio.

**Root Cause**: The `getAllFiles()` function was defined but never called. The chokidar watcher had `ignoreInitial: true`, meaning it only watched for *new* file changes, not existing files.

**Solution**: Added bulk indexing logic that runs before the file watcher starts:

### Complete Reindex Options

There are now two ways to ensure all files get reindexed:

#### Option 1: Automatic Reindex on Every Startup

Set `REINDEX_ON_STARTUP=true` in your `.env` file. This will:
1. Clear the existing vector store completely
2. Re-index all files from scratch on every server restart
3. Ensure no stale data remains in the index

**Use Case**: When you want guaranteed fresh indexing every time (e.g., during development or when document content changes frequently).

#### Option 2: Manual Reindex via MCP Tool

Use the `reindex_documents` tool to trigger a complete reindex without restarting:
- Clears existing index
- Re-indexes all files in the documents folder
- Returns success/failure counts for each file

**Use Case**: When you need to refresh the index on-demand without server restart.

```javascript
// Initial Indexing on startup
console.log("[RAG Server] Starting initial bulk indexing of existing documents...");
try {
    const existingFiles = await getAllFiles(CONFIG.DOCUMENTS_FOLDER);
    const supportedFiles = existingFiles.filter((file) =>
        CONFIG.SUPPORTED_EXTENSIONS.includes(
            path.extname(file).toLowerCase(),
        ),
    );

    if (supportedFiles.length > 0) {
        console.log(`[RAG Server] Found ${supportedFiles.length} files to index`);
        for (const file of supportedFiles) {
            await indexFile(file, true); // isBulkIndex = true
        }
        // Save once after bulk indexing completes
        await vectorDb.save();
        console.log(`[RAG Server] Bulk indexing complete. Total documents in store: ${vectorDb.listDocuments().length}`);
    } else {
        console.log("[RAG Server] No supported files found to index.");
    }
} catch (error) {
    console.error(`[RAG Server] Error during initial bulk indexing: ${error.message}`);
}
```

Now when LM Studio initializes the server, all existing documents in the `documents/` folder are indexed immediately.

---

## Environment Configuration

### Required Variables (.env file)

```env
# RAG Configuration
RAG_DOCUMENTS_FOLDER=./documents
EMBEDDING_API_URL=http://localhost:1234/v1
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
VECTOR_STORE_PATH=./vector_store.json

# Optional: Force complete reindex on every startup
REINDEX_ON_STARTUP=false  # Set to "true" or "1" to clear and reindex all files at restart

# AWS SES Email Configuration (API credentials, NOT SMTP)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_FROM_EMAIL=noreply@bookservo.com
```

### Security Notes

- **NEVER commit `.env` files** - They are in `.gitignore`
- Use API credentials (`AWS_ACCESS_KEY_ID`) for AWS SDK v3, NOT SMTP credentials (`AWS_USERNAME`)
- Rotate AWS credentials periodically via IAM Console
- Verify sender emails in SES console before sending

---

## MCP Tools Available to LLMs

| Tool | Purpose | Arguments |
|------|---------|-----------|
| `search_documents` | Semantic search through indexed documents | `query`, `topK` |
| `index_status` | Get indexing statistics | None |
| `list_indexed_files` | List all indexed file names | None |
| `reindex_documents` | Force complete reindex (clears and rebuilds index) | None |
| `send_email` | Send styled HTML emails via AWS SES | `subject`, `body`, `htmlBody` (required), `to` (optional), `from` (optional) |

---

## Agent Workflow Guidelines

### For Multi-Agent Continuity

This project follows the **Project Continuity & Structural Integrity Protocol**. When working on this codebase:

#### 1. Before Starting Work (Context Acquisition)

Always read these files first to understand the current state:
- `core/README.md` - Project architecture and where your task fits
- `memory/session_context.md` - Recent accomplishments and immediate next steps

#### 2. During Execution (Act)

- Follow established patterns in existing code (`embeddingEngine.js`, `vectorDatabase.js`)
- For document indexing changes: Modify `index.js` bulk indexing logic or `embeddingEngine.js`
- Test changes by restarting the server and checking console output for indexing messages

#### 3. After Completing Work (State Synchronization)

**MUST UPDATE:**
1. **`memory/session_context.md`**:
   - Add accomplishments to `## ✅ Recent Accomplishments`
   - Update `## 📊 Current Project Status`
   - Update or add to `## 🚀 Immediate Next Steps`

2. **`core/README.md`** (if structural changes):
   - Update File Tree if new files/directories added
   - Update MCP Tools table if tools changed

3. **Verify Documentation Consistency**: Ensure that if you updated a roadmap, the change is reflected in your memory file.

### Common Task Patterns

#### Adding New Document Types
1. Add extension to `CONFIG.SUPPORTED_EXTENSIONS` in `index.js`
2. Add processing logic in `indexFile()` function for new format
3. Test with `reindex_documents` tool or restart server to apply changes
4. Update this README's supported extensions list

#### Modifying Embedding Behavior
1. Edit `embeddingEngine.js` for core logic
2. Update `vectorDatabase.js` if storage schema changes
3. Use `reindex_documents` MCP tool to rebuild index with new settings (no manual file deletion needed)
4. Test with `index_status` tool to verify chunk counts

#### Force Complete Reindex
1. **On Startup**: Set `REINDEX_ON_STARTUP=true` in `.env`, then restart server
2. **On Demand**: Call `reindex_documents` MCP tool from LM Studio
3. Both methods clear existing index before re-indexing all files

#### Sending Styled HTML Emails
**IMPORTANT**: All emails MUST be sent as styled HTML documents for professional formatting.

1. **Required Parameters**: When calling `send_email`, you must provide:
   - `subject`: Email subject line
   - `body`: Plain text fallback content
   - `htmlBody`: Styled HTML content with inline CSS (REQUIRED)

2. **Generating HTML Content**: Use the helper functions in `emailService.js`:
   ```javascript
   // Option 1: Professional styled template
   const html = EmailService.generateStyledHTML({
       title: "Your Subject Here",
       content: "<p>Your main content here...</p>",
       footer: "This email was sent automatically.",
       primaryColor: "#2563eb"
   });

   // Option 2: Simple styled HTML
   const html = EmailService.generateSimpleHTML("Subject", "Plain text body");
   ```

3. **Example Usage**:
   ```javascript
   await EmailService.sendEmail({
       to: "recipient@example.com",
       subject: "Meeting Reminder",
       body: "This is a reminder for our meeting tomorrow.",
       htmlBody: EmailService.generateStyledHTML({
           title: "Meeting Reminder",
           content: "<p>Dear Team,</p><p>This is a reminder for our <strong>meeting tomorrow at 2 PM</strong>.</p>",
           footer: "Best regards, Your Team"
       })
   });
   ```

#### Debugging Indexing Issues
1. Check console output during startup for "Bulk indexing complete" message
2. Verify `documents/` folder contains supported file types (`.txt`, `.md`, `.pdf`)
3. Confirm `EMBEDDING_API_URL` is reachable (LM Studio must be running)
4. Use `index_status` MCP tool to verify documents are indexed
5. If index appears stale, use `reindex_documents` tool or set `REINDEX_ON_STARTUP=true`

---

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (with auto-restart)
npm run dev

# Run normally
npm start

# Check indexing status via MCP tool
# Use search_documents or index_status tools through LM Studio
```

---

## Troubleshooting Quick Reference

| Issue | First Step | Documentation |
|-------|------------|---------------|
| Documents not indexing on startup | Check console for "Bulk indexing complete" message | This README §Startup Sequence (Fixed) |
| Embedding API errors | Verify LM Studio is running at `http://localhost:1234/v1` | README.md §LM Studio Integration |
| MCP tools not available | Check `mcp.json` configuration | README.md §LM Studio Integration |
| No files found to index | Ensure `documents/` folder has `.txt`, `.md`, or `.pdf` files | This README §File Tree |

---

**Last Updated:** 2026-05-10  
**Maintainer:** Project Team  
**Protocol Version:** Memory Protocol v1.0