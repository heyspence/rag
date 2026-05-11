/**
 * Email Service - AWS SES Integration + IMAP Receiving
 *
 * Provides email sending functionality using Amazon Simple Email Service (SES).
 * Supports both single and bulk email sending with optional default recipient feature.
 *
 * IMPORTANT: ALL emails MUST be sent as styled HTML documents for professional formatting.
 * Use generateStyledHTML() or generateSimpleHTML() helper functions to create properly
 * formatted HTML content before calling sendEmail().
 *
 * ALSO provides IMAP email receiving with IDLE support for real-time notifications.
 * Uses Gmail's IMAP server to receive emails without third-party services.
 *
 * Configuration required in .env file:
 *   AWS_ACCESS_KEY_ID=your_access_key_id
 *   AWS_SECRET_ACCESS_KEY=your_secret_access_key
 *   AWS_REGION=us-east-2
 *   FROM_EMAIL=Sender Name <email@domain.com>  (e.g., "My App <noreply@bookservo.com>")
 *   DEFAULT_EMAIL_RECIPIENT=recipient@example.com (optional)
 *
 *   # IMAP Receiving Configuration (for Gmail)
 *   IMAP_HOST=imap.gmail.com
 *   IMAP_PORT=993
 *   IMAP_USER=your-email@gmail.com
 *   IMAP_PASSWORD=app-specific-password  # Generate from Google Account settings
 *   IMAP_FOLDER=INBOX
 *   EMAIL_SUBJECT_TAG=[prompt]
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

/**
 * IMAP Email Receiving Service - Gmail Integration with IDLE Support
 *
 * Provides real-time email receiving using Gmail's IMAP server.
 * Uses IDLE mode for push-style notifications instead of polling.
 * No third-party services required - connects directly to your Gmail account.
 */

let imap = null;
let imapConnected = false;
let idleWatcher = null;
let processingEmails = new Set(); // Track processed email IDs to avoid duplicates

/**
 * Initialize IMAP connection with Gmail
 * @param {Object} config - IMAP configuration
 * @returns {Promise<Object>} IMAP client instance
 */
async function createIMAPConnection(config) {
    console.log("[IMAP Service] Loading IMAP credentials from environment...");

    if (!config.USER) {
        throw new Error(
            "IMAP_USER not found in environment variables. Please check your .env file.",
        );
    }

    if (!config.PASSWORD) {
        throw new Error(
            "IMAP_PASSWORD not found in environment variables. Please check your .env file.\n" +
                "Note: For Gmail, you need to generate an App-Specific Password from Google Account settings.",
        );
    }

    console.log("[IMAP Service] IMAP_USER:", config.USER);
    console.log("[IMAP Service] IMAP_PASSWORD present: true");
    console.log("[IMAP Service] IMAP_HOST:", config.HOST);
    console.log("[IMAP Service] IMAP_PORT:", config.PORT);

    // Use imap-simple for better IDLE support
    try {
        const imapSimple = require("imap-simple");

        const imapConfig = {
            imap: {
                user: config.USER,
                password: config.PASSWORD,
                host: config.HOST || "imap.gmail.com",
                port: config.PORT || 993,
                tls: true,
                tlsOptions: {
                    rejectUnauthorized: false, // Allow self-signed certs for Gmail
                },
            },
        };

        console.log(
            "[IMAP Service] Creating IMAP connection with imap-simple...",
        );

        const connection = await imapSimple.connect(imapConfig);
        imapConnection = connection;

        return connection;
    } catch (error) {
        throw new Error(
            "Failed to create IMAP connection: " +
                error.message +
                "\n" +
                "Make sure 'imap-simple' package is installed. Run: npm install imap-simple",
        );
    }
}

/**
 * Start IMAP IDLE monitoring for real-time email notifications
 * @param {Object} imapClient - Connected IMAP client instance
 * @param {Function} onNewEmail - Callback function when new email is received
 * @param {string} subjectTag - Subject tag to filter emails (e.g., "[prompt]")
 */
async function startIMAPIdle(connection, onNewEmail, subjectTag = "[prompt]") {
    try {
        // Open INBOX folder
        const box = await connection.openBox("INBOX");
        console.log("[IMAP Service] ✓ IMAP connection ready");
        console.log(
            `[IMAP Service] ✓ Opened INBOX (${box.messages.total} total messages)`,
        );
        imapConnected = true;

        // Create "emails" folder for storing processed emails
        await createEmailsFolder(connection);

        // Start polling watcher (imap-simple doesn't have direct IDLE access)
        await startPollingWatcher(connection, onNewEmail, subjectTag);
    } catch (err) {
        console.error("[IMAP Service] Error opening INBOX:", err);
        imapConnected = false;
    }

    connection.imap.on("error", (err) => {
        console.error("[IMAP Service] IMAP connection error:", err.message);
        imapConnected = false;
    });

    connection.imap.on("close", () => {
        console.log("[IMAP Service] IMAP connection closed");
        imapConnected = false;
    });
}

