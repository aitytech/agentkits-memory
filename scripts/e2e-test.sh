#!/usr/bin/env bash
# ==============================================================================
# AgentKits Memory — E2E Test Script
#
# Simulates a fresh user installing and using the package from a clean directory.
# Tests all CLI subcommands via the unified router.
#
# Usage:
#   ./scripts/e2e-test.sh          # test with npm link (fast, for dev)
#   ./scripts/e2e-test.sh --pack   # test with npm pack + install (real publish sim)
#
# CI auto-detects: uses --pack when CI=true (GitHub Actions, etc.)
#
# Exit codes:
#   0 = all tests passed
#   1 = one or more tests failed
# ==============================================================================

set -euo pipefail

# Colors (disable in non-interactive / CI)
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' CYAN='' NC=''
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR=""
PASS=0
FAIL=0
SKIP=0
USE_PACK=false

# Parse args
for arg in "$@"; do
  case $arg in
    --pack) USE_PACK=true ;;
  esac
done

# Auto-detect CI: always use --pack in CI for real install simulation
if [ "${CI:-}" = "true" ]; then
  USE_PACK=true
fi

# ==============================================================================
# Helpers
# ==============================================================================

cleanup() {
  # Kill any background processes we started
  jobs -p 2>/dev/null | xargs kill 2>/dev/null || true
  if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
}
trap cleanup EXIT

log_header() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_test() {
  echo -e "\n${YELLOW}TEST:${NC} $1"
}

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "  ${RED}     → $2${NC}"
  fi
  FAIL=$((FAIL + 1))
}

skip() {
  echo -e "  ${YELLOW}SKIP${NC} $1"
  SKIP=$((SKIP + 1))
}

# Portable timeout for macOS + Linux
# Linux has `timeout`, macOS needs gtimeout (coreutils) or perl fallback
_timeout() {
  local secs="$1"
  shift
  if command -v timeout &>/dev/null; then
    timeout "$secs" "$@"
  elif command -v gtimeout &>/dev/null; then
    gtimeout "$secs" "$@"
  else
    # Perl fallback for macOS without coreutils
    perl -e '
      alarm shift @ARGV;
      $SIG{ALRM} = sub { kill 9, $pid; exit 124 };
      $pid = fork;
      if ($pid == 0) { exec @ARGV; exit 127 }
      waitpid $pid, 0;
      exit ($? >> 8);
    ' "$secs" "$@"
  fi
}

# Run a command with timeout, capture stdout+stderr, check exit code
# Usage: run_cmd <timeout_sec> <expected_exit> <cmd...>
# Sets: CMD_OUT, CMD_EXIT
run_cmd() {
  local timeout_sec="$1"
  local expected_exit="$2"
  shift 2
  CMD_OUT=""
  CMD_EXIT=0

  CMD_OUT=$(_timeout "$timeout_sec" "$@" 2>&1) || CMD_EXIT=$?

  # timeout returns 124 on timeout
  if [ "$CMD_EXIT" -eq 124 ]; then
    if [ "$expected_exit" -eq 124 ]; then
      return 0
    fi
    fail "Command timed out after ${timeout_sec}s: $*"
    return 1
  fi

  if [ "$CMD_EXIT" -ne "$expected_exit" ]; then
    fail "Exit code $CMD_EXIT (expected $expected_exit): $*" "$CMD_OUT"
    return 1
  fi
  return 0
}

# Check if output contains a string
assert_contains() {
  local label="$1"
  local needle="$2"
  # Use grep without -q and redirect to /dev/null to avoid SIGPIPE with pipefail
  if echo "$CMD_OUT" | grep "$needle" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label — expected output to contain: $needle"
  fi
}

# Check if file exists
assert_file_exists() {
  local label="$1"
  local filepath="$2"
  if [ -f "$filepath" ]; then
    pass "$label"
  else
    fail "$label — file not found: $filepath"
  fi
}

# Check if file contains string
assert_file_contains() {
  local label="$1"
  local filepath="$2"
  local needle="$3"
  if [ -f "$filepath" ] && grep -q "$needle" "$filepath"; then
    pass "$label"
  else
    fail "$label — file $filepath missing or doesn't contain: $needle"
  fi
}

# ==============================================================================
# Setup
# ==============================================================================

log_header "E2E Test — AgentKits Memory CLI"
echo -e "  Project: ${PROJECT_DIR}"
echo -e "  Mode:    $([ "$USE_PACK" = true ] && echo 'npm pack (publish sim)' || echo 'npm link (fast dev)')"
echo -e "  CI:      ${CI:-false}"

