/**
 * Email Service - AWS SES Integration
 *
 * Provides email sending functionality using Amazon Simple Email Service (SES).
 * Supports both single and bulk email sending with optional default recipient feature.
 *
 * IMPORTANT: ALL emails MUST be sent as styled HTML documents for professional formatting.
 * Use generateStyledHTML() or generateSimpleHTML() helper functions to create properly
 * formatted HTML content before calling sendEmail().
 *
 * Configuration required in .env file:
 *   AWS_ACCESS_KEY_ID=your_access_key_id
 *   AWS_SECRET_ACCESS_KEY=your_secret_access_key
 *   AWS_REGION=us-east-2
 *   FROM_EMAIL=Sender Name <email@domain.com>  (e.g., "My App <noreply@bookservo.com>")
 *   DEFAULT_EMAIL_RECIPIENT=recipient@example.com (optional)
 */

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

/**
 * Email configuration loaded from environment variables
 */
const EMAIL_CONFIG = {
    REGION: process.env.AWS_REGION || process.env.WS_REGION || "us-east-2",
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    // FROM_EMAIL format: "Display Name <email@domain.com>" or just "email@domain.com"
    FROM_EMAIL: process.env.FROM_EMAIL || "contact@bookservo.com",
    DEFAULT_RECIPIENT: process.env.DEFAULT_EMAIL_RECIPIENT,
};

/**
 * Create and configure an SES client with explicit credentials
 * @returns {SESClient} Configured SES client
 */
function createSESClient() {
    console.log("[Email Service] Loading credentials from environment...");

    // Validate that required credentials are present
    if (!EMAIL_CONFIG.ACCESS_KEY_ID) {
        throw new Error(
            "AWS_ACCESS_KEY_ID not found in environment variables. Please check your .env file.",
        );
    }

    if (!EMAIL_CONFIG.SECRET_ACCESS_KEY) {
        throw new Error(
            "AWS_SECRET_ACCESS_KEY not found in environment variables. Please check your .env file.",
        );
    }

    console.log("[Email Service] AWS_ACCESS_KEY_ID present: true");
    console.log("[Email Service] AWS_SECRET_ACCESS_KEY present: true");
    console.log("[Email Service] AWS_REGION/WS_REGION:", EMAIL_CONFIG.REGION);

    // Check for SMTP credentials (common mistake - these are NOT used for SES API)
    if (process.env.AWS_USERNAME && process.env.AWS_PASSWORD) {
        console.warn(
            "[Email Service] WARNING: SMTP credentials detected in .env (AWS_USERNAME/AWS_PASSWORD)",
        );
        console.warn(
            "[Email Service] These are NOT being used - only API credentials are valid for SESClient",
        );
    }

    console.log("[Email Service] EMAIL_CONFIG loaded:");
    console.log("[Email Service]   REGION:", EMAIL_CONFIG.REGION);
    console.log(
        "[Email Service]   ACCESS_KEY_ID:",
        `${EMAIL_CONFIG.ACCESS_KEY_ID.substring(0, 8)}...`,
    );
    console.log("[Email Service]   SECRET_ACCESS_KEY: [REDACTED]");

    const sesClient = new SESClient({
        region: EMAIL_CONFIG.REGION,
        credentials: {
            accessKeyId: EMAIL_CONFIG.ACCESS_KEY_ID,
            secretAccessKey: EMAIL_CONFIG.SECRET_ACCESS_KEY,
        },
    });

    console.log(
        "[Email Service] Creating SES client with explicit credentials...",
    );
    console.log(
        "[Email Service]   Access Key ID (first 8 chars):",
        `${EMAIL_CONFIG.ACCESS_KEY_ID.substring(0, 8)}...`,
    );
    console.log("[Email Service]   Region:", EMAIL_CONFIG.REGION);
    console.log("[Email Service] SES client created successfully");

    return sesClient;
}

/**
 * Send a single email via AWS SES
 * @param {Object} params - Email parameters
 * @param {string|string[]} [params.to] - Recipient email address(es). If not provided, uses DEFAULT_EMAIL_RECIPIENT.
 * @param {string} params.subject - Email subject line
 * @param {string} params.body - Plain text fallback content (required, but htmlBody is preferred)
 * @param {string} params.htmlBody - REQUIRED: Styled HTML content for professional email formatting. Use generateStyledHTML() or generateSimpleHTML() helper functions.
 * @param {string} [params.from=EMAIL_CONFIG.FROM_EMAIL] - Sender email (format: "Name <email@domain.com>" or just "email@domain.com"). Will use default FROM_EMAIL if not provided.
 * @returns {Promise<Object>} - SES send result with messageId and recipient info
 */