/**
 * Start polling watcher as fallback for email detection
 */
async function startPollingWatcher(connection, onNewEmail, subjectTag) {
    console.log(
        "[IMAP Service] ✓ Polling mode active - checking every 10 seconds",
    );

    // Store last known message count
    let lastMessageCount = await getMessageCount(connection);
    console.log(`[IMAP Service] Initial message count: ${lastMessageCount}`);

    // Set up polling interval (10 seconds)
    const pollInterval = setInterval(async () => {
        if (!imapConnected) {
            clearInterval(pollInterval);
            return;
        }

        try {
            const currentCount = await getMessageCount(connection);

            if (currentCount > lastMessageCount) {
                console.log(
                    `[IMAP Service] New email detected! (${lastMessageCount} → ${currentCount})`,
                );
                lastMessageCount = currentCount;

                // Fetch and process new emails
                try {
                    await fetchAndProcessNewEmail(
                        connection,
                        onNewEmail,
                        subjectTag,
                    );
                } catch (fetchError) {
                    console.error(
                        "[IMAP Service] Error fetching email:",
                        fetchError.message,
                    );
                }
            }
        } catch (err) {
            console.error("[IMAP Service] Polling error:", err.message);
        }
    }, 10000); // Check every 10 seconds

    idleWatcher = { type: "polling", interval: pollInterval };
}

/**
 * Create the "emails" folder/label in Gmail
 * @param {Object} connection - IMAP connection instance
 */
async function createEmailsFolder(connection) {
    try {
        // Try to open with create flag (should create if doesn't exist)
        await connection.openBox("emails", true);
        console.log("[IMAP Service] ✓ Emails folder ready");
        return;
    } catch (err) {
        console.log(
            "[IMAP Service] Attempting to create emails folder via IMAP CREATE...",
        );
    }

    try {
        // Use the underlying IMAP client's create command
        const createCmd = connection.imap.createBox("emails", (err) => {
            if (err) {
                console.log(
                    "[IMAP Service] Note: Emails folder will be created on first email move",
                );
            } else {
                console.log("[IMAP Service] ✓ Emails folder created");
            }
        });

        // Wait a bit for the command to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (createErr) {
        console.log(
            "[IMAP Service] Note: Emails folder will be created on first email move",
        );
    }
}

async function getMessageCount(connection) {
    try {
        const box = await connection.openBox("INBOX");
        return box.messages.total;
    } catch (err) {
        console.error("[IMAP Service] Error getting message count:", err);
        return 0;
    }
}

/**
 * Fetch and process new email
 */
