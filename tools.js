/**
 * Shared MCP Tools Module
 * Provides tool definitions and handlers for both LM Studio (stdio) and HTTP versions
 */

const path = require("path");

/**
 * Get tool definitions - used by both stdio and HTTP servers
 * @returns {Array} Array of tool definition objects
 */
function getToolDefinitions() {
    return [
        {
            name: "search_documents",
            description:
                "Search the local document index for relevant information based on a query.",
            inputSchema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query",
                    },
                    topK: {
                        type: "number",
                        description: "Number of results to return",
                        default: 5,
                    },
                },
                required: ["query"],
            },
        },
        {
            name: "index_status",
            description:
                "Get the current status and list of indexed documents.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "list_indexed_files",
            description: "List only the names of all currently indexed files.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "send_email",
            description:
                "Send an email using AWS SES. Requires subject and body parameters. The 'to' parameter is optional - if not provided, the email will be sent to the default recipient configured in .env (DEFAULT_EMAIL_RECIPIENT).",
            inputSchema: {
                type: "object",
                properties: {
                    to: {
                        type: "string",
                        description:
                            "Recipient email address (e.g., user@example.com). Optional - uses DEFAULT_EMAIL_RECIPIENT from .env if not provided.",
                    },
                    subject: {
                        type: "string",
                        description: "Email subject line",
                    },
                    body: {
                        type: "string",
                        description: "Plain text content of the email",
                    },
                    htmlBody: {
                        type: "string",
                        description:
                            "Optional HTML content for rich formatting",
                    },
                    from: {
                        type: "string",
                        description:
                            "Sender email address (defaults to noreply@bookservo.com)",
                    },
                },
                required: ["subject", "body"],
            },
        },
        {
            name: "send_bulk_email",
            description:
                "Send the same email to multiple recipients using AWS SES.",
            inputSchema: {
                type: "object",
                properties: {
                    recipients: {
                        type: "array",
                        items: { type: "string" },
                        description: "Array of recipient email addresses",
                    },
                    subject: {
                        type: "string",
                        description: "Email subject line",
                    },
                    body: {
                        type: "string",
                        description: "Plain text content of the email",
                    },
                    htmlBody: {
                        type: "string",
                        description:
                            "Optional HTML content for rich formatting",
                    },
                },
                required: ["recipients", "subject", "body"],
            },
        },
        {
            name: "check_email_status",
            description:
                "Check the configuration status of the AWS SES email service.",
            inputSchema: { type: "object", properties: {} },
        },
    ];
}

/**
 * Handle tool calls with dependencies injected (for testability)
 * Uses LM Studio logic as the base implementation
 * @param {string} toolName - Name of the tool to call
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies { vectorDb, embeddingEngine, emailService, CONFIG }
 * @returns {Promise<object>} Tool response
 */
