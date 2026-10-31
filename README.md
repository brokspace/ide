<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/brokspace-on-dark.svg">
    <img src=".github/brokspace.svg" alt="Brokspace" height="88">
  </picture>
</p>
<p align="center"><b>Brokspace IDE: your workspace, understood.</b></p>

An IDE with Brokspace built in: local-first search across every repository in
your folder, an agent that answers from your own LLM with the sources it used,
reviews and commit messages, skills and shards. Use Brokspace in **IDE mode**
(this app) or **CLI mode** (`brok`); both share the same workspace.

Built on [Eclipse Theia](https://theia-ide.org), so VS Code extensions from
[Open VSX](https://open-vsx.org) work too.

## What's inside

| | |
|---|---|
| **Home** | Ask about the workspace or describe a change; suggestions to start |
| **Brokspace view** | Workspace status (service, index, model), hybrid search with results that open at the line, the agent's actions, skills and shards |
| **Brokspace agent** | The default chat agent: answers from your LLM grounded in the index, follow-ups, `/review`, `/review staged`, `/review base main`, `/skill <name> <input>` |
| **Source control** | ✨ in the Source Control toolbar writes the commit message from the staged changes |
| **Brokspace menu and commands** | Set up, start/stop, rebuild the index, doctor, install shards, export skills to coding agents |
| **Status bar** | Service state and model at a glance |
| **brok included** | `brok` and `brok-agent` ship with the IDE and are on `PATH` in its terminals; the installers put them on your `PATH` too |
| **Themes** | Brokspace Dark (default) and Brokspace Light |

The IDE talks to Brokspace only through the `brok` CLI and its `--json`
output ([contract](https://github.com/brokspace/brok/blob/main/docs/integrations.md)),
so anything the IDE does, you can script. It needs brok 0.2.4 or newer.

## Install

| | |
|---|---|
| **macOS** | `brew install --cask brokspace/tap/brokspace-ide` |
| **Debian / Ubuntu** | Add the [Brokspace APT repository](https://brokspace.github.io/apt), then `sudo apt install brokspace-ide` |
| **Linux (other)** | AppImage or `.tar.gz` from the [latest release](https://github.com/brokspace/ide/releases/latest) |
| **Windows** | `BrokspaceIDE-<version>-windows-x64-setup.exe` from the [latest release](https://github.com/brokspace/ide/releases/latest) |

The IDE updates itself from GitHub Releases. Builds are not code-signed yet
([plan](https://github.com/brokspace/brok/blob/main/docs/maintainers/code-signing.md)):
on macOS, open it the first time with right click > Open; on Windows, choose
"More info > Run anyway" in SmartScreen.

You need an LLM for answers (search works without one): see
[getting started](https://github.com/brokspace/brok/blob/main/docs/getting-started.md#2-get-a-local-llm-optional).

## Develop

Requirements: Node.js 24, Yarn 1, git, and on Linux `libxkbfile-dev` and
`libsecret-1-dev` (or use `.devcontainer/Dockerfile`).

```sh
yarn                       # install
yarn build:extensions      # compile theia-extensions/*
yarn download:plugins      # VS Code built-in extensions + plugins-local/*
yarn browser build         # browser app (fastest to try)
yarn browser start         # http://localhost:3000

node scripts/fetch-brok.mjs   # bundle brok for this machine
yarn electron build && yarn electron start
yarn electron package         # installers in applications/electron/dist
```

| Path | What |
|---|---|
| `applications/browser`, `applications/electron` | The two app targets and their Theia configuration (defaults: theme, AI, Brokspace agent) |
| `theia-extensions/brok` | Brokspace integration: backend service over the `brok` CLI, view, chat agent, commands, status bar |
| `theia-extensions/product` | Branding: home page, about dialog, help menu |
| `theia-extensions/updater`, `launcher` | Auto-update from GitHub Releases; CLI launcher for AppImage |
| `plugins-local/brokspace-theme` | Brokspace Dark and Light color themes |
| `packaging/homebrew`, `packaging/apt` | Homebrew cask and formula, APT repository builder |
| `scripts/fetch-brok.mjs` | Downloads and verifies brok and brok-agent for packaging |

## Release

1. Bump `version` in the root and workspace `package.json` files and
   `lerna.json` and update the changelog, in a PR to `staging`. Then merge
   the release PR ("release: promote staging to main").
2. Tag `vX.Y.Z` on `main` and push it
   (`git fetch origin && git tag vX.Y.Z origin/main && git push origin vX.Y.Z`). The Release workflow builds every platform,
   uploads installers with `.sha256` files and update metadata, publishes the
   release, then updates the Homebrew tap and the APT repository when their
   secrets are set. One-time setup, step by step:
   [docs/maintainers/package-managers.md](docs/maintainers/package-managers.md).

## Credits

Based on the [Eclipse Theia IDE](https://github.com/eclipse-theia/theia-ide)
(MIT); upstream history is kept, so Theia updates merge from the
`upstream` remote. See [NOTICE.md](NOTICE.md).

## License

MIT, see [LICENSE](LICENSE). The Brokspace name and logo are covered by the
[brand license](https://github.com/brokspace/brand).
