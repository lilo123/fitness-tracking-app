import { test, expect, type Page, type Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_4_ITEMS = {
  name: 'Grilled Salmon Dinner Plate',
  calories: 705,
  protein: 48.5,
  carbs: 53,
  fat: 32.5,
  fiber: 4.5,
  explanation: '380 kcal + 195 kcal + 45 kcal + 85 kcal = 705 kcal',
  items: [
    {
      name: 'Grilled Salmon Fillet with Lemon Butter Sauce',
      portion: '200 g',
      quantity: 200,
      unit: 'g',
      calories: 380,
      protein: 40,
      carbs: 2,
      fat: 22,
      fiber: 0,
    },
    {
      name: 'Steamed Jasmine Rice',
      portion: '150 g',
      quantity: 150,
      unit: 'g',
      calories: 195,
      protein: 4,
      carbs: 43,
      fat: 0.5,
      fiber: 0.5,
    },
    {
      name: 'Roasted Asparagus with Garlic',
      portion: '100 g',
      quantity: 100,
      unit: 'g',
      calories: 45,
      protein: 3,
      carbs: 5,
      fat: 2,
      fiber: 2.5,
    },
    {
      name: 'Mixed Green Salad with Olive Oil',
      portion: '80 g',
      quantity: 80,
      unit: 'g',
      calories: 85,
      protein: 1.5,
      carbs: 3,
      fat: 8,
      fiber: 1.5,
    },
  ],
};

const FIXTURE_1_ITEM = {
  name: 'Grilled Salmon Fillet with Lemon Butter Sauce',
  calories: 475,
  protein: 50,
  carbs: 2.5,
  fat: 27.5,
  fiber: 0,
  explanation: '475 kcal',
  items: [
    {
      name: 'Grilled Salmon Fillet with Lemon Butter Sauce',
      portion: '250 g',
      quantity: 250,
      unit: 'g',
      calories: 475,
      protein: 50,
      carbs: 2.5,
      fat: 27.5,
      fiber: 0,
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupPageAndLogin(page: Page) {
  page.on('dialog', async (d) => {
    await d.accept().catch(() => {});
  });

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
    const text = (postData.input || postData.text || postData.prompt || '').toLowerCase();
    const fixture = text.includes('1-item') || text.includes('single') ? FIXTURE_1_ITEM : FIXTURE_4_ITEMS;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(fixture),
    });
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'athlete@cybergym.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/workout');
  await page.goto('/nutrition');
  await page.waitForSelector("text=Today's Nutrition");
}

// Check 1 helper: Font sizes
async function checkFontSizes(surface: Locator) {
  return surface.evaluate((root) => {
    function isVis(el: Element): boolean {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    }

    function getSel(el: Element): string {
      if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList).slice(0, 2).join('.');
      return classes ? `${tag}.${classes}` : tag;
    }

    const offenders: Array<{ selector: string; text: string; fontSize: number }> = [];
    let minFontSize = Infinity;
    let minFontElement: { selector: string; text: string; fontSize: number } | null = null;

    const allEls = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of allEls) {
      if (!isVis(el)) continue;
      const s = window.getComputedStyle(el);

      let directText = '';
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent?.trim() || '';
          if (t) directText += (directText ? ' ' : '') + t;
        }
      }

      if (directText) {
        const fs = parseFloat(s.fontSize);
        if (!isNaN(fs)) {
          if (fs < minFontSize) {
            minFontSize = fs;
            minFontElement = { selector: getSel(el), text: directText.slice(0, 30), fontSize: fs };
          }
          if (fs < 12) {
            offenders.push({ selector: getSel(el), text: directText.slice(0, 30), fontSize: fs });
          }
        }
      }
    }

    return { minFontSize, minFontElement, offenders };
  });
}

// Check 2 helper: Tap targets
async function checkTapTargets(surface: Locator) {
  return surface.evaluate((root) => {
    function isVis(el: Element): boolean {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function getSel(el: Element): string {
      if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList).slice(0, 2).join('.');
      return classes ? `${tag}.${classes}` : tag;
    }

    const tapCandidates = Array.from(
      root.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="menuitem"], [tabindex]:not([tabindex="-1"])')
    );

    const tapsUnder48: Array<{ selector: string; text: string; width: number; height: number }> = [];
    const offendersUnder40: Array<{ selector: string; text: string; width: number; height: number }> = [];

    for (const el of tapCandidates) {
      if (!isVis(el)) continue;
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width * 10) / 10;
      const height = Math.round(r.height * 10) / 10;
      const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 25);
      const selector = getSel(el);

      if (width < 48 || height < 48) {
        tapsUnder48.push({ selector, text, width, height });
      }
      if (width < 40 || height < 40) {
        offendersUnder40.push({ selector, text, width, height });
      }
    }

    return { tapsUnder48, offendersUnder40 };
  });
}

