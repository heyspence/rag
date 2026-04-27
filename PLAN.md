```# RAG Endpoint Audit Remediation Plan

This document tracks the fixes for vulnerabilities, bugs, and architectural weaknesses identified during the project audit.

## 🎯 Goal
Stabilize the RAG endpoint by fixing critical pathing issues, improving database reliability on Windows, ensuring data integrity during indexing, and refining retrieval quality.

---

## 🛠️ Remediation Roadmap

### 🚨 Priority 1: Critical Pathing & Infrastructure (`CRT`)
*These items cause immediate data loss or failure of core functionality.*

- [x] **`CRT-01`: Absolute DB Pathing**
    - **Issue:** `VectorDatabase` uses `./` relative paths, making the database location dependent on the process CWD.
    - **Fix:** Ensure LanceDB connects using an absolute path derived from `CONFIG.VECTOR_STORE_PATH`.
- [x] **`CRT-02`: State File Path Resolution**
    - **Issue:** `.index_state.json` is joined to a file path instead of a directory, breaking incremental indexing.
    - **Fix:** Update configuration and logic so that the state file resides in a dedicated metadata directory relative to the vector store.

### ⚠️ Priority 2: Database Integrity & Reliability (`VDB`/`SYS`)
*These items affect data consistency and cross-platform stability.*

- [x] **`VDB-01`: Atomic Upserts**
    - **Issue:** Delete $\rightarrow$ Add sequence is non-atomic; crashes result in lost documents.
    - **Fix:** Implement a more robust upsert mechanism or transactional logic if supported by the LanceDB version.
- [x] **`VDB-02`: Score Ambiguity Resolution**
    - **Issue:** Unclear if results are L2 distance (lower is better) or Cosine similarity (higher is better).
    - **Fix:** Explicitly configure the distance metric in LanceDB and normalize scores for the end user.
- [x] **`SYS-01`: Windows UNC/Mapped Drive Support**
    - **Issue:** Fragile logic for `Z:\` drives can cause initialization failures on certain Windows setups.
    - **Fix:** Standardize path normalization using `path.resolve()` and verify compatibility with LanceDB's Rust layer.

### ⚙️ Priority 3: Indexing Robustness (`IDX`)
*These items prevent resource leaks and improve data extraction quality.*

- [x] **`IDX-01`: Watcher Leak Prevention**
    - **Issue:** `index_path` creates duplicate `chokidar` watchers for the same folder.
    - **Fix:** Maintain a registry of active watched paths and check before adding new ones.
- [x] **`IDX-02`: PDF Extraction Reliability**
    - **Issue:** Dependence on `pdf-parse` may result in empty/jumbled text for complex or scanned PDFs.
    - **Fix:** Add validation for extracted content; implement better error handling and consider alternative extraction strategies for problematic files.
- [x] **`IDX-03`: State Write Race Conditions**
    - **Issue:** Async workers update `.index_state.json` concurrently, potentially corrupting the state file.
    - **Fix:** Implement a write queue or locking mechanism for updating the index state.

### 📉 Priority 4: Feature Quality & UX (`MCP`)
*These items improve the utility and transparency of the system.*

- [x] **`MCP-01`: Functional Similarity Filtering**
    - **Issue:** `SEARCH_MIN_SCORE` is ignored in the current implementation (placeholder `return true`).
    - **Fix:** Implement actual score threshold filtering based on the resolved metric from `VDB-02`.
- [x] **`MCP-02`: Indexing Failure Reporting**
    - **Issue:** Failures are logged to console but not reported back to the user via MCP tools.
    - **Fix:** Update `index_path` and bulk indexing logic to return a summary of failed files in the tool response.

---

## 📈 Progress Summary
- [x] Criticals: 2/2
- [x] Highs: 3/3
- [x] Mediums: 3/3
- [x] Lows: 2/2
