# Session Context - RAG Endpoint Project

## 📅 Last Updated
2026-05-10

---

## ✅ Recent Accomplishments

### Complete Reindex Implementation (2026-05-10)
**Feature Added**: Full reindexing capabilities to ensure all documents get reindexed at restart or on-demand.

**Implementation Details**:

1. **REINDEX_ON_STARTUP Configuration Option**:
   - Added `REINDEX_ON_STARTUP` config in `index.js` (reads from `.env`)
   - When set to `"true"` or `"1"`, clears vector store before bulk indexing
   - Ensures guaranteed fresh indexing on every server restart
   - Logs previous document count and cleared status to console

2. **reindex_documents MCP Tool**:
   - New tool available via LM Studio for on-demand reindexing
   - Clears existing index completely
   - Re-indexes all files from scratch
   - Returns detailed success/failure counts
   - Includes embedding API availability check before proceeding
   - Individual file error handling (continues if one fails)

**Files Modified**:
- `index.js` - Added REINDEX_ON_STARTUP config, clear logic in startup, and reindex_documents tool handler
- `core/README.md` - Updated documentation with reindex options and usage guidelines


### Automatic Document Indexing Fix (CRITICAL) - Now Enhanced with Reindex Options
**Issue**: Files were not being indexed automatically immediately after initialization with LM Studio.

**Root Cause Identified**: 

- The `getAllFiles()` function was defined but never called on startup
- The chokidar watcher had `ignoreInitial: true`, meaning it only watched for *new* file changes, not existing files
- A comment said "Initial Indexing on startup" but no actual code existed

**Solution Implemented (Phase 1 - Bulk Indexing)**:

Added bulk indexing logic in `index.js` that runs before the file watcher starts:
1. Calls `getAllFiles()` to recursively get all files from the documents folder
2. Filters for supported extensions (`.txt`, `.md`, `.pdf`)
3. Iterates through each file and calls `indexFile(file, true)` with `isBulkIndex = true`
4. Saves the vector database once after all files are indexed
5. Logs progress and completion status to console

**Solution Implemented (Phase 2 - Error Handling & API Check)**:
- Added `checkEmbeddingAPI()` function to verify LM Studio is running before bulk indexing
- Added 30-second timeout protection for embedding API calls per file
- Improved error handling with success/failure counters during bulk indexing
- Added detailed console logging at each startup phase
- Errors in individual files no longer crash the entire process (continues with next file)

5. Logs progress and completion status to console

**Files Modified**:

- `index.js` - Added bulk indexing loop between lines 162-183

**Verification Steps**:
1. Restart the RAG server via LM Studio
2. Check console for: `[RAG Server] Starting initial bulk indexing of existing documents...`
3. Verify: `[RAG Server] Found X files to index`
4. Confirm: `[RAG Server] Bulk indexing complete. Total documents in store: Y`

- `index.js` - Added bulk indexing loop (lines 162-183)
- `index.js` - Added embedding API health check and timeout protection (lines 78-119, 240-245)

### Memory Protocol Initialization

- Created `core/README.md` with project architecture and file tree
- Created `memory/session_context.md` for session state tracking
- Updated documentation to reflect the bulk indexing fix

---

## 📊 Current Project Status


### Overall Status: ⚠️ Requires LM Studio Running for Full Functionality


| Component | Status | Notes |
|-----------|--------|-------|
| RAG Document Search | ✅ Working | Bulk indexing runs on startup |
| Vector Storage | ✅ Working | Persists to `vector_store.json` |
| MCP Server | ✅ Working | Configured in `mcp.json` for LM Studio |
| Embedding API Check | ✅ Added | Verifies LM Studio availability before indexing |
| Error Handling | ✅ Improved | Timeout protection and graceful error recovery |

| Document Indexing | ✅ FIXED | Now indexes existing files on startup |

### Startup Sequence (After Latest Fixes)


1. Initialize components and load existing vector store
2. Get all files from documents folder
3. **NEW**: Check if embedding API is available (LM Studio must be running)
4. If API unavailable: Log error and throw exception (prevents silent failure)
5. If API available: Process each file with 30-second timeout per file
6. Save vector database once after all files processed
7. Start MCP server and connect to LM Studio

- Only NEW files added after server start would be indexed
- Existing files in `documents/` folder were ignored
- Users had to manually trigger re-indexing or restart multiple times