// Check 3 helper: Clipping
async function checkClipping(surface: Locator) {
  return surface.evaluate((root) => {
    function isVis(el: Element): boolean {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    }

    function getSel(el: Element): string {
      if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList).slice(0, 2).join('.');
      return classes ? `${tag}.${classes}` : tag;
    }

    const clippedElements: Array<{
      selector: string;
      text: string;
      scrollWidth?: number;
      clientWidth?: number;
      scrollHeight?: number;
      clientHeight?: number;
      type: 'horizontal' | 'vertical';
    }> = [];

    const allEls = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of allEls) {
      if (!isVis(el)) continue;
      const s = window.getComputedStyle(el);

      // Inputs scroll horizontally by design, so exempt them from horizontal scrollWidth clipping check
      if (el.tagName !== 'INPUT' && el.scrollWidth > el.clientWidth + 1) {
        clippedElements.push({
          selector: getSel(el),
          text: (el.textContent || '').trim().slice(0, 40),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          type: 'horizontal',
        });
      }

      if (el.scrollHeight > el.clientHeight + 1 && ['hidden', 'auto', 'scroll'].includes(s.overflowY)) {
        clippedElements.push({
          selector: getSel(el),
          text: (el.textContent || '').trim().slice(0, 40),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          type: 'vertical',
        });
      }
    }

    return { clippedElements };
  });
}

// ---------------------------------------------------------------------------
// Surface A: Staged card with 4 items
// ---------------------------------------------------------------------------

