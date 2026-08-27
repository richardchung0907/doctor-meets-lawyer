#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
触发 GitHub Actions 编译 iOS IPA 并自动上传 TestFlight（全程非交互）。

流程（无任何登录提示，绝不用 gh CLI 交互模式）：
  1. 从 keys.txt 读取 GitHub PAT（github_pat_*）
  2. git push 最新 master（remote 已内嵌 token）
  3. 创建并推送 tag v1.0.0-ios（build-ios.yml 的 push tags 'v*-ios' 触发器）
  4. 轮询 run 状态直到 completed（REST API，X-GitHub-Api-Version: 2026-03-10）
  5. 失败时列出失败 job；成功时提示下一步（ASC 侧确认 build）

用法：
  python scripts/gh_build_ios.py [--tag v1.0.0-ios] [--interval 60] [--timeout 90] [--branch master]
"""

import argparse
import io
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEYS_FILE = ROOT / 'keys.txt'
REPO = 'richardchung0907/doctor-meets-lawyer'
WORKFLOW_FILE = 'build-ios.yml'
API = 'https://api.github.com'
API_VERSION = '2026-03-10'


def log(msg):
    print(msg, flush=True)


def load_token():
    try:
        text = KEYS_FILE.read_text(encoding='utf-8', errors='ignore')
    except OSError as e:
        sys.exit(f'[ERROR] 无法读取 {KEYS_FILE}: {e}')
    m = re.search(r'github_pat_[A-Za-z0-9_]+', text)
    if not m:
        sys.exit('[ERROR] keys.txt 中未找到 GitHub PAT（github_pat_*）')
    return m.group(0)


def gh(method, path, token, body=None, timeout=60):
    """GitHub REST 调用；返回 (status, body_bytes)。不跟随重定向的调用走 gh_redirect。"""
    url = API + path
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'gh-build-ios')
    req.add_header('X-GitHub-Api-Version', API_VERSION)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return -1, str(e).encode('utf-8')


def git(args):
    r = subprocess.run(['git'] + args, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'[ERROR] git {" ".join(args)} 失败: {r.stderr.strip()}')
    return r.stdout.strip()


def git_try(args):
    r = subprocess.run(['git'] + args, cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip() if r.returncode == 0 else r.stderr.strip()


def fmt_duration(sec):
    m, s = divmod(int(sec), 60)
    return f'{m:02d}:{s:02d}'


def step_push_and_tag(token, branch, tag):
    log('[1/4] 推送最新 master（remote 已内嵌 token，非交互）...')
    git(['push', 'origin', f'HEAD:{branch}'])
    head_sha = git(['rev-parse', 'HEAD'])
    log(f'      已推送，HEAD = {head_sha[:12]}')

    log(f'[2/4] 确保 tag {tag} 存在并推送（触发 build-ios.yml）...')
    ok, out = git_try(['tag', '-l', tag])
    if tag not in out.splitlines():
        log(f'      本地无 tag {tag}，创建（指向 HEAD）...')
        git(['tag', '-a', tag, '-m', f'CI trigger for iOS build ({tag})'])
    else:
        log(f'      本地 tag {tag} 已存在，复用')
    ok2, err2 = git_try(['push', 'origin', tag])
    if not ok2:
        if 'already up-to-date' in err2 or 'Everything up-to-date' in err2:
            log(f'      tag {tag} 已在远程，无需重推')
        else:
            sys.exit(f'[ERROR] 推送 tag 失败: {err2.strip()}')
    else:
        log(f'      tag {tag} 已推送')
    return head_sha


def find_ios_run(token, head_sha, branch, timeout_s):
    """等待并定位 head_sha 对应的 build-ios.yml run；找不到返回 None"""
    deadline = time.time() + timeout_s
    last_err = ''
    while time.time() < deadline:
        code, body = gh('GET', f'/repos/{REPO}/actions/runs?branch={branch}&per_page=20', token)
        if code == 200:
            runs = json.loads(body).get('workflow_runs', [])
            for run in runs:
                if (run.get('head_sha', '') == head_sha
                        and run.get('path') == f'.github/workflows/{WORKFLOW_FILE}'):
                    return run
            last_err = '尚无匹配 run'
        else:
            last_err = f'HTTP {code}: {body[:120].decode("utf-8", "ignore")}'
        time.sleep(5)
    log(f'[WARN] 等待 run 出现超时（{timeout_s}s）: {last_err}')
    return None


def poll_run(token, run, interval_s, timeout_min):
    run_id = run['id']
    start = time.time()
    deadline = start + timeout_min * 60
    while True:
        elapsed = time.time() - start
        code, body = gh('GET', f'/repos/{REPO}/actions/runs/{run_id}', token)
        if code == 200:
            run = json.loads(body)
        status = run.get('status', '?')
        concl = run.get('conclusion') or '-'
        remain = max(0, int(deadline - time.time()))
        log(f'      run #{run_id} [{status}/{concl}] 已用 {fmt_duration(elapsed)}，'
            f'剩余超时 {fmt_duration(remain)}')
        if status == 'completed':
            return run.get('conclusion'), run
        if time.time() >= deadline:
            return 'timeout', run
        time.sleep(interval_s)


def report_jobs(token, run_id):
    """列出 run 的 job 及结论；失败时下载日志 zip 提取失败步骤的尾部输出"""
    log(f'[4/4] 查询 job 状态（run #{run_id}）...')
    code, body = gh('GET', f'/repos/{REPO}/actions/runs/{run_id}/jobs?per_page=50', token)
    if code != 200:
        log(f'      [WARN] 获取 jobs 失败 ({code})')
        return
    jobs = json.loads(body).get('jobs', [])
    failed_steps = []
    for j in jobs:
        log(f'      job "{j["name"]}": {j["status"]}/{j["conclusion"]}')
        for s in j.get('steps', []):
            if s.get('conclusion') == 'failure':
                failed_steps.append(s['name'])
    if not failed_steps:
        return
    log(f'      失败步骤: {failed_steps}')
    # 下载日志 zip，提取失败步骤的尾部输出（限单 job）
    code2, body2 = gh('GET', f'/repos/{REPO}/actions/jobs/{jobs[0]["id"]}/logs', token, timeout=120)
    if code2 != 200:
        log(f'      [WARN] 下载日志失败 ({code2})')
        return
    try:
        with zipfile.ZipFile(io.BytesIO(body2)) as z:
            names = z.namelist()
            for step in failed_steps:
                cand = next((n for n in names if step in n), None)
                if cand:
                    text = z.read(cand).decode('utf-8', errors='replace')
                    tail = '\n'.join(text.splitlines()[-60:])
                    log(f'      ==== {cand} 尾部输出 ====')
                    log(tail)
    except Exception as e:
        log(f'      [WARN] 解析日志失败: {e}')


def main():
    ap = argparse.ArgumentParser(description='触发 iOS 构建并上传 TestFlight（非交互）')
    ap.add_argument('--tag', default='v1.0.0-ios', help='触发 tag（默认 v1.0.0-ios）')
    ap.add_argument('--interval', type=int, default=60, help='轮询间隔秒（默认 60）')
    ap.add_argument('--timeout', type=int, default=90, help='构建超时分钟（默认 90）')
    ap.add_argument('--branch', default='master', help='触发分支（默认 master）')
    ap.add_argument('--run-id', type=int, default=None,
                    help='只轮询指定 run，跳过触发')
    args = ap.parse_args()

    log('=== 触发 iOS 构建并上传 TestFlight（非交互） ===')
    token = load_token()
    log(f'[0/4] PAT 已加载（{token[:12]}...）')

    if args.run_id:
        concl, run = poll_run(token, {'id': args.run_id}, args.interval, args.timeout)
        if concl == 'success':
            report_jobs(token, args.run_id)
            log('=== 完成 ===')
        else:
            log(f'[ERROR] run {args.run_id} 结论: {concl}')
            sys.exit(1)
        return

    head_sha = step_push_and_tag(token, args.branch, args.tag)

    log(f'[3/4] 等待 run 出现并轮询（每 {args.interval}s）...')
    run = find_ios_run(token, head_sha, args.branch, 120)
    if run is None:
        sys.exit('[ERROR] 找不到 build-ios.yml 的 run，请到 GitHub Actions 页确认触发情况')
    log(f'      命中 run #{run["id"]}（event={run.get("event")}）')

    conclusion, run = poll_run(token, run, args.interval, args.timeout)
    if conclusion == 'success':
        log(f'[OK] iOS 构建成功（run #{run["id"]}）——Upload to TestFlight 步骤应已上传 IPA')
        report_jobs(token, run['id'])
        log(f'      run 详情: {run.get("html_url", "")}')
    elif conclusion == 'timeout':
        sys.exit(f'[ERROR] 构建超时（{args.timeout} 分钟）。进度: {run.get("html_url", "")}')
    else:
        log(f'[ERROR] 构建失败（{conclusion}）。详情: {run.get("html_url", "")}')
        report_jobs(token, run['id'])
        sys.exit(1)


if __name__ == '__main__':
    main()
