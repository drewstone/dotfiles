#!/usr/bin/env python3
"""Install skills from other repositories at pinned commits, verifying every file's sha256.

A floating `npx skills add` installs whatever upstream holds today, so two hosts can read
different instructions and an upstream change reaches every agent unreviewed. This fetches
the GitHub tarball for the pinned commit, refuses any file whose sha256 differs from
external-skills.json, and stores each source under <store>/<owner>__<repo>@<commit>/.
It prints one JSON object: {"skills": {name: dir}} for install.sh to link. When GitHub is
unreachable it reuses a previously verified store and says so on stderr.

Usage: install-external-skills.py --manifest FILE --store DIR
"""
import argparse, hashlib, io, json, os, shutil, subprocess, sys, tarfile, tempfile


def fetch(url):
    # curl uses the system trust store; the python.org macOS build ships none of its own.
    return subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '120', url],
                          check=True, capture_output=True).stdout


def verified(directory, files):
    for name, digest in files.items():
        path = os.path.join(directory, name)
        if not os.path.isfile(path) or hashlib.sha256(open(path, 'rb').read()).hexdigest() != digest:
            return False
    return True


def install_source(source, store):
    owner_repo, commit = source['repo'], source['commit']
    root = os.path.join(store, f"{owner_repo.replace('/', '__')}@{commit}")
    skills = source['skills']
    if all(verified(os.path.join(root, name), files) for name, files in skills.items()):
        return {name: os.path.join(root, name) for name in skills}
    try:
        blob = fetch(f'https://codeload.github.com/{owner_repo}/tar.gz/{commit}')
    except subprocess.CalledProcessError as error:
        raise SystemExit(f'install-external-skills: cannot fetch {owner_repo}@{commit}: {error.stderr.decode()[:200]}')
    staging = tempfile.mkdtemp(dir=store)
    try:
        with tarfile.open(fileobj=io.BytesIO(blob), mode='r:gz') as archive:
            members = [m for m in archive.getmembers() if m.isfile()]
            prefix = members[0].name.split('/', 1)[0] if members else ''
            for name, files in skills.items():
                for file_name, digest in files.items():
                    member = archive.getmember(f"{prefix}/{source.get('path', '').strip('/')}/{name}/{file_name}".replace('//', '/'))
                    data = archive.extractfile(member).read()
                    actual = hashlib.sha256(data).hexdigest()
                    if actual != digest:
                        raise SystemExit(f'install-external-skills: {owner_repo}@{commit} {name}/{file_name} sha256 {actual} != pinned {digest}')
                    os.makedirs(os.path.join(staging, name), exist_ok=True)
                    with open(os.path.join(staging, name, file_name), 'wb') as handle:
                        handle.write(data)
        if os.path.exists(root):
            shutil.rmtree(root)
        os.rename(staging, root)
    finally:
        if os.path.exists(staging):
            shutil.rmtree(staging)
    return {name: os.path.join(root, name) for name in skills}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--store', required=True)
    args = parser.parse_args()
    os.makedirs(args.store, exist_ok=True)
    manifest = json.load(open(args.manifest))
    installed = {}
    for source in manifest.get('sources', []):
        installed.update(install_source(source, args.store))
    print(json.dumps({'skills': installed}))


if __name__ == '__main__':
    main()
