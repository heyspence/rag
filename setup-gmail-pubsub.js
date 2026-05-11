/**
 * Gmail Pub/Sub Setup Script
 *
 * This script automatically creates the required Pub/Sub topic and subscription
 * for Gmail Push Notifications.
 *
 * Usage:
 *   node setup-gmail-pubsub.js
 *
 * Prerequisites:
 *   - GOOGLE_PROJECT_ID set in .env
 *   - GOOGLE_PUBSUB_TOPIC_NAME set in .env
 *   - GMAIL_PUSH_WEBHOOK_URL set in .env
 *   - Google Cloud SDK authenticated OR service account credentials configured
 */

require("dotenv").config();
const { PubSub } = require("@google-cloud/pubsub");

// ANSI color codes for terminal output
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    log("\n" + "=".repeat(60), "cyan");
    log(`  ${title}`, "cyan");
    log("=".repeat(60), "cyan");
}

// Configuration from environment variables
const config = {
    projectId: process.env.GOOGLE_PROJECT_ID,
    topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
    subscriptionName: "gmail-push-subscription",
    webhookUrl:
        process.env.GMAIL_PUSH_WEBHOOK_URL ||
        "http://localhost:8080/gmail-push",
};

// Validate configuration
function validateConfig() {
    logSection("Configuration Validation");

    let valid = true;

    if (!config.projectId) {
        log("✗ GOOGLE_PROJECT_ID not set in .env", "red");
        valid = false;
    } else {
        log(`✓ Project ID: ${config.projectId}`, "green");
    }

    if (!config.topicName) {
        log("✗ GOOGLE_PUBSUB_TOPIC_NAME not set in .env", "red");
        valid = false;
    } else {
        log(`✓ Topic Name: ${config.topicName}`, "green");
    }

    if (config.webhookUrl) {
        log(`✓ Webhook URL: ${config.webhookUrl}`, "green");

        // Validate webhook URL format
        try {
            const url = new URL(config.webhookUrl);
            if (!url.pathname.includes("/gmail-push")) {
                log(
                    "⚠ Warning: Webhook URL should end with /gmail-push",
                    "yellow",
                );
            }
        } catch (error) {
            log(`✗ Invalid webhook URL format: ${error.message}`, "red");
            valid = false;
        }
    } else {
        log("⚠ GMAIL_PUSH_WEBHOOK_URL not set, using default", "yellow");
    }

    return valid;
}

async function createPubSubTopic(pubsub) {
    logSection("Creating Pub/Sub Topic");

    try {
        const [topicExists] = await pubsub.topic(config.topicName).exists();

        if (topicExists) {
            log(`✓ Topic already exists: ${config.topicName}`, "green");

            // Get topic details
            const [metadata] = await pubsub
                .topic(config.topicName)
                .getMetadata();
            log(
                `  Created: ${new Date(metadata.created).toISOString()}`,
                "blue",
            );

            return true;
        } else {
            log(`Creating topic: ${config.topicName}...`, "cyan");

            const [topic] = await pubsub.createTopic(config.topicName);

            log(`✓ Topic created successfully!`, "green");
            log(`  Full path: ${topic.name}`, "blue");

            return true;
        }
    } catch (error) {
        log(`✗ Failed to create topic: ${error.message}`, "red");

        if (error.code === 403 || error.message.includes("Permission")) {
            log("\n⚠ Permission Error:", "yellow");
            log("  Your credentials may lack Pub/Sub permissions.", "yellow");
            log("  Grant these roles in Google Cloud Console IAM:", "yellow");
            log("    - Pub/Sub Editor", "yellow");
            log("    - or Pub/Sub Publisher + Pub/Sub Subscriber", "yellow");
        } else if (error.code === 404) {
            log("\n⚠ Project Not Found:", "yellow");
            log(`  Verify project ID: ${config.projectId}`, "yellow");
            log(
                "  Make sure the project exists in Google Cloud Console.",
                "yellow",
            );
        }

        return false;
    }
}

