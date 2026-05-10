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
const express = require("express");

const EmbeddingEngine = require("./embeddingEngine");
const MySQLVectorDatabase = require("./mysqlVectorDatabase");
const EmailService = require("./emailService");
const express = require("express");

/**
 * Configuration for the RAG Endpoint
 */
const CONFIG = {
    DOCUMENTS_FOLDER: path.join(__dirname, "documents"),
    EMBEDDING_API_URL:
        process.env.EMBEDDING_API_URL || "http://localhost:1234/v1",
    EMBEDDING_MODEL:
        process.env.EMBEDDING_MODEL || "text-embedding-nomic-embed-text-v1.5",
    EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || "",
    VECTOR_STORE_PATH:
        process.env.VECTOR_STORE_PATH ||
        path.join(__dirname, "vector_store.json"),
    // MySQL Vector Database configuration
    MYSQL_HOST: process.env.MYSQL_HOST || "localhost",
    MYSQL_PORT: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE || "rag_vectors",
    MYSQL_TABLE_NAME: process.env.MYSQL_TABLE_NAME || "vectors",
    CHUNK_SIZE: 1000, // characters per chunk
    CHUNK_OVERLAP: 200,
    SUPPORTED_EXTENSIONS: [".txt", ".md", ".pdf"], // Only these types are indexed; others (e.g., images) are ignored
    INDEXING_CONCURRENCY:
        parseInt(process.env.RAG_INDEXING_CONCURRENCY, 10) || 5,
    SEARCH_TOP_K: parseInt(process.env.RAG_SEARCH_TOP_K, 10) || 10,
    SEARCH_MIN_SCORE: parseFloat(process.env.RAG_SEARCH_MIN_SCORE) || 0.5,
    // Always reindex from scratch on every restart
    ALWAYS_REINDEX_ON_STARTUP: true,
    // Email receiving configuration (webhook)
    EMAIL_WEBHOOK_PORT: parseInt(process.env.EMAIL_WEBHOOK_PORT, 10) || 3000,
    EMAIL_SUBJECT_TAG: process.env.EMAIL_SUBJECT_TAG || "[prompt]",
    // IMAP email receiving configuration
    IMAP_HOST: process.env.IMAP_HOST || "imap.gmail.com",
    IMAP_PORT: parseInt(process.env.IMAP_PORT, 10) || 993,
    IMAP_USER: process.env.IMAP_USER,
    IMAP_PASSWORD: process.env.IMAP_PASSWORD,
    IMAP_FOLDER: process.env.IMAP_FOLDER || "INBOX",
};

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

/**
 * Setup HTTP webhook server for receiving incoming emails
 */