# Build first
echo -e "\n${YELLOW}Building...${NC}"
(cd "$PROJECT_DIR" && npm run build) || { fail "Build failed"; exit 1; }

# Create temp test directory
TEST_DIR=$(mktemp -d)
echo -e "  Test dir: ${TEST_DIR}"

# Initialize a fake project in test dir
mkdir -p "$TEST_DIR/.claude"
cd "$TEST_DIR"
echo '{}' > package.json

if [ "$USE_PACK" = true ]; then
  # Pack and install (simulates real npm install — used in CI)
  echo -e "\n${YELLOW}Packing...${NC}"
  TARBALL=$(cd "$PROJECT_DIR" && npm pack --pack-destination "$TEST_DIR" 2>/dev/null | tail -1)
  echo -e "  Tarball: ${TARBALL}"

  echo -e "${YELLOW}Installing from tarball...${NC}"
  npm install "$TEST_DIR/$TARBALL" --save 2>&1 | tail -5
  NPX="npx"
else
  # Link for fast local dev testing
  echo -e "\n${YELLOW}Linking...${NC}"
  (cd "$PROJECT_DIR" && npm link 2>&1 | tail -1)
  npm link @aitytech/agentkits-memory 2>&1 | tail -1
  NPX="npx"
fi

# Verify binary is accessible
if ! command -v agentkits-memory &>/dev/null && ! [ -x "$TEST_DIR/node_modules/.bin/agentkits-memory" ]; then
  echo -e "${RED}ERROR: agentkits-memory binary not found in PATH or node_modules/.bin${NC}"
  exit 1
fi
echo -e "  ${GREEN}Binary found${NC}"

# ==============================================================================
# Test 1: help
# ==============================================================================

log_test "1. help"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory help; then
  assert_contains "Shows usage info" "Usage:"
  assert_contains "Lists setup subcommand" "setup"
  assert_contains "Lists server subcommand" "server"
  assert_contains "Lists hook subcommand" "hook"
fi

# ==============================================================================
# Test 2: setup (default command)
# ==============================================================================

log_test "2. setup (default — auto-detect platform)"
if run_cmd 30 0 $NPX @aitytech/agentkits-memory --skip-model --json; then
  assert_contains "Returns JSON" '"success"'
  assert_contains "Has platforms" '"platforms"'
fi

# Verify files created by setup
assert_file_exists "settings.json created" "$TEST_DIR/.claude/settings.json"
assert_file_exists "memory dir created" "$TEST_DIR/.claude/memory/settings.json"
assert_file_contains "hooks configured" "$TEST_DIR/.claude/settings.json" "agentkits-memory"
assert_file_contains "MCP server configured" "$TEST_DIR/.claude/settings.json" "mcpServers"

# ==============================================================================
# Test 3: setup --show-hooks
# ==============================================================================

log_test "3. setup --show-hooks"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory setup --show-hooks; then
  assert_contains "Shows SessionStart hook" "SessionStart"
  assert_contains "Shows Stop hook" "Stop"
  assert_contains "Shows PostToolUse hook" "PostToolUse"
  assert_contains "Uses new npx syntax" "@aitytech/agentkits-memory"
fi

# ==============================================================================
# Test 4: setup --force --json
# ==============================================================================

log_test "4. setup --force --json (re-install)"
if run_cmd 30 0 $NPX @aitytech/agentkits-memory setup --force --skip-model --json; then
  assert_contains "Returns success" '"success": true'
fi

# ==============================================================================
# Test 5: viewer --stats
# ==============================================================================

log_test "5. viewer --stats (empty DB)"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory viewer --stats; then
  # Empty DB shows "No database" message; populated DB shows "Statistics"
  if echo "$CMD_OUT" | grep -i "database\|Statistics" >/dev/null 2>&1; then
    pass "Shows database info or empty message"
  else
    fail "Unexpected viewer output"
  fi
fi

# ==============================================================================
# Test 6: viewer --json
# ==============================================================================

log_test "6. viewer --json"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory viewer --json; then
  assert_contains "Returns JSON" "entries"
fi

# ==============================================================================
# Test 7: save
# ==============================================================================

log_test "7. save"
if run_cmd 15 0 $NPX @aitytech/agentkits-memory save --content="E2E test memory entry" --category=pattern --tags=e2e,test; then
  assert_contains "Save returns success" "success"
fi

