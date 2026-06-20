/**
 * HTTP Streamable MCP Server for Kibana Compatibility
 *
 * This server provides a web-accessible MCP endpoint that implements
 * the Streamable HTTP transport protocol required by Kibana Agent Builder.
 * It reuses all tool logic from the shared tools.js module to ensure
 * consistency with the LM Studio stdio server.
 *
 * Usage: PORT=1235 node http-mcp-server.js
 */

const http = require("http");
const { URL } = require("url");
const path = require("path");

// Explicitly load .env from the script's directory
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Import shared tools and core components
const {
    getToolDefinitions,
    handleToolCall: handleToolCallShared,
} = require("./tools");
const EmbeddingEngine = require("./embeddingEngine");
const VectorDatabase = require("./vectorDatabase");
const EmailService = require("./emailService");

/**
 * Configuration for HTTP MCP Server
 */
const CONFIG = {
    PORT: parseInt(process.env.PORT, 10) || 1235,
};

/**
 * MCP Protocol version header
 */
const MCP_PROTOCOL_VERSION = "2025-06-18";

/**
 * Core component instances - shared with stdio server logic
 */
let embeddingEngine = null;
let vectorDb = null;
let emailService = null;
let ragConfig = null;
let serverReady = false;

/**
 * Initialize core RAG components (reuses stdio server logic)
 */
