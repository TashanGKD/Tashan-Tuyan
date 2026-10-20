#!/usr/bin/env python3
"""Use the documented repo-branch domain naming rule."""
import hashlib
import re
import sys

def identity(repository, branch):
    if repository != 'TashanGKD/tuyan-preview':
        raise ValueError('This workflow belongs to TashanGKD/tuyan-preview')
    if not branch.startswith('codex/'):
        raise ValueError('Only codex/ test branches may deploy')
    def slug(text):
        return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    uid = slug(repository.split('/')[1]) + '-' + slug(branch)
    if len(uid) > 63:
        uid = uid[:50].rstrip('-') + '-' + hashlib.sha1(uid.encode()).hexdigest()[:12]
    return uid

if __name__ == '__main__':
    uid = identity(*sys.argv[1:])
    print(f'uid={uid}')
    print(f'origin=https://{uid}.tashan.chat')