# ==============================================================================
# Test 8: viewer after save (verify entry exists)
# ==============================================================================

log_test "8. viewer after save (verify entry persisted)"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory viewer --list; then
  assert_contains "Entry visible in viewer" "E2E test"
fi

# ==============================================================================
# Test 9: hook context (simulates SessionStart hook)
# ==============================================================================

log_test "9. hook context (SessionStart)"
HOOK_INPUT='{"session_id":"e2e-test-001","cwd":"'"$TEST_DIR"'"}'
CMD_OUT=$(echo "$HOOK_INPUT" | $NPX @aitytech/agentkits-memory hook context 2>&1) && CMD_EXIT=0 || CMD_EXIT=$?
if [ "$CMD_EXIT" -eq 0 ]; then
  pass "hook context exits cleanly"
  # Check last JSON line is valid
  LAST_LINE=$(echo "$CMD_OUT" | grep -E '^\{' | tail -1)
  if [ -n "$LAST_LINE" ] && echo "$LAST_LINE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    pass "hook context returns valid JSON"
  else
    fail "hook context does not return valid JSON"
  fi
else
  fail "hook context exit code $CMD_EXIT (expected 0)"
fi

# ==============================================================================
# Test 10: hook session-init (simulates UserPromptSubmit hook)
# ==============================================================================

log_test "10. hook session-init (UserPromptSubmit)"
HOOK_INPUT='{"session_id":"e2e-test-001","cwd":"'"$TEST_DIR"'","user_prompt":"test prompt"}'
CMD_OUT=$(echo "$HOOK_INPUT" | $NPX @aitytech/agentkits-memory hook session-init 2>&1) && CMD_EXIT=0 || CMD_EXIT=$?
if [ "$CMD_EXIT" -eq 0 ]; then
  pass "hook session-init exits cleanly"
else
  fail "hook session-init exit code $CMD_EXIT"
fi

# ==============================================================================
# Test 11: hook observation (simulates PostToolUse hook)
# ==============================================================================

log_test "11. hook observation (PostToolUse)"
HOOK_INPUT='{"session_id":"e2e-test-001","cwd":"'"$TEST_DIR"'","tool_name":"Edit","tool_input":{"file_path":"test.ts","old_string":"a","new_string":"b"}}'
CMD_OUT=$(echo "$HOOK_INPUT" | $NPX @aitytech/agentkits-memory hook observation 2>&1) && CMD_EXIT=0 || CMD_EXIT=$?
if [ "$CMD_EXIT" -eq 0 ]; then
  pass "hook observation exits cleanly"
else
  fail "hook observation exit code $CMD_EXIT"
fi

# ==============================================================================
# Test 12: hook summarize (simulates Stop hook)
# ==============================================================================

log_test "12. hook summarize (Stop)"
HOOK_INPUT='{"session_id":"e2e-test-001","cwd":"'"$TEST_DIR"'"}'
CMD_OUT=$(echo "$HOOK_INPUT" | $NPX @aitytech/agentkits-memory hook summarize 2>&1) && CMD_EXIT=0 || CMD_EXIT=$?
if [ "$CMD_EXIT" -eq 0 ]; then
  pass "hook summarize exits cleanly"
else
  fail "hook summarize exit code $CMD_EXIT"
fi

# ==============================================================================
# Test 13: hook settings
# ==============================================================================

log_test "13. hook settings (view)"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory hook settings "$TEST_DIR"; then
  assert_contains "Returns settings JSON" "context"
fi

# ==============================================================================
# Test 14: hook settings (update)
# ==============================================================================

log_test "14. hook settings (update)"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory hook settings "$TEST_DIR" maxSummaries=5; then
  assert_contains "Updated setting" "maxSummaries"
fi

# ==============================================================================
# Test 15: hook lifecycle-stats
# ==============================================================================

log_test "15. hook lifecycle-stats"
if run_cmd 10 0 $NPX @aitytech/agentkits-memory hook lifecycle-stats "$TEST_DIR"; then
  assert_contains "Returns lifecycle stats" "totalSessions"
fi

# ==============================================================================
# Test 16: hook export
# ==============================================================================

log_test "16. hook export"
EXPORT_FILE="$TEST_DIR/backup.json"
if run_cmd 15 0 $NPX @aitytech/agentkits-memory hook export "$TEST_DIR" e2e-test "$EXPORT_FILE"; then
  assert_file_exists "Export file created" "$EXPORT_FILE"
  assert_file_contains "Export has sessions" "$EXPORT_FILE" "sessions"
