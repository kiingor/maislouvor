#!/usr/bin/env python3
"""Prepare, publish and roll back a reviewed +Louvor web release.

`inspect` and `prepare` do not change production. `prepare` always runs the legal
gate through npm's normal build and binds the resulting files to a Git commit.
`apply` is a separate, explicit operation. It changes only /var/www/maislouvor.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

WEB = Path('/var/www/maislouvor')
RELEASES = Path('/var/lib/maislouvor-deploy')
LOCK_PATH = Path('/var/lock/maislouvor-deploy.lock')
HOST = 'louvor-vps'
ORIGIN = 'https://maislouvor.com'
SHELL = ['manifest.webmanifest', 'registerSW.js', 'index.html', 'sw.js']
ROUTES = ['/login', '/termos', '/privacidade', '/suporte', '/minha-privacidade',
          '/app/settings', '/admin/assinaturas']
SOURCE_PATHS = ['src', 'public', 'index.html', 'package.json', 'package-lock.json',
                'vite.config.ts', 'tsconfig.app.json', 'tsconfig.json',
                'tailwind.config.ts', 'postcss.config.js',
                'scripts/check-legal-placeholders.mjs']


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def inventory(root):
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise RuntimeError(f'Symlink refused in release surface: {path}')
        if path.is_file():
            result[path.relative_to(root).as_posix()] = digest(path)
    return result


def fetch(path):
    request = urllib.request.Request(ORIGIN + path, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return {'status': response.status, 'url': response.url,
                'sha256': hashlib.sha256(response.read()).hexdigest()}


def snapshot():
    protected = {}
    for folder in [Path('/var/www/maislouvor-marketing')]:
        for name, value in inventory(folder).items():
            protected[str(folder / name)] = value
    protected['/etc/caddy/Caddyfile'] = digest('/etc/caddy/Caddyfile')
    return {'web': inventory(WEB), 'protected': protected,
            'marketing_https': {route: fetch(route) for route in ['/', '/conheca/', '/robots.txt']}}


def validate_id(value):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{5,79}', value):
        raise ValueError('Release ID must be 6–80 lowercase letters, digits or hyphens')
    return value


def validate_files(files):
    if not isinstance(files, dict) or not set(SHELL).issubset(files):
        raise ValueError('Missing web application shell')
    for name, sha in files.items():
        path = PurePosixPath(name)
        if (path.is_absolute() or '..' in path.parts or str(path) != name or
                any(part.startswith('.') for part in path.parts) or
                path.suffix.lower() in {'.apk', '.map', '.pem', '.p12'} or
                not re.fullmatch(r'[a-f0-9]{64}', sha)):
            raise ValueError(f'Unsafe build file: {name}')


def ordered_files(files):
    # Existing hashed assets remain available for clients running the old shell.
    # The new service worker is activated only after every dependency and shell.
    return sorted(set(files) - set(SHELL) - {'landing-sw.js'}) + SHELL


def atomic_copy(source, target):
    missing = []
    parent = target.parent
    while not parent.exists():
        missing.append(parent)
        parent = parent.parent
    for folder in reversed(missing):
        folder.mkdir(mode=0o755)
    for parent in [target, *target.parents]:
        if parent.is_symlink():
            raise RuntimeError(f'Symlink refused: {parent}')
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.maislouvor-', delete=False) as handle:
        temporary = Path(handle.name)
    try:
        shutil.copyfile(source, temporary)
        temporary.chmod(0o644)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def restore_files(release, manifest):
    before = manifest['baseline']['web']
    for name in ordered_files(manifest['files']):
        target = WEB / name
        if name in before:
            atomic_copy(release / 'before' / name, target)
        elif not name.startswith('assets/') and not re.fullmatch(r'workbox-[\w-]+\.js', name):
            target.unlink(missing_ok=True)
    for name, sha in before.items():
        if digest(WEB / name) != sha:
            raise RuntimeError(f'Rollback verification failed: {name}')


def check_protected(baseline):
    current = snapshot()
    if current['protected'] != baseline['protected'] or current['marketing_https'] != baseline['marketing_https']:
        raise RuntimeError('Marketing or Caddy changed during publication')
    for name, sha in baseline['web'].items():
        if name.endswith('.apk') and current['web'].get(name) != sha:
            raise RuntimeError(f'APK changed: {name}')


def verify_published(manifest):
    for name, sha in manifest['files'].items():
        if digest(WEB / name) != sha:
            raise RuntimeError(f'Published file differs: {name}')
    for route in ROUTES:
        result = fetch(route)
        if result['status'] != 200 or result['sha256'] != manifest['files']['index.html']:
            raise RuntimeError(f'Application route differs: {route}')
    paths = [name for name in manifest['files'] if name.startswith('assets/') or
             name in SHELL + ['push-sw.js', 'landing-sw.js'] or name.startswith('workbox-')]

    def check_asset(name):
        result = fetch('/' + name)
        if result['status'] != 200 or result['sha256'] != manifest['files'][name]:
            raise RuntimeError(f'HTTPS asset differs: {name}')

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(check_asset, paths))
    check_protected(manifest['baseline'])
    return len(paths)


def extract_bundle(archive, payload):
    with tarfile.open(archive) as bundle:
        names = set()
        for member in bundle.getmembers():
            path = PurePosixPath(member.name)
            if (not member.isfile() or path.is_absolute() or '..' in path.parts or
                    str(path) != member.name or member.name in names or
                    not (member.name == 'release.json' or member.name.startswith('dist/'))):
                raise ValueError('Invalid bundle member')
            names.add(member.name)
        # Extract only the regular files just validated; also works with the
        # macOS Python version that predates tarfile's data extraction filter.
        for member in bundle.getmembers():
            target = payload / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.extractfile(member) as source, target.open('xb') as destination:
                shutil.copyfileobj(source, destination)


def remote_main(action, release_id=None, bundle_hash=None):
    import fcntl
    os.umask(0o077)
    if action == 'inspect':
        print(json.dumps(snapshot(), sort_keys=True))
        return
    release = RELEASES / validate_id(release_id)
    if action == 'stage':
        release.mkdir(mode=0o700)  # Refuse reuse/overwrite of earlier deployment evidence.
        print(json.dumps({'staging': str(release)}))
        return
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'apply':
            if (release / 'result.json').exists() or (release / 'payload').exists():
                raise RuntimeError('Release was already attempted; choose a new ID')
            archive = release / 'bundle.tar.gz'
            if digest(archive) != bundle_hash:
                raise RuntimeError('Uploaded bundle hash mismatch')
            payload = release / 'payload'
            payload.mkdir(mode=0o700)
            extract_bundle(archive, payload)
            manifest = json.loads((payload / 'release.json').read_text())
            validate_files(manifest['files'])
            if manifest['release_id'] != release_id or manifest['build_mode'] != 'web-production':
                raise RuntimeError('Wrong release identity or build mode')
            if inventory(payload / 'dist') != manifest['files']:
                raise RuntimeError('Build manifest differs from payload')
            if snapshot() != manifest['baseline']:
                raise RuntimeError('Production changed since preparation; re-prepare from current evidence')
            if manifest['files'].get('landing-sw.js') != manifest['baseline']['web'].get('landing-sw.js'):
                raise RuntimeError('Landing service worker must be preserved exactly')
            # Record every overwritten file before changing any production file.
            for name in ordered_files(manifest['files']):
                if name in manifest['baseline']['web']:
                    destination = release / 'before' / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(WEB / name, destination)
            (release / 'manifest.json').write_text(json.dumps(manifest, indent=2))
            try:
                for name in ordered_files(manifest['files']):
                    atomic_copy(payload / 'dist' / name, WEB / name)
                https_count = verify_published(manifest)
                result = {'published': True, 'release_id': release_id,
                          'source_commit': manifest['source_commit'],
                          'published_at': datetime.now(timezone.utc).isoformat(),
                          'files_verified': len(manifest['files']),
                          'https_assets_verified': https_count, 'routes_verified': ROUTES,
                          'index_sha256': manifest['files']['index.html'],
                          'marketing_apks_old_assets_preserved': True}
                (release / 'result.json').write_text(json.dumps(result, indent=2))
                print(json.dumps(result, indent=2))
            except BaseException:
                restore_files(release, manifest)
                (release / 'automatic-rollback.json').write_text(json.dumps({'restored': True}))
                raise
        elif action == 'rollback':
            manifest = json.loads((release / 'manifest.json').read_text())
            if not (release / 'result.json').exists() or (release / 'rollback.json').exists():
                raise RuntimeError('Release is not active or was already rolled back')
            # Do not replace changes published after this release.
            for name, sha in manifest['files'].items():
                if digest(WEB / name) != sha:
                    raise RuntimeError(f'Production changed after this release: {name}')
            check_protected(manifest['baseline'])
            restore_files(release, manifest)
            result = {'restored': True, 'release_id': release_id,
                      'index_sha256': manifest['baseline']['web']['index.html']}
            if fetch('/login')['sha256'] != result['index_sha256']:
                raise RuntimeError('Restored web shell failed HTTPS verification')
            (release / 'rollback.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))


def ssh(action, release_id=None, bundle_hash=None):
    args = ['python3', '-', '--remote', action]
    if release_id:
        args += ['--release', release_id]
    if bundle_hash:
        args += ['--bundle-hash', bundle_hash]
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', HOST, shlex.join(args)],
                            input=Path(__file__).read_text(), text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:] or result.stdout[-5000:])
    return json.loads(result.stdout)


def check_source(root, expected, allow_identical_descendant=False):
    if not re.fullmatch(r'[a-f0-9]{40}', expected):
        raise ValueError('Expected commit must be a complete 40-character Git SHA')
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if actual != expected:
        if not allow_identical_descendant:
            raise RuntimeError(f'Expected commit {expected}, found {actual}')
        ancestor = subprocess.run(['git', 'merge-base', '--is-ancestor', expected, actual], cwd=root)
        unchanged = subprocess.run(['git', 'diff', '--quiet', expected, actual, '--', *SOURCE_PATHS], cwd=root)
        if ancestor.returncode or unchanged.returncode:
            raise RuntimeError('Current HEAD must descend from the prepared commit with identical application/build source')
    dirty = subprocess.check_output(['git', 'status', '--porcelain', '--', *SOURCE_PATHS], cwd=root, text=True)
    if dirty.strip():
        raise RuntimeError('Commit application/build source changes before preparing this release: ' + dirty)
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', choices=['inspect', 'prepare', 'apply', 'rollback'])
    parser.add_argument('--release', type=validate_id)
    parser.add_argument('--expect-commit')
    parser.add_argument('--allow-source-identical-descendant', action='store_true',
                        help='On apply, allow later backend/docs commits only when application/build sources are identical')
    parser.add_argument('--remote', choices=['inspect', 'stage', 'apply', 'rollback'], help=argparse.SUPPRESS)
    parser.add_argument('--bundle-hash', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.remote:
        remote_main(args.remote, args.release, args.bundle_hash)
        return
    if args.action == 'inspect':
        state = ssh('inspect')
        print(json.dumps({'shell': {name: state['web'].get(name) for name in SHELL},
                          'web_files': len(state['web']), 'protected_files': len(state['protected']),
                          'marketing_https': state['marketing_https']}, indent=2))
        return
    if not args.action or not args.release:
        parser.error('Choose an action and --release')
    root = Path(__file__).resolve().parents[2]
    local = root / 'tmp' / 'web-releases' / args.release
    if args.action == 'prepare':
        if not args.expect_commit:
            parser.error('prepare requires --expect-commit with the reviewed full Git SHA')
        commit = check_source(root, args.expect_commit)
        baseline = ssh('inspect')
        local.mkdir(parents=True, mode=0o700, exist_ok=False)
        env = os.environ.copy()
        env['VITE_STORE_BUILD'] = '0'
        subprocess.run(['npm', 'run', 'build', '--', '--outDir', str(local / 'dist')],
                       cwd=root, env=env, check=True)
        check_source(root, commit)
        files = inventory(local / 'dist')
        # APKs in public/ belong to the existing download release, not this web release.
        for name in list(files):
            if name.lower().endswith('.apk'):
                (local / 'dist' / name).unlink()
                del files[name]
        validate_files(files)
        if files.get('landing-sw.js') != baseline['web'].get('landing-sw.js'):
            raise RuntimeError('Landing service worker changed; do not include it in this release')
        manifest = {'release_id': args.release, 'source_commit': commit,
                    'build_mode': 'web-production', 'files': files, 'baseline': baseline}
        (local / 'release.json').write_text(json.dumps(manifest, indent=2))
        archive = local / 'bundle.tar.gz'
        with tarfile.open(archive, 'w:gz') as bundle:
            bundle.add(local / 'release.json', arcname='release.json')
            for name in sorted(files):
                bundle.add(local / 'dist' / name, arcname='dist/' + name)
        (local / 'bundle.sha256').write_text(digest(archive) + '\n')
        print(json.dumps({'prepared': True, 'published': False, 'source_commit': commit,
                          'files': len(files), 'bundle': str(archive)}, indent=2))
    elif args.action == 'apply':
        manifest = json.loads((local / 'release.json').read_text())
        checked_head = check_source(root, manifest['source_commit'], args.allow_source_identical_descendant)
        archive = local / 'bundle.tar.gz'
        sha = digest(archive)
        if sha != (local / 'bundle.sha256').read_text().strip():
            raise RuntimeError('Prepared bundle changed')
        # No build on apply; only the exact, previously reviewed bundle is uploaded.
        if ssh('inspect') != manifest['baseline']:
            raise RuntimeError('Production changed since preparation; prepare a fresh release')
        ssh('stage', args.release)
        subprocess.run(['scp', '-q', str(archive), f'{HOST}:{RELEASES / args.release}/bundle.tar.gz'], check=True)
        result = ssh('apply', args.release, sha)
        result['checked_checkout_commit'] = checked_head
        (local / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
    elif args.action == 'rollback':
        print(json.dumps(ssh('rollback', args.release), indent=2))


if __name__ == '__main__':
    main()
