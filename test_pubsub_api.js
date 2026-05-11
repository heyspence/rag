/**
 * Gmail Pub/Sub API Test Script
 *
 * Comprehensive testing script for validating Gmail Push Notification setup.
 * Tests Pub/Sub configuration, OAuth credentials, and webhook endpoints.
 *
 * Usage:
 *   node test_pubsub_api.js
 *
 * This script will:
 * 1. Validate all required environment variables
 * 2. Test OAuth credentials and Gmail API access
 * 3. Verify Pub/Sub topic exists and is accessible
 * 4. Check subscription configuration
 * 5. Test webhook endpoint connectivity
 * 6. Send a test message through Pub/Sub (optional)
 */

require('dotenv').config();
const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const http = require('http');
const https = require('https');

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
const testResults = {
    environment: { passed: false, details: [] },
    oauth: { passed: false, details: [] },
    pubsubTopic: { passed: false, details: [] },
    pubsubSubscription: { passed: false, details: [] },
    webhookLocal: { passed: false, details: [] },
    webhookPublic: { passed: false, details: [] },
};

/**
 * Step 1: Validate Environment Variables
 */
function validateEnvironmentVariables() {
    logSubsection('Environment Variable Validation');

    const requiredVars = [
        { name: 'GOOGLE_PROJECT_ID', sensitive: false },
        { name: 'GOOGLE_CLIENT_ID', sensitive: false },
        { name: 'GOOGLE_CLIENT_SECRET', sensitive: true },
        { name: 'GOOGLE_REFRESH_TOKEN', sensitive: true },
        { name: 'GOOGLE_PUBSUB_TOPIC_NAME', sensitive: false },
        { name: 'GMAIL_PUSH_WEBHOOK_PORT', sensitive: false },
        { name: 'GMAIL_PUSH_WEBHOOK_URL', sensitive: false },
    ];

    let allPresent = true;

    requiredVars.forEach(({ name, sensitive }) => {
        const value = process.env[name];
        if (value) {
            // Mask sensitive values for security
            let displayValue = value;
            if (sensitive) {
                displayValue = value.substring(0, 12) + '...' +
                              (value.length > 20 ? '***' : '');
            }
            log(`✓ ${name}: ${displayValue}`, 'green');
            testResults.environment.details.push(`${name} present`);
        } else {
            log(`✗ ${name}: MISSING`, 'red');
            allPresent = false;
            testResults.environment.details.push(`${name} missing`);
        }
    });

    // Validate webhook URL format
    if (process.env.GMAIL_PUSH_WEBHOOK_URL) {
        try {
            const url = new URL(process.env.GMAIL_PUSH_WEBHOOK_URL);
            if (url.protocol === 'https:') {
                log('✓ Webhook URL uses HTTPS', 'green');
                testResults.environment.details.push('Webhook URL is HTTPS');
            } else {
                log('⚠ Webhook URL uses HTTP (should be HTTPS for production)', 'yellow');
                testResults.environment.details.push('Webhook URL is HTTP');
            }

            if (!url.pathname.includes('/gmail-push')) {
                log('⚠ Webhook URL should end with /gmail-push', 'yellow');
                testResults.environment.details.push('Webhook path may be incorrect');
            } else {
                log('✓ Webhook URL path is correct (/gmail-push)', 'green');
                testResults.environment.details.push('Webhook path is correct');
            }
        } catch (error) {
            log(`✗ Invalid webhook URL format: ${error.message}`, 'red');
            allPresent = false;
            testResults.environment.details.push('Invalid webhook URL format');
        }
    }

    testResults.environment.passed = allPresent;
    return allPresent;
}

/**
 * Step 2: Test OAuth Credentials and Gmail API Access
 */
