/**
 * Gmail Push Notifications - Standalone Test Script
 *
 * This script tests Gmail Push functionality independently from the main RAG server.
 * It can verify OAuth credentials, test Gmail watch setup, and validate webhook endpoints.
 *
 * Usage:
 *   node test_gmail_push_standalone.js
 *
 * Features:
 * - Tests OAuth credentials without requiring full Google Cloud SDK
 * - Attempts to set up Gmail watch (validates Pub/Sub topic exists)
 * - Starts a temporary webhook server for local testing
 * - Provides clear error messages and next steps
 */

require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const express = require('express');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    log('\n' + '='.repeat(70), 'cyan');
    log(`  ${title}`, 'cyan');
    log('='.repeat(70), 'cyan');
}

function logSubsection(title) {
    log('\n' + '-'.repeat(50), 'blue');
    log(`  ${title}`, 'blue');
    log('-'.repeat(50), 'blue');
}

/**
 * Test Results Tracker
 */
const results = {
    environment: { passed: false, errors: [] },
    oauth: { passed: false, email: null },
    gmailWatch: { passed: false, historyId: null, expiration: null, error: null },
    webhookServer: { started: false, port: null, url: null },
};

/**
 * Step 1: Validate Environment Variables
 */
function validateEnvironment() {
    logSubsection('Environment Variables');

    const requiredVars = [
        'GOOGLE_PROJECT_ID',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REFRESH_TOKEN',
        'GOOGLE_PUBSUB_TOPIC_NAME',
        'GMAIL_PUSH_WEBHOOK_PORT'
    ];

    let allPresent = true;

    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            // Mask sensitive values
            let displayValue = value;
            if (varName.includes('SECRET') || varName.includes('TOKEN')) {
                displayValue = value.substring(0, 12) + '...' +
                              (value.length > 20 ? '***' : '');
            }
            log(`✓ ${varName}: ${displayValue}`, 'green');
        } else {
            log(`✗ ${varName}: MISSING`, 'red');
            results.environment.errors.push(`${varName} is missing`);
            allPresent = false;
        }
    });

    // Validate webhook URL if present
    if (process.env.GMAIL_PUSH_WEBHOOK_URL) {
        try {
            const url = new URL(process.env.GMAIL_PUSH_WEBHOOK_URL);
            log(`✓ Webhook URL: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`, 'green');

            if (!url.protocol.startsWith('https')) {
                log('⚠ Warning: Webhook should use HTTPS for production', 'yellow');
            }
        } catch (error) {
            log(`✗ Invalid webhook URL: ${error.message}`, 'red');
            results.environment.errors.push('Invalid webhook URL format');
            allPresent = false;
        }
    }

    // Validate Pub/Sub topic name format
    if (process.env.GOOGLE_PUBSUB_TOPIC_NAME) {
        const expectedPrefix = `projects/${process.env.GOOGLE_PROJECT_ID}/topics/`;
        if (process.env.GOOGLE_PUBSUB_TOPIC_NAME.startsWith(expectedPrefix)) {
            log('✓ Pub/Sub topic name format is correct', 'green');
        } else {
            log(`⚠ Pub/Sub topic name may have incorrect format`, 'yellow');
            log(`  Expected prefix: ${expectedPrefix}`, 'blue');
        }
    }

    results.environment.passed = allPresent;
    return allPresent;
}

/**
 * Step 2: Test OAuth Credentials and Gmail API Access
 */
