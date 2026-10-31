# Package managers: Homebrew and APT

**For:** maintainers who release Brokspace IDE. **Time:** about 30 minutes,
once.

Every release already publishes installers on GitHub Releases. This guide
adds the two package managers, so users can install and update with one
command:

| | Users run | What you set up |
|---|---|---|
| **Homebrew** (macOS) | `brew install --cask brokspace/tap/brokspace-ide` | Repository `brokspace/homebrew-tap` + 1 secret |
| **APT** (Debian, Ubuntu) | `sudo apt install brokspace-ide` | Repository `brokspace/apt` (GitHub Pages) + a signing key + 3 secrets |

After this setup, every `vX.Y.Z` tag updates both automatically (the
`homebrew` and `apt` jobs of `.github/workflows/release.yml`). Each part is
independent: do one, the other, or both. Until a part is configured, its
job prints a notice and skips; releases keep working.

**Before you start:** the `brokspace/ide` repository exists on GitHub, you
are an owner of the `brokspace` organization, and `gh auth status` works.

---

## Part 1: Homebrew

### 1.1 Create the tap repository

The name must be `homebrew-tap`: Homebrew turns `brokspace/tap` into
`github.com/brokspace/homebrew-tap`.

```sh
gh repo create brokspace/homebrew-tap --public \
  --description "Homebrew tap for Brokspace: brew install --cask brokspace/tap/brokspace-ide" \
  --add-readme
```

Check: `gh repo view brokspace/homebrew-tap` shows the repository.

### 1.2 Create a token that can write to it

The release workflow of `brokspace/ide` pushes the updated cask to the tap,
so it needs a token for that one repository.

1. Open GitHub > your avatar > **Settings** > **Developer settings** >
   **Personal access tokens** > **Fine-grained tokens** > **Generate new
   token**.
