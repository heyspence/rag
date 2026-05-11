/**
 * Gmail Push Notifications - Simple Test Script
 *
 * This script tests Gmail Push configuration without requiring full Google Cloud credentials.
 * It focuses on what can be tested with OAuth alone, and provides manual verification steps
 * for Pub/Sub resources that require cloud SDK authentication.
 *
 * Usage:
 *   node test_gmail_push_simple.js
 *
 * What this tests:
 * 1. ✓ Environment variables configuration
 * 2. ✓ OAuth credentials validity
 * 3. ✓ Gmail API access and watch capability
 * 4. ✓ Local webhook endpoint (when server is running)
 * 5. ℹ Pub/Sub resources (manual verification instructions provided)
 */

require('dotenv').config();
const { google } = require('googleapis');
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
const results = {
    environment: { passed: false, checks: [] },
    oauth: { passed: false, details: {} },
    gmailWatch: { passed: false, details: {} },
    localWebhook: { passed: false, details: [] },
    pubsubManual: { required: true, verified: false },
};

/**
 * Step 1: Validate Environment Variables
 */
function validateEnvironment() {
    logSubsection('Environment Variables');

    const checks = [
        { name: 'GOOGLE_PROJECT_ID', required: true },
        { name: 'GOOGLE_CLIENT_ID', required: true },
        { name: 'GOOGLE_CLIENT_SECRET', required: true },
        { name: 'GOOGLE_REFRESH_TOKEN', required: true },
        { name: 'GOOGLE_PUBSUB_TOPIC_NAME', required: true },
        { name: 'GMAIL_PUSH_WEBHOOK_PORT', required: false, default: 8080 },
        { name: 'GMAIL_PUSH_WEBHOOK_URL', required: true },
    ];

    let allPassed = true;

    checks.forEach(({ name, required, default: defaultValue }) => {
        const value = process.env[name];

        if (value) {
            // Mask sensitive values
            let displayValue = value;
            if (name.includes('SECRET') || name.includes('TOKEN')) {
                displayValue = value.substring(0, 12) + '...' +
                              (value.length > 20 ? '***' : '');
            }
            log(`✓ ${name}: ${displayValue}`, 'green');
            results.environment.checks.push(`${name} present`);
        } else if (required) {
            log(`✗ ${name}: MISSING (required)`, 'red');
            allPassed = false;
            results.environment.checks.push(`${name} missing`);
        } else if (defaultValue !== undefined) {
            log(`⚠ ${name}: not set, using default: ${defaultValue}`, 'yellow');
            results.environment.checks.push(`${name} using default`);
        } else {
            log(`  ${name}: not set (optional)`, 'blue');
            results.environment.checks.push(`${name} optional`);
        }
    });

    // Validate webhook URL format
    if (process.env.GMAIL_PUSH_WEBHOOK_URL) {
        try {
            const url = new URL(process.env.GMAIL_PUSH_WEBHOOK_URL);

            if (url.protocol === 'https:') {
                log('✓ Webhook uses HTTPS', 'green');
                results.environment.checks.push('Webhook is HTTPS');
            } else {
                log('⚠ Webhook uses HTTP (should be HTTPS for production)', 'yellow');
                results.environment.checks.push('Webhook is HTTP');
            }

            if (!url.pathname.includes('/gmail-push')) {
                log('⚠ Webhook path should include /gmail-push', 'yellow');
                results.environment.checks.push('Webhook path incorrect');
            } else {
                log('✓ Webhook path correct (/gmail-push)', 'green');
                results.environment.checks.push('Webhook path correct');
            }
        } catch (error) {
            log(`✗ Invalid webhook URL: ${error.message}`, 'red');
            allPassed = false;
            results.environment.checks.push('Invalid webhook URL');
        }
    }

    // Validate Pub/Sub topic name format
    if (process.env.GOOGLE_PUBSUB_TOPIC_NAME) {
        const expectedFormat = `projects/${process.env.GOOGLE_PROJECT_ID}/topics/`;
        if (process.env.GOOGLE_PUBSUB_TOPIC_NAME.startsWith(expectedFormat)) {
            log('✓ Pub/Sub topic name format correct', 'green');
            results.environment.checks.push('Pub/Sub topic format valid');
        } else {
            log(`⚠ Pub/Sub topic may have incorrect format`, 'yellow');
            log(`  Expected: ${expectedFormat}...`, 'blue');
            results.environment.checks.push('Pub/Sub topic format questionable');
        }
    }

    results.environment.passed = allPassed;
    return allPassed;
}

