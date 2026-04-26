const fetch = require("node-fetch");

/**
 * EmbeddingEngine handles the conversion of text into numerical vectors
 * using an external embedding model API (e.g., LM Studio).
 */
class EmbeddingEngine {
  /**
   * @param {Object} config
   * @param {string} config.apiUrl - The base URL of the embedding API (default: http://localhost:1234/v1)
   * @param {string} config.model - The model to use for embeddings
   * @param {string} config.apiKey - The API key for authentication
   */
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || "http://localhost:1234/v1";
    this.model = config.model || "text-embedding-nomic-embed-text-v1.5";
    this.apiKey = config.apiKey || "";
    this.endpoint = `${this.apiUrl}/embeddings`;
  }

  /**
   * Generates an embedding vector for the given text.
   * @param {string} text - The text to embed.
   * @returns {Promise<number[]>} - The resulting embedding vector.
   * @throws {Error} - If the API request fails or returns an error.
   */
  async embed(text) {
    if (!text || typeof text !== "string") {
      throw new Error("Invalid input: Text must be a non-empty string.");
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          input: text,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Embedding API responded with ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();

      // LM Studio / OpenAI compatible format: data.data[0].embedding
      if (data && data.data && data.data.length > 0 && data.data[0].embedding) {
        return data.data[0].embedding;
      } else {
        throw new Error("Unexpected response format from Embedding API");
      }
    } catch (error) {
      console.error(
        `[EmbeddingEngine] Error generating embedding: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Generates embeddings for multiple pieces of text.
   * @param {string[]} texts - Array of strings to embed.
   * @returns {Promise<number[][]>} - Array of resulting embedding vectors.
   */
  async embedBatch(texts) {
    if (!Array.isArray(texts)) {
      throw new Error("Invalid input: Texts must be an array of strings.");
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          input: texts,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Embedding API responded with ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();

      if (data && data.data && Array.isArray(data.data)) {
        return data.data.map((item) => item.embedding);
      } else {
        throw new Error(
          "Unexpected response format from Embedding API batch request",
        );
      }
    } catch (error) {
      console.error(
        `[EmbeddingEngine] Error generating batch embeddings: ${error.message}`,
      );
      throw error;
    }
  }
}

module.exports = EmbeddingEngine;