async function handleToolCall(toolName, args, dependencies) {
    const { vectorDb, embeddingEngine, emailService, CONFIG } = dependencies;

    switch (toolName) {
        case "search_documents": {
            const query = args.query;
            const topK = args.topK || CONFIG.SEARCH_TOP_K;

            try {
                const queryEmbedding = await embeddingEngine.embed(query);
                const results = await vectorDb.search(queryEmbedding, topK);

                // Filter results by the minimum match score requirement
                const filteredResults = results.filter(
                    (res) => res.score >= CONFIG.SEARCH_MIN_SCORE,
                );

                if (filteredResults.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No documents found meeting the minimum similarity score of ${CONFIG.SEARCH_MIN_SCORE}.`,
                            },
                        ],
                    };
                }

                const formattedResults = filteredResults
                    .map(
                        (res, i) =>
                            `${i + 1}. [Score: ${res.score.toFixed(4)}] Source: ${res.docId}\nContent: ${res.content}`,
                    )
                    .join("\n\n");

                return {
                    content: [
                        {
                            type: "text",
                            text: `Top ${filteredResults.length} relevant results (Threshold: ${CONFIG.SEARCH_MIN_SCORE}):\n\n${formattedResults}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Search error: ${error.message}`,
                        },
                    ],
                };
            }
        }

        case "index_status": {
            const docs = vectorDb.listDocuments();
            // Extract unique file paths from chunk IDs
            const files = [...new Set(docs.map((id) => id.split("#")[0]))];
            return {
                content: [
                    {
                        type: "text",
                        text: `Indexing active. Total chunks: ${docs.length}. Unique files indexed: ${files.length}.\nFiles:\n${files.join("\n")}`,
                    },
                ],
            };
        }

        case "list_indexed_files": {
            const docs = vectorDb.listDocuments();
            // Extract unique file paths, then get just the filename using path.basename
            const files = [
                ...new Set(docs.map((id) => path.basename(id.split("#")[0]))),
            ];
            return {
                content: [
                    {
                        type: "text",
                        text: `Indexed Files:\n${files.join("\n")}`,
                    },
                ],
            };
        }

        case "send_email": {
            const { to, subject, body, htmlBody, from } = args;

            // Validate required parameters (to is optional - will use default if not provided)
            if (!subject || !body) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Error: Missing required parameters. 'subject' and 'body' are required.",
                        },
                    ],
                };
            }

            // Validate email format if 'to' is provided
            if (to && !emailService.isValidEmail(to)) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error: Invalid email address format: ${to}`,
                        },
                    ],
                };
            }

            try {
                const result = await emailService.sendEmail({
                    to,
                    subject,
                    body,
                    htmlBody: htmlBody || null,
                    from,
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Email sent successfully!\n\nMessage ID: ${result.messageId}\nTo: ${result.to.join(", ")}\nFrom: ${result.from}\nSubject: ${result.subject}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error sending email: ${error.message}`,
                        },
                    ],
                };
            }
        }

        case "send_bulk_email": {
            const { recipients, subject, body, htmlBody } = args;

            // Validate required parameters
            if (!recipients || !subject || !body) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Error: Missing required parameters. 'recipients', 'subject', and 'body' are required.",
                        },
                    ],
                };
            }

            if (!Array.isArray(recipients) || recipients.length === 0) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "Error: 'recipients' must be a non-empty array of email addresses.",
                        },
                    ],
                };
            }

            // Validate all email formats
            const invalidEmails = recipients.filter(
                (email) => !emailService.isValidEmail(email),
            );
            if (invalidEmails.length > 0) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error: Invalid email address format(s): ${invalidEmails.join(", ")}`,
                        },
                    ],
                };
            }

            try {
                const result = await emailService.sendBulkEmail({
                    recipients,
                    subject,
                    body,
                    htmlBody: htmlBody || null,
                });

                const summary = `📧 Bulk email results:\nTotal: ${result.total}\nSuccessful: ${result.successful}\nFailed: ${result.failed}\n\n`;
                const details = result.results
                    .map(
                        (r) =>
                            `${r.status === "sent" ? "✅" : "❌"} ${r.recipient}: ${r.status === "sent" ? r.messageId : r.error}`,
                    )
                    .join("\n");

                return {
                    content: [
                        {
                            type: "text",
                            text: summary + details,
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error sending bulk email: ${error.message}`,
                        },
                    ],
                };
            }
        }

        case "check_email_status": {
            const status = emailService.getServiceStatus();

            const statusText =
                `📬 AWS SES Email Service Status:\n\n` +
                `Configured: ${status.configured ? "✅ Yes" : "❌ No"}\n` +
                `Region: ${status.region}\n` +
                `Default From: ${status.fromEmail}\n` +
                `Default Recipient: ${status.defaultRecipient}\n\n` +
                (status.configured
                    ? "Email tools are ready to use."
                    : "Please configure AWS credentials in .env file:\n- AWS_ACCESS_KEY_ID\n- AWS_SECRET_ACCESS_KEY\n- AWS_REGION");

            return {
                content: [
                    {
                        type: "text",
                        text: statusText,
                    },
                ],
            };
        }

        default:
            throw new Error(`Tool not found: ${toolName}`);
    }
}

module.exports = {
    getToolDefinitions,
    handleToolCall,
};