/**
 * Step 2: Test OAuth Credentials and Gmail API Access
 */
async function testOAuthAndGmail() {
    logSubsection('OAuth Credentials & Gmail API');

    try {
        // Validate credentials exist
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
        log('\nTesting Gmail API access...', 'cyan');
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const profile = await gmail.users.getProfile({ userId: 'me' });

        results.oauth.details.emailAddress = profile.data.emailAddress;
        results.oauth.details.messagesTotal = profile.data.messagesTotal;
        results.oauth.details.threadsTotal = profile.data.threadsTotal;

        log(`✓ Gmail API access successful`, 'green');
        log(`  Email: ${profile.data.emailAddress}`, 'blue');
        log(`  Total messages: ${parseInt(profile.data.messagesTotal).toLocaleString()}`, 'blue');
        log(`  Total threads: ${parseInt(profile.data.threadsTotal).toLocaleString()}`, 'blue');

        // Test label listing (verifies scopes)
        try {
            const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
            const labels = labelsResponse.data.labels || [];

            log(`✓ Labels accessible (${labels.length} found)`, 'green');

            // Check for required labels
            const inboxLabel = labels.find(l => l.name === 'INBOX');
            if (inboxLabel) {
                log('  ✓ INBOX label exists', 'green');
            }
        } catch (labelError) {
            log(`⚠ Could not list labels: ${labelError.message}`, 'yellow');
            log('  → This may indicate insufficient OAuth scopes', 'yellow');
            results.oauth.details.scopeIssue = true;
        }

        // Test watch capability (this is what Gmail Push needs)
        log('\nTesting Gmail Watch capability...', 'cyan');

        try {
            // Try to set up a watch (we'll stop it immediately after)
            const watchResponse = await gmail.users.watch({
                userId: 'me',
                requestBody: {
                    topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
                    labelIds: ['INBOX']
                }
            });

            results.gmailWatch.details.historyId = watchResponse.data.historyId;
            results.gmailWatch.details.expiration = watchResponse.data.expiration;

            log(`✓ Gmail watch setup successful`, 'green');
            log(`  History ID: ${watchResponse.data.historyId}`, 'blue');
            log(`  Expiration: ${new Date(parseInt(watchResponse.data.expiration)).toLocaleString()}`, 'blue');

            // Stop the watch immediately (we just tested it works)
            await gmail.users.stop({ userId: 'me' });
            log('✓ Test watch stopped', 'green');

            results.gmailWatch.passed = true;

        } catch (watchError) {
            log(`⚠ Watch test failed: ${watchError.message}`, 'yellow');

            if (watchError.code === 403) {
                log('  → Gmail API may not be enabled', 'yellow');
                log('  → Enable at: https://console.cloud.google.com/apis/library/gmail.googleapis.com', 'blue');
            } else if (watchError.message.includes('invalid scope')) {
                log('  → OAuth scopes may be insufficient', 'yellow');
                log('  → Required scope: gmail.modify (includes watch capability)', 'blue');
            } else if (watchError.message.includes('topicName')) {
                log('  → Pub/Sub topic may not exist or be accessible', 'yellow');
                log('  → Create topic in Google Cloud Console:', 'blue');
                log(`     https://console.cloud.google.com/cloudpubsub/topic/list?project=${process.env.GOOGLE_PROJECT_ID}`, 'cyan');
            }

            results.gmailWatch.details.error = watchError.message;
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
 * Step 3: Test Local Webhook Endpoint (if server is running)
 */
function testLocalWebhook() {
    logSubsection('Local Webhook Endpoint');

    const port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080;

    log(`Testing localhost:${port}/gmail-push`, 'cyan');

    return new Promise((resolve) => {
        // Test GET endpoint (verification)
        http.get({
            hostname: 'localhost',
            port: port,
            path: '/gmail-push?x-goog-channel-token=test',
            timeout: 3000
        }, (res) => {
            log(`✓ Webhook server is running`, 'green');
            log(`  GET /gmail-push → ${res.statusCode}`, 'blue');

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data) log(`  Response: ${data.substring(0, 100)}`, 'blue');

                // Test POST endpoint
                testPostEndpoint(port, resolve);
            });
        }).on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                log(`⚠ Webhook server not running on port ${port}`, 'yellow');
                log('  → Start your RAG endpoint: npm start', 'blue');
                results.localWebhook.details.serverNotRunning = true;
            } else {
                log(`✗ GET request failed: ${error.message}`, 'red');
                results.localWebhook.details.getError = error.message;
            }

            // Still try POST
            testPostEndpoint(port, resolve);
        });
    });
}

