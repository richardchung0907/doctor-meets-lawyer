#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
触发 GitHub Actions 把最新 App 代码（含 metro 热重载保存的修改）编译成
Android APK，并自动下载到 build_downloads/app/ 供实机安装测试。

流程（全程非交互，无任何登录提示）：
  1. 从 keys.txt 读取 GitHub PAT（github_pat_*）
  2. git add -A + commit + push 工作区最新修改到 master（remote 已内嵌 token）
  3. POST workflow_dispatch 触发 .github/workflows/build-android.yml
     （push 也会触发，dispatch 是双重保险；即使工作区干净也强制构建当前 HEAD）
  4. 每 --interval 秒轮询 run 状态直到完成
  5. success 后下载 app-release-apk artifact，解压 APK 到 build_downloads/app/

用法：
  python scripts/gh_build_download.py [--interval 120] [--timeout 40] [--branch master]
"""

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

# Windows 控制台默认 cp1252，强制 UTF-8 输出避免中文 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEYS_FILE = ROOT / 'keys.txt'
REPO = 'richardchung0907/doctor-meets-lawyer'
WORKFLOW = 'build-android.yml'
ARTIFACT_NAME = 'app-release-apk'
API = 'https://api.github.com'
API_VERSION = '2026-03-10'  # artifact /zip 返回 302 需要此版本
APK_OUT_DIR = ROOT / 'build_downloads' / 'app'

# ---------------------------------------------------------------- 工具函数


def log(msg):
    print(msg, flush=True)


def load_token():
    """从 keys.txt 提取 GitHub PAT；找不到直接退出（绝不交互）"""
    try:
        text = KEYS_FILE.read_text(encoding='utf-8', errors='ignore')
    except OSError as e:
        sys.exit(f'[ERROR] 无法读取 {KEYS_FILE}: {e}')
    m = re.search(r'github_pat_[A-Za-z0-9_]+', text)
    if not m:
        sys.exit('[ERROR] keys.txt 中未找到 GitHub PAT（github_pat_*）')
    return m.group(0)


def gh(method, path, token, body=None, timeout=60):
    """GitHub REST 调用；返回 (status, body_bytes)"""
    url = API + path
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'gh-build-download')
    req.add_header('X-GitHub-Api-Version', API_VERSION)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:  # 网络层错误
        return -1, str(e).encode('utf-8')


def git(args):
    r = subprocess.run(['git'] + args, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'[ERROR] git {" ".join(args)} 失败: {r.stderr.strip()}')
    return r.stdout.strip()


def git_try(args):
    """失败返回 (False, stderr)，不退出"""
    r = subprocess.run(['git'] + args, cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip() if r.returncode == 0 else r.stderr.strip()


def fmt_duration(sec):
    m, s = divmod(int(sec), 60)
    return f'{m:02d}:{s:02d}'


# ---------------------------------------------------------------- 核心步骤


def step_push_and_dispatch(token, branch):
    """提交并推送最新修改，然后触发 workflow_dispatch"""
    log('[1/5] 检查工作区改动...')
    ok, out = git_try(['status', '--porcelain'])
    changed = [l for l in out.splitlines() if l and not l.startswith('??')]
    if changed:
        log(f'      发现 {len(changed)} 个已跟踪文件改动，自动提交...')
        git(['add', '-A'])
        git(['commit', '-m', 'ci: sync working tree for android build [auto]'])
    else:
        log('      无未提交改动（将直接构建当前 HEAD）')
    log('[2/5] 推送到远程 master（remote 已内嵌 token，非交互）...')
    git(['push', 'origin', f'HEAD:{branch}'])
    head_sha = git(['rev-parse', 'HEAD'])
    log(f'      已推送，HEAD = {head_sha[:12]}')

    log('[3/5] 触发 workflow_dispatch...')
    code, body = gh('POST', f'/repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches',
                    token, {'ref': branch})
    if code == 204:
        log('      dispatch 已接受（204）')
    else:
        log(f'      [WARN] dispatch 失败 ({code}): {body[:200].decode("utf-8", "ignore")}')
        log('      —— 依赖 push 触发的 run（push 本身就会触发该 workflow）')
    return head_sha


def find_run(token, head_sha, branch, timeout_s=90):
    """等待并定位 head_sha 对应的最新 run；找不到返回 None"""
    deadline = time.time() + timeout_s
    last_err = ''
    while time.time() < deadline:
        code, body = gh('GET', f'/repos/{REPO}/actions/runs?branch={branch}&per_page=20', token)
        if code == 200:
            for run in json.loads(body).get('workflow_runs', []):
                if run.get('head_sha', '') == head_sha:
                    return run
            last_err = '尚无匹配 run'
        else:
            last_err = f'HTTP {code}: {body[:120].decode("utf-8", "ignore")}'
        time.sleep(5)
    log(f'[WARN] 等待 run 出现超时（{timeout_s}s）: {last_err}')
    return None


def poll_run(token, run, interval_s, timeout_s):
    """轮询 run 直到 completed；返回 conclusion（success 或失败信息）"""
    run_id = run['id']
    start = time.time()
    deadline = start + timeout_s * 60
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


def gh_download(token, url):
    """下载字节（artifact 签名 URL / 普通 URL，无需 Authorization）"""
    req = urllib.request.Request(url, headers={'User-Agent': 'gh-build-download'})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read()


def download_artifact(token, run_id):
    """下载 artifact 并解压 APK 到 build_downloads/app/；返回 APK 路径"""
    log('[5/5] 查询 artifact...')
    code, body = gh('GET', f'/repos/{REPO}/actions/runs/{run_id}/artifacts', token)
    if code != 200:
        sys.exit(f'[ERROR] 获取 artifacts 失败 ({code}): {body[:200].decode("utf-8", "ignore")}')
    arts = json.loads(body).get('artifacts', [])
    art = next((a for a in arts if a['name'] == ARTIFACT_NAME), None)
    if not art:
        sys.exit(f'[ERROR] 未找到 artifact {ARTIFACT_NAME}（实际: {[a["name"] for a in arts]}）')

    log(f'      找到 artifact #{art["id"]}（{art["size_in_bytes"] // 1024} KB），下载中...')
    # 新版 API：/zip 返回 302 → 签名下载 URL（1 分钟有效，无需认证）
    url = f'{API}/repos/{REPO}/actions/artifacts/{art["id"]}/zip'
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'gh-build-download')
    req.add_header('X-GitHub-Api-Version', API_VERSION)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req_, fp_, code_, msg_, headers_, newurl_):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=60) as resp:
            if resp.status == 200:
                zip_bytes = resp.read()
            else:
                sys.exit(f'[ERROR] artifact 下载返回 {resp.status}')
    except urllib.error.HTTPError as e:
        if e.code == 302:
            # 302 → 签名下载 URL（1 分钟有效，无需认证）
            loc = e.headers.get('Location')
            if not loc:
                sys.exit('[ERROR] 302 但无 Location 头')
            log('      已获取签名下载地址，开始下载...')
            zip_bytes = gh_download(token, loc)
        else:
            sys.exit(f'[ERROR] artifact 下载失败 HTTP {e.code}: '
                     f'{e.read()[:200].decode("utf-8", "ignore")}')

    tmp = ROOT / 'build_downloads' / '.apk_tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    zip_path = tmp / 'app-release-apk.zip'
    zip_path.write_bytes(zip_bytes)
    with zipfile.ZipFile(zip_path) as z:
        apks = [n for n in z.namelist() if n.lower().endswith('.apk')]
        if not apks:
            sys.exit(f'[ERROR] artifact 内无 APK（内容: {z.namelist()}）')
        z.extractall(tmp)

    src = tmp / apks[0]
    dst = APK_OUT_DIR / src.name
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    shutil.rmtree(tmp, ignore_errors=True)
    log(f'[OK] APK 已就绪: {dst}（{dst.stat().st_size // (1024 * 1024)} MB）')
    log('     可执行: python scripts/mount_emulator.py 进行模拟器安装，或拷贝到真机安装')
    return dst


# ---------------------------------------------------------------- 主流程


def main():
    ap = argparse.ArgumentParser(description='触发 GitHub Actions 构建并下载 Android APK（非交互）')
    ap.add_argument('--interval', type=int, default=120, help='轮询间隔（秒，默认 120 = 每 2 分钟）')
    ap.add_argument('--timeout', type=int, default=40, help='构建超时（分钟，默认 40）')
    ap.add_argument('--branch', default='master', help='触发分支（默认 master）')
    ap.add_argument('--run-id', type=int, default=None,
                    help='直接下载指定已完成的 run 的 artifact，跳过触发与轮询')
    args = ap.parse_args()

    log('=== 触发 Android 构建并下载 APK（非交互） ===')
    token = load_token()
    log(f'[0/5] PAT 已加载（{token[:12]}…，来源 {KEYS_FILE.name}）')

    if args.run_id:
        download_artifact(token, args.run_id)
        log('=== 完成 ===')
        return

    head_sha = step_push_and_dispatch(token, args.branch)

    log('[4/5] 等待 run 出现并轮询进度（每 %d 秒一次）...' % args.interval)
    run = find_run(token, head_sha, args.branch)
    if run is None:
        # 兜底：取该分支最新一次 run
        code, body = gh('GET', f'/repos/{REPO}/actions/runs?branch={args.branch}&per_page=1')
        if code == 200 and json.loads(body).get('workflow_runs'):
            run = json.loads(body)['workflow_runs'][0]
            log(f'      改用最新 run #{run["id"]}（head_sha={run["head_sha"][:12]}）')
        else:
            sys.exit('[ERROR] 找不到任何可轮询的 run，请到 GitHub Actions 页确认触发情况')

    conclusion, run = poll_run(token, run, args.interval, args.timeout)
    if conclusion == 'success':
        download_artifact(token, run['id'])
        log('=== 完成 ===')
    elif conclusion == 'timeout':
        sys.exit(f'[ERROR] 构建超时（{args.timeout} 分钟）。进度见: {run.get("html_url", "")}')
    else:
        sys.exit(f'[ERROR] 构建失败（{conclusion}）。详情: {run.get("html_url", "")}')


if __name__ == '__main__':
    main()
