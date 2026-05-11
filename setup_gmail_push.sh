#!/bin/bash

# Gmail Push Notifications Setup Script
# This script helps you configure Google Cloud for real-time email notifications

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="gmail-push-endpoint"
TOPIC_NAME="gmail-push-topic"
SUBSCRIPTION_NAME="gmail-push-subscription"
WEBHOOK_PORT=8080

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Gmail Push Notifications Setup Assistant            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if gcloud is installed
check_gcloud() {
    print_info "Checking for Google Cloud SDK..."

    if ! command -v gcloud &> /dev/null; then
        print_error "Google Cloud SDK (gcloud) not found!"
        echo ""
        echo "Please install it first:"
        echo "  https://cloud.google.com/sdk/docs/install"
        echo ""
        exit 1
    fi

    print_success "Google Cloud SDK is installed"
}

# Check if user is authenticated with gcloud
check_gcloud_auth() {
    print_info "Checking Google Cloud authentication..."

    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        print_warning "Not authenticated with Google Cloud"
        echo ""
        read -p "Would you like to authenticate now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            gcloud auth login
            print_success "Authentication successful"
        else
            print_error "Authentication required. Please run: gcloud auth login"
            exit 1
        fi
    else
        print_success "Already authenticated with Google Cloud"
    fi
}

# Create or select project
setup_project() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Step 1: Google Cloud Project Setup                     ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""

    # Get current project
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")

    if [ ! -z "$CURRENT_PROJECT" ]; then
        print_info "Current project: $CURRENT_PROJECT"
        read -p "Use this project? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            PROJECT_ID=""
        else
            PROJECT_ID=$CURRENT_PROJECT
        fi
    else
        PROJECT_ID=""
    fi

    if [ -z "$PROJECT_ID" ]; then
        print_info "Creating new project: $PROJECT_NAME"

        # Check if project already exists
        if gcloud projects describe $PROJECT_NAME &> /dev/null; then
            print_warning "Project '$PROJECT_NAME' already exists"
            read -p "Enter your Google Cloud Project ID: " PROJECT_ID
        else
            gcloud projects create $PROJECT_NAME --quiet
            PROJECT_ID=$PROJECT_NAME
            print_success "Created project: $PROJECT_ID"
        fi

        # Set as active project
        gcloud config set project $PROJECT_ID
    fi

    echo ""
    print_info "Project ID: ${GREEN}$PROJECT_ID${NC}"

    # Enable required APIs
    echo ""
    print_info "Enabling required APIs (Gmail API, Pub/Sub API)..."

    gcloud services enable gmail.googleapis.com --quiet
    gcloud services enable pubsub.googleapis.com --quiet

    print_success "APIs enabled successfully"
}

# Create OAuth credentials
setup_oauth() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Step 2: OAuth 2.0 Credentials                          ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""

    print_info "Creating OAuth consent screen..."

    # Check if consent screen already exists
    if gcloud alpha oauth-oauth-consent-screen describe &> /dev/null 2>&1; then
        print_warning "OAuth consent screen already configured"
    else
        print_info "Please configure the OAuth consent screen manually:"
        echo ""
        echo "1. Go to: https://console.cloud.google.com/apis/credentials/consent"
        echo "2. Select 'External' user type"
        echo "3. Fill in required fields (App name, User support email)"
        echo "4. Add scope: gmail.watch"
        echo "5. Save and continue"
        echo ""
        read -p "Press Enter when done..."
    fi

    print_info "Creating OAuth Client ID..."

    # Check if client already exists
    CLIENTS=$(gcloud alpha oauth-oauth-clients list --format="value(name)" 2>/dev/null || echo "")

    if [ ! -z "$CLIENTS" ]; then
        print_warning "OAuth clients already exist. Using existing credentials."
        read -p "Enter your OAuth Client ID: " GOOGLE_CLIENT_ID
        read -s -p "Enter your OAuth Client Secret: " GOOGLE_CLIENT_SECRET
        echo ""
    else
        # Create OAuth client
        gcloud alpha oauth-oauth-clients create \
            --display-name="gmail-push-client" \
            --redirect-uris="http://localhost:${WEBHOOK_PORT}/oauth2callback" \
            --quiet

        print_success "OAuth client created"

        echo ""
        print_info "Please note your credentials:"
        echo "  Client ID:     ${YELLOW}(Check in Cloud Console)${NC}"
        echo "  Client Secret: ${YELLOW}(Check in Cloud Console)${NC}"
        echo ""
        read -p "Enter OAuth Client ID: " GOOGLE_CLIENT_ID
        read -s -p "Enter OAuth Client Secret: " GOOGLE_CLIENT_SECRET
        echo ""
    fi

    # Get refresh token
    echo ""
    print_info "Getting OAuth Refresh Token..."
    echo ""
    print_warning "You'll need to authorize the application in your browser"
    echo ""

    cat > /tmp/get_refresh_token.js << 'JSEOF'
