/**
 * Email Service - AWS SES Integration
 *
 * Provides email sending functionality using Amazon Simple Email Service (SES).
 * Supports both single and bulk email sending with optional default recipient feature.
 *
 * Configuration required in .env file:
 *   AWS_ACCESS_KEY_ID=your_access_key_id
 *   AWS_SECRET_ACCESS_KEY=your_secret_access_key
 *   AWS_REGION=us-east-2
 *   FROM_EMAIL=noreply@bookservo.com
 *   DEFAULT_EMAIL_RECIPIENT=recipient@example.com (optional)
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

/**
 * Email configuration loaded from environment variables
 */
const EMAIL_CONFIG = {
    REGION: process.env.AWS_REGION || process.env.WS_REGION || 'us-east-2',
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL || process.env.AWS_FROM_EMAIL || 'noreply@bookservo.com',
    DEFAULT_RECIPIENT: process.env.DEFAULT_EMAIL_RECIPIENT,
};

/**
 * Create and configure an SES client with explicit credentials
 * @returns {SESClient} Configured SES client
 */
function createSESClient() {
    console.log('[Email Service] Loading credentials from environment...');

    // Validate that required credentials are present
    if (!EMAIL_CONFIG.ACCESS_KEY_ID) {
        throw new Error(
            'AWS_ACCESS_KEY_ID not found in environment variables. Please check your .env file.'
        );
    }

    if (!EMAIL_CONFIG.SECRET_ACCESS_KEY) {
        throw new Error(
            'AWS_SECRET_ACCESS_KEY not found in environment variables. Please check your .env file.'
        );
    }

    console.log('[Email Service] AWS_ACCESS_KEY_ID present: true');
    console.log('[Email Service] AWS_SECRET_ACCESS_KEY present: true');
    console.log('[Email Service] AWS_REGION/WS_REGION:', EMAIL_CONFIG.REGION);

    // Check for SMTP credentials (common mistake - these are NOT used for SES API)
    if (process.env.AWS_USERNAME && process.env.AWS_PASSWORD) {
        console.warn(
            '[Email Service] WARNING: SMTP credentials detected in .env (AWS_USERNAME/AWS_PASSWORD)'
        );
        console.warn('[Email Service] These are NOT being used - only API credentials are valid for SESClient');
    }

    console.log('[Email Service] EMAIL_CONFIG loaded:');
    console.log('[Email Service]   REGION:', EMAIL_CONFIG.REGION);
    console.log('[Email Service]   ACCESS_KEY_ID:', `${EMAIL_CONFIG.ACCESS_KEY_ID.substring(0, 8)}...`);
    console.log('[Email Service]   SECRET_ACCESS_KEY: [REDACTED]');

    const sesClient = new SESClient({
        region: EMAIL_CONFIG.REGION,
        credentials: {
            accessKeyId: EMAIL_CONFIG.ACCESS_KEY_ID,
            secretAccessKey: EMAIL_CONFIG.SECRET_ACCESS_KEY,
        },
    });

    console.log('[Email Service] Creating SES client with explicit credentials...');
    console.log('[Email Service]   Access Key ID (first 8 chars):', `${EMAIL_CONFIG.ACCESS_KEY_ID.substring(0, 8)}...`);
    console.log('[Email Service]   Region:', EMAIL_CONFIG.REGION);
    console.log('[Email Service] SES client created successfully');

    return sesClient;
}

/**
 * Send a single email via AWS SES
 * @param {Object} params - Email parameters
 * @param {string|string[]} [params.to] - Recipient email address(es). If not provided, uses DEFAULT_EMAIL_RECIPIENT.
 * @param {string} params.subject - Email subject line
 * @param {string} params.body - Plain text content of the email
 * @param {string} [params.htmlBody=null] - Optional HTML content for rich formatting
 * @param {string} [params.from=EMAIL_CONFIG.FROM_EMAIL] - Sender email address
 * @returns {Promise<Object>} - SES send result with messageId and recipient info
 */
