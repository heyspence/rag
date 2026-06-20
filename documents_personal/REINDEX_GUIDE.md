# Document Reindexing Guide

This guide explains how to ensure all documents get reindexed when you restart the RAG endpoint server, or on-demand without restarting.

---

## Why Reindex?

You may need to reindex your documents in these scenarios:

- **Document content changed** - Files were modified but still have old embeddings
- **Embedding model updated** - Different model produces different vector representations
- **Chunking parameters changed** - `CHUNK_SIZE` or `CHUNK_OVERLAP` settings were adjusted
- **Index corruption** - Vector store has stale or corrupted data
- **Development/testing** - Want guaranteed fresh indexing during development

---

## Method 1: Automatic Reindex on Every Startup

### Configuration

Add this line to your `.env` file:

```env
REINDEX_ON_STARTUP=true
```

Valid values:
- `"true"` - Enable reindexing
- `"1"` - Also enables reindexing
- Any other value or omitted - Normal behavior (no automatic reindex)

### What Happens at Startup

When `REINDEX_ON_STARTUP=true`:

1. Server loads existing vector store
2. **Clears all documents** from the index
3. Logs: `"REINDEX_ON_STARTUP enabled - clearing existing index..."`
4. Logs: `"Cleared X documents from index"`
5. Re-indexes all files in `documents/` folder from scratch
6. Saves fresh vector store

### Console Output Example

```
[RAG Server] Initializing RAG endpoint...
[RAG Server] Loading vector database...
[RAG Server] Loaded 15 existing documents from store
[RAG Server] REINDEX_ON_STARTUP enabled - clearing existing index...
[RAG Server] Cleared 15 documents from index
[RAG Server] Starting initial bulk indexing of existing documents...
[RAG Server] ✓ Embedding API is available
[RAG Server] Found 3 files to index
[RAG Server] Indexing: document1.md...
[RAG Server] Generated 5 chunks for document1.md
[RAG Server] ✓ Indexed: document1.md
[RAG Server] Bulk indexing complete. Success: 3, Failed: 0. Total documents in store: 25
```

### When to Use

✅ **Use REINDEX_ON_STARTUP=true when:**
- You're actively developing and modifying documents frequently
- You want guaranteed fresh embeddings on every restart
- Testing changes to chunking or embedding parameters
- Working with dynamic content that changes often

❌ **Avoid REINDEX_ON_STARTUP=true when:**
- Indexing large document collections (slow startup)
- Production environments where fast startup is critical
- Documents rarely change (wasteful reprocessing)

---

## Method 2: Manual Reindex via MCP Tool

### Using the `reindex_documents` Tool

Call this tool through LM Studio or any MCP client:

```json
{
  "name": "reindex_documents",
  "arguments": {}
}
```

No arguments required - it will clear and rebuild the entire index.

### What Happens When Called

1. Clears existing vector store immediately (no restart needed)
2. Checks if embedding API (LM Studio) is available
3. Scans `documents/` folder for supported files
4. Re-indexes each file sequentially with error handling
5. Saves fresh vector store when complete
6. Returns detailed success/failure report

### Response Example

**Success:**
```
Reindex complete!
Total files found: 5
Successfully indexed: 5
Failed: 0
Total chunks in index: 42
```

**With Errors:**
```
Reindex complete!
Total files found: 6
Successfully indexed: 5
Failed: 1
Total chunks in index: 38

Failed files:
corrupted.pdf: PDF extraction failed: Invalid PDF format
```

### Console Output Example

```
[RAG Server] Manual reindex requested via MCP tool...
[RAG Server] Cleared 25 documents from index
[RAG Server] ✓ Embedding API is available
[RAG Server] Indexing: document1.md...
[RAG Server] Generated 5 chunks for document1.md
[RAG Server] ✓ Indexed: document1.md
[RAG Server] Indexing: document2.txt...
[RAG Server] Generated 3 chunks for document2.txt
[RAG Server] ✓ Indexed: document2.txt
```

### When to Use

✅ **Use `reindex_documents` tool when:**
- You need to refresh the index without restarting the server
- Documents changed and you want immediate updates
- Testing reindex functionality during development
- Troubleshooting indexing issues

❌ **Avoid when:**
- Server is under heavy load (reindexing consumes resources)
- Embedding API is unavailable (will fail gracefully with error message)

---

## Comparison: Reindex Methods

