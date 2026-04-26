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
    process.env.VECTOR_STORE_PATH || path.join(__dirname, "vector_store.json"),
  CHUNK_SIZE: 1000, // characters per chunk
  CHUNK_OVERLAP: 200,
  SUPPORTED_EXTENSIONS: [".txt", ".md", ".pdf"], // Only these types are indexed; others (e.g., images) are ignored
  INDEXING_CONCURRENCY: parseInt(process.env.RAG_INDEXING_CONCURRENCY, 10) || 5,
  SEARCH_TOP_K: parseInt(process.env.RAG_SEARCH_TOP_K, 10) || 10,
  SEARCH_MIN_SCORE: parseFloat(process.env.RAG_SEARCH_MIN_SCORE) || 0.5,
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

  /**
   * Logic to index a single file
   */
  async function indexFile(filePath, isBulkIndex = false) {
    try {
      const extension = path.extname(filePath).toLowerCase();
      if (!CONFIG.SUPPORTED_EXTENSIONS.includes(extension)) return;

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
        console.error(
          `[WARN] No text content extracted from ${filePath}. Skipping.`,
        );
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

  /**
   * Performs the initial bulk indexing of all documents in the folder.
   * This is called as a background task to avoid blocking server startup.
   */
  async function performBulkIndex() {
    try {
      vectorDb.clear();
      const allFiles = await getAllFiles(CONFIG.DOCUMENTS_FOLDER);
      if (allFiles.length === 0) return;

      const queue = [...allFiles];
      console.error(
        `[RAG Server] Starting background bulk index of ${allFiles.length} files with concurrency ${CONFIG.INDEXING_CONCURRENCY}...`,
      );

      const workers = Array(CONFIG.INDEXING_CONCURRENCY)
        .fill(null)
        .map(async (_, workerId) => {
          while (queue.length > 0) {
            const file = queue.shift();
            if (file) {
              await indexFile(file, true);
            }
          }
        });

      await Promise.all(workers);
      await vectorDb.save();
      console.error(`[RAG Server] Background bulk indexing complete.`);
    } catch (error) {
      console.error(
        `[RAG Server] Error during bulk indexing: ${error.message}`,
      );
    }
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
              query: { type: "string", description: "The search query" },
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
          name: "index_status",
          description: "Get the current status and list of indexed documents.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_indexed_files",
          description: "List only the names of all currently indexed files.",
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
          content: [{ type: "text", text: `Search error: ${error.message}` }],
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

    throw new Error(`Tool not found: ${name}`);
  });

  // Start Server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Start bulk indexing in the background AFTER connecting to prevent LM Studio timeouts
  performBulkIndex();
}

main().catch((error) => {
  console.error(`[RAG Server] Fatal error during startup: ${error.message}`);
  process.exit(1);
});
