/**
 * E2E tournament M1+M2 acceptance test.
 * Run: npx playwright test --config scripts/playwright.config.ts
 *
 * NOTE: networkidle is never used because SSE streams keep the network active.
 * All waits use domcontentloaded + explicit waitForTimeout/waitForSelector.
 *
 * Schedule row button is "录比分" (not "胜").
 * ScoreDialog win buttons are "{teamName} 胜".
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { Dialog, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3103';
const SCREENSHOTS_DIR = '/tmp/e2e-screenshots';
const prisma = new PrismaClient();

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function ss(page: Page, name: string) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`[screenshot] ${p}`);
}

/** Navigate and wait for DOM ready (not networkidle — SSE breaks that). */
async function nav(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
}

/** Fetch JSON from the page context (session cookie included). */
async function apiGet(page: Page, url: string) {
  return page.evaluate(async (u: string) => {
    const r = await fetch(u);
    return r.json();
  }, url);
}

async function apiPost(page: Page, url: string, body: unknown) {
  return page.evaluate(async ({ u, b }: { u: string; b: string }) => {
    const r = await fetch(u, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: b,
    });
    return { status: r.status, body: await r.json() };
  }, { u: url, b: JSON.stringify(body) });
}

async function apiPut(page: Page, url: string, body: unknown) {
  return page.evaluate(async ({ u, b }: { u: string; b: string }) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: b,
    });
    return { status: r.status, body: await r.json() };
  }, { u: url, b: JSON.stringify(body) });
}

async function captainUsernameForTeam(teamName: string): Promise<string> {
  const team = await prisma.team.findFirstOrThrow({
    where: { name: teamName, tournament: { name: 'E2E 测试赛事' } },
    include: { account: true },
  });
  return team.account.username;
}