async function sendEmail({ to, subject, body, htmlBody = null, from = EMAIL_CONFIG.FROM_EMAIL }) {
    // Use default recipient if no 'to' is provided and a default is configured
    const recipients =
        to ||
        (EMAIL_CONFIG.DEFAULT_RECIPIENT
            ? [EMAIL_CONFIG.DEFAULT_RECIPIENT]
            : []);

    // Validate that we have at least one recipient
    if (!recipients || recipients.length === 0) {
        throw new Error(
            "No recipient specified. Please provide a 'to' parameter or set DEFAULT_EMAIL_RECIPIENT in .env",
        );
    }

    try {
        console.log('\n[Email Service] ========================================');
        console.log('[Email Service] SEND EMAIL REQUEST');
        console.log('[Email Service] ========================================');

        // Validate credentials before attempting to send
        if (!EMAIL_CONFIG.ACCESS_KEY_ID || !EMAIL_CONFIG.SECRET_ACCESS_KEY) {
            throw new Error(
                "AWS credentials not configured. Please check your .env file for AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
            );
        }

        console.log('[Email Service] Using region:', EMAIL_CONFIG.REGION);
        console.log('[Email Service] From address:', from);
        console.log(
            '[Email Service] To:',
            Array.isArray(recipients) ? recipients.join(', ') : recipients,
        );
        console.log('[Email Service] Subject:', subject);
        console.log('[Email Service] Credentials source: .env file only');
        console.log(
            '[Email Service] Access Key ID (first 8):',
            EMAIL_CONFIG.ACCESS_KEY_ID.substring(0, 8),
        );

        // Create fresh SES client for each request to avoid credential caching
        const sesClient = createSESClient();

        // Use the validated recipients array (already handles default fallback)
        const destination = Array.isArray(recipients) ? recipients : [recipients];

        // Build the email command
        const sendCommand = new SendEmailCommand({
            Source: from,
            Destination: {
                ToAddresses: destination,
            },
            Message: {
                Subject: {
                    Data: subject,
                    Charset: 'UTF-8',
                },
                Body: {
                    Text: {
                        Data: body,
                        Charset: 'UTF-8',
                    },
                    ...(htmlBody && {
                        Html: {
                            Data: htmlBody,
                            Charset: 'UTF-8',
                        },
                    }),
                },
            },
        });

        const result = await sesClient.send(sendCommand);

        return {
            success: true,
            messageId: result.MessageId,
            to: destination,
            from,
            subject,
        };
    } catch (error) {
        console.error('\n[Email Service] ========================================');
        console.error('[Email Service] SEND EMAIL FAILED');
        console.error('[Email Service] ========================================');
        console.error('[Email Service] Error sending email:', error.message);
        console.error(
            '[Email Service] HTTP Status Code:',
            error.$metadata?.httpStatusCode,
        );

        // Provide helpful troubleshooting information
        if (
            error.message.includes('The security token included in the request is invalid')
        ) {
            console.error('\n[Email Service] Troubleshooting "SecurityTokenInvalid":');
            console.error("- Verify AWS_ACCESS_KEY_ID starts with 'AKIA' (not SMTP username)");
            console.error('- Check that AWS_SECRET_ACCESS_KEY matches the access key ID');
            console.error('- Ensure you are using API credentials, NOT SMTP credentials');
        }

        if (
            error.message.includes('NotAuthorizedException') ||
            error.message.includes('MessageRejected')
        ) {
            console.error('\n[Email Service] SES Authorization Error:');
            console.error('- Verify sender email is confirmed in AWS SES');
            console.error('- If in SES Sandbox, verify recipient emails too');
        }

        if (error.message.includes('InvalidClientTokenId')) {
            console.error('\n[Email Service] Invalid Client Token:');
            console.error('- The AWS_ACCESS_KEY_ID does not exist or is invalid');
        }

        if (error.message.includes('SignatureDoesNotMatch')) {
            console.error('\n[Email Service] Signature Mismatch:');
            console.error('- The AWS_SECRET_ACCESS_KEY does not match the access key ID');
        }

        throw new Error(`Failed to send email: ${error.message}`);
    } finally {
        console.log('[Email Service] ========================================\n');
    }
}

/**
 * Send bulk emails to multiple recipients with the same content
 * @param {Object} params - Bulk email parameters
 * @param {string[]} params.recipients - Array of recipient email addresses
 * @param {string} params.subject - Email subject line
 * @param {string} params.body - Plain text content of the email
 * @param {string} [params.htmlBody=null] - Optional HTML content for rich formatting
 * @returns {Promise<Object>} - Results for each recipient with status and messageId/error
 */
async function sendBulkEmail({ recipients, subject, body, htmlBody = null }) {
    const results = [];

    for (const recipient of recipients) {
        try {
            const result = await sendEmail({
                to: recipient,
                subject,
                body,
                htmlBody,
            });
            results.push({
                recipient,
                status: 'sent',
                messageId: result.messageId,
            });
        } catch (error) {
            results.push({
                recipient,
                status: 'failed',
                error: error.message,
            });
        }
    }

    return {
        total: recipients.length,
        successful: results.filter((r) => r.status === 'sent').length,
        failed: results.filter((r) => r.status === 'failed').length,
        results,
    };
}

/**
 * Validate email address format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Get the current configuration status of the email service
 * @returns {Object} - Configuration status including region, from email, and credential status
 */
function getServiceStatus() {
    const hasAccessKey = !!EMAIL_CONFIG.ACCESS_KEY_ID;
    const hasSecretKey = !!EMAIL_CONFIG.SECRET_ACCESS_KEY;

    return {
        configured: hasAccessKey && hasSecretKey,
        region: EMAIL_CONFIG.REGION,
        fromEmail: EMAIL_CONFIG.FROM_EMAIL,
        defaultRecipient: EMAIL_CONFIG.DEFAULT_RECIPIENT || 'Not set',
        credentialsStatus: {
            accessKeyId: hasAccessKey ? 'Set' : 'Missing',
            secretAccessKey: hasSecretKey ? 'Set' : 'Missing',
        },
    };
}

module.exports = {
    sendEmail,
    sendBulkEmail,
    isValidEmail,
    getServiceStatus,
};
