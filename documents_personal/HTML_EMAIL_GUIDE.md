# HTML Email Guide for LLMs

## Overview

**IMPORTANT**: All emails sent via the `send_email` tool MUST be styled HTML documents for professional formatting. Plain text emails are no longer accepted.

This guide provides everything you need to know about generating and sending styled HTML emails through the RAG endpoint's email service.

---

## Required Parameters

When calling the `send_email` tool, you must provide:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subject` | string | ✅ Yes | Email subject line |
| `body` | string | ✅ Yes | Plain text fallback content |
| `htmlBody` | string | ✅ **Yes** | Styled HTML content with inline CSS |
| `to` | string | ❌ No | Recipient email (uses DEFAULT_EMAIL_RECIPIENT if omitted) |
| `from` | string | ❌ No | Sender email (defaults to configured FROM_EMAIL) |

---

## Helper Functions

The email service provides two helper functions to generate professionally styled HTML:

### 1. `generateStyledHTML(options)` - Professional Template

Best for formal communications, notifications, and important messages.

**Usage:**
```javascript
const htmlBody = EmailService.generateStyledHTML({
    title: "Your Subject Here",
    content: "<p>Your main content with <strong>HTML formatting</strong>...</p>",
    footer: "This email was sent automatically. Please do not reply.",
    primaryColor: "#2563eb"  // Optional, defaults to blue
});
```

**Features:**
- Centered layout with white card on gray background
- Professional header with colored bottom border
- Clean typography with proper spacing
- Optional footer section
- Box shadow for depth
- Mobile-responsive design

### 2. `generateSimpleHTML(subject, bodyText)` - Quick Conversion

Best for simple messages or when converting plain text quickly.

**Usage:**
```javascript
const htmlBody = EmailService.generateSimpleHTML(
    "Meeting Reminder",
    "This is a reminder for our meeting tomorrow at 2 PM.\n\nPlease bring the quarterly reports."
);
```

**Features:**
- Automatic paragraph conversion from plain text
- Simple card layout
- Clean, minimal styling
- Fast generation

---

## Complete Example

Here's a complete example of sending a styled email:

```javascript
// Generate the HTML content
const htmlBody = EmailService.generateStyledHTML({
    title: "Project Update - Q2 Review",
    content: `
        <p>Dear Team,</p>
        
        <p>I'm pleased to share our <strong>Q2 progress update</strong>:</p>
        
        <ul>
            <li>Completed 15 major features</li>
            <li>Achieved 98% uptime SLA</li>
            <li>On track for Q3 milestones</li>
        </ul>
        
        <p>Please review the attached documentation and provide feedback by Friday.</p>
        
        <p>Best regards,<br/>Project Management Team</p>
    `,
    footer: "This is an automated notification from the RAG system. Contact admin@example.com for questions.",
    primaryColor: "#10b981"  // Green accent color
});

