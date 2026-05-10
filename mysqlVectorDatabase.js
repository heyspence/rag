const mysql = require('mysql2/promise');

/**
 * MySQLVectorDatabase handles the storage of document embeddings in a MySQL database
 * and performs similarity searches to retrieve relevant content.
 */
class MySQLVectorDatabase {
  /**
   * @param {Object} config
   * @param {string} config.host - MySQL host
   * @param {number} config.port - MySQL port (default: 3306)
   * @param {string} config.user - MySQL username
   * @param {string} config.password - MySQL password
   * @param {string} config.database - Database name
   * @param {string} config.tableName - Table name for storing vectors (default: 'vectors')
   */
  constructor(config = {}) {
    this.host = config.host || 'localhost';
    this.port = config.port || 3306;
    this.user = config.user;
    this.password = config.password;
    this.database = config.database;
    this.tableName = config.tableName || 'vectors';

    if (!this.user || !this.password || !this.database) {
      throw new Error(
        '[MySQLVectorDatabase] Missing required MySQL configuration: user, password, and database are required'
      );
    }

    this.pool = mysql.createPool({
      host: this.host,
      port: this.port,
      user: this.user,
      password: this.password,
      database: this.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    this.initialized = false;
  }

  /**
   * Initializes the database connection and creates tables if they don't exist.
   */
  async load() {
    try {
      await this.initializeTables();
      console.log(
        `[MySQLVectorDatabase] Connected to MySQL at ${this.host}:${this.port}/${this.database}`
      );
      this.initialized = true;
    } catch (error) {
      console.error(
        `[MySQLVectorDatabase] Error initializing database: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Creates the necessary tables if they don't exist.
   */
  async initializeTables() {
    const connection = await this.pool.getConnection();
    try {
      // Create vectors table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS \`${this.tableName}\` (
          ` + '`docId` VARCHAR(512) PRIMARY KEY,' + `
          ` + '`content` TEXT NOT NULL,' + `
          ` + '`embedding` JSON NOT NULL,' + `
          ` + '`updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' + `
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Create index on docId for faster lookups (already primary key)
      console.log(`[MySQLVectorDatabase] Tables initialized successfully`);
    } finally {
      connection.release();
    }
  }

  /**
   * Persists the current state to MySQL (called after each upsert/delete).
   */
  async save() {
    // Data is persisted immediately in this implementation
    return Promise.resolve();
  }

  /**
   * Adds or updates a document in the vector store.
   * @param {string} docId - Unique identifier for the document (e.g., file path).
   * @param {string} content - The text content of the document chunk.
   * @param {number[]} embedding - The numerical vector representation.
   */
  async upsertDocument(docId, content, embedding) {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.query(
        `INSERT INTO \`${this.tableName}\`
         (\`docId\`, \`content\`, \`embedding\`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
         \`content\` = VALUES(\`content\`),
         \`embedding\` = VALUES(\`embedding\`);`,
        [docId, content, JSON.stringify(embedding)]
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Removes a document from the vector store.
   * @param {string} docId - Unique identifier for the document to remove.
   */
  async deleteDocument(docId) {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.query(
        `DELETE FROM \`${this.tableName}\` WHERE \`docId\` = ?;`,
        [docId]
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Clears all documents from the vector store.
   */
  async clear() {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.query(`DELETE FROM \`${this.tableName}\`;`);
    } finally {
      connection.release();
    }
  }

  /**
   * Searches for the most similar documents given a query embedding.
   * Uses MySQL's JSON functions to calculate cosine similarity.
   * @param {number[]} queryEmbedding - The vector representation of the search query.
   * @param {number} topK - Number of results to return.
   * @returns {Promise<Array<{docId: string, content: string, score: number}>>}
   */
  async search(queryEmbedding, topK = 5) {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      // Calculate cosine similarity using MySQL JSON functions
      // cosine_similarity = dot_product / (norm_a * norm_b)
      // We compute this in SQL by extracting embedding values

      const queryEmbeddingStr = JSON.stringify(queryEmbedding);

      // Build the SQL query to calculate cosine similarity
      // This uses JSON_EXTRACT to get individual vector components
      let dotProductExpr = '';
      let normAExpr = '0';
      let normBExpr = '0';

      for (let i = 0; i < queryEmbedding.length; i++) {
        const jsonPath = `$[${i}]`;
        if (i > 0) dotProductExpr += ' + ';
        dotProductExpr += `JSON_EXTRACT(embedding, '${jsonPath}') * ${queryEmbedding[i]}`;
      }

      // Calculate norm of stored embeddings and query embedding
      for (let i = 0; i < queryEmbedding.length; i++) {
        const jsonPath = `$[${i}]`;
        if (i > 0) {
          normBExpr += ' + ';
          normAExpr += ' + ';
        }
        normBExpr += `POW(JSON_EXTRACT(embedding, '${jsonPath}'), 2)`;
        normAExpr += `POW(${queryEmbedding[i]}, 2)`;
      }

      const sql = `
        SELECT
          docId,
          content,
          (${dotProductExpr}) / (SQRT(${normBExpr}) * SQRT(${normAExpr})) as similarity
        FROM \`${this.tableName}\`
        WHERE SQRT(${normBExpr}) > 0
        ORDER BY similarity DESC
        LIMIT ?;
      `;

      const [rows] = await connection.query(sql, [topK]);

      return rows.map((row) => ({
        docId: row.docId,
        content: row.content,
        score: parseFloat(row.similarity),
      }));
    } finally {
      connection.release();
    }
  }

  /**
   * Alternative search method using application-side similarity calculation.
   * This is more accurate but requires fetching all embeddings.
   * @param {number[]} queryEmbedding - The vector representation of the search query.
   * @param {number} topK - Number of results to return.
   * @returns {Promise<Array<{docId: string, content: string, score: number}>>}
   */
  async searchWithAppSimilarity(queryEmbedding, topK = 5) {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT docId, content, embedding FROM \`${this.tableName}\`;`
      );

      const results = [];
      for (const row of rows) {
        const embedding = JSON.parse(row.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        results.push({
          docId: row.docId,
          content: row.content,
          score: similarity,
        });
      }

      // Sort by score descending (highest similarity first)
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, topK);
    } finally {
      connection.release();
    }
  }

  /**
   * Calculates the cosine similarity between two vectors.
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} Similarity score between -1 and 1.
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vector dimensions must match for cosine similarity');
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
   * @returns {Promise<string[]>}
   */
  async listDocuments() {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT docId FROM \`${this.tableName}\`;`
      );
      return rows.map((row) => row.docId);
    } finally {
      connection.release();
    }
  }

  /**
   * Gets a document by its ID.
   * @param {string} docId - The document ID to retrieve.
   * @returns {Promise<{docId: string, content: string, embedding: number[]} | null>}
   */
  async getDocument(docId) {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT docId, content, embedding FROM \`${this.tableName}\` WHERE \`docId\` = ?;`,
        [docId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        docId: row.docId,
        content: row.content,
        embedding: JSON.parse(row.embedding),
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Gets the total count of documents in the database.
   * @returns {Promise<number>}
   */
  async getDocumentCount() {
    if (!this.initialized) {
      await this.load();
    }

    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM \`${this.tableName}\`;`
      );
      return rows[0].count;
    } finally {
      connection.release();
    }
  }

  /**
   * Closes the database connection pool.
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('[MySQLVectorDatabase] Connection pool closed');
    }
  }
}

module.exports = MySQLVectorDatabase;
