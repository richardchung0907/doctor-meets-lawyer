#!/usr/bin/env node
// ==========================================================
// 專業身份認證管理端（CLI）
//   - 列出待審/全部認證申請
//   - 查看申請明細（含下載證明文件到本地供人工審核）
//   - 核准 / 拒絕申請（service_role 寫入，trigger 自動更新 profiles.verification_status）
//
// 用法（PowerShell / cmd）：
//   node scripts/verify_admin.mjs
//
// 依賴：@supabase/supabase-js（項目已有）
// 憑據：從 supabase/keys.txt 讀取 service_role 與 project url
// ==========================================================

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_PATH = path.join(__dirname, '..', 'supabase keys.txt');
const DOWNLOAD_DIR = path.join(__dirname, '..', 'verification_downloads');

// ---------- 讀取憑據 ----------
function loadKeys(filePath) {
  const keys = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx > 0) keys[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  } catch {
    /* ignore */
  }
  return keys;
}

const keys = loadKeys(KEYS_PATH);
const SERVICE_ROLE = keys['service_role'];
const PROJECT_URL = keys['project url'] || 'https://xxtmeuabohgvcqzyphtx.supabase.co';

if (!SERVICE_ROLE) {
  console.error('FATAL: 找不到 service_role（請確認 supabase keys.txt 存在且含 service_role 鍵）');
  process.exit(1);
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE);

// ---------- 工具 ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const PROFESSION_LABELS = {
  medical_doctor: '西醫',
  tcm: '中醫',
  dentist: '牙醫',
  veterinarian: '獸醫',
  lawyer: '律師',
  judge: '法官',
  other: '其他',
};

function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-Hant');
  } catch {
    return iso;
  }
}

function printReq(r, idx) {
  console.log(`[${idx}] ${r.user?.username ?? r.user_id?.slice(0, 8) ?? '?'}`);
  console.log(`    身份: ${PROFESSION_LABELS[r.profession] ?? r.profession}`);
  console.log(`    狀態: ${r.status}`);
  console.log(`    提交: ${fmtDate(r.created_at)}`);
  if (r.reviewed_at) console.log(`    審核: ${fmtDate(r.reviewed_at)}`);
  if (r.reviewer_note) console.log(`    備註: ${r.reviewer_note}`);
}

async function listRequests(statusFilter) {
  let query = supabase
    .from('verification_requests')
    .select('*, profiles!inner(username)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data, error } = await query;
  if (error) {
    console.error('查詢失敗:', error.message);
    return null;
  }
  return data ?? [];
}

async function getEmail(userId) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

async function downloadDoc(docPath) {
  const { data, error } = await supabase.storage.from('verification-docs').download(docPath);
  if (error) {
    console.error('下載失敗:', error.message);
    return false;
  }
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  const safeName = docPath.replace(/[^\w.\-/]/g, '_');
  const dest = path.join(DOWNLOAD_DIR, path.basename(safeName));
  await fs.writeFile(dest, Buffer.from(await data.arrayBuffer()));
  console.log(`已下載至: ${dest}`);
  return true;
}

async function pickRequest(requests, actionLabel) {
  const idxStr = await rl.question(`輸入要${actionLabel}的序號（或按 Enter 返回）: `);
  if (!idxStr.trim()) return null;
  const idx = parseInt(idxStr, 10);
  if (isNaN(idx) || idx < 1 || idx > requests.length) {
    console.log('序號無效');
    return null;
  }
  return requests[idx - 1];
}

async function reviewFlow(req) {
  const email = await getEmail(req.user_id);
  console.log('\n--- 申請明細 ---');
  console.log(`申請 ID: ${req.id}`);
  console.log(`用戶 ID: ${req.user_id}`);
  console.log(`用戶名: ${req.profiles?.username ?? '-'}`);
  console.log(`郵箱:   ${email ?? '-'}`);
  console.log(`身份:   ${PROFESSION_LABELS[req.profession] ?? req.profession}`);
  console.log(`狀態:   ${req.status}`);
  console.log(`文件:   ${req.doc_path}`);
  console.log(`提交:   ${fmtDate(req.created_at)}`);
  if (req.reviewer_note) console.log(`備註:   ${req.reviewer_note}`);

  const dl = await rl.question('\n下載證明文件到本地查看？(y/N): ');
  if (dl.trim().toLowerCase() === 'y') {
    await downloadDoc(req.doc_path);
  }
  return req;
}

async function setStatus(req, newStatus, actionLabel) {
  const note = await rl.question(`審核備註（可選，Enter 跳過）: `);
  const { error } = await supabase
    .from('verification_requests')
    .update({ status: newStatus, reviewed_at: new Date().toISOString(), reviewer_note: note.trim() || null })
    .eq('id', req.id);
  if (error) {
    console.error(`${actionLabel}失敗:`, error.message);
    return;
  }
  console.log(`✅ 已${actionLabel}申請 ${req.id}（profiles.verification_status 已由 trigger 自動更新）`);
}

// ---------- 主選單 ----------
async function main() {
  console.log('========================================');
  console.log('  專業身份認證管理端');
  console.log('========================================\n');

  while (true) {
    console.log('\n請選擇操作：');
    console.log('  1. 列出待審申請 (pending)');
    console.log('  2. 列出全部申請 (最多 50 條)');
    console.log('  3. 查看申請明細');
    console.log('  4. 核准申請');
    console.log('  5. 拒絕申請');
    console.log('  0. 退出');
    const choice = (await rl.question('> ')).trim();

    if (choice === '0') break;

    if (choice === '1' || choice === '2') {
      const filter = choice === '1' ? 'pending' : null;
      const requests = await listRequests(filter);
      if (requests === null) continue;
      if (requests.length === 0) {
        console.log(filter ? '沒有待審申請' : '暫無任何申請');
        continue;
      }
      requests.forEach((r, i) => printReq(r, i + 1));
      continue;
    }

    if (choice === '3' || choice === '4' || choice === '5') {
      const requests = await listRequests('pending');
      if (requests === null) continue;
      if (requests.length === 0) {
        console.log('沒有待審申請');
        continue;
      }
      console.log('\n待審申請清單：');
      requests.forEach((r, i) => printReq(r, i + 1));

      if (choice === '3') {
        const req = await pickRequest(requests, '查看');
        if (req) await reviewFlow(req);
      } else if (choice === '4') {
        const req = await pickRequest(requests, '核准');
        if (req) {
          await reviewFlow(req);
          const confirm = await rl.question('\n確認核准此申請？(y/N): ');
          if (confirm.trim().toLowerCase() === 'y') {
            await setStatus(req, 'approved', '核准');
          } else {
            console.log('已取消');
          }
        }
      } else {
        const req = await pickRequest(requests, '拒絕');
        if (req) {
          await reviewFlow(req);
          const confirm = await rl.question('\n確認拒絕此申請？(y/N): ');
          if (confirm.trim().toLowerCase() === 'y') {
            await setStatus(req, 'rejected', '拒絕');
          } else {
            console.log('已取消');
          }
        }
      }
      continue;
    }

    console.log('無效輸入');
  }

  rl.close();
  console.log('已退出');
}

main().catch((err) => {
  console.error('執行失敗:', err);
  process.exit(1);
});
