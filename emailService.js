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

    // Dynamically require imap package (optional dependency)
    try {
        imap = require("imap");
    } catch (error) {
        throw new Error(
            "The 'imap' package is not installed. Run: npm install imap node-imap\n" +
                "This package is required for IMAP email receiving functionality.",
        );
    }

    const imapConfig = {
        user: config.USER,
        password: config.PASSWORD,
        host: config.HOST || "imap.gmail.com",
        port: config.PORT || 993,
        tls: config.TLS !== false,
        tlsOptions: {
            rejectUnauthorized: false, // Gmail self-signed certs during testing
        },
    };

    console.log("[IMAP Service] Creating IMAP connection...");

    const imapClient = new imap(imapConfig);

    return imapClient;
}

/**
 * Start IMAP IDLE monitoring for real-time email notifications
 * @param {Object} imapClient - Connected IMAP client instance
 * @param {Function} onNewEmail - Callback function when new email is received
 * @param {string} subjectTag - Subject tag to filter emails (e.g., "[prompt]")
 */
function startIMAPIdle(imapClient, onNewEmail, subjectTag = "[prompt]") {
    console.log("[IMAP Service] Starting IDLE monitoring...");

    imapClient.on("ready", () => {
        console.log("[IMAP Service] ✓ IMAP connection ready");

        // Open INBOX folder
        imapClient.openBox("INBOX", false, (err, box) => {
            if (err) {
                console.error("[IMAP Service] Error opening INBOX:", err);
                return;
            }

            console.log(
                `[IMAP Service] ✓ Opened INBOX (${box.messages.total} total messages)`,
            );

            // Start IDLE mode for push notifications
            startIdleWatcher(imapClient, onNewEmail, subjectTag);
        });
    });

    imapClient.on("error", (err) => {
        console.error("[IMAP Service] IMAP connection error:", err.message);
        imapConnected = false;
    });

    imapClient.on("close", () => {
        console.log("[IMAP Service] IMAP connection closed");
        imapConnected = false;
    });

    imapClient.connect();
}

/**
 * Start IDLE watcher for real-time email notifications
 */
function startIdleWatcher(imapClient, onNewEmail, subjectTag) {
    idleWatcher = imapClient.idle();

    idleWatcher.on("idle", () => {
        console.log(
            "[IMAP Service] ✓ IDLE mode active - waiting for new emails",
        );
    });

    idleWatcher.on("update", async (seqno, updateType) => {
        if (updateType === "exists") {
            console.log(
                `[IMAP Service] New email detected in INBOX (total: ${seqno})`,
            );

            // Fetch the new message
            await fetchAndProcessNewEmail(imapClient, onNewEmail, subjectTag);
        }
    });

    idleWatcher.on("error", (err) => {
        console.error("[IMAP Service] IDLE error:", err.message);
    });
}

/**
 * Fetch and process new email
 */
async function fetchAndProcessNewEmail(imapClient, onNewEmail, subjectTag) {
    try {
        // Search for unread emails with the target subject tag
        imapClient.search(
            ["UNSEEN", "BODY", `SUBJECT "${subjectTag}"`],
            async (err, results) => {
                if (err) {
                    console.error("[IMAP Service] Search error:", err.message);
                    return;
                }

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
                        const fetch = imapClient.fetch([uid], {
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
                                    const parsedEmail =
                                        parseRawEmail(emailData);

                                    console.log(
                                        `[IMAP Service] Email from: ${parsedEmail.from}`,
                                    );
                                    console.log(
                                        `[IMAP Service] Subject: ${parsedEmail.subject}`,
                                    );

                                    // Mark as processed and trigger callback
                                    onNewEmail(parsedEmail);

                                    // Optionally mark as read after processing
                                    imapClient.addFlags([uid], "\\Seen", () => {
                                        console.log(
                                            "[IMAP Service] ✓ Email marked as read",
                                        );
                                    });
                                });
                            });
                        });

                        fetch.once("error", (err) => {
                            console.error(
                                "[IMAP Service] Fetch error:",
                                err.message,
                            );
                        });
                    } finally {
                        // Remove from processing set after delay
                        setTimeout(() => {
                            processingEmails.delete(uid);
                        }, 30000);
                    }
                }

                // Resume IDLE after processing
                if (!idleWatcher || idleWatcher._destroyed) {
                    startIdleWatcher(imapClient, onNewEmail, subjectTag);
                }
            },
        );
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
};
