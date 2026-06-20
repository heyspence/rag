const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
    StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const chokidar = require("chokidar");
const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { exec } = require("child_process");
const util = require("util");
const tmp = require("tmp-promise");
const execPromise = util.promisify(exec);

const EmbeddingEngine = require("./embeddingEngine");
const VectorDatabase = require("./vectorDatabase");
const EmailService = require("./emailService");
const { getToolDefinitions, handleToolCall } = require("./tools");

/**
 * Configuration for the RAG Endpoint
 */
const CONFIG = {
    DOCUMENTS_FOLDER:
        process.env.RAG_DOCUMENTS_FOLDER || path.join(__dirname, "documents"),
    EMBEDDING_API_URL:
        process.env.EMBEDDING_API_URL || "http://localhost:1234/v1",
    EMBEDDING_MODEL:
        process.env.EMBEDDING_MODEL || "text-embedding-nomic-embed-text-v1.5",
    EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || "",
    VECTOR_STORE_PATH:
        process.env.VECTOR_STORE_PATH ||
        path.join(__dirname, "vector_store.json"),
    CHUNK_SIZE: 1000, // characters per chunk
    CHUNK_OVERLAP: 200,
    SUPPORTED_EXTENSIONS: [".txt", ".md", ".pdf", ".docx", ".doc"], // Only these types are indexed; others (e.g., images) are ignored
    INDEXING_CONCURRENCY:
        parseInt(process.env.RAG_INDEXING_CONCURRENCY, 10) || 5,
    SEARCH_TOP_K: parseInt(process.env.RAG_SEARCH_TOP_K, 10) || 10,
    SEARCH_MIN_SCORE: parseFloat(process.env.RAG_SEARCH_MIN_SCORE) || 0.5,
    ENABLE_DIAGNOSTIC_LOGGING: process.env.RAG_ENABLE_DIAGNOSTICS === "true",
};

/**
 * Diagnostic logging helper - only logs when diagnostics are enabled
 */
function diagLog(...args) {
    if (CONFIG.ENABLE_DIAGNOSTIC_LOGGING) {
        console.error("[DIAG]", ...args);
    }
}

/**
 * Utility to split text into overlapping chunks for better retrieval context
 */
function chunkText(text) {
    const chunks = [];
    let offset = 0;
    while (offset < text.length) {
        chunks.push(text.substring(offset, offset + CONFIG.CHUNK_SIZE));
        offset += CONFIG.CHUNK_SIZE - CONFIG.CHUNK_OVERLAP;
    }
    return chunks;
}

