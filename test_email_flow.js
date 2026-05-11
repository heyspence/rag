// Test script to verify IMAP email flow
require('dotenv').config();
const EmailService = require('./emailService');

async function testIMAPConnection() {
    console.log('=== Testing IMAP Connection ===\n');
    
    try {
        // Create connection
        const imapClient = await EmailService.createIMAPConnection({
            HOST: process.env.IMAP_HOST,
            PORT: process.env.IMAP_PORT,
            USER: process.env.IMAP_USER,
            PASSWORD: process.env.IMAP_PASSWORD,
            FOLDER: 'INBOX'
        });
        
        console.log('✓ IMAP connection created successfully\n');
        
        // Start polling (which will open INBOX)
        await EmailService.startIMAPIdle(imapClient, (email) => {
            console.log('New email callback triggered:', email.subject);
        }, '[prompt]');
        
        console.log('✓ IMAP polling started successfully\n');
        
        // Wait 15 seconds to see if any new emails are detected
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // Stop connection
        EmailService.stopIMAPConnection();
        
        console.log('\n=== Test Complete ===');
        process.exit(0);
    } catch (error) {
        console.error('✗ Test failed:', error.message);
        process.exit(1);
    }
}

testIMAPConnection();
