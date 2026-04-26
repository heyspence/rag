const fs = require("fs-extra");
const path = require("path");

/**
 * VectorDatabase handles the storage of document embeddings and performs
 * similarity searches to retrieve relevant content.
 * For this implementation, it uses a simple local JSON store for persistence.
 */
class VectorDatabase {
  /**
   * @param {Object} config
   * @param {string} config.storagePath - Path to the file where vectors are stored (e.g., 'vectors.json')
   */
  constructor(config = {}) {
    this.storagePath =
      config.storagePath || path.join(process.cwd(), "vector_store.json");
    this.data = {
      documents: {}, // Maps docId -> { content, embedding }
    };
  }

  /**
   * Loads the vector database from disk.
   */
  async load() {
    try {
      if (await fs.pathExists(this.storagePath)) {
        const json = await fs.readJson(this.storagePath);
        this.data = json;
        console.log(
          `[VectorDatabase] Loaded database from ${this.storagePath}`,
        );
      } else {
        console.log(
          "[VectorDatabase] No existing database found, starting fresh.",
        );
      }
    } catch (error) {
      console.error(
        `[VectorDatabase] Error loading database: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Persists the current state of the vector database to disk.
   */
  async save() {
    try {
      await fs.writeJson(this.storagePath, this.data, { spaces: 2 });
    } catch (error) {
      console.error(`[VectorDatabase] Error saving database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Adds or updates a document in the vector store.
   * @param {string} docId - Unique identifier for the document (e.g., file path).
   * @param {string} content - The text content of the document chunk.
   * @param {number[]} embedding - The numerical vector representation.
   */
  async upsertDocument(docId, content, embedding) {
    this.data.documents[docId] = {
      content,
      embedding,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Removes a document from the vector store.
   * @param {string} docId - Unique identifier for the document to remove.
   */
  async deleteDocument(docId) {
    if (this.data.documents[docId]) {
      delete this.data.documents[docId];
    }
  }

  /**
   * Clears all documents from the vector store.
   */
  clear() {
    this.data.documents = {};
  }

  /**
   * Searches for the most similar documents given a query embedding.
   * @param {number[]} queryEmbedding - The vector representation of the search query.
   * @param {number} topK - Number of results to return.
   * @returns {Promise<Array<{docId: string, content: string, score: number}>>}
   */
  async search(queryEmbedding, topK = 5) {
    const results = [];

    for (const [docId, doc] of Object.entries(this.data.documents)) {
      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({
        docId,
        content: doc.content,
        score: similarity,
      });
    }

    // Sort by score descending (highest similarity first)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Calculates the cosine similarity between two vectors.
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} Similarity score between -1 and 1.
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error("Vector dimensions must match for cosine similarity");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Returns all document IDs currently indexed.
   * @returns {string[]}
   */
  listDocuments() {
    return Object.keys(this.data.documents);
  }
}

module.exports = VectorDatabase;
