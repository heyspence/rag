# Send Email Functionality Guide for Agents

This document provides comprehensive guidance for AI agents on how to use the `send_email` functionality in the RAG Endpoint project. The email system is powered by AWS Simple Email Service (SES) and allows sending emails from the configured @bookservo.com address.

---

## Table of Contents

1. [Overview](#overview)
2. [Available Tools](#available-tools)
3. [Configuration Requirements](#configuration-requirements)
4. [Tool Usage Reference](#tool-usage-reference)
5. [Usage Examples](#usage-examples)
6. [Error Handling & Troubleshooting](#error-handling--troubleshooting)
7. [Best Practices for Agents](#best-practices-for-agents)

---

## Overview

The RAG Endpoint project includes email capabilities that allow agents to send emails programmatically using AWS SES. This is useful for:

- Sending notifications and alerts
- Delivering search results or summaries via email
- Automated reporting
- User communications triggered by LLM interactions

**Default Sender Email:** `contact@spencerheywood.com` (configurable via AWS_FROM_EMAIL)  
**AWS Region:** `us-east-2` (configurable via AWS_REGION)  
**Default Recipient:** `spencer.heywood2000@gmail.com` (optional, configurable via DEFAULT_EMAIL_RECIPIENT)

---

## Available Tools

The following MCP tools are available for email operations:

| Tool Name | Description | Required Parameters |
|-----------|-------------|---------------------|
| `send_email` | Send a single email to one or more recipients | `subject`, `body` (`to` is optional) |
| `send_bulk_email` | Send the same email to multiple recipients | `recipients`, `subject`, `body` |
| `check_email_status` | Verify AWS SES configuration status | None |

---

## Configuration Requirements

Before using email tools, ensure the following are configured in the project's `.env` file:

### Required Environment Variables

```env
# AWS Credentials (API credentials, NOT SMTP)
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here

# AWS Region for SES
AWS_REGION=us-east-2

# Default sender email (must be verified in AWS SES)
AWS_FROM_EMAIL=contact@spencerheywood.com

# Optional: Default recipient if 'to' parameter is omitted
DEFAULT_EMAIL_RECIPIENT=spencer.heywood2000@gmail.com
```

### AWS SES Setup Requirements

1. **Verify Sender Email:** The `from` email address must be verified in the AWS SES console.
2. **Production Access:** If sending to unverified recipients, request production access from AWS SES (sandbox mode only allows verified recipients).
3. **IAM Permissions:** Ensure the IAM user/role has `ses:SendEmail` permissions.

---

## Tool Usage Reference

### 1. send_email

Sends a single email using AWS SES.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string | Optional | Recipient email address. If omitted, uses `DEFAULT_EMAIL_RECIPIENT` from .env. |
| `subject` | string | Yes | Email subject line. |
| `body` | string | Yes | Plain text body content. |
| `htmlBody` | string | No | Optional HTML body content (supports both plain text and HTML). |
| `from` | string | No | Sender email address. Defaults to configured `AWS_FROM_EMAIL`. |

**Return Value:**

```json
{
  "success": true,
  "messageId": "string",
  "to": ["recipient@example.com"],
  "from": "contact@spencerheywood.com",
  "subject": "Email Subject"
}
```

---

### 2. send_bulk_email

Sends the same email content to multiple recipients individually.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipients` | array of strings | Yes | Array of recipient email addresses. |
| `subject` | string | Yes | Email subject line. |
| `body` | string | Yes | Plain text body content. |
| `htmlBody` | string | No | Optional HTML body content. |

**Return Value:**

```json
{
  "total": 5,
  "successful": 4,
  "failed": 1,
  "results": [
    {
      "recipient": "user1@example.com",
      "status": "sent",
      "messageId": "string"
    },
    {
      "recipient": "user2@example.com",
      "status": "failed",
      "error": "Error message"
    }
  ]
}
```

---

### 3. check_email_status

Checks the current configuration status of the AWS SES email service.

**Parameters:** None

**Return Value:**

```json
{
  "configured": true,
  "region": "us-east-2",
  "fromEmail": "contact@spencerheywood.com",
  "defaultRecipient": "spencer.heywood2000@gmail.com",
  "credentialsStatus": {
    "accessKeyId": "Set",
    "secretAccessKey": "Set"
  }
}
```

---

## Usage Examples

### Example 1: Simple Text Email with Default Recipient

Send a basic plain text email (uses DEFAULT_EMAIL_RECIPIENT from .env):

```
send_email(
  subject: "Welcome to BookServo",
  body: "Hello,\n\nThank you for signing up! We're excited to have you on board.\n\nBest regards,\nThe BookServo Team"
)
```

### Example 1b: Email with Specific Recipient

Send a basic plain text email to a specific recipient:

```
send_email(
  to: "john.doe@example.com",
  subject: "Welcome to BookServo",
  body: "Hello John,\n\nThank you for signing up! We're excited to have you on board.\n\nBest regards,\nThe BookServo Team"
)
```

---

### Example 2: Email with HTML Content

Send an email with both plain text and HTML versions:

```
send_email(
  to: "jane.smith@example.com",
  subject: "Your Monthly Report is Ready",
  body: "Hi Jane,\n\nYour monthly report has been generated and is ready for review.\n\nRegards,\nAutomated System",
  htmlBody: "<html><body><h2>Monthly Report</h2><p>Hi Jane,</p><p>Your <strong>monthly report</strong> has been generated and is ready for review.</p><p>Regards,<br/>Automated System</p></body></html>"
)
```

### Example 3: Email to Multiple Recipients (Single Call)

Send an email to multiple recipients using the `to` parameter as an array:

```
send_email(
  to: "team@example.com",
  subject: "Project Update Required",
  body: "Please submit your project updates by end of day."
)
```

---

### Example 6: Send Test Email to Default Recipient

Quick test to verify email service is working (sends to DEFAULT_EMAIL_RECIPIENT):

```
send_email(
  subject: "[TEST] Email Service Check",
  body: "This is a test email sent to the default recipient configured in .env."
)
```

## Debug Information

The email service logs detailed information to help diagnose issues:

```
[Email Service] ========================================
[Email Service] SEND EMAIL REQUEST
[Email Service] ========================================
[Email Service] Using region: us-east-2
[Email Service] From address: contact@spencerheywood.com
[Email Service] To: spencer.heywood2000@gmail.com (default recipient)
[Email Service] Subject: Test Email
[Email Service] Credentials source: .env file only
```

---

### Example 4: Bulk Email Campaign

Send the same email individually to multiple recipients (each receives their own email):

```
send_bulk_email(
  recipients: ["user1@example.com", "user2@example.com", "user3@example.com"],
  subject: "Newsletter - December 2024",
  body: "Dear Subscriber,\n\nHere are this month's highlights...\n\nUnsubscribe: http://example.com/unsubscribe",
  htmlBody: "<html><body><h1>December Newsletter</h1><p>Dear Subscriber,</p><p>Here are this month's <strong>highlights</strong>...</p></body></html>"
)
```

---

### Example 5: Check Email Configuration Before Sending

Before attempting to send emails, verify the service is properly configured:

```
check_email_status()
```

If `configured` returns `false`, check that AWS credentials are set in `.env`.

---

## Error Handling & Troubleshooting

### Common Errors and Solutions

#### 1. SecurityTokenInvalid Error

**Symptom:** "The security token included in the request is invalid"

**Causes:**
- Using SMTP credentials instead of API credentials
- Expired temporary credentials (STS)
- Incorrect credential format

**Solution:**
```
- Verify AWS_ACCESS_KEY_ID starts with 'AKIA' (not SMTP username)
- Check that AWS_SECRET_ACCESS_KEY matches the access key ID
- Ensure you're using API credentials from IAM, NOT SMTP credentials
- If using temporary credentials, regenerate them
```

---

#### 2. NotAuthorizedException / MessageRejected Error

**Symptom:** "NotAuthorizedException" or "MessageRejected"

**Causes:**
- Sender email not verified in AWS SES
- Recipient email not verified (when in SES Sandbox mode)
- Need production access from AWS

**Solution:**
```
- Verify sender email at: https://console.aws.amazon.com/ses/
- If in sandbox, verify all recipient emails too
- Request production access to send to unverified recipients
```

---

#### 3. InvalidClientTokenId Error

**Symptom:** "InvalidClientTokenId"

**Causes:**
- AWS_ACCESS_KEY_ID does not exist or is invalid
- Credentials were deleted or deactivated

**Solution:**
```
- Regenerate credentials in AWS IAM Console
- Ensure both Access Key ID and Secret Access Key are copied together
```

---

#### 4. SignatureDoesNotMatch Error

**Symptom:** "SignatureDoesNotMatch"

**Causes:**
- The AWS_SECRET_ACCESS_KEY does not match the access key ID
- Credentials were copied incorrectly (extra spaces, line breaks)

**Solution:**
```
- Copy both values together from AWS IAM Console
- Ensure no extra whitespace or characters in .env file
```

---

#### 5. No Recipient Specified Error

**Symptom:** "No recipient specified"

**Causes:**
- `to` parameter not provided and no DEFAULT_EMAIL_RECIPIENT configured

**Solution:**
```
- Always provide a 'to' parameter with at least one email address
- OR set DEFAULT_EMAIL_RECIPIENT in .env file
```

---

### Debug Information

The email service logs detailed information to help diagnose issues:

```
[Email Service] ========================================
[Email Service] SEND EMAIL REQUEST
[Email Service] ========================================
[Email Service] Using region: us-east-2
[Email Service] From address: noreply@bookservo.com
[Email Service] To: recipient@example.com
[Email Service] Subject: Test Email
[Email Service] Credentials source: .env file only
```

---

## Best Practices for Agents

### 1. Always Check Configuration First

Before sending emails, verify the service is configured:

```
check_email_status()
```

Only proceed with `send_email` if `configured` returns `true`.

---

### 2. Validate Email Addresses

Ensure email addresses are properly formatted before calling send functions:

- Must contain exactly one `@` symbol
- Domain must have a valid TLD (e.g., `.com`, `.org`)
- No spaces or invalid characters

Example of valid emails:
- `user@example.com`
- `john.doe+tag@company.co.uk`

---

### 3. Use Appropriate Content Types

**Plain Text:** Always provide a plain text `body` for accessibility and compatibility.

**HTML:** Add `htmlBody` when rich formatting is needed (bold, links, tables, etc.).

---

### 4. Handle Errors Gracefully

When an email send fails:
1. Log the error details
2. Check if it's a configuration issue vs. transient failure
3. For bulk emails, check individual results in the response
4. Do not retry indefinitely - report failures to the user

---

### 5. Respect Rate Limits

AWS SES has sending limits:
- **Sandbox:** 200 messages per day, 1 message per second
- **Production:** Higher limits based on your account

For bulk operations, consider batching large recipient lists.

---

### 6. Security Considerations

**NEVER do the following:**
- Do not hardcode credentials in code or logs
- Do not expose `.env` file contents
- Do not send sensitive information (passwords, credit cards) via email
- Do not use email for spam or unsolicited bulk messaging

---

### 7. Email Content Guidelines

When composing emails:
- Keep subject lines concise and descriptive (under 100 characters)
- Include a clear call-to-action if applicable
- Add unsubscribe information for marketing emails
- Test with both plain text and HTML versions

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    EMAIL TOOL QUICK REFERENCE               │
├─────────────────────────────────────────────────────────────┤
│ check_email_status()                                        │
│   → Returns: {configured, region, fromEmail, credentials}  │
├─────────────────────────────────────────────────────────────┤
│ send_email({to?, subject, body, htmlBody?, from?})          │
│   → Required: subject, body                                 │
│   → Optional: to (uses DEFAULT_EMAIL_RECIPIENT), htmlBody, from │
├─────────────────────────────────────────────────────────────┤
│ send_bulk_email({recipients, subject, body, htmlBody?})     │
│   → Required: recipients (array), subject, body             │
│   → Optional: htmlBody                                      │
└─────────────────────────────────────────────────────────────┘

Common Errors:
  • SecurityTokenInvalid → Check AWS credentials format
  • NotAuthorizedException → Verify sender in SES console
  • InvalidClientTokenId → Regenerate IAM credentials
  • SignatureDoesNotMatch → Re-copy both credential values
```

---

## Related Documentation

- `AWS_SES_SETUP.md` - Detailed guide for setting up AWS SES
- `AWS_SES_CREDENTIAL_SETUP.md` - Step-by-step credential configuration
- `README.md` - Main project documentation with MCP tool overview

---

*Last Updated: May 2025*  
*Maintained by: RAG Endpoint Development Team*