async function initializeComponents() {
    console.log("[HTTP MCP Server] Initializing shared RAG components...");

    const path = require("path");
    const fs = require("fs-extra");
    const chokidar = require("chokidar");

    // Load configuration (same as stdio server)
    ragConfig = {
        DOCUMENTS_FOLDER:
            process.env.RAG_DOCUMENTS_FOLDER ||
            path.join(__dirname, "documents"),
        EMBEDDING_API_URL:
            process.env.EMBEDDING_API_URL || "http://localhost:1234/v1",
        EMBEDDING_MODEL:
            process.env.EMBEDDING_MODEL ||
            "text-embedding-nomic-embed-text-v1.5",
        EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || "",
        VECTOR_STORE_PATH:
            process.env.VECTOR_STORE_PATH ||
            path.join(__dirname, "vector_store.json"),
        CHUNK_SIZE: 1000,
        CHUNK_OVERLAP: 200,
        SUPPORTED_EXTENSIONS: [".txt", ".md", ".pdf", ".docx", ".doc"],
        SEARCH_TOP_K: parseInt(process.env.RAG_SEARCH_TOP_K, 10) || 10,
        SEARCH_MIN_SCORE: parseFloat(process.env.RAG_SEARCH_MIN_SCORE) || 0.5,
    };

    // Initialize embedding engine (same as stdio server)
    embeddingEngine = new EmbeddingEngine({
        apiUrl: ragConfig.EMBEDDING_API_URL,
        model: ragConfig.EMBEDDING_MODEL,
        apiKey: ragConfig.EMBEDDING_API_KEY,
    });

    // Initialize vector database (same as stdio server)
    vectorDb = new VectorDatabase(ragConfig.VECTOR_STORE_PATH);
    await vectorDb.load();

    // Initialize email service (same as stdio server)
    emailService = EmailService;

    // Ensure documents directory exists
    await fs.ensureDir(ragConfig.DOCUMENTS_FOLDER);

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

    /**
     * Index a single file (reuses stdio server logic)
     */
    async function indexFile(filePath, isBulkIndex = false) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            if (!ragConfig.SUPPORTED_EXTENSIONS.includes(ext)) {
                return;
            }

            let content;
            if (ext === ".pdf") {
                const pdf = require("pdf-parse");
                const dataBuffer = await fs.readFile(filePath);
                const data = await pdf(dataBuffer);
                content = data.text;
            } else if (ext === ".docx") {
                const mammoth = require("mammoth");
                const dataBuffer = await fs.readFile(filePath);
                const result = await mammoth.extractRawText({
                    buffer: dataBuffer,
                });
                content = result.value;
            } else if (ext === ".doc") {
                // Legacy .doc support via LibreOffice CLI
                const { execPromise } = require("./core/utils");
                const tmp = require("tmp-promise");

                const tempDir = await tmp.dir();
                const { stdout, stderr } = await execPromise(
                    `libreoffice --headless --convert-to txt --outdir "${tempDir.path}" "${filePath}"`,
                );

                if (stderr) {
                    console.error(`[DEBUG] LibreOffice stderr: ${stderr}`);
                }

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

                await fs.rm(tempDir.path, { recursive: true, force: true });
            } else {
                content = await fs.readFile(filePath, "utf8");
            }

            if (!content || content.trim().length === 0) {
                return;
            }

            const chunks = chunkText(content);
            const embeddings = await embeddingEngine.embedBatch(chunks);

            chunks.forEach((chunk, i) => {
                const chunkId = `${filePath}#${i}`;
                vectorDb.upsertDocument(chunkId, chunk, embeddings[i]);
            });

            if (!isBulkIndex) {
                await vectorDb.save();
            }
        } catch (error) {
            console.error(
                `[HTTP MCP Server] Error indexing ${filePath}: ${error.message}`,
            );
        }
    }

    /**
     * Simple text chunking helper
     */
    function chunkText(
        text,
        chunkSize = ragConfig.CHUNK_SIZE,
        overlap = ragConfig.CHUNK_OVERLAP,
    ) {
        const chunks = [];
        let start = 0;

        while (start < text.length) {
            const end = start + chunkSize;
            const chunk = text.slice(start, end);
            chunks.push(chunk);
            start = end - overlap;
        }

        return chunks;
    }

    /**
     * Remove a file's chunks from the index
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
                `[HTTP MCP Server] Error removing ${filePath}: ${error.message}`,
            );
        }
    }

    // Initial bulk indexing
    console.log(
        "[HTTP MCP Server] Starting initial bulk indexing of existing documents...",
    );
    try {
        const existingFiles = await getAllFiles(ragConfig.DOCUMENTS_FOLDER);
        const supportedFiles = existingFiles.filter((file) => {
            const ext = path.extname(file).toLowerCase();
            return ragConfig.SUPPORTED_EXTENSIONS.includes(ext);
        });

        if (supportedFiles.length > 0) {
            console.log(
                `[HTTP MCP Server] Found ${supportedFiles.length} files to index`,
            );
            for (const file of supportedFiles) {
                await indexFile(file, true);
            }
            await vectorDb.save();
            console.log(
                `[HTTP MCP Server] Bulk indexing complete. Total documents: ${vectorDb.listDocuments().length}`,
            );
        } else {
            console.log("[HTTP MCP Server] No supported files found to index.");
        }
    } catch (error) {
        console.error(
            `[HTTP MCP Server] Error during initial bulk indexing: ${error.message}`,
        );
    }

    // Watch for changes
    chokidar
        .watch(ragConfig.DOCUMENTS_FOLDER, {
            persistent: true,
            ignoreInitial: true,
            depth: 99,
        })
        .on("all", async (event, filePath) => {
            if (event === "add" || event === "change") {
                await indexFile(filePath);
            } else if (event === "unlink") {
                await removeFile(filePath);
            }
        });

    serverReady = true;
    console.log("[HTTP MCP Server] Components initialized successfully");
}

/**
 * Create a JSON-RPC response
 */
function createJsonRpcResponse(id, result) {
    return {
        jsonrpc: "2.0",
        id,
        result,
    };
}

/**
 * Create a JSON-RPC error response
 */
function createJsonRpcError(id, code, message) {
    return {
        jsonrpc: "2.0",
        id,
        error: {
            code,
            message,
        },
    };
}

/**
 * Handle MCP protocol requests
 */
async function handleMcpRequest(method, params, id) {
    if (!serverReady) {
        return createJsonRpcError(id, -32000, "Server not ready");
    }

    switch (method) {
        case "initialize":
            return createJsonRpcResponse(id, {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {
                    tools: {},
                    resources: {},
                },
                serverInfo: {
                    name: "mcp-rag-endpoint-http",
                    version: "1.0.0",
                },
            });

        case "notifications/initialized":
            console.log("[HTTP MCP Server] Client initialized");
            return null;

        case "tools/list":
            return createJsonRpcResponse(id, {
                tools: getToolDefinitions(),
            });

        case "tools/call":
            return handleToolCall(params.name, params.arguments, id);

        default:
            return createJsonRpcError(
                id,
                -32601,
                `Method not found: ${method}`,
            );
    }
}

