#!/usr/bin/env python3
"""kubectl/helm context-safety guard for Bash tool calls.

Reads a PreToolUse-style hook payload from stdin and emits a deny decision (or a
non-blocking context reminder) when a Kubernetes command would run against an
ambient ``current-context`` instead of an explicitly chosen one.

Contract (shared by Claude Code and OpenCode):
  * Invoked as ``python3 kube-context-guard.py check`` with a JSON payload on
    stdin: ``{"tool_name": "Bash", "tool_input": {"command": "..."}}``.
  * To BLOCK: prints
      {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                              "permissionDecision": "deny",
                              "permissionDecisionReason": "..."}}
    and exits 0. Claude Code denies the tool; the OpenCode ``index.js`` wrapper
    turns the deny into a thrown error.
  * To REMIND (non-prod read): prints
      {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                              "additionalContext": "..."}}
    and exits 0. Claude Code injects the context; OpenCode ignores it (its
    ``tool.execute.before`` has no allow-with-context channel).
  * Otherwise: no output, exit 0.

Risk-tiered policy (when no explicit ``--context``/``--kube-context`` is given):
  * write verbs (delete/apply/scale/exec/...)  -> deny
  * prod context (or undeterminable)           -> deny even for reads
  * non-prod reads                             -> allow + reminder
  * context switch tools (kubectx/kubens/k9s)  -> allow + reminder
"""
import json
import os
import re
import shlex
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

KUBE_TOOLS = ('kubectl', 'helm', 'kubectx', 'kubens', 'k9s')
# Wrapper commands: scan past them for the first kube tool (sudo/xargs/timeout/watch ...)
WRAPPERS = {'sudo', 'xargs', 'time', 'timeout', 'watch', 'nohup',
            'nice', 'stdbuf', 'ionice', 'command'}
# Leading shell control keywords (so `for ...; do kubectl delete ...; done` is still inspected)
SHELL_KW = {'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while',
            'until', 'for', 'case', 'esac', '{', '}', '!'}

READ_VERBS = {'get', 'describe', 'logs', 'log', 'top', 'explain', 'api-resources',
              'api-versions', 'cluster-info', 'version', 'wait', 'events', 'diff', 'auth'}
WRITE_VERBS = {'delete', 'apply', 'create', 'replace', 'patch', 'edit', 'scale', 'autoscale',
               'rollout', 'drain', 'cordon', 'uncordon', 'taint', 'set', 'expose', 'run',
               'exec', 'cp', 'attach', 'debug', 'evict', 'annotate', 'label'}
HELM_WRITE = {'install', 'upgrade', 'uninstall', 'delete', 'rollback'}
# Value-taking global flags (skip the flag + its value when searching for the verb)
VALUE_FLAGS = {'--context', '-n', '--namespace', '--kubeconfig', '--cluster', '--user',
               '--server', '--as', '--as-group', '--token', '--cache-dir',
               '--request-timeout', '--chunk-size', '--kube-context'}

# Built-in generic fallback when no prod-context file is found. Deliberately
# generic — real cluster/account patterns belong in the user's private file.
PROD_DEFAULT = ['prod', 'production', 'prd']


def load_lines(path):
    if not path or not os.path.exists(path):
        return []
    with open(path) as f:
        return [ln.strip() for ln in f if ln.strip() and not ln.startswith('#')]


def find_config(env_var, home_basename, bundled_name):
    """Resolve a config file: env override -> ~/.claude/<file> -> bundled .example."""
    env_path = os.environ.get(env_var)
    if env_path and os.path.exists(env_path):
        return env_path
    home_path = os.path.expanduser(os.path.join('~/.claude', home_basename))
    if os.path.exists(home_path):
        return home_path
    bundled = os.path.join(SCRIPT_DIR, bundled_name)
    if os.path.exists(bundled):
        return bundled
    return None


PROD_FILE = find_config('OPENCODE_KUBE_GUARD_PROD_FILE',
                        '.kube-prod-contexts', 'kube-prod-contexts.example')
