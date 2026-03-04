#!/usr/bin/env bash
set -euo pipefail

REPO="TimoBechtel/fleet-cli"
BIN_NAME="fleet"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

log() {
  printf "%s\n" "$*"
}

fail() {
  printf "Error: %s\n" "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

detect_asset() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64) printf "fleet-darwin-arm64" ;;
        x86_64|amd64) printf "fleet-darwin-x64" ;;
        *) fail "Unsupported macOS architecture: $arch" ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64|amd64) printf "fleet-linux-x64" ;;
        *) fail "Unsupported Linux architecture: $arch" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      case "$arch" in
        x86_64|amd64) printf "fleet-windows-x64.exe" ;;
        *) fail "Unsupported Windows architecture: $arch" ;;
      esac
      ;;
    *)
      fail "Unsupported operating system: $os"
      ;;
  esac
}

resolve_tag() {
  if [ -n "${FLEET_VERSION:-}" ]; then
    if [[ "$FLEET_VERSION" == v* ]]; then
      printf "%s" "$FLEET_VERSION"
    else
      printf "v%s" "$FLEET_VERSION"
    fi
    return
  fi

  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$tag" ] || fail "Could not resolve latest release tag"
  printf "%s" "$tag"
}

check_path() {
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
      log ""
      log "Warning: $INSTALL_DIR is not on PATH."
      log "Add this to your shell config:"
      log "  export PATH=\"$INSTALL_DIR:\$PATH\""
      ;;
  esac
}

detect_shell() {
  local shell
  shell="${SHELL:-}"

  if [ -z "$shell" ]; then
    printf ""
    return
  fi

  case "$shell" in
    *zsh*) printf "zsh" ;;
    *bash*) printf "bash" ;;
    *fish*) printf "fish" ;;
    *) printf "" ;;
  esac
}

get_shell_config_file() {
  local shell
  shell="$1"

  case "$shell" in
    zsh)
      printf "%s" "$HOME/.zshrc"
      ;;
    bash)
      if [ -f "$HOME/.bashrc" ]; then
        printf "%s" "$HOME/.bashrc"
      else
        printf "%s" "$HOME/.bash_profile"
      fi
      ;;
    fish)
      printf "%s" "$HOME/.config/fish/config.fish"
      ;;
    *)
      printf ""
      ;;
  esac
}

print_manual_instructions() {
  log ""
  log "Manual setup: add these lines to your shell config"
  log ""
  log "# bash (~/.bashrc or ~/.bash_profile)"
  log "eval \"\$(fleet shell-code)\""
  log "source <(fleet completion --shell bash)"
  log ""
  log "# zsh (~/.zshrc)"
  log "eval \"\$(fleet shell-code)\""
  log "source <(fleet completion --shell zsh)"
  log ""
  log "# fish (~/.config/fish/config.fish)"
  log "eval (fleet shell-code --shell fish)"
  log "fleet completion --shell fish | source"
  log ""
  log "Then restart your terminal or run: source <config file>"
}

append_if_missing() {
  local config_file marker block
  config_file="$1"
  marker="$2"
  block="$3"

  if [ -f "$config_file" ] && grep -Fq "$marker" "$config_file"; then
    return 1
  fi

  printf "%b" "$block" >>"$config_file"
  return 0
}

setup_shell_integration() {
  local shell config_file integration_line completion_line changed
  shell="$1"
  config_file="$2"
  integration_line="$3"
  completion_line="$4"
  changed=0

  mkdir -p "$(dirname "$config_file")"
  [ -f "$config_file" ] || touch "$config_file"

  if append_if_missing "$config_file" "fleet shell-code" "\n# Fleet shell integration\n$integration_line\n"; then
    changed=1
  fi

  if append_if_missing "$config_file" "fleet completion --shell $shell" "\n# Fleet shell completions\n$completion_line\n"; then
    changed=1
  fi

  if [ "$changed" -eq 1 ]; then
    log "Added shell integration and completions to $config_file"
  else
    log "Shell integration and completions already configured in $config_file"
  fi

  log "Restart your terminal or run: source $config_file"
}

maybe_setup_shell() {
  local assume_yes shell config_file integration_line completion_line
  assume_yes="$1"

  shell="$(detect_shell)"
  config_file="$(get_shell_config_file "$shell")"

  if [ -z "$shell" ] || [ -z "$config_file" ]; then
    print_manual_instructions
    return
  fi

  case "$shell" in
    bash)
      integration_line='eval "$(fleet shell-code)"'
      completion_line='source <(fleet completion --shell bash)'
      ;;
    zsh)
      integration_line='eval "$(fleet shell-code)"'
      completion_line='source <(fleet completion --shell zsh)'
      ;;
    fish)
      integration_line='eval (fleet shell-code --shell fish)'
      completion_line='fleet completion --shell fish | source'
      ;;
  esac

  if [ -f "$config_file" ] \
    && grep -Fq "fleet shell-code" "$config_file" \
    && grep -Fq "fleet completion --shell $shell" "$config_file"; then
    log "Shell integration and completions already configured in $config_file"
    return
  fi

  if [ "$assume_yes" -eq 1 ]; then
    setup_shell_integration "$shell" "$config_file" "$integration_line" "$completion_line"
    return
  fi

  if [ -t 0 ] && [ -t 1 ]; then
    log ""
    log "Set up shell integration and completions in $config_file? [Y/n]"
    read -r reply
    case "$reply" in
      ""|y|Y|yes|YES)
        setup_shell_integration "$shell" "$config_file" "$integration_line" "$completion_line"
        ;;
      *)
        log "Skipping automatic setup."
        print_manual_instructions
        ;;
    esac
  else
    print_manual_instructions
  fi
}

main() {
  require_cmd curl
  require_cmd chmod
  require_cmd mv
  require_cmd mkdir
  require_cmd uname

  local assume_yes
  assume_yes=0
  for arg in "$@"; do
    case "$arg" in
      -y|--yes)
        assume_yes=1
        ;;
      --)
        break
        ;;
      *)
        :
        ;;
    esac
  done

  local asset tag url tmp_file final_path
  asset="$(detect_asset)"
  tag="$(resolve_tag)"
  url="https://github.com/$REPO/releases/download/$tag/$asset"
  tmp_file="$(mktemp)"
  final_path="$INSTALL_DIR/$BIN_NAME"

  log "Installing $BIN_NAME $tag"
  log "Downloading $asset"
  curl -fL "$url" -o "$tmp_file" || fail "Failed to download asset from $url"

  mkdir -p "$INSTALL_DIR"
  chmod +x "$tmp_file"
  mv "$tmp_file" "$final_path"

  log "Installed to $final_path"
  check_path

  if "$final_path" --version >/dev/null 2>&1; then
    log "Install verified: $("$final_path" --version)"
  else
    fail "Install finished, but version check failed"
  fi

  maybe_setup_shell "$assume_yes"
}

main "$@"
