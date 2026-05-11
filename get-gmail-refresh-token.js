/**
 * Gmail OAuth Refresh Token Generator
 *
 * This script helps you obtain a refresh token for Gmail Push Notifications.
 * The refresh token allows your application to access Gmail API without user interaction.
 *
 * Usage:
 *   1. Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in .env
 *   2. Run: node get-gmail-refresh-token.js
 *   3. Follow the instructions in your browser
 *   4. Copy the refresh token printed to terminal
 *   5. Add it to your .env file as GOOGLE_REFRESH_TOKEN
 */

require("dotenv").config();
const { google } = require("googleapis");
const express = require("express");
const { exec } = require("child_process");
const os = require("os");

// Configuration
const PORT = 8081; // Use different port than main app to avoid conflicts
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

// Required scopes for Gmail Push Notifications
// Note: gmail.watch is not a standalone scope - use gmail.modify which includes watch capability
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

// Validate required environment variables
if (!process.env.GOOGLE_CLIENT_ID) {
    console.error("❌ Error: GOOGLE_CLIENT_ID not found in .env file");
    console.error("   Please add your Google OAuth Client ID to .env");
    process.exit(1);
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
    console.error("❌ Error: GOOGLE_CLIENT_SECRET not found in .env file");
    console.error("   Please add your Google OAuth Client Secret to .env");
    process.exit(1);
}

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI,
);

// Helper function to open browser (replaces 'open' package)
function openBrowser(url) {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        let command;

        if (platform === "win32") {
            command = `start "" "${url}"`;
        } else if (platform === "darwin") {
            command = `open "${url}"`;
        } else {
            // Linux and other Unix-like systems
            command = `xdg-open "${url}"`;
        }

        exec(command, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

// Generate authorization URL
const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force refresh token generation every time
});

console.log("\n" + "=".repeat(70));
console.log("  Gmail OAuth Refresh Token Generator");
console.log("=".repeat(70) + "\n");

console.log("📋 Step 1: Opening browser for authorization...\n");
console.log("   If the browser does not open automatically, visit this URL:\n");
console.log(`   ${authUrl}\n`);

// Create Express server to handle OAuth callback
const app = express();

app.get("/oauth2callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        console.error("\n❌ Error: No authorization code received");
        console.error(
            "   The authorization flow was not completed successfully.",
        );
        console.error("   Please try again.\n");

        res.status(400).send(`
            <!DOCTYPE html>
            <html>
                <head><title>OAuth Error</title></head>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                    <h1 style="color: #d93025;">❌ Authorization Failed</h1>
                    <p>No authorization code was received from Google.</p>
                    <p>Please close this window and try running the script again.</p>
                    <p><small>If you see "redirect_uri_mismatch", make sure to add this URL to your OAuth client:</small></p>
                    <code style="background: #f1f3f4; padding: 5px 10px; display: block; margin: 10px 0;">${REDIRECT_URI}</code>
                </body>
            </html>
        `);

        server.close();
        process.exit(1);
        return;
    }

    try {
        console.log(
            "\n📋 Step 2: Exchanging authorization code for tokens...\n",
        );

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        // Success! Display the refresh token
        console.log("✅ SUCCESS! Your OAuth credentials:\n");
        console.log("-".repeat(70));
        console.log("\n📝 Add this to your .env file:");
        console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
        console.log("\n" + "-".repeat(70) + "\n");

        // Also show other useful info
        if (tokens.access_token) {
            console.log("ℹ️  Access Token (temporary, auto-refreshed):");
            console.log(tokens.access_token.substring(0, 50) + "...");
            console.log("\n");
        }

        // Check expiration
        if (tokens.expiry_date) {
            const expiry = new Date(tokens.expiry_date);
            console.log("ℹ️  Token expires at: " + expiry.toISOString());
            console.log("\n");
        }

        console.log("🎉 Next Steps:\n");
        console.log("   1. Copy the GOOGLE_REFRESH_TOKEN value above");
        console.log("   2. Add it to your .env file:");
        console.log(`      GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log(
            "\n   3. Also add these remaining variables if not already set:",
        );
        console.log(
            "      GOOGLE_PUBSUB_TOPIC_NAME=projects/rag-project-496000/topics/gmail-push-topic",
        );
        console.log("      GMAIL_PUSH_WEBHOOK_PORT=8080");
        console.log("\n   4. Restart your RAG endpoint server: npm start");
        console.log(
            "   5. Test by sending an email with [prompt] in the subject\n",
        );

        res.send(`
            <!DOCTYPE html>
            <html>
                <head><title>OAuth Success</title></head>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                    <h1 style="color: #188038;">✅ Authorization Successful!</h1>
                    <p>Your refresh token has been printed to the terminal.</p>
                    <p><strong>Please copy it from your terminal and add it to your .env file.</strong></p>
                    <hr>
                    <h3>Next Steps:</h3>
                    <ol>
                        <li>Add <code>GOOGLE_REFRESH_TOKEN</code> to your .env file</li>
                        <li>Add <code>GOOGLE_PUBSUB_TOPIC_NAME=projects/rag-project-496000/topics/gmail-push-topic</code></li>
                        <li>Restart your server: <code>npm start</code></li>
                        <li>Test by sending an email with <code>[prompt]</code> in the subject</li>
                    </ol>
                    <p style="color: #666; margin-top: 30px;"><small>You can now close this browser window.</small></p>
                </body>
            </html>
        `);

        server.close();
        process.exit(0);
    } catch (error) {
        console.error("\n❌ Error exchanging token:", error.message);
        console.error("   Details:", error.response?.data || error);

        res.status(500).send(`
            <!DOCTYPE html>
            <html>
                <head><title>OAuth Error</title></head>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                    <h1 style="color: #d93025;">❌ Token Exchange Failed</h1>
                    <p>An error occurred while exchanging the authorization code.</p>
                    <p>Error: ${error.message}</p>
                    <p>Please check your terminal for more details and try again.</p>
                </body>
            </html>
        `);

        server.close();
        process.exit(1);
    }
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(
        `🚀 OAuth callback server running on http://localhost:${PORT}\n`,
    );

    // Try to open browser automatically
    openBrowser(authUrl).catch(() => {
        console.log("⚠️  Could not open browser automatically.");
        console.log(
            "   Please copy and paste the URL above into your browser.\n",
        );
    });
});

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\n\n⚠️  Interrupted by user. Server shutting down...\n");
    server.close();
    process.exit(0);
});

process.on("uncaughtException", (error) => {
    console.error("\n❌ Uncaught error:", error.message);
    server.close();
    process.exit(1);
});
