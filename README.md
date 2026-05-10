# MCP-Compatible RAG Endpoint

This project provides a Model Context Protocol (MCP) server that implements Retrieval-Augmented Generation (RAG) for local documents. It allows an LLM (via LM Studio or other MCP clients) to index and search through your local text, markdown, and PDF files using vector embeddings.

## Features

- **Local Document Indexing**: Supports `.txt`, `.md`, and `.pdf` files.
- **Real-time Updates**: Automatically watches the documents folder for additions, changes, or deletions using `chokidar`.
- **Persistent Storage**: Saves document embeddings to a local JSON file (`vector_store.json`) so you don't have to re-index everything on every restart.
- **MCP Integration**: Provides standardized tools that allow LLMs to query your documents directly.
- **OpenAI-Compatible Embeddings**: Works with LM Studio's developer endpoints or any OpenAI-compatible embedding API.
- **Incoming Email Processing**: Receive emails via webhook, filter by subject tag (e.g., `[prompt]`), and process content through the RAG pipeline automatically.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- An embedding model running locally (e.g., via LM Studio) or an external embedding API key.

## Setup Instructions

### 1. Install Dependencies

First, navigate to the project directory and install the required packages:

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root of the project (`rag_endpoint/.env`). This file controls where your documents are stored and how the embedding engine connects to your local model.

**Example `.env` file:**

```env
# Path to the folder containing your documents for indexing
RAG_DOCUMENTS_FOLDER=./documents

# The URL of your embedding API (e.g., LM Studio default)
EMBEDDING_API_URL=http://localhost:1234/v1

# The name of the embedding model loaded in your provider
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5

# API Key if required by your provider (leave empty for local LM Studio)
EMBEDDING_API_KEY=your_api_key_here

# Path to the persistent vector store file (used when MySQL is not configured)
VECTOR_STORE_PATH=./vector_store.json

# Performance and Search Tuning
RAG_INDEXING_CONCURRENCY=5
RAG_SEARCH_TOP_K=10
RAG_SEARCH_MIN_SCORE=0.5

# Email Webhook Configuration (for receiving incoming emails)
EMAIL_WEBHOOK_PORT=3000
EMAIL_SUBJECT_TAG=[prompt]

# MySQL Vector Database Configuration (optional - if set, MySQL is used instead of JSON)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=rag_vectors
MYSQL_TABLE_NAME=vectors
```

### 3. Place Your Documents

By default, the server looks for documents in the `./documents` folder relative to the project root. 
- Create this folder if it doesn't exist.
- Drop your `.pdf`, `.md`, or `.txt` files into this directory (subfolders are supported).
- The server will automatically index these files on startup and whenever a file is added/modified.

### MySQL Vector Database Setup (Optional)

The RAG endpoint supports using MySQL for vector storage instead of the default JSON file. This provides better scalability, concurrent access, and integration with existing database infrastructure.

**To enable MySQL:**

1. Create a MySQL database:
   ```sql
   CREATE DATABASE rag_vectors;
   ```

2. Set the MySQL configuration variables in your `.env` file (see example above). The server will automatically create the required `vectors` table on first connection.

3. If MySQL credentials are configured (`MYSQL_USER` and `MYSQL_PASSWORD`), the server uses MySQL for vector storage. Otherwise, it falls back to JSON-based storage.

**MySQL Table Schema:**
The server creates a table with this structure:
```sql
CREATE TABLE vectors (
    docId VARCHAR(512) PRIMARY KEY,
    content TEXT NOT NULL,
    embedding JSON NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Benefits of MySQL:**
- Better performance for large document collections
- Concurrent access from multiple instances
- Integration with existing database backup/replication
- Easier querying and management via SQL tools

## LM Studio Integration

To use this RAG endpoint within LM Studio, you need to add it as an MCP server. You can reference the provided `mcp.json` or add the following configuration to your LM Studio MCP settings:

```json
{
  "mcpServers": {
    "local-rag": {
      "command": "node",
      "args": ["Z:\\PROJECTS\\RAG\\rag_endpoint\\index.js"],
      "env": {
        "EMBEDDING_API_KEY": "your_api_key_here"
      }
    }
  }
}
```
*(Note: Ensure the path in `args` points to the absolute path of your `index.js` file).*

## Incoming Email Processing

The server can receive and process incoming emails via HTTP webhook. Emails with a specific subject tag (default: `[prompt]`) are automatically processed through the RAG pipeline.

### Configuration

Add these environment variables to your `.env` file:

```env
# Port for the email webhook server (separate from MCP stdio transport)
EMAIL_WEBHOOK_PORT=3000