// Send the email
await EmailService.sendEmail({
    to: "team@example.com",
    subject: "Project Update - Q2 Review",
    body: "Dear Team, I'm pleased to share our Q2 progress update...",
    htmlBody: htmlBody
});
```

---

## HTML Best Practices for Email

### 1. Use Inline CSS Only

Email clients have limited support for `<style>` tags and external stylesheets. Always use inline styles:

✅ **Good:**
```html
<p style="color: #333; font-size: 16px;">Content</p>
```

❌ **Bad:**
```html
<style> p { color: #333; } </style>
<p class="text">Content</p>
```

### 2. Use Tables for Layout

While modern email clients support flexbox and grid, tables remain the most compatible option:

✅ **Good:**
```html
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
    <tr><td>Your content</td></tr>
</table>
```

### 3. Include Fallback Fonts

Always specify font stacks with web-safe fallbacks:

```html
style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"
```

### 4. Use Absolute Colors

Avoid relative colors like `currentColor`. Use hex codes or named colors:

✅ **Good:**
- `#2563eb` (hex)
- `blue` (named)

❌ **Bad:**
- `currentColor`
- `inherit`

### 5. Test Email Client Compatibility

The helper functions use techniques compatible with:
- Gmail (web & mobile)
- Outlook (desktop & web)
- Apple Mail
- Yahoo Mail
- Thunderbird

---

## Color Palette Recommendations

Here are some professional color combinations:

| Purpose | Primary Color | Example Use Case |
|---------|---------------|------------------|
| Corporate/Professional | `#2563eb` (blue) | Business notifications |
| Success/Confirmation | `#10b981` (green) | Order confirmations |
| Warning/Alert | `#f59e0b` (amber) | System alerts |
| Error/Urgent | `#ef4444` (red) | Critical notifications |
| Neutral/General | `#6b7280` (gray) | General updates |

---

## Common Email Templates

### Meeting Invitation

```javascript
const htmlBody = EmailService.generateStyledHTML({
    title: "Meeting Invitation",
    content: `
        <p>You are invited to attend:</p>
        <h2 style="color: #2563eb; margin: 20px 0;">${meetingTitle}</h2>
        <table style="margin: 20px 0;" cellpadding="5">
            <tr><td><strong>Date:</strong></td><td>${date}</td></tr>
            <tr><td><strong>Time:</strong></td><td>${time}</td></tr>
            <tr><td><strong>Location:</strong></td><td>${location}</td></tr>
        </table>
        <p>Please confirm your attendance by replying to this email.</p>
    `,
    footer: "Calendar invite attached separately."
});
```

### Notification Alert

```javascript
const htmlBody = EmailService.generateStyledHTML({
    title: "System Notification",
    content: `
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>⚠️ Attention Required</strong>
        </div>
        <p>${message}</p>
        <a href="${actionUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px;">Take Action</a>
    `,
    footer: "If you did not request this action, please ignore this email.",
    primaryColor: "#f59e0b"
});
```

### Welcome Email

```javascript
const htmlBody = EmailService.generateStyledHTML({
    title: "Welcome to Our Service!",
    content: `
        <p>Hi ${userName},</p>
        <p>Welcome aboard! We're excited to have you join our community.</p>
        <p>Here are some quick links to get you started:</p>
        <ul>
            <li><a href="${dashboardUrl}">Dashboard</a></li>
            <li><a href="${docsUrl}">Documentation</a></li>
            <li><a href="${supportUrl}">Support Center</a></li>
        </ul>
    `,
    footer: "Need help? Reply to this email or visit our support center.",
    primaryColor: "#10b981"
});
```

---

## Troubleshooting

### Error: "Missing required parameters. 'htmlBody' is required"

**Solution**: Always provide the `htmlBody` parameter when calling `send_email`. Use one of the helper functions to generate it.

### Email renders poorly in Outlook

**Cause**: Outlook uses Microsoft Word's rendering engine which has limited CSS support.

**Solution**: The helper functions already use table-based layouts and inline styles for maximum compatibility. If you write custom HTML, follow the best practices above.

### Images not displaying

**Best Practice**: Avoid images when possible. If you must include them:
1. Host images on a public HTTPS URL
2. Always include `alt` text
3. Use explicit width/height attributes
4. Provide fallback text

---

## Quick Reference

### Minimal Valid Email Call

```javascript
await EmailService.sendEmail({
    subject: "Test",
    body: "Test message",
    htmlBody: EmailService.generateSimpleHTML("Test", "Test message")
});
```

### Professional Email Call

```javascript
await EmailService.sendEmail({
    to: "recipient@example.com",
    subject: "Important Update",
    body: "Plain text version...",
    htmlBody: EmailService.generateStyledHTML({
        title: "Important Update",
        content: "<p>Rich HTML content...</p>",
        footer: "Automated message"
    })
});
```

---

## Summary

1. **Always** use `htmlBody` parameter - it's now required
2. **Use helper functions** (`generateStyledHTML` or `generateSimpleHTML`) for consistent formatting
3. **Inline CSS only** - no external stylesheets or `<style>` tags
4. **Test your emails** by sending to multiple email clients
5. **Keep it simple** - complex layouts may not render correctly everywhere

For more information, see the main project documentation in `core/README.md`.

---

*Last Updated: 2026-05-10*  
*RAG Endpoint Email Service v1.0*