async function main() {
    // Initialize components
    const embeddingEngine = new EmbeddingEngine({
        apiUrl: CONFIG.EMBEDDING_API_URL,
        model: CONFIG.EMBEDDING_MODEL,
        apiKey: CONFIG.EMBEDDING_API_KEY,
    });

    const vectorDb = new VectorDatabase({
        storagePath: CONFIG.VECTOR_STORE_PATH,
    });

    await vectorDb.load();

    // DIAGNOSTIC: Log startup environment info
    diagLog("=== RAG SERVER STARTUP DIAGNOSTICS ===");
    diagLog("DOCUMENTS_FOLDER:", CONFIG.DOCUMENTS_FOLDER);
    diagLog("DOCUMENTS_FOLDER_EXISTS:", fs.existsSync(CONFIG.DOCUMENTS_FOLDER));
    diagLog("VECTOR_STORE_PATH:", CONFIG.VECTOR_STORE_PATH);
    diagLog("SUPPORTED_EXTENSIONS:", CONFIG.SUPPORTED_EXTENSIONS.join(", "));
    diagLog("ENABLE_DIAGNOSTIC_LOGGING:", CONFIG.ENABLE_DIAGNOSTIC_LOGGING);

    /**
     * Logic to index a single file
     */
    async function indexFile(filePath) {
        try {
            const extension = path.extname(filePath).toLowerCase();
            if (!CONFIG.SUPPORTED_EXTENSIONS.includes(extension)) {
                diagLog(
                    "SKIPPING (unsupported extension):",
                    filePath,
                    "extension:",
                    extension,
                );
                return;
            }
            diagLog("INDEXING FILE:", filePath, "extension:", extension);

            let content;
            if (extension === ".pdf") {
                console.error(`[DEBUG] Processing PDF: ${filePath}`);
                const dataBuffer = await fs.readFile(filePath);
                const pdfData = await pdf(dataBuffer);
                content = pdfData.text;
                console.error(
                    `[DEBUG] Extracted ${content?.length || 0} characters from ${filePath}`,
                );
            } else if (extension === ".docx") {
                console.error(`[DEBUG] Processing Word document: ${filePath}`);
                const dataBuffer = await fs.readFile(filePath);
                const result = await mammoth.extractRawText({
                    buffer: dataBuffer,
                });
                content = result.value;
                if (result.messages.length > 0) {
                    console.error(
                        `[DEBUG] Mammoth messages for ${filePath}:`,
                        result.messages,
                    );
                }
                console.error(
                    `[DEBUG] Extracted ${content?.length || 0} characters from ${filePath}`,
                );
            } else if (extension === ".doc") {
                console.error(
                    `[DEBUG] Processing legacy Word document: ${filePath}`,
                );
                try {
                    // Create temp directory for conversion output
                    const tempDir = await tmp.dir();

                    console.error(
                        `[DEBUG] Converting .doc file using LibreOffice CLI...`,
                    );

                    // Use libreoffice --headless to convert .doc to text
                    const { stdout, stderr } = await execPromise(
                        `libreoffice --headless --convert-to txt --outdir "${tempDir.path}" "${filePath}"`,
                    );

                    if (stderr) {
                        console.error(`[DEBUG] LibreOffice stderr: ${stderr}`);
                    }

                    // Find the converted .txt file
                    const files = await fs.readdir(tempDir.path);
                    const txtFile = files.find((f) => f.endsWith(".txt"));

                    if (!txtFile) {
                        throw new Error(
                            "No text file was created by LibreOffice conversion",
                        );
                    }

                    content = await fs.readFile(
                        path.join(tempDir.path, txtFile),
                        "utf8",
                    );

                    // Cleanup temp files
                    await fs.rm(tempDir.path, { recursive: true, force: true });

                    console.error(
                        `[DEBUG] Extracted ${content?.length || 0} characters from ${filePath}`,
                    );
                } catch (err) {
                    console.error(
                        `[WARN] Failed to extract text from .doc file ${filePath}: ${err.message}.`,
                    );
                    if (
                        err.message.includes("soffice") ||
                        err.message.includes("libreoffice")
                    ) {
                        console.error(
                            `[WARN] Please install LibreOffice and ensure it is in your system PATH.`,
                        );
                    }
                    diagLog(
                        "DOC EXTRACTION FAILED:",
                        filePath,
                        "error:",
                        err.message,
                    );
                    return;
                }
            } else {
                content = await fs.readFile(filePath, "utf8");
            }

            if (!content || content.trim().length === 0) {
                console.error(
                    `[WARN] No text content extracted from ${filePath}. Skipping.`,
                );
                diagLog("EMPTY CONTENT:", filePath);
                return;
            }

            const chunks = chunkText(content);
            const embeddings = await embeddingEngine.embedBatch(chunks);

            for (let i = 0; i < chunks.length; i++) {
                const chunkId = `${filePath}#${i}`;
                await vectorDb.upsertDocument(
                    chunkId,
                    chunks[i],
                    embeddings[i],
                );
            }

            await vectorDb.save();
        } catch (error) {
            console.error(
                `[RAG Server] Error indexing ${filePath}: ${error.message}`,
            );
        }
    }

    /**
     * Logic to remove a file's chunks from the index
     */
    async function removeFile(filePath) {
        try {
            const indexedDocs = vectorDb.listDocuments();
            const matchingChunks = indexedDocs.filter((id) =>
                id.startsWith(filePath),
            );
            for (const id of matchingChunks) {
                await vectorDb.deleteDocument(id);
            }
        } catch (error) {
            console.error(
                `[RAG Server] Error removing ${filePath}: ${error.message}`,
            );
        }
    }

    // Ensure documents directory exists
    await fs.ensureDir(CONFIG.DOCUMENTS_FOLDER);

    /**
     * Recursively get all files in a directory
     */
    async function getAllFiles(dirPath, arrayOfFiles = []) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            if ((await fs.stat(filePath)).isDirectory()) {
                await getAllFiles(filePath, arrayOfFiles);
            } else {
                arrayOfFiles.push(filePath);
            }
        }
        return arrayOfFiles;
    }

    // Initial Indexing on startup
    console.log(
        "[RAG Server] Starting initial bulk indexing of existing documents...",
    );
    try {
        const existingFiles = await getAllFiles(CONFIG.DOCUMENTS_FOLDER);
        // DIAGNOSTIC: Log file discovery details
        diagLog("=== FILE DISCOVERY ===");
        diagLog("Total files found:", existingFiles.length);

        const supportedFiles = existingFiles.filter((file) => {
            const ext = path.extname(file).toLowerCase();
            const isSupported = CONFIG.SUPPORTED_EXTENSIONS.includes(ext);
            if (!isSupported) {
                diagLog("SKIPPING (unsupported):", file, "ext:", ext);
            } else {
                diagLog("WILL INDEX:", file, "ext:", ext);
            }
            return isSupported;
        });

        diagLog("Files to be indexed:", supportedFiles.length);

        if (supportedFiles.length > 0) {
            console.log(
                `[RAG Server] Found ${supportedFiles.length} files to index`,
            );
            for (const file of supportedFiles) {
                await indexFile(file, false); // isBulkIndex = false, save after each
            }
            console.log(
                `[RAG Server] Bulk indexing complete. Total documents in store: ${vectorDb.listDocuments().length}`,
            );
        } else {
            console.log("[RAG Server] No supported files found to index.");
        }
    } catch (error) {
        console.error(
            `[RAG Server] Error during initial bulk indexing: ${error.message}`,
        );
    }

    // Watch for changes in the documents folder and all subfolders
    chokidar
        .watch(CONFIG.DOCUMENTS_FOLDER, {
            persistent: true,
            ignoreInitial: true,
            depth: 99, // Ensure recursive watching of subdirectories
        })
        .on("all", async (event, filePath) => {
            if (event === "add" || event === "change") {
                await indexFile(filePath);
            } else if (event === "unlink") {
                await removeFile(filePath);
            }
        });

    // Create MCP Server
    const server = new Server(
        {
            name: "mcp-rag-endpoint",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    // Define Tools - use shared tool definitions
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: getToolDefinitions(),
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        // Log tool call
        console.log(
            `[LM Studio Server] Tool call: ${name}`,
            JSON.stringify(args, null, 2),
        );

        // Use shared tool handler with local component instances
        return handleToolCall(name, args, {
            embeddingEngine,
            vectorDb,
            config: CONFIG,
            path,
            EmailService,
        });
    });

    // Start Server
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error(`[RAG Server] Fatal error during startup: ${error.message}`);
    process.exit(1);
});