const { google } = require('googleapis');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const REDIRECT_URI = `http://localhost:${process.argv[4]}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.watch'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
});

console.log('Authorize this app by visiting this url:', authUrl);
console.log('\nEnter the authorization code from that page here:');

process.stdin.once('data', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code.toString().trim());
        console.log('\n' + '='.repeat(50));
        console.log('Your Refresh Token:');
        console.log(tokens.refresh_token);
        console.log('='.repeat(50) + '\n');
        console.log('Add this to your .env file as GOOGLE_REFRESH_TOKEN');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
});
JSEOF

    echo ""
    node /tmp/get_refresh_token.js "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" "$WEBHOOK_PORT"
    read -p "Enter your Refresh Token: " GOOGLE_REFRESH_TOKEN
    rm /tmp/get_refresh_token.js

    print_success "OAuth credentials configured"
}

# Create Pub/Sub resources
setup_pubsub() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Step 3: Cloud Pub/Sub Setup                            ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""

    print_info "Creating Pub/Sub topic..."

    # Check if topic exists
    if gcloud pubsub topics describe $TOPIC_NAME --quiet &> /dev/null; then
        print_warning "Topic '$TOPIC_NAME' already exists"
    else
        gcloud pubsub topics create $TOPIC_NAME --quiet
        print_success "Created topic: $TOPIC_NAME"
    fi

    print_info "Creating Pub/Sub subscription..."

    # Check if subscription exists
    if gcloud pubsub subscriptions describe $SUBSCRIPTION_NAME --quiet &> /dev/null; then
        print_warning "Subscription '$SUBSCRIPTION_NAME' already exists"
    else
        gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
            --topic=$TOPIC_NAME \
            --push-endpoint=http://localhost:${WEBHOOK_PORT}/gmail-push \
            --quiet
        print_success "Created subscription: $SUBSCRIPTION_NAME"
    fi

    echo ""
    print_info "Pub/Sub resources created successfully"
}

# Update .env file
update_env_file() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Step 4: Environment Configuration                      ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""

    print_info "Updating .env file..."

    # Check if .env exists
    if [ ! -f ".env" ]; then
        cp .env.example .env 2>/dev/null || touch .env
    fi

    # Add Gmail Push configuration to .env
    cat >> .env << EOF

# Gmail Push Notifications Configuration (added by setup script)
GOOGLE_PROJECT_ID=$PROJECT_ID
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN=$GOOGLE_REFRESH_TOKEN
GOOGLE_PUBSUB_TOPIC_NAME=projects/$PROJECT_ID/topics/$TOPIC_NAME
GMAIL_PUSH_WEBHOOK_PORT=$WEBHOOK_PORT
GMAIL_PUSH_WEBHOOK_URL=http://localhost:$WEBHOOK_PORT/gmail-push
EOF

    print_success "Environment variables added to .env"

    echo ""
    print_warning "IMPORTANT: For local testing, you need ngrok!"
    echo ""
    echo "Run these commands in a separate terminal:"
    echo ""
    echo "  npm install -g ngrok"
    echo "  ngrok http $WEBHOOK_PORT"
    echo ""
    echo "Then update GMAIL_PUSH_WEBHOOK_URL in .env with the ngrok URL"
    echo "(e.g., https://abc123.ngrok.io/gmail-push)"
}

# Final instructions
print_final_instructions() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Setup Complete!                                        ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""

    cat << 'EOF'
Next Steps:

1. Install dependencies (if not already done):
   npm install googleapis @google-cloud/pubsub

2. Start ngrok for local testing (in a separate terminal):
   ngrok http 8080

3. Update GMAIL_PUSH_WEBHOOK_URL in .env with your ngrok URL

4. Start the RAG endpoint server:
   npm start

5. Send a test email with [prompt] in the subject line!

For production deployment, see: docs/GMAIL_PUSH_SETUP.md

Troubleshooting:
- Check logs for "Gmail Push" messages
- Verify webhook URL is publicly accessible
- Ensure OAuth consent screen is configured
- Make sure Gmail API and Pub/Sub APIs are enabled

EOF

    print_success "Setup complete! Your RAG endpoint will now receive instant email notifications."
}

# Main execution
main() {
    check_gcloud
    check_gcloud_auth
    setup_project
    setup_oauth
    setup_pubsub
    update_env_file
    print_final_instructions
}

# Run the script
main "$@"
