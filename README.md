
# MCP-compatible RAG Endpoint for Node.js

This project creates a MCP-compatible RAG (Retrieval-Augmented Generation) endpoint running on Node.js that works with LM Studio developer endpoints.

## Configuration

The system uses a configurable folder which contains all documents to be indexed. The default configuration file is located at `Z:\TEMP\RAG\rag_endpoint\config\default_config.json`.

### Key Configurable Settings:
- **folder_path**: Path to document directory (default: "./documents")
- **indexing_on_startup**: Whether to index documents on startup
- **vector_database_type**: Memory or file storage vector database
- **change_detection_enabled**: Directory change watcher enabled

## LM Studio Developer Endpoint Compatibility

The endpoint is named `RAGEndpoint` and compatible with LM Studio developer endpoints. It listens/checks for changes to the configured directory to update the vector database.

## Vector Database Implementation

The system uses two vector database types:
- **VectorMemoryDatabase**: Memory-based storage using Map
- **VectorFileDatabase**: File-based storage with persistent files

## Embedding Engine

Uses sentence-transformer model with default 384 dimensions and caching support via sha256 hash algorithm.

## Search Algorithm

Cosine similarity search method with configurable similarity threshold (default: 0.8).

## Directory Change Detection

The system uses `fs.watch` to watch for directory changes and automatically updates vector database when files are added or modified.