async function fetchAndProcessNewEmail(connection, onNewEmail, subjectTag) {
    try {
        // Search for unread emails with the target subject tag
        const results = await connection.search([
            "UNSEEN",
            "BODY",
            `SUBJECT "${subjectTag}"`,
        ]);

        if (!results || results.length === 0) {
            console.log("[IMAP Service] No new matching emails found");
            return;
        }

        console.log(
            `[IMAP Service] Found ${results.length} new email(s) with tag [${subjectTag}]`,
        );

        for (const uid of results) {
            // Skip if already processed
            if (processingEmails.has(uid)) {
                continue;
            }

            processingEmails.add(uid);

            try {
                const fetch = connection.fetch([uid], {
                    bodies: "",
                    markSeen: false,
                    struct: true,
                });

                fetch.on("message", (msg) => {
                    msg.on("body", async (stream) => {
                        let emailData = "";
                        stream.on("data", (chunk) => {
                            emailData += chunk.toString();
                        });

                        stream.once("end", () => {
                            // Parse email content
                            const parsedEmail = parseRawEmail(emailData);

                            console.log(
                                `[IMAP Service] Email from: ${parsedEmail.from}`,
                            );
                            console.log(
                                `[IMAP Service] Subject: ${parsedEmail.subject}`,
                            );

                            // Mark as processed and trigger callback
                            onNewEmail(parsedEmail);

                            // Move email to "emails" folder after processing
                            const emailsFolder = "emails";

                            // Copy the message to the emails folder
                            // Gmail will create the label automatically if it doesn't exist
                            connection.copy([uid], emailsFolder, (copyErr) => {
                                if (copyErr) {
                                    console.error(
                                        "[IMAP Service] Error copying email to emails folder:",
                                        copyErr.message,
                                    );
                                    // Try with Gmail label format as fallback
                                    connection.copy(
                                        [uid],
                                        `[Gmail]/All Mail`,
                                        (fallbackErr) => {
                                            if (fallbackErr) {
                                                console.error(
                                                    "[IMAP Service] Also failed to copy to All Mail:",
                                                    fallbackErr.message,
                                                );
                                            } else {
                                                console.log(
                                                    "[IMAP Service] ✓ Email archived to Gmail",
                                                );
                                            }

                                            // Mark as read regardless of copy success
                                            connection.addFlags(
                                                [uid],
                                                "\\Seen",
                                                () => {},
                                            );
                                        },
                                    );
                                } else {
                                    console.log(
                                        `[IMAP Service] ✓ Email moved to "${emailsFolder}" folder`,
                                    );

                                    // Mark as read in original inbox after moving
                                    connection.addFlags([uid], "\\Seen", () => {
                                        console.log(
                                            "[IMAP Service] ✓ Email marked as read",
                                        );
                                    });
                                }
                            });
                        });
                    });
                });

                fetch.once("error", (err) => {
                    console.error("[IMAP Service] Fetch error:", err.message);
                });
            } finally {
                // Remove from processing set after delay
                setTimeout(() => {
                    processingEmails.delete(uid);
                }, 30000);
            }
        }
    } catch (error) {
        console.error("[IMAP Service] Error fetching email:", error.message);
    }
}

/**
 * Parse raw RFC822 email data into structured format
 */
function parseRawEmail(rawEmail) {
    const lines = rawEmail.split("\r\n");
    let headers = {};
    let bodyStartIndex = 0;
    let inHeaders = true;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === "") {
            inHeaders = false;
            bodyStartIndex = i + 1;
            break;
        }

        const colonIndex = lines[i].indexOf(":");
        if (colonIndex > 0 && inHeaders) {
            const key = lines[i].substring(0, colonIndex).toLowerCase().trim();
            const value = lines[i]
                .substring(colonIndex + 1)
                .trim()
                .replace(/^"|"$/g, ""); // Remove quotes
            headers[key] = value;
        }
    }

    const body = lines.slice(bodyStartIndex).join("\n").trim();

    return {
        from: headers.from || "Unknown",
        to: headers.to || "",
        subject: headers.subject || "No Subject",
        date: headers.date || new Date().toISOString(),
        bodyText: body,
        raw: rawEmail,
    };
}

/**
 * Stop IMAP IDLE monitoring and close connection
 */
function stopIMAPConnection() {
    if (idleWatcher) {
        console.log("[IMAP Service] Stopping IDLE watcher...");
        try {
            idleWatcher.done(() => {
                console.log(
                    "[IMAP Service] ✓ IDLE watcher stopped successfully",
                );
            });
        } catch (err) {
            console.error("[IMAP Service] Error stopping IDLE:", err.message);
        }
    }

    if (imap && imapConnected) {
        console.log("[IMAP Service] Closing IMAP connection...");
        try {
            imap.end();
            imapConnected = false;
        } catch (err) {
            console.error(
                "[IMAP Service] Error closing connection:",
                err.message,
            );
        }
    }

    console.log("[IMAP Service] IMAP service stopped");
}

/**
 * Get IMAP connection status
 */
function getIMAPStatus() {
    return {
        connected: imapConnected,
        hasConfig: !!(imap?.user && imap?.password),
    };
}

// ============================================
// Gmail Push Notifications Implementation
// ============================================

let gmailWatchExpiration = null;
let renewTimer = null;
let pushWebhookServer = null;

