import { test, expect, type Page } from '@playwright/test';

/**
 * Remove one meal row with this name through the UI and assert it is gone.
 *
 * Every test that commits a meal must call this. These specs run in five
 * projects on every invocation and used to leave every row behind: the fixture
 * account had accumulated 345 rows, and rendering that timeline was slow enough
 * to time Mobile Safari out for real. Deleting also proves the destructive
 * action works rather than merely that its label is present.
 *
 * Identified by the row's log id, not by a row count. `count()` then
 * `toHaveCount(count - 1)` races the refetch that follows the commit: if the
 * just-logged row renders *after* the count is taken, the target is one too low
 * and never arrives. That is not hypothetical — it failed in three of the five
 * projects, on a timeline that already held a dozen identically named rows.
 */
async function deleteMealRow(page: Page, name: string) {
  const row = page.locator('[data-testid="meal-log-item"]').filter({ hasText: name }).first();
  await expect(row).toBeVisible();

  // `meal-actions-<log id>` on the trigger, `delete-meal-<log id>` on the item.
  const trigger = row.locator('button[aria-haspopup="menu"]');
  await expect(trigger).toBeVisible();
  const testId = await trigger.getAttribute('data-testid');
  const id = (testId ?? '').replace('meal-actions-', '');
  expect(id).not.toBe('');

  await trigger.click();
  const deleteItem = row.locator('[role="menuitem"]').filter({ hasText: 'Delete meal' });
  await expect(deleteItem).toBeVisible();
  await deleteItem.click();

  // That exact row, not "one fewer row than a moment ago".
  await expect(page.locator(`[data-testid="meal-actions-${id}"]`)).toHaveCount(0);
}

async function safeGoto(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch {
    await page.goto(url);
  }
}