async function createPubSubSubscription(pubsub) {
    logSection("Creating Pub/Sub Subscription");

    try {
        const subscription = pubsub.subscription(config.subscriptionName);
        const [subscriptionExists] = await subscription.exists();

        if (subscriptionExists) {
            log(
                `✓ Subscription already exists: ${config.subscriptionName}`,
                "green",
            );

            // Get current metadata to check push endpoint
            const [metadata] = await subscription.getMetadata();

            if (
                metadata.pushConfig &&
                metadata.pushConfig.pushEndpoint === config.webhookUrl
            ) {
                log(
                    `  Push endpoint: ${metadata.pushConfig.pushEndpoint}`,
                    "blue",
                );
                return true;
            } else {
                log(
                    "⚠ Subscription exists but push endpoint may be outdated",
                    "yellow",
                );
                log("  Updating push endpoint...", "cyan");

                await subscription.setPushEndpoint(config.webhookUrl);
                log(
                    `✓ Push endpoint updated to: ${config.webhookUrl}`,
                    "green",
                );
            }

            return true;
        } else {
            log(`Creating subscription: ${config.subscriptionName}...`, "cyan");
            log(`  Topic: ${config.topicName}`, "blue");
            log(`  Push endpoint: ${config.webhookUrl}`, "blue");

            const [sub] = await pubsub.createSubscription(
                config.subscriptionName,
                config.topicName,
                {
                    pushConfig: {
                        pushEndpoint: config.webhookUrl,
                    },
                    ackDeadlineSeconds: 10, // Google requires response within 10 seconds
                },
            );

            log(`✓ Subscription created successfully!`, "green");
            log(`  Full path: ${sub.name}`, "blue");

            return true;
        }
    } catch (error) {
        log(`✗ Failed to create subscription: ${error.message}`, "red");

        if (error.code === 403 || error.message.includes("Permission")) {
            log("\n⚠ Permission Error:", "yellow");
            log("  Your credentials may lack Pub/Sub permissions.", "yellow");
            log("  Grant these roles in Google Cloud Console IAM:", "yellow");
            log("    - Pub/Sub Editor", "yellow");
            log("    - or Pub/Sub Publisher + Pub/Sub Subscriber", "yellow");
        } else if (error.code === 404) {
            log("\n⚠ Topic Not Found:", "yellow");
            log(`  Verify topic exists: ${config.topicName}`, "yellow");
            log("  Run this script again after creating the topic.", "yellow");
        } else if (error.message.includes("pushEndpoint")) {
            log("\n⚠ Push Endpoint Error:", "yellow");
            log("  The webhook URL may not be publicly accessible.", "yellow");
            log("  Google validates push endpoints during creation.", "yellow");
            log("  Options:", "yellow");
            log("    - Use a public HTTPS URL (production)", "yellow");
            log("    - Use ngrok for local testing: ngrok http 8080", "yellow");
            log(
                "    - Create subscription without push endpoint, then update manually",
                "yellow",
            );
        }

        return false;
    }
}

async function createSubscriptionWithoutPush(pubsub) {
    logSection("Creating Subscription (No Push Endpoint)");

    try {
        const [subscription] = await pubsub.createSubscription(
            config.subscriptionName,
            config.topicName,
            {
                ackDeadlineSeconds: 10,
            },
        );

        log(`✓ Pull subscription created successfully!`, "green");
        log(`  Full path: ${subscription.name}`, "blue");
        log("\n⚠ Note:", "yellow");
        log("  This is a pull subscription (no push endpoint).", "yellow");
        log(
            "  To enable push notifications, update it manually in Google Cloud Console:",
            "yellow",
        );
        log(
            `    https://console.cloud.google.com/cloudpubsub/subscription/detail/${config.subscriptionName}`,
            "blue",
        );
        log("\n  Or use gcloud CLI:", "yellow");
        log(
            `    gcloud pubsub subscriptions update ${config.subscriptionName} \\`,
            "white",
        );
        log(`      --push-endpoint=${config.webhookUrl} \\`, "white");
        log(`      --project=${config.projectId}`, "white");

        return true;
    } catch (error) {
        log(`✗ Failed to create pull subscription: ${error.message}`, "red");
        return false;
    }
}