async function setupGmailPush() {
    try {
        // Validate required environment variables
        if (
            !process.env.GOOGLE_CLIENT_ID ||
            !process.env.GOOGLE_CLIENT_SECRET ||
            !process.env.GOOGLE_REFRESH_TOKEN
        ) {
            throw new Error("Missing Gmail OAuth credentials in .env file");
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            "http://localhost:8081/oauth2callback",
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        // Ensure Pub/Sub topic exists
        if (process.env.GOOGLE_PUBSUB_TOPIC_NAME) {
            const pubsub = new PubSub({
                projectId: process.env.GOOGLE_PROJECT_ID,
            });

            const [topicExists] = await pubsub
                .topic(process.env.GOOGLE_PUBSUB_TOPIC_NAME)
                .exists();
            if (!topicExists) {
                console.log(
                    "[Gmail Push] Creating Pub/Sub topic:",
                    process.env.GOOGLE_PUBSUB_TOPIC_NAME,
                );
                await pubsub.createTopic(process.env.GOOGLE_PUBSUB_TOPIC_NAME);
            }
        }

        // Set up Gmail watch
        const response = await gmail.users.watch({
            userId: "me",
            requestBody: {
                topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
                labelIds: ["INBOX"],
            },
        });

        gmailWatchExpiration = new Date(response.data.expiration);

        console.log(
            "[Gmail Push] ✓ Gmail watch active - History ID:",
            response.data.historyId,
        );
        console.log(
            "[Gmail Push] ✓ Expiration:",
            gmailWatchExpiration.toISOString(),
        );

        // Schedule renewal 24 hours before expiration
        const renewTime = new Date(
            gmailWatchExpiration.getTime() - 24 * 60 * 60 * 1000,
        );
        const timeUntilRenewal = renewTime - new Date();

        if (timeUntilRenewal > 0) {
            console.log(
                "[Gmail Push] Will renew in",
                Math.round(timeUntilRenewal / (1000 * 60 * 60)),
                "hours",
            );
            renewTimer = setTimeout(() => {
                console.log("[Gmail Push] Renewing Gmail watch...");
                setupGmailPush().catch((err) =>
                    console.error("[Gmail Push] Renewal error:", err.message),
                );
            }, timeUntilRenewal);
        }

        return response.data;
    } catch (error) {
        console.error("[Gmail Push] Error setting up watch:", error.message);
        throw error;
    }
}

async function stopGmailPush() {
    if (renewTimer) clearTimeout(renewTimer);

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            "http://localhost:8081/oauth2callback",
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        await gmail.users.stop({ userId: "me" });

        console.log("[Gmail Push] ✓ Gmail watch stopped");
    } catch (error) {
        console.error("[Gmail Push] Error stopping watch:", error.message);
    }
}

function getGmailPushStatus() {
    return {
        active: !!gmailWatchExpiration,
        expiration: gmailWatchExpiration?.toISOString(),
        renewTimerActive: !!renewTimer,
        webhookServerRunning: !!pushWebhookServer,
    };
}

// Start webhook server to receive push notifications from Pub/Sub
function startPushWebhook(
    port = parseInt(process.env.GMAIL_PUSH_WEBHOOK_PORT) || 8080,
) {
    const webhookApp = express();
    webhookApp.use(express.json());

    // POST endpoint - receives notifications from Google Cloud Pub/Sub
    webhookApp.post("/gmail-push", (req, res) => {
        console.log("[Gmail Push] Received notification from Google");

        // Acknowledge immediately (Google requires this within 10 seconds)
        res.status(200).json({ received: true });

        const message = req.body.message;
        if (message && message.userId) {
            console.log(
                "[Gmail Push] New email notification - History ID:",
                message.historyId,
            );

            // Fetch and process the email asynchronously
            processGmailNotification(message).catch((err) =>
                console.error("[Gmail Push] Processing error:", err.message),
            );
        } else {
            console.log("[Gmail Push] Notification received but no user data");
        }
    });

    // GET endpoint - Google verifies the webhook URL during subscription setup
    webhookApp.get("/gmail-push", (req, res) => {
        const challenge = req.query["x-goog-channel-token"];
        if (challenge) {
            console.log("[Gmail Push] Webhook verification successful");
            res.status(200).send("Webhook verified");
        } else {
            res.status(404).send("Not found");
        }
    });

    pushWebhookServer = webhookApp.listen(port, () => {
        console.log(`[Gmail Push] ✓ Webhook server listening on port ${port}`);
        console.log(
            `[Gmail Push] ✓ Webhook URL: ${process.env.GMAIL_PUSH_WEBHOOK_URL}`,
        );
    });

    return pushWebhookServer;
}