function testPostEndpoint(port, callback) {
    const testData = JSON.stringify({
        message: {
            userId: 'test',
            historyId: '12345'
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
        log(`✓ POST /gmail-push → ${res.statusCode}`, 'green');

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (data) log(`  Response: ${data.substring(0, 100)}`, 'blue');

            results.localWebhook.passed = true;
            results.localWebhook.details.postSuccess = true;
            callback(true);
        });
    }).on('error', (error) => {
        if (!results.localWebhook.details.serverNotRunning) {
            log(`✗ POST request failed: ${error.message}`, 'red');
            results.localWebhook.details.postError = error.message;
        }
        callback(false);
    });

    req.write(testData);
    req.end();
}

/**
 * Step 4: Generate Pub/Sub Manual Verification Instructions
 */
function generatePubSubInstructions() {
    logSubsection('Pub/Sub Resources - Manual Verification Required');

    log('\n⚠ Pub/Sub API requires Google Cloud credentials (not available)', 'yellow');
    log('Please verify the following manually in Google Cloud Console:\n', 'blue');

    const project = process.env.GOOGLE_PROJECT_ID;
    const topicName = process.env.GOOGLE_PUBSUB_TOPIC_NAME.split('/').pop();
    const subscriptionName = 'gmail-push-subscription';
    const webhookUrl = process.env.GMAIL_PUSH_WEBHOOK_URL;

    log('1. PUB/SUB TOPIC', 'cyan');
    log(`   Name: ${topicName}`, 'blue');
    log(`   Console: https://console.cloud.google.com/cloudpubsub/topic/detail/${topicName}?project=${project}`, 'white');
    log(`   Expected: Topic should exist and be accessible`, 'green');

    log('\n2. PUB/SUB SUBSCRIPTION', 'cyan');
    log(`   Name: ${subscriptionName}`, 'blue');
    log(`   Console: https://console.cloud.google.com/cloudpubsub/subscription/detail/${subscriptionName}?project=${project}`, 'white');
    log(`   Expected: Push endpoint should be set to:`, 'green');
    log(`     ${webhookUrl}`, 'cyan');

    log('\n3. WEBHOOK VERIFICATION', 'cyan');
    log(`   Google will verify your webhook URL during subscription setup`, 'blue');
    log(`   Your server must respond with HTTP 200 to GET requests at:`, 'green');
    log(`     ${webhookUrl}?x-goog-channel-token=<token>`, 'cyan');

    log('\n4. IAM PERMISSIONS (if using service account)', 'cyan');
    log('   Required roles:', 'blue');
    log('     - Pub/Sub Publisher', 'white');
    log('     - Pub/Sub Subscriber', 'white');
    log(`   Console: https://console.cloud.google.com/iam-admin/iam?project=${project}`, 'white');

    results.pubsubManual.verified = false;
}

/**
 * Step 5: Generate Final Summary and Next Steps
 */