function setupEmailWebhookServer(embeddingEngine, vectorDb) {
    const app = express();

    // Parse JSON and form data from email webhooks
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    /**
     * Webhook endpoint for receiving emails
     * Supports multiple email providers (Mailgun, SendGrid, AWS SES SNS)
     */
    app.post("/webhook/email", async (req, res) => {
        console.log("\n[Email Webhook] Received incoming email request");

        try {
            // Extract email data - format varies by provider
            let subject = "";
            let from = "";
            let to = "";
            let bodyText = "";
            let bodyHtml = "";

            // Mailgun format
            if (req.body.subject) {
                subject = req.body.subject;
                from = req.body.from || "";
                to = req.body.to || "";
                bodyText = req.body.body_text || req.body.body_plain || "";
                bodyHtml = req.body.body_html || req.body.body || "";
            }
            // SendGrid format
            else if (req.body.headers) {
                const headers = JSON.parse(
                    typeof req.body.headers === "string"
                        ? req.body.headers
                        : JSON.stringify(req.body.headers),
                );
                subject = headers.subject || "";
                from = headers.from || "";
                to = headers.to || "";
                bodyText = req.body.text || "";
                bodyHtml = req.body.html || "";
            }
            // AWS SES SNS format (forwarded via HTTP)
            else if (req.body.Message) {
                const message = JSON.parse(req.body.Message);
                subject = message.subject || "";
                from = message.source || "";
                to = message.destination?.[0] || "";
                bodyText = message.content?.text?.body || "";
                bodyHtml = message.content?.html?.body || "";
            }
            // Generic/unknown format - try to extract what we can
            else {
                subject = req.body.subject || req.query.subject || "No Subject";
                from = req.body.from || req.query.from || "Unknown";
                bodyText =
                    req.body.message ||
                    req.body.body ||
                    req.body.content ||
                    JSON.stringify(req.body);
            }

            console.log(`[Email Webhook] From: ${from}`);
            console.log(`[Email Webhook] To: ${to}`);
            console.log(`[Email Webhook] Subject: ${subject}`);

            // Check if subject contains the target tag
            const hasTargetTag = subject.includes(CONFIG.EMAIL_SUBJECT_TAG);

            if (!hasTargetTag) {
                console.log(
                    `[Email Webhook] Email does not contain tag [${CONFIG.EMAIL_SUBJECT_TAG}], skipping processing`,
                );
                return res.status(200).json({
                    success: true,
                    message:
                        "Email received but skipped (no matching subject tag)",
                    subject,
                });
            }

            console.log(
                `[Email Webhook] Email contains target tag [${CONFIG.EMAIL_SUBJECT_TAG}], processing...`,
            );

            // Combine text and HTML content (prefer HTML if available)
            const emailContent = bodyHtml || bodyText;

            if (!emailContent || emailContent.trim().length === 0) {
                console.warn("[Email Webhook] Email has no content, skipping");
                return res.status(200).json({
                    success: true,
                    message: "Email received but has no content",
                    subject,
                });
            }

            // Process the email content through RAG pipeline
            console.log("[Email Webhook] Processing email through RAG...");

            try {
                // Generate embedding for the email content
                const queryEmbedding = await embeddingEngine.generateEmbeddings(
                    [emailContent],
                );

                if (!queryEmbedding || queryEmbedding.length === 0) {
                    throw new Error("Failed to generate embedding for email");
                }

                // Search vector database for relevant documents
                const searchResults = await vectorDb.search(
                    queryEmbedding[0],
                    CONFIG.SEARCH_TOP_K,
                    CONFIG.SEARCH_MIN_SCORE,
                );

                console.log(
                    `[Email Webhook] Found ${searchResults.length} relevant document chunks`,
                );

                // Format results for response
                const formattedResults = searchResults.map((result) => ({
                    chunkId: result.chunkId,
                    documentPath: result.documentPath,
                    score: result.score,
                    content: result.content.substring(0, 500), // Truncate for preview
                }));

                console.log("[Email Webhook] Email processed successfully");

                return res.status(200).json({
                    success: true,
                    message: "Email processed successfully",
                    subject,
                    from,
                    to,
                    resultsCount: searchResults.length,
                    results: formattedResults,
                });
            } catch (error) {
                console.error(
                    "[Email Webhook] Error processing email through RAG:",
                    error.message,
                );

                return res.status(500).json({
                    success: false,
                    message: "Error processing email",
                    subject,
                    error: error.message,
                });
            }
        } catch (error) {
            console.error("[Email Webhook] Error handling webhook:", error);

            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    });

    /**
     * Health check endpoint
     */
    app.get("/health", (req, res) => {
        res.status(200).json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            emailWebhook: true,
        });
    });

    /**
     * Status endpoint showing webhook configuration
     */
    app.get("/status", (req, res) => {
        res.status(200).json({
            emailWebhook: {
                enabled: true,
                port: CONFIG.EMAIL_WEBHOOK_PORT,
                subjectTag: CONFIG.EMAIL_SUBJECT_TAG,
                webhookUrl: `http://localhost:${CONFIG.EMAIL_WEBHOOK_PORT}/webhook/email`,
            },
        });
    });

    // Start the HTTP server
    const httpServer = app.listen(CONFIG.EMAIL_WEBHOOK_PORT, () => {
        console.log(
            `\n[Email Webhook] Server started on port ${CONFIG.EMAIL_WEBHOOK_PORT}`,
        );
        console.log(
            `[Email Webhook] Webhook URL: http://localhost:${CONFIG.EMAIL_WEBHOOK_PORT}/webhook/email`,
        );
        console.log(
            `[Email Webhook] Health check: http://localhost:${CONFIG.EMAIL_WEBHOOK_PORT}/health`,
        );
        console.log(
            `[Email Webhook] Status: http://localhost:${CONFIG.EMAIL_WEBHOOK_PORT}/status`,
        );
        console.log(
            `[Email Webhook] Filtering emails with subject tag: ${CONFIG.EMAIL_SUBJECT_TAG}`,
        );
    });

    return httpServer;
}

