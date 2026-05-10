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

const EmbeddingEngine = require("./embeddingEngine");
const VectorDatabase = require("./vectorDatabase");
const EmailService = require("./emailService");

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
    CHUNK_SIZE: 1000, // characters per chunk
    CHUNK_OVERLAP: 200,
    SUPPORTED_EXTENSIONS: [".txt", ".md", ".pdf"], // Only these types are indexed; others (e.g., images) are ignored
    INDEXING_CONCURRENCY:
        parseInt(process.env.RAG_INDEXING_CONCURRENCY, 10) || 5,
    SEARCH_TOP_K: parseInt(process.env.RAG_SEARCH_TOP_K, 10) || 10,
    SEARCH_MIN_SCORE: parseFloat(process.env.RAG_SEARCH_MIN_SCORE) || 0.5,
    // Always reindex from scratch on every restart
    ALWAYS_REINDEX_ON_STARTUP: true,
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

async function main() {
    console.log("[RAG Server] Initializing RAG endpoint...");
    console.log(`[RAG Server] Documents folder: ${CONFIG.DOCUMENTS_FOLDER}`);
    console.log(`[RAG Server] Embedding API URL: ${CONFIG.EMBEDDING_API_URL}`);

    // Initialize components
    const embeddingEngine = new EmbeddingEngine({
        apiUrl: CONFIG.EMBEDDING_API_URL,
        model: CONFIG.EMBEDDING_MODEL,
        apiKey: CONFIG.EMBEDDING_API_KEY,
    });

    const vectorDb = new VectorDatabase({
        storagePath: CONFIG.VECTOR_STORE_PATH,
    });

    console.log("[RAG Server] Loading vector database...");
    await vectorDb.load();
    console.log(
        `[RAG Server] Loaded ${vectorDb.listDocuments().length} existing documents from store`,
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

    // Always clear the vector store on startup to ensure fresh indexing
    console.log("[RAG Server] Clearing existing index for fresh reindexing...");
    const previousCount = vectorDb.listDocuments().length;
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
            console.log(
                `[RAG Server] Bulk indexing complete. Success: ${successCount}, Failed: ${errorCount}. Total documents in store: ${vectorDb.listDocuments().length}`,
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
            const docs = vectorDb.listDocuments();
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
            const docs = vectorDb.listDocuments();
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
                const previousCount = vectorDb.listDocuments().length;
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

                const result = {
                    successCount,
                    errorCount,
                    totalFiles: supportedFiles.length,
                    newDocumentCount: vectorDb.listDocuments().length,
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

    // Start Server
    console.log("[RAG Server] Starting MCP server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("[RAG Server] ✓ MCP server connected and ready");
}

main().catch((error) => {
    console.error(`[RAG Server] Fatal error during startup: ${error.message}`);
    process.exit(1);
});
