import { test, expect } from '@playwright/test';

test.describe('Coach-Athlete Code Linking & Lifecycle E2E', () => {
  test('complete lifecycle: link, macro target update, and disconnect', async ({ page }) => {
    // Handle confirm dialogs globally
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // 1. Athlete logs in
    await page.goto('/login');
    await page.click('button:has-text("Demo Athlete")');
    await page.waitForURL('**/workout');

    // 2. Navigate to Settings
    await page.goto('/settings');
    await expect(page.locator('text=Settings')).toBeVisible();

    // 3. Handle initial connection state: wait for either linked state or unlinked input
    const disconnectBtn = page.locator('[data-testid="disconnect-coach-btn"]');
    const codeInput = page.locator('[data-testid="link-coach-code-input"]');
    await expect(disconnectBtn.or(codeInput)).toBeVisible();

    if (await disconnectBtn.isVisible()) {
      await disconnectBtn.click();
      await expect(codeInput).toBeVisible();
    }

    // 4. Link to Demo Coach using code CYBER-DEMO01
    await expect(codeInput).toBeVisible();
    await codeInput.fill('CYBER-DEMO01');

    const linkBtn = page.locator('[data-testid="link-coach-btn"]');
    await linkBtn.click();

    // Verify link confirmation & assigned coach display
    await expect(page.locator('[data-testid="link-coach-status"]')).toContainText('Successfully linked to coach!');
    await expect(disconnectBtn).toBeVisible();
    await expect(page.locator('text=CYBER-DEMO01')).toBeVisible();

    // 5. Athlete signs out
    const signOutBtn = page.locator('button[title="Sign Out"]');
    await signOutBtn.click();
    await page.waitForURL('**/login');

    // 6. Coach logs in
    await page.click('button:has-text("Demo Coach")');
    await page.waitForURL('**/coach');

    // 7. Verify coach cockpit & athlete roster
    await expect(page.locator('text=Coach Dashboard')).toBeVisible();
    await expect(page.locator('text=Alex Athlete').first()).toBeVisible();

    // 8. Coach updates athlete's macro targets
    const calInput = page.locator('[data-testid="athlete-macro-cal"]');
    await expect(calInput).toBeVisible();
    await calInput.clear();
    await calInput.fill('2550');

    const proInput = page.locator('[data-testid="athlete-macro-pro"]');
    await proInput.clear();
    await proInput.fill('185');

    const carbInput = page.locator('[data-testid="athlete-macro-carb"]');
    await carbInput.clear();
    await carbInput.fill('245');

    const fatInput = page.locator('[data-testid="athlete-macro-fat"]');
    await fatInput.clear();
    await fatInput.fill('75');

    const fiberInput = page.locator('[data-testid="athlete-macro-fiber"]');
    await fiberInput.clear();
    await fiberInput.fill('32');

    const updateMacrosBtn = page.locator('[data-testid="update-athlete-macros-btn"]');
    await updateMacrosBtn.click();

    await expect(page.locator('[data-testid="athlete-macro-status"]')).toContainText('Athlete nutrition targets updated!');

    // 9. Coach signs out
    await page.locator('button[title="Sign Out"]').click();
    await page.waitForURL('**/login');

    // 10. Athlete logs back in
    await page.click('button:has-text("Demo Athlete")');
    await page.waitForURL('**/workout');

    // 11. Athlete verifies updated targets in Settings
    await page.goto('/settings');
    await expect(page.locator('text=Daily Macro Goals')).toBeVisible();

    // Calories input should now reflect 2550
    const athleteCalInput = page.locator('input[value="2550"]');
    await expect(athleteCalInput).toBeVisible();

    // 12. Athlete disconnects from coach
    const finalDisconnectBtn = page.locator('[data-testid="disconnect-coach-btn"]');
    await expect(finalDisconnectBtn).toBeVisible();
    await finalDisconnectBtn.click();

    await expect(page.locator('text=Successfully disconnected from coach.')).toBeVisible();
    await expect(page.locator('[data-testid="link-coach-code-input"]')).toBeVisible();

    // 13. Re-link at the end to leave DB in seeded state for other test suites
    await codeInput.fill('CYBER-DEMO01');
    await linkBtn.click();
    await expect(page.locator('[data-testid="link-coach-status"]')).toContainText('Successfully linked to coach!');
  });
});