async function main() {
    console.log("[RAG Server] Initializing RAG endpoint...");
    console.log(`[RAG Server] Documents folder: ${CONFIG.DOCUMENTS_FOLDER}`);
    console.log(`[RAG Server] Embedding API URL: ${CONFIG.EMBEDDING_API_URL}`);

    // Check if IMAP receiving is configured
    const imapConfigured = !!(CONFIG.IMAP_USER && CONFIG.IMAP_PASSWORD);
    if (imapConfigured) {
        console.log("[RAG Server] IMAP email receiving is configured");
    } else {
        console.log(
            "[RAG Server] IMAP email receiving not configured (set IMAP_USER and IMAP_PASSWORD in .env)",
        );
    }

    // Initialize components
    const embeddingEngine = new EmbeddingEngine({
        apiUrl: CONFIG.EMBEDDING_API_URL,
        model: CONFIG.EMBEDDING_MODEL,
        apiKey: CONFIG.EMBEDDING_API_KEY,
    });

    // Check if MySQL is configured, otherwise fall back to JSON-based storage
    let vectorDb;
    if (CONFIG.MYSQL_USER && CONFIG.MYSQL_PASSWORD) {
        console.log("[RAG Server] Using MySQL for vector storage...");
        vectorDb = new MySQLVectorDatabase({
            host: CONFIG.MYSQL_HOST,
            port: CONFIG.MYSQL_PORT,
            user: CONFIG.MYSQL_USER,
            password: CONFIG.MYSQL_PASSWORD,
            database: CONFIG.MYSQL_DATABASE,
            tableName: CONFIG.MYSQL_TABLE_NAME,
        });
    } else {
        console.log(
            "[RAG Server] MySQL not configured, falling back to JSON-based vector storage...",
        );
        const VectorDatabase = require("./vectorDatabase");
        vectorDb = new VectorDatabase({
            storagePath: CONFIG.VECTOR_STORE_PATH,
        });
    }

    console.log("[RAG Server] Loading vector database...");
    await vectorDb.load();
    const docCount = (await vectorDb.listDocuments()).length;
    console.log(
        `[RAG Server] Loaded ${docCount} existing documents from store`,
    );

    /**
     * Check if the embedding API is available before starting bulk indexing
     */
    async function checkEmbeddingAPI() {
        try {
            const response = await fetch(
                `${CONFIG.EMBEDDING_API_URL}/embeddings`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(CONFIG.EMBEDDING_API_KEY && {
                            Authorization: `Bearer ${CONFIG.EMBEDDING_API_KEY}`,
                        }),
                    },
                    body: JSON.stringify({
                        input: "test",
                        model: CONFIG.EMBEDDING_MODEL,
                    }),
                },
            );

            // Accept 200 OK as success
            if (response.ok) {
                console.log("[RAG Server] ✓ Embedding API is available");
                return true;
            }

            // LM Studio may return 401 even when working - check if we can reach it
            // If response has content, the API is reachable and working
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                console.log(
                    `[RAG Server] ✓ Embedding API is reachable (status: ${response.status})`,
                );
                return true;
            }

            // For other cases, log but still consider it available if we got a response
            console.log(
                `[RAG Server] ✓ Embedding API is reachable (status: ${response.status})`,
            );
            return true;
        } catch (error) {
            console.error(
                `[RAG Server] ✗ Cannot reach embedding API at ${CONFIG.EMBEDDING_API_URL}: ${error.message}`,
            );
            console.error(
                "[RAG Server] Please ensure LM Studio is running with an embedding model loaded",
            );
            return false;
        }
    }

    /**
     * Logic to index a single file
     */
    async function indexFile(filePath, isBulkIndex = false) {
        try {
            const extension = path.extname(filePath).toLowerCase();
            if (!CONFIG.SUPPORTED_EXTENSIONS.includes(extension)) {
                return;
            }

            let content;
            if (extension === ".pdf") {
                console.error(`[DEBUG] Processing PDF: ${filePath}`);
                const dataBuffer = await fs.readFile(filePath);
                const pdfData = await pdf(dataBuffer);
                content = pdfData.text;
                console.error(
                    `[DEBUG] Extracted ${content?.length || 0} characters from ${filePath}`,
                );
            } else {
                content = await fs.readFile(filePath, "utf8");
            }

            if (!content || content.trim().length === 0) {
                console.warn(
                    `[RAG Server] No text content extracted from ${filePath}. Skipping.`,
                );
                return;
            }

            const chunks = chunkText(content);
            console.log(
                `[RAG Server] Generated ${chunks.length} chunks for ${path.basename(filePath)}`,
            );

            // Add timeout protection for embedding calls
            const embeddingsPromise = embeddingEngine.embedBatch(chunks);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `Embedding API timeout after 30 seconds for ${path.basename(filePath)}`,
                            ),
                        ),
                    30000,
                );
            });

            const embeddings = await Promise.race([
                embeddingsPromise,
                timeoutPromise,
            ]);
            console.log(
                `[RAG Server] Generated ${embeddings.length} embeddings for ${path.basename(filePath)}`,
            );

            chunks.forEach((chunk, i) => {
                const chunkId = `${filePath}#${i}`;
                vectorDb.upsertDocument(chunkId, chunk, embeddings[i]);
            });

            if (!isBulkIndex) {
                await vectorDb.save();
            }
        } catch (error) {
            throw new Error(`Failed to index ${filePath}: ${error.message}`);
        }
    }

    /**
     * Logic to remove a file's chunks from the index
     */
    async function removeFile(filePath) {
        try {
            const indexedDocs = await vectorDb.listDocuments();
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

    // Always clear the vector store on startup to ensure fresh indexing
    console.log("[RAG Server] Clearing existing index for fresh reindexing...");
    const previousCount = Array.isArray(vectorDb.listDocuments())
        ? vectorDb.listDocuments().length
        : await vectorDb.listDocuments();
    vectorDb.clear();
    await vectorDb.save();
    console.log(`[RAG Server] Cleared ${previousCount} documents from index`);

    try {
        const existingFiles = await getAllFiles(CONFIG.DOCUMENTS_FOLDER);
        const supportedFiles = existingFiles.filter((file) =>
            CONFIG.SUPPORTED_EXTENSIONS.includes(
                path.extname(file).toLowerCase(),
            ),
        );

        console.log(
            `[RAG Server] Found ${supportedFiles.length} supported files to index`,
        );

        // Check if embedding API is available before bulk indexing
        const apiAvailable = await checkEmbeddingAPI();
        if (!apiAvailable) {
            console.error(
                "[RAG Server] Cannot proceed with bulk indexing - embedding API unavailable",
            );
            // Don't throw error - allow server to start anyway for manual indexing later
            console.warn(
                "[RAG Server] Continuing without bulk indexing (files can be indexed manually)",
            );
        }

        if (supportedFiles.length > 0 && apiAvailable) {
            let successCount = 0;
            let errorCount = 0;

            for (const file of supportedFiles) {
                try {
                    console.log(
                        `[RAG Server] Indexing: ${path.basename(file)}...`,
                    );
                    await indexFile(file, true); // isBulkIndex = true
                    successCount++;
                    console.log(
                        `[RAG Server] ✓ Indexed: ${path.basename(file)}`,
                    );
                } catch (fileError) {
                    errorCount++;
                    console.error(
                        `[RAG Server] ✗ Failed to index ${path.basename(file)}: ${fileError.message}`,
                    );
                    // Continue with next file instead of stopping
                }
            }

            // Save once after bulk indexing completes
            await vectorDb.save();
            const docCount = (await vectorDb.listDocuments()).length;
            console.log(
                `[RAG Server] Bulk indexing complete. Success: ${successCount}, Failed: ${errorCount}. Total documents in store: ${docCount}`,
            );
        } else if (supportedFiles.length > 0 && !apiAvailable) {
            console.log(
                "[RAG Server] Files found but skipped due to embedding API unavailability.",
            );
        } else {
            console.log("[RAG Server] No supported files found to index.");
        }
    } catch (error) {
        console.error(
            `[RAG Server] Error during initial bulk indexing: ${error.message}`,
        );
        console.error(error.stack);
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

    // Define Tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "search_documents",
                    description:
                        "Search the local document index for relevant information based on a query.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query",
                            },
                            topK: {
                                type: "number",
                                description: "Number of results to return",
                                default: 5,
                            },
                        },
                        required: ["query"],
                    },
                },
                {
                    name: "reindex_documents",
                    description:
                        "Force a complete reindex of all documents in the documents folder. This will clear the existing index and re-index all files from scratch.",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "index_status",
                    description:
                        "Get the current status and list of indexed documents.",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "list_indexed_files",
                    description:
                        "List only the names of all currently indexed files.",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "send_email",
                    description:
                        "Send an email using AWS SES. ALL emails MUST be sent as styled HTML documents for professional formatting. Requires subject and body parameters. The 'to' parameter is optional - if not provided, the email will be sent to the default recipient configured in .env (DEFAULT_EMAIL_RECIPIENT). Always generate htmlBody with proper HTML structure including inline CSS styles.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            to: {
                                type: "string",
                                description:
                                    "Recipient email address (e.g., user@example.com). Optional - uses DEFAULT_EMAIL_RECIPIENT from .env if not provided.",
                            },
                            subject: {
                                type: "string",
                                description: "Email subject line",
                            },
                            body: {
                                type: "string",
                                description:
                                    "Plain text fallback content (will be auto-generated if not provided, but htmlBody is required for styled emails)",
                            },
                            htmlBody: {
                                type: "string",
                                description:
                                    'REQUIRED: Styled HTML content with inline CSS. Must include proper HTML structure (<html>, <head>, <body>) with inline styles for email client compatibility. Example: \'<html><head><style>body{font-family:Arial,sans-serif;}</style></head><body style="margin:0;padding:20px;font-family:Arial,sans-serif;"><h1 style="color:#333;">Subject</h1><p style="line-height:1.6;">Content here...</p></body></html>\'',
                            },
                            from: {
                                type: "string",
                                description:
                                    "Sender email address (defaults to noreply@bookservo.com)",
                            },
                        },
                        required: ["subject", "body", "htmlBody"],
                    },
                },

                {
                    name: "check_email_status",
                    description:
                        "Check the configuration status of the AWS SES email service.",
                    inputSchema: { type: "object", properties: {} },
                },
            ],
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (name === "search_documents") {
            const query = args.query;
            const topK = args.topK || CONFIG.SEARCH_TOP_K;

            try {
                const queryEmbedding = await embeddingEngine.embed(query);
                const results = await vectorDb.search(queryEmbedding, topK);

                // Filter results by the minimum match score requirement
                const filteredResults = results.filter(
                    (res) => res.score >= CONFIG.SEARCH_MIN_SCORE,
                );

                if (filteredResults.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No documents found meeting the minimum similarity score of ${CONFIG.SEARCH_MIN_SCORE}.`,
                            },
                        ],
                    };
                }

                const formattedResults = filteredResults
                    .map(
                        (res, i) =>
                            `${i + 1}. [Score: ${res.score.toFixed(4)}] Source: ${res.docId}\nContent: ${res.content}`,
                    )
                    .join("\n\n");

                return {
                    content: [
                        {
                            type: "text",
                            text: `Top ${filteredResults.length} relevant results (Threshold: ${CONFIG.SEARCH_MIN_SCORE}):\n\n${formattedResults}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Search error: ${error.message}`,
                        },
                    ],
                };
            }
        }

        if (name === "index_status") {
            const docs = await vectorDb.listDocuments();
            // Extract unique file paths from chunk IDs
            const files = [...new Set(docs.map((id) => id.split("#")[0]))];
            return {
                content: [
                    {
                        type: "text",
                        text: `Indexing active. Total chunks: ${docs.length}. Unique files indexed: ${files.length}.\nFiles:\n${files.join("\n")}`,
                    },
                ],
            };
        }

        if (name === "list_indexed_files") {
            const docs = await vectorDb.listDocuments();
            // Extract unique file paths, then get just the filename using path.basename
            const files = [
                ...new Set(docs.map((id) => path.basename(id.split("#")[0]))),
            ];
            return {
                content: [
                    {
                        type: "text",
                        text: `Indexed Files:\n${files.join("\n")}`,
                    },
                ],
            };
        }

        if (name === "reindex_documents") {
            try {
                console.log(
                    "[RAG Server] Manual reindex requested via MCP tool...",
                );

                // Clear existing index
                const previousCount = (await vectorDb.listDocuments()).length;
                vectorDb.clear();
                await vectorDb.save();
                console.log(
                    `[RAG Server] Cleared ${previousCount} documents from index`,
                );

                // Get all files and reindex
                const existingFiles = await getAllFiles(
                    CONFIG.DOCUMENTS_FOLDER,
                );
                const supportedFiles = existingFiles.filter((file) =>
                    CONFIG.SUPPORTED_EXTENSIONS.includes(
                        path.extname(file).toLowerCase(),
                    ),
                );

                if (supportedFiles.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Reindex complete. No supported files found in ${CONFIG.DOCUMENTS_FOLDER}.`,
                            },
                        ],
                    };
                }

                // Check if embedding API is available
                const apiAvailable = await checkEmbeddingAPI();
                if (!apiAvailable) {
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Reindex failed: Embedding API not available. Please ensure LM Studio is running.`,
                            },
                        ],
                    };
                }

                let successCount = 0;
                let errorCount = 0;
                const failedFiles = [];

                for (const file of supportedFiles) {
                    try {
                        console.log(
                            `[RAG Server] Indexing: ${path.basename(file)}...`,
                        );
                        await indexFile(file, true);
                        successCount++;
                        console.log(
                            `[RAG Server] ✓ Indexed: ${path.basename(file)}`,
                        );
                    } catch (fileError) {
                        errorCount++;
                        failedFiles.push(
                            `${path.basename(file)}: ${fileError.message}`,
                        );
                        console.error(
                            `[RAG Server] ✗ Failed to index ${path.basename(file)}: ${fileError.message}`,
                        );
                    }
                }

                // Save once after reindex completes
                await vectorDb.save();

                const finalDocCount = (await vectorDb.listDocuments()).length;

                const result = {
                    successCount,
                    errorCount,
                    totalFiles: supportedFiles.length,
                    newDocumentCount: finalDocCount,
                };

                if (errorCount > 0) {
                    result.failedFiles = failedFiles;
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `Reindex complete!\nTotal files found: ${result.totalFiles}\nSuccessfully indexed: ${result.successCount}\nFailed: ${result.errorCount}\nTotal chunks in index: ${result.newDocumentCount}${errorCount > 0 ? `\n\nFailed files:\n${failedFiles.join("\n")}` : ""}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Reindex error: ${error.message}`,
                        },
                    ],
                };
            }
        }

        if (name === "send_email") {
            const { to, subject, body, htmlBody, from } = args;

            // Validate required parameters (to is optional - will use default if not provided)
            if (!subject || !body || !htmlBody) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Error: Missing required parameters. 'subject', 'body', and 'htmlBody' are all required. ALL emails must be sent as styled HTML documents.",
                        },
                    ],
                };
            }

            // Validate email format if 'to' is provided
            if (to && !EmailService.isValidEmail(to)) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error: Invalid email address format: ${to}`,
                        },
                    ],
                };
            }

            try {
                const result = await EmailService.sendEmail({
                    to,
                    subject,
                    body,
                    htmlBody, // Required for styled HTML emails
                    from, // Will use default FROM_EMAIL if undefined
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Email sent successfully!\n\nMessage ID: ${result.messageId}\nTo: ${result.to.join(", ")}\nFrom: ${result.from}\nSubject: ${result.subject}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error sending email: ${error.message}`,
                        },
                    ],
                };
            }
        }

        if (name === "check_email_status") {
            const status = EmailService.getServiceStatus();

            const statusText =
                `📬 AWS SES Email Service Status:\n\n` +
                `Configured: ${status.configured ? "✅ Yes" : "❌ No"}\n` +
                `Region: ${status.region}\n` +
                `Default From: ${status.fromEmail}\n` +
                `Default Recipient: ${status.defaultRecipient}\n\n` +
                (status.configured
                    ? "Email tools are ready to use."
                    : "Please configure AWS credentials in .env file:\n- AWS_ACCESS_KEY_ID\n- AWS_SECRET_ACCESS_KEY\n- AWS_REGION");

            return {
                content: [
                    {
                        type: "text",
                        text: statusText,
                    },
                ],
            };
        }

        throw new Error(`Tool not found: ${name}`);
    });

    console.log("[RAG Server] ✓ RAG endpoint initialized successfully");

    // Start Email Webhook Server for receiving incoming emails via HTTP
    const emailServer = setupEmailWebhookServer(embeddingEngine, vectorDb);

    // Start IMAP Email Receiving if configured (Gmail integration)
    if (imapConfigured) {
        try {
            const { createIMAPConnection, startIMAPIdle } = EmailService;

            const imapClient = await createIMAPConnection({
                HOST: CONFIG.IMAP_HOST,
                PORT: CONFIG.IMAP_PORT,
                USER: CONFIG.IMAP_USER,
                PASSWORD: CONFIG.IMAP_PASSWORD,
                FOLDER: CONFIG.IMAP_FOLDER,
            });

            // Callback when new email is received via IMAP
            const handleNewEmail = async (emailData) => {
                console.log(
                    "\n[IMAP Service] Processing email through RAG pipeline...",
                );

                try {
                    // Generate embedding for the email content
                    const queryEmbedding =
                        await embeddingEngine.generateEmbeddings([
                            emailData.bodyText,
                        ]);

                    if (!queryEmbedding || queryEmbedding.length === 0) {
                        throw new Error(
                            "Failed to generate embedding for email",
                        );
                    }

                    // Search vector database for relevant documents
                    const searchResults = await vectorDb.search(
                        queryEmbedding[0],
                        CONFIG.SEARCH_TOP_K,
                        CONFIG.SEARCH_MIN_SCORE,
                    );

                    console.log(
                        `[IMAP Service] Found ${searchResults.length} relevant document chunks`,
                    );

                    // Format results
                    const formattedResults = searchResults.map((result) => ({
                        chunkId: result.chunkId,
                        documentPath: result.documentPath,
                        score: result.score,
                        content: result.content.substring(0, 500),
                    }));

                    console.log(
                        "[IMAP Service] Email processed successfully via IMAP",
                    );
                } catch (error) {
                    console.error(
                        "[IMAP Service] Error processing email through RAG:",
                        error.message,
                    );
                }
            };

            // Start IDLE monitoring for real-time notifications
            startIMAPIdle(imapClient, handleNewEmail, CONFIG.EMAIL_SUBJECT_TAG);
        } catch (error) {
            console.error(
                "[RAG Server] Failed to initialize IMAP receiving:",
                error.message,
            );
            console.log("[RAG Server] Continuing without IMAP email receiving");
        }
    }

    // Start MCP Server (stdio transport)
    console.log("[RAG Server] Starting MCP server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("[RAG Server] ✓ MCP server connected and ready");
}

// Handle graceful shutdown for IMAP connections
process.on("SIGINT", () => {
    console.log("\n[RAG Server] Shutting down...");
    const { stopIMAPConnection } = EmailService;
    stopIMAPConnection();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[RAG Server] Shutting down...");
    const { stopIMAPConnection } = EmailService;
    stopIMAPConnection();
    process.exit(0);
});

main().catch((error) => {
    console.error(`[RAG Server] Fatal error during startup: ${error.message}`);
    process.exit(1);
});