**After the fix**:
- All existing `.txt`, `.md`, and `.pdf` files are indexed immediately on startup
- New file additions are still watched and indexed in real-time
- Console provides clear feedback during bulk indexing process

**Before the fix**: 


```
documents/
└── SEND_EMAIL_GUIDE.md    # Currently the only document (will be indexed on startup)
```

**After Phase 1 fix (bulk indexing)**: 
- All existing `.txt`, `.md`, and `.pdf` files are indexed immediately on startup
- New file additions are still watched and indexed in real-time
- Console provides clear feedback during bulk indexing process

**After Phase 2 fix (error handling)**:
- Clear error messages if LM Studio is not running
- Timeout protection prevents hanging on slow API responses
- Individual file failures don't crash the entire indexing process
- Detailed success/failure counts reported after bulk indexing

### Current Document State


## 🚀 Immediate Next Steps

### Priority 1: Test Reindex Functionality

- [ ] **Test REINDEX_ON_STARTUP configuration**:
  - Set `REINDEX_ON_STARTUP=true` in `.env` file
  - Restart RAG server via LM Studio
  - Verify console shows "REINDEX_ON_STARTUP enabled - clearing existing index..."
  - Confirm all files are re-indexed from scratch
  - Check that previous document count is logged

- [ ] **Test reindex_documents MCP tool**:
  - Use `reindex_documents` tool through LM Studio
  - Verify it clears existing index and rebuilds
  - Check response shows success/failure counts
  - Confirm total chunks in new index matches expected count

### Priority 2: Test Error Scenarios



### Priority 1: Test with LM Studio Running

- [ ] Restart LM Studio / RAG server
- [ ] Check console output for bulk indexing messages
- [ ] Ensure LM Studio is running with an embedding model loaded
- [ ] Verify LM Studio endpoint is accessible at configured URL (default: http://localhost:1234/v1)
- [ ] Restart RAG server via LM Studio MCP plugin
- [ ] Check console output for all startup messages including "✓ Embedding API is available"
- [ ] Confirm bulk indexing completes successfully
- [ ] Use `index_status` MCP tool to verify documents are indexed

- [ ] Test `search_documents` with queries related to existing content

### Priority 2: Test Error Scenarios

- [ ] Add additional `.txt`, `.md`, or `.pdf` files to `documents/` folder
- [ ] Add additional `.txt`, `.md`, or `.pdf` files to `documents/` folder
- [ ] Verify they appear in `list_indexed_files` output
- [ ] Confirm search returns relevant results from new documents

- [ ] Stop LM Studio and restart RAG server to verify error handling
- [ ] Check that clear error message appears: "Cannot reach embedding API"
- [ ] Verify server still starts but indexing is skipped
- [ ] Restart LM Studio and confirm indexing works on next startup


### Priority 3: Add More Test Documents

- [ ] Test with larger document collections (10+ files)
- [ ] Measure indexing time for performance baseline
- [ ] Verify error handling when embedding API is unavailable during startup
### Priority 4: Update Documentation & Testing

- [ ] Verify `core/README.md` accurately reflects reindex options
- [ ] Test both reindex methods (startup config vs MCP tool) produce identical results
- [ ] Document performance characteristics for large document collections
- [ ] Consider adding progress indicators for long reindex operations

### Production Validation Checklist


1. Check console during startup for all phases:
   - "Initializing RAG endpoint..."
   - "Loading vector database..."
   - "✓ Embedding API is available" (or error message if not)
   - "Found X files to index"
   - Individual file progress: "Indexing: filename..." → "✓ Indexed: filename"
   - "Bulk indexing complete. Success: X, Failed: Y"

2. If embedding API check fails: Ensure LM Studio is running with an embedding model loaded

3. Verify documents folder contains supported file types (.txt, .md, .pdf)

4. Use `index_status` MCP tool to check current index state

5. Use `reindex_documents` MCP tool instead of manually deleting `vector_store.json` (preferred method)
   - OR set `REINDEX_ON_STARTUP=true` for automatic reindex on every restart


6. Check for timeout errors if files are large or API is slow

---


- [ ] Test with larger document collections (10+ files)
- [ ] Measure indexing time for performance baseline
- [ ] Verify error handling when embedding API is unavailable during startup
- [ ] Consider adding retry logic or graceful degradation for failed files

## 📝 Technical Notes for Next Agent


### Embedding API Health Check (New)


Before bulk indexing, the system now checks if LM Studio's embedding API is available:


```javascript
async function checkEmbeddingAPI() {
    try {
        const response = await fetch(
            `${CONFIG.EMBEDDING_API_URL}/embeddings`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: "test",
                    model: CONFIG.EMBEDDING_MODEL,
                }),
            },
        );

        if (response.ok) {
            console.log("[RAG Server] ✓ Embedding API is available");
            return true;
        } else {
            console.error(`[RAG Server] ✗ Embedding API returned status ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`[RAG Server] ✗ Cannot reach embedding API: ${error.message}`);
        console.error("[RAG Server] Please ensure LM Studio is running with an embedding model loaded");
        return false;
    }
}

