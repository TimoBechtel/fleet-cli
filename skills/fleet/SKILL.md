---
name: fleet
description: Manage isolated git-backed project workspaces with the fleet CLI. Use when working on a project that uses fleet, when creating/switching/merging/deleting workspaces, or when the user mentions fleet commands, fleet workspaces, or fleet init.
---

# Fleet

Fleet is a CLI for managing isolated project workspaces backed by git. Each workspace is a clone of the main workspace, letting you work on multiple tasks in parallel without stashing or branch-juggling.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/TimoBechtel/fleet-cli/main/install.sh | bash
```

Then set up shell integration (required for `fleet switch` to change your directory):

```bash
# Add to ~/.zshrc, ~/.bashrc, or ~/.config/fish/config.fish
eval "$(fleet shell-code)"
```

For a specific shell:

```bash
fleet shell-code --shell bash   # or zsh, fish
```

Enable shell completions:

```bash
# bash
source <(fleet completion --shell bash)

# zsh
source <(fleet completion --shell zsh)

# fish
fleet completion --shell fish | source
```

## Project setup

Initialize fleet in a git repo:

```bash
fleet init [name]
```

This creates `.fleet/config.json` and `.fleet/workspaces/`.

## Core commands

```bash
fleet add <name>          # create a new workspace
fleet switch [workspace]  # switch to a workspace (interactive if no arg)
fleet switch <name> -a    # create and switch in one step
fleet switch -r           # go back to project root
fleet merge <workspace>   # merge workspace into current branch, then delete it
fleet rm <workspace>      # delete a workspace
fleet clean               # delete all fully-merged, clean workspaces
fleet exec <workspace> <command> [args...]  # run a command in a workspace
```

## Typical workflow

```bash
fleet init                          # one-time setup
fleet add feature-login             # new workspace for a task
fleet switch feature-login          # cd into it
# ... do work ...
fleet switch -r                     # go back to project root
fleet merge feature-login           # merge + delete when done
```
