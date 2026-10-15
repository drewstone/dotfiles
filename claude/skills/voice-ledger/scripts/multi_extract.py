#!/usr/bin/env python3
"""Drew-typed turns from Codex, Pi and OpenCode stores, in the row shape of trace-mine's
extract.mjs (Claude Code). Read-only and self-contained (stdlib only), so it also runs on another host:
  python3 -I multi_extract.py <codex|pi|opencode> [host] > rows.jsonl
  ssh <host> "python3 -I - <codex|pi|opencode>" < multi_extract.py > rows.jsonl
host defaults to this machine's short lowercase hostname, the name extract.mjs and trace-mine use.

Authorship mirrors extract.mjs: a turn is 'human' unless a machine prefix, a non-interactive
launcher (codex_exec, subagent thread) or a long first-prompt brief gives it away. A long
markdown-heavy turn mid-session is 'relay' (Drew pasting another agent's output)."""
import glob, json, os, re, socket, sqlite3, sys
from datetime import datetime, timezone

TEXT_LIMIT, CONTEXT_LIMIT = 4000, 1500
MACHINE = [r'^\[fleet-message-id:', r'^<task-notification>', r'^Another Claude session sent', r'^<command-(name|message|args)>',
           r'^<local-command-', r'^Caveat: The messages below', r'^<system-reminder>', r'^<environment_context>',
           r'^# AGENTS\.md instructions', r'^<user_instructions>', r'^<turn_aborted>', r'^<user_shell_command>',
           r'^This session is being continued', r'^Handoff from the Mac operator', r'^You run on [\w.-]+ as a',
           r'^\[system\]', r'^<subagent_notification>', r'^Warning: ', r'^<skill>']
MACHINE = [re.compile(p) for p in MACHINE]


def clip(t, n):
    return t if len(t) <= n else t[:n] + f'…[+{len(t) - n} chars]'


def author(text, first):
    s = text.strip()
    if not s or any(p.search(s) for p in MACHINE):
        return 'agent'
    if first and len(s) > 1500:
        return 'agent'  # a launched agent's brief
    if len(s) > 1500 and (s.count('\n|') > 3 or s.count('\n#') > 2 or s.count('\n- ') > 8):
        return 'relay'
    return 'human'


def emit(rows, host, harness, session, cwd, turns):
    if not any(t['author'] in ('human', 'relay') for t in turns):
        return
    rows.write(json.dumps({'host': host, 'harness': harness, 'session': session, 'cwd': cwd,
                           'turns': [t for t in turns if t['author'] in ('human', 'relay')]}) + '\n')


def codex(host, out):
    # acct keeps a second account's Codex home under agent-accounts; its sessions are Drew's too.
    homes = [os.path.expanduser('~/.codex')] + glob.glob(os.path.expanduser('~/.config/agent-accounts/codex/*'))
    files = [f for h in homes for f in glob.glob(h + '/sessions/*/*/*/*.jsonl') + glob.glob(h + '/archived_sessions/*.jsonl')]
    for f in files:
        try:
            fh = open(f, errors='replace')
            meta = json.loads(fh.readline()).get('payload', {})
        except Exception:
            continue
        src = meta.get('source')
        # Interactive top-level threads only: subagents, exec runs and the Claude Code plugin are machine-launched.
        if isinstance(src, dict) or meta.get('originator') in ('codex_exec', 'Claude Code') or src == 'exec':
            continue
        turns, last_agent, first, seen_event_user = [], '', True, False
        lines = fh.readlines()
        seen_event_user = any('"user_message"' in l for l in lines)
        for l in lines:
            try:
                d = json.loads(l)
            except Exception:
                continue
            p = d.get('payload') or {}
            ts = d.get('timestamp')
            text = None
            if d.get('type') == 'event_msg' and p.get('type') == 'user_message':
                text = p.get('message') or ''
            elif not seen_event_user and d.get('type') == 'response_item' and p.get('type') == 'message' and p.get('role') == 'user':
                text = '\n'.join(c.get('text', '') for c in p.get('content') or [] if c.get('type') in ('input_text', 'text'))
            elif d.get('type') == 'event_msg' and p.get('type') == 'agent_message':
                last_agent = p.get('message') or last_agent
                if turns and not turns[-1]['reply']:
                    turns[-1]['reply'] = clip(last_agent, CONTEXT_LIMIT * 2)
                continue
            elif d.get('type') == 'event_msg' and p.get('type') == 'turn_aborted' and turns:
                turns[-1]['interrupted'] = True
                continue
            if text is None:
                continue
            a = author(text, first)
            first = False
            turns.append({'ts': ts, 'text': clip(text.strip(), TEXT_LIMIT), 'author': a,
                          'previousAgent': clip(last_agent, CONTEXT_LIMIT), 'reply': ''})
        emit(out, host, 'codex', meta.get('id') or os.path.basename(f), meta.get('cwd'), turns)


