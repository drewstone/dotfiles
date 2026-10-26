"""Fixture admission provider: Tangle Tools fleet/disk_policy.py's SCHEMA 1 contract.

admission_floor_bytes and admission_headroom keep the owner's names, result keys and
rule (free - live reservations - request >= minimum) over admission.json beside this
file, which a test rewrites to move the minimum or the live reservations.
"""
import json
from pathlib import Path

SCHEMA = 1


def _record():
    return json.loads((Path(__file__).parent / 'admission.json').read_text())


def _minimum(record, host):
    # Each beelink publishes its own minimum; `hosts` stands in for the other host's publication.
    return record.get('hosts', {}).get(host, record['admission_floor_bytes'])


def admission_floor_bytes(host, path):
    return _minimum(_record(), host)


def admission_headroom(host, path, request_bytes, free_bytes):
    if type(request_bytes) is not int or request_bytes < 0 or type(free_bytes) is not int or free_bytes < 0:
        raise ValueError('admission request and free bytes must be nonnegative integers')
    record = _record()
    reserved = record.get('reserved_bytes', 0)
    minimum = _minimum(record, host)
    headroom = free_bytes - reserved - request_bytes - minimum
    return {'free_bytes': free_bytes, 'reserved_bytes': reserved, 'requested_bytes': request_bytes,
            'minimum_bytes': minimum, 'headroom_bytes': headroom, 'fits': headroom >= 0}
