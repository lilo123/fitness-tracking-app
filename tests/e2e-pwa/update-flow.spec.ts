import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';
import {
  createPwaTestUser,
  cleanupPwaTestUser,
  signInUser,
  waitForSwControl,
  type PwaTestUser,
} from './fixtures';

test.describe('PWA Service Worker Update Flow & Safety Blockers', () => {
  let user: PwaTestUser;
  const swPath = path.resolve('dist/sw.js');
  let originalSwContent = '';

  test.beforeAll(() => {
    if (fs.existsSync(swPath)) {
      originalSwContent = fs.readFileSync(swPath, 'utf8');
    }
  });

  test.beforeEach(async () => {
    user = await createPwaTestUser('pwa-update');
  });

  test.afterEach(async () => {
    // Restore original sw.js if modified on disk
    if (originalSwContent && fs.existsSync(swPath)) {
      fs.writeFileSync(swPath, originalSwContent);
    }
    if (user) {
      cleanupPwaTestUser(user);
    }
  });

  test('update flow: banner appears, blocked by open dialog or active workout, never auto-reloads, and applies on tap when safe', async ({
    page,
  }) => {
    // 1. Initial sign-in and SW activation
    await signInUser(page, user);
    await waitForSwControl(page);

    // Track page navigations after SW is controlling
    let navigations = 0;
    page.on('load', () => {
      navigations++;
    });

    // 2. Serve a byte-modified sw.js via page.route and disk sync
    const updatedSwContent =
      (originalSwContent || fs.readFileSync(swPath, 'utf8')) +
      `\n/* pwa-update-spec-${Date.now()} */`;

    await page.route('**/sw.js*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: updatedSwContent,
      });
    });

    if (fs.existsSync(swPath)) {
      fs.writeFileSync(swPath, updatedSwContent);
    }

    // Trigger registration update check
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });

    // 3. Assert "Update available · Reload" banner appears
    const banner = page.locator('[data-testid="update-banner"]');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText('Update available · Reload');

    // Invariant: Never auto-reloads before user tap
    expect(navigations).toBe(0);

    const reloadBtn = page.locator('[data-testid="update-reload-btn"]');
    const reason = page.locator('[data-testid="update-block-reason"]');

    // 4. Blocker 1: Active workout session
    // On /workout, ensure an uncompleted active workout session pointer is active
    await page.evaluate((uid) => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
      localStorage.setItem(`cybergym_current_session_pointer_${uid}`, today);
      localStorage.setItem(
        `cybergym_active_session_${uid}_${today}`,
        JSON.stringify({
          schemaVersion: 1,
          sessionId: 'active-session-blocker',
          userId: uid,
          workoutDate: today,
          routineName: 'Active Session Routine',
          exercises: [],
          targetSetCounts: {},
          targetRepCounts: {},
          expandedExercises: [],
          inputDrafts: {},
          startedAt: now.toISOString(),
          lastModifiedAt: now.toISOString(),
          completedAt: null,
        })
      );
    }, user.id);

    await reloadBtn.click();
    // Verify reload did not happen and workout blocker reason is shown
    expect(navigations).toBe(0);
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('Finish your workout and sync first');

    // Clear active workout session so workout blocker is cleared
    await page.evaluate((uid) => {
      localStorage.removeItem(`cybergym_current_session_pointer_${uid}`);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('cybergym_current_session_pointer_') || key.startsWith('cybergym_active_session_'))) {
          localStorage.removeItem(key);
        }
      }
    }, user.id);

    // 5. Blocker 2: Open accessible dialog
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'test-modal-dialog-blocker';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-modal', 'true');
      document.body.appendChild(d);
    });

    await reloadBtn.click();
    // Verify reload did not happen and modal blocker reason is shown
    expect(navigations).toBe(0);
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('Close open dialog before updating');

    // Remove dialog blocker
    await page.evaluate(() => {
      document.getElementById('test-modal-dialog-blocker')?.remove();
    });

    // 6. With no blockers, tap reloads once onto the new SW
    const reloadPromise = page.waitForNavigation({ waitUntil: 'load' });
    await reloadBtn.click();
    await reloadPromise;

    // Verify exactly one reload occurred
    expect(navigations).toBe(1);

    // Verify that after reload, service worker is active and controlling
    const isControlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    expect(isControlled).toBe(true);
  });
});
