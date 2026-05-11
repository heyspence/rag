/**
 * IMAP Connection Test Script (No SSL Verification)
 *
 * This script tests your IMAP configuration with relaxed SSL verification
 * to diagnose certificate-related connection issues.
 *
 * Usage:
 *   node test_imap_no_ssl_verify.js
 *
 * WARNING: This disables SSL certificate verification for testing only.
 * Do NOT use this in production code - always verify certificates properly!
 */

require('dotenv').config();
const imap = require('imap-simple');
const tls = require('tls');

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
    connection: { passed: false, error: null },
    authentication: { passed: false, error: null },
    folderAccess: { passed: false, folders: [], error: null },
    messageList: { passed: false, count: 0, error: null },
};

/**
 * Step 1: Validate Environment Variables
 */
function validateEnvironment() {
    logSubsection('Environment Variables');

    const requiredVars = [
        'IMAP_USER',
        'IMAP_PASSWORD'
    ];

    const optionalVars = [
        'IMAP_HOST',
        'IMAP_PORT',
        'IMAP_FOLDER'
    ];

    let allPresent = true;

    // Check required variables
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            // Mask sensitive values
            let displayValue = value;
            if (varName.includes('PASSWORD')) {
                displayValue = '*'.repeat(Math.min(value.length, 10)) + '...';
            } else if (varName.includes('USER') || varName.includes('EMAIL')) {
                // Show first few characters of email
                const parts = value.split('@');
                if (parts[0].length > 3) {
                    displayValue = parts[0].substring(0, 3) + '***@' + parts[1];
                } else {
                    displayValue = '***@' + parts[1];
                }
            }
            log(`✓ ${varName}: ${displayValue}`, 'green');
        } else {
            log(`✗ ${varName}: MISSING`, 'red');
            results.environment.errors.push(`${varName} is missing`);
            allPresent = false;
        }
    });

    // Check optional variables (with defaults)
    optionalVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            log(`✓ ${varName}: ${value}`, 'green');
        } else {
            // Show default that will be used
            let defaultValue;
            switch (varName) {
                case 'IMAP_HOST': defaultValue = 'imap.gmail.com'; break;
                case 'IMAP_PORT': defaultValue = '993'; break;
                case 'IMAP_FOLDER': defaultValue = 'INBOX'; break;
                default: defaultValue = 'N/A';
            }
            log(`ℹ ${varName}: (not set, will use default: ${defaultValue})`, 'yellow');
        }
    });

    results.environment.passed = allPresent;
    return allPresent;
}

/**
 * Step 2: Test IMAP Connection with Relaxed SSL
 */
async function testIMAPConnection() {
    logSubsection('IMAP Connection & Authentication (SSL Verification Disabled)');

    try {
        if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
            log('✗ Missing required credentials', 'red');
            return false;
        }

        // Build connection config with relaxed SSL
        const config = {
            imap: {
                user: process.env.IMAP_USER,
                password: process.env.IMAP_PASSWORD,
                host: process.env.IMAP_HOST || 'imap.gmail.com',
                port: parseInt(process.env.IMAP_PORT, 10) || 993,
                tls: true,
                tlsOptions: {
                    rejectUnauthorized: false // DISABLED FOR TESTING ONLY!
                },
                authTimeout: 10000, // 10 second timeout
            }
        };

        log(`Connecting to ${config.imap.host}:${config.imap.port}...`, 'cyan');
        log(`User: ${process.env.IMAP_USER}`, 'blue');
        log('⚠ SSL certificate verification DISABLED (testing only)', 'yellow');

        const connection = await imap.connect(config);

        results.connection.passed = true;
        results.authentication.passed = true;

        log('✓ Connection successful!', 'green');
        log('✓ Authentication successful!', 'green');

        return connection;

    } catch (error) {
        log(`✗ Connection failed: ${error.message}`, 'red');

        if (error.code === 'ECONNREFUSED') {
            results.connection.error = error.message;
            log('\n⚠ Connection Refused:', 'yellow');
            log('  → Check your firewall settings', 'blue');
            log('  → Verify IMAP is enabled in Gmail settings', 'blue');
        } else if (error.code === 'ETIMEDOUT') {
            results.connection.error = error.message;
            log('\n⚠ Connection Timed Out:', 'yellow');
            log('  → Check your internet connection', 'blue');
            log('  → Verify the IMAP host is correct', 'blue');
        } else if (error.message.includes('Invalid credentials') ||
                   error.message.includes('Authentication failed')) {
            results.authentication.error = error.message;
            log('\n⚠ Authentication Failed:', 'yellow');
            log('  → Check your username and password', 'blue');
            log('  → For Gmail, you need an App-Specific Password:', 'blue');
            log('    https://myaccount.google.com/apppasswords', 'cyan');
            log('  → Regular passwords do NOT work with IMAP for Gmail', 'yellow');
        } else if (error.message.includes('less secure apps')) {
            results.authentication.error = error.message;
            log('\n⚠ Less Secure Apps Error:', 'yellow');
            log('  → This is expected for Gmail', 'blue');
            log('  → You MUST use an App-Specific Password', 'blue');
        } else if (error.message.includes('self-signed certificate')) {
            results.connection.error = error.message;
            log('\n⚠ SSL Certificate Error:', 'yellow');
            log('  → This is a system CA certificate issue', 'blue');
            log('  → Try updating Node.js or installing ca-certificates', 'blue');
        } else {
            results.connection.error = error.message;
        }

        return null;
    }
}

