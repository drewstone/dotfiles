"""Real gate CLI and real ext4 free space, through hostlab; no mocked seams."""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess
import sys
import tarfile

assert os.getuid() == 0 and socket.gethostname().startswith('hostlab-'), 'hostlab only'
def call(args, **kw):
    return subprocess.run([str(x) for x in args], capture_output=True, text=True, timeout=30, **kw)
def checked(args):
    result=call(args)
    assert result.returncode==0,(args[0],result.returncode,result.stderr)
    return result.stdout.strip()
checked(['mkfs.ext4','-F','-m','0','-i','1048576','-J','size=8','/dev/vdb'])
volume=Path('/mnt/gate-floor');volume.mkdir()
checked(['mount','/dev/vdb',volume])
home=volume/'home'
checked(['useradd','-m','-d',home,'gatefloor'])
user=pwd.getpwnam('gatefloor')
policy=Path('/usr/local/libexec/tangle-fleet-disk-policy.py')
with tarfile.open('/dev/disk/by-id/virtio-hostlab-policy') as archive:
    archive.extractall('/tmp/gate-floor-policy',filter='data')
checked(['install','-D','-o','root','-g','root','-m','0755',
         '/tmp/gate-floor-policy/fleet/disk_policy.py',policy])
with tarfile.open('/dev/disk/by-id/virtio-hostlab-baseline') as archive:
    archive.extractall('/tmp/gate-floor-baseline',filter='data')
current=Path('/opt/gate-floor-current');current.mkdir()
for source in Path('/work/claude/tools').glob('beelink*'):
    if source.is_dir():shutil.copytree(source,current/source.name)
    else:shutil.copy2(source,current/source.name)
# The source share is private; grant only the disposable VM copy read access.
os.chmod('/opt',0o755)
for copied in [current,*current.rglob('*')]:
    if not copied.is_symlink():os.chmod(copied,0o755 if copied.is_dir() else 0o644)
cli=current/'beelink-gate'
baseline=Path('/tmp/gate-floor-baseline/claude/tools/beelink-gate')
# Give the actual CLI a real root+HOME ext4 filesystem in the observed range.
# Only the throwaway VM's binaries/dev/proc are bound; no host filesystem is changed.
for name in ('usr','bin','lib','lib64','etc','opt','tmp','dev','proc','sys'):
    target=volume/name;target.mkdir(exist_ok=True)
    checked(['mount','--bind','/'+name,target])
environment={'HOME':'/home','PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1',
             'BEELINK_GATE_LOAD_WAIT':'1s','USER':'gatefloor','LOGNAME':'gatefloor','LANG':'C.UTF-8'}
def run(path,*args):
    return call(['chroot',f'--userspec={user.pw_uid}:{user.pw_gid}',volume,'/usr/bin/env','-i',
                 *[f'{k}={v}' for k,v in environment.items()],
                 'bash',path,*args])
limits=home/'.config/beelink-gate/limits';limits.parent.mkdir(parents=True)
limits.write_text('disk_floor_gib=100\n')
for item in [limits,*limits.parents]:
    if item==volume:break
    os.chown(item,user.pw_uid,user.pw_gid)
old=run(baseline,'--disk-floor-bytes','beelink1')
new=run(cli,'--disk-floor-bytes','beelink1')
assert old.returncode==new.returncode==0,(old.stderr,new.stderr)
before,expected=int(old.stdout),int(new.stdout)
space=os.statvfs(home);available=space.f_bavail*space.f_frsize
assert before<available<expected,(before,available,expected)
sentinel=home/'.cache/beelink-gate/operator-notes'
sentinel.parent.mkdir(parents=True);sentinel.write_text('preserved operator fixture\n')
original=hashlib.sha256(sentinel.read_bytes()).hexdigest()
marker=home/'build-executed'
sha=sys.argv[1]
assert len(sha)==40 and all(c in '0123456789abcdef' for c in sha)
args=['beelink1','https://github.com/drewstone/dotfiles.git',sha,'install','Sunday','3',
      'touch','/home/build-executed']
encoded=[base64.b64encode(x.encode()).decode() for x in args]
denied=run(cli,'--remote',*encoded)
assert denied.returncode==75 and 'byte disk floor' in denied.stderr,denied.stderr
assert not marker.exists() and not (sentinel.parent/'github.com').exists()
assert hashlib.sha256(sentinel.read_bytes()).hexdigest()==original
environment['BEELINK_GATE_AUTO']='1'
auto=run(cli,'--remote',*encoded)
assert auto.returncode==76 and 'gave the gate back before admission' in auto.stderr,(auto.returncode,auto.stderr)
environment.pop('BEELINK_GATE_AUTO')
assert not marker.exists() and hashlib.sha256(sentinel.read_bytes()).hexdigest()==original
higher=math.ceil(expected/1024**3)+10
limits.write_text(f'disk_floor_gib={higher}\n')
strict=run(cli,'--disk-floor-bytes','beelink1')
assert strict.returncode==0 and int(strict.stdout)==higher*1024**3,strict.stderr
hidden=policy.with_suffix('.retained-proof');policy.rename(hidden)
unknown=run(cli,'--disk-floor-bytes','beelink1')
denied_unknown=run(cli,'--remote',*encoded)
assert unknown.returncode!=0 and denied_unknown.returncode==75
assert 'authoritative disk floor unavailable' in denied_unknown.stderr
assert not marker.exists() and hashlib.sha256(sentinel.read_bytes()).hexdigest()==original
hidden.rename(policy)
print(json.dumps({'old_cli_below_operational_floor':'RED reproduced',
    'real_normal_cli_refused_before_install_or_command':'PASS','higher_local_override_honored':'PASS',
    'raced_auto_placement_hands_back_for_replacement':'PASS',
    'unknown_owner_fails_closed':'PASS','unarchived_cache_sentinel_preserved':'PASS',
    'actual_ext4_available_bytes':available,'old_floor_bytes':before,'operational_floor_bytes':expected,
    'policy_source_sha256':hashlib.sha256(policy.read_bytes()).hexdigest(),
    'gate_source_sha256':hashlib.sha256(cli.read_bytes()).hexdigest(),
    'disk_source_sha256':hashlib.sha256((current/'beelink_gate_disk.py').read_bytes()).hexdigest(),
    'jobs_source_sha256':hashlib.sha256((current/'beelink-gate-lib/jobs.sh').read_bytes()).hexdigest(),
    'cache_source_sha256':hashlib.sha256((current/'beelink-gate-lib/cache.sh').read_bytes()).hexdigest(),
    'admission_source_sha256':hashlib.sha256((current/'beelink-gate-lib/admission.sh').read_bytes()).hexdigest()}))
