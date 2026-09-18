#!/usr/bin/env bash

# ==============================================================================
# HexInvaders - Production Service Manager
# Usage: ./production.sh [start|stop|restart|status|deploy]
# ==============================================================================

set -o pipefail

SERVICE_NAME="hexinvaders-server.service"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="${SCRIPT_DIR}"
DEFAULT_PORT=3004

# Colors for terminal output
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✔${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✖${NC} $1"
}

# Check if .dist file specifies a target directory with its own production.sh
check_dist_redirection() {
    local dist_file="${SCRIPT_DIR}/.dist"
    if [ -f "$dist_file" ]; then
        if [ "$1" = "deploy" ]; then
            log_info ".dist file detected: deployment is managed externally. Skipping deploy."
            exit 0
        fi

        local target_dir
        target_dir=$(grep -v '^[[:space:]]*#' "$dist_file" | grep -v '^[[:space:]]*$' | head -n 1 | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
        if [[ "$target_dir" =~ ^~ ]]; then
            target_dir="${target_dir/#\~/$HOME}"
        fi

        if [ -n "$target_dir" ]; then
            log_info ".dist redirection detected -> ${target_dir}"
            if [ ! -d "$target_dir" ]; then
                log_error "Directory specified in .dist does not exist: ${target_dir}"
                exit 1
            fi
            local target_script="${target_dir}/production.sh"
            if [ ! -f "$target_script" ]; then
                log_error "production.sh not found in: ${target_dir}"
                exit 1
            fi
            if [ ! -x "$target_script" ]; then
                chmod +x "$target_script" 2>/dev/null || true
            fi
            exec "$target_script" "$@"
        fi
    fi
}

# Resolve configured port from .env files or fallback to default
get_configured_port() {
    local port=""
    if [ -f "${SERVER_DIR}/.env" ]; then
        port=$(grep -E "^PORT=" "${SERVER_DIR}/.env" | cut -d '=' -f2 | tr -d ' "\r\n')
    fi
    if [ -z "$port" ] && [ -f "${SCRIPT_DIR}/.env" ]; then
        port=$(grep -E "^PORT=" "${SCRIPT_DIR}/.env" | cut -d '=' -f2 | tr -d ' "\r\n')
    fi
    if [ -z "$port" ]; then
        port="$DEFAULT_PORT"
    fi
    echo "$port"
}

# Get listening ports for a specific PID
get_ports_for_pid() {
    local target_pid="$1"
    local ports=""
    
    if command -v ss &>/dev/null; then
        ports=$(ss -tlnp 2>/dev/null | grep -E "pid=${target_pid}\b" | awk '{print $4}' | sed 's/.*://' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')
    fi
    
    if [ -z "$ports" ] && command -v lsof &>/dev/null; then
        ports=$(lsof -Pan -p "${target_pid}" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | sed 's/.*://' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')
    fi

    echo "$ports"
}

# Find any process listening on a given port
get_process_on_port() {
    local target_port="$1"
    local proc_info=""
    
    if command -v ss &>/dev/null; then
        proc_info=$(ss -tlnp "sport = :${target_port}" 2>/dev/null | grep -v "Local Address:Port" | head -n 1)
    fi
    if [ -z "$proc_info" ] && command -v lsof &>/dev/null; then
        proc_info=$(lsof -iTCP:"${target_port}" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1 {print $1 " (PID " $2 ")"}' | head -n 1)
    fi
    echo "$proc_info"
}

# Check systemd service status
cmd_status() {
    local port
    port=$(get_configured_port)

    # Check if systemd unit exists
    if ! systemctl list-unit-files "${SERVICE_NAME}" &>/dev/null; then
        echo -e "${YELLOW}● ${BOLD}${SERVICE_NAME}${NC} is ${RED}not installed${NC}."
        echo -e "  Run ${BOLD}./production.sh deploy${NC} to install and configure the service."
        
        # Check if port is running outside systemd
        local port_proc
        port_proc=$(get_process_on_port "$port")
        if [ -n "$port_proc" ]; then
            echo -e "  ${YELLOW}Note:${NC} Port ${port} is currently in use by an external process:"
            echo -e "    $port_proc"
        fi
        return 1
    fi

    local active_state
    local sub_state
    local main_pid
    local start_time

    active_state=$(systemctl show "${SERVICE_NAME}" -p ActiveState --value 2>/dev/null || echo "unknown")
    sub_state=$(systemctl show "${SERVICE_NAME}" -p SubState --value 2>/dev/null || echo "unknown")
    main_pid=$(systemctl show "${SERVICE_NAME}" -p MainPID --value 2>/dev/null || echo "0")
    start_time=$(systemctl show "${SERVICE_NAME}" -p ExecMainStartTimestamp --value 2>/dev/null || echo "")

    if [ "$active_state" = "active" ]; then
        echo -e "${GREEN}●${NC} ${BOLD}HexInvaders Game Server${NC} (${CYAN}${SERVICE_NAME}${NC})"
        echo -e "   ${BOLD}Status:${NC}       ${GREEN}Active (${sub_state})${NC}"
        echo -e "   ${BOLD}PID:${NC}          ${main_pid}"

        # Detect ports
        local listening_ports
        listening_ports=$(get_ports_for_pid "$main_pid")
        if [ -n "$listening_ports" ]; then
            echo -e "   ${BOLD}Port(s):${NC}      ${listening_ports} (http://localhost:${listening_ports// /, http://localhost:})"
        else
            echo -e "   ${BOLD}Port:${NC}         ${port} (http://localhost:${port})"
        fi

        if [ -n "$start_time" ]; then
            echo -e "   ${BOLD}Started:${NC}      ${start_time}"
        fi

        return 0
    else
        echo -e "${RED}○${NC} ${BOLD}HexInvaders Game Server${NC} (${CYAN}${SERVICE_NAME}${NC})"
        echo -e "   ${BOLD}Status:${NC}       ${RED}Inactive (${active_state}/${sub_state})${NC}"
        
        # Check if port is in use by an orphaned process
        local port_proc
        port_proc=$(get_process_on_port "$port")
        if [ -n "$port_proc" ]; then
            echo -e "   ${YELLOW}Warning:${NC} Port ${port} is currently bound by another process (outside systemd):"
            echo -e "     $port_proc"
        fi
        return 3
    fi
}

# Deploy the systemd service file
cmd_deploy() {
    if [ -f "${SCRIPT_DIR}/.dist" ]; then
        log_info ".dist file detected: deployment is managed externally. Skipping deploy."
        return 0
    fi

    echo "====================================================="
    echo " Deploying HexInvaders systemd Service"
    echo "====================================================="

    # 1. Check prerequisites
    log_info "Checking prerequisites..."
    if ! command -v node &>/dev/null; then
        log_error "Node.js is not found in PATH."
        exit 1
    fi
    if ! command -v systemctl &>/dev/null; then
        log_error "systemctl is not available on this system."
        exit 1
    fi

    local node_bin
    node_bin="$(which node)"
    local node_dir
    node_dir="$(dirname "$node_bin")"
    local run_user="${SUDO_USER:-$(id -un)}"
    local port
    port=$(get_configured_port)

    log_info "Detected configuration:"
    echo "   - Project Dir:   ${SCRIPT_DIR}"
    echo "   - Server Dir:    ${SERVER_DIR}"
    echo "   - Service User:  ${run_user}"
    echo "   - Node Binary:   ${node_bin}"
    echo "   - Port:          ${port}"

    # 2. Build the project
    echo ""
    if [ -f "${SCRIPT_DIR}/.dist" ]; then
        log_info ".dist file detected: skipping build step."
    else
        log_info "Building workspace for production (js/bundle.js)..."
        cd "${SCRIPT_DIR}"
        node build.js
        log_success "Build completed successfully."
    fi

    # 3. Create service unit content
    local temp_service_file
    temp_service_file=$(mktemp)

    cat <<EOF > "$temp_service_file"
[Unit]
Description=HexInvaders Game Server
After=network.target

[Service]
Type=simple
User=${run_user}
WorkingDirectory=${SERVER_DIR}
Environment="NODE_ENV=production"
Environment="PORT=${port}"
Environment="PATH=${node_dir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=${node_bin} server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # 4. Copy to /etc/systemd/system/
    log_info "Installing ${SERVICE_NAME} to /etc/systemd/system/..."
    sudo cp "$temp_service_file" "/etc/systemd/system/${SERVICE_NAME}"
    sudo chmod 644 "/etc/systemd/system/${SERVICE_NAME}"
    rm -f "$temp_service_file"

    # Also keep repository template in sync
    cp "/etc/systemd/system/${SERVICE_NAME}" "${SCRIPT_DIR}/${SERVICE_NAME}" 2>/dev/null || true

    # 5. Reload and enable service
    log_info "Reloading systemd daemon and enabling service..."
    sudo systemctl daemon-reload
    sudo systemctl enable "${SERVICE_NAME}"

    log_success "Service ${SERVICE_NAME} deployed and enabled successfully!"
    echo ""
    echo "You can now control the service using:"
    echo "   ${BOLD}./production.sh start${NC}    - Start the game server"
    echo "   ${BOLD}./production.sh status${NC}   - Check status, PID & port"
    echo "   ${BOLD}./production.sh stop${NC}     - Stop the game server"
    echo "   ${BOLD}./production.sh restart${NC}  - Restart the game server"
}

# Start the systemd service
cmd_start() {
    # Check if systemd unit exists; auto-deploy if missing
    if ! systemctl list-unit-files "${SERVICE_NAME}" &>/dev/null; then
        log_warn "Service ${SERVICE_NAME} is not yet installed in systemd."
        log_info "Auto-deploying ${SERVICE_NAME}..."
        cmd_deploy
    fi

    log_info "Starting ${SERVICE_NAME}..."

    # Check if already active
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log_warn "Service is already running."
        cmd_status
        return 0
    fi

    # Check if port is already taken by a non-systemd process
    local port
    port=$(get_configured_port)
    local port_proc
    port_proc=$(get_process_on_port "$port")
    if [ -n "$port_proc" ]; then
        log_warn "Port ${port} is already in use by another process:"
        echo "  $port_proc"
        echo "  If this is an old manual instance, stop or kill it before starting the service."
    fi

    sudo systemctl start "${SERVICE_NAME}"
    
    # Wait briefly for startup
    sleep 1.5

    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log_success "Started ${SERVICE_NAME} successfully."
        echo ""
        cmd_status
    else
        log_error "Failed to start ${SERVICE_NAME}. Checking recent logs:"
        echo ""
        sudo journalctl -u "${SERVICE_NAME}" -n 20 --no-pager
        exit 1
    fi
}

# Stop the systemd service
cmd_stop() {
    log_info "Stopping ${SERVICE_NAME}..."

    if ! systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log_warn "Service is not currently running."
        return 0
    fi

    sudo systemctl stop "${SERVICE_NAME}"
    sleep 1

    if ! systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log_success "Stopped ${SERVICE_NAME}."
    else
        log_error "Failed to stop ${SERVICE_NAME}."
        exit 1
    fi
}

# Restart the systemd service
cmd_restart() {
    log_info "Restarting ${SERVICE_NAME}..."
    sudo systemctl restart "${SERVICE_NAME}"
    sleep 1.5

    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log_success "Restarted ${SERVICE_NAME} successfully."
        echo ""
        cmd_status
    else
        log_error "Failed to restart ${SERVICE_NAME}. Checking recent logs:"
        echo ""
        sudo journalctl -u "${SERVICE_NAME}" -n 20 --no-pager
        exit 1
    fi
}

# Show help menu
show_help() {
    echo -e "${BOLD}HexInvaders - Production Service Management${NC}"
    echo ""
    echo -e "Usage: ${BOLD}./production.sh${NC} [${CYAN}command${NC}]"
    echo ""
    echo "Commands:"
    echo -e "  ${BOLD}deploy${NC}   Build the app and deploy the systemd service unit file to /etc/systemd/system/"
    echo -e "  ${BOLD}start${NC}    Start the game server systemd service"
    echo -e "  ${BOLD}stop${NC}     Stop the game server systemd service"
    echo -e "  ${BOLD}restart${NC}  Restart the game server systemd service"
    echo -e "  ${BOLD}status${NC}   Show running status, process PID, and listening port"
    echo ""
}

# Parse command line argument
ACTION="${1:-}"
ACTION_LOWER="$(echo "$ACTION" | tr '[:upper:]' '[:lower:]')"

# Check for .dist redirection before processing commands
if [ -n "$ACTION" ] && [ "$ACTION" != "-h" ] && [ "$ACTION" != "--help" ] && [ "$ACTION" != "help" ]; then
    check_dist_redirection "$@"
fi

case "$ACTION_LOWER" in
    deploy)
        cmd_deploy
        ;;
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    -h|--help|help|"")
        show_help
        ;;
    *)
        log_error "Unknown command: '$ACTION'"
        echo ""
        show_help
        exit 1
        ;;
esac
