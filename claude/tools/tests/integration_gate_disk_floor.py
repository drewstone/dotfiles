"""Actual ext4, installer, kernel collector lock and gate CLI; run only in hostlab."""
import base64
import fcntl
import hashlib
import importlib.util
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
    return subprocess.run([str(x) for x in args], capture_output=True, text=True, timeout=kw.pop('timeout',90), **kw)
def checked(args):
    r=call(args)
    assert r.returncode==0,(args[0],r.returncode,r.stdout[-1000:],r.stderr[-1000:])
    return r.stdout.strip()
checked(['mkfs.ext4','-F','-m','0','-i','1048576','-J','size=8','/dev/vdb'])
volume=Path('/mnt/gate-floor');volume.mkdir();checked(['mount','/dev/vdb',volume])
checked(['hostname','beelink1'])
home=volume/'home';home.mkdir()
checked(['useradd','-M','-d','/home','gatefloor']);user=pwd.getpwnam('gatefloor');os.chown(home,user.pw_uid,user.pw_gid)
Path('/etc/sudoers.d/gatefloor').write_text('gatefloor ALL=(root) NOPASSWD: ALL\n');os.chmod('/etc/sudoers.d/gatefloor',0o440)
with tarfile.open('/dev/disk/by-id/virtio-hostlab-policy') as archive:archive.extractall('/opt/gate-policy',filter='data')
with tarfile.open('/dev/disk/by-id/virtio-hostlab-baseline') as archive:archive.extractall('/opt/gate-baseline',filter='data')
current=Path('/opt/gate-current');current.mkdir()
for source in Path('/work/claude/tools').glob('beelink*'):
    if source.is_dir():shutil.copytree(source,current/source.name)
    else:shutil.copy2(source,current/source.name)
for root in [Path('/opt/gate-policy'),Path('/opt/gate-baseline'),current]:
    for p in [root,*root.rglob('*')]:
        if not p.is_symlink():os.chmod(p,0o755 if p.is_dir() else 0o644)
for name in ('usr','bin','lib','lib64','etc','opt','tmp','dev','proc','sys','run'):
    target=volume/name;target.mkdir(exist_ok=True);checked(['mount','--bind','/'+name,target])
environment={'HOME':'/home','PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1','USER':'gatefloor','LOGNAME':'gatefloor','LANG':'C.UTF-8','BEELINK_GATE_LOAD_WAIT':'1s'}
def run(path,*args,**kw):
    interpreter='bash' if Path(path).name=='beelink-gate' else 'python3'
    return call(['chroot',f'--userspec={user.pw_uid}:{user.pw_gid}',volume,'/usr/bin/env','-i',*[f'{k}={v}' for k,v in environment.items()],interpreter,path,*args],**kw)
config=home/'.config/storage-lifecycle/config.json';config.parent.mkdir(parents=True)
host_policy=json.loads(Path('/opt/gate-policy/storage_lifecycle/hosts/DESKTOP-18IR33V.json').read_text());actual_floor=host_policy['admission_floor_bytes'];data={'home':'/home','state':'/home/.cache/tangle/storage-lifecycle','target':'/','archive_mount':None,'trace_registry_required':False,'docker':False,'proc_helper_managed':True,'tiers':['tmp'],'floor_bytes':host_policy['floor_bytes'],'admission_floor_bytes':actual_floor}
config.write_text(json.dumps(data));os.chmod(config,0o600)
state=home/'.cache/tangle/storage-lifecycle';state.mkdir(parents=True)
for p in [config,*config.parents,state,*state.parents]:
    if p==volume:continue
    if p.is_relative_to(home):os.chown(p,user.pw_uid,user.pw_gid)
lock=(state/'collector.lock').open('a');os.chown(state/'collector.lock',user.pw_uid,user.pw_gid);fcntl.flock(lock,fcntl.LOCK_EX)
probe=Path('/usr/local/libexec/tangle-storage-proc-scan');probe.parent.mkdir(parents=True,exist_ok=True);probe.write_bytes(b'retained native cleanup-helper sentinel\n');os.chmod(probe,0o755);probe_hash=hashlib.sha256(probe.read_bytes()).hexdigest()
installer='/opt/gate-policy/storage_lifecycle/install.py'
def publish():
    r=run(installer,'--if-changed');assert r.returncode==75,(r.returncode,r.stdout,r.stderr)
    assert 'lifecycle_busy' in r.stdout,r.stdout
    assert hashlib.sha256(probe.read_bytes()).hexdigest()==probe_hash
    assert not (home/'.config/systemd/user/disk-guard.timer').exists()
    return r