2. **Token name:** `brokspace-ide release: homebrew-tap`.
3. **Resource owner:** `brokspace`.
4. **Expiration:** 1 year (put a reminder in your calendar, see
   [Keep it running](#part-3-keep-it-running)).
5. **Repository access:** *Only select repositories* > `brokspace/homebrew-tap`.
6. **Permissions** > Repository permissions > **Contents: Read and write**
   (Metadata: Read-only is added automatically).
7. **Generate token** and copy it.

If the organization requires approval for fine-grained tokens, approve it in
**brokspace** > **Settings** > **Personal access tokens** > **Pending
requests**.

### 1.3 Add the secret to the IDE repository

```sh
gh secret set HOMEBREW_TAP_TOKEN --repo brokspace/ide
# paste the token, then Enter
```

Check: `gh secret list --repo brokspace/ide` lists `HOMEBREW_TAP_TOKEN`.

### 1.4 Publish the cask

On the next release, the `homebrew` job writes `Casks/brokspace-ide.rb` with
the version and the checksums of the two macOS disk images. To do it now for
a release that already exists:

```sh
gh workflow run release.yml --repo brokspace/ide -f tag=v0.1.0
```

(This rebuilds and re-uploads that release's installers, then updates the
tap.) Check: `https://github.com/brokspace/homebrew-tap/blob/main/Casks/brokspace-ide.rb`
exists and its `version` is the release.

### 1.5 Try it on a Mac

```sh
brew install --cask brokspace/tap/brokspace-ide
brok --version                      # the cask links brok and brok-agent too
open -a "Brokspace IDE"
```

The app is not code-signed and notarized yet
([plan](https://github.com/brokspace/brok/blob/main/docs/maintainers/code-signing.md)),
so macOS refuses the first launch. Open it once with right click > **Open**,
or allow it in **System Settings** > **Privacy & Security** > **Open
Anyway**. Updates: `brew upgrade --cask brokspace-ide` (the IDE also updates
itself).

### 1.6 (Optional) The brok CLI formula

For people who want only the CLI: `brew install brokspace/tap/brok`. Render
the formula from the published brok and brok-agent releases and commit it to
the tap. Repeat after each brok or brok-agent release:

```sh
git clone https://github.com/brokspace/homebrew-tap.git
node packaging/homebrew/render.mjs --brok 0.2.4 --agent 0.2.1 --out homebrew-tap
cd homebrew-tap
git add Formula/brok.rb && git commit -m "brok 0.2.4" && git push
brew install brokspace/tap/brok && brok --version     # check on a Mac
```

---

## Part 2: APT (Debian and Ubuntu)

An APT repository is a set of static files: the packages, an index, and a
signature that proves the index comes from us. The release workflow builds
it with `packaging/apt/build-repo.sh` and publishes it on GitHub Pages at
`https://brokspace.github.io/apt`.

### 2.1 Create the repository

```sh
gh repo create brokspace/apt --public \
  --description "APT repository for Brokspace (GitHub Pages)" \
  --add-readme
```

### 2.2 Create the signing key

APT refuses unsigned repositories, so the index is signed with a key made
only for this. Use any machine with GnuPG (Linux, macOS with
`brew install gnupg`, or **Git Bash** on Windows, which includes `gpg`).

```sh
gpg --batch --pinentry-mode loopback --passphrase '' \
  --quick-generate-key "Brokspace APT <apt@brokspace.org>" rsa4096 sign 2y
gpg --list-secret-keys --keyid-format long "Brokspace APT"
```

The second command prints a line like `sec   rsa4096/ABCD1234EF567890
2026-10-31 [SC] [expires: 2028-10-31]`. The part after `rsa4096/`
(`ABCD1234EF567890`) is the **key ID**.

The key has no passphrase because the workflow signs without a person
present; the GitHub secret is what protects it. Keep a backup and a
revocation certificate somewhere safe (a password manager), not in a
repository:

```sh
gpg --armor --export-secret-keys ABCD1234EF567890 > brokspace-apt-private.asc
gpg --output brokspace-apt-revoke.asc --gen-revoke ABCD1234EF567890
```

### 2.3 Add the key to the IDE repository

```sh
gh secret set APT_GPG_KEY_ID --repo brokspace/ide --body ABCD1234EF567890
gh secret set APT_GPG_PRIVATE_KEY --repo brokspace/ide < brokspace-apt-private.asc
```

Then delete the local `brokspace-apt-private.asc` once it is in your
password manager.

### 2.4 Create a token that can write to the APT repository

Same steps as [1.2](#12-create-a-token-that-can-write-to-it), with:

- **Token name:** `brokspace-ide release: apt`
- **Repository access:** only `brokspace/apt`
- **Permissions:** Contents: Read and write

```sh
gh secret set APT_REPO_TOKEN --repo brokspace/ide
# paste the token, then Enter
```

Check: `gh secret list --repo brokspace/ide` lists `APT_GPG_KEY_ID`,
`APT_GPG_PRIVATE_KEY` and `APT_REPO_TOKEN`.

### 2.5 Publish the repository

On the next release, the `apt` job adds the new `.deb` files (x64 and
arm64), regenerates and signs the index, and pushes it to the `gh-pages`
branch of `brokspace/apt`. To do it now:

```sh
gh workflow run release.yml --repo brokspace/ide -f tag=v0.1.0
```

Check: `https://github.com/brokspace/apt/tree/gh-pages` has `pool/`,
`dists/stable/` and `brokspace-archive-keyring.gpg`.

### 2.6 Turn on GitHub Pages

1. `brokspace/apt` > **Settings** > **Pages**.
2. **Source:** Deploy from a branch. **Branch:** `gh-pages`, folder `/ (root)`.
   **Save**.
3. Wait a minute, then open `https://brokspace.github.io/apt/`: it shows the
   install commands.

Check: `curl -fsSI https://brokspace.github.io/apt/dists/stable/InRelease`
answers `200`.

### 2.7 Try it in a clean Ubuntu

```sh
docker run --rm -it ubuntu:24.04 bash
# inside the container:
apt-get update && apt-get install -y curl ca-certificates
curl -fsSL https://brokspace.github.io/apt/brokspace-archive-keyring.gpg -o /usr/share/keyrings/brokspace-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/brokspace-archive-keyring.gpg] https://brokspace.github.io/apt stable main" > /etc/apt/sources.list.d/brokspace.list
apt-get update && apt-get install -y brokspace-ide
brok --version && ls /usr/bin/brokspace-ide
```

`apt-get update` must not print "NO_PUBKEY" or "not signed": that would mean
the signing key or the `InRelease` file is wrong.

### 2.8 (Optional) Your own domain: apt.brokspace.org

1. In Hostinger's DNS for `brokspace.org`, add a **CNAME** record: name
   `apt`, target `brokspace.github.io`.
2. `brokspace/apt` > **Settings** > **Pages** > **Custom domain:**
   `apt.brokspace.org`, **Save**, then tick **Enforce HTTPS** once the
   certificate is ready.
3. Replace `https://brokspace.github.io/apt` with `https://apt.brokspace.org`
   in `packaging/apt/build-repo.sh` and in the README of `brokspace/ide`.
4. Users who added the old URL keep working: GitHub redirects it.

---

## Part 3: Keep it running

| When | What |
|---|---|
| Every release | Nothing: tag `vX.Y.Z` and the workflow updates the cask and the APT repository |
| Every brok release | Re-render `Formula/brok.rb` ([1.6](#16-optional-the-brok-cli-formula)) if you publish the CLI formula |
| Before a token expires (1 year) | Create a new token the same way and run `gh secret set` again |
| Before the signing key expires (2 years) | `gpg --quick-set-expire <fingerprint> 2y` (the fingerprint is the 40-character line under `sec` in `gpg --fingerprint "Brokspace APT"`), export it again ([2.2](#22-create-the-signing-key)) and update `APT_GPG_PRIVATE_KEY`; the key stays the same, so users change nothing |
| If the signing key leaks | Publish the revocation certificate, create a new key, update both secrets, and tell users to download the new keyring (2.7) |

### Troubleshooting

| Symptom | Fix |
|---|---|
| Release log: "HOMEBREW_TAP_TOKEN not set" / "APT secrets not set" | The secret is missing or misspelled in `brokspace/ide`; check `gh secret list --repo brokspace/ide` |
| `homebrew` job: 403 when pushing | The token cannot write to `brokspace/homebrew-tap`: check its repository access, the Contents permission, and the organization approval |
| `homebrew` job: 404 on a `.sha256` | A macOS build failed in that release; fix it and run the workflow again for the tag |
| `apt` job: "gpg: signing failed" | `APT_GPG_KEY_ID` does not match the imported key, or the key has a passphrase |
| `apt-get update`: NO_PUBKEY | Users have an old keyring: download `brokspace-archive-keyring.gpg` again |
| Pages shows 404 | Pages is not enabled for `gh-pages` (2.6), or the first publish has not run yet |

Windows has no package manager here yet: winget comes with code signing,
see the [code signing plan](https://github.com/brokspace/brok/blob/main/docs/maintainers/code-signing.md).