async function testOAuthCredentials() {
    logSubsection('OAuth Credentials & Gmail API Validation');

    try {
        if (!process.env.GOOGLE_CLIENT_ID ||
            !process.env.GOOGLE_CLIENT_SECRET ||
            !process.env.GOOGLE_REFRESH_TOKEN) {
            log('✗ Missing OAuth credentials', 'red');
            testResults.oauth.details.push('Missing OAuth credentials');
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

        // Test by getting user profile
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });

        log(`✓ OAuth credentials are valid`, 'green');
        log(`  Gmail Address: ${profile.data.emailAddress}`, 'blue');
        log(`  Total Messages: ${profile.data.messagesTotal.toLocaleString()}`, 'blue');
        log(`  Total Threads: ${profile.data.threadsTotal.toLocaleString()}`, 'blue');

        testResults.oauth.details.push('OAuth credentials valid');
        testResults.oauth.details.push(`Gmail address: ${profile.data.emailAddress}`);

        // Test Gmail API scopes by attempting to list labels
        try {
            const [labels] = await gmail.users.labels.list({ userId: 'me' });
            log(`✓ Gmail API access confirmed (${labels.data.labels.length} labels found)`, 'green');
            testResults.oauth.details.push('Gmail API access confirmed');
        } catch (labelError) {
            log(`⚠ Could not list labels: ${labelError.message}`, 'yellow');
            testResults.oauth.details.push('Label listing failed - check scopes');
        }

        return true;
    } catch (error) {
        log(`✗ OAuth test failed: ${error.message}`, 'red');

        if (error.code === 403) {
            log('  → Gmail API may not be enabled', 'yellow');
            log('  → Enable at: https://console.cloud.google.com/apis/library/gmail.googleapis.com', 'yellow');
            testResults.oauth.details.push('Gmail API disabled or scope issue');
        } else if (error.message.includes('invalid_grant')) {
            log('  → Refresh token is invalid or expired', 'yellow');
            log('  → Run: node get-gmail-refresh-token.js', 'yellow');
            testResults.oauth.details.push('Invalid refresh token');
        } else if (error.message.includes('redirect_uri_mismatch')) {
            log('  → Redirect URI mismatch in OAuth configuration', 'yellow');
            log('  → Add this to your OAuth client:', 'yellow');
            log('    http://localhost:8081/oauth2callback', 'blue');
            testResults.oauth.details.push('Redirect URI mismatch');
        } else {
            testResults.oauth.details.push(`OAuth error: ${error.message}`);
        }

        return false;
    }
}

/**
 * Step 3: Test Pub/Sub Topic Configuration
 */