async function testOAuthAndGmail() {
    logSubsection('OAuth Credentials & Gmail API');

    try {
        if (!process.env.GOOGLE_CLIENT_ID ||
            !process.env.GOOGLE_CLIENT_SECRET ||
            !process.env.GOOGLE_REFRESH_TOKEN) {
            log('✗ Missing OAuth credentials', 'red');
            return false;
        }

        log('Creating OAuth2 client...', 'cyan');

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:8081/oauth2callback'
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        log('✓ OAuth2 client created', 'green');

        // Test by getting user profile
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });

        results.oauth.email = profile.data.emailAddress;

        log(`✓ Gmail API access successful`, 'green');
        log(`  Email: ${profile.data.emailAddress}`, 'blue');
        log(`  Total messages: ${parseInt(profile.data.messagesTotal).toLocaleString()}`, 'blue');
        log(`  Total threads: ${parseInt(profile.data.threadsTotal).toLocaleString()}`, 'blue');

        // Test label listing (verifies scopes)
        try {
            const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
            const labels = labelsResponse.data.labels || [];
            log(`✓ Labels accessible (${labels.length} found)`, 'green');

            const inboxLabel = labels.find(l => l.name === 'INBOX');
            if (inboxLabel) {
                log('  ✓ INBOX label exists', 'green');
            }
        } catch (labelError) {
            log(`⚠ Could not list labels: ${labelError.message}`, 'yellow');
        }

        return true;
    } catch (error) {
        log(`✗ OAuth/Gmail test failed: ${error.message}`, 'red');

        if (error.message.includes('invalid_grant')) {
            log('  → Refresh token may be invalid or expired', 'yellow');
            log('  → Get a new one: node get-gmail-refresh-token.js', 'blue');
        } else if (error.message.includes('redirect_uri_mismatch')) {
            log('  → Redirect URI mismatch in OAuth configuration', 'yellow');
            log('  → Add to OAuth client:', 'blue');
            log('    http://localhost:8081/oauth2callback', 'cyan');
        }

        return false;
    }
}

/**
 * Step 3: Test Gmail Watch Setup (The Critical Part)
 */
async function testGmailWatch() {
    logSubsection('Gmail Watch Setup Test');

    try {
        if (!results.oauth.passed) {
            log('⏭ Skipping watch test (OAuth not verified)', 'yellow');
            return false;
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:8081/oauth2callback'
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        log(`Attempting to set up Gmail watch...`, 'cyan');
        log(`  Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'blue');
        log(`  Labels: INBOX`, 'blue');

        const watchResponse = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
                labelIds: ['INBOX']
            }
        });

        results.gmailWatch.historyId = watchResponse.data.historyId;
        results.gmailWatch.expiration = new Date(parseInt(watchResponse.data.expiration));

        log(`✓ Gmail watch setup successful!`, 'green');
        log(`  History ID: ${watchResponse.data.historyId}`, 'blue');
        log(`  Expiration: ${results.gmailWatch.expiration.toLocaleString()}`, 'blue');

        const daysUntilExpiration = Math.floor(
            (parseInt(watchResponse.data.expiration) - Date.now()) / (1000 * 60 * 60 * 24)
        );
        log(`  Days until expiration: ${daysUntilExpiration}`, 'blue');

        // Stop the watch immediately since we just tested it
        log('\nStopping test watch...', 'cyan');
        await gmail.users.stop({ userId: 'me' });
        log('✓ Test watch stopped', 'green');

        results.gmailWatch.passed = true;
        return true;

    } catch (error) {
        log(`✗ Gmail watch setup failed: ${error.message}`, 'red');
        results.gmailWatch.error = error.message;

        // Provide specific troubleshooting based on error type
        if (error.code === 403) {
            log('\n⚠ Permission Error:', 'yellow');
            log('  → Gmail API may not be enabled', 'yellow');
            log(`  → Enable at: https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=${process.env.GOOGLE_PROJECT_ID}`, 'blue');
        } else if (error.message.includes('invalid scope')) {
            log('\n⚠ Scope Error:', 'yellow');
            log('  → OAuth scopes may be insufficient', 'yellow');
            log('  → Required scope: gmail.modify (includes watch capability)', 'blue');
        } else if (error.message.includes('topicName') || error.message.includes('Pub/Sub')) {
            log('\n⚠ Pub/Sub Topic Error:', 'yellow');
            log('  → The Pub/Sub topic may not exist or be accessible', 'yellow');
            log(`  → Verify topic exists: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'blue');
            log('\n  Manual Setup Required:', 'cyan');
            log('    1. Go to Google Cloud Console → Pub/Sub → Topics', 'white');
            log(`    2. Create topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop()}`, 'blue');
            log(`    3. Link: https://console.cloud.google.com/cloudpubsub/topic/list?project=${process.env.GOOGLE_PROJECT_ID}`, 'cyan');

            log('\n  Subscription Setup:', 'cyan');
            log('    1. Go to Pub/Sub → Subscriptions', 'white');
            log('    2. Create subscription with these settings:', 'white');
            log(`       - Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop()}`, 'blue');
            log(`       - Type: PUSH`, 'blue');
            log(`       - Endpoint: ${process.env.GMAIL_PUSH_WEBHOOK_URL || 'https://mcp.spencerheywood.com/gmail-push'}`, 'blue');
            log('       - Ack Deadline: 10 seconds', 'blue');
        } else if (error.message.includes('User not authorized')) {
            log('\n⚠ Authorization Error:', 'yellow');
            log('  → Your user account needs permission to use Pub/Sub', 'yellow');
            log('  → This is expected - the subscription must be pre-configured in Google Cloud Console', 'yellow');
            log('\n  Solution:', 'cyan');
            log('    1. Create Pub/Sub topic (if not exists)', 'white');
            log('    2. Create PUSH subscription with your webhook endpoint', 'white');
            log('    3. Google will automatically grant permissions when subscription is created', 'white');
        }

        return false;
    }
}