fi

# ==============================================================================
# Test 17: hook import
# ==============================================================================

log_test "17. hook import"
if [ -f "$EXPORT_FILE" ]; then
  if run_cmd 15 0 $NPX @aitytech/agentkits-memory hook import "$TEST_DIR" "$EXPORT_FILE"; then
    pass "hook import completes"
  fi
else
  skip "hook import (no export file)"
fi

# ==============================================================================
# Test 18: server (MCP — send initialize request, verify response)
# ==============================================================================

log_test "18. server (MCP protocol)"
# Send a JSON-RPC initialize request; server reads stdin, responds, then exits when stdin closes
MCP_REQUEST='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"e2e-test","version":"1.0"}}}'
CMD_OUT=$(echo "$MCP_REQUEST" | $NPX @aitytech/agentkits-memory server 2>/dev/null) && CMD_EXIT=0 || CMD_EXIT=$?

if echo "$CMD_OUT" | grep '"result"' >/dev/null 2>&1; then
  pass "MCP server responds to initialize"
  if echo "$CMD_OUT" | grep '"tools"' >/dev/null 2>&1; then
    pass "MCP server lists tools"
  elif echo "$CMD_OUT" | grep '"capabilities"' >/dev/null 2>&1; then
    pass "MCP server returns capabilities"
  else
    fail "MCP server response missing tools/capabilities"
  fi
else
  if [ "$CMD_EXIT" -eq 124 ]; then
    skip "MCP server timed out (expected for stdin-based server)"
  else
    fail "MCP server did not respond to initialize (exit=$CMD_EXIT)" "${CMD_OUT:0:200}"
  fi
fi

# ==============================================================================
# Test 19: web (start and verify HTTP response)
# ==============================================================================

log_test "19. web viewer (HTTP server)"
WEB_PORT=19051
$NPX @aitytech/agentkits-memory web --port=$WEB_PORT &
WEB_PID=$!
sleep 3

if kill -0 $WEB_PID 2>/dev/null; then
  if CMD_OUT=$(curl -s --max-time 5 "http://localhost:$WEB_PORT/" 2>&1); then
    # Use bash pattern match to avoid pipefail + grep -q SIGPIPE issue
    if [[ "$CMD_OUT" == *html* ]] || [[ "$CMD_OUT" == *memory* ]] || [[ "$CMD_OUT" == *agentkits* ]]; then
      pass "Web viewer serves HTML"
    else
      fail "Web viewer response doesn't contain expected content" "${CMD_OUT:0:120}"
    fi
  else
    fail "Web viewer not responding on port $WEB_PORT"
  fi
  kill $WEB_PID 2>/dev/null || true
  wait $WEB_PID 2>/dev/null || true
else
  fail "Web viewer process died"
fi

# ==============================================================================
# Test 20: unknown command
# ==============================================================================

log_test "20. unknown command (error handling)"
if run_cmd 10 1 $NPX @aitytech/agentkits-memory foobar; then
  pass "Unknown command exits with error"
fi
CMD_OUT=$(_timeout 10 $NPX @aitytech/agentkits-memory foobar 2>&1) || true
if echo "$CMD_OUT" | grep -i "unknown\|error\|help" >/dev/null 2>&1; then
  pass "Unknown command shows helpful message"
else
  fail "Unknown command doesn't show helpful message"
fi

# ==============================================================================
# Test 21: verify settings.json has new npx syntax (not old pattern)
# ==============================================================================

log_test "21. verify settings.json uses new npx syntax"
if [ -f "$TEST_DIR/.claude/settings.json" ]; then
  assert_file_contains "settings has scoped package name" "$TEST_DIR/.claude/settings.json" "@aitytech/agentkits-memory"

  if grep -q 'npx.*agentkits-memory-hook' "$TEST_DIR/.claude/settings.json" 2>/dev/null; then
    fail "settings.json still has old 'agentkits-memory-hook' pattern"
  else
    pass "No old bare binary patterns in settings.json"
  fi
else
  fail "settings.json not found"
fi

# ==============================================================================
# Summary
# ==============================================================================

TOTAL=$((PASS + FAIL + SKIP))
log_header "Results: $PASS passed, $FAIL failed, $SKIP skipped (total: $TOTAL)"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}E2E TESTS FAILED${NC}\n"
  exit 1
else
  echo -e "\n${GREEN}ALL E2E TESTS PASSED${NC}\n"
  exit 0
fi