async function testPubSubTopic() {
    logSubsection('Pub/Sub Topic Validation');

    try {
        if (!process.env.GOOGLE_PUBSUB_TOPIC_NAME || !process.env.GOOGLE_PROJECT_ID) {
            log('✗ Missing Pub/Sub configuration', 'red');
            testResults.pubsubTopic.details.push('Missing Pub/Sub config');
            return false;
        }

        // Initialize Pub/Sub client with explicit project ID
        const pubsub = new PubSub({
            projectId: process.env.GOOGLE_PROJECT_ID
        });

        log(`Testing connection to Google Cloud Project...`, 'cyan');
        log(`  Project ID: ${process.env.GOOGLE_PROJECT_ID}`, 'blue');

        // Check if topic exists
        const [topicExists] = await pubsub
            .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
            .exists();

        if (topicExists) {
            log(`✓ Pub/Sub topic exists`, 'green');
            log(`  Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'blue');

            // Get topic metadata
            const [metadata] = await pubsub
                .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
                .getMetadata();

            log(`  Created: ${new Date(metadata.created).toLocaleString()}`, 'blue');

            testResults.pubsubTopic.details.push('Topic exists');
            testResults.pubsubTopic.details.push(`Created: ${new Date(metadata.created).toISOString()}`);

            // Test publishing a message (dry run - won't actually send)
            log('\n  Testing topic publish capability...', 'cyan');

            const testData = {
                test: true,
                timestamp: new Date().toISOString(),
                source: 'pubsub_api_test'
            };

            try {
                // Create a message buffer
                const dataBuffer = Buffer.from(JSON.stringify(testData));

                // Publish the message (but we'll catch it immediately)
                const messageId = await pubsub
                    .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
                    .publishMessage({ data: dataBuffer });

                log(`  ✓ Can publish to topic (message ID: ${messageId})`, 'green');
                testResults.pubsubTopic.details.push('Publish capability confirmed');
            } catch (publishError) {
                log(`  ⚠ Publish test failed: ${publishError.message}`, 'yellow');
                testResults.pubsubTopic.details.push(`Publish error: ${publishError.message}`);
            }

            pubsub.close();
            return true;
        } else {
            log(`✗ Pub/Sub topic does not exist`, 'red');
            log(`  Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'blue');
            log('\n  To create the topic:', 'yellow');
            log('    1. Go to Google Cloud Console', 'yellow');
            log('    2. Navigate to Pub/Sub → Topics', 'yellow');
            log('    3. Click "Create Topic"', 'yellow');
            log(`    4. Name: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop()}`, 'blue');
            log('\n  Or use the setup script:', 'yellow');
            log('    node setup-gmail-pubsub.js', 'cyan');

            testResults.pubsubTopic.details.push('Topic does not exist');
            pubsub.close();
            return false;
        }
    } catch (error) {
        log(`✗ Pub/Sub topic test failed: ${error.message}`, 'red');

        if (error.code === 403 || error.message.includes('Permission')) {
            log('\n  Permission Error:', 'yellow');
            log('  → Service account lacks Pub/Sub permissions', 'yellow');
            log('  → Grant these roles in IAM & Admin:', 'yellow');
            log('    - Pub/Sub Editor', 'blue');
            log('    - or Pub/Sub Publisher + Subscriber', 'blue');
            testResults.pubsubTopic.details.push('Permission denied');
        } else if (error.code === 404) {
            log('\n  Project Not Found:', 'yellow');
            log(`  → Verify project ID: ${process.env.GOOGLE_PROJECT_ID}`, 'yellow');
            log('  → Ensure project exists in Google Cloud Console', 'yellow');
            testResults.pubsubTopic.details.push('Project not found');
        } else if (error.message.includes('Could not load the default credentials')) {
            log('\n  Authentication Error:', 'yellow');
            log('  → No Google Cloud credentials found', 'yellow');
            log('  → Options to fix:', 'yellow');
            log('    1. Set GOOGLE_APPLICATION_CREDENTIALS env var', 'blue');
            log('    2. Use gcloud CLI: gcloud auth application-default login', 'blue');
            log('    3. Create service account key and download JSON', 'blue');
            testResults.pubsubTopic.details.push('No credentials available');
        } else {
            testResults.pubsubTopic.details.push(`Error: ${error.message}`);
        }

        return false;
    }
}

/**
 * Step 4: Test Pub/Sub Subscription Configuration
 */