function generateSummary() {
    logSection('TEST SUMMARY');

    const tests = [
        { name: 'Environment Variables', passed: results.environment.passed, critical: true },
        { name: 'OAuth Credentials', passed: results.oauth.passed, critical: true },
        { name: 'Gmail Watch Capability', passed: results.gmailWatch.passed, critical: true },
        { name: 'Local Webhook Endpoint', passed: results.localWebhook.passed, critical: false },
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

    // Pub/Sub is manual, so we note it separately
    log(`ℹ Pub/Sub Resources: Manual verification required`, 'yellow');

    log('\n' + '='.repeat(70), 'cyan');
    log(`Automated Tests: ${totalPassed}/${tests.length} passed`, totalPassed === tests.length ? 'green' : 'yellow');
    log('='.repeat(70) + '\n', 'cyan');

    // Detailed results
    if (results.oauth.details.emailAddress) {
        logSubsection('OAuth Details');
        log(`Email: ${results.oauth.details.emailAddress}`, 'blue');
        log(`Messages: ${parseInt(results.oauth.details.messagesTotal).toLocaleString()}`, 'blue');
    }

    if (results.gmailWatch.details.historyId) {
        logSubsection('Gmail Watch Test');
        log(`✓ Watch capability confirmed`, 'green');
        log(`History ID: ${results.gmailWatch.details.historyId}`, 'blue');
        log(`Expiration: ${new Date(parseInt(results.gmailWatch.details.expiration)).toLocaleString()}`, 'blue');
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

        if (!results.gmailWatch.passed && results.gmailWatch.details.error) {
            log('\n3. Fix Gmail Watch issue:', 'yellow');
            log(`   → Error: ${results.gmailWatch.details.error}`, 'white');

            if (results.gmailWatch.details.error.includes('topicName')) {
                log('   → Create Pub/Sub topic in Google Cloud Console', 'white');
                log(`   → Topic name: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'cyan');
            }
        }

    } else if (totalPassed === tests.length) {
        logSection('ALL TESTS PASSED! 🎉');

        log('\nYour Gmail Push configuration is ready!', 'green');

        log('\nNext Steps:', 'blue');
        log('1. Verify Pub/Sub resources manually (see instructions above)', 'white');
        log('2. Start your RAG endpoint server:', 'white');
        log('   npm start', 'cyan');
        log('\n3. Expected output when running:', 'white');
        log('   [Gmail Push] ✓ Gmail watch active - History ID: xxxxx', 'green');
        log('   [Gmail Push] ✓ Webhook server listening on port 8080', 'green');

        log('\n4. Test the setup:', 'white');
        log('   a) Send email with [prompt] in subject to your Gmail address', 'cyan');
        log('   b) Watch logs for instant processing (1-2 seconds)', 'cyan');
        log('   c) Check that email appears in emails/ folder', 'cyan');

    } else {
        logSection('PARTIAL SUCCESS');

        log('\nNon-critical tests failed. You can proceed with limited functionality.', 'yellow');

        if (!results.localWebhook.passed && !results.localWebhook.details.serverNotRunning) {
            log('\nLocal webhook issues:', 'blue');
            log('  → This is expected when server is not running', 'white');
            log('  → Start server with: npm start', 'white');
        }

        log('\nTo proceed, fix the critical tests above first.', 'yellow');
    }

    // Additional recommendations
    logSubsection('Recommendations');

    const recommendations = [
        'Add yourself as test user in OAuth consent screen',
        'Monitor watch expiration (renews automatically 24h before expiry)',
        'Check Cloud Logging for webhook delivery errors',
        'Consider using ngrok for local testing: ngrok http 8080',
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
    logSection('Gmail Push Notifications - Simple Test');
    log(`Started: ${new Date().toLocaleString()}`, 'cyan');

    // Step 1: Environment Variables
    validateEnvironment();

    // Step 2: OAuth and Gmail API
    results.oauth.passed = await testOAuthAndGmail();

    // Step 3: Local Webhook (if server running)
    if (results.oauth.passed) {
        results.localWebhook.passed = await testLocalWebhook();
    } else {
        log('\n⏭ Skipping webhook test (OAuth failed)', 'yellow');
    }

    // Step 4: Pub/Sub Manual Instructions
    generatePubSubInstructions();

    // Step 5: Summary
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