| Method | Requires Restart | Speed | Best For |
|--------|------------------|-------|----------|
| `REINDEX_ON_STARTUP=true` | Yes | Slow (at startup) | Development, frequent changes |
| `reindex_documents` tool | No | Medium (on-demand) | Production, occasional refreshes |
| Manual delete + restart | Yes | Slow | Legacy method (deprecated) |

---

## Troubleshooting

### Reindex Fails with "Embedding API not available"

**Problem:** LM Studio is not running or unreachable.

**Solution:**
1. Start LM Studio with an embedding model loaded
2. Verify endpoint at `http://localhost:1234/v1` (or your configured URL)
3. Retry the reindex operation

### Reindex Takes Too Long

**Problem:** Large document collection causes slow startup or tool response.

**Solutions:**
- Consider using `REINDEX_ON_STARTUP=false` in production
- Index only when necessary, not on every restart
- Check network speed to embedding API
- Reduce document count if possible

### Individual Files Fail During Reindex

**Problem:** Some files show "Failed" in reindex response.

**Common Causes:**
- **PDF files**: Corrupted or password-protected PDFs
- **Empty files**: No text content extracted
- **Encoding issues**: Non-UTF8 text files

**Solutions:**
1. Check console logs for specific error messages
2. Fix or remove problematic files
3. Re-run reindex after fixing issues

### Index Still Shows Old Data After Reindex

**Problem:** Documents appear unchanged despite reindexing.

**Checklist:**
- [ ] Verify `documents/` folder contains the updated files
- [ ] Confirm file extensions are supported (`.txt`, `.md`, `.pdf`)
- [ ] Check that embedding API is returning different vectors for changed content
- [ ] Use `index_status` tool to verify chunk counts match expectations

---

## Best Practices

### Development Workflow

```bash
# 1. Set reindex on startup during active development
echo "REINDEX_ON_STARTUP=true" >> .env

# 2. Restart server after document changes
# (automatic reindex happens)

# 3. Verify indexing completed
# Check console for: "Bulk indexing complete. Success: X, Failed: Y"
```

### Production Workflow

```bash
# 1. Keep REINDEX_ON_STARTUP=false in production
echo "REINDEX_ON_STARTUP=false" >> .env

# 2. Only reindex when documents actually change
# Use MCP tool to trigger on-demand:
# { "name": "reindex_documents", "arguments": {} }

# 3. Monitor indexing success via console logs
```

### Performance Optimization

- **Small collections (<50 files)**: Either method works fine
- **Medium collections (50-200 files)**: Use on-demand reindex only when needed
- **Large collections (200+ files)**: 
  - Avoid `REINDEX_ON_STARTUP=true` in production
  - Consider incremental updates instead of full reindex
  - Schedule reindex during low-traffic periods

---

## Verification Commands

After reindexing, verify the index is correct:

### Check Index Status

```json
{
  "name": "index_status",
  "arguments": {}
}
```

Expected output:
```
Indexing active. Total chunks: 42. Unique files indexed: 5.
Files:
documents/document1.md
documents/document2.txt
...
```

### List Indexed Files

```json
{
  "name": "list_indexed_files",
  "arguments": {}
}
```

Expected output:
```
Indexed Files:
document1.md
document2.txt
document3.pdf
```

### Test Search Functionality

```json
{
  "name": "search_documents",
  "arguments": {
    "query": "your test query here",
    "topK": 5
  }
}
```

Verify results are relevant and from expected documents.

---

## Quick Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REINDEX_ON_STARTUP` | `false` | Set to `"true"` or `"1"` to auto-reindex on restart |
| `RAG_DOCUMENTS_FOLDER` | `./documents` | Folder containing documents to index |
| `VECTOR_STORE_PATH` | `./vector_store.json` | Path to persistent vector store |

### MCP Tools for Indexing

| Tool | Purpose | Arguments |
|------|---------|-----------|
| `reindex_documents` | Complete reindex (clears + rebuilds) | None |
| `index_status` | View current index statistics | None |
| `list_indexed_files` | List indexed file names | None |
| `search_documents` | Search indexed documents | `query`, `topK` |

---

## Support & Resources

- **Project Documentation**: See `core/README.md` for architecture details
- **Session Context**: Check `memory/session_context.md` for recent changes
- **Error Logs**: Monitor console output during startup and reindex operations
- **Embedding API**: Ensure LM Studio is running at configured endpoint

---

**Last Updated:** 2026-05-10  
**Version:** 1.0  
**Author:** RAG Endpoint Development Team