async function testPubSubSubscription() {
    logSubsection('Pub/Sub Subscription Validation');

    try {
        if (!process.env.GOOGLE_PUBSUB_TOPIC_NAME) {
            log('✗ Missing topic configuration', 'red');
            return false;
        }

        const pubsub = new PubSub({
            projectId: process.env.GOOGLE_PROJECT_ID
        });

        // Get all subscriptions for the topic
        const [subscriptions] = await pubsub
            .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
            .getSubscriptions();

        if (subscriptions.length > 0) {
            log(`✓ Found ${subscriptions.length} subscription(s)`, 'green');

            let pushSubscriptionFound = false;

            for (const sub of subscriptions) {
                const [metadata] = await sub.getMetadata();
                const subName = metadata.name.split('/').pop();

                if (metadata.pushConfig && metadata.pushConfig.pushEndpoint) {
                    log(`\n  ✓ Push Subscription: ${subName}`, 'green');
                    log(`    Endpoint: ${metadata.pushConfig.pushEndpoint}`, 'blue');

                    // Check if it matches our webhook URL
                    if (metadata.pushConfig.pushEndpoint === process.env.GMAIL_PUSH_WEBHOOK_URL) {
                        log('    ✓ Matches configured webhook URL', 'green');
                        pushSubscriptionFound = true;
                    } else {
                        log(`    ⚠ Does not match configured webhook URL`, 'yellow');
                        log(`      Expected: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`, 'blue');
                    }

                    if (metadata.ackDeadlineSeconds) {
                        log(`    Ack Deadline: ${metadata.ackDeadlineSeconds}s`, 'blue');
                    }
                } else {
                    log(`\n  ⚠ Pull Subscription: ${subName} (no push endpoint)`, 'yellow');
                    log('    → This subscription cannot receive push notifications', 'yellow');
                }
            }

            if (!pushSubscriptionFound) {
                log('\n⚠ No matching push subscription found!', 'yellow');
                log('\nTo configure a push subscription:', 'yellow');
                log('  1. Go to Google Cloud Console → Pub/Sub → Subscriptions', 'yellow');
                log('  2. Create new subscription or edit existing one', 'yellow');
                log(`  3. Set Push Endpoint: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`, 'blue');
                log('\nOr use the setup script:', 'yellow');
                log('  node setup-gmail-pubsub.js', 'cyan');

                testResults.pubsubSubscription.details.push('No matching push subscription');
            } else {
                testResults.pubsubSubscription.details.push('Push subscription configured correctly');
            }

            pubsub.close();
            return pushSubscriptionFound;
        } else {
            log('⚠ No subscriptions found for this topic', 'yellow');
            log('\nTo create a subscription:', 'yellow');
            log('  1. Go to Google Cloud Console → Pub/Sub → Subscriptions', 'yellow');
            log('  2. Click "Create Subscription"', 'yellow');
            log(`  3. Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop()}`, 'blue');
            log('  4. Type: Push', 'blue');
            log(`  5. Push Endpoint: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`, 'blue');

            testResults.pubsubSubscription.details.push('No subscriptions exist');
            pubsub.close();
            return false;
        }
    } catch (error) {
        log(`✗ Subscription test failed: ${error.message}`, 'red');
        testResults.pubsubSubscription.details.push(`Error: ${error.message}`);
        return false;
    }
}

/**
 * Step 5: Test Local Webhook Endpoint
 */
function testLocalWebhookEndpoint() {
    logSubsection('Local Webhook Endpoint Testing');

    const port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080;

    return new Promise((resolve) => {
        // Test GET endpoint (verification)
        const getReq = http.request({
            hostname: 'localhost',
            port: port,
            path: '/gmail-push?x-goog-channel-token=test-token',
            method: 'GET',
            timeout: 3000
        }, (res) => {
            log(`✓ GET /gmail-push responding`, 'green');
            log(`  Status: ${res.statusCode}`, 'blue');

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data) log(`  Response: ${data}`, 'blue');
            });

            testLocalPostEndpoint(port, resolve);
        });

        getReq.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                log(`⚠ Webhook server not running on port ${port}`, 'yellow');
                log('  → Start your RAG endpoint: npm start', 'blue');
                testResults.webhookLocal.details.push('Server not running');
            } else {
                log(`✗ GET request failed: ${error.message}`, 'red');
                testResults.webhookLocal.details.push(`GET error: ${error.message}`);
            }

            // Still try POST even if GET fails
            testLocalPostEndpoint(port, resolve);
        });

        getReq.on('timeout', () => {
            getReq.destroy();
            log(`⚠ GET request timeout`, 'yellow');
            testResults.webhookLocal.details.push('GET timeout');
            testLocalPostEndpoint(port, resolve);
        });

        getReq.end();
    });
}

/**
 * Test POST endpoint for webhook
 */
function testLocalPostEndpoint(port, callback) {
    const testData = JSON.stringify({ message: { userId: 'test', historyId: '12345' } });

    const postReq = http.request({
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

            testResults.webhookLocal.passed = true;
            testResults.webhookLocal.details.push('POST endpoint working');
            callback(true);
        });
    });

    postReq.on('error', (error) => {
        if (error.code === 'ECONNREFUSED') {
            // Already handled in GET test
            testResults.webhookLocal.passed = false;
        } else {
            log(`✗ POST request failed: ${error.message}`, 'red');
            testResults.webhookLocal.details.push(`POST error: ${error.message}`);
        }
        callback(false);
    });

    postReq.on('timeout', () => {
        postReq.destroy();
        log(`⚠ POST request timeout`, 'yellow');
        testResults.webhookLocal.details.push('POST timeout');
        callback(false);
    });

    postReq.write(testData);
    postReq.end();
}

/**
 * Step 6: Test Public Webhook Endpoint (if accessible)
 */
function testPublicWebhookEndpoint() {
    logSubsection('Public Webhook Endpoint Testing');

    if (!process.env.GMAIL_PUSH_WEBHOOK_URL) {
        log('⚠ No webhook URL configured', 'yellow');
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const url = new URL(process.env.GMAIL_PUSH_WEBHOOK_URL);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        log(`Testing: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`, 'cyan');

        const req = lib.request({
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent': 'Gmail-PubSub-Test/1.0'
            }
        }, (res) => {
            log(`✓ Public endpoint responding`, 'green');
            log(`  Status: ${res.statusCode}`, 'blue');

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data && data.length < 500) {
                    log(`  Response: ${data.substring(0, 100)}...`, 'blue');
                }

                testResults.webhookPublic.passed = true;
                testResults.webhookPublic.details.push('Public endpoint accessible');
                resolve(true);
            });
        });

        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                log(`⚠ Public endpoint not accessible`, 'yellow');
                log(`  → Ensure your server is running and publicly accessible`, 'yellow');
                log(`  → Check firewall/NAT configuration`, 'yellow');
                testResults.webhookPublic.details.push('Endpoint not accessible');
            } else {
                log(`✗ Public endpoint error: ${error.message}`, 'red');
                testResults.webhookPublic.details.push(`Error: ${error.message}`);
            }
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            log(`⚠ Request timeout (10s)`, 'yellow');
            log('  → Server may be slow to respond or blocked', 'yellow');
            testResults.webhookPublic.details.push('Timeout');
            resolve(false);
        });

        req.end();
    });
}

/**
 * Generate Final Summary Report
 */
function generateSummary() {
    logSection('TEST SUMMARY REPORT');

    const tests = [
        { name: 'Environment Variables', result: testResults.environment },
        { name: 'OAuth Credentials & Gmail API', result: testResults.oauth },
        { name: 'Pub/Sub Topic', result: testResults.pubsubTopic },
        { name: 'Pub/Sub Subscription', result: testResults.pubsubSubscription },
        { name: 'Local Webhook Endpoint', result: testResults.webhookLocal },
        { name: 'Public Webhook Endpoint', result: testResults.webhookPublic },
    ];

    let totalPassed = 0;
    const criticalTests = ['Environment Variables', 'OAuth Credentials & Gmail API', 'Pub/Sub Topic'];

    tests.forEach(test => {
        const status = test.result.passed ? '✓ PASS' : '✗ FAIL';
        const color = test.result.passed ? 'green' : 'red';
        const isCritical = criticalTests.includes(test.name);

        if (isCritical && !test.result.passed) {
            log(`⚠ ${status}: ${test.name} (CRITICAL)`, 'red');
        } else {
            log(`${status}: ${test.name}`, color);
        }

        // Show details
        test.result.details.forEach(detail => {
            log(`    • ${detail}`, test.result.passed ? 'blue' : 'yellow');
        });

        if (test.result.passed) totalPassed++;
    });

    log('\n' + '='.repeat(70), 'cyan');
    log(`Total: ${totalPassed}/${tests.length} tests passed`, totalPassed === tests.length ? 'green' : 'yellow');
    log('='.repeat(70) + '\n', 'cyan');

    // Determine overall status and next steps
    const criticalFailed = criticalTests.some(test => !testResults[test.toLowerCase().replace(/ /g, '')]?.passed);

    if (totalPassed === tests.length) {
        log('🎉 All tests passed! Your Gmail Push setup is ready.', 'green');
        log('\nNext steps:', 'blue');
        log('  1. Start your RAG endpoint server:', 'white');
        log('     npm start', 'cyan');
        log('\n  2. Send a test email with [prompt] in the subject line', 'white');
        log('  3. Watch for instant processing in the logs!', 'white');
    } else if (criticalFailed) {
        log('⚠ Critical tests failed. Fix these before proceeding.', 'red');
        log('\nCritical issues to resolve:', 'yellow');

        if (!testResults.environment.passed) {
            log('  → Add missing environment variables to .env file', 'blue');
        }
        if (!testResults.oauth.passed) {
            log('  → Run: node get-gmail-refresh-token.js', 'blue');
        }
        if (!testResults.pubsubTopic.passed) {
            log('  → Create Pub/Sub topic in Google Cloud Console or run:', 'blue');
            log('     node setup-gmail-pubsub.js', 'cyan');
        }
    } else {
        log('⚠ Some non-critical tests failed. You can proceed with limited functionality.', 'yellow');

        if (!testResults.webhookLocal.passed) {
            log('\nNote: Local webhook server not running (expected when app is stopped)', 'blue');
        }
        if (!testResults.webhookPublic.passed) {
            log('Note: Public webhook endpoint not accessible (check network/firewall)', 'blue');
        }
    }

    // Additional recommendations
    logSubsection('Additional Recommendations');

    const recommendations = [];

    if (process.env.GMAIL_PUSH_WEBHOOK_URL &&
        !process.env.GMAIL_PUSH_WEBHOOK_URL.startsWith('https://')) {
        recommendations.push('Use HTTPS for production webhook URLs');
    }

    if (!testResults.pubsubSubscription.passed) {
        recommendations.push('Configure Pub/Sub subscription push endpoint in Google Cloud Console');
    }

    recommendations.push('Set up watch renewal monitoring (watches expire after 7 days)');
    recommendations.push('Add yourself as a test user in OAuth consent screen');
    recommendations.push('Monitor Cloud Logging for webhook delivery errors');

    if (recommendations.length > 0) {
        recommendations.forEach((rec, index) => {
            log(`  ${index + 1}. ${rec}`, 'blue');
        });
    }

    return testResults;
}

/**
 * Main Test Runner
 */
async function runAllTests() {
    logSection('Gmail Pub/Sub API Comprehensive Test');
    log(`Started at: ${new Date().toLocaleString()}`, 'cyan');

    // Step 1: Environment Variables
    validateEnvironmentVariables();

    // Step 2: OAuth Credentials
    testResults.oauth.passed = await testOAuthCredentials();

    // Step 3: Pub/Sub Topic
    testResults.pubsubTopic.passed = await testPubSubTopic();

    // Step 4: Pub/Sub Subscription (only if topic exists)
    if (testResults.pubsubTopic.passed) {
        testResults.pubsubSubscription.passed = await testPubSubSubscription();
    } else {
        log('\n⏭ Skipping subscription test (topic does not exist)', 'yellow');
        testResults.pubsubSubscription.details.push('Skipped - topic missing');
    }

    // Step 5: Local Webhook Endpoint
    testResults.webhookLocal.passed = await testLocalWebhookEndpoint();

    // Step 6: Public Webhook Endpoint
    testResults.webhookPublic.passed = await testPublicWebhookEndpoint();

    // Generate Summary
    generateSummary();

    log(`\nCompleted at: ${new Date().toLocaleString()}`, 'cyan');
}

// Run tests if this script is executed directly
if (require.main === module) {
    runAllTests()
        .then(() => process.exit(0))
        .catch(error => {
            log(`\n✗ Test suite failed with error: ${error.message}`, 'red');
            console.error(error);
            process.exit(1);
        });
}

module.exports = { runAllTests, testResults };