publish();print('PASS real --if-changed publishes protected read-only provider despite actual held collector lock; no cleanup-helper or timer mutation',flush=True)
policy=Path('/usr/local/libexec/tangle-fleet-disk-policy.py');export=Path('/usr/local/libexec/tangle-storage-admission-policy.json');record=json.loads(export.read_text());assert record['admission_floor_bytes']==actual_floor and record['source_sha256']==hashlib.sha256(config.read_bytes()).hexdigest()
cli=current/'beelink-gate';baseline=Path('/opt/gate-baseline/claude/tools/beelink-gate');old=run(baseline,'--disk-floor-bytes','beelink1');new=run(cli,'--disk-floor-bytes','beelink1');assert old.returncode==new.returncode==0,(old.stderr,new.stderr);alert=int(old.stdout);admission=int(new.stdout);assert admission==actual_floor<alert
space=os.statvfs(home);initial=space.f_bavail*space.f_frsize;midpoint=(alert+admission)//2;reserve=volume/'native-unwritten-reserve';checked(['fallocate','-l',str(initial-midpoint),reserve]);space=os.statvfs(home);available=space.f_bavail*space.f_frsize;assert admission<available<alert,(admission,available,alert)
sha=sys.argv[1];assert len(sha)==40;args=['beelink1','https://github.com/octocat/Hello-World.git',sha,'no-install','Sunday','3','touch','/home/build-executed'];encoded=[base64.b64encode(a.encode()).decode() for a in args]
sentinel=home/'operator-notes';sentinel.write_text('unarchived native fixture retained\n');os.chown(sentinel,user.pw_uid,user.pw_gid);sentinel_hash=hashlib.sha256(sentinel.read_bytes()).hexdigest()
wrong=run(baseline,'--remote',*encoded);assert wrong.returncode==75 and 'byte disk floor' in wrong.stderr,wrong.stderr;assert not (home/'build-executed').exists();print('RED reproduced: current shipped gate refuses actual admission <= ext4 free < Fleet alert',flush=True)
fixed=run(cli,'--remote',*encoded);assert 'below its '+str(alert)+' byte disk floor' not in fixed.stderr,fixed.stderr
assert fixed.returncode==0 or fixed.returncode==75 and 'managed containment, legacy drain or host CPU PSI unavailable' in fixed.stderr,(fixed.returncode,fixed.stdout[-1200:],fixed.stderr[-2400:])
if fixed.returncode==0:
 assert (home/'build-executed').is_file();print('PASS real fixed gate executes requested command below alert but above actual storage admission',flush=True)
else:
 assert not (home/'build-executed').exists();print('PASS real fixed gate passes storage admission and preserves subsequent native containment/CPU guard; full execution deferred to live pinned host',flush=True)
limits=home/'.config/beelink-gate/limits';limits.parent.mkdir(parents=True,exist_ok=True);limits.write_text('disk_floor_gib='+str(math.ceil(alert/1024**3)+1)+'\n');os.chown(limits,user.pw_uid,user.pw_gid)
strict=run(cli,'--disk-floor-bytes','beelink1');assert int(strict.stdout)>alert;denied=run(cli,'--remote',*encoded);assert denied.returncode==75 and 'byte disk floor' in denied.stderr;limits.write_text('disk_floor_gib=100\n');assert int(run(cli,'--disk-floor-bytes','beelink1').stdout)==admission;print('PASS higher local admission retained and lower override cannot undercut lifecycle owner',flush=True)
extra=volume/'native-unwritten-below-floor';checked(['fallocate','-l',str(available-admission+1024*1024),extra]);denied=run(cli,'--remote',*encoded);assert denied.returncode==75 and 'byte disk floor' in denied.stderr;extra.unlink();print('PASS actual ext4 below real storage admission still refuses',flush=True)
negative=[base64.b64encode(a.encode()).decode() for a in [*args[:-2],'touch','/home/negative-executed']]
def refuses_growth():
 r=run(cli,'--remote',*negative,timeout=5);assert r.returncode==75 and 'authoritative disk floor unavailable' in r.stderr,(r.returncode,r.stderr);assert not (home/'negative-executed').exists()
hidden=export.with_suffix('.retained');export.rename(hidden);assert run(cli,'--disk-floor-bytes','beelink1').returncode!=0;refuses_growth();hidden.rename(export)
data['admission_floor_bytes']+=1;config.write_text(json.dumps(data));assert run(cli,'--disk-floor-bytes','beelink1').returncode!=0;refuses_growth();publish();assert int(run(cli,'--disk-floor-bytes','beelink1').stdout)==data['admission_floor_bytes'];print('PASS missing/stale export refuses and --if-changed refreshes changed owning admission inputs with unchanged helper code',flush=True)
os.chmod(export,0o666);assert run(cli,'--disk-floor-bytes','beelink1').returncode!=0;refuses_growth();os.chmod(export,0o644)
original_export=export.read_bytes()
for schema in (True,1.0):
 malformed=json.loads(original_export);malformed['schema']=schema;export.write_text(json.dumps(malformed));refuses_growth()
export.write_bytes(original_export)
for unsafe in (export,config):
 saved=unsafe.with_suffix('.fifo-retained');unsafe.rename(saved);os.mkfifo(unsafe,0o600)
 if unsafe==config:os.chown(unsafe,user.pw_uid,user.pw_gid)
 refuses_growth();unsafe.unlink();saved.rename(unsafe)
assert not (home/'negative-executed').exists()
print('PASS FIFO source/export and bool/float schema refuse promptly with zero command growth',flush=True)
assert hashlib.sha256(sentinel.read_bytes()).hexdigest()==sentinel_hash;print('PASS unprotected export refuses; unarchived fixture and existing cleanup helper retained',flush=True)
print(json.dumps({'admission_bytes':admission,'alert_bytes':alert,'actual_ext4_free_between':available,'gate_exit':fixed.returncode,'pinned_public_sha':sha,'provider_sha256':hashlib.sha256(policy.read_bytes()).hexdigest(),'gate_disk_sha256':hashlib.sha256((current/'beelink_gate_disk.py').read_bytes()).hexdigest(),'collector_lock_holder':os.getpid(),'provider_config_sha256':record['source_sha256']}),flush=True)