/**
 * Handle individual tool calls using shared logic from tools.js
 */
async function handleToolCall(toolName, args, id) {
    // Log tool call
    console.log(
        `[HTTP MCP Server] Tool call: ${toolName}`,
        JSON.stringify(args, null, 2),
    );

    try {
        // Use the shared handler from tools.js with local component instances
        const result = await handleToolCallShared(toolName, args, {
            embeddingEngine,
            vectorDb,
            emailService,
            CONFIG: ragConfig,
        });

        // Convert shared result format to HTTP MCP response format
        if (result.isError) {
            return createJsonRpcResponse(id, {
                content: [
                    {
                        type: "text",
                        text: Array.isArray(result.content)
                            ? result.content.map((c) => c.text).join("\n")
                            : result.content,
                    },
                ],
                isError: true,
            });
        }

        return createJsonRpcResponse(id, {
            content: [
                {
                    type: "text",
                    text: Array.isArray(result.content)
                        ? result.content.map((c) => c.text).join("\n")
                        : result.content,
                },
            ],
        });
    } catch (error) {
        console.error(
            `[HTTP MCP Server] Error handling tool call ${toolName}:`,
            error,
        );
        return createJsonRpcResponse(id, {
            content: [
                {
                    type: "text",
                    text: `Error executing tool: ${error.message}`,
                },
            ],
            isError: true,
        });
    }
}

/**
 * Create HTTP server
 */
const server = http.createServer(async (req, res) => {
    // Log incoming request for debugging
    console.log("[HTTP MCP Server] Incoming request:");
    console.log(`  Method: ${req.method}`);
    console.log(`  URL: ${req.url}`);
    console.log(`  Headers:`, JSON.stringify(req.headers, null, 2));

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Set CORS headers for web accessibility
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept, MCP-Protocol-Version",
    );

    // Handle preflight requests
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // Accept requests on /mcp or / (for nginx proxy compatibility)
    if (url.pathname !== "/mcp" && url.pathname !== "/") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
    }

    if (req.method !== "POST" && req.method !== "GET") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    try {
        let body = "";

        if (req.method === "POST") {
            for await (const chunk of req) {
                body += chunk.toString();
            }

            // Parse JSON request
            let request;
            try {
                request = JSON.parse(body);
            } catch (e) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify(
                        createJsonRpcError(null, -32700, "Parse error"),
                    ),
                );
                return;
            }

            // Handle the request
            const response = await handleMcpRequest(
                request.method,
                request.params,
                request.id,
            );

            if (response) {
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
                });
                res.end(JSON.stringify(response));
            } else {
                // Notification - respond with 202 Accepted
                res.writeHead(202);
                res.end();
            }
        } else if (req.method === "GET") {
            // GET requests can be used for health checks or simple queries
            res.writeHead(200, {
                "Content-Type": "application/json",
                "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
            });
            res.end(
                JSON.stringify({
                    status: serverReady ? "ready" : "initializing",
                    protocol: "MCP Streamable HTTP",
                    version: "1.0.0",
                    endpoint: "/mcp",
                    methods: [
                        "initialize",
                        "notifications/initialized",
                        "tools/list",
                        "tools/call",
                    ],
                }),
            );
        }
    } catch (error) {
        console.error("[HTTP MCP Server] Request error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify(
                createJsonRpcError(null, -32603, "Internal server error"),
            ),
        );
    }
});

/**
 * Start the server
 */
async function start() {
    try {
        await initializeComponents();

        server.listen(CONFIG.PORT, () => {
            console.log(`[HTTP MCP Server] Listening on port ${CONFIG.PORT}`);
            console.log(
                `[HTTP MCP Server] Endpoint: http://localhost:${CONFIG.PORT}/mcp`,
            );
            console.log(
                `[HTTP MCP Server] Protocol: MCP Streamable HTTP (${MCP_PROTOCOL_VERSION})`,
            );
            console.log(
                `[HTTP MCP Server] Embedding API: ${ragConfig.EMBEDDING_API_URL}`,
            );
        });

        // Handle server errors
        server.on("error", (error) => {
            console.error("[HTTP MCP Server] Server error:", error);
        });
    } catch (error) {
        console.error("[HTTP MCP Server] Failed to start:", error);
        process.exit(1);
    }
}

start();
