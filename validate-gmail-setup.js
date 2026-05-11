/**
 * Gmail Push Configuration Validator
 *
 * This script validates your Gmail Push setup before running the main application.
 * It checks environment variables, OAuth credentials, and API connectivity.
 *
 * Usage:
 *   node validate-gmail-setup.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const http = require('http');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    log('\n' + '='.repeat(60), 'cyan');
    log(`  ${title}`, 'cyan');
    log('='.repeat(60), 'cyan');
}

function checkEnvVariable(name, required = true) {
    const value = process.env[name];
    if (value) {
        // Mask sensitive values for security
        let displayValue = value;
        if (name.includes('SECRET') || name.includes('TOKEN')) {
            displayValue = value.substring(0, 15) + '...' +
                          (value.length > 20 ? '***' : '');
        }
        log(`✓ ${name}: ${displayValue}`, 'green');
        return true;
    } else {
        if (required) {
            log(`✗ ${name}: MISSING (required)`, 'red');
        } else {
            log(`⚠ ${name}: NOT SET (optional)`, 'yellow');
        }
        return false;
    }
}

async function validateOAuthCredentials() {
    log('\n🔐 Testing OAuth Credentials...');

    try {
        if (!process.env.GOOGLE_CLIENT_ID ||
            !process.env.GOOGLE_CLIENT_SECRET ||
            !process.env.GOOGLE_REFRESH_TOKEN) {
            log('⚠ Cannot test OAuth - missing credentials', 'yellow');
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

        // Test by getting user info
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });

        log(`✓ OAuth credentials valid`, 'green');
        log(`  Gmail address: ${profile.data.emailAddress}`, 'blue');
        log(`  Total messages: ${profile.data.messagesTotal}`, 'blue');
        return true;
    } catch (error) {
        log(`✗ OAuth test failed: ${error.message}`, 'red');

        if (error.code === 403) {
            log('  → Gmail API may not be enabled in Google Cloud Console', 'yellow');
            log('  → Visit: https://console.cloud.google.com/apis/library/gmail.googleapis.com', 'yellow');
        } else if (error.message.includes('invalid_grant')) {
            log('  → Refresh token may be invalid or expired', 'yellow');
            log('  → Run: node get-gmail-refresh-token.js to get a new one', 'yellow');
        } else if (error.message.includes('redirect_uri_mismatch')) {
            log('  → Redirect URI not configured in OAuth client', 'yellow');
            log('  → Add this to your OAuth client:', 'yellow');
            log('    http://localhost:8081/oauth2callback', 'yellow');
        }

        return false;
    }
}

async function validatePubSubTopic() {
    log('\n☁️  Testing Pub/Sub Configuration...');

    try {
        if (!process.env.GOOGLE_PUBSUB_TOPIC_NAME) {
            log('✗ GOOGLE_PUBSUB_TOPIC_NAME not set', 'red');
            return false;
        }

        const pubsub = new PubSub({
            projectId: process.env.GOOGLE_PROJECT_ID
        });

        // Check if topic exists
        const [topicExists] = await pubsub
            .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
            .exists();

        if (topicExists) {
            log(`✓ Pub/Sub topic exists`, 'green');
            log(`  Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'blue');

            // Check for subscriptions
            const [subscriptions] = await pubsub
                .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
                .getSubscriptions();

            if (subscriptions.length > 0) {
                log(`✓ Found ${subscriptions.length} subscription(s)`, 'green');
                subscriptions.forEach(sub => {
                    const subName = sub.name.split('/').pop();
                    log(`  - ${subName}`, 'blue');
                });
            } else {
                log('⚠ No subscriptions found for this topic', 'yellow');
                log('  → Create one in Google Cloud Console:', 'yellow');
                log('    https://console.cloud.google.com/cloudpubsub/subscription/list', 'yellow');
            }

            return true;
        } else {
            log(`✗ Pub/Sub topic does not exist`, 'red');
            log(`  Topic: ${process.env.GOOGLE_PUBSUB_TOPIC_NAME}`, 'blue');
            log('  → Create it in Google Cloud Console:', 'yellow');
            log('    https://console.cloud.google.com/cloudpubsub/topic/list', 'yellow');
            return false;
        }
    } catch (error) {
        log(`✗ Pub/Sub test failed: ${error.message}`, 'red');

        if (error.code === 403 || error.message.includes('Permission')) {
            log('  → Service account may lack Pub/Sub permissions', 'yellow');
            log('  → Grant these roles in IAM:', 'yellow');
            log('    - Pub/Sub Publisher', 'yellow');
            log('    - Pub/Sub Subscriber', 'yellow');
        } else if (error.code === 404) {
            log('  → Project ID may be incorrect', 'yellow');
        }

        return false;
    }
}

function validateWebhookConfiguration() {
    log('\n🔗 Validating Webhook Configuration...');

    let valid = true;

    // Check webhook port
    const port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080;
    if (process.env.GMAIL_PUSH_WEBHOOK_PORT) {
        log(`✓ GMAIL_PUSH_WEBHOOK_PORT: ${port}`, 'green');
    } else {
        log('⚠ GMAIL_PUSH_WEBHOOK_PORT not set, using default: 8080', 'yellow');
    }

    // Check webhook URL
    if (process.env.GMAIL_PUSH_WEBHOOK_URL) {
        log(`✓ GMAIL_PUSH_WEBHOOK_URL: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`, 'green');

        // Validate URL format
        try {
            const url = new URL(process.env.GMAIL_PUSH_WEBHOOK_URL);

            if (url.protocol !== 'https:') {
                log('⚠ Webhook URL should use HTTPS for production', 'yellow');
            }

            if (!url.pathname.includes('/gmail-push')) {
                log('⚠ Webhook URL should end with /gmail-push', 'yellow');
            }
        } catch (error) {
            log(`✗ Invalid webhook URL format: ${error.message}`, 'red');
            valid = false;
        }
    } else {
        log('✗ GMAIL_PUSH_WEBHOOK_URL not set', 'red');
        valid = false;
    }

    return valid;
}

async function testLocalWebhookEndpoint() {
    log('\n🧪 Testing Local Webhook Endpoint...');

    const port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080;

    return new Promise((resolve) => {
        // Try to connect to the webhook endpoint
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/gmail-push',
            method: 'GET',
            timeout: 3000
        }, (res) => {
            log(`✓ Webhook endpoint responding on port ${port}`, 'green');
            log(`  Status: ${res.statusCode}`, 'blue');
            resolve(true);
        });

        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                log(`⚠ Webhook server not running on port ${port}`, 'yellow');
                log('  → Start your RAG endpoint: npm start', 'yellow');
                resolve(false);
            } else {
                log(`✗ Webhook test error: ${error.message}`, 'red');
                resolve(false);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            log(`⚠ Webhook endpoint timeout on port ${port}`, 'yellow');
            resolve(false);
        });

        req.end();
    });
}

function generateSummary(results) {
    logSection('VALIDATION SUMMARY');

    const allChecks = [
        { name: 'Environment Variables', passed: results.env },
        { name: 'OAuth Credentials', passed: results.oauth },
        { name: 'Pub/Sub Configuration', passed: results.pubsub },
        { name: 'Webhook Configuration', passed: results.webhook },
    ];

    let totalPassed = 0;

    allChecks.forEach(check => {
        const status = check.passed ? '✓ PASS' : '✗ FAIL';
        const color = check.passed ? 'green' : 'red';
        log(`${status}: ${check.name}`, color);
        if (check.passed) totalPassed++;
    });

    log('\n' + '-'.repeat(60), 'cyan');
    log(`Total: ${totalPassed}/${allChecks.length} checks passed`, totalPassed === allChecks.length ? 'green' : 'yellow');
    log('='.repeat(60) + '\n', 'cyan');

    if (totalPassed === allChecks.length) {
        log('🎉 All validations passed! Your Gmail Push setup is ready.', 'green');
        log('\nNext steps:', 'blue');
        log('  1. Start your server: npm start', 'blue');
        log('  2. Send a test email with [prompt] in the subject', 'blue');
        log('  3. Watch for instant processing in the logs!', 'blue');
    } else {
        log('⚠ Some validations failed. Please fix the issues above.', 'yellow');
        log('\nQuick fixes:', 'blue');

        if (!results.env) {
            log('  → Add missing environment variables to .env file', 'blue');
        }
        if (!results.oauth) {
            log('  → Run: node get-gmail-refresh-token.js', 'blue');
        }
        if (!results.pubsub) {
            log('  → Create Pub/Sub topic in Google Cloud Console', 'blue');
        }
        if (!results.webhook) {
            log('  → Add GMAIL_PUSH_WEBHOOK_URL to .env file', 'blue');
        }
    }
}

async function main() {
    logSection('Gmail Push Configuration Validator');

    const results = {
        env: false,
        oauth: false,
        pubsub: false,
        webhook: false
    };

    // Step 1: Check environment variables
    logSection('Environment Variables');

    const requiredVars = [
        'GOOGLE_PROJECT_ID',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REFRESH_TOKEN',
        'GOOGLE_PUBSUB_TOPIC_NAME'
    ];

    let allEnvPresent = true;
    requiredVars.forEach(varName => {
        if (!checkEnvVariable(varName, true)) {
            allEnvPresent = false;
        }
    });

    results.env = allEnvPresent;

    // Step 2: Validate OAuth credentials
    results.oauth = await validateOAuthCredentials();

    // Step 3: Validate Pub/Sub configuration
    results.pubsub = await validatePubSubTopic();

    // Step 4: Validate webhook configuration
    results.webhook = validateWebhookConfiguration();

    // Step 5: Test local webhook endpoint (optional)
    try {
        await testLocalWebhookEndpoint();
    } catch (error) {
        log(`⚠ Could not test webhook endpoint: ${error.message}`, 'yellow');
    }

    // Generate summary
    generateSummary(results);

    return results;
}

// Run validation if this script is executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            log(`\n✗ Validation failed with error: ${error.message}`, 'red');
            console.error(error);
            process.exit(1);
        });
}

module.exports = { validateGmailSetup: main };