ALLOW_FILE = find_config('OPENCODE_KUBE_GUARD_ALLOWLIST',
                         '.kube-context-allowlist', 'kube-context-allowlist.example')
PROD_PATTERNS = load_lines(PROD_FILE) or PROD_DEFAULT

_cur_cache = {}


def current_context(env_extra=None, kubeconfig_flag=None):
    key = kubeconfig_flag or (env_extra or {}).get('KUBECONFIG') or '__default__'
    if key in _cur_cache:
        return _cur_cache[key]
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    args = ['kubectl', 'config', 'current-context']
    if kubeconfig_flag:
        args = ['kubectl', '--kubeconfig', kubeconfig_flag, 'config', 'current-context']
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=5, env=env)
        val = out.stdout.strip() if out.returncode == 0 else ''
    except Exception:
        val = ''
    _cur_cache[key] = val
    return val


def is_prod(ctx):
    if not ctx:
        return True  # undeterminable -> treat as dangerous (fail-safe)
    return any(p in ctx for p in PROD_PATTERNS)


def split_subcommands(s):
    return re.split(r'\|\||&&|[|;&\n\r]', s)


def strip_env_prefix(tokens):
    env_extra = {}
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in SHELL_KW or t == 'env':
            i += 1
            continue
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', t)
        if m:
            env_extra[m.group(1)] = m.group(2)
            i += 1
            continue
        break
    return tokens[i:], env_extra


def has_context_flag(tokens, names):
    for t in tokens:
        for n in names:
            if t == n or t.startswith(n + '='):
                return True
    return False


def kubeconfig_from(tokens, env_extra):
    if 'KUBECONFIG' in env_extra:
        return env_extra['KUBECONFIG']
    for i, t in enumerate(tokens):
        if t == '--kubeconfig' and i + 1 < len(tokens):
            return tokens[i + 1]
        if t.startswith('--kubeconfig='):
            return t.split('=', 1)[1]
    return None


def find_verb(tokens_after_tool):
    i = 0
    toks = tokens_after_tool
    while i < len(toks):
        t = toks[i]
        if t in VALUE_FLAGS:
            i += 2
            continue
        if t.startswith('--') and '=' in t:
            i += 1
            continue
        if t.startswith('-'):
            i += 1
            continue
        return t
    return None


def deny_reason(tool, verb, ctx, prod):
    allow_hint = ALLOW_FILE or os.path.expanduser('~/.claude/.kube-context-allowlist')
    return (
        "🚫 [kube-context-guard] --context 미지정 쿠버네티스 명령이 차단되었습니다.\n"
        f"   도구: {tool}   동작: {verb or '(알수없음)'}\n"
        f"   현재 컨텍스트: {ctx or '(확인불가)'}   prod/위험: {'예' if prod else '아니오'}\n"
        "──────────────────────────────────────────────\n"
        "▶ 실행 전 컨텍스트를 명시적으로 확정하세요:\n"
        "  1) 사용자가 컨텍스트를 지정했으면(prod/stage/dev 등)\n"
        "     → 해당 --context=<ARN> (helm은 --kube-context=<ARN>) 를 붙여 재실행\n"
        "  2) 사용자가 '현 컨텍스트/current context'라고 했으면\n"
        f"     → --context={ctx or '<현재컨텍스트>'} 를 붙여 재실행\n"
        "  3) 사용자가 컨텍스트를 지정하지 않았고 대화에도 명시가 없으면\n"
        "     → 실행하지 말고 사용자에게 '어느 컨텍스트에서 실행할까요?'\n"
        "       (kubectl config get-contexts 목록을 제시) 라고 물어볼 것\n"
        f"▶ 임시 허용: echo '<명령 고유 토큰>' >> {allow_hint}"
    )