/**
 * Step 3: Test Folder Access
 */
async function testFolderAccess(connection) {
    logSubsection('Folder Access Test');

    if (!connection) {
        log('⏭ Skipping (no connection)', 'yellow');
        return false;
    }

    try {
        const folders = await connection.getFolders();

        results.folderAccess.passed = true;
        results.folderAccess.folders = folders.map(f => f.name);

        log(`✓ Found ${folders.length} folder(s)`, 'green');

        // Show first 10 folders
        const displayFolders = folders.slice(0, 10).map(f => `  - ${f.name}`);
        if (folders.length > 10) {
            displayFolders.push(`  ... and ${folders.length - 10} more`);
        }
        log(displayFolders.join('\n'), 'blue');

        // Check for INBOX
        const inboxFolder = folders.find(f => f.name === 'INBOX' || f.name === '[Gmail]/Inbox');
        if (inboxFolder) {
            log('✓ INBOX folder found', 'green');
            return true;
        } else {
            log('⚠ INBOX not found in folder list', 'yellow');
            return false;
        }

    } catch (error) {
        log(`✗ Folder access failed: ${error.message}`, 'red');
        results.folderAccess.error = error.message;
        return false;
    }
}

/**
 * Step 4: Test Message Listing
 */
async function testMessageListing(connection, folderName = 'INBOX') {
    logSubsection('Message Listing Test');

    if (!connection) {
        log('⏭ Skipping (no connection)', 'yellow');
        return false;
    }

    try {
        // Try to open the inbox folder
        let inboxFolderName = 'INBOX';

        try {
            await connection.openBox(inboxFolderName);
        } catch (e) {
            // Try Gmail's INBOX path
            inboxFolderName = '[Gmail]/Inbox';
            await connection.openBox(inboxFolderName);
        }

        log(`✓ Opened folder: ${inboxFolderName}`, 'green');

        // Search for all messages
        const searchCriteria = ['ALL'];
        const fetchOptions = {
            bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'],
            markSeen: false,
        };

        const results = await connection.search(searchCriteria, fetchOptions);

        results.messageList.passed = true;
        results.messageList.count = results.length;

        log(`✓ Found ${results.length} message(s) in ${inboxFolderName}`, 'green');

        // Show last 5 messages (most recent first if available)
        if (results.length > 0) {
            const displayCount = Math.min(5, results.length);
            const startIndex = results.length - displayCount;

            log(`\nRecent messages (${displayCount} of ${results.length}):`, 'blue');

            for (let i = 0; i < displayCount; i++) {
                const result = results[startIndex + i];
                const headers = result.parts[0].body;

                if (headers) {
                    // Parse headers
                    const fromMatch = headers.match(/From: (.+)/i);
                    const subjectMatch = headers.match(/Subject: (.+)/i);
                    const dateMatch = headers.match(/Date: (.+)/i);

                    let messageInfo = `  ${i + 1}. `;
                    if (fromMatch) messageInfo += `From: ${fromMatch[1].trim()}`;
                    if (subjectMatch) messageInfo += ` | Subject: ${subjectMatch[1].trim()}`;
                    if (dateMatch) messageInfo += ` | Date: ${dateMatch[1].trim()}`;

                    log(messageInfo, 'cyan');
                }
            }
        }

        return true;

    } catch (error) {
        log(`✗ Message listing failed: ${error.message}`, 'red');
        results.messageList.error = error.message;

        if (error.message.includes('NO') && error.message.includes('[NONEXISTENT]')) {
            log('\n⚠ Folder does not exist:', 'yellow');
            log(`  → Tried to open: ${folderName}`, 'blue');
            log('  → Check your Gmail folder structure', 'blue');
        }

        return false;
    }
}

/**
 * Step 5: Test IDLE Capability (Important for Real-Time Updates)
 */
