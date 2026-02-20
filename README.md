# fleet

CLI that creates isolated, git-backed workspaces for a single project.
It helps when multiple AI agents (or humans) need to work in parallel without conflicts.

Each task gets its own full workspace in `.fleet/workspaces/<name>` instead of juggling branches in one directory.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/TimoBechtel/fleet-cli/main/install.sh | bash
```

> Or let your AI agent install it, see [Install skill](#install-skill).

Then enable shell integration so `fleet switch` can change your directory:

```bash
eval "$(fleet shell-code)"
```

## Why

- No shared working tree between tasks.
- No stashing to switch contexts.
- Run commands in any workspace with `fleet exec`.
- Each agent gets its own directory and git state. No interference.

## Why not git worktrees

`fleet` uses full clones, not worktrees.

Worktrees share git internals. That causes problems when multiple agents write to the same repo concurrently. Full clones don't have this issue, and every workspace looks like a normal repo to any tool.

## Quick start

```bash
fleet init .
fleet new feature-a
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