def classify(tokens, depth=0):
    """Return ('deny', reason) | ('remind', msg) | None for one sub-command."""
    if depth > 3 or not tokens:
        return None
    tokens, env_extra = strip_env_prefix(tokens)
    if not tokens:
        return None
    base = os.path.basename(tokens[0])

    # bash -c "..." recursion
    if base in ('bash', 'sh', 'zsh') and '-c' in tokens:
        idx = tokens.index('-c')
        results = []
        if idx + 1 < len(tokens):
            for sub in split_subcommands(tokens[idx + 1]):
                try:
                    toks = shlex.split(sub)
                except ValueError:
                    toks = sub.split()
                results.append(classify(toks, depth + 1))
        return pick(results)

    # wrappers (sudo/xargs/timeout/watch ...) -> first kube tool after the wrapper
    if base in WRAPPERS:
        for j in range(1, len(tokens)):
            if os.path.basename(tokens[j]) in KUBE_TOOLS:
                return classify(tokens[j:], depth + 1)
        return None

    if base not in KUBE_TOOLS:
        return None

    rest = tokens[1:]
    kcfg = kubeconfig_from(rest, env_extra)
    ctx = current_context(env_extra, kcfg)
    prod = is_prod(ctx)

    if base in ('kubectx', 'kubens'):
        return ('remind', f"ℹ️ 컨텍스트/네임스페이스 전환 감지({base}). 이후 명령의 대상 컨텍스트가 바뀝니다. 현재: {ctx or '(확인불가)'}")
    if base == 'k9s':
        if has_context_flag(rest, ('--context',)):
            return None
        return ('remind', f"ℹ️ k9s 실행 — 현재 컨텍스트: {ctx or '(확인불가)'}. 의도한 클러스터가 맞는지 확인하세요.")

    if base == 'helm':
        if has_context_flag(rest, ('--kube-context',)):
            return None
        verb = find_verb(rest)
        if verb in HELM_WRITE or prod:
            return ('deny', deny_reason('helm', verb, ctx, prod))
        return ('remind', f"ℹ️ 현재 kube 컨텍스트: {ctx or '(확인불가)'} (helm read). 의도한 컨텍스트가 맞는지 확인하세요.")

    # kubectl
    if has_context_flag(rest, ('--context',)):
        return None
    verb = find_verb(rest)
    if verb in ('config', 'version'):
        return None
    write = (verb in WRITE_VERBS) or (verb is not None and verb not in READ_VERBS)
    if write or prod:
        return ('deny', deny_reason('kubectl', verb, ctx, prod))
    return ('remind', f"ℹ️ 현재 kubectl 컨텍스트: {ctx or '(확인불가)'} ({verb}). 의도한 컨텍스트가 맞는지 확인하세요.")


def pick(results):
    """deny wins over remind wins over None."""
    remind = None
    for r in results:
        if r is None:
            continue
        if r[0] == 'deny':
            return r
        if remind is None:
            remind = r
    return remind


def evaluate(command):
    results = []
    for sub in split_subcommands(command):
        sub = sub.strip()
        if not sub:
            continue
        try:
            toks = shlex.split(sub)
        except ValueError:
            toks = sub.split()
        v = classify(toks)
        if v and v[0] == 'deny':
            return v
        if v:
            results.append(v)
    return pick(results)


def cmd_check():
    try:
        payload = json.loads(sys.stdin.read())
    except Exception:
        return 0
    if not isinstance(payload, dict) or payload.get('tool_name') != 'Bash':
        return 0
    command = (payload.get('tool_input') or {}).get('command') or ''
    if not command:
        return 0

    # fast path: no kube tool mentioned at all
    if not any(t in command for t in KUBE_TOOLS):
        return 0

    # allowlist (substring)
    for a in load_lines(ALLOW_FILE):
        if a in command:
            return 0

    verdict = evaluate(command)
    if verdict is None:
        return 0
    kind, text = verdict
    if kind == 'deny':
        out = {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                      "permissionDecision": "deny",
                                      "permissionDecisionReason": text}}
    else:
        out = {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                      "additionalContext": text}}
    print(json.dumps(out))
    return 0


def main():
    if len(sys.argv) < 2 or sys.argv[1] != 'check':
        print("usage: kube-context-guard.py check", file=sys.stderr)
        return 1
    return cmd_check()


if __name__ == '__main__':
    sys.exit(main())