def pi(host, out):
    for f in glob.glob(os.path.expanduser('~/.pi/agent/sessions/*/*.jsonl')):
        turns, last_agent, first, cwd, sid = [], '', True, None, None
        for l in open(f, errors='replace'):
            try:
                d = json.loads(l)
            except Exception:
                continue
            if d.get('type') == 'session':
                cwd, sid = d.get('cwd'), d.get('id')
                continue
            m = d.get('message') or {}
            c = m.get('content')
            txt = c if isinstance(c, str) else '\n'.join(x.get('text', '') for x in c or [] if isinstance(x, dict) and x.get('type') == 'text')
            if m.get('role') == 'assistant':
                if txt.strip():
                    last_agent = txt
                    if turns and not turns[-1]['reply']:
                        turns[-1]['reply'] = clip(txt, CONTEXT_LIMIT * 2)
                continue
            if m.get('role') != 'user':
                continue
            a = author(txt, first)
            first = False
            turns.append({'ts': d.get('timestamp'), 'text': clip(txt.strip(), TEXT_LIMIT), 'author': a,
                          'previousAgent': clip(last_agent, CONTEXT_LIMIT), 'reply': ''})
        emit(out, host, 'pi', sid or os.path.basename(f), cwd, turns)


def opencode(host, out):
    path = os.path.expanduser('~/.local/share/opencode/opencode.db')
    if not os.path.exists(path):
        print(f'no OpenCode store at {path}', file=sys.stderr)  # an absent store is zero sessions, not an error
        return
    db = sqlite3.connect('file:' + path + '?mode=ro', uri=True)
    sessions = db.execute('select id, directory from session where parent_id is null').fetchall()
    for sid, cwd in sessions:
        turns, last_agent, first = [], '', True
        msgs = db.execute('select id, time_created, data from message where session_id=? order by time_created, id', (sid,)).fetchall()
        for mid, tc, data in msgs:
            role = json.loads(data).get('role')
            parts = db.execute('select data from part where message_id=? order by id', (mid,)).fetchall()
            texts = []
            for (pd,) in parts:
                p = json.loads(pd)
                if p.get('type') == 'text' and not p.get('synthetic') and not p.get('ignored'):
                    texts.append(p.get('text', ''))
            txt = '\n'.join(texts)
            ts = datetime.fromtimestamp(tc / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')
            if role == 'assistant':
                if txt.strip():
                    last_agent = txt
                    if turns and not turns[-1]['reply']:
                        turns[-1]['reply'] = clip(txt, CONTEXT_LIMIT * 2)
                continue
            if role != 'user':
                continue
            a = author(txt, first)
            first = False
            turns.append({'ts': ts, 'text': clip(txt.strip(), TEXT_LIMIT), 'author': a,
                          'previousAgent': clip(last_agent, CONTEXT_LIMIT), 'reply': ''})
        # One-turn sessions with a templated prompt are scripted `opencode run` calls.
        if len(turns) == 1 and re.match(r'^(You are|Rewrite|Reply with|Using the|In \w+, how)', turns[0]['text']):
            continue
        emit(out, host, 'opencode', sid, cwd, turns)


if __name__ == '__main__':
    host = sys.argv[2] if len(sys.argv) > 2 else socket.gethostname().split('.')[0].lower()
    {'codex': codex, 'pi': pi, 'opencode': opencode}[sys.argv[1]](host, sys.stdout)