async function processGmailNotification(message) {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            "http://localhost:8081/oauth2callback",
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        // Get messages from history
        const response = await gmail.users.history.list({
            userId: "me",
            startHistoryId: message.historyId,
            labelIds: ["INBOX"],
        });

        if (response.data.history) {
            for (const historyItem of response.data.history) {
                if (historyItem.messagesAdded) {
                    for (const msg of historyItem.messagesAdded) {
                        console.log(
                            "[Gmail Push] Processing new message:",
                            msg.message.id,
                        );

                        // Fetch full email content
                        const email = await gmail.users.messages.get({
                            userId: "me",
                            id: msg.message.id,
                            format: "full",
                        });

                        // Parse the email data
                        const parsedEmail = parseGmailMessage(email.data);

                        // Check if subject contains [prompt] tag
                        const subjectTag =
                            process.env.EMAIL_SUBJECT_TAG || "[prompt]";
                        if (
                            parsedEmail.subject &&
                            parsedEmail.subject.includes(subjectTag)
                        ) {
                            console.log(
                                `[Gmail Push] Found ${subjectTag} tag - processing through RAG pipeline`,
                            );

                            // Reuse existing email processing logic
                            await processEmailContent(parsedEmail);
                        } else {
                            console.log(
                                "[Gmail Push] Email does not contain",
                                subjectTag,
                                "tag - skipping",
                            );
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(
            "[Gmail Push] Error processing notification:",
            error.message,
        );
    }
}

// Parse Gmail API message format to our standard email format
function parseGmailMessage(message) {
    const headers = message.payload.headers;
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const from = headers.find((h) => h.name === "From")?.value || "";
    const to = headers.find((h) => h.name === "To")?.value || "";
    const date = headers.find((h) => h.name === "Date")?.value || "";

    // Extract body text
    let bodyText = "";
    if (message.payload.parts) {
        for (const part of message.payload.parts) {
            if (part.mimeType === "text/plain" && part.body.data) {
                bodyText = Buffer.from(part.body.data, "base64").toString(
                    "utf-8",
                );
                break;
            } else if (
                part.mimeType === "text/html" &&
                part.body.data &&
                !bodyText
            ) {
                // Fallback to HTML if no plain text
                bodyText = Buffer.from(part.body.data, "base64").toString(
                    "utf-8",
                );
            }
        }
    } else if (message.payload.body.data) {
        bodyText = Buffer.from(message.payload.body.data, "base64").toString(
            "utf-8",
        );
    }

    return {
        from,
        to,
        subject,
        date,
        bodyText,
        messageId: message.id,
        threadId: message.threadId,
    };
}

// Process email content through RAG pipeline (reuses existing logic)
async function processEmailContent(emailData) {
    try {
        console.log("[Gmail Push] Processing email through RAG pipeline...");

        // Extract subject and body
        const subject = emailData.subject || "";
        const body = emailData.bodyText || "";
        const fullPrompt = `${subject}\n\n${body}`;

        // Check if we have the [prompt] tag in subject
        const subjectTag = process.env.EMAIL_SUBJECT_TAG || "[prompt]";

        console.log("[Gmail Push] Email from:", emailData.from);
        console.log("[Gmail Push] Subject:", subject);
        console.log("[Gmail Push] Body length:", body.length, "characters");

        // Here you would integrate with your existing RAG/search functionality
        // For now, we'll log the processed email
        const timestamp = new Date().toISOString();
        const emailsFolder = "./Emails";

        // Ensure Emails folder exists
        const fs = require("fs-extra");
        await fs.ensureDir(emailsFolder);

        // Save email to file for processing
        const filename = `${emailsFolder}/gmail_${timestamp}_${emailData.messageId}.json`;
        await fs.writeJson(
            filename,
            {
                ...emailData,
                receivedAt: timestamp,
                source: "gmail-push",
            },
            { spaces: 2 },
        );

        console.log("[Gmail Push] ✓ Email saved to:", filename);
        console.log("[Gmail Push] ✓ Ready for RAG processing");
    } catch (error) {
        console.error("[Gmail Push] Error in email processing:", error.message);
    }
}

// Export Gmail Push functions
module.exports.setupGmailPush = setupGmailPush;
module.exports.stopGmailPush = stopGmailPush;
module.exports.getGmailPushStatus = getGmailPushStatus;
module.exports.startPushWebhook = startPushWebhook;
module.exports.processGmailNotification = processGmailNotification;

// Original exports remain unchanged
module.exports = {
    sendEmail,
    isValidEmail,
    getServiceStatus,
    generateStyledHTML,
    generateSimpleHTML,
    // IMAP Receiving functions
    createIMAPConnection,
    startIMAPIdle,
    stopIMAPConnection,
    getIMAPStatus,
    // Gmail Push Notifications
    setupGmailPush,
    stopGmailPush,
    getGmailPushStatus,
    startPushWebhook,
    processGmailNotification,
};