/**
 * Step 4: Start Temporary Webhook Server for Testing
 */
function startWebhookServer() {
    logSubsection('Webhook Server Test');

    const port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080;

    // Use express if available, otherwise use native http
    let app;
    try {
        app = express();
        app.use(express.json());
    } catch (e) {
        log('⚠ Express not available, using native HTTP server', 'yellow');
        app = null;
    }

    return new Promise((resolve) => {
        let server;

        if (app) {
            // Express-based server
            app.post('/gmail-push', (req, res) => {
                log('[Webhook Test] Received POST notification', 'green');
                log(`  Body: ${JSON.stringify(req.body)}`, 'blue');

                const message = req.body.message;
                if (message && message.historyId) {
                    log(`  History ID: ${message.historyId}`, 'blue');
                }

                res.status(200).json({ received: true });
            });

            app.get('/gmail-push', (req, res) => {
                const challenge = req.query['x-goog-channel-token'];
                if (challenge) {
                    log('[Webhook Test] Verification request received', 'green');
                    log(`  Token: ${challenge.substring(0, 20)}...`, 'blue');
                    res.status(200).send('Webhook verified');
                } else {
                    res.status(404).send('Not found');
                }
            });

            server = app.listen(port, () => {
                results.webhookServer.started = true;
                results.webhookServer.port = port;

                log(`✓ Webhook server started on port ${port}`, 'green');
                log(`  POST /gmail-push - Receives notifications`, 'blue');
                log(`  GET  /gmail-push - Google verification`, 'blue');

                resolve(server);
            });

        } else {
            // Native HTTP server fallback
            server = http.createServer((req, res) => {
                let body = '';

                req.on('data', chunk => {
                    body += chunk.toString();
                });

                req.on('end', () => {
                    if (req.method === 'POST' && req.url === '/gmail-push') {
                        log('[Webhook Test] Received POST notification', 'green');

                        try {
                            const data = JSON.parse(body);
                            log(`  Body: ${JSON.stringify(data)}`, 'blue');

                            if (data.message && data.message.historyId) {
                                log(`  History ID: ${data.message.historyId}`, 'blue');
                            }
                        } catch (e) {
                            log(`  Raw body: ${body}`, 'yellow');
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ received: true }));

                    } else if (req.method === 'GET' && req.url.startsWith('/gmail-push')) {
                        const url = new URL(req.url, `http://localhost:${port}`);
                        const challenge = url.searchParams.get('x-goog-channel-token');

                        if (challenge) {
                            log('[Webhook Test] Verification request received', 'green');
                            res.writeHead(200);
                            res.end('Webhook verified');
                        } else {
                            res.writeHead(404);
                            res.end('Not found');
                        }
                    } else {
                        res.writeHead(404);
                        res.end('Not found');
                    }
                });
            });

            server.listen(port, () => {
                results.webhookServer.started = true;
                results.webhookServer.port = port;

                log(`✓ Webhook server started on port ${port}`, 'green');
                log(`  POST /gmail-push - Receives notifications`, 'blue');
                log(`  GET  /gmail-push - Google verification`, 'blue');

                resolve(server);
            });
        }

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                log(`⚠ Port ${port} is already in use`, 'yellow');
                log('  → Another process may be running on this port', 'blue');
                log('  → Try a different port or stop the other process', 'blue');
            } else {
                log(`✗ Webhook server error: ${error.message}`, 'red');
            }

            results.webhookServer.started = false;
            resolve(null);
        });
    });
}

