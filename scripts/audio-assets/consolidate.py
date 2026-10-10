#!/usr/bin/env python3
"""Deduplicate team audio using service-only RPCs. Dry run unless --apply.
Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the process environment.
Never prints credentials, song titles, audio paths or response bodies.
"""
import argparse
import hashlib
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

MAX_BYTES = 200 * 1024 * 1024


class Client:
    def __init__(self, url, key):
        self.url, self.key = url.rstrip('/'), key

    def request(self, route, method='GET', data=None, headers=None, missing_ok=False):
        headers = {'apikey': self.key, 'Authorization': 'Bearer ' + self.key, **(headers or {})}
        try:
            with urlopen(Request(self.url + route, data=data, headers=headers, method=method), timeout=120) as r:
                payload = r.read(MAX_BYTES + 1)
                if len(payload) > MAX_BYTES:
                    raise RuntimeError('File exceeds the consolidation size limit')
                return payload, r.headers.get('Content-Type', 'application/octet-stream')
        except HTTPError as e:
            # Storage uses both HTTP 404 and a JSON statusCode=404 under HTTP 400.
            body = e.read(4096)
            try:
                detail = json.loads(body)
            except (ValueError, TypeError):
                detail = {}
            if missing_ok and (e.code == 404 or str(detail.get('statusCode')) == '404'):
                return None, None
            raise RuntimeError(f'Backend request failed (HTTP {e.code})') from None
        except URLError:
            raise RuntimeError('Backend connection failed') from None

    def rpc(self, name, args):
        payload, _ = self.request('/rest/v1/rpc/' + name, 'POST', json.dumps(args).encode(), {'Content-Type': 'application/json'})
        return json.loads(payload)

    def download(self, path, missing_ok=False):
        return self.request('/storage/v1/object/authenticated/audio/' + quote(path, safe='/'), missing_ok=missing_ok)

    def upload_once(self, path, data, content_type):
        self.request('/storage/v1/object/audio/' + quote(path, safe='/'), 'POST', data,
                     {'Content-Type': content_type, 'x-upsert': 'false', 'Cache-Control': 'max-age=3600'})

    def remove(self, path):
        self.request('/storage/v1/object/audio', 'DELETE', json.dumps({'prefixes': [path]}).encode(), {'Content-Type': 'application/json'})


def consolidate(client, candidates, apply=False):
    result = {'checked': 0, 'would_relink': 0, 'relinked': 0, 'stale': 0, 'reused': 0, 'uploaded': 0, 'failed': 0}
    verified = set()
    for candidate in candidates:
        result['checked'] += 1
        try:
            payload, content_type = client.download(candidate['path'])
            if not payload:
                raise RuntimeError('Empty recording')
            sha = hashlib.sha256(payload).hexdigest()
            target = '_audio/' + sha
            if sha not in verified:
                saved, _ = client.download(target, missing_ok=True)
                existed = saved is not None
                if saved is None and apply:
                    try:
                        client.upload_once(target, payload, content_type)
                    except RuntimeError:
                        # A concurrent worker may have created it. Verify actual bytes.
                        pass
                    saved, _ = client.download(target, missing_ok=True)
                    if saved is None:
                        raise RuntimeError('Canonical upload not confirmed')
                if saved is not None:
                    if len(saved) != len(payload) or hashlib.sha256(saved).hexdigest() != sha:
                        raise RuntimeError('Canonical file failed integrity validation')
                    verified.add(sha)
                    result['reused' if existed else 'uploaded'] += 1
            else:
                result['reused'] += 1
            result['would_relink'] += 1
            if apply:
                args = {'p_kind': candidate['kind'], 'p_entity_id': candidate['entity_id'],
                        'p_song_id': candidate['song_id'], 'p_expected_path': candidate['path'],
                        'p_expected_revision': candidate['revision'], 'p_object_version': candidate['object_version'],
                        'p_sha256': sha, 'p_byte_size': len(payload)}
                applied = client.rpc('commit_audio_dedup', args)
                result['relinked' if applied is True else 'stale'] += 1
        except (RuntimeError, KeyError, ValueError):
            result['failed'] += 1
    return result


def cleanup(client, limit, apply=False):
    # Tombstoned paths cannot be newly attached or overwritten. The RPC also checks
    # current references/jobs/version and a 24-hour grace period, above signed TTL.
    candidates = client.rpc('audio_dedup_cleanup_candidates', {'p_limit': limit})
    result = {'eligible_old_files': len(candidates), 'removed_old_files': 0}
    if apply:
        for candidate in candidates:
            # Refresh eligibility immediately before the external Storage operation.
            current = client.rpc('audio_dedup_cleanup_candidates', {'p_limit': limit})
            if candidate not in current:
                continue
            if candidate['path'].startswith('_'):
                raise RuntimeError('Refusing to collect a shared asset')
            client.remove(candidate['path'])
            result['removed_old_files'] += 1
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--cleanup', action='store_true', help='Also collect retired team paths after 24 hours')
    parser.add_argument('--limit', type=int, default=25)
    args = parser.parse_args()
    if not 1 <= args.limit <= 500:
        parser.error('--limit must be between 1 and 500')
    url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        parser.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private environment')
    client = Client(url, key)
    result = {'dry_run': not args.apply}
    try:
        result.update(consolidate(client, client.rpc('audio_dedup_candidates', {'p_limit': args.limit}), args.apply))
        if args.cleanup:
            result.update(cleanup(client, args.limit, args.apply))
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 1 if result.get('failed') else 0


if __name__ == '__main__':
    sys.exit(main())