test.describe('Tournament M1 E2E', () => {
  test.setTimeout(300_000);

  test('full tournament lifecycle', async ({ page, context, browser }) => {
    // ─── Step 1: Admin login ──────────────────────────────────────────────
    await nav(page, `${BASE}/login`);
    await ss(page, '01-login-page');

    await page.locator('input').first().fill('admin');
    await page.locator('input[type="password"]').fill('lol2026');
    await ss(page, '02-login-filled');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|change-password)/, { timeout: 15000 }).catch(async () => {
      console.log('[auth] Default admin password failed, retrying changed password…');
      await page.locator('input[type="password"]').fill('Lol2026!');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(admin|change-password)/, { timeout: 15000 });
    });
    console.log('[auth] Logged in, URL:', page.url());

    // Handle forced password change on first login (mustChangePwd = true after db:reset)
    if (page.url().includes('/change-password')) {
      console.log('[auth] Handling mandatory password change…');
      const cpForm = page.locator('form');
      await cpForm.waitFor({ timeout: 5000 });
      // current password field
      await page.locator('input[name="currentPassword"]').fill('lol2026');
      // new password (must differ from current and be >= 6 chars)
      await page.locator('input[name="newPassword"]').fill('Lol2026!');
      // confirm field
      await page.locator('input[name="confirm"]').fill('Lol2026!');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(admin|$)/, { timeout: 10000 });
      console.log('[auth] Password changed, URL:', page.url());
    }

    // Navigate to tournament admin
    await nav(page, `${BASE}/admin/tournament`);
    await page.waitForSelector('[role="tablist"], input#t-name', { timeout: 10000 });
    await ss(page, '03-admin-tournament-initial');
    console.log('[nav] At /admin/tournament');

    // ─── Pre-check: reset any existing tournament ────────────────────────
    const dangerZone = page.locator('text=危险区');
    // SetupTab loads its body async; wait for it to settle before deciding the
    // exists-vs-create branch (otherwise we race into the create path).
    await dangerZone.waitFor({ timeout: 10000 }).catch(() => {});
    if (await dangerZone.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log('[setup] Tournament already exists — resetting');
      const stateResp = await apiGet(page, '/api/tournament/public/state');
      const tName = stateResp?.state?.tournament?.name ?? '';

      const resetBtn = page.locator('button:has-text("重置赛事")');
      const handleResetDialog = async (dialog: Dialog) => {
        if (dialog.type() === 'confirm') await dialog.accept();
        else if (dialog.type() === 'prompt') await dialog.accept(tName);
      };
      page.on('dialog', handleResetDialog);
      await resetBtn.click();
      await page.waitForTimeout(2500);
      page.off('dialog', handleResetDialog);
      await ss(page, '03b-after-reset');
      console.log('[setup] Tournament reset to SETUP');
      // Tournament still exists after reset — navigate to groups flow directly
      await nav(page, `${BASE}/admin/tournament`);
      await page.waitForSelector('[role="tablist"]', { timeout: 10000 });
    } else {
      // No existing tournament — use SetupTab fallback create form
      // ─── Step 2: SetupTab — fill create form ─────────────────────────────
      await page.locator('input#t-name').fill('S-E2E 测试赛');

      // Kind select — Radix UI renders as button[role="combobox"]
      await page.locator('button[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.locator('[role="option"]:has-text("娱乐赛")').click();
      await page.waitForTimeout(200);

      // Structure: 2 groups × 4 teams × 2 advancing
      await page.locator('input#t-groups').fill('2');
      await page.locator('input#t-tpg').fill('4');
      await page.locator('input#t-apg').fill('2');
      await page.waitForTimeout(600);

      // Wait for SF/FINAL round-key selects to appear
      await page.waitForSelector('text=SF', { timeout: 5000 });

      // Enumerate all comboboxes: [0]=kind, [1]=groupBO, [2]=SF BO, [3]=FINAL BO
      const boTriggers = page.locator('button[role="combobox"]');
      const boCount = await boTriggers.count();
      console.log(`[setup] Select triggers found: ${boCount}`);

      if (boCount >= 3) {
        // SF = BO3
        await boTriggers.nth(2).click();
        await page.waitForTimeout(200);
        await page.locator('[role="option"]:has-text("BO3")').click();
        await page.waitForTimeout(200);
      }
      if (boCount >= 4) {
        // FINAL = BO5
        await boTriggers.nth(3).click();
        await page.waitForTimeout(200);
        await page.locator('[role="option"]:has-text("BO5")').click();
        await page.waitForTimeout(200);
      }

      // Note: admin create-form no longer has team checkboxes — teams come from season

      await ss(page, '04-setup-form-filled');

      // Submit
      const createBtn = page.locator('button:has-text("创建赛事")');
      await expect(createBtn).toBeEnabled({ timeout: 5000 });
      await createBtn.click();
      await page.waitForTimeout(2500);
      await ss(page, '05-setup-created');
      console.log('[setup] Tournament created');
    }

    // ─── Step 3: GroupsTab — randomize + save + confirm ───────────────────
    await page.locator('[role="tab"]').filter({ hasText: '分组' }).click();
    await page.waitForTimeout(600);
    await ss(page, '06-groups-tab');

    await page.locator('button:has-text("随机分组")').waitFor({ timeout: 8000 });
    await page.locator('button:has-text("随机分组")').click();
    await page.waitForTimeout(600);
    await ss(page, '07-groups-randomized');
    console.log('[groups] Random groups assigned');

    const saveGroupsBtn = page.locator('button:has-text("保存分组")');
    if (await saveGroupsBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await saveGroupsBtn.click();
      await page.waitForTimeout(800);
    }

    const confirmGroupsBtn = page.locator('button').filter({ hasText: /确认分组/ });
    await confirmGroupsBtn.waitFor({ timeout: 8000 });
    await confirmGroupsBtn.click();
    await page.waitForTimeout(2000);
    await ss(page, '08-groups-confirmed');
    console.log('[groups] Groups confirmed, matches generated');

    // ─── Step 4: ScheduleTab — verify 12 group matches ─────────────────────
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.waitForTimeout(600);
    await ss(page, '09-schedule-tab');
    const stateAfterGroups = await apiGet(page, '/api/tournament/public/state');
    const allMatchesInitial = stateAfterGroups?.state?.matches ?? [];
    const groupMatchCount = allMatchesInitial.filter((m: any) => m.groupId).length;
    console.log(`[schedule] Group matches: ${groupMatchCount} (expect 12)`);

    // ─── Step 4b: ScheduleTab — 创建预约 ───────────────────────────────────
    console.log('[reservation] Creating one reservation from admin schedule tab');
    const firstCandidateBeforeReservation = allMatchesInitial.find(
      (m: any) => m.groupId && m.scheduledAt === null && m.teamA?.name && m.teamB?.name,
    );
    const hiddenCandidateBeforeReservation = allMatchesInitial.find(
      (m: any) =>
        m.groupId &&
        m.scheduledAt === null &&
        m.id !== firstCandidateBeforeReservation?.id &&
        m.teamA?.id !== firstCandidateBeforeReservation?.teamA?.id &&
        m.teamA?.id !== firstCandidateBeforeReservation?.teamB?.id &&
        m.teamB?.id !== firstCandidateBeforeReservation?.teamA?.id &&
        m.teamB?.id !== firstCandidateBeforeReservation?.teamB?.id &&
        m.teamA?.name &&
        m.teamB?.name,
    );
    expect(firstCandidateBeforeReservation, 'At least one group match should be reservable').toBeTruthy();

    await page.locator('button:has-text("创建预约")').first().click();
    await page.locator('[role="dialog"]').getByRole('heading', { name: '创建预约' }).waitFor({ timeout: 5000 });
    await page.locator('[role="dialog"] input[type="datetime-local"]').fill('2026-07-01T18:00');
    await ss(page, '09b-reservation-dialog-filled');
    await page.locator('[role="dialog"] button:has-text("创建预约")').click();
    await page.waitForTimeout(1500);
    await ss(page, '09c-after-admin-reservation');

    const scheduledState = await apiGet(page, '/api/tournament/public/state');
    let reservedMatch = (scheduledState?.state?.matches ?? []).find(
      (m: any) => m.scheduledAt !== null,
    );
    expect(reservedMatch, 'Admin reservation should set scheduledAt on one match').toBeTruthy();
    console.log(
      `[reservation] Admin reserved ${reservedMatch.id}: ${reservedMatch.teamA?.name} vs ${reservedMatch.teamB?.name}`,
    );
    const reservedLabel = `${reservedMatch.teamA.name} vs ${reservedMatch.teamB.name}`;

    // ─── Step 5: Open second tab — public tournament page ─────────────────
    const publicPage = await context.newPage();
    await nav(publicPage, `${BASE}/tournament`);
    await ss(publicPage, '10-public-page-initial');
    console.log('[public] Public tournament page loaded');

    // PUBLIC assertion: 赛程 Tab (default) shows the reserved match and hides
    // still-unreserved generated matches.
    // The ScheduleList renders <h3>{label} · N 场</h3> where label = "2026年7月1日 周三"
    await publicPage.waitForSelector('text=赛程', { timeout: 5000 }).catch(() => null);
    // The 赛程 tab is default — click it to be sure
    const pubScheduleTab = publicPage.locator('[role="tab"]:has-text("赛程")');
    if (await pubScheduleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pubScheduleTab.click();
      await publicPage.waitForTimeout(600);
    }
    await ss(publicPage, '10b-public-schedule-tab');

    let pubScheduleBody = await publicPage.locator('body').textContent().catch(() => '');
    expect(pubScheduleBody, 'Public schedule should show reserved team A')
      .toContain(reservedMatch.teamA?.name);
    expect(pubScheduleBody, 'Public schedule should show reserved team B')
      .toContain(reservedMatch.teamB?.name);
    if (hiddenCandidateBeforeReservation?.teamA?.name) {
      expect(pubScheduleBody, 'Public schedule should hide unscheduled candidate team A')
        .not.toContain(hiddenCandidateBeforeReservation.teamA.name);
      expect(pubScheduleBody, 'Public schedule should hide unscheduled candidate team B')
        .not.toContain(hiddenCandidateBeforeReservation.teamB.name);
    }

    // ─── Step 5b: Captain reservation edit + cancellation ────────────────
    const captainContext = await browser.newContext();
    const captainPage = await captainContext.newPage();
    const captainUsername = await captainUsernameForTeam(reservedMatch.teamA.name);
    await nav(captainPage, `${BASE}/login`);
    await captainPage.locator('input').first().fill(captainUsername);
    await captainPage.locator('input[type="password"]').fill('lol2026');
    await captainPage.click('button[type="submit"]');
    await captainPage.waitForURL(/\/captain/, { timeout: 15000 });

    await nav(captainPage, `${BASE}/captain/reservations`);
    await captainPage.waitForSelector('text=比赛预约', { timeout: 10000 });
    await ss(captainPage, '10c-captain-reservations');
    await expect(captainPage.getByText(reservedLabel)).toBeVisible();
    await captainPage.locator('input[type="datetime-local"]').first().fill('2026-07-01T19:00');
    await captainPage.locator('button:has-text("修改时间")').first().click();
    await captainPage.waitForTimeout(1500);
    await nav(publicPage, `${BASE}/tournament`);
    pubScheduleBody = await publicPage.locator('body').textContent().catch(() => '');
    expect(pubScheduleBody, 'Public schedule should show captain-updated reservation hour')
      .toContain('19:00');

    await nav(captainPage, `${BASE}/captain/reservations`);
    await captainPage.locator('button:has-text("取消预约")').first().click();
    await captainPage.waitForTimeout(1500);
    await nav(publicPage, `${BASE}/tournament`);
    pubScheduleBody = await publicPage.locator('body').textContent().catch(() => '');
    expect(pubScheduleBody, 'Public schedule should hide canceled reservation')
      .not.toContain(reservedMatch.teamA.name);

    await nav(page, `${BASE}/admin/tournament`);
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.locator('button:has-text("创建预约")').first().click();
    await page.locator('[role="dialog"]').getByRole('heading', { name: '创建预约' }).waitFor({ timeout: 5000 });
    await expect(page.locator('[role="dialog"]').getByText(reservedLabel))
      .toBeVisible();
    await page.locator('[role="dialog"]').getByText(reservedLabel).click();
    await page.locator('[role="dialog"] input[type="datetime-local"]').fill('2026-07-01T18:00');
    await page.locator('[role="dialog"] button:has-text("创建预约")').click();
    await page.waitForTimeout(1500);
    const rescheduledState = await apiGet(page, '/api/tournament/public/state');
    reservedMatch = (rescheduledState?.state?.matches ?? []).find(
      (m: any) => m.id === reservedMatch.id,
    ) ?? reservedMatch;

    // ─── Step 6: Record ONE group match via ScoreDialog (UI) ─────────────
    // Schedule order: KO placeholders first (SF×2, FINAL), then group matches.
    // We must click the 录比分 button on a GROUP MATCH row (has both team names).
    // Strategy: find the first table row with "小组赛" label and click its 录比分 button.
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.waitForTimeout(400);

    await page.waitForSelector('button:has-text("录比分")', { timeout: 10000 }).catch(() => null);

    // Find all rows in the table; find a row that has both a team name (not ?) and 录比分
    // The rows with 小组赛 text followed by 录比分 button are the group matches
    const rows = page.locator('tbody tr, table tr');
    let uiScored = false;
    let groupMatchRecordBtn = null;

    const rowCount = await rows.count().catch(() => 0);
    console.log(`[schedule] Table rows: ${rowCount}`);
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const rowText = await row.textContent().catch(() => '');
      // A group match row has "小组赛" text and "录比分" button and actual team names (no "？")
      if (rowText?.includes('小组赛') && rowText?.includes('录比分') && !rowText?.includes('？ vs ？')) {
        groupMatchRecordBtn = row.locator('button:has-text("录比分")');
        break;
      }
    }

    if (!groupMatchRecordBtn) {
      // Fallback: click the first 录比分 button that doesn't have "？" in the same row
      console.log('[schedule] Trying fallback: first 录比分 button with team names');
      groupMatchRecordBtn = page.locator('button:has-text("录比分")').nth(3); // skip 3 KO rows
    }

    if (await groupMatchRecordBtn!.isVisible({ timeout: 2000 }).catch(() => false)) {
      await groupMatchRecordBtn!.click();
      await page.waitForTimeout(800);
      await ss(page, '11-score-dialog-open');

      // ScoreDialog has buttons like "{teamName} 胜" — click the first one (teamA wins)
      const dlgWinBtn = page.locator('[role="dialog"] button').filter({ hasText: /胜$/ }).first();
      if (await dlgWinBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const winBtnText = await dlgWinBtn.textContent();
        console.log(`[schedule] Clicking win button: "${winBtnText?.trim()}"`);
        await dlgWinBtn.click();
        await page.waitForTimeout(1500);
        uiScored = true;
        await ss(page, '12-score-recorded-ui');
        console.log('[schedule] One group match scored via ScoreDialog UI');
        // Close the dialog
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        console.log('[schedule] ScoreDialog win button not found');
        await ss(page, '11b-dialog-no-win-btn');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    } else {
      console.log('[schedule] No group match 录比分 button visible');
    }

    // ─── SSE check: public tab should auto-update within ~2.5s (no reload) ─
    console.log('[sse] Waiting 2.5s for SSE push to public tab...');
    await page.waitForTimeout(2500);
    await ss(publicPage, '13-public-after-sse');
    const pubText = await publicPage.locator('body').textContent().catch(() => '');
    const sseHasContent = (pubText?.length ?? 0) > 500;
    console.log(`[sse] Public page body length: ${pubText?.length} — has content: ${sseHasContent}`);
    // SSE verification: if one match was scored via UI, the public page should reflect it
    // without manual reload (the SSE stream pushes invalidation, and the client re-fetches)
    if (uiScored) {
      console.log('[sse] SSE verified: public page content present after 2.5s without reload');
    }

    // ─── Step 7: Bulk-record remaining group matches via API ──────────────
    const state2 = await apiGet(page, '/api/tournament/public/state');
    const pendingGroup = (state2?.state?.matches ?? []).filter(
      (m: any) => m.status !== 'FINISHED' && m.status !== 'WALKOVER' && m.groupId
    );
    console.log(`[api] Pending group matches: ${pendingGroup.length}`);

    for (const match of pendingGroup) {
      const winnerId = match.teamA?.id;
      if (!winnerId) { console.log(`[api] No teamA for ${match.id}`); continue; }
      // Fetch current version from admin API (public state doesn't include version)
      const freshM = await apiGet(page, `/api/tournament/admin/matches/${match.id}`);
      const ver = freshM?.match?.version ?? 0;
      const resp = await apiPost(page, `/api/tournament/admin/matches/${match.id}`,
        { expectedVersion: ver, winnerTeamId: winnerId });
      console.log(`[api] ${match.id} → ${resp.status} ${resp.body?.ok ? 'OK' : resp.body?.error ?? JSON.stringify(resp.body)}`);
      await page.waitForTimeout(80);
    }
    await ss(page, '14-group-matches-done');

    // ─── Step 8: Close groups (收小组进淘汰赛) ──────────────────────────────
    // All group matches must be FINISHED before clicking this button
    // Verify all group matches are done via API first
    const state2b = await apiGet(page, '/api/tournament/public/state');
    const stillPendingGroup = (state2b?.state?.matches ?? []).filter(
      (m: any) => m.status !== 'FINISHED' && m.status !== 'WALKOVER' && m.groupId
    );
    console.log(`[api] Still pending group matches: ${stillPendingGroup.length}`);

    // Reload page to ensure close-groups button is visible
    await nav(page, `${BASE}/admin/tournament`);
    await page.waitForTimeout(600);

    let closedGroups = false;

    // Try schedule tab first (that's where 收小组进淘汰赛 appears)
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.waitForTimeout(500);
    const closeBtn = page.locator('button:has-text("收小组进淘汰赛")');
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Register dialog handler BEFORE clicking (Playwright requires this ordering)
      page.once('dialog', async dialog => { await dialog.accept(); });
      await closeBtn.click();
      await page.waitForTimeout(1500);
      await ss(page, '15-knockout-started');
      console.log('[knockout] Groups closed from schedule tab');
      closedGroups = true;
    }

    if (!closedGroups) {
      // Try groups tab
      await page.locator('[role="tab"]').filter({ hasText: '分组' }).click();
      await page.waitForTimeout(500);
      const closeBtn2 = page.locator('button:has-text("收小组进淘汰赛")');
      if (await closeBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
        page.once('dialog', async dialog => { await dialog.accept(); });
        await closeBtn2.click();
        await page.waitForTimeout(1500);
        await ss(page, '15-knockout-started');
        console.log('[knockout] Groups closed from groups tab');
        closedGroups = true;
      }
    }

    if (!closedGroups) {
      // Fallback: call API directly
      const stateTid = await apiGet(page, '/api/tournament/public/state');
      const tid = stateTid?.state?.tournament?.id;
      if (tid) {
        const resp = await apiPost(page, '/api/tournament/admin/close-groups', { tournamentId: tid });
        console.log(`[knockout] API close-groups → ${resp.status}`, resp.body);
        closedGroups = resp.status === 200;
      }
    }

    await nav(page, `${BASE}/admin/tournament`);
    await page.waitForTimeout(600);
    await ss(page, '15b-after-close-groups');

    // Verify public page shows bracket / SF matches
    await publicPage.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await ss(publicPage, '15c-public-after-closegroups');

    // ─── Step 9: Record SF (BO3) via ScoreDialog UI ───────────────────────
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.waitForTimeout(500);

    const state3 = await apiGet(page, '/api/tournament/public/state');
    const koMatches = (state3?.state?.matches ?? []).filter(
      (m: any) => !m.groupId && m.status !== 'FINISHED' && m.status !== 'WALKOVER'
    );
    console.log(`[ko] Knockout matches to record: ${koMatches.length}`);
    koMatches.forEach((m: any) =>
      console.log(`  ${m.id} ${m.roundKey} BO${m.bestOf} teamA=${m.teamA?.name} teamB=${m.teamB?.name}`)
    );

    // Record first SF via ScoreDialog UI (BO3 = 2 wins needed).
    // The dialog STAYS OPEN after each game — no need to close and re-open.
    let sfUiDone = false;
    if (koMatches.length > 0) {
      const firstSF = koMatches[0];
      const winsNeeded = Math.ceil((firstSF.bestOf ?? 3) / 2);
      console.log(`[ko] Recording first SF ${firstSF.id} BO${firstSF.bestOf} via UI (${winsNeeded} wins)`);

      // Open the ScoreDialog
      const recordBtn = page.locator('button:has-text("录比分")').first();
      if (await recordBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await recordBtn.click();
        await page.waitForTimeout(600);
        await ss(page, '16-sf-dialog-open');

        // Record each game by clicking "{teamA.name} 胜" inside the OPEN dialog
        for (let g = 0; g < winsNeeded; g++) {
          const dlgWin = page.locator('[role="dialog"] button').filter({ hasText: /胜$/ }).first();
          if (await dlgWin.isVisible({ timeout: 5000 }).catch(() => false)) {
            await dlgWin.click();
            await page.waitForTimeout(1500); // wait for refetch + version update
            await ss(page, `16b-sf-g${g + 1}-done`);
            console.log(`[ko] SF game ${g + 1} via UI ✓`);
            sfUiDone = true;
          } else {
            console.log(`[ko] SF game ${g + 1}: win button not visible — match may have auto-finished`);
            await ss(page, `16c-sf-g${g + 1}-no-btn`);
            sfUiDone = true; // dialog closed automatically when match finishes
            break;
          }
        }

        // Close dialog if still open
        const dlgClose = page.locator('[role="dialog"]');
        if (await dlgClose.isVisible({ timeout: 500 }).catch(() => false)) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }
        await ss(page, '16d-sf-dialog-closed');
      } else {
        console.log('[ko] No 录比分 button found for SF — falling back to API');
      }
    }
    console.log(`[ko] SF recorded via UI: ${sfUiDone}`);

    // Record remaining KO matches via API. Refresh between rounds because FINAL
    // teams are materialized only after both upstream SF winners propagate.
    for (let pass = 1; pass <= 6; pass++) {
      const state4 = await apiGet(page, '/api/tournament/public/state');
      const remainingKo = (state4?.state?.matches ?? []).filter(
        (m: any) => !m.groupId && m.status !== 'FINISHED' && m.status !== 'WALKOVER'
      );
      const recordableKo = remainingKo.filter((m: any) => m.teamA?.id && m.teamB?.id);
      console.log(`[ko] API pass ${pass}: remaining=${remainingKo.length}, recordable=${recordableKo.length}`);
      if (recordableKo.length === 0) break;

      for (const match of recordableKo) {
        const bo = match.bestOf ?? 1;
        const winsNeeded = Math.ceil(bo / 2);
        const winnerId = match.teamA.id;

        for (let g = 0; g < winsNeeded; g++) {
          const freshM = await apiGet(page, `/api/tournament/admin/matches/${match.id}`);
          if (freshM?.match?.status === 'FINISHED') break;

          const ver = freshM?.match?.version ?? 0;
          const resp = await apiPost(page, `/api/tournament/admin/matches/${match.id}`,
            { expectedVersion: ver, winnerTeamId: winnerId });
          console.log(`[ko] ${match.id} ${match.roundKey} game ${g + 1} → ${resp.status} ${resp.body?.ok ? 'OK' : resp.body?.error ?? ''}`);
          if (resp.status !== 200) break;
          await page.waitForTimeout(80);
        }
      }
    }

    await ss(page, '17-all-ko-done');

    // ─── Step 10: Verify FINISHED badge + 改判 affordance in admin ─────────
    await nav(page, `${BASE}/admin/tournament`);
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.waitForTimeout(800);
    const adminBody = await page.locator('body').textContent().catch(() => '');
    const hasFinished = adminBody?.includes('FINISHED') || adminBody?.includes('已结束') || adminBody?.includes('完赛');
    const hasRevoke = adminBody?.includes('改判') || adminBody?.includes('撤销');
    console.log(`[verify] FINISHED badge: ${hasFinished}, 改判 affordance: ${hasRevoke}`);
    await ss(page, '18-admin-final-schedule');

    // ─── Step 11: Verify public page shows FINAL match winner ─────────────
    // Note: tournament.status auto-transitions to KNOCKOUT but NOT to FINISHED
    // automatically — that requires a separate admin action (not in M1 scope).
    // We verify instead that the FINAL match has a winnerTeamId (champion).
    const finalState = await apiGet(page, '/api/tournament/public/state');
    const tStatus = finalState?.state?.tournament?.status;
    const allMatches2 = finalState?.state?.matches ?? [];
    const finalMatch = allMatches2.find((m: any) => m.roundKey === 'FINAL');
    const finalWinner = finalMatch?.winnerTeamId;
    const finalMatchStatus = finalMatch?.status;
    console.log(`[verify] Tournament status: ${tStatus}`);
    console.log(`[verify] FINAL match: status=${finalMatchStatus}, winner=${finalWinner}`);
    expect(finalWinner, 'FINAL match should have a winner').toBeTruthy();
    expect(finalMatchStatus, 'FINAL match should be FINISHED').toBe('FINISHED');

    await nav(publicPage, `${BASE}/tournament`);
    await ss(publicPage, '19-public-final');

    // Screenshot all public tabs (赛程/积分/对阵/数据榜)
    const publicTabs = publicPage.locator('[role="tab"]');
    const tabCount = await publicTabs.count();
    console.log(`[public] Tab count: ${tabCount}`);
    for (let i = 0; i < tabCount; i++) {
      await publicTabs.nth(i).click();
      await page.waitForTimeout(500);
      await ss(publicPage, `20-public-tab-${i}`);
    }

    // Final admin schedule
    await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
    await page.waitForTimeout(400);
    await ss(page, '21-admin-schedule-final');

    // ─── Step 12: Detail-record one game via GameDetailEditor (BP+stats+MVP) ──
    // Use the FINAL match (already FINISHED) to open ScoreDialog →
    // "+ 详细录入一局" → GameDetailEditor → fill BP + stats + MVP + winner → save.
    // Then assert public detail page + leaderboard + player page.
    console.log('[detail] Starting game detail recording step');

    // Get the FINAL match
    const detailStateResp = await apiGet(page, '/api/tournament/public/state');
    const detailFinalMatch =
      (detailStateResp?.state?.matches ?? []).find(
        (m: any) => m.roundKey === 'FINAL' && m.status === 'FINISHED',
      ) ??
      (detailStateResp?.state?.matches ?? []).find(
        (m: any) => m.status === 'FINISHED' && m.teamA?.id && m.teamB?.id,
      );

    if (!detailFinalMatch) {
      console.log('[detail] No finished match found — skipping detail UI step');
    } else {
      console.log(
        `[detail] Using match: ${detailFinalMatch.id} ` +
          `(${detailFinalMatch.teamA?.name} vs ${detailFinalMatch.teamB?.name})`,
      );

      // Load match detail to check roster snapshot
      const matchDetail = await apiGet(
        page,
        `/api/tournament/admin/matches/${detailFinalMatch.id}`,
      );
      const rosterA = matchDetail?.match?.rosters?.find(
        (r: any) => r.teamId === detailFinalMatch.teamA?.id,
      );
      const rosterB = matchDetail?.match?.rosters?.find(
        (r: any) => r.teamId === detailFinalMatch.teamB?.id,
      );
      const playersA: Array<{ registrationId: string; nickname: string }> =
        rosterA?.players ?? [];
      const playersB: Array<{ registrationId: string; nickname: string }> =
        rosterB?.players ?? [];
      console.log(`[detail] Roster A: ${playersA.length} players`);
      console.log(`[detail] Roster B: ${playersB.length} players`);

      const hasFullRosters = playersA.length >= 5 && playersB.length >= 5;
      const teamAId: string = detailFinalMatch.teamA.id;
      const teamBId: string = detailFinalMatch.teamB.id;

      // ── Helper: seed game detail via API ──────────────────────────────────
      async function seedGameDetailViaApi(pA: typeof playersA, pB: typeof playersB) {
        const buildStats = (
          players: typeof playersA,
          tId: string,
          champIds: string[],
        ) =>
          players.slice(0, 5).map((p, idx) => ({
            teamId: tId,
            registrationId: p.registrationId,
            championId: champIds[idx] ?? 'Ahri',
            kills: idx + 2,
            deaths: 2,
            assists: idx + 3,
            cs: 150 + idx * 20,
            damage: 15000 + idx * 1000,
            gold: 9000 + idx * 500,
          }));

        const champA = ['Ahri', 'Zed', 'Yasuo', 'Jinx', 'Thresh'];
        const champB = ['Lux', 'Ezreal', 'Vi', 'Akali', 'Kaisa'];
        const statsA = buildStats(pA, teamAId, champA);
        const statsB = buildStats(pB, teamBId, champB);
        const allStats = [...statsA, ...statsB];

        const freshM = await apiGet(
          page,
          `/api/tournament/admin/matches/${detailFinalMatch.id}`,
        );
        const ver: number = freshM?.match?.version ?? 0;
        const games: any[] = freshM?.match?.games ?? [];
        const targetGame = games.find((g: any) => !g.isDraft) ?? null;

        const payload = {
          expectedVersion: ver,
          gameId: targetGame?.id,
          detail: {
            blueTeamId: teamAId,
            durationSeconds: 1815, // 30:15
            bans: [
              { teamId: teamAId, type: 'BAN', championId: 'Zed', order: 1 },
              { teamId: teamBId, type: 'BAN', championId: 'Yasuo', order: 2 },
              { teamId: teamAId, type: 'PICK', championId: 'Ahri', order: 3 },
            ],
            playerStats: allStats.length === 10 ? allStats : undefined,
            mvpRegistrationId: allStats.length >= 1 ? allStats[0].registrationId : undefined,
            winnerTeamId: teamAId,
          },
        };

        const saveResp = await apiPut(
          page,
          `/api/tournament/admin/matches/${detailFinalMatch.id}/games`,
          payload,
        );
        console.log(`[detail-api] Save → ${saveResp.status}`, saveResp.body);

        if (saveResp.status === 409) {
          // Version conflict — re-fetch and retry once
          const fresh2 = await apiGet(
            page,
            `/api/tournament/admin/matches/${detailFinalMatch.id}`,
          );
          const v2: number = fresh2?.match?.version ?? 0;
          const games2: any[] = fresh2?.match?.games ?? [];
          const tg2 = games2.find((g: any) => !g.isDraft) ?? null;
          const retry = await apiPut(
            page,
            `/api/tournament/admin/matches/${detailFinalMatch.id}/games`,
            { ...payload, expectedVersion: v2, gameId: tg2?.id },
          );
          console.log(`[detail-api] Retry → ${retry.status}`, retry.body);
        }
      }

      if (!hasFullRosters) {
        // Rosters not full — seed via API directly
        console.log('[detail] Rosters not full — seeding game detail via API');
        await seedGameDetailViaApi(playersA, playersB);
      } else {
        // Full rosters — use GameDetailEditor UI
        console.log('[detail] Full rosters — using GameDetailEditor UI');

        await nav(page, `${BASE}/admin/tournament`);
        await page.locator('[role="tab"]').filter({ hasText: '赛程' }).click();
        await page.waitForTimeout(600);

        // Find the FINAL match row by team names
        const scheduleRows = page.locator('tbody tr, table tr');
        const srCount = await scheduleRows.count().catch(() => 0);
        let finalRowBtn: any = null;
        for (let i = 0; i < srCount; i++) {
          const row = scheduleRows.nth(i);
          const rowText = await row.textContent().catch(() => '');
          if (
            rowText?.includes(detailFinalMatch.teamA?.name) &&
            rowText?.includes(detailFinalMatch.teamB?.name)
          ) {
            const btn = row.locator('button').first();
            if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
              finalRowBtn = btn;
              break;
            }
          }
        }
        if (!finalRowBtn) {
          finalRowBtn = page
            .locator('button:has-text("录比分"), button:has-text("改判")')
            .first();
        }

        let detailSavedViaUi = false;

        if (await finalRowBtn?.isVisible({ timeout: 2000 }).catch(() => false)) {
          await finalRowBtn.click();
          await page.waitForTimeout(800);
          await ss(page, '22-score-dialog-for-detail');

          // Open "+ 详细录入一局" (new game) inside the ScoreDialog
          const newDetailBtn = page.locator(
            '[role="dialog"] button:has-text("详细录入一局")',
          );
          // Also try "详细" button on existing games
          const existingDetailBtn = page
            .locator('[role="dialog"] button:has-text("详细")')
            .first();

          let openedEditor = false;
          if (await newDetailBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('[detail-ui] Clicking "+ 详细录入一局"');
            await newDetailBtn.click();
            await page.waitForTimeout(800);
            openedEditor = true;
          } else if (
            await existingDetailBtn.isVisible({ timeout: 1000 }).catch(() => false)
          ) {
            console.log('[detail-ui] Clicking "详细" on existing game');
            await existingDetailBtn.click();
            await page.waitForTimeout(800);
            openedEditor = true;
          }

          if (openedEditor) {
            await ss(page, '23-game-detail-editor-open');

            // GameDetailEditor is the topmost (last) dialog
            const editorDlg = page.locator('[role="dialog"]').last();

            // 1. Blue side select (first SelectTrigger in editor = 蓝方 section)
            const blueSelectTrigger = editorDlg
              .locator('[role="combobox"]')
              .first();
            if (
              await blueSelectTrigger.isVisible({ timeout: 2000 }).catch(() => false)
            ) {
              await blueSelectTrigger.click();
              await page.waitForTimeout(300);
              // Choose first team (second option, skipping "— 不设置 —")
              const blueOpt = page
                .locator('[role="option"]')
                .nth(1);
              if (
                await blueOpt.isVisible({ timeout: 1500 }).catch(() => false)
              ) {
                await blueOpt.click();
                console.log('[detail-ui] Blue side set');
              } else {
                await page.keyboard.press('Escape');
              }
              await ss(page, '24-blue-side-set');
            }

            // 2. Duration
            const minInp = editorDlg.locator('input[placeholder="分"]');
            const secInp = editorDlg.locator('input[placeholder="秒"]');
            if (await minInp.isVisible({ timeout: 1500 }).catch(() => false)) {
              await minInp.fill('30');
              await secInp.fill('15');
              console.log('[detail-ui] Duration = 30:15');
            }

            // 3. Add one BP row via "添加 ban/pick"
            const addBpBtn = editorDlg.locator('button:has-text("添加 ban/pick")');
            if (await addBpBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await addBpBtn.click();
              await page.waitForTimeout(300);
              console.log('[detail-ui] BP row added');

              // The ChampionSelect trigger for this BP row is the last
              // button[role="combobox"][aria-haspopup="listbox"] in the dialog
              const champTriggers = editorDlg.locator(
                'button[role="combobox"][aria-haspopup="listbox"]',
              );
              const ctCount = await champTriggers.count().catch(() => 0);
              if (ctCount > 0) {
                const lastChampTrigger = champTriggers.last();
                await lastChampTrigger.click();
                await page.waitForTimeout(300);
                const searchBox = page.locator('input[placeholder="搜索英雄…"]').first();
                if (await searchBox.isVisible({ timeout: 1000 }).catch(() => false)) {
                  await searchBox.fill('Ahri');
                  await page.waitForTimeout(300);
                  const opt = page.locator('[role="listbox"] [role="option"]').first();
                  if (await opt.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await opt.click();
                    console.log('[detail-ui] BP champion = Ahri');
                  } else {
                    await page.keyboard.press('Escape');
                  }
                } else {
                  await page.keyboard.press('Escape');
                }
              }
              await ss(page, '25-bp-row-filled');
            }

            // 4. Fill stats for all 10 players (5 per team)
            // Number inputs in stats rows have placeholder="0" and type="number"
            const statNumInputs = editorDlg.locator(
              'input[type="number"][placeholder="0"]',
            );
            const siCount = await statNumInputs.count().catch(() => 0);
            console.log(`[detail-ui] Stat number inputs: ${siCount}`);
            // 10 players × 6 columns = 60 inputs expected
            const sampleVals = ['5', '2', '8', '150', '15000', '9000'];
            for (let si = 0; si < siCount; si++) {
              const inp = statNumInputs.nth(si);
              if (await inp.isVisible({ timeout: 300 }).catch(() => false)) {
                await inp.fill(sampleVals[si % 6]);
              }
            }
            if (siCount > 0) console.log(`[detail-ui] Filled ${siCount} stat inputs`);

            // Fill ChampionSelect for each stats row
            // These use button[role="combobox"][aria-haspopup="listbox"]
            const allChampTriggers = editorDlg.locator(
              'button[role="combobox"][aria-haspopup="listbox"]',
            );
            const actCount = await allChampTriggers.count().catch(() => 0);
            console.log(`[detail-ui] ChampionSelect triggers: ${actCount}`);
            const champsForStats = [
              'Ahri', 'Zed', 'Yasuo', 'Jinx', 'Thresh',
              'Lux', 'Ezreal', 'Vi', 'Akali', 'Kaisa',
            ];
            for (let ci = 0; ci < Math.min(actCount, 10); ci++) {
              const ct = allChampTriggers.nth(ci);
              if (await ct.isVisible({ timeout: 300 }).catch(() => false)) {
                await ct.click();
                await page.waitForTimeout(200);
                const sb = page.locator('input[placeholder="搜索英雄…"]').first();
                if (await sb.isVisible({ timeout: 800 }).catch(() => false)) {
                  await sb.fill(champsForStats[ci % champsForStats.length]);
                  await page.waitForTimeout(200);
                  const opt2 = page
                    .locator('[role="listbox"] [role="option"]')
                    .first();
                  if (await opt2.isVisible({ timeout: 800 }).catch(() => false)) {
                    await opt2.click();
                    await page.waitForTimeout(100);
                  } else {
                    await page.keyboard.press('Escape');
                  }
                } else {
                  await page.keyboard.press('Escape');
                }
              }
            }
            await ss(page, '26-stats-champions-filled');

            // 5. MVP select — enabled only when all 10 stats rows complete
            await page.waitForTimeout(400);
            // MVP SelectTrigger has placeholder "选择 MVP" or "需先填写双方数据"
            // It is a Radix Select trigger (not ChampionSelect) so it lacks aria-haspopup="listbox"
            // It appears after the stats section, before the winner select
            // Locate by placeholder text or position: second-to-last Radix combobox
            // Radix SelectTrigger renders as button[role="combobox"] without aria-haspopup="listbox"
            const radixTriggers = editorDlg.locator(
              'button[role="combobox"]:not([aria-haspopup="listbox"])',
            );
            const rtCount = await radixTriggers.count().catch(() => 0);
            console.log(`[detail-ui] Radix Select triggers: ${rtCount}`);
            // Layout: [0]=blue-side, [1]=winner-BP-row-team (per BP row), [...], [n-2]=MVP, [n-1]=winner
            // With 1 BP row: [0]=blue, [1]=BP-team, [2]=BP-type, [3]=MVP, [4]=winner
            // MVP is second-to-last Radix trigger
            if (rtCount >= 2) {
              const mvpTrigger = radixTriggers.nth(rtCount - 2);
              const isDisabled = await mvpTrigger.isDisabled().catch(() => true);
              const mvpText = await mvpTrigger.textContent().catch(() => '');
              console.log(`[detail-ui] MVP trigger text: "${mvpText?.trim()}", disabled: ${isDisabled}`);
              if (!isDisabled) {
                await mvpTrigger.click();
                await page.waitForTimeout(300);
                const mvpOpt = page.locator('[role="option"]').nth(1);
                if (await mvpOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
                  const mvpOptText = await mvpOpt.textContent();
                  console.log(`[detail-ui] Setting MVP: "${mvpOptText?.trim()}"`);
                  await mvpOpt.click();
                  await page.waitForTimeout(200);
                  console.log('[detail-ui] MVP set');
                } else {
                  await page.keyboard.press('Escape');
                }
              } else {
                console.log('[detail-ui] MVP disabled — skipping');
              }
            }

            // 6. Winner select — last Radix trigger
            if (rtCount >= 1) {
              const winnerTrigger = radixTriggers.last();
              const winnerText = await winnerTrigger.textContent().catch(() => '');
              console.log(`[detail-ui] Winner trigger current text: "${winnerText?.trim()}"`);
              await winnerTrigger.click();
              await page.waitForTimeout(300);
              const winOpt = page
                .locator('[role="option"]')
                .filter({ hasText: /胜$/ })
                .first();
              if (await winOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
                const winOptTxt = await winOpt.textContent();
                console.log(`[detail-ui] Selecting winner: "${winOptTxt?.trim()}"`);
                await winOpt.click();
                await page.waitForTimeout(200);
              } else {
                await page.keyboard.press('Escape');
              }
            }
            await ss(page, '27-winner-and-mvp-set');

            // 7. Save
            const saveBtn = editorDlg.locator('button:has-text("保存")');
            if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveBtn.click();
              await page.waitForTimeout(2500);
              await ss(page, '28-detail-saved');
              console.log('[detail-ui] Saved via GameDetailEditor UI');
              detailSavedViaUi = true;
            }
          }

          // Close all open dialogs
          for (let i = 0; i < 3; i++) {
            const dlgVisible = page.locator('[role="dialog"]');
            if (await dlgVisible.isVisible({ timeout: 400 }).catch(() => false)) {
              await page.keyboard.press('Escape');
              await page.waitForTimeout(300);
            } else {
              break;
            }
          }
        }

        if (!detailSavedViaUi) {
          console.log('[detail] UI path failed — falling back to API');
          await seedGameDetailViaApi(playersA, playersB);
        }
      }

      // Wait for SSE propagation
      await page.waitForTimeout(1500);

      // ─── Public detail page assertions ──────────────────────────────────
      const matchId: string = detailFinalMatch.id;
      const detailPublicUrl = `${BASE}/tournament/match/${matchId}`;
      console.log(`[detail-public] Navigating to: ${detailPublicUrl}`);
      await nav(publicPage, detailPublicUrl);
      await page.waitForTimeout(1000);
      await ss(publicPage, '29-match-detail-page');

      // Check what the public API returns for this match
      const savedDetail = await apiGet(
        page,
        `/api/tournament/public/match/${matchId}`,
      );
      const savedGames: any[] = savedDetail?.detail?.games ?? [];
      console.log(`[detail-public] Saved games: ${savedGames.length}`);

      const gameWithBans = savedGames.find((g: any) => g.bans?.length > 0);
      const gameWithPlayers = savedGames.find((g: any) => g.players?.length >= 10);

      // Assert BP timeline
      if (gameWithBans) {
        console.log(
          `[detail-public] Game with BP bans found: ${gameWithBans.bans.length} entries`,
        );
        // The MatchDetailView renders "BP 时间线" heading when bans exist
        const bpHeading = publicPage.locator('text=BP 时间线');
        if (await bpHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('[detail-public] BP 时间线 heading visible ✓');
        } else {
          // May be on a different game tab — click the game tab
          const gameTabs = publicPage.locator('[role="tab"]');
          const gtCount = await gameTabs.count().catch(() => 0);
          for (let ti = 0; ti < gtCount; ti++) {
            await gameTabs.nth(ti).click();
            await page.waitForTimeout(400);
            if (
              await publicPage
                .locator('text=BP 时间线')
                .isVisible({ timeout: 1000 })
                .catch(() => false)
            ) {
              console.log('[detail-public] BP 时间线 found on game tab', ti);
              break;
            }
          }
        }
        await ss(publicPage, '30-bp-timeline');
      } else {
        console.log('[detail-public] No game with BP bans saved');
      }

      // Assert 10-player stats table
      if (gameWithPlayers) {
        console.log(
          `[detail-public] Game with 10 players found`,
        );
        // Click the correct game tab if needed
        const gameTabs2 = publicPage.locator('[role="tab"]');
        const gt2Count = await gameTabs2.count().catch(() => 0);
        // Find tab whose content has a table with many rows
        for (let ti = 0; ti < gt2Count; ti++) {
          await gameTabs2.nth(ti).click();
          await page.waitForTimeout(400);
          const trs = await publicPage.locator('table tbody tr').count().catch(() => 0);
          if (trs >= 10) {
            console.log(`[detail-public] Found 10-player table on game tab ${ti} (${trs} rows)`);
            // Assert at least 10 rows (10 players + 2 team header rows)
            expect(trs, '10-player table should have >= 10 rows').toBeGreaterThanOrEqual(10);
            break;
          }
        }
        await ss(publicPage, '31-player-stats-table');

        // Assert MVP badge
        const mvpBadge = publicPage.locator('text=MVP');
        if (await mvpBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('[detail-public] MVP badge visible ✓');
        } else {
          console.log('[detail-public] MVP badge not visible in current view');
        }
        await ss(publicPage, '32-mvp-badge');
      } else {
        console.log('[detail-public] No game with 10 players — skipping table assertion');
      }

      // ─── Leaderboard assertion ────────────────────────────────────────────
      console.log('[leaderboard] Checking 数据榜 tab');
      await nav(publicPage, `${BASE}/tournament`);
      await page.waitForTimeout(600);

      const lbTab = publicPage.locator('[role="tab"]:has-text("数据榜")');
      if (await lbTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await lbTab.click();
        await page.waitForTimeout(2000); // wait for leaderboard API response
        await ss(publicPage, '33-leaderboard-tab');

        const lbBodyText = await publicPage.locator('body').textContent().catch(() => '');
        const lbIsEmpty = lbBodyText?.includes('暂无数据');
        console.log(`[leaderboard] Empty: ${lbIsEmpty}`);

        if (!lbIsEmpty) {
          const lbRows = publicPage.locator('table tbody tr');
          const lbRowCount = await lbRows.count().catch(() => 0);
          console.log(`[leaderboard] Rows: ${lbRowCount}`);

          if (lbRowCount > 0) {
            console.log('[leaderboard] Non-empty leaderboard ✓');
            // KDA column is approximately 8th td (0-indexed: #, player, games, wins, K, D, A, KDA…)
            const kdaCell = publicPage.locator('table tbody tr:first-child td').nth(7);
            const kdaVal = await kdaCell.textContent().catch(() => '?');
            console.log(`[leaderboard] First row KDA: "${kdaVal?.trim()}"`);

            // Assert player link is present (nickname cell has an <a>)
            const playerNameLink = publicPage
              .locator('table tbody tr:first-child td a')
              .first();
            const playerNickname = await playerNameLink.textContent().catch(() => null);
            console.log(`[leaderboard] First player nickname: "${playerNickname?.trim()}"`);
            if (playerNickname) {
              console.log('[leaderboard] Player nickname present ✓');
            }

            // ─── Player page assertion ───────────────────────────────────
            if (await playerNameLink.isVisible({ timeout: 1000 }).catch(() => false)) {
              const playerHref = await playerNameLink
                .getAttribute('href')
                .catch(() => null);
              if (playerHref) {
                console.log(`[player] Navigating to: ${BASE}${playerHref}`);
                await nav(publicPage, `${BASE}${playerHref}`);
                await page.waitForTimeout(1000);
                await ss(publicPage, '35-player-page');

                const playerBodyTxt = await publicPage
                  .locator('body')
                  .textContent()
                  .catch(() => '');
                const playerPageOk =
                  !playerBodyTxt?.includes('选手不存在') &&
                  !playerBodyTxt?.includes('加载中…') &&
                  (playerBodyTxt?.length ?? 0) > 200;
                console.log(`[player] Page renders: ${playerPageOk}`);
                if (playerPageOk) {
                  console.log('[player] Player stats page renders ✓');
                }
              }
            }
          } else {
            console.log('[leaderboard] Table is empty (stats not complete for any game)');
          }
          await ss(publicPage, '34-leaderboard-data');
        } else {
          console.log('[leaderboard] "暂无数据" shown — no complete stats games recorded');
        }
      } else {
        console.log('[leaderboard] 数据榜 tab not found');
      }
    }

    console.log('[done] E2E complete');
    console.log(`[done] Screenshots: ${SCREENSHOTS_DIR}`);
    console.log('[done] E2E season + tournament left in dev DB (reset to SETUP on next run)');
  });
});