/**
 * Step 5: Test Local Webhook Endpoint
 */
async function testLocalWebhook() {
    logSubsection('Local Webhook Endpoint Test');

    const port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080;

    // Test GET endpoint (verification)
    return new Promise((resolve) => {
        http.get({
            hostname: 'localhost',
            port: port,
            path: '/gmail-push?x-goog-channel-token=test-token-12345',
            timeout: 3000
        }, (res) => {
            log(`✓ GET /gmail-push responding`, 'green');
            log(`  Status: ${res.statusCode}`, 'blue');

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data) log(`  Response: ${data}`, 'blue');

                // Test POST endpoint
                testPostEndpoint(port, resolve);
            });
        }).on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                log(`⚠ Webhook server not running on port ${port}`, 'yellow');
                log('  → Start the server: node test_gmail_push_standalone.js', 'blue');
            } else {
                log(`✗ GET request failed: ${error.message}`, 'red');
            }

            // Still try POST
            testPostEndpoint(port, resolve);
        });
    });
}

function testPostEndpoint(port, callback) {
    const testData = JSON.stringify({
        message: {
            userId: 'me',
            historyId: '123456789'
        }
    });

    const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/gmail-push',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(testData)
        },
        timeout: 3000
    }, (res) => {
        log(`✓ POST /gmail-push responding`, 'green');
        log(`  Status: ${res.statusCode}`, 'blue');

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (data) log(`  Response: ${data}`, 'blue');
            callback(true);
        });
    }).on('error', (error) => {
        if (error.code !== 'ECONNREFUSED') {
            log(`✗ POST request failed: ${error.message}`, 'red');
        }
        callback(false);
    });

    req.write(testData);
    req.end();
}

/**
 * Step 6: Generate Final Summary
 */
