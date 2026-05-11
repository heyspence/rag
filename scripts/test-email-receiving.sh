#!/bin/bash

# Email Receiving Feature - Interactive Testing Script
# This script guides you through testing the RAG endpoint email receiving functionality

set -e  # Exit on error (we'll handle errors gracefully)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print colored output
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "\n${CYAN}▶ Step: $1${NC}\n"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((TESTS_PASSED++))
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((TESTS_FAILED++))
}

print_question() {
    echo -e "${CYAN}?${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Function to read environment variable
get_env_var() {
    local var_name="$1"
    grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'"
}

# Function to check if .env file exists and has required variables
check_env_file() {
    print_step "Checking Environment Configuration"

    if [ ! -f "$ENV_FILE" ]; then
        print_error ".env file not found!"
        print_info "Please run: cp .env.example .env"
        return 1
    fi

    # Check for Gmail Push configuration
    local has_push=false
    local has_imap=false

    if grep -q "^GOOGLE_PROJECT_ID=" "$ENV_FILE"; then
        has_push=true
        print_success "Gmail Push configuration found"
    else
        print_warning "Gmail Push configuration not found"
    fi

    if grep -q "^IMAP_USER=" "$ENV_FILE"; then
        has_imap=true
        print_success "IMAP polling configuration found"
    else
        print_warning "IMAP polling configuration not found"
    fi

    if [ "$has_push" = false ] && [ "$has_imap" = false ]; then
        print_error "No email receiving configuration found!"
        return 1
    fi

    # Display detected method
    echo ""
    if [ "$has_push" = true ]; then
        print_info "Detected Method: ${GREEN}Gmail Push Notifications${NC}"
    else
        print_info "Detected Method: ${YELLOW}IMAP Polling (Fallback)${NC}"
    fi

    return 0
}

# Function to check dependencies
check_dependencies() {
    print_step "Checking Dependencies"

    # Check Node.js
    if command_exists node; then
        local node_version=$(node --version)
        print_success "Node.js installed: $node_version"
    else
        print_error "Node.js not found!"
        return 1
    fi

    # Check npm packages
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        print_info "Checking package.json..."

        if grep -q '"googleapis"' "$PROJECT_ROOT/package.json"; then
            print_success "Google APIs library found (for Gmail Push)"
        else
            print_warning "googleapis not in package.json (needed for Gmail Push)"
        fi

        if grep -q '"imap"' "$PROJECT_ROOT/package.json"; then
            print_success "IMAP library found"
        else
            print_warning "imap not in package.json (needed for IMAP polling)"
        fi
    fi

    # Check gcloud for Gmail Push
    local has_push=$(get_env_var "GOOGLE_PROJECT_ID")
    if [ ! -z "$has_push" ]; then
        if command_exists gcloud; then
            print_success "Google Cloud SDK installed"
        else
            print_warning "gcloud not found (needed for Gmail Push setup)"
            print_info "Install from: https://cloud.google.com/sdk/docs/install"
        fi
    fi

    return 0
}

# Function to check server status
check_server_status() {
    print_step "Checking Server Status"

    # Check if port 8080 or 3000 is in use (webhook ports)
    if command_exists lsof; then
        if lsof -i :8080 &> /dev/null || lsof -i :3000 &> /dev/null; then
            print_success "Server appears to be running"
            return 0
        fi
    elif command_exists netstat; then
        if netstat -an | grep -E ":8080|:3000" &> /dev/null; then
            print_success "Server appears to be running"
            return 0
        fi
    fi

    print_warning "Server not currently running"
    print_info "You'll need to start it with: npm start"
    return 1
}

# Function to test webhook endpoint (if server is running)
test_webhook_endpoint() {
    print_step "Testing Webhook Endpoint"

    # Try localhost first, then check for ngrok URL
    local webhook_url="http://localhost:8080/health"

    if curl -s --max-time 5 "$webhook_url" &> /dev/null; then
        print_success "Webhook endpoint responding at $webhook_url"

        # Show health response
        echo ""
        print_info "Health check response:"
        curl -s "$webhook_url" | head -c 200
        echo ""
        return 0
    fi

    # Check for ngrok URL in .env
    local ngrok_url=$(get_env_var "GMAIL_PUSH_WEBHOOK_URL")
    if [ ! -z "$ngrok_url" ] && [[ "$ngrok_url" == *"ngrok"* ]]; then
        print_info "Testing ngrok URL: $ngrok_url/health"

        if curl -s --max-time 5 "${ngrok_url}/health" &> /dev/null; then
            print_success "Ngrok webhook endpoint responding"
            return 0
        else
            print_warning "Ngrok URL not responding (is ngrok running?)"
        fi
    fi

    print_warning "Webhook endpoint not accessible (server may not be running)"
    return 1
}

# Function to verify Gmail configuration
verify_gmail_config() {
    print_step "Verifying Gmail Configuration"

    local imap_user=$(get_env_var "IMAP_USER")
    local google_project=$(get_env_var "GOOGLE_PROJECT_ID")

    if [ ! -z "$imap_user" ]; then
        print_info "IMAP User: $imap_user"

        # Check IMAP enabled (manual verification)
        echo ""
        print_question "Is IMAP enabled in your Gmail settings?"
        print_info "Check at: https://mail.google.com/mail/u/0/#settings/fwdandpop"
        read -p "Press Enter when confirmed..."

        # Check app password exists
        local imap_pass=$(get_env_var "IMAP_PASSWORD")
        if [ ! -z "$imap_pass" ]; then
            print_success "App password is configured in .env"

            # Verify it's the right length (16 chars without spaces)
            local pass_length=$(echo "$imap_pass" | tr -d ' ' | wc -c)
            if [ "$pass_length" -eq 16 ]; then
                print_success "App password format looks correct (16 characters)"
            else
                print_warning "App password length is $pass_length (expected 16 without spaces)"
            fi
        else
            print_error "IMAP password not found in .env"
        fi
    fi

    if [ ! -z "$google_project" ]; then
        print_info "Google Cloud Project: $google_project"

        # Check gcloud authentication
        if command_exists gcloud; then
            if gcloud auth list --filter=status:ACTIVE &> /dev/null; then
                print_success "Authenticated with Google Cloud"

                # Verify project is set correctly
                local current_project=$(gcloud config get-value project 2>/dev/null)
                if [ "$current_project" = "$google_project" ]; then
                    print_success "Active GCP project matches .env configuration"
                else
                    print_warning "Active GCP project ($current_project) differs from .env ($google_project)"
                    print_info "Run: gcloud config set project $google_project"
                fi
            else
                print_error "Not authenticated with Google Cloud"
                print_info "Run: gcloud auth login"
            fi
        fi

        # Check if watch is configured (requires API call)
        echo ""
        print_question "Have you enabled Gmail API and created Pub/Sub resources?"
        read -p "Press Enter to continue..."
    fi

    return 0
}

# Function to generate test email instructions
generate_test_email() {
    print_step "Preparing Test Email"

    local imap_user=$(get_env_var "IMAP_USER")
    local send_to="${imap_user:-your Gmail address}"

    echo ""
    print_info "Send the following email to: ${GREEN}$send_to${NC}"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo "To: $send_to"
    echo "Subject: [prompt] Test RAG endpoint email receiving"
    echo ""
    echo "This is a test message to verify the email receiving system works correctly."
    echo ""
    echo "Please process this through the RAG pipeline and log the results."
    echo ""
    echo "Test ID: $(date +%Y%m%d-%H%M%S)"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo ""

    print_question "Have you sent the test email?"
    read -p "Press Enter when ready..."

    return 0
}

# Function to monitor server logs
monitor_logs() {
    print_step "Monitoring Server Logs"

    print_info "Watch for these log messages in your server output:"
    echo ""
    echo -e "${GREEN}Gmail Push:${NC}"
    echo "  [Gmail Push] Received notification from Google"
    echo "  [IMAP Service] Processing email through RAG pipeline..."
    echo "  [Vector Database] Found X relevant document chunks"
    echo ""
    echo -e "${YELLOW}IMAP Polling:${NC}"
    echo "  [IMAP Service] New message detected in INBOX"
    echo "  [IMAP Service] Processing email through RAG pipeline..."
    echo "  [Vector Database] Found X relevant document chunks"
    echo ""

    print_question "Did you see the processing logs?"
    read -p "Press Enter to continue..."

    return 0
}

# Function to run additional tests
run_additional_tests() {
    print_step "Additional Tests (Optional)"

    echo ""
    print_info "Would you like to test:"
    echo "1) Email without [prompt] tag (should be ignored)"
    echo "2) HTML content extraction"
    echo "3) Long prompt / complex query"
    echo "4) Skip additional tests"
    echo ""

    read -p "Enter choice (1-4): " choice

    case $choice in
        1)
            print_info "Send an email WITHOUT [prompt] in the subject."
            print_info "Expected: Email received but NOT processed by RAG pipeline."
            ;;
        2)
            print_info "Send an email with HTML formatting in the body."
            print_info "Expected: Plain text extracted and processed correctly."
            ;;
        3)
            print_info "Send a longer, more complex query about your documents."
            print_info "Expected: Multiple relevant chunks returned (if available)."
            ;;
        *)
            print_info "Skipping additional tests."
            ;;
    esac

    return 0
}