test.describe('Surface A: Staged card with 4 items', () => {
  let page: Page;
  let cardLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);

    await page.fill('textarea[placeholder*="Describe what you ate"]', '4-item salmon dinner');
    await page.click('button:has-text("Analyze Meal")');
    cardLocator = page.locator('[data-testid="staged-meal-card"]');
    await expect(cardLocator).toBeVisible({ timeout: 15000 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('A: card height <= 500px', async () => {
    const cardBox = (await cardLocator.boundingBox())!;
    const firstRowBox = (await cardLocator.locator('[data-testid="component-row"]').first().boundingBox())!;
    const discardBtn = cardLocator.locator('button[aria-label="Discard staged meal"]');
    const actionRowBox = (await discardBtn.locator('..').boundingBox())!;

    const measurements = {
      test: 'A: card height <= 500px',
      surface: 'A',
      cardSelector: '[data-testid="staged-meal-card"]',
      card: {
        top: Math.round(cardBox.y * 10) / 10,
        bottom: Math.round((cardBox.y + cardBox.height) * 10) / 10,
        height: Math.round(cardBox.height * 10) / 10,
      },
      firstRow: {
        top: Math.round(firstRowBox.y * 10) / 10,
      },
      actionRow: {
        bottom: Math.round((actionRowBox.y + actionRowBox.height) * 10) / 10,
      },
      cardContainsFirstRowTop: cardBox.y <= firstRowBox.y + 0.5,
      cardContainsActionRowBottom: cardBox.y + cardBox.height >= actionRowBox.y + actionRowBox.height - 0.5,
      heightPass: cardBox.height <= 500,
    };
    console.log(JSON.stringify(measurements));

    // Card-height integrity assert: outermost container contains first row top and action row bottom
    expect(cardBox.y).toBeLessThanOrEqual(firstRowBox.y + 0.5);
    expect(cardBox.y + cardBox.height).toBeGreaterThanOrEqual(actionRowBox.y + actionRowBox.height - 0.5);

    // Height cap assert: <= 500px
    expect(cardBox.height).toBeLessThanOrEqual(500);
  });

  test('A: font >= 12px', async () => {
    const result = await checkFontSizes(cardLocator);
    console.log(
      JSON.stringify({
        test: 'A: font >= 12px',
        surface: 'A',
        minFontSize: result.minFontSize,
        minFontElement: result.minFontElement,
        offenders: result.offenders,
      })
    );

    expect(result.offenders, `Found fonts smaller than 12px: ${JSON.stringify(result.offenders)}`).toEqual([]);
  });

  test('A: taps >= 40px', async () => {
    const result = await checkTapTargets(cardLocator);
    console.log(
      JSON.stringify({
        test: 'A: taps >= 40px',
        surface: 'A',
        tapsUnder48: result.tapsUnder48,
        offendersUnder40: result.offendersUnder40,
      })
    );

    expect(
      result.offendersUnder40,
      `Found tap targets smaller than 40px: ${JSON.stringify(result.offendersUnder40)}`
    ).toEqual([]);
  });

  test('A: no clipping', async () => {
    const result = await checkClipping(cardLocator);
    console.log(
      JSON.stringify({
        test: 'A: no clipping',
        surface: 'A',
        clippedElements: result.clippedElements,
      })
    );

    expect(
      result.clippedElements,
      `Found clipped elements: ${JSON.stringify(result.clippedElements)}`
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Surface B: Staged card with 1 item
// ---------------------------------------------------------------------------

test.describe('Surface B: Staged card with 1 item', () => {
  let page: Page;
  let cardLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);

    await page.fill('textarea[placeholder*="Describe what you ate"]', 'single 1-item salmon');
    await page.click('button:has-text("Analyze Meal")');
    cardLocator = page.locator('[data-testid="staged-meal-card"]');
    await expect(cardLocator).toBeVisible({ timeout: 15000 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('B: card height <= 320px', async () => {
    const cardBox = (await cardLocator.boundingBox())!;
    const firstRowBox = (await cardLocator.locator('[data-testid="component-row"]').first().boundingBox())!;
    const discardBtn = cardLocator.locator('button[aria-label="Discard staged meal"]');
    const actionRowBox = (await discardBtn.locator('..').boundingBox())!;

    const measurements = {
      test: 'B: card height <= 320px',
      surface: 'B',
      cardSelector: '[data-testid="staged-meal-card"]',
      card: {
        top: Math.round(cardBox.y * 10) / 10,
        bottom: Math.round((cardBox.y + cardBox.height) * 10) / 10,
        height: Math.round(cardBox.height * 10) / 10,
      },
      firstRow: {
        top: Math.round(firstRowBox.y * 10) / 10,
      },
      actionRow: {
        bottom: Math.round((actionRowBox.y + actionRowBox.height) * 10) / 10,
      },
      cardContainsFirstRowTop: cardBox.y <= firstRowBox.y + 0.5,
      cardContainsActionRowBottom: cardBox.y + cardBox.height >= actionRowBox.y + actionRowBox.height - 0.5,
      heightPass: cardBox.height <= 320,
    };
    console.log(JSON.stringify(measurements));

    // Card-height integrity assert: outermost container contains first row top and action row bottom
    expect(cardBox.y).toBeLessThanOrEqual(firstRowBox.y + 0.5);
    expect(cardBox.y + cardBox.height).toBeGreaterThanOrEqual(actionRowBox.y + actionRowBox.height - 0.5);

    // Height cap assert: <= 320px
    expect(cardBox.height).toBeLessThanOrEqual(320);
  });

  test('B: font >= 12px', async () => {
    const result = await checkFontSizes(cardLocator);
    console.log(
      JSON.stringify({
        test: 'B: font >= 12px',
        surface: 'B',
        minFontSize: result.minFontSize,
        minFontElement: result.minFontElement,
        offenders: result.offenders,
      })
    );

    expect(result.offenders, `Found fonts smaller than 12px: ${JSON.stringify(result.offenders)}`).toEqual([]);
  });

  test('B: taps >= 40px', async () => {
    const result = await checkTapTargets(cardLocator);
    console.log(
      JSON.stringify({
        test: 'B: taps >= 40px',
        surface: 'B',
        tapsUnder48: result.tapsUnder48,
        offendersUnder40: result.offendersUnder40,
      })
    );

    expect(
      result.offendersUnder40,
      `Found tap targets smaller than 40px: ${JSON.stringify(result.offendersUnder40)}`
    ).toEqual([]);
  });

  test('B: no clipping', async () => {
    const result = await checkClipping(cardLocator);
    console.log(
      JSON.stringify({
        test: 'B: no clipping',
        surface: 'B',
        clippedElements: result.clippedElements,
      })
    );

    expect(
      result.clippedElements,
      `Found clipped elements: ${JSON.stringify(result.clippedElements)}`
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Surface C: Manual entry form
// ---------------------------------------------------------------------------

test.describe('Surface C: Manual entry form', () => {
  let page: Page;
  let formLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);

    const manualBtn = page.locator('button:has-text("Manual Entry")');
    await manualBtn.click();
    formLocator = page.locator('form').filter({ hasText: 'Manual Macro Logging' });
    await expect(formLocator).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('C: Log button reachable', async () => {
    const navLocator = page.locator('nav').filter({ has: page.locator('[data-testid="nav-nutrition"]') });
    const logBtnLocator = formLocator.locator('button[type="submit"]');

    // 1. Measure at rest
    const navBoxAtRest = (await navLocator.boundingBox())!;
    const logBoxAtRest = (await logBtnLocator.boundingBox())!;

    const atRest = {
      navTop: Math.round(navBoxAtRest.y * 10) / 10,
      logBtnTop: Math.round(logBoxAtRest.y * 10) / 10,
      logBtnBottom: Math.round((logBoxAtRest.y + logBoxAtRest.height) * 10) / 10,
      reachable: logBoxAtRest.y + logBoxAtRest.height <= navBoxAtRest.y && logBoxAtRest.y >= 0,
    };

    // 2. Measure after scrolling page to bottom
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);

    const navBoxScrolled = (await navLocator.boundingBox())!;
    const logBoxScrolled = (await logBtnLocator.boundingBox())!;

    const scrolled = {
      navTop: Math.round(navBoxScrolled.y * 10) / 10,
      logBtnTop: Math.round(logBoxScrolled.y * 10) / 10,
      logBtnBottom: Math.round((logBoxScrolled.y + logBoxScrolled.height) * 10) / 10,
      reachable: logBoxScrolled.y + logBoxScrolled.height <= navBoxScrolled.y && logBoxScrolled.y >= 0,
    };

    const measurements = {
      test: 'C: Log button reachable',
      surface: 'C',
      atRest,
      scrolled,
    };
    console.log(JSON.stringify(measurements));

    // Reset scroll back to top for subsequent tests
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);

    // Assert reachable at rest
    expect(
      atRest.logBtnBottom,
      `At rest: Log button bottom (${atRest.logBtnBottom}px) exceeds bottom-nav top (${atRest.navTop}px)`
    ).toBeLessThanOrEqual(atRest.navTop);
    expect(atRest.logBtnTop, `At rest: Log button top (${atRest.logBtnTop}px) < 0`).toBeGreaterThanOrEqual(0);

    // Assert reachable when scrolled
    expect(
      scrolled.logBtnBottom,
      `When scrolled: Log button bottom (${scrolled.logBtnBottom}px) exceeds bottom-nav top (${scrolled.navTop}px)`
    ).toBeLessThanOrEqual(scrolled.navTop);
    expect(scrolled.logBtnTop, `When scrolled: Log button top (${scrolled.logBtnTop}px) < 0`).toBeGreaterThanOrEqual(0);
  });

  test('C: font >= 12px', async () => {
    const result = await checkFontSizes(formLocator);
    console.log(
      JSON.stringify({
        test: 'C: font >= 12px',
        surface: 'C',
        minFontSize: result.minFontSize,
        minFontElement: result.minFontElement,
        offenders: result.offenders,
      })
    );

    expect(result.offenders, `Found fonts smaller than 12px: ${JSON.stringify(result.offenders)}`).toEqual([]);
  });

  test('C: taps >= 40px', async () => {
    const result = await checkTapTargets(formLocator);
    console.log(
      JSON.stringify({
        test: 'C: taps >= 40px',
        surface: 'C',
        tapsUnder48: result.tapsUnder48,
        offendersUnder40: result.offendersUnder40,
      })
    );

    expect(
      result.offendersUnder40,
      `Found tap targets smaller than 40px: ${JSON.stringify(result.offendersUnder40)}`
    ).toEqual([]);
  });

  test('C: no clipping', async () => {
    const result = await checkClipping(formLocator);
    console.log(
      JSON.stringify({
        test: 'C: no clipping',
        surface: 'C',
        clippedElements: result.clippedElements,
      })
    );

    expect(
      result.clippedElements,
      `Found clipped elements: ${JSON.stringify(result.clippedElements)}`
    ).toEqual([]);
  });
});