async function verifySetup(pubsub) {
    logSection("Verification");

    try {
        // Check topic exists
        const [topicExists] = await pubsub.topic(config.topicName).exists();

        if (topicExists) {
            log(`✓ Topic exists: ${config.topicName}`, "green");

            // List subscriptions for this topic
            const [subscriptions] = await pubsub
                .topic(config.topicName)
                .getSubscriptions();

            if (subscriptions.length > 0) {
                log(
                    `✓ Found ${subscriptions.length} subscription(s):`,
                    "green",
                );

                for (const sub of subscriptions) {
                    const subName = sub.name.split("/").pop();
                    const [metadata] = await sub.getMetadata();

                    let status = "✓";
                    let color = "green";

                    if (
                        metadata.pushConfig &&
                        metadata.pushConfig.pushEndpoint
                    ) {
                        log(
                            `  ${status} ${subName} (Push: ${metadata.pushConfig.pushEndpoint})`,
                            color,
                        );
                    } else {
                        status = "⚠";
                        color = "yellow";
                        log(
                            `  ${status} ${subName} (Pull subscription - no push endpoint)`,
                            color,
                        );
                    }
                }
            } else {
                log("⚠ No subscriptions found for this topic", "yellow");
            }
        } else {
            log("✗ Topic does not exist", "red");
        }
    } catch (error) {
        log(`✗ Verification failed: ${error.message}`, "red");
    }
}

async function main() {
    logSection("Gmail Pub/Sub Setup Script");

    // Validate configuration first
    if (!validateConfig()) {
        log(
            "\n⚠ Configuration validation failed. Please fix the issues above.",
            "yellow",
        );
        log("\nRequired environment variables in .env:", "blue");
        log("  GOOGLE_PROJECT_ID=rag-project-496000", "white");
        log(
            "  GOOGLE_PUBSUB_TOPIC_NAME=projects/rag-project-496000/topics/gmail-push-topic",
            "white",
        );
        log(
            "  GMAIL_PUSH_WEBHOOK_URL=https://mcp.spencerheywood.com/gmail-push",
            "white",
        );
        process.exit(1);
    }

    // Initialize Pub/Sub client
    let pubsub;
    try {
        pubsub = new PubSub({
            projectId: config.projectId,
        });

        log("\n✓ Connected to Google Cloud Pub/Sub", "green");
        log(`  Project: ${config.projectId}`, "blue");
    } catch (error) {
        log(`\n✗ Failed to connect to Pub/Sub: ${error.message}`, "red");
        log("\n⚠ Authentication Error:", "yellow");
        log("  Make sure you have one of these configured:", "yellow");
        log(
            "    1. gcloud CLI authenticated: gcloud auth application-default login",
            "white",
        );
        log(
            "    2. GOOGLE_APPLICATION_CREDENTIALS environment variable set",
            "white",
        );
        log("    3. Service account key file configured", "white");
        process.exit(1);
    }

    // Create topic
    const topicCreated = await createPubSubTopic(pubsub);

    if (!topicCreated) {
        log(
            "\n⚠ Topic creation failed. Cannot proceed without topic.",
            "yellow",
        );
        process.exit(1);
    }

    // Try to create subscription with push endpoint first
    let subscriptionCreated = await createPubSubSubscription(pubsub);

    // If push endpoint fails (often due to validation), try pull subscription
    if (!subscriptionCreated) {
        log("\n⚠ Push subscription creation failed.", "yellow");
        log("  Falling back to pull subscription...", "cyan");

        subscriptionCreated = await createSubscriptionWithoutPush(pubsub);
    }

    // Verify the setup
    await verifySetup(pubsub);

    // Final summary
    logSection("Setup Complete!");

    if (subscriptionCreated) {
        log("\n🎉 Pub/Sub resources created successfully!", "green");
        log("\nNext steps:", "blue");
        log("  1. Get your OAuth refresh token:", "white");
        log("     node get-gmail-refresh-token.js", "cyan");
        log("  2. Add GOOGLE_REFRESH_TOKEN to .env file", "white");
        log("  3. Validate setup:", "white");
        log("     node validate-gmail-setup.js", "cyan");
        log("  4. Start your server:", "white");
        log("     npm start", "cyan");
    } else {
        log("\n⚠ Setup completed with warnings.", "yellow");
        log(
            "  Please review the errors above and fix them manually if needed.",
            "yellow",
        );
    }

    // Close Pub/Sub client
    pubsub.close();
}

// Run the script
main()
    .then(() => process.exit(0))
    .catch((error) => {
        log(`\n✗ Script failed with error: ${error.message}`, "red");
        console.error(error);
        process.exit(1);
    });