# Function to display test summary
display_summary() {
    print_header "Test Summary"

    echo ""
    echo -e "${BLUE}Tests Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Tests Failed:${NC} $TESTS_FAILED"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        print_success "All tests passed! Your email receiving feature is working correctly."
        echo ""
        print_info "Next steps:"
        echo "1. Deploy to production with PM2: pm2 start index.js --name rag-endpoint"
        echo "2. Set up monitoring and logging"
        echo "3. Configure auto-response emails (optional)"
    else
        print_warning "Some tests failed. Review the errors above."
        echo ""
        print_info "Common solutions:"
        echo "- Verify .env configuration is correct"
        echo "- Check server logs for detailed error messages"
        echo "- Ensure Gmail IMAP is enabled (for polling mode)"
        echo "- Verify OAuth credentials (for Push mode)"
    fi

    echo ""
    print_info "Documentation:"
    echo "  - README_EMAIL.md: Complete feature overview"
    echo "  - TESTING_CHECKLIST.md: Detailed testing guide"
    echo "  - docs/GMAIL_PUSH_SETUP.md: Gmail Push setup walkthrough"
    echo "  - docs/GMAIL_IMAP_SETUP.md: IMAP configuration guide"
    echo ""
}

# Function to start server helper
start_server_helper() {
    print_step "Starting Server"

    print_info "The server needs to be running for email receiving to work."
    echo ""
    echo "Options:"
    echo "1) Start server now (npm start)"
    echo "2) I'll start it manually in another terminal"
    echo "3) Skip this step"
    echo ""

    read -p "Enter choice (1-3): " choice

    case $choice in
        1)
            print_info "Starting server..."
            echo ""
            cd "$PROJECT_ROOT"

            # Start server with timeout for testing
            if command_exists pm2; then
                print_info "Using PM2 for process management..."
                pm2 start index.js --name rag-endpoint 2>/dev/null || npm start &
            else
                npm start &
            fi

            sleep 3
            print_success "Server started in background"
            ;;
        2)
            print_info "Remember to run: cd $PROJECT_ROOT && npm start"
            ;;
        3)
            print_warning "Skipping server startup. Email receiving won't work until server is running."
            ;;
    esac

    return 0
}

# Main testing flow
main() {
    clear

    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║     Email Receiving Feature - Interactive Test Suite   ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    print_info "This script will guide you through testing the email receiving feature."
    print_info "Estimated time: 5-10 minutes"
    echo ""

    read -p "Press Enter to begin..."

    # Phase 1: Configuration Check
    print_header "Phase 1: Configuration Verification"
    check_env_file || exit 1
    check_dependencies

    # Phase 2: Server Setup
    print_header "Phase 2: Server Setup"
    start_server_helper
    sleep 3
    check_server_status || true
    test_webhook_endpoint || true

    # Phase 3: Gmail Configuration
    print_header "Phase 3: Gmail Configuration"
    verify_gmail_config

    # Phase 4: Email Test
    print_header "Phase 4: Email Receiving Test"
    generate_test_email
    monitor_logs

    # Phase 5: Additional Tests
    print_header "Phase 5: Optional Tests"
    run_additional_tests

    # Summary
    display_summary

    echo ""
    print_info "Thank you for testing! If you have any questions, refer to the documentation."
    echo ""
}

# Run main function
main "$@"
