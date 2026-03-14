# fleet

> **Status**: Experimental - APIs might change without major version bumps.

CLI that creates isolated, git-backed workspaces for a single project.
It helps when multiple AI agents (or humans) need to work in parallel without conflicts.

Each task gets its own workspace in `.fleet/workspaces/<name>` instead of juggling branches in one directory.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/TimoBechtel/fleet-cli/main/install.sh | bash
```

> Or let your AI agent install it, see [Install skill](#install-skill).

Then enable shell integration so `fleet switch` can change your directory:

```bash
eval "$(fleet shell-code)"
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

## Why

- No shared working tree between tasks.
- No stashing to switch contexts.
- Run commands in any workspace with `fleet exec`.
- Each agent gets its own directory and git state. No interference.

## Backends (worktree vs clone)

`fleet` uses git worktrees by default.

You can switch to full clones if you run tools that don’t behave well with worktrees. For example, when using AI agents with sandboxing.

Config (project `.fleet/config.json` or global `~/.config/fleet/config.json):

```json
{
  "backend": "clone"
}
```

Or use `--backend clone|worktree` when creating workspaces.

## Quick start

```bash
fleet init .
fleet add feature-a
fleet switch feature-a
# ...work...
fleet switch --root
fleet merge feature-a
```

## Install skill

This repo includes a skill at `skills/fleet/SKILL.md`. Install it with:

```bash
npx skills add TimoBechtel/fleet-cli --skill fleet
```
