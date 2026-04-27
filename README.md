# MCP-Compatible RAG Endpoint

This project provides a Model Context Protocol (MCP) server that implements Retrieval-Augmented Generation (RAG) for local documents. It allows an LLM (via LM Studio or other MCP clients) to index and search through your local text, markdown, and PDF files using vector embeddings.

## Features

- **Local Document Indexing**: Supports `.txt`, `.md`, and `.pdf` files.
- **Real-time Updates**: Automatically watches the documents folder for additions, changes, or deletions using `chokidar`.
- **Persistent Storage**: Saves document embeddings to a local JSON file (`vector_store.json`) so you don't have to re-index everything on every restart.
- **MCP Integration**: Provides standardized tools that allow LLMs to query your documents directly.
- **OpenAI-Compatible Embeddings**: Works with LM Studio's developer endpoints or any OpenAI-compatible embedding API.

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

# Path to the persistent vector store file
VECTOR_STORE_PATH=./vector_store.json

# Performance and Search Tuning
RAG_INDEXING_CONCURRENCY=5
RAG_SEARCH_TOP_K=10
RAG_SEARCH_MIN_SCORE=0.5
```

### 3. Place Your Documents

By default, the server looks for documents in the `./documents` folder relative to the project root. 
- Create this folder if it doesn't exist.
- Drop your `.pdf`, `.md`, or `.txt` files into this directory (subfolders are supported).
- The server will automatically index these files on startup and whenever a file is added/modified.

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

## Available MCP Tools

Once connected, the LLM has access to the following tools:

| Tool | Description | Input Arguments |
| :--- | :--- | :--- |
| `search_documents` | Search the local index for relevant information based on a query. | `query` (string), `topK` (number) |
| `index_status` | Get total chunk count and a list of all unique indexed files. | None |
| `list_indexed_files` | List only the names of all currently indexed files. | None |

## Development & Testing

To run the server in development mode with auto-restart:

```bash
npm run dev
```

To start the server normally:

```bash
npm start
```