async function sendEmail({ to, subject, body, htmlBody = null, from }) {
    // Use configured default FROM_EMAIL if not provided
    const senderFrom = from || EMAIL_CONFIG.FROM_EMAIL;
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
        console.log(
            "\n[Email Service] ========================================",
        );
        console.log("[Email Service] SEND EMAIL REQUEST");
        console.log("[Email Service] ========================================");

        // Validate credentials before attempting to send
        if (!EMAIL_CONFIG.ACCESS_KEY_ID || !EMAIL_CONFIG.SECRET_ACCESS_KEY) {
            throw new Error(
                "AWS credentials not configured. Please check your .env file for AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
            );
        }

        console.log("[Email Service] Using region:", EMAIL_CONFIG.REGION);
        console.log("[Email Service] From address:", senderFrom);
        console.log(
            "[Email Service] To:",
            Array.isArray(recipients) ? recipients.join(", ") : recipients,
        );
        console.log("[Email Service] Subject:", subject);
        console.log("[Email Service] Credentials source: .env file only");
        console.log(
            "[Email Service] Access Key ID (first 8):",
            EMAIL_CONFIG.ACCESS_KEY_ID.substring(0, 8),
        );

        // Create fresh SES client for each request to avoid credential caching
        const sesClient = createSESClient();

        // Use the validated recipients array (already handles default fallback)
        const destination = Array.isArray(recipients)
            ? recipients
            : [recipients];

        // Build the email command
        const sendCommand = new SendEmailCommand({
            Source: senderFrom,
            Destination: {
                ToAddresses: destination,
            },
            Message: {
                Subject: {
                    Data: subject,
                    Charset: "UTF-8",
                },
                Body: {
                    Text: {
                        Data: body,
                        Charset: "UTF-8",
                    },
                    ...(htmlBody && {
                        Html: {
                            Data: htmlBody,
                            Charset: "UTF-8",
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
            from: senderFrom,
            subject,
        };
    } catch (error) {
        console.error(
            "\n[Email Service] ========================================",
        );
        console.error("[Email Service] SEND EMAIL FAILED");
        console.error(
            "[Email Service] ========================================",
        );
        console.error("[Email Service] Error sending email:", error.message);
        console.error(
            "[Email Service] HTTP Status Code:",
            error.$metadata?.httpStatusCode,
        );

        // Provide helpful troubleshooting information
        if (
            error.message.includes(
                "The security token included in the request is invalid",
            )
        ) {
            console.error(
                '\n[Email Service] Troubleshooting "SecurityTokenInvalid":',
            );
            console.error(
                "- Verify AWS_ACCESS_KEY_ID starts with 'AKIA' (not SMTP username)",
            );
            console.error(
                "- Check that AWS_SECRET_ACCESS_KEY matches the access key ID",
            );
            console.error(
                "- Ensure you are using API credentials, NOT SMTP credentials",
            );
        }

        if (
            error.message.includes("NotAuthorizedException") ||
            error.message.includes("MessageRejected")
        ) {
            console.error("\n[Email Service] SES Authorization Error:");
            console.error("- Verify sender email is confirmed in AWS SES");
            console.error("- If in SES Sandbox, verify recipient emails too");
        }

        if (error.message.includes("InvalidClientTokenId")) {
            console.error("\n[Email Service] Invalid Client Token:");
            console.error(
                "- The AWS_ACCESS_KEY_ID does not exist or is invalid",
            );
        }

        if (error.message.includes("SignatureDoesNotMatch")) {
            console.error("\n[Email Service] Signature Mismatch:");
            console.error(
                "- The AWS_SECRET_ACCESS_KEY does not match the access key ID",
            );
        }

        throw new Error(`Failed to send email: ${error.message}`);
    } finally {
        console.log(
            "[Email Service] ========================================\n",
        );
    }
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
 * Generate a professionally styled HTML email template
 * @param {Object} options - Email content options
 * @param {string} options.title - Main heading/title of the email
 * @param {string} options.content - Main body content (can include HTML)
 * @param {string} [options.footer] - Optional footer text
 * @param {string} [options.primaryColor='#2563eb'] - Primary accent color
 * @returns {string} Complete styled HTML email document
 */
function generateStyledHTML({
    title,
    content,
    footer = "This email was sent automatically. Please do not reply.",
    primaryColor = "#2563eb",
}) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5; padding: 20px 0;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    <tr>
                        <td style="padding: 30px 40px;">
                            <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; border-bottom: 3px solid ${primaryColor}; padding-bottom: 12px;">${title}</h1>
                            <div style="font-size: 16px; line-height: 1.7; color: #404040;">${content}</div>
                        </td>
                    </tr>
                    ${
                        footer
                            ? `
                    <tr>
                        <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e5e5e5;">
                            <p style="margin: 0; font-size: 13px; color: #8c8c8c; text-align: center;">${footer}</p>
                        </td>
                    </tr>`
                            : ""
                    }
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/**
 * Generate a simple HTML email with basic styling
 * @param {string} subject - Email subject for the heading
 * @param {string} bodyText - Plain text content to convert to HTML paragraphs
 * @returns {string} Simple styled HTML email document
 */
function generateSimpleHTML(subject, bodyText) {
    // Convert plain text to HTML paragraphs
    const paragraphs = bodyText
        .split("\n\n")
        .map(
            (para) =>
                `<p style="margin: 0 0 16px 0; line-height: 1.6;">${para.trim()}</p>`,
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #fafafa; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); padding: 30px;">
        <h1 style="margin: 0 0 24px 0; font-size: 22px; color: #333333; border-bottom: 2px solid #0066cc; padding-bottom: 12px;">${subject}</h1>
        <div style="font-size: 15px; line-height: 1.6; color: #444444;">
            ${paragraphs}
        </div>
    </div>
</body>
</html>`;
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
        defaultRecipient: EMAIL_CONFIG.DEFAULT_RECIPIENT || "Not set",
        credentialsStatus: {
            accessKeyId: hasAccessKey ? "Set" : "Missing",
            secretAccessKey: hasSecretKey ? "Set" : "Missing",
        },
    };
}

module.exports = {
    sendEmail,
    isValidEmail,
    getServiceStatus,
    generateStyledHTML,
    generateSimpleHTML,
};
