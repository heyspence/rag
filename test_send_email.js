require('dotenv').config();
const { sendEmail } = require('./emailService');

async function sendTestEmail() {
    try {
        console.log("Sending test email with [prompt] tag...");
        console.log("From:", process.env.FROM_EMAIL);
        console.log("To: spencer.heywood2000@gmail.com");
        
        const result = await sendEmail({
            to: "spencer.heywood2000@gmail.com",
            subject: "[prompt] Test RAG endpoint - Can you find documents about AI?",
            body: "This is an automated test email to verify the IMAP receiving system works correctly.\n\nQuestion: What do I know about artificial intelligence and machine learning?\n\nTest ID: " + new Date().toISOString()
        });
        
        console.log("✓ Email sent successfully!");
        console.log("Message ID:", result.messageId);
    } catch (error) {
        console.error("✗ Failed to send email:", error.message);
        process.exit(1);
    }
}

sendTestEmail();