async function testIDLECapability(connection) {
    logSubsection('IMAP IDLE Capability Test');

    if (!connection) {
        log('⏭ Skipping (no connection)', 'yellow');
        return false;
    }

    try {
        // Check if server supports IDLE
        const capabilities = connection.server.capabilities;

        if (capabilities && capabilities.includes('IDLE')) {
            results.idleSupport = true;
            log('✓ Server supports IMAP IDLE', 'green');
            log('  → Real-time email notifications will work!', 'blue');
            return true;
        } else {
            results.idleSupport = false;
            log('⚠ Server does not support IMAP IDLE', 'yellow');
            log('  → You will need to poll for new emails instead', 'blue');
            return false;
        }

    } catch (error) {
        log(`✗ IDLE capability check failed: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Step 6: Generate Final Summary
 */
function generateSummary() {
    logSection('TEST SUMMARY');

    const tests = [
        { name: 'Environment Variables', passed: results.environment.passed, critical: true },
        { name: 'IMAP Connection', passed: results.connection.passed, critical: true },
        { name: 'Authentication', passed: results.authentication.passed, critical: true },
        { name: 'Folder Access', passed: results.folderAccess.passed, critical: false },
        { name: 'Message Listing', passed: results.messageList.passed, critical: false },
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

    // Detailed error information
    if (results.environment.errors.length > 0) {
        logSubsection('Environment Errors');
        results.environment.errors.forEach(error => {
            log(`  - ${error}`, 'red');
        });
    }

    if (results.connection.error) {
        logSubsection('Connection Error Details');
        log(results.connection.error, 'yellow');
    }

    // Next steps based on results
    if (criticalFailed) {
        logSection('CRITICAL ISSUES TO FIX');

        if (!results.environment.passed) {
            log('\n1. Fix environment variables:', 'yellow');
            log('   → Add IMAP_USER and IMAP_PASSWORD to .env file', 'white');
        }

        if (!results.authentication.passed) {
            log('\n2. Fix authentication:', 'yellow');
            log('   → For Gmail, generate an App-Specific Password:', 'white');
            log('     https://myaccount.google.com/apppasswords', 'cyan');
            log('   → Regular passwords do NOT work with IMAP for Gmail!', 'red');
        }

        if (!results.connection.passed) {
            log('\n3. Fix connection issues:', 'yellow');
            log('   → Check your internet connection', 'white');
            log('   → Verify firewall allows outbound connections on port 993', 'white');
            log('   → Ensure IMAP is enabled in Gmail settings:', 'white');
            log('     https://mail.google.com/mail/u/0/#settings/fwdandpop', 'cyan');
        }

    } else if (totalPassed === tests.length) {
        logSection('ALL TESTS PASSED! 🎉');

        log('\nYour IMAP configuration is fully working!', 'green');

        log('\n⚠ IMPORTANT: SSL verification was disabled for this test', 'yellow');
        log('   For production, fix the CA certificate issue instead:', 'white');
        log('   1. Update Node.js to latest version', 'blue');
        log('   2. Install/update ca-certificates package', 'blue');
        log('   3. Set NODE_EXTRA_CA_CERTS if using custom certs', 'blue');

        log('\nNext Steps:', 'blue');
        log('1. Start your RAG server: npm start', 'white');
        log('2. The server will automatically monitor for new emails', 'white');
        log('3. Send a test email with [prompt] in the subject line', 'cyan');
        log('4. Watch for instant processing in the logs!', 'white');

    } else {
        logSection('PARTIAL SUCCESS');
        log('\nTo proceed, fix the critical tests above first.', 'yellow');
    }

    // Additional recommendations
    logSubsection('Recommendations');

    const recommendations = [
        'Enable IMAP in Gmail settings if not already enabled',
        'Use App-Specific Password for Gmail (not regular password)',
        'Keep your RAG server running to receive emails continuously',
        'Monitor server logs for any connection issues',
        'Consider using Gmail Push notifications for lower latency',
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
    logSection('IMAP Connection Test (No SSL Verification)');
    log(`Started: ${new Date().toLocaleString()}`, 'cyan');

    // Step 1: Environment Variables
    validateEnvironment();

    // Step 2: IMAP Connection & Authentication with relaxed SSL
    const connection = await testIMAPConnection();

    // Step 3: Folder Access (if connected)
    if (connection) {
        await testFolderAccess(connection);

        // Step 4: Message Listing (if folder access works)
        if (results.folderAccess.passed) {
            await testMessageListing(connection);
        }

        // Step 5: IDLE Capability Check
        await testIDLECapability(connection);

        // Close connection
        logSubsection('Closing Connection');
        try {
            await connection.end();
            log('✓ Connection closed successfully', 'green');
        } catch (error) {
            log(`⚠ Error closing connection: ${error.message}`, 'yellow');
        }
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