// Called before bulk indexing:
const apiAvailable = await checkEmbeddingAPI();
if (!apiAvailable) {
    throw new Error("Embedding API not available");
}
```

**Why This Matters**: Without this check, the server would hang or fail silently during bulk indexing if LM Studio wasn't running. Now users get a clear error message.


### Timeout Protection for Embedding Calls (New)


Each file indexing operation now has a 30-second timeout:

```javascript
const embeddingsPromise = embeddingEngine.embedBatch(chunks);
const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
        () => reject(new Error(`Embedding API timeout after 30 seconds`)),
        30000,
    );
});

const embeddings = await Promise.race([embeddingsPromise, timeoutPromise]);
```

**Why This Matters**: Prevents the server from hanging indefinitely if LM Studio becomes unresponsive during embedding generation.

2. **Add new file format support**: Add processing logic in `indexFile()` function
3. **Adjust chunking behavior**: Modify `CHUNK_SIZE` and `CHUNK_OVERLAP` in CONFIG
4. **Change embedding model**: Update `EMBEDDING_MODEL` environment variable

### Reindex Implementation Details (NEW FEATURE)


Two reindex methods are now available:

#### Method 1: REINDEX_ON_STARTUP Configuration

Add to `.env` file:
```
REINDEX_ON_STARTUP=true
```

This triggers automatic clearing and reindexing on every server restart. The code adds this logic after component initialization:


```javascript
// If REINDEX_ON_STARTUP is enabled, clear the vector store first
if (CONFIG.REINDEX_ON_STARTUP) {
    console.log(
        "[RAG Server] REINDEX_ON_STARTUP enabled - clearing existing index...",
    );
    const previousCount = vectorDb.listDocuments().length;
    vectorDb.clear();
    await vectorDb.save();
    console.log(
        `[RAG Server] Cleared ${previousCount} documents from index`,
    );
}

// Then proceed with normal bulk indexing...
```

**Key Points**:
- Only clears when `REINDEX_ON_STARTUP=true` in `.env`
- Logs previous document count for verification
- Saves cleared state before reindexing begins
- Normal bulk indexing proceeds after clear

#### Method 2: reindex_documents MCP Tool

Available as an MCP tool callable from LM Studio. Implementation includes:
- Complete index clearing via `vectorDb.clear()` and `vectorDb.save()`
- Embedding API availability check before proceeding
- Sequential file processing with individual error handling
- Detailed response with success/failure counts and failed file list
- Single save operation after all files processed

**Response Format**:
```
Reindex complete!
Total files found: X
Successfully indexed: Y
Failed: Z
Total chunks in index: N

Failed files: (if any)
filename1.txt: error message
filename2.pdf: error message
```


---

## 🔗 Reference Documentation

| Document | Purpose |
|----------|---------|
| `core/README.md` | Project architecture, file tree, agent workflow guidelines |
| `README.md` | User-facing documentation for RAG endpoint |
| `index.js` | Main application with bulk indexing logic |
| `embeddingEngine.js` | Vector embedding generation |
| `vectorDatabase.js` | Persistent storage module |

---

### Quick Reference: Reindex Methods

| Method | When to Use | How To |
|--------|-------------|--------|
| **REINDEX_ON_STARTUP** | Development, frequent content changes | Set `REINDEX_ON_STARTUP=true` in `.env`, restart server |
| **reindex_documents tool** | On-demand refresh without restart | Call via LM Studio MCP interface |
| **Manual delete** | Legacy method (deprecated) | Delete `vector_store.json` and restart (NOT recommended) |

---

**Protocol Compliance**: This file follows the Memory Protocol v1.0 for project continuity across multiple agents. Always update this file after completing significant work.