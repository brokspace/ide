# AGENTS.md

Operating guide for coding agents working in `brokspace/ide`. Read the README first for what this repository is and how to run it.

## Git workflow

Every change reaches `main` through `staging`, the default branch:

```text
your branch --PR, squash--> staging --release PR, merge commit--> main --> tag
```

1. Branch from staging: `git fetch origin && git switch -c <type>/<topic> origin/staging` (for example `feat/kotlin-chunker`, `fix/empty-config`).
2. Commit in small steps with Conventional Commits. End every commit message with a `Co-Authored-By:` trailer naming the agent, for example `Co-Authored-By: Claude <noreply@anthropic.com>`: the PR gets the `ai-agent` label from it.
3. Before pushing, run what CI runs: `yarn build:extensions && yarn browser build`.
4. Push, open the PR against staging with the template filled in, and turn on auto-merge:

   ```sh
   git push -u origin HEAD
   gh pr create --base staging --fill
   gh pr merge --auto --squash
   ```

   The PR merges itself once `Build (browser app)` and `policy / title` pass and review conversations are resolved. No approval is needed.
5. A check failed? Read it (`gh pr checks --watch`, `gh run view --log-failed`), fix it on the same branch and push; auto-merge stays on. Cannot fix it? Say what you tried in a PR comment and stop. Never weaken or skip a check to get green.

Never push to `staging` or `main` (both reject it), force-push a branch someone else pushed to, open or merge PRs into `main`, or merge with `--admin`. The release PR into `main` is opened by the Promote workflow and merged by a maintainer.