# Subject tag that triggers processing (emails without this tag are ignored)
EMAIL_SUBJECT_TAG=[prompt]
```

### Webhook Endpoints

Once started, the server exposes these endpoints:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/webhook/email` | POST | Receive and process incoming emails |
| `/health` | GET | Health check endpoint |
| `/status` | GET | Show webhook configuration status |

### Setting Up Email Forwarding

You have several options to forward emails to your webhook:

#### Option 1: Mailgun (Recommended)

1. Sign up for [Mailgun](https://www.mailgun.com/) and verify your domain
2. Create a route in Mailgun Dashboard:
   - **Filter**: `Subject matches "[prompt]"`
   - **Action**: `forward("http://your-server-ip:3000/webhook/email")`
3. Update DNS records as instructed by Mailgun

#### Option 2: SendGrid

1. Create a [SendGrid account](https://sendgrid.com/)
2. Navigate to Settings → Inbound Parse
3. Configure hostname and URL to your webhook endpoint
4. Set "POST the raw, full MIME message" option

#### Option 3: AWS SES Receipt Rules

Since you're already using AWS SES for sending:

1. Create an S3 bucket to store incoming emails (optional)
2. In SES Console → Email Receiving → Receipt Rule Sets:
   - Create new rule set
   - Add recipient domain
   - Add condition: `Subject contains "[prompt]"`
   - Add action: SNS topic → HTTP/S subscription to your webhook URL
3. Configure SNS topic to forward messages to `http://your-server-ip:3000/webhook/email`

#### Option 4: Email Client Rules (Gmail/Outlook)

Use Gmail filters or Outlook rules to forward matching emails:

1. Create filter with subject containing `[prompt]`
2. Set action to "Forward to" your webhook URL
3. Note: This requires a forwarding service since email clients can't POST to HTTP endpoints directly

### Testing the Webhook

Test manually with curl:

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "[prompt] What is the quarterly report?",
    "from": "user@example.com",
    "to": "your-email@domain.com",
    "body_text": "Please provide information about Q3 sales figures."
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Email processed successfully",
  "subject": "[prompt] What is the quarterly report?",
  "from": "user@example.com",
  "resultsCount": 5,
  "results": [...]
}
```

### Important Notes

- The webhook server runs on a separate HTTP port (default 3000) from the MCP stdio transport
- Your server must be publicly accessible for external email services to reach it
- Use ngrok or similar tools for local development: `ngrok http 3000`
- Emails without the subject tag are acknowledged but not processed
- Both plain text and HTML email bodies are supported

## Available MCP Tools

Once connected, the LLM has access to the following tools:

| Tool | Description | Input Arguments |
| :--- | :--- | :--- |
| `search_documents` | Search the local index for relevant information based on a query. | `query` (string), `topK` (number) |
| `index_status` | Get total chunk count and a list of all unique indexed files. | None |
| `list_indexed_files` | List only the names of all currently indexed files. | None |
| `reindex_documents` | Manually trigger a full reindex of all documents in the documents folder. | None |

## Development & Testing

To run the server in development mode with auto-restart:

```bash
npm run dev
```

### Running with Email Webhook

Start the server to enable both MCP tools and email webhook:

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

### Verifying Storage Backend

Check which storage backend is being used by examining the startup logs:

```
[MySQLVectorDatabase] Connected to MySQL at localhost:3306/rag_vectors
```
or
```
[RAG Server] MySQL not configured, falling back to JSON-based vector storage...
```