test.describe('Nutrition Flow E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Automatically accept window.confirm dialogs (e.g. meal deletion confirmation)
    page.on('dialog', async (dialog) => {
      await dialog.accept().catch(() => {});
    });

    // Intercept Supabase Edge Function to provide deterministic AI parsing without local Gemini runtime dependency
    await page.route('**/functions/v1/parse-nutrition', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
            'access-control-allow-methods': 'POST, OPTIONS',
          },
        });
        return;
      }

      const postData = route.request().postDataJSON() || {};
      const promptText = (postData.input || postData.prompt || '').toLowerCase();

      if (promptText.includes('com tam') || promptText.includes('cơm tấm')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            name: 'Com Tam & Eggs',
            calories: 650,
            protein: 38,
            carbs: 70,
            fat: 23,
            fiber: 1,
            explanation: '300 kcal (Broken Rice) + 260 kcal (Grilled Pork Chop) + 90 kcal (Fried Egg) = 650 kcal',
            items: [
              { name: 'Broken Rice (Cơm Tấm)', portion: '1.5 cups (240g)', calories: 300, protein: 6, carbs: 65, fat: 1, fiber: 1 },
              { name: 'Grilled Pork Chop (Sườn Nướng)', portion: '1 chop (120g)', calories: 260, protein: 26, carbs: 4, fat: 15, fiber: 0 },
              { name: 'Fried Egg', portion: '1 large', calories: 90, protein: 6, carbs: 1, fat: 7, fiber: 0 },
            ],
          }),
        });
        return;
      }

      if (promptText.includes('friday menu') || promptText.includes('chia pudding')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            name: 'High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)',
            calories: 550,
            protein: 46,
            carbs: 24,
            fat: 30,
            fiber: 8,
            serving_size: 510,
            serving_unit: 'g',
            explanation: '87 kcal (Egg White) + 80 kcal (Turkey) + 68 kcal (Salmon) + 227 kcal (Chia) + 88 kcal (Yogurt) = 550 kcal',
            items: [
              { name: 'Scrambled Egg White (with hot sauce & black pepper)', portion: '150 g', calories: 87, protein: 14, carbs: 1, fat: 3, fiber: 0 },
              { name: 'Sliced Turkey Breast', portion: '60 g', calories: 80, protein: 10, carbs: 1, fat: 4, fiber: 0 },
              { name: 'Smoked Salmon', portion: '50 g', calories: 68, protein: 8, carbs: 0, fat: 4, fiber: 0 },
              { name: 'Chocolate Coconut Chia Pudding', portion: '150 g', calories: 227, protein: 5, carbs: 18, fat: 15, fiber: 8 },
              { name: '2% Plain Greek Yogurt', portion: '100 g', calories: 88, protein: 9, carbs: 4, fat: 4, fiber: 0 },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
        },
        body: JSON.stringify({
          name: 'Eggs, Toast & Butter',
          calories: 470,
          protein: 24,
          carbs: 32,
          fat: 28,
          fiber: 2,
          explanation: '210 kcal (Eggs) + 160 kcal (Toast) + 100 kcal (Butter) = 470 kcal',
          items: [
            { name: 'Eggs', portion: '3 large', calories: 210, protein: 18, carbs: 2, fat: 15, fiber: 0 },
            { name: 'Sourdough Toast', portion: '2 slices', calories: 160, protein: 5, carbs: 30, fat: 1, fiber: 2 },
            { name: 'Butter', portion: '1 tbsp', calories: 100, protein: 1, carbs: 0, fat: 12, fiber: 0 },
          ],
        }),
      });
    });

    await safeGoto(page, '/login');
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/workout');
    await safeGoto(page, '/nutrition');
    await page.waitForSelector('text=Today\'s Nutrition');
  });

  test('renders 5-ring/card macro dashboard and conversational analysis input', async ({ page }) => {
    // Assert macro dashboard items
    await expect(page.locator('text=Calories').first()).toBeVisible();
    await expect(page.locator('text=Protein').first()).toBeVisible();
    await expect(page.locator('text=Carbs').first()).toBeVisible();
    await expect(page.locator('text=Fat').first()).toBeVisible();
    await expect(page.locator('text=Fiber').first()).toBeVisible();

    // Assert conversational textarea
    const nlTextarea = page.locator('textarea[placeholder*="Describe what you ate"]');
    await expect(nlTextarea).toBeVisible();

    // Assert Analyze button
    const analyzeBtn = page.locator('button:has-text("Analyze Meal")');
    await expect(analyzeBtn).toBeVisible();
  });

  test('allows manual meal entry and displays logged meal in timeline', async ({ page }) => {
    // Toggle manual form
    const manualToggleBtn = page.locator('button:has-text("Manual Entry")');
    if (await manualToggleBtn.isVisible()) {
      await manualToggleBtn.click();
    }

    // Fill manual entry fields
    const dishInput = page.locator('[data-testid="dish-name-input"]');
    await dishInput.fill('Playwright Test Chicken & Rice');

    const calInput = page.locator('[data-testid="calories-input"]');
    await calInput.fill('500');

    const proInput = page.locator('[data-testid="protein-input"]');
    await proInput.fill('45');

    const carbsInput = page.locator('[data-testid="carbs-input"]');
    await carbsInput.fill('60');

    const fatInput = page.locator('[data-testid="fat-input"]');
    await fatInput.fill('10');

    const fiberInput = page.locator('[data-testid="fiber-input"]');
    if (await fiberInput.isVisible()) {
      await fiberInput.fill('5');
    }

    // Submit
    const logBtn = page.locator('button:has-text("Log Meal")').last();
    await logBtn.click();

    // Verify meal is displayed in today's meals timeline
    await expect(page.locator('text=Playwright Test Chicken & Rice').first()).toBeVisible();

    // Edit and Delete now live behind one overflow trigger so the row fits a
    // 320 px viewport. The trigger carries the touch-target guarantee that the
    // two icon buttons used to.
    // `.first()` is load-bearing, not defensive: this test seeds a meal with a
    // fixed name on every run, and the fixture account still carries the
    // backlog of copies left behind before the test was made self-cleaning
    // (below). Without it the locator resolves to all of them and Playwright's
    // strict mode throws before asserting anything.
    const row = page
      .locator('[data-testid="meal-log-item"]')
      .filter({ hasText: 'Playwright Test Chicken & Rice' })
      .first();
    const actionsBtn = row.locator('button[aria-haspopup="menu"]');
    await expect(actionsBtn).toBeVisible();
    const box = await actionsBtn.boundingBox();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }

    // The destructive action must still be reachable, not merely relabelled.
    const id = ((await actionsBtn.getAttribute('data-testid')) ?? '').replace('meal-actions-', '');
    expect(id).not.toBe('');
    await actionsBtn.click();
    const deleteItem = row.locator('[role="menuitem"]').filter({ hasText: 'Delete meal' });
    await expect(deleteItem).toBeVisible();

    // Actually delete instead of pressing Escape. This test seeds a row on every
    // run in every project and used to leave it behind forever; the backlog had
    // reached 96 copies, and rendering that timeline was slow enough to make the
    // assertions above time out intermittently on WebKit. Deleting keeps the
    // fixture net-neutral and proves the action works rather than merely that
    // its label is present.
    //
    // Asserted by id, not by "one fewer than before": a count taken while the
    // timeline is still settling after the commit makes `before - 1` a target
    // that never arrives.
    await deleteItem.click();
    await expect(page.locator(`[data-testid="meal-actions-${id}"]`)).toHaveCount(0);
  });

  test('submits conversational meal prompt, interacts with staged card and quick log', async ({ page }) => {
    // Fill conversational prompt
    const nlTextarea = page.locator('textarea[placeholder*="Describe what you ate"]');
    await nlTextarea.fill('3 large eggs, 2 slices sourdough toast, 1 tbsp butter');

    // Click Analyze Meal
    const analyzeBtn = page.locator('button:has-text("Analyze Meal")');
    await analyzeBtn.click();

    // Verify staged meal card appears with breakdown
    const stagedCard = page.locator('[data-testid="staged-meal-card"]');
    await expect(stagedCard).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Itemized Breakdown')).toBeVisible();
    await expect(page.locator('text=Eggs').first()).toBeVisible();

    // D17 replaced the -/+ stepper with a typed [qty][unit] box.
    // The input meets the >= 40px touch target, and typing quantity + Enter saves.
    const quantityInput = page.locator('[data-testid="component-quantity-input"]').first();
    await expect(quantityInput).toBeVisible();
    const inputBox = await quantityInput.boundingBox();
    if (inputBox) {
      expect(inputBox.width).toBeGreaterThanOrEqual(40);
      expect(inputBox.height).toBeGreaterThanOrEqual(40);
    }
    await quantityInput.fill('4');
    await quantityInput.press('Enter');
    await expect(quantityInput).toHaveValue('4');

    // Verify Log Meal button is visible on staged card and commit
    const commitStagedBtn = stagedCard.locator('button:has-text("Log Meal")');
    await expect(commitStagedBtn).toBeVisible();
    await commitStagedBtn.click();

    // Staged card should clear
    await expect(stagedCard).not.toBeVisible();
    await expect(page.locator('[data-testid="meal-log-item"]').filter({ hasText: 'Eggs, Toast & Butter' }).first()).toBeVisible();

    // Net-neutral: remove the row this test just committed.
    await deleteMealRow(page, 'Eggs, Toast & Butter');
  });

  test('analyzes multi-dish conversational meal "I ate Com Tam & Eggs" and elaborates all component items', async ({ page }) => {
    const nlTextarea = page.locator('textarea[placeholder*="Describe what you ate"]');
    await nlTextarea.fill('I ate Com Tam & Eggs');

    const analyzeBtn = page.locator('button:has-text("Analyze Meal")');
    await analyzeBtn.click();

    const stagedCard = page.locator('[data-testid="staged-meal-card"]');
    await expect(stagedCard).toBeVisible({ timeout: 15000 });

    // Assert meal name and all elaborated components
    const nameInput = stagedCard.locator('[data-testid="dish-name-input"]');
    await expect(nameInput).toHaveValue('Com Tam & Eggs');

    await expect(stagedCard.getByText('Broken Rice (Cơm Tấm)', { exact: true })).toBeVisible();
    await expect(stagedCard.getByText('Grilled Pork Chop (Sườn Nướng)', { exact: true })).toBeVisible();
    await expect(stagedCard.getByText('Fried Egg', { exact: true })).toBeVisible();

    // Verify commit button has 650 kcal
    const commitBtn = stagedCard.locator('button:has-text("Log Meal (+650 kcal)")');
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();

    // Verify meal is logged
    await expect(stagedCard).not.toBeVisible();
    await expect(page.locator('text=Com Tam & Eggs').first()).toBeVisible();

    // Net-neutral: remove the row this test just committed.
    await deleteMealRow(page, 'Com Tam & Eggs');
  });

  test('preserves exact pre-analyzed structured breakdown text verbatim with exact totals', async ({ page }) => {
    const structuredInput = `Food Item: High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)
Total Portion Size: 510 g

Component Breakdown:
* Scrambled Egg White (with hot sauce & black pepper): 150 g | 87 kcal | 14 g P | 1 g C | 3 g F | 0 g Fiber
* Sliced Turkey Breast: 60 g | 80 kcal | 10 g P | 1 g C | 4 g F | 0 g Fiber
* Smoked Salmon: 50 g | 68 kcal | 8 g P | 0 g C | 4 g F | 0 g Fiber
* Chocolate Coconut Chia Pudding: 150 g | 227 kcal | 5 g P | 18 g C | 15 g F | 8 g Fiber
* 2% Plain Greek Yogurt: 100 g | 88 kcal | 9 g P | 4 g C | 4 g F | 0 g Fiber

Total Calories: 550 kcal
Total Protein: 46 g
Total Carbs: 24 g
Total Fat: 30 g
Total Fiber: 8 g`;

    const nlTextarea = page.locator('textarea[placeholder*="Describe what you ate"]');
    await nlTextarea.fill(structuredInput);

    const analyzeBtn = page.locator('button:has-text("Analyze Meal")');
    await analyzeBtn.click();

    const stagedCard = page.locator('[data-testid="staged-meal-card"]');
    await expect(stagedCard).toBeVisible({ timeout: 15000 });

    // Assert title
    const nameInput = stagedCard.locator('[data-testid="dish-name-input"]');
    await expect(nameInput).toHaveValue('High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)');

    // Assert all 5 component items
    await expect(stagedCard.getByText('Scrambled Egg White (with hot sauce & black pepper)', { exact: true })).toBeVisible();
    await expect(stagedCard.getByText('Sliced Turkey Breast', { exact: true })).toBeVisible();
    await expect(stagedCard.getByText('Smoked Salmon', { exact: true })).toBeVisible();
    await expect(stagedCard.getByText('Chocolate Coconut Chia Pudding', { exact: true })).toBeVisible();
    await expect(stagedCard.getByText('2% Plain Greek Yogurt', { exact: true })).toBeVisible();

    // Assert all 5 component items exist and read each item's macros
    const rows = stagedCard.locator('[data-testid="component-row"]');
    await expect(rows).toHaveCount(5);

    let sumCalories = 0;
    let sumProtein = 0;
    let sumCarbs = 0;
    let sumFat = 0;
    let sumFiber = 0;

    for (let i = 0; i < 5; i++) {
      const row = rows.nth(i);
      const cal = parseFloat(await row.locator('[data-testid="component-macro-calories"] [data-testid="macro-val-calories"]').innerText());
      const pro = parseFloat(await row.locator('[data-testid="component-macro-protein"] [data-testid="macro-val-protein"]').innerText());
      const carbs = parseFloat(await row.locator('[data-testid="component-macro-carbs"] [data-testid="macro-val-carbs"]').innerText());
      const fat = parseFloat(await row.locator('[data-testid="component-macro-fat"] [data-testid="macro-val-fat"]').innerText());
      const fiber = parseFloat(await row.locator('[data-testid="component-macro-fiber"] [data-testid="macro-val-fiber"]').innerText());

      sumCalories += cal;
      sumProtein += pro;
      sumCarbs += carbs;
      sumFat += fat;
      sumFiber += fiber;
    }

    sumCalories = Math.round(sumCalories);
    sumProtein = Math.round(sumProtein * 10) / 10;
    sumCarbs = Math.round(sumCarbs * 10) / 10;
    sumFat = Math.round(sumFat * 10) / 10;
    sumFiber = Math.round(sumFiber * 10) / 10;

    // Verify individual items sum to the expected pre-analyzed totals
    expect(sumCalories).toBe(550);
    expect(sumProtein).toBe(46);
    expect(sumCarbs).toBe(24);
    expect(sumFat).toBe(30);
    expect(sumFiber).toBe(8);

    // Assert read-only staged totals (Fix D5) equal the sum of items
    await expect(stagedCard.locator('[data-testid="staged-total-calories"] [data-testid="macro-val-calories"]')).toHaveText(String(sumCalories));
    await expect(stagedCard.locator('[data-testid="staged-total-protein"] [data-testid="macro-val-protein"]')).toHaveText(String(sumProtein));
    await expect(stagedCard.locator('[data-testid="staged-total-carbs"] [data-testid="macro-val-carbs"]')).toHaveText(String(sumCarbs));
    await expect(stagedCard.locator('[data-testid="staged-total-fat"] [data-testid="macro-val-fat"]')).toHaveText(String(sumFat));
    await expect(stagedCard.locator('[data-testid="staged-total-fiber"] [data-testid="macro-val-fiber"]')).toHaveText(String(sumFiber));

    await expect(stagedCard.locator('[data-testid="staged-total-calories"]')).toContainText(`${sumCalories} kcal`);
    await expect(stagedCard.locator('[data-testid="staged-total-protein"]')).toContainText(`${sumProtein} P`);
    await expect(stagedCard.locator('[data-testid="staged-total-carbs"]')).toContainText(`${sumCarbs} C`);
    await expect(stagedCard.locator('[data-testid="staged-total-fat"]')).toContainText(`${sumFat} F`);
    await expect(stagedCard.locator('[data-testid="staged-total-fiber"]')).toContainText(`${sumFiber} Fib`);

    // Commit meal
    const commitBtn = stagedCard.locator(`button:has-text("Log Meal (+${sumCalories} kcal)")`);
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();

    await expect(stagedCard).not.toBeVisible();
    const loggedRow = page.locator('[data-testid="meal-log-item"]').filter({ hasText: 'High-Protein Breakfast Plate' }).first();
    await expect(loggedRow).toBeVisible();

    // Assert logged meal row displays exact totals matching the staged totals
    await expect(loggedRow.locator(`text=${sumCalories} kcal`)).toBeVisible();
    await expect(loggedRow.locator(`text=P ${sumProtein}`)).toBeVisible();
    await expect(loggedRow.locator(`text=C ${sumCarbs}`)).toBeVisible();
    await expect(loggedRow.locator(`text=F ${sumFat}`)).toBeVisible();
    await expect(loggedRow.locator(`text=Fib ${sumFiber}`)).toBeVisible();

    // Net-neutral: remove the row this test just committed.
    await deleteMealRow(page, 'High-Protein Breakfast Plate & Chia Pudding Bowl (Friday Menu Grounded)');
  });

  test('allows editing a logged meal in today timeline and history view with updated macros', async ({ page }) => {
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const originalMealName = `Meal-${uniqueSuffix}`;
    const editedMealName = `Edited-${uniqueSuffix}`;
    const historyMealName = `History-${uniqueSuffix}`;

    // 1. Log a meal manually first
    const manualToggleBtn = page.locator('button:has-text("Manual Entry")');
    if (await manualToggleBtn.isVisible()) {
      await manualToggleBtn.click();
    }

    const dishInput = page.locator('[data-testid="dish-name-input"]');
    await dishInput.fill(originalMealName);

    const calInput = page.locator('[data-testid="calories-input"]');
    await calInput.fill('350');

    const proInput = page.locator('[data-testid="protein-input"]');
    await proInput.fill('30');

    const carbsInput = page.locator('[data-testid="carbs-input"]');
    await carbsInput.fill('40');

    const fatInput = page.locator('[data-testid="fat-input"]');
    await fatInput.fill('8');

    const logBtn = page.locator('button:has-text("Log Meal")').last();
    await logBtn.click();

    // Verify meal is displayed
    const originalRow = page.locator('[data-testid="meal-log-item"]').filter({ hasText: originalMealName });
    await expect(originalRow).toBeVisible();

    // 2. Open the row's overflow menu, then pick Edit. Edit and Delete were
    //    collapsed into one control so the row fits a 320px viewport.
    const actionsBtn = originalRow.locator('button[aria-haspopup="menu"]');
    await expect(actionsBtn).toBeVisible();

    // Verify touch target for the overflow trigger >= 40px
    const editBox = await actionsBtn.boundingBox();
    if (editBox) {
      expect(editBox.width).toBeGreaterThanOrEqual(40);
      expect(editBox.height).toBeGreaterThanOrEqual(40);
    }

    await actionsBtn.click();
    const editBtn = originalRow.locator('[role="menuitem"]', { hasText: 'Edit meal' });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Verify Edit Meal modal appears
    const modal = page.locator('[data-testid="edit-meal-modal"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('text=Edit Meal')).toBeVisible();

    // Edit meal name and macros
    const editNameInput = page.locator('[data-testid="edit-meal-name-input"]');
    await expect(editNameInput).toHaveValue(originalMealName);
    await editNameInput.fill(editedMealName);

    const editMealType = page.locator('[data-testid="edit-meal-type-select"]');
    await editMealType.selectOption('Dinner');

    const editCalInput = page.locator('[data-testid="edit-meal-calories-input"]');
    await editCalInput.fill('480');

    const editProInput = page.locator('[data-testid="edit-meal-protein-input"]');
    await editProInput.fill('42');

    const editCarbsInput = page.locator('[data-testid="edit-meal-carbs-input"]');
    await editCarbsInput.fill('50');

    const editFatInput = page.locator('[data-testid="edit-meal-fat-input"]');
    await editFatInput.fill('12');

    const editFiberInput = page.locator('[data-testid="edit-meal-fiber-input"]');
    await editFiberInput.fill('7');

    const editServingSize = page.locator('[data-testid="edit-meal-serving-size-input"]');
    await editServingSize.fill('1.5');

    const editServingUnit = page.locator('[data-testid="edit-meal-serving-unit-input"]');
    await editServingUnit.fill('bowls');

    // Save changes
    const saveBtn = page.locator('[data-testid="save-edit-meal-btn"]');
    await saveBtn.click();

    // Modal closes
    await expect(modal).not.toBeVisible();

    // Verify updated meal name and calories in timeline
    const editedRow = page.locator('[data-testid="meal-log-item"]').filter({ hasText: editedMealName });
    await expect(editedRow).toBeVisible();
    await expect(editedRow.locator('text=480 kcal')).toBeVisible();

    // 3. Navigate to /history, switch to Nutrition, and verify edit works there as well
    await safeGoto(page, '/history');
    await expect(page.locator('text=Workout History')).toBeVisible();

    const nutritionTab = page.locator('[data-testid="history-tab-nutrition"]');
    await nutritionTab.click();
    await expect(page.locator('text=Nutrition History')).toBeVisible();

    // Verify editedMealName is visible in history
    const historyRow = page.locator('[data-testid="meal-log-item"]').filter({ hasText: editedMealName });
    await expect(historyRow).toBeVisible();

    // Open the row's overflow menu, then pick Edit.
    await historyRow.locator('button[aria-haspopup="menu"]').click();
    const historyEditBtn = historyRow.locator('[role="menuitem"]', { hasText: 'Edit meal' });
    await expect(historyEditBtn).toBeVisible();
    await historyEditBtn.click();

    await expect(modal).toBeVisible();
    await expect(page.locator('[data-testid="edit-meal-name-input"]')).toHaveValue(editedMealName);

    // Change name in history
    await page.locator('[data-testid="edit-meal-name-input"]').fill(historyMealName);
    await page.locator('[data-testid="save-edit-meal-btn"]').click();

    await expect(modal).not.toBeVisible();
    await expect(page.locator('text=' + historyMealName).first()).toBeVisible();

    // Net-neutral: the name is unique per run, so this row would otherwise be
    // one more permanent addition per project per run. Deleting it here also
    // exercises delete from the history view, which nothing else covers.
    await deleteMealRow(page, historyMealName);
  });
});