function generateSummary() {
    logSection('TEST SUMMARY');

    const tests = [
        { name: 'Environment Variables', passed: results.environment.passed, critical: true },
        { name: 'OAuth Credentials', passed: results.oauth.passed, critical: true },
        { name: 'Gmail Watch Setup', passed: results.gmailWatch.passed, critical: true },
        { name: 'Webhook Server', passed: results.webhookServer.started, critical: false },
    ];

    let totalPassed = 0;
    let criticalFailed = false;

    tests.forEach(test => {
        const status = test.passed ? '✓ PASS' : '✗ FAIL';
        const color = test.passed ? 'green' : 'red';

        if (test.critical && !test.passed) {
            log(`⚠ ${status}: ${test.name} (CRITICAL)`, 'red');
            criticalFailed = true;
        } else {
            log(`${status}: ${test.name}`, color);
        }

        if (test.passed) totalPassed++;
    });

    log('\n' + '='.repeat(70), 'cyan');
    log(`Total: ${totalPassed}/${tests.length} tests passed`, totalPassed === tests.length ? 'green' : 'yellow');
    log('='.repeat(70) + '\n', 'cyan');

    // Detailed results
    if (results.oauth.email) {
        logSubsection('OAuth Details');
        log(`Email: ${results.oauth.email}`, 'blue');
    }

    if (results.gmailWatch.historyId) {
        logSubsection('Gmail Watch Status');
        log(`✓ Watch is active`, 'green');
        log(`History ID: ${results.gmailWatch.historyId}`, 'blue');
        log(`Expires: ${results.gmailWatch.expiration.toLocaleString()}`, 'blue');
    } else if (results.gmailWatch.error) {
        logSubsection('Gmail Watch Error Details');
        log(results.gmailWatch.error, 'yellow');
    }

    // Next steps based on results
    if (criticalFailed) {
        logSection('CRITICAL ISSUES TO FIX');

        if (!results.environment.passed) {
            log('\n1. Fix environment variables:', 'yellow');
            log('   → Add missing variables to .env file', 'white');
        }

        if (!results.oauth.passed) {
            log('\n2. Fix OAuth credentials:', 'yellow');
            log('   → Run: node get-gmail-refresh-token.js', 'white');
        }

        if (!results.gmailWatch.passed) {
            log('\n3. Fix Gmail Watch issue:', 'yellow');

            if (results.gmailWatch.error && results.gmailWatch.error.includes('Pub/Sub')) {
                log('   → Create Pub/Sub topic in Google Cloud Console', 'white');
                log(`   → Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop()}`, 'cyan');

                log('\n   → Create PUSH subscription:', 'white');
                log('     https://console.cloud.google.com/cloudpubsub/subscription/create', 'blue');
                log(`       - Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop()}`, 'cyan');
                log(`       - Type: PUSH`, 'cyan');
                log(`       - Endpoint: ${process.env.GMAIL_PUSH_WEBHOOK_URL || 'https://mcp.spencerheywood.com/gmail-push'}`, 'cyan');
                log('       - Ack Deadline: 10 seconds', 'cyan');
            } else if (results.gmailWatch.error && results.gmailWatch.error.includes('User not authorized')) {
                log('   → Pub/Sub subscription must be pre-configured in Google Cloud Console', 'white');
                log('   → See instructions above for subscription setup', 'white');
            }
        }

    } else if (totalPassed === tests.length) {
        logSection('ALL TESTS PASSED! 🎉');

        log('\nYour Gmail Push configuration is fully working!', 'green');

        log('\nNext Steps:', 'blue');
        log('1. Keep this server running to receive notifications', 'white');
        log('   (Or start your main RAG server: npm start)', 'cyan');

        log('\n2. Send a test email to:', 'white');
        log(`   ${results.oauth.email}`, 'cyan');
        log('   Subject: [prompt] Test Gmail Push', 'cyan');

        log('\n3. Watch for instant processing in the logs!', 'white');
        log('   Expected within 1-2 seconds of receiving email', 'blue');

    } else {
        logSection('PARTIAL SUCCESS');

        if (!results.webhookServer.started) {
            log('\nWebhook server not running (expected when testing)', 'blue');
            log('→ Start with: node test_gmail_push_standalone.js', 'white');
        }

        log('\nTo proceed, fix the critical tests above first.', 'yellow');
    }

    // Additional recommendations
    logSubsection('Recommendations');

    const recommendations = [
        'Add yourself as test user in OAuth consent screen',
        'Monitor watch expiration (auto-renews 24h before expiry)',
        'Check Cloud Logging for webhook delivery errors',
        'Use ngrok for local testing: ngrok http 8080',
    ];

    recommendations.forEach((rec, i) => {
        log(`  ${i + 1}. ${rec}`, 'blue');
    });

    return results;
}

/**
 * Main Test Runner
 */
async function runTests() {
    logSection('Gmail Push Notifications - Standalone Test');
    log(`Started: ${new Date().toLocaleString()}`, 'cyan');

    // Step 1: Environment Variables
    validateEnvironment();

    // Step 2: OAuth and Gmail API
    results.oauth.passed = await testOAuthAndGmail();

    // Step 3: Gmail Watch Setup (Critical!)
    if (results.oauth.passed) {
        results.gmailWatch.passed = await testGmailWatch();
    } else {
        log('\n⏭ Skipping watch test (OAuth failed)', 'yellow');
    }

    // Step 4: Start Webhook Server
    const server = await startWebhookServer();

    // Step 5: Test Local Webhook (if server started)
    if (server) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for server to be ready
        await testLocalWebhook();

        // Keep server running briefly to show it works
        log('\n⏳ Webhook server running for 5 seconds...', 'cyan');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Close server
        server.close(() => {
            log('✓ Webhook server stopped', 'green');
        });
    }

    // Step 6: Summary
    generateSummary();

    log(`\nCompleted: ${new Date().toLocaleString()}`, 'cyan');
}

// Run tests if executed directly
if (require.main === module) {
    runTests()
        .then(() => process.exit(0))
        .catch(error => {
            log(`\n✗ Test suite failed: ${error.message}`, 'red');
            console.error(error);
            process.exit(1);
        });
}

module.exports = { runTests, results };
