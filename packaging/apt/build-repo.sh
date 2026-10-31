#!/usr/bin/env bash
# Builds a signed APT repository from .deb files.
#
#   packaging/apt/build-repo.sh <debs dir> <repo dir>
#
# <repo dir> may already hold earlier releases (it is the published site):
# new packages are added to pool/, indexes are regenerated and signed.
# Needs: apt-utils (apt-ftparchive), gpg with the signing key imported, and
# APT_GPG_KEY_ID set to that key.
set -euo pipefail

debs="$1"
repo="$2"
: "${APT_GPG_KEY_ID:?set APT_GPG_KEY_ID to the signing key}"
suite=stable
component=main

mkdir -p "$repo/pool/$component"
cp "$debs"/*.deb "$repo/pool/$component/"

cd "$repo"
for arch in amd64 arm64; do
    dir="dists/$suite/$component/binary-$arch"
    mkdir -p "$dir"
    apt-ftparchive --arch "$arch" packages "pool/$component" > "$dir/Packages"
    gzip -9 -k -f "$dir/Packages"
done

apt-ftparchive \
    -o "APT::FTPArchive::Release::Origin=Brokspace" \
    -o "APT::FTPArchive::Release::Label=Brokspace" \
    -o "APT::FTPArchive::Release::Suite=$suite" \
    -o "APT::FTPArchive::Release::Codename=$suite" \
    -o "APT::FTPArchive::Release::Components=$component" \
    -o "APT::FTPArchive::Release::Architectures=amd64 arm64" \
    -o "APT::FTPArchive::Release::Description=Brokspace IDE and tools" \
    release "dists/$suite" > "dists/$suite/Release"

gpg --batch --yes --local-user "$APT_GPG_KEY_ID" --armor --detach-sign -o "dists/$suite/Release.gpg" "dists/$suite/Release"
gpg --batch --yes --local-user "$APT_GPG_KEY_ID" --clearsign -o "dists/$suite/InRelease" "dists/$suite/Release"
gpg --export "$APT_GPG_KEY_ID" > brokspace-archive-keyring.gpg

cat > index.html <<'EOF'
<!doctype html><meta charset="utf-8"><title>Brokspace APT repository</title>
<pre>
curl -fsSL https://brokspace.github.io/apt/brokspace-archive-keyring.gpg | sudo tee /usr/share/keyrings/brokspace-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/brokspace-archive-keyring.gpg] https://brokspace.github.io/apt stable main" | sudo tee /etc/apt/sources.list.d/brokspace.list
sudo apt update && sudo apt install brokspace-ide
</pre>
EOF
echo "APT repository ready in $repo"
