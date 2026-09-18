import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// The hook reads a PreToolUse payload on stdin. Exit 2 blocks the Bash call,
// exit 0 lets it through. Both lists are the incident shapes plus the ordinary
// commands that must never be blocked.

const hook = resolve("claude/hooks/host-blast-guard.sh");

function run(command) {
  const payload = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  const r = spawnSync(hook, [], { input: payload, encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

const blocked = [
  "sudo fsfreeze -f /tmp/x/mnt/parent",
  "fsfreeze --freeze /mnt/a",
  'sudo unshare --mount --fork sh -c "mount --make-rprivate /; rmdir /proc"',
  "sudo unshare -rm true",
  "sudo unshare --mount-proc --fork --pid true",
  "sudo mount --move /proc /tmp/p",
  "sudo mount -t tmpfs none /proc",
  "sudo umount /sys",
  "sudo umount -a",
  "sudo rmdir /proc",
  "sudo rm -rf /dev",
  "sudo dmsetup suspend adcraw-parent",
  "sudo dmsetup remove_all",
  "sudo mkfs.xfs -f /dev/nvme0n1p2",
  "sudo mke2fs /dev/sda1",
  "sudo pvcreate /dev/sda",
  "sudo lvm pvcreate /dev/nvme0n1p3",
  "sudo dd if=/dev/zero of=/dev/nvme0n1 bs=1M",
  "sudo wipefs -a /dev/nvme0n1p1",
  "sudo fdisk /dev/nvme0n1",
  "sudo parted /dev/nvme0n1 mklabel gpt",
  "echo b > /proc/sysrq-trigger",
  "sudo reboot",
  "sudo systemctl poweroff",
  "sudo shutdown -h now",
  "HOST_BLAST_GUARD=off sudo fsfreeze -f /tmp",
  'S=/tmp/s; sudo umount -l "$S/mnt/parent"; bash "$S/proof.sh" 2>&1 | tail -120; sudo fsfreeze -f $S/mnt/parent',
  "cd /x && sudo timeout 30 fsfreeze -f /x/mnt",
  "for i in 1 2; do sudo fsfreeze -f /mnt/$i; done",
];

const allowed = [
  "grep -rn fsfreeze packages/",
  "git log --oneline | grep reboot",
  "sudo fsfreeze -u /mnt/parent",
  'ssh root@1.2.3.4 "sudo fsfreeze -f /mnt/parent"',
  "ssh box 'sudo dmsetup suspend x && sudo reboot'",
  "hostlab run -- 'sudo fsfreeze -f /mnt/x'",
  "hostlab shell",
  "sudo dmsetup ls",
  "sudo dmsetup info rawthin-proofkid",
  "sudo lvs",
  "sudo losetup -d /dev/loop29",
  "sudo mkfs.xfs -f /dev/loop29",
  "sudo mkfs.xfs -q -f /dev/mapper/rawthin-proofkid",
  "sudo lvcreate -V 1G -T adcraw/pool -n parent",
  "sudo pvcreate -f /dev/loop29",
  "sudo fdisk -l /dev/nvme0n1",
  "sudo sfdisk -d /dev/nvme0n1",
  "sudo parted /dev/nvme0n1 print",
  "sudo wipefs /dev/nvme0n1",
  "sudo mount -o loop img.img /tmp/mnt",
  "sudo mount --bind /proc /tmp/chroot/proc",
  "sudo umount /tmp/mnt",
  "sudo unshare -n ip link",
  "docker restart foo",
  "cat /proc/cmdline",
  "ls -la /dev/nvme0n1",
  "systemctl restart watchdog",
  "sudo systemctl status docker",
  "npm run build && git push",
];

test("blocks the host-level verbs in command position", () => {
  for (const c of blocked) {
    const r = run(c);
    assert.equal(r.status, 2, `expected block for: ${c}\n${r.out}`);
    assert.match(r.out, /hostlab run/, `block message must name the VM lane: ${c}`);
  }
});

test("passes ordinary, remote, thaw, loop-backed, and listing commands", () => {
  for (const c of allowed) {
    const r = run(c);
    assert.equal(r.status, 0, `expected pass for: ${c}\n${r.out}`);
  }
});

test("fails open on a malformed payload", () => {
  const r = spawnSync(hook, [], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
});
