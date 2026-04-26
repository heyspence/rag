const EmbeddingEngine = require('./embeddingEngine');
const VectorDatabase = require('./vectorDatabase');
const path = require('path');

/**
 * Smoke test script to verify that the Embedding Engine can talk to LM Studio
 * and that the Vector Database can store and retrieve vectors correctly.
 */

async function runTest() {
  console.log('--- Starting RAG Smoke Test ---');

  const CONFIG = {
    EMBEDDING_API_URL: 'http://localhost:1234/v1',
    EMBEDDING_MODEL: 'text-embedding-nomic-embed-text-v1.5',
    EMBEDDING_API_KEY: 'sk-lm-TV0lwnDg:uhnVoUGhkurpnW57bEnJ',
    VECTOR_STORE_PATH: path.join(process.cwd(), 'test_vector_store.json'),
  };

  try {
    // 1. Initialize Components
    console.log('Initializing components...');
    const embeddingEngine = new EmbeddingEngine({
      apiUrl: CONFIG.EMBEDDING_API_URL,
      model: CONFIG.EMBEDDING_MODEL,
      apiKey: CONFIG.EMBEDDING_API_KEY,
    });

    const vectorDb = new VectorDatabase({
      storagePath: CONFIG.VECTOR_STORE_PATH,
    });

    await vectorDb.load();

    // 2. Test Embedding Generation
    console.log('\nTesting embedding generation...');
    const testText = 'The secret code for Project Phoenix is ALPHA-99.';
    const embedding = await embeddingEngine.embed(testText);
    console.log(`✅ Successfully generated embedding. Vector length: ${embedding.length}`);

    // 3. Test Storage (Upsert)
    console.log('\nTesting vector storage...');
    const docId = 'test-doc-1';
    await vectorDb.upsertDocument(docId, testText, embedding);
    console.log(`✅ Successfully stored document: ${docId}`);

    // 4. Test Retrieval (Search)
    console.log('\nTesting retrieval...');
    const query = 'What is the code for Project Phoenix?';
    console.log(`Query: "${query}"`);

    const queryEmbedding = await embeddingEngine.embed(query);
    const results = await vectorDb.search(queryEmbedding, 1);

    if (results.length > 0 && results[0].docId === docId) {
      console.log(`✅ Retrieval successful!`);
      console.log(`   Top Result Score: ${results[0].score.toFixed(4)}`);
      console.log(`   Content: ${results[0].content}`);
    } else {
      throw new Error('Retrieval failed: The correct document was not found or score was too low.');
    }

    console.log('\n--- Smoke Test PASSED ---');
  } catch (error) {
    console.error('\n❌ Smoke Test FAILED');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

runTest();
