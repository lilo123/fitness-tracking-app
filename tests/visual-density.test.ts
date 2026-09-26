import { test, expect, type Page, type Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_CUSTOM_DISHES = [
  {
    id: 'dish-1',
    user_id: 'test-user',
    name: 'Keto Bar',
    calories: 150,
    protein: 10,
    carbs: 5,
    fat: 10,
    fiber: 3,
    created_at: '2026-03-01T10:00:00Z',
    kind: 'dish',
    use_count: 20,
    notes: 'Low carb snack',
  },
  {
    id: 'dish-2',
    user_id: 'test-user',
    name: 'Raw Japonica Rice',
    calories: 180,
    protein: 3.5,
    carbs: 40,
    fat: 0.5,
    fiber: 1,
    created_at: '2026-03-02T10:00:00Z',
    kind: 'dish',
    use_count: 15,
    notes: null,
  },
  {
    id: 'dish-3',
    user_id: 'test-user',
    name: 'Very Long Dish Name For Protein Ice Cream Bowl With Extra Berries',
    calories: 665,
    protein: 84,
    carbs: 45,
    fat: 12,
    fiber: 6,
    created_at: '2026-03-03T10:00:00Z',
    kind: 'recipe',
    use_count: 12,
    notes: null,
  },
  {
    id: 'dish-4',
    user_id: 'test-user',
    name: 'Whey Protein Powder',
    calories: 140,
    protein: 24,
    carbs: 3,
    fat: 2,
    fiber: 1,
    created_at: '2026-03-04T10:00:00Z',
    kind: 'dish',
    use_count: 10,
    notes: null,
  },
  {
    id: 'dish-5',
    user_id: 'test-user',
    name: 'Beef Pho Broth with Protein and Fresh Herbs',
    calories: 310,
    protein: 40,
    carbs: 15,
    fat: 8,
    fiber: 2,
    created_at: '2026-03-05T10:00:00Z',
    kind: 'recipe',
    use_count: 8,
    notes: null,
  },
];

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

  await page.route('**/rest/v1/custom_dishes*', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'content-range': `0-${FIXTURE_CUSTOM_DISHES.length - 1}/${FIXTURE_CUSTOM_DISHES.length}`,
      },
      body: JSON.stringify(FIXTURE_CUSTOM_DISHES),
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

// Check helper: Staged card meal-type select chevron geometry (D27)
async function checkSelectChevronGeometry(card: Locator) {
  return await card.evaluate((cardEl) => {
    const select = cardEl.querySelector<HTMLSelectElement>('select[aria-label="Meal type"]');
    if (!select) throw new Error('Meal type select not found');

    const container = select.parentElement;
    const headerBorderB = cardEl.querySelector('.border-b');
    if (!container || container === headerBorderB) {
      throw new Error('Meal type select is not wrapped in a dedicated container (found direct child of header)');
    }

    const chevronSvg = container.querySelector<SVGElement>(':scope > svg, :scope svg');
    if (!chevronSvg) {
      throw new Error('Meal type select chevron SVG not found inside container');
    }

    const dishNameInput = cardEl.querySelector<HTMLInputElement>('[data-testid="dish-name-input"]');
    const inputRect = dishNameInput ? dishNameInput.getBoundingClientRect() : null;

    const selectRect = select.getBoundingClientRect();
    const selectStyle = window.getComputedStyle(select);
    const paddingLeft = parseFloat(selectStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(selectStyle.paddingRight) || 0;

    // Measure chevron computed styles to ensure not hidden or blocking clicks
    const cStyle = window.getComputedStyle(chevronSvg);
    const isChevronVisible = cStyle.display !== 'none' && cStyle.visibility !== 'hidden' && parseFloat(cStyle.opacity) > 0;
    const chevronOpacity = parseFloat(cStyle.opacity) || 0;
    const chevronPointerEvents = cStyle.pointerEvents;

    // Measure text width of ALL options using canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `${selectStyle.fontStyle} ${selectStyle.fontVariant} ${selectStyle.fontWeight} ${selectStyle.fontSize} ${selectStyle.fontFamily}`;
    }

    let maxTextWidth = 0;
    let longestOption = '';
    const optionWidths: Record<string, number> = {};
    for (let i = 0; i < select.options.length; i++) {
      const optText = select.options[i].text;
      const w = ctx ? ctx.measureText(optText).width : 0;
      optionWidths[optText] = w;
      if (w > maxTextWidth) {
        maxTextWidth = w;
        longestOption = optText;
      }
    }

    const selectedText = select.options[select.selectedIndex]?.text || '';
    const textWidth = ctx ? ctx.measureText(selectedText).width : 0;

    const cRect = chevronSvg.getBoundingClientRect();
    const chevronBox = { x: cRect.x, y: cRect.y, width: cRect.width, height: cRect.height, right: cRect.right, bottom: cRect.bottom };
    const rightInset = selectRect.right - cRect.right;
    const chevronOffsetLeft = cRect.left - selectRect.left;
    const selectCenterY = selectRect.top + selectRect.height / 2;
    const chevronCenterY = cRect.top + cRect.height / 2;
    const verticalDelta = Math.abs(selectCenterY - chevronCenterY);
    const isInside = cRect.left >= selectRect.left && cRect.right <= selectRect.right && cRect.top >= selectRect.top && cRect.bottom <= selectRect.bottom;
    const clearanceLongest = (chevronOffsetLeft - 2) - (paddingLeft + maxTextWidth);
    const noOverlapLongest = clearanceLongest >= 0;

    return {
      hasCustomChevron: true,
      isChevronVisible,
      chevronOpacity,
      chevronPointerEvents,
      chevronBox,
      selectBox: { x: selectRect.x, y: selectRect.y, width: selectRect.width, height: selectRect.height },
      inputBox: inputRect ? { x: inputRect.x, y: inputRect.y, width: inputRect.width, height: inputRect.height } : null,
      rightInset,
      verticalDelta,
      isInside,
      scrollWidth: select.scrollWidth,
      clientWidth: select.clientWidth,
      isClipped: select.scrollWidth > select.clientWidth,
      textWidth,
      maxTextWidth,
      longestOption,
      optionWidths,
      paddingLeft,
      paddingRight,
      chevronOffsetLeft,
      clearanceLongest,
      noOverlapLongest,
    };
  });
}

// Check helper: Breakdown header row height and Add item button geometry (D28)
async function checkBreakdownHeaderGeometry(card: Locator) {
  return await card.evaluate((cardEl) => {
    const addItemBtn = cardEl.querySelector<HTMLElement>('[data-testid="add-item-button"]');
    if (!addItemBtn) throw new Error('add-item-button not found');

    const headerRow = addItemBtn.parentElement;
    if (!headerRow) throw new Error('header row (add-item-button parent) not found');

    const headerRowRect = headerRow.getBoundingClientRect();
    const btnRect = addItemBtn.getBoundingClientRect();

    const headerLabel = headerRow.querySelector('span:not(.sr-only)');
    const labelRect = headerLabel ? headerLabel.getBoundingClientRect() : null;

    const firstRow = cardEl.querySelector('[data-testid="component-row"]');
    if (!firstRow) throw new Error('first component-row not found');
    const firstRowRect = firstRow.getBoundingClientRect();

    // Check intersection with header label
    let labelIntersectionArea = 0;
    if (labelRect) {
      const hOverlap = Math.max(0, Math.min(btnRect.right, labelRect.right) - Math.max(btnRect.left, labelRect.left));
      const vOverlap = Math.max(0, Math.min(btnRect.bottom, labelRect.bottom) - Math.max(btnRect.top, labelRect.top));
      labelIntersectionArea = hOverlap * vOverlap;
    }

    // Check intersection with first item row
    const hOverlapFirst = Math.max(0, Math.min(btnRect.right, firstRowRect.right) - Math.max(btnRect.left, firstRowRect.left));
    const vOverlapFirst = Math.max(0, Math.min(btnRect.bottom, firstRowRect.bottom) - Math.max(btnRect.top, firstRowRect.top));
    const firstRowIntersectionArea = hOverlapFirst * vOverlapFirst;

    const select = cardEl.querySelector<HTMLSelectElement>('select[aria-label="Meal type"]');
    const selectRect = select ? select.getBoundingClientRect() : null;

    // Check intersection with meal type select above
    let selectIntersectionArea = 0;
    if (selectRect) {
      const hOverlapSelect = Math.max(0, Math.min(btnRect.right, selectRect.right) - Math.max(btnRect.left, selectRect.left));
      const vOverlapSelect = Math.max(0, Math.min(btnRect.bottom, selectRect.bottom) - Math.max(btnRect.top, selectRect.top));
      selectIntersectionArea = hOverlapSelect * vOverlapSelect;
    }

    // Hit-testing at key points of the button to verify no occlusion or tap-stealing
    const pts = {
      top: { x: btnRect.left + btnRect.width / 2, y: btnRect.top },
      center: { x: btnRect.left + btnRect.width / 2, y: btnRect.top + btnRect.height / 2 },
      bottom: { x: btnRect.left + btnRect.width / 2, y: btnRect.bottom - 1 },
      topLeft: { x: btnRect.left + 2, y: btnRect.top + 2 },
      topRight: { x: btnRect.right - 2, y: btnRect.top + 2 },
      bottomLeft: { x: btnRect.left + 2, y: btnRect.bottom - 2 },
    };
    const hitResults: Record<string, { tag: string; isBtnOrDescendant: boolean }> = {};
    for (const [k, pt] of Object.entries(pts)) {
      const el = document.elementFromPoint(pt.x, pt.y);
      hitResults[k] = {
        tag: el?.tagName || '',
        isBtnOrDescendant: el === addItemBtn || (addItemBtn.contains(el)),
      };
    }

    // Hit-testing at center of select to verify button does not occlude select
    let selectCenterHit: { tag: string; isAddBtn: boolean } | null = null;
    if (selectRect) {
      const cx = selectRect.left + selectRect.width / 2;
      const cy = selectRect.top + selectRect.height / 2;
      const el = document.elementFromPoint(cx, cy);
      selectCenterHit = {
        tag: el?.tagName || '',
        isAddBtn: el === addItemBtn || (addItemBtn.contains(el)),
      };
    }

    // Button text vertical center vs header label vertical center alignment
    let btnTextRect: DOMRect | null = null;
    const walker = document.createTreeWalker(addItemBtn, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (textNode) {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      btnTextRect = range.getBoundingClientRect();
    }
    const labelCenterY = labelRect ? labelRect.top + labelRect.height / 2 : null;
    const btnTextCenterY = btnTextRect ? btnTextRect.top + btnTextRect.height / 2 : null;
    const textLabelDeltaY = (btnTextCenterY != null && labelCenterY != null)
      ? Math.round((btnTextCenterY - labelCenterY) * 10) / 10
      : null;

    const buttonText = addItemBtn.textContent?.trim() || '';
    const ariaLabel = addItemBtn.getAttribute('aria-label');
    const isClipped = addItemBtn.scrollWidth > addItemBtn.clientWidth + 1;

    return {
      headerRowHeight: Math.round(headerRowRect.height * 10) / 10,
      buttonWidth: Math.round(btnRect.width * 10) / 10,
      buttonHeight: Math.round(btnRect.height * 10) / 10,
      buttonText,
      ariaLabel,
      isClipped,
      buttonScrollWidth: addItemBtn.scrollWidth,
      buttonClientWidth: addItemBtn.clientWidth,
      labelIntersectionArea: Math.round(labelIntersectionArea * 10) / 10,
      firstRowIntersectionArea: Math.round(firstRowIntersectionArea * 10) / 10,
      selectIntersectionArea: Math.round(selectIntersectionArea * 10) / 10,
      hitResults,
      selectCenterHit,
      textLabelDeltaY,
      btnBox: { x: btnRect.x, y: btnRect.y, width: btnRect.width, height: btnRect.height },
      labelBox: labelRect ? { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height } : null,
      firstRowBox: { x: firstRowRect.x, y: firstRowRect.y, width: firstRowRect.width, height: firstRowRect.height },
    };
  });
}

// Check 1 helper: Font sizes
async function checkFontSizes(surface: Locator) {
  const result = await surface.evaluate((root) => {
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
    let candidateCount = 0;

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
        candidateCount++;
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

    return { minFontSize, minFontElement, offenders, candidateCount };
  });

  expect(result.candidateCount, 'checkFontSizes matched 0 text candidates').toBeGreaterThan(0);
  return result;
}

// Check 2 helper: Tap targets
async function checkTapTargets(surface: Locator) {
  const result = await surface.evaluate((root) => {
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
    let candidateCount = 0;

    for (const el of tapCandidates) {
      if (!isVis(el)) continue;
      candidateCount++;
      // Controls enclosed in a dedicated touch-target wrapper (e.g. D32 qty/unit box) measure the enclosing hit area
      const hitArea = el.matches('[data-testid="component-quantity-input"]')
        ? el.closest<HTMLElement>('[data-testid="component-quantity-field"]')
        : null;
      const r = hitArea ? hitArea.getBoundingClientRect() : el.getBoundingClientRect();
      const width = Math.round(r.width * 10) / 10;
      const height = Math.round(r.height * 10) / 10;
      const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 25);
      const selector = getSel(hitArea || el);

      if (width < 48 || height < 48) {
        tapsUnder48.push({ selector, text, width, height });
      }
      if (width < 40 || height < 40) {
        offendersUnder40.push({ selector, text, width, height });
      }
    }

    return { tapsUnder48, offendersUnder40, candidateCount };
  });

  expect(result.candidateCount, 'checkTapTargets matched 0 tap candidates').toBeGreaterThan(0);
  return result;
}

// Check 3 helper: Clipping
async function checkClipping(surface: Locator) {
  const result = await surface.evaluate((root) => {
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
    let candidateCount = 0;

    for (const el of allEls) {
      if (!isVis(el)) continue;
      candidateCount++;
      const s = window.getComputedStyle(el);

      // Exemption 1 (D19, D31): Staged-card meal-name input is exempt from horizontal scroll check
      const isStagedMealNameInput = el.getAttribute('data-testid') === 'dish-name-input';

      // Exemption 2 (D26): Quick Log dish names use CSS truncate with title attribute by design
      const isQuickLogDishName =
        Boolean(el.id && el.id.startsWith('dish-name-')) &&
        el.classList.contains('truncate');

      const isIntentionalTruncate = isStagedMealNameInput || isQuickLogDishName;

      if (el.tagName !== 'INPUT' && !isIntentionalTruncate && el.scrollWidth > el.clientWidth + 1) {
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

    return { clippedElements, candidateCount };
  });

  expect(result.candidateCount, 'checkClipping matched 0 candidate elements').toBeGreaterThan(0);
  return result;
}

// Check 4 helper: Wait for smooth scroll animation to settle across animation frames
async function waitForScrollSettled(page: Page, targetSelector: string = '[data-testid="staged-meal-card"]') {
  await page.evaluate(() => {
    delete (window as unknown as { __scrollSettleState?: unknown }).__scrollSettleState;
  });

  await page.waitForFunction(
    (sel) => {
      const w = window as unknown as {
        __scrollSettleState?: { y: number; top: number; count: number };
      };
      const target = sel ? document.querySelector(sel) : null;
      if (!target) return false;
      const top = target.getBoundingClientRect().top;
      const currentY = window.scrollY;

      if (!w.__scrollSettleState) {
        w.__scrollSettleState = { y: currentY, top, count: 0 };
        return false;
      }

      const yDiff = Math.abs(currentY - w.__scrollSettleState.y);
      const topDiff = Math.abs(top - w.__scrollSettleState.top);

      if (yDiff < 0.5 && topDiff < 0.5) {
        w.__scrollSettleState.count++;
      } else {
        w.__scrollSettleState.y = currentY;
        w.__scrollSettleState.top = top;
        w.__scrollSettleState.count = 0;
      }

      return w.__scrollSettleState.count >= 3;
    },
    targetSelector,
    { timeout: 5000 }
  );
}

// Check 4 helper: Wait for instant scroll position to reach target and settle across animation frames
async function waitForScrollPosition(page: Page, target: number | 'bottom') {
  await page.evaluate((tgt) => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const expectedY = tgt === 'bottom' ? maxScroll : Math.min(tgt, maxScroll);
    if (Math.abs(window.scrollY - expectedY) > 1) {
      window.scrollTo(0, expectedY);
    }
    delete (window as unknown as { __scrollPosState?: unknown }).__scrollPosState;
  }, target);

  await page.waitForFunction(
    (tgt) => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const expectedY = tgt === 'bottom' ? maxScroll : Math.min(tgt, maxScroll);
      const currentY = window.scrollY;

      const w = window as unknown as {
        __scrollPosState?: { y: number; count: number };
      };

      if (!w.__scrollPosState) {
        w.__scrollPosState = { y: currentY, count: 0 };
        return false;
      }

      const diffFromExpected = Math.abs(currentY - expectedY);
      const diffFromLast = Math.abs(currentY - w.__scrollPosState.y);

      if (diffFromExpected <= 1 && diffFromLast < 0.5) {
        w.__scrollPosState.count++;
      } else {
        w.__scrollPosState.y = currentY;
        w.__scrollPosState.count = 0;
      }

      return w.__scrollPosState.count >= 2;
    },
    target,
    { timeout: 5000, polling: 'raf' }
  );
}

// ---------------------------------------------------------------------------

// Check helper: Staged card item row qty/unit box geometry (D32)
async function checkQtyUnitBoxGeometry(card: Locator) {
  return await card.evaluate((cardEl) => {
    const itemRows = Array.from(cardEl.querySelectorAll<HTMLElement>('[data-testid="component-row"]'));
    return itemRows.map((row, idx) => {
      const rowRect = row.getBoundingClientRect();
      const hitArea = row.querySelector<HTMLElement>('[data-testid="component-quantity-field"]');
      const visibleBox = row.querySelector<HTMLElement>('[data-testid="component-quantity-box"]');
      const qtyInput = row.querySelector<HTMLInputElement>('[data-testid="component-quantity-input"]');
      const chipBtn = row.querySelector<HTMLElement>('[data-testid="unit-chip"]') || row.querySelector<HTMLElement>('button[aria-haspopup="dialog"]');
      const menuBtn = row.querySelector<HTMLElement>('[data-testid="component-actions"]');
      const macroRow = row.querySelector<HTMLElement>('[data-testid="component-macros"]');

      if (!hitArea || !visibleBox || !qtyInput || !macroRow || !menuBtn || !chipBtn) {
        throw new Error(`Missing elements on component row ${idx}: hitArea=${!!hitArea}, visibleBox=${!!visibleBox}, qtyInput=${!!qtyInput}, chipBtn=${!!chipBtn}, macroRow=${!!macroRow}, menuBtn=${!!menuBtn}`);
      }

      const hitRect = hitArea.getBoundingClientRect();
      const boxRect = visibleBox.getBoundingClientRect();
      const macroRect = macroRow.getBoundingClientRect();
      const menuRect = menuBtn.getBoundingClientRect();
      const inputRect = qtyInput.getBoundingClientRect();
      const chipRect = chipBtn.getBoundingClientRect();

      const gap = Math.round((macroRect.top - boxRect.bottom) * 10) / 10;

      // Check horizontal & vertical overlap between hitArea and menuBtn
      const hOverlap = Math.max(0, Math.min(hitRect.right, menuRect.right) - Math.max(hitRect.left, menuRect.left));
      const vOverlap = Math.max(0, Math.min(hitRect.bottom, menuRect.bottom) - Math.max(hitRect.top, menuRect.top));
      const hasMenuOverlap = hOverlap > 0 && vOverlap > 0;

      // Check overlap between chip hit box and menuBtn
      const chipHOverlap = Math.max(0, Math.min(chipRect.right, menuRect.right) - Math.max(chipRect.left, menuRect.left));
      const chipVOverlap = Math.max(0, Math.min(chipRect.bottom, menuRect.bottom) - Math.max(chipRect.top, menuRect.top));
      const hasChipMenuOverlap = chipHOverlap > 0 && chipVOverlap > 0;

      // elementFromPoint at top/bottom edges of 44px hit box over qty-number x-centre
      const qtyX = inputRect.left + inputRect.width / 2;
      const topQtyEl = document.elementFromPoint(qtyX, hitRect.top + 1);
      const bottomQtyEl = document.elementFromPoint(qtyX, hitRect.bottom - 1);

      const isTopResolved = topQtyEl === hitArea || topQtyEl === visibleBox || topQtyEl === qtyInput || (hitArea.contains(topQtyEl) && !chipBtn.contains(topQtyEl));
      const isBottomResolved = bottomQtyEl === hitArea || bottomQtyEl === visibleBox || bottomQtyEl === qtyInput || (hitArea.contains(bottomQtyEl) && !chipBtn.contains(bottomQtyEl));

      // elementFromPoint at top/bottom edges over chip's x-centre
      const chipX = chipRect.left + chipRect.width / 2;
      const topChipEl = document.elementFromPoint(chipX, hitRect.top + 1);
      const bottomChipEl = document.elementFromPoint(chipX, hitRect.bottom - 1);

      const isChipTopResolved = topChipEl === chipBtn || chipBtn.contains(topChipEl);
      const isChipBottomResolved = bottomChipEl === chipBtn || chipBtn.contains(bottomChipEl);

      return {
        idx,
        rowHeight: Math.round(rowRect.height * 10) / 10,
        visibleBoxHeight: Math.round(boxRect.height * 10) / 10,
        hitAreaHeight: Math.round(hitRect.height * 10) / 10,
        chipHeight: Math.round(chipRect.height * 10) / 10,
        gap,
        hasMenuOverlap,
        hasChipMenuOverlap,
        isTopResolved,
        isBottomResolved,
        isChipTopResolved,
        isChipBottomResolved,
      };
    });
  });
}

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
    await waitForScrollSettled(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('A: card height <= 480px', async () => {
    await waitForScrollSettled(page);
    const { cardBox, firstRowBox, actionRowBox } = await cardLocator.evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const firstRow = card.querySelector('[data-testid="component-row"]');
      if (!firstRow) throw new Error('first component-row not found in staged card');
      const firstRowRect = firstRow.getBoundingClientRect();
      const discardBtn = card.querySelector('button[aria-label="Discard staged meal"]');
      const actionRow = discardBtn ? discardBtn.parentElement : null;
      if (!actionRow) throw new Error('action row (Discard button parent) not found in staged card');
      const actionRowRect = actionRow.getBoundingClientRect();
      return {
        cardBox: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
        firstRowBox: { x: firstRowRect.x, y: firstRowRect.y, width: firstRowRect.width, height: firstRowRect.height },
        actionRowBox: { x: actionRowRect.x, y: actionRowRect.y, width: actionRowRect.width, height: actionRowRect.height },
      };
    });

    const measurements = {
      test: 'A: card height <= 480px',
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
      heightPass: cardBox.height <= 480,
    };
    console.log(JSON.stringify(measurements));

    // Card-height integrity assert: outermost container contains first row top and action row bottom
    expect(cardBox.y).toBeLessThanOrEqual(firstRowBox.y + 0.5);
    expect(cardBox.y + cardBox.height).toBeGreaterThanOrEqual(actionRowBox.y + actionRowBox.height - 0.5);

    // Height cap assert: <= 480px (tightened from 500px per D28)
    expect(cardBox.height).toBeLessThanOrEqual(480);
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

  test('A: column alignment, controls no overlap, and log button metrics at 390px', async () => {
    expect(page.viewportSize()?.width).toBe(390);
    await waitForScrollSettled(page);

    const result = await cardLocator.evaluate((card) => {
      const gridRows = Array.from(
        card.querySelectorAll<HTMLElement>(
          '[data-testid="component-macros"], [data-testid="staged-meal-totals-grid"], [data-testid="day-total-grid"]'
        )
      );

      const columnKeys = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
      const alignmentMismatches: Array<{
        column: string;
        rights: number[];
        diff: number;
      }> = [];

      for (const col of columnKeys) {
        const cellsForCol: HTMLElement[] = [];
        for (const row of gridRows) {
          const cell = row.querySelector<HTMLElement>(`[data-testid$="-${col}"]`);
          if (cell) {
            cellsForCol.push(cell);
          }
        }
        if (cellsForCol.length > 1) {
          const rights = cellsForCol.map((c) => Math.round(c.getBoundingClientRect().right * 10) / 10);
          const minRight = Math.min(...rights);
          const maxRight = Math.max(...rights);
          if (maxRight - minRight > 1.0) {
            alignmentMismatches.push({
              column: col,
              rights,
              diff: Math.round((maxRight - minRight) * 10) / 10,
            });
          }
        }
      }

      const items = Array.from(card.querySelectorAll<HTMLElement>('[data-testid="component-row"]'));
      const controlOverlaps: Array<{ idx: number; controlsBottom: number; macroTop: number; gap: number }> = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const controls = item.querySelector<HTMLElement>('[data-testid="component-right-cluster"]');
        const macroRow = item.querySelector<HTMLElement>('[data-testid="component-macros"]');
        if (controls && macroRow) {
          const cRect = controls.getBoundingClientRect();
          const mRect = macroRow.getBoundingClientRect();
          const gap = Math.round((mRect.top - cRect.bottom) * 10) / 10;
          if (cRect.bottom > mRect.top + 0.5) {
            controlOverlaps.push({
              idx: i,
              controlsBottom: Math.round(cRect.bottom * 10) / 10,
              macroTop: Math.round(mRect.top * 10) / 10,
              gap,
            });
          }
        }
      }

      const logBtn = card.querySelector<HTMLElement>('[data-testid="staged-card-actions"] button');
      const logSpan = logBtn ? logBtn.querySelector<HTMLElement>('span.truncate, span') : null;
      const logBtnMetrics = logBtn ? {
        btnScrollWidth: logBtn.scrollWidth,
        btnClientWidth: logBtn.clientWidth,
        spanScrollWidth: logSpan ? logSpan.scrollWidth : null,
        spanClientWidth: logSpan ? logSpan.clientWidth : null,
        text: logBtn.textContent?.trim() || '',
      } : null;

      return {
        gridRowCount: gridRows.length,
        alignmentMismatches,
        controlOverlaps,
        logBtnMetrics,
      };
    });

    console.log(
      JSON.stringify({
        test: 'A: column alignment, controls no overlap, and log button metrics at 390px',
        surface: 'A',
        alignmentMismatches: result.alignmentMismatches,
        controlOverlaps: result.controlOverlaps,
        logBtnMetrics: result.logBtnMetrics,
      })
    );

    expect(result.gridRowCount).toBeGreaterThanOrEqual(6);
    expect(result.alignmentMismatches).toEqual([]);
    expect(result.controlOverlaps).toEqual([]);
    if (result.logBtnMetrics && result.logBtnMetrics.spanScrollWidth !== null && result.logBtnMetrics.spanClientWidth !== null) {
      expect(result.logBtnMetrics.spanScrollWidth).toBeLessThanOrEqual(result.logBtnMetrics.spanClientWidth + 1);
    }
  });

  test('A: meal-type select chevron geometry at 390px and 700px', async () => {
    expect(page.viewportSize()?.width).toBe(390);
    await waitForScrollSettled(page);

    const result390 = await checkSelectChevronGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'A: meal-type select chevron geometry at 390px', surface: 'A', ...result390 }));
    expect(result390.hasCustomChevron, 'Meal type select must have a custom chevron icon at 390px').toBe(true);
    expect(result390.isChevronVisible, 'Chevron must be visible at 390px').toBe(true);
    expect(result390.chevronOpacity, 'Chevron computed opacity must be > 0 at 390px').toBeGreaterThan(0);
    expect(result390.chevronPointerEvents, 'Chevron pointer-events must be none at 390px').toBe('none');
    expect(result390.isInside, 'Chevron must be inside select border at 390px').toBe(true);
    expect(result390.rightInset, 'Chevron right inset must be >= 8px at 390px').toBeGreaterThanOrEqual(8);
    expect(result390.verticalDelta, 'Chevron must be vertically centered within +-2px at 390px').toBeLessThanOrEqual(2);
    expect(result390.isClipped, 'Select label must not be clipped at 390px').toBe(false);
    expect(result390.paddingLeft + result390.maxTextWidth, `No overlap between longest label (${result390.longestOption}) and chevron at 390px`).toBeLessThanOrEqual(result390.chevronOffsetLeft - 2);

    // Test at 700px viewport wrapped in try/finally to prevent viewport leak into subsequent tests
    try {
      await page.setViewportSize({ width: 700, height: 900 });
      await waitForScrollSettled(page);
      const result700 = await checkSelectChevronGeometry(cardLocator);
      console.log(JSON.stringify({ test: 'A: meal-type select chevron geometry at 700px', surface: 'A', ...result700 }));
      expect(result700.hasCustomChevron, 'Custom chevron icon must be present at 700px').toBe(true);
      expect(result700.isChevronVisible, 'Chevron must be visible at 700px').toBe(true);
      expect(result700.chevronOpacity, 'Chevron computed opacity must be > 0 at 700px').toBeGreaterThan(0);
      expect(result700.chevronPointerEvents, 'Chevron pointer-events must be none at 700px').toBe('none');
      expect(result700.isInside, 'Chevron must be inside select border at 700px').toBe(true);
      expect(result700.rightInset, 'Chevron right inset must be >= 8px at 700px').toBeGreaterThanOrEqual(8);
      expect(result700.verticalDelta, 'Chevron must be vertically centered within +-2px at 700px').toBeLessThanOrEqual(2);
      expect(result700.isClipped, 'Select label must not be clipped at 700px').toBe(false);
      expect(result700.paddingLeft + result700.maxTextWidth, `No overlap between longest label (${result700.longestOption}) and chevron at 700px`).toBeLessThanOrEqual(result700.chevronOffsetLeft - 2);
    } finally {
      // Restore viewport to 390x844
      await page.setViewportSize({ width: 390, height: 844 });
      await waitForScrollSettled(page);
    }
  });

  test('A: breakdown header row height <= 16px, Add item tap >= 40px, no overlap with label or first row at 390px', async () => {
    expect(page.viewportSize()?.width).toBe(390);
    await waitForScrollSettled(page);

    const result = await checkBreakdownHeaderGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'A: breakdown header geometry at 390px', surface: 'A', ...result }));

    // Header row height <= pre-D22 value (16px) with +0.5px tolerance max
    expect(result.headerRowHeight, `Header row height (${result.headerRowHeight}px) exceeds pre-D22 value 16px (+0.5px tolerance)`).toBeLessThanOrEqual(16.5);

    // D34: label text '+ Manual', aria-label 'Add manual item', no clip
    expect(result.buttonText, 'Breakdown header button label must be "+ Manual"').toBe('+ Manual');
    expect(result.ariaLabel, 'Breakdown header button aria-label must be "Add manual item"').toBe('Add manual item');
    expect(result.isClipped, 'Breakdown header button must fit with no clipping').toBe(false);

    // Add item tap box >= 40 tall and >= 40 wide
    expect(result.buttonHeight, `Add item tap height (${result.buttonHeight}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(result.buttonWidth, `Add item tap width (${result.buttonWidth}px) < 40px`).toBeGreaterThanOrEqual(40);

    // Add item box does not overlap the header label (rect intersection = 0)
    expect(result.labelIntersectionArea, `Add item button intersects header label with area ${result.labelIntersectionArea}px²`).toBe(0);

    // Add item box does not overlap the first item row (rect intersection = 0)
    expect(result.firstRowIntersectionArea, `Add item button intersects first item row with area ${result.firstRowIntersectionArea}px²`).toBe(0);

    // Add item box does not overlap the meal-type select above (rect intersection = 0)
    expect(result.selectIntersectionArea, `Add item button intersects meal type select with area ${result.selectIntersectionArea}px²`).toBe(0);

    // Hit-testing points on button hit the button (no tap stealing by adjacent elements)
    expect(result.hitResults.top.isBtnOrDescendant, 'Top edge of Add item button must hit button').toBe(true);
    expect(result.hitResults.center.isBtnOrDescendant, 'Center of Add item button must hit button').toBe(true);
    expect(result.hitResults.bottom.isBtnOrDescendant, 'Bottom edge of Add item button must hit button').toBe(true);

    // Select center must hit select, not add-item button
    if (result.selectCenterHit) {
      expect(result.selectCenterHit.isAddBtn, 'Center of meal type select must not be occluded by Add item button').toBe(false);
    }

    // Button text vertical center aligns with header label vertical center (within +-1px)
    expect(result.textLabelDeltaY).not.toBeNull();
    expect(Math.abs(result.textLabelDeltaY!), `Add item text center-Y deviates from label center-Y by ${result.textLabelDeltaY}px`).toBeLessThanOrEqual(1.0);
  });

  test('A: staged item row qty/unit box geometry and hit testing at 390px (D32)', async () => {
    await waitForScrollSettled(page);

    const rows = cardLocator.locator('[data-testid="component-row"]');
    const rowCount = await rows.count();
    expect(rowCount).toBe(4);

    const measurements = await checkQtyUnitBoxGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'A: qty/unit box D32 measurements at 390px', surface: 'A', measurements }));

    for (const m of measurements) {
      // visible border height 32 (+-1)
      expect(m.visibleBoxHeight, `Row ${m.idx} visible box height must be 32 +- 1`).toBeGreaterThanOrEqual(31);
      expect(m.visibleBoxHeight, `Row ${m.idx} visible box height must be 32 +- 1`).toBeLessThanOrEqual(33);

      // gap >= 4
      expect(m.gap, `Row ${m.idx} gap between visible box bottom and macro row must be >= 4px`).toBeGreaterThanOrEqual(4);

      // hit box >= 44 tall
      expect(m.hitAreaHeight, `Row ${m.idx} hit box height must be >= 44px`).toBeGreaterThanOrEqual(44);
      expect(m.chipHeight, `Row ${m.idx} chip hit box height must be >= 44px`).toBeGreaterThanOrEqual(44);

      // elementFromPoint at hit-box edges resolves into the qty control over qty-number x-centre
      expect(m.isTopResolved, `Row ${m.idx} top hit-box edge over qty resolves into qty control`).toBe(true);
      expect(m.isBottomResolved, `Row ${m.idx} bottom hit-box edge over qty resolves into qty control`).toBe(true);

      // elementFromPoint at y+1 and y+43 over chip's x-centre resolves to chip button
      expect(m.isChipTopResolved, `Row ${m.idx} elementFromPoint at y+1 over chip resolves to chip button`).toBe(true);
      expect(m.isChipBottomResolved, `Row ${m.idx} elementFromPoint at y+43 over chip resolves to chip button`).toBe(true);

      // no overlap with the ... hit box
      expect(m.hasMenuOverlap, `Row ${m.idx} hit area must not overlap ... menu`).toBe(false);
      expect(m.hasChipMenuOverlap, `Row ${m.idx} chip hit box must not overlap ... menu`).toBe(false);

      // item row height <= old value (62px)
      expect(m.rowHeight, `Row ${m.idx} height must be <= old value of 62px`).toBeLessThanOrEqual(62);
    }

    // Verify tapping over the chip's x-centre at y+1 and y+43 opens unit dialog
    const firstField = rows.first().locator('[data-testid="component-quantity-field"]');
    await firstField.click({ position: { x: 74, y: 1 } });
    const unitSheet = page.locator('[data-testid="unit-sheet"]');
    await expect(unitSheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(unitSheet).not.toBeVisible();

    await firstField.click({ position: { x: 74, y: 43 } });
    await expect(unitSheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(unitSheet).not.toBeVisible();

    // Verify tapping over qty-number x-centre (position { x: 20, y: 43 }) focuses the input
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const input = row.locator('[data-testid="component-quantity-input"]');
      const field = row.locator('[data-testid="component-quantity-field"]');

      await field.click({ position: { x: 20, y: 43 } });
      const focusedBottom = await input.evaluate((el) => document.activeElement === el);
      expect(focusedBottom, `Row ${i} click at y+43 over qty must focus the input`).toBe(true);

      await input.evaluate((el) => el.blur());
    }
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
    await waitForScrollSettled(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('B: card height <= 260px', async () => {
    await waitForScrollSettled(page);
    const { cardBox, firstRowBox, actionRowBox } = await cardLocator.evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const firstRow = card.querySelector('[data-testid="component-row"]');
      if (!firstRow) throw new Error('first component-row not found in staged card');
      const firstRowRect = firstRow.getBoundingClientRect();
      const discardBtn = card.querySelector('button[aria-label="Discard staged meal"]');
      const actionRow = discardBtn ? discardBtn.parentElement : null;
      if (!actionRow) throw new Error('action row (Discard button parent) not found in staged card');
      const actionRowRect = actionRow.getBoundingClientRect();
      return {
        cardBox: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
        firstRowBox: { x: firstRowRect.x, y: firstRowRect.y, width: firstRowRect.width, height: firstRowRect.height },
        actionRowBox: { x: actionRowRect.x, y: actionRowRect.y, width: actionRowRect.width, height: actionRowRect.height },
      };
    });

    const measurements = {
      test: 'B: card height <= 260px',
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
      heightPass: cardBox.height <= 260,
    };
    console.log(JSON.stringify(measurements));

    // Card-height integrity assert: outermost container contains first row top and action row bottom
    expect(cardBox.y).toBeLessThanOrEqual(firstRowBox.y + 0.5);
    expect(cardBox.y + cardBox.height).toBeGreaterThanOrEqual(actionRowBox.y + actionRowBox.height - 0.5);

    // Height cap assert: <= 260px
    expect(cardBox.height).toBeLessThanOrEqual(260);
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

  test('B: breakdown header row height <= 16px, + Manual button geometry at 390px (D34)', async () => {
    expect(page.viewportSize()?.width).toBe(390);
    await waitForScrollSettled(page);

    const result = await checkBreakdownHeaderGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'B: breakdown header geometry at 390px', surface: 'B', ...result }));

    expect(result.headerRowHeight, `Header row height (${result.headerRowHeight}px) exceeds 16px (+0.5px tolerance)`).toBeLessThanOrEqual(16.5);
    expect(result.buttonText, 'Breakdown header button label must be "+ Manual"').toBe('+ Manual');
    expect(result.ariaLabel, 'Breakdown header button aria-label must be "Add manual item"').toBe('Add manual item');
    expect(result.isClipped, 'Breakdown header button must fit with no clipping').toBe(false);
    expect(result.buttonHeight, `+ Manual button tap height (${result.buttonHeight}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(result.buttonWidth, `+ Manual button tap width (${result.buttonWidth}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(result.labelIntersectionArea, `+ Manual button intersects header label with area ${result.labelIntersectionArea}px²`).toBe(0);
    expect(result.firstRowIntersectionArea, `+ Manual button intersects first item row with area ${result.firstRowIntersectionArea}px²`).toBe(0);
    expect(result.selectIntersectionArea, `+ Manual button intersects meal type select with area ${result.selectIntersectionArea}px²`).toBe(0);
    expect(result.hitResults.top.isBtnOrDescendant, 'Top edge of + Manual button must hit button').toBe(true);
    expect(result.hitResults.center.isBtnOrDescendant, 'Center of + Manual button must hit button').toBe(true);
    expect(result.hitResults.bottom.isBtnOrDescendant, 'Bottom edge of + Manual button must hit button').toBe(true);
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
    await waitForScrollPosition(page, 'bottom');
    await expect(logBtnLocator).toBeVisible();
    await expect(navLocator).toBeVisible();

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
    await waitForScrollPosition(page, 0);
    await expect(formLocator).toBeVisible();

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

// ---------------------------------------------------------------------------
// Surface D: staged card placement (D10)
// ---------------------------------------------------------------------------

test.describe('Surface D: staged card placement (D10)', () => {
  let page: Page;
  let cardLocator: Locator;
  let navLocator: Locator;
  let actionRowLocator: Locator;

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
    await waitForScrollSettled(page);

    const discardBtn = cardLocator.locator('button[aria-label="Discard staged meal"]');
    actionRowLocator = discardBtn.locator('..');
    navLocator = page.locator('nav').filter({ has: page.locator('[data-testid="nav-nutrition"]') });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('D1: after staging card top in [0, 200]', async () => {
    // Wait for smooth scroll to settle
    await waitForScrollSettled(page);

    const cardBox = (await cardLocator.boundingBox())!;
    const cardTop = Math.round(cardBox.y * 10) / 10;

    const measurements = {
      test: 'D1: after staging card top in [0, 200]',
      surface: 'D',
      cardTop,
      inRange: cardTop >= 0 && cardTop <= 200,
    };
    console.log(JSON.stringify(measurements));

    expect(cardTop, `Card top (${cardTop}px) must be >= 0`).toBeGreaterThanOrEqual(0);
    expect(cardTop, `Card top (${cardTop}px) must be <= 200`).toBeLessThanOrEqual(200);
  });

  test('D2: action row visible above nav at staging and mid scroll', async () => {
    // 1. Right after staging
    const navBoxAtStaging = (await navLocator.boundingBox())!;
    const actionBoxAtStaging = (await actionRowLocator.boundingBox())!;

    const atStaging = {
      navTop: Math.round(navBoxAtStaging.y * 10) / 10,
      actionRowTop: Math.round(actionBoxAtStaging.y * 10) / 10,
      actionRowBottom: Math.round((actionBoxAtStaging.y + actionBoxAtStaging.height) * 10) / 10,
      actionRowBottomLteNavTop:
        Math.round((actionBoxAtStaging.y + actionBoxAtStaging.height) * 10) / 10 <=
        Math.round(navBoxAtStaging.y * 10) / 10,
      actionRowTopGteZero: actionBoxAtStaging.y >= 0,
    };

    // 2. After scrolling to the middle
    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    await page.evaluate((y) => window.scrollTo(0, y), maxScroll / 2);
    await waitForScrollPosition(page, maxScroll / 2);
    await expect(actionRowLocator).toBeVisible();
    await expect(navLocator).toBeVisible();

    const navBoxMid = (await navLocator.boundingBox())!;
    const actionBoxMid = (await actionRowLocator.boundingBox())!;

    const midScroll = {
      navTop: Math.round(navBoxMid.y * 10) / 10,
      actionRowTop: Math.round(actionBoxMid.y * 10) / 10,
      actionRowBottom: Math.round((actionBoxMid.y + actionBoxMid.height) * 10) / 10,
      actionRowBottomLteNavTop:
        Math.round((actionBoxMid.y + actionBoxMid.height) * 10) / 10 <=
        Math.round(navBoxMid.y * 10) / 10,
      actionRowTopGteZero: actionBoxMid.y >= 0,
    };

    const measurements = {
      test: 'D2: action row visible above nav at staging and mid scroll',
      surface: 'D',
      atStaging,
      midScroll,
    };
    console.log(JSON.stringify(measurements));

    // Reset scroll back for subsequent measurements
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForScrollPosition(page, 0);
    await expect(cardLocator).toBeVisible();

    expect(
      atStaging.actionRowBottom,
      `At staging: Action row bottom (${atStaging.actionRowBottom}px) exceeds nav top (${atStaging.navTop}px)`
    ).toBeLessThanOrEqual(atStaging.navTop);
    expect(
      atStaging.actionRowTop,
      `At staging: Action row top (${atStaging.actionRowTop}px) < 0`
    ).toBeGreaterThanOrEqual(0);

    expect(
      midScroll.actionRowBottom,
      `Mid scroll: Action row bottom (${midScroll.actionRowBottom}px) exceeds nav top (${midScroll.navTop}px)`
    ).toBeLessThanOrEqual(midScroll.navTop);
    expect(
      midScroll.actionRowTop,
      `Mid scroll: Action row top (${midScroll.actionRowTop}px) < 0`
    ).toBeGreaterThanOrEqual(0);
  });

  test('D3: last row not covered at end of scroll', async () => {
    // Scroll page to end
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await waitForScrollPosition(page, 'bottom');
    const lastRowLocator = cardLocator.locator('[data-testid="staged-meal-day-total"]');
    await expect(lastRowLocator).toBeVisible();
    await expect(actionRowLocator).toBeVisible();
    await expect(navLocator).toBeVisible();

    const lastRowBox = (await lastRowLocator.boundingBox())!;
    const actionBoxEnd = (await actionRowLocator.boundingBox())!;
    const navBoxEnd = (await navLocator.boundingBox())!;

    const lastRowBottom = Math.round((lastRowBox.y + lastRowBox.height) * 10) / 10;
    const actionRowTop = Math.round(actionBoxEnd.y * 10) / 10;
    const navTop = Math.round(navBoxEnd.y * 10) / 10;

    const measurements = {
      test: 'D3: last row not covered at end of scroll',
      surface: 'D',
      lastRowBottom,
      actionRowTop,
      navTop,
      lastRowLteActionRowTop: lastRowBottom <= actionRowTop,
      lastRowLteNavTop: lastRowBottom <= navTop,
    };
    console.log(JSON.stringify(measurements));

    // Reset scroll back
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForScrollPosition(page, 0);
    await expect(cardLocator).toBeVisible();

    expect(
      lastRowBottom,
      `Last row bottom (${lastRowBottom}px) exceeds action row top (${actionRowTop}px)`
    ).toBeLessThanOrEqual(actionRowTop);
    expect(
      lastRowBottom,
      `Last row bottom (${lastRowBottom}px) exceeds nav top (${navTop}px)`
    ).toBeLessThanOrEqual(navTop);
  });

  test('D4: D1 with reducedMotion reduce emulated', async () => {
    // Discard current staged meal
    await cardLocator.locator('button[aria-label="Discard staged meal"]').click();
    await expect(cardLocator).not.toBeVisible();

    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    try {
      // Staged card replaces AI input again
      await page.click('button:has-text("Analyze Meal")');
      await expect(cardLocator).toBeVisible({ timeout: 15000 });
      await waitForScrollSettled(page);

      const cardBox = (await cardLocator.boundingBox())!;
      const cardTop = Math.round(cardBox.y * 10) / 10;

      const measurements = {
        test: 'D4: D1 with reducedMotion reduce emulated',
        surface: 'D',
        cardTop,
        inRange: cardTop >= 0 && cardTop <= 200,
      };
      console.log(JSON.stringify(measurements));

      expect(cardTop, `Reduced motion card top (${cardTop}px) must be >= 0`).toBeGreaterThanOrEqual(0);
      expect(cardTop, `Reduced motion card top (${cardTop}px) must be <= 200`).toBeLessThanOrEqual(200);
    } finally {
      await page.emulateMedia({ reducedMotion: null });
    }
  });

  test('D5: page end content not covered by nav', async () => {
    const navBox = (await navLocator.boundingBox())!;
    const navTop = Math.round(navBox.y * 10) / 10;

    const findBottomMostContentBottom = async () => {
      return page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) return null;
        const nav = document.querySelector('nav');
        const all = Array.from(main.querySelectorAll('*'));
        let maxBottom = -Infinity;

        for (const el of all) {
          if (nav && nav.contains(el)) continue;
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') continue;
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (rect.bottom > maxBottom) {
            maxBottom = rect.bottom;
          }
        }
        return Math.round(maxBottom * 10) / 10;
      });
    };

    // Measurement 1: with a staged 4-item card
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await waitForScrollPosition(page, 'bottom');
    await expect(actionRowLocator).toBeVisible();
    await expect(navLocator).toBeVisible();

    const stagedLastContentBottom = (await findBottomMostContentBottom())!;
    const actionBoxEnd = (await actionRowLocator.boundingBox())!;
    const actionRowTop = Math.round(actionBoxEnd.y * 10) / 10;
    const actionRowBottom = Math.round((actionBoxEnd.y + actionBoxEnd.height) * 10) / 10;

    const actionRowFullyVisibleOrAbove =
      (actionRowBottom <= navTop && actionRowTop >= 0) || actionRowBottom <= 0;

    const stagedMeasurement = {
      stagedLastContentBottom,
      navTop,
      actionRowTop,
      actionRowBottom,
      actionRowFullyVisibleOrAbove,
      contentNotCovered: stagedLastContentBottom <= navTop,
    };

    // Measurement 2: with nothing staged
    await cardLocator.locator('button[aria-label="Discard staged meal"]').click();
    await expect(cardLocator).not.toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await waitForScrollPosition(page, 'bottom');
    await expect(navLocator).toBeVisible();

    const unstagedLastContentBottom = (await findBottomMostContentBottom())!;

    const unstagedMeasurement = {
      unstagedLastContentBottom,
      navTop,
      contentNotCovered: unstagedLastContentBottom <= navTop,
    };

    const measurements = {
      test: 'D5: page end content not covered by nav',
      surface: 'D',
      staged: stagedMeasurement,
      unstaged: unstagedMeasurement,
    };
    console.log(JSON.stringify(measurements));

    expect(
      stagedLastContentBottom,
      `Staged case: last content bottom (${stagedLastContentBottom}px) exceeds nav top (${navTop}px)`
    ).toBeLessThanOrEqual(navTop);

    expect(
      actionRowBottom,
      `Staged case: action row bottom (${actionRowBottom}px) exceeds nav top (${navTop}px)`
    ).toBeLessThanOrEqual(navTop);

    expect(
      actionRowFullyVisibleOrAbove,
      `Staged case: action row (top: ${actionRowTop}px, bottom: ${actionRowBottom}px) must be fully visible above nav (navTop: ${navTop}px) or fully scrolled above viewport`
    ).toBe(true);

    expect(
      unstagedLastContentBottom,
      `Unstaged case: last content bottom (${unstagedLastContentBottom}px) exceeds nav top (${navTop}px)`
    ).toBeLessThanOrEqual(navTop);
  });
});


// ---------------------------------------------------------------------------
// Surface E: Staged card at 320px width (D24)
// ---------------------------------------------------------------------------

test.describe('Surface E: Staged card at 320px width (D24)', () => {
  let page: Page;
  let cardLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 320, height: 844 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);

    await page.fill('textarea[placeholder*="Describe what you ate"]', '4-item salmon dinner');
    await page.click('button:has-text("Analyze Meal")');
    cardLocator = page.locator('[data-testid="staged-meal-card"]');
    await expect(cardLocator).toBeVisible({ timeout: 15000 });
    await waitForScrollSettled(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('E: macro cells inside card content box, no row scroll overflow, columns aligned', async () => {
    expect(page.viewportSize()?.width).toBe(320);
    await waitForScrollSettled(page);

    const result = await cardLocator.evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardStyle = window.getComputedStyle(card);
      const paddingRight = parseFloat(cardStyle.paddingRight) || 0;
      const borderRight = parseFloat(cardStyle.borderRightWidth) || 0;
      const contentBoxRight = cardRect.right - paddingRight - borderRight;

      const gridRows = Array.from(
        card.querySelectorAll<HTMLElement>(
          '[data-testid="component-macros"], [data-testid="staged-meal-totals-grid"], [data-testid="day-total-grid"]'
        )
      );

      const macroCells = gridRows.flatMap((row) =>
        Array.from(row.children as HTMLCollectionOf<HTMLElement>).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        })
      );

      const cellOverflows: Array<{ testId: string; cellRight: number; contentBoxRight: number; overflow: number }> = [];
      for (const cell of macroCells) {
        const r = cell.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > contentBoxRight + 0.5) {
          cellOverflows.push({
            testId: cell.getAttribute('data-testid') || cell.className,
            cellRight: Math.round(r.right * 10) / 10,
            contentBoxRight: Math.round(contentBoxRight * 10) / 10,
            overflow: Math.round((r.right - contentBoxRight) * 10) / 10,
          });
        }
      }

      const rowScrollOverflows: Array<{ rowTestId: string; scrollWidth: number; clientWidth: number }> = [];
      for (const row of gridRows) {
        if (row.scrollWidth > row.clientWidth + 1) {
          rowScrollOverflows.push({
            rowTestId: row.getAttribute('data-testid') || '',
            scrollWidth: row.scrollWidth,
            clientWidth: row.clientWidth,
          });
        }
      }

      const columnKeys = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
      const alignmentMismatches: Array<{
        column: string;
        rights: number[];
        minRight: number;
        maxRight: number;
        diff: number;
      }> = [];

      for (const col of columnKeys) {
        const cellsForCol: HTMLElement[] = [];
        for (const row of gridRows) {
          const cell = row.querySelector<HTMLElement>(`[data-testid$="-${col}"]`);
          if (cell) {
            cellsForCol.push(cell);
          }
        }
        if (cellsForCol.length > 1) {
          const rights = cellsForCol.map((c) => Math.round(c.getBoundingClientRect().right * 10) / 10);
          const minRight = Math.min(...rights);
          const maxRight = Math.max(...rights);
          if (maxRight - minRight > 1.0) {
            alignmentMismatches.push({
              column: col,
              rights,
              minRight,
              maxRight,
              diff: Math.round((maxRight - minRight) * 10) / 10,
            });
          }
        }
      }

      // 44px change controls vs macro row below: no intersection
      const items = Array.from(card.querySelectorAll<HTMLElement>('[data-testid="component-row"]'));
      const controlOverlaps: Array<{ idx: number; controlsBottom: number; macroTop: number; gap: number }> = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const controls = item.querySelector<HTMLElement>('[data-testid="component-right-cluster"]');
        const macroRow = item.querySelector<HTMLElement>('[data-testid="component-macros"]');
        if (controls && macroRow) {
          const cRect = controls.getBoundingClientRect();
          const mRect = macroRow.getBoundingClientRect();
          const gap = Math.round((mRect.top - cRect.bottom) * 10) / 10;
          if (cRect.bottom > mRect.top + 0.5) {
            controlOverlaps.push({
              idx: i,
              controlsBottom: Math.round(cRect.bottom * 10) / 10,
              macroTop: Math.round(mRect.top * 10) / 10,
              gap,
            });
          }
        }
      }

      // Log button label metrics at 320
      const logBtn = card.querySelector<HTMLElement>('[data-testid="staged-card-actions"] button');
      const logSpan = logBtn ? logBtn.querySelector<HTMLElement>('span.truncate, span') : null;
      const logBtnMetrics = logBtn ? {
        btnScrollWidth: logBtn.scrollWidth,
        btnClientWidth: logBtn.clientWidth,
        spanScrollWidth: logSpan ? logSpan.scrollWidth : null,
        spanClientWidth: logSpan ? logSpan.clientWidth : null,
        text: logBtn.textContent?.trim() || '',
      } : null;

      return {
        cardWidth: Math.round(cardRect.width * 10) / 10,
        cardHeight: Math.round(cardRect.height * 10) / 10,
        rowHeights: items.map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10),
        contentBoxRight: Math.round(contentBoxRight * 10) / 10,
        cellOverflows,
        rowScrollOverflows,
        alignmentMismatches,
        gridRowCount: gridRows.length,
        macroCellCount: macroCells.length,
        controlOverlaps,
        logBtnMetrics,
      };
    });

    console.log(
      JSON.stringify({
        test: 'E: macro cells inside card content box, no row scroll overflow, columns aligned',
        surface: 'E',
        cardWidth: result.cardWidth,
        cardHeight: result.cardHeight,
        rowHeights: result.rowHeights,
        contentBoxRight: result.contentBoxRight,
        cellOverflowCount: result.cellOverflows.length,
        cellOverflows: result.cellOverflows,
        rowScrollOverflows: result.rowScrollOverflows,
        alignmentMismatches: result.alignmentMismatches,
        gridRowCount: result.gridRowCount,
        macroCellCount: result.macroCellCount,
        controlOverlaps: result.controlOverlaps,
        logBtnMetrics: result.logBtnMetrics,
      })
    );

    // Count asserts ensuring selectors do not pass vacuously
    expect(result.gridRowCount).toBeGreaterThanOrEqual(6);
    expect(result.macroCellCount).toBeGreaterThanOrEqual(20);

    expect(
      result.cellOverflows,
      `Found macro cells overflowing card content-box right: ${JSON.stringify(result.cellOverflows)}`
    ).toEqual([]);

    expect(
      result.rowScrollOverflows,
      `Found grid rows with scrollWidth > clientWidth: ${JSON.stringify(result.rowScrollOverflows)}`
    ).toEqual([]);

    expect(
      result.alignmentMismatches,
      `Found misaligned columns across rows: ${JSON.stringify(result.alignmentMismatches)}`
    ).toEqual([]);

    expect(
      result.controlOverlaps,
      `Found controls overlapping macro row below: ${JSON.stringify(result.controlOverlaps)}`
    ).toEqual([]);

    if (result.logBtnMetrics && result.logBtnMetrics.spanScrollWidth !== null && result.logBtnMetrics.spanClientWidth !== null) {
      expect(
        result.logBtnMetrics.spanScrollWidth,
        `Log button text clipped: scrollWidth ${result.logBtnMetrics.spanScrollWidth} > clientWidth ${result.logBtnMetrics.spanClientWidth}`
      ).toBeLessThanOrEqual(result.logBtnMetrics.spanClientWidth + 1);
    }
  });

  test('E: meal-type select chevron geometry at 320px', async () => {
    expect(page.viewportSize()?.width).toBe(320);
    await waitForScrollSettled(page);

    const result320 = await checkSelectChevronGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'E: meal-type select chevron geometry at 320px', surface: 'E', ...result320 }));
    expect(result320.hasCustomChevron, 'Meal type select must have a custom chevron icon at 320px').toBe(true);
    expect(result320.isChevronVisible, 'Chevron must be visible at 320px').toBe(true);
    expect(result320.chevronOpacity, 'Chevron computed opacity must be > 0 at 320px').toBeGreaterThan(0);
    expect(result320.chevronPointerEvents, 'Chevron pointer-events must be none at 320px').toBe('none');
    expect(result320.isInside, 'Chevron must be inside select border at 320px').toBe(true);
    expect(result320.rightInset, 'Chevron right inset must be >= 8px at 320px').toBeGreaterThanOrEqual(8);
    expect(result320.verticalDelta, 'Chevron must be vertically centered within +-2px at 320px').toBeLessThanOrEqual(2);
    expect(result320.isClipped, 'Select label must not be clipped at 320px').toBe(false);
    expect(result320.paddingLeft + result320.maxTextWidth, `No overlap between longest label (${result320.longestOption}) and chevron at 320px`).toBeLessThanOrEqual(result320.chevronOffsetLeft - 2);
  });

  test('E: breakdown header row height <= 16px, Add item tap >= 40px, no overlap with label or first row at 320px', async () => {
    expect(page.viewportSize()?.width).toBe(320);
    await waitForScrollSettled(page);

    const result = await checkBreakdownHeaderGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'E: breakdown header geometry at 320px', surface: 'E', ...result }));

    // D34: label text '+ Manual', aria-label 'Add manual item', no clip
    expect(result.buttonText, 'Breakdown header button label must be "+ Manual"').toBe('+ Manual');
    expect(result.ariaLabel, 'Breakdown header button aria-label must be "Add manual item"').toBe('Add manual item');
    expect(result.isClipped, 'Breakdown header button must fit with no clipping').toBe(false);

    // Header row height <= pre-D22 value (16px) with +0.5px tolerance max
    expect(result.headerRowHeight, `Header row height (${result.headerRowHeight}px) exceeds pre-D22 value 16px (+0.5px tolerance)`).toBeLessThanOrEqual(16.5);

    // Add item tap box >= 40 tall and >= 40 wide
    expect(result.buttonHeight, `Add item tap height (${result.buttonHeight}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(result.buttonWidth, `Add item tap width (${result.buttonWidth}px) < 40px`).toBeGreaterThanOrEqual(40);

    // Add item box does not overlap the header label (rect intersection = 0)
    expect(result.labelIntersectionArea, `Add item button intersects header label with area ${result.labelIntersectionArea}px²`).toBe(0);

    // Add item box does not overlap the first item row (rect intersection = 0)
    expect(result.firstRowIntersectionArea, `Add item button intersects first item row with area ${result.firstRowIntersectionArea}px²`).toBe(0);

    // Add item box does not overlap the meal-type select above (rect intersection = 0)
    expect(result.selectIntersectionArea, `Add item button intersects meal type select with area ${result.selectIntersectionArea}px²`).toBe(0);

    // Hit-testing points on button hit the button (no tap stealing by adjacent elements)
    expect(result.hitResults.top.isBtnOrDescendant, 'Top edge of Add item button must hit button').toBe(true);
    expect(result.hitResults.center.isBtnOrDescendant, 'Center of Add item button must hit button').toBe(true);
    expect(result.hitResults.bottom.isBtnOrDescendant, 'Bottom edge of Add item button must hit button').toBe(true);

    // Select center must hit select, not add-item button
    if (result.selectCenterHit) {
      expect(result.selectCenterHit.isAddBtn, 'Center of meal type select must not be occluded by Add item button').toBe(false);
    }

    // Button text vertical center aligns with header label vertical center (within +-1px)
    expect(result.textLabelDeltaY).not.toBeNull();
    expect(Math.abs(result.textLabelDeltaY!), `Add item text center-Y deviates from label center-Y by ${result.textLabelDeltaY}px`).toBeLessThanOrEqual(1.0);
  });

  test('E: staged item row qty/unit box geometry and hit testing at 320px (D32)', async () => {
    expect(page.viewportSize()?.width).toBe(320);
    await waitForScrollSettled(page);

    const rows = cardLocator.locator('[data-testid="component-row"]');
    const rowCount = await rows.count();
    expect(rowCount).toBe(4);

    const measurements = await checkQtyUnitBoxGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'E: qty/unit box D32 measurements at 320px', surface: 'E', measurements }));

    for (const m of measurements) {
      // visible border height 32 (+-1)
      expect(m.visibleBoxHeight, `Row ${m.idx} visible box height must be 32 +- 1`).toBeGreaterThanOrEqual(31);
      expect(m.visibleBoxHeight, `Row ${m.idx} visible box height must be 32 +- 1`).toBeLessThanOrEqual(33);

      // gap >= 4
      expect(m.gap, `Row ${m.idx} gap between visible box bottom and macro row must be >= 4px`).toBeGreaterThanOrEqual(4);

      // hit box >= 44 tall
      expect(m.hitAreaHeight, `Row ${m.idx} hit box height must be >= 44px`).toBeGreaterThanOrEqual(44);
      expect(m.chipHeight, `Row ${m.idx} chip hit box height must be >= 44px`).toBeGreaterThanOrEqual(44);

      // elementFromPoint at hit-box edges resolves into the qty control over qty-number x-centre
      expect(m.isTopResolved, `Row ${m.idx} top hit-box edge over qty resolves into qty control`).toBe(true);
      expect(m.isBottomResolved, `Row ${m.idx} bottom hit-box edge over qty resolves into qty control`).toBe(true);

      // elementFromPoint at y+1 and y+43 over chip's x-centre resolves to chip button
      expect(m.isChipTopResolved, `Row ${m.idx} elementFromPoint at y+1 over chip resolves to chip button`).toBe(true);
      expect(m.isChipBottomResolved, `Row ${m.idx} elementFromPoint at y+43 over chip resolves to chip button`).toBe(true);

      // no overlap with the ... hit box
      expect(m.hasMenuOverlap, `Row ${m.idx} hit area must not overlap ... menu`).toBe(false);
      expect(m.hasChipMenuOverlap, `Row ${m.idx} chip hit box must not overlap ... menu`).toBe(false);

      // item row height <= old value (62px)
      expect(m.rowHeight, `Row ${m.idx} height must be <= old value of 62px`).toBeLessThanOrEqual(62);
    }

    // Verify tapping over the chip's x-centre at y+1 and y+43 opens unit dialog
    const firstField = rows.first().locator('[data-testid="component-quantity-field"]');
    await firstField.click({ position: { x: 74, y: 1 } });
    const unitSheet = page.locator('[data-testid="unit-sheet"]');
    await expect(unitSheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(unitSheet).not.toBeVisible();

    await firstField.click({ position: { x: 74, y: 43 } });
    await expect(unitSheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(unitSheet).not.toBeVisible();

    // Verify tapping over qty-number x-centre (position { x: 20, y: 43 }) focuses the input
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const input = row.locator('[data-testid="component-quantity-input"]');
      const field = row.locator('[data-testid="component-quantity-field"]');

      await field.click({ position: { x: 20, y: 43 } });
      const focusedBottom = await input.evaluate((el) => document.activeElement === el);
      expect(focusedBottom, `Row ${i} click at y+43 over qty must focus the input`).toBe(true);

      await input.evaluate((el) => el.blur());
    }
  });

  test('E: single-item and manual card breakdown header geometry at 320px (D34)', async () => {
    expect(page.viewportSize()?.width).toBe(320);

    // 1. Single-item card at 320px
    const discardBtn = cardLocator.locator('button[aria-label="Discard staged meal"]');
    await discardBtn.click();
    await page.fill('textarea[placeholder*="Describe what you ate"]', '1-item single salmon');
    await page.click('button:has-text("Analyze Meal")');
    await expect(cardLocator).toBeVisible({ timeout: 15000 });
    await waitForScrollSettled(page);

    const singleResult = await checkBreakdownHeaderGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'E: single-item breakdown header geometry at 320px', surface: 'E', ...singleResult }));

    expect(singleResult.headerRowHeight, `Header row height (${singleResult.headerRowHeight}px) exceeds 16px (+0.5px tolerance)`).toBeLessThanOrEqual(16.5);
    expect(singleResult.buttonText, 'Breakdown header button label must be "+ Manual"').toBe('+ Manual');
    expect(singleResult.ariaLabel, 'Breakdown header button aria-label must be "Add manual item"').toBe('Add manual item');
    expect(singleResult.isClipped, 'Breakdown header button must fit with no clipping').toBe(false);
    expect(singleResult.buttonHeight, `+ Manual button tap height (${singleResult.buttonHeight}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(singleResult.buttonWidth, `+ Manual button tap width (${singleResult.buttonWidth}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(singleResult.labelIntersectionArea, `+ Manual button intersects header label with area ${singleResult.labelIntersectionArea}px²`).toBe(0);
    expect(singleResult.firstRowIntersectionArea, `+ Manual button intersects first item row with area ${singleResult.firstRowIntersectionArea}px²`).toBe(0);
    expect(singleResult.selectIntersectionArea, `+ Manual button intersects meal type select with area ${singleResult.selectIntersectionArea}px²`).toBe(0);
    expect(singleResult.hitResults.top.isBtnOrDescendant, 'Top edge of + Manual button must hit button').toBe(true);
    expect(singleResult.hitResults.center.isBtnOrDescendant, 'Center of + Manual button must hit button').toBe(true);
    expect(singleResult.hitResults.bottom.isBtnOrDescendant, 'Bottom edge of + Manual button must hit button').toBe(true);

    // 2. Manual card at 320px
    await cardLocator.locator('button[aria-label="Discard staged meal"]').click();
    const manualBtn = page.locator('button:has-text("Manual Entry")');
    await manualBtn.click();
    await page.fill('[data-testid="dish-name-input"]', 'Chicken Rice');
    await page.fill('[data-testid="calories-input"]', '400');
    await page.fill('[data-testid="protein-input"]', '40');
    await page.fill('[data-testid="carbs-input"]', '30');
    await page.fill('[data-testid="fat-input"]', '10');
    await page.locator('button:has-text("Log Meal")').last().click();
    await expect(cardLocator).toBeVisible({ timeout: 15000 });
    await waitForScrollSettled(page);

    const manualResult = await checkBreakdownHeaderGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'E: manual card breakdown header geometry at 320px', surface: 'E', ...manualResult }));

    expect(manualResult.headerRowHeight, `Header row height (${manualResult.headerRowHeight}px) exceeds 16px (+0.5px tolerance)`).toBeLessThanOrEqual(16.5);
    expect(manualResult.buttonText, 'Breakdown header button label must be "+ Manual"').toBe('+ Manual');
    expect(manualResult.ariaLabel, 'Breakdown header button aria-label must be "Add manual item"').toBe('Add manual item');
    expect(manualResult.isClipped, 'Breakdown header button must fit with no clipping').toBe(false);
    expect(manualResult.buttonHeight, `+ Manual button tap height (${manualResult.buttonHeight}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(manualResult.buttonWidth, `+ Manual button tap width (${manualResult.buttonWidth}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(manualResult.labelIntersectionArea, `+ Manual button intersects header label with area ${manualResult.labelIntersectionArea}px²`).toBe(0);
    expect(manualResult.firstRowIntersectionArea, `+ Manual button intersects first item row with area ${manualResult.firstRowIntersectionArea}px²`).toBe(0);
    expect(manualResult.selectIntersectionArea, `+ Manual button intersects meal type select with area ${manualResult.selectIntersectionArea}px²`).toBe(0);
    expect(manualResult.hitResults.top.isBtnOrDescendant, 'Top edge of + Manual button must hit button').toBe(true);
    expect(manualResult.hitResults.center.isBtnOrDescendant, 'Center of + Manual button must hit button').toBe(true);
    expect(manualResult.hitResults.bottom.isBtnOrDescendant, 'Bottom edge of + Manual button must hit button').toBe(true);
  });
});


// ---------------------------------------------------------------------------
// Surface F: Manual-staged card and Add-item at 390×844 (D22)
// ---------------------------------------------------------------------------

test.describe('Surface F: Manual-staged card and Add-item at 390×844', () => {
  let page: Page;
  let cardLocator: Locator;
  let navLocator: Locator;
  let actionRowLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);

    // Open manual form
    const manualToggleBtn = page.locator('button:has-text("Manual Entry")');
    if (await manualToggleBtn.isVisible()) {
      await manualToggleBtn.click();
    }

    // Fill manual entry fields (single item)
    await page.fill('[data-testid="dish-name-input"]', 'Grilled Chicken Breast');
    await page.fill('[data-testid="calories-input"]', '280');
    await page.fill('[data-testid="protein-input"]', '35');
    await page.fill('[data-testid="carbs-input"]', '0');
    await page.fill('[data-testid="fat-input"]', '6');
    const fiberInput = page.locator('[data-testid="fiber-input"]');
    if (await fiberInput.isVisible()) {
      await fiberInput.fill('0');
    }

    // Stage the meal
    const logBtn = page.locator('button:has-text("Log Meal")').last();
    await logBtn.click();

    cardLocator = page.locator('[data-testid="staged-meal-card"]');
    await expect(cardLocator).toBeVisible({ timeout: 15000 });
    navLocator = page.locator('nav').filter({ has: page.locator('[data-testid="nav-nutrition"]') });
    const discardBtn = cardLocator.locator('button[aria-label="Discard staged meal"]');
    actionRowLocator = discardBtn.locator('..');
    await waitForScrollSettled(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('F: 1-item card height <= 260px', async () => {
    await waitForScrollSettled(page);
    const cardBox = (await cardLocator.boundingBox())!;
    console.log(JSON.stringify({
      test: 'F: 1-item card height <= 260px',
      surface: 'F',
      cardHeight: Math.round(cardBox.height * 10) / 10,
    }));
    expect(cardBox.height).toBeLessThanOrEqual(260);
  });

  test('F: breakdown header row height <= 16px, + Manual button geometry on manual-staged card at 390px (D34)', async () => {
    await waitForScrollSettled(page);

    const result = await checkBreakdownHeaderGeometry(cardLocator);
    console.log(JSON.stringify({ test: 'F: breakdown header geometry at 390px', surface: 'F', ...result }));

    expect(result.headerRowHeight, `Header row height (${result.headerRowHeight}px) exceeds 16px (+0.5px tolerance)`).toBeLessThanOrEqual(16.5);
    expect(result.buttonText, 'Breakdown header button label must be "+ Manual"').toBe('+ Manual');
    expect(result.ariaLabel, 'Breakdown header button aria-label must be "Add manual item"').toBe('Add manual item');
    expect(result.isClipped, 'Breakdown header button must fit with no clipping').toBe(false);
    expect(result.buttonHeight, `+ Manual button tap height (${result.buttonHeight}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(result.buttonWidth, `+ Manual button tap width (${result.buttonWidth}px) < 40px`).toBeGreaterThanOrEqual(40);
    expect(result.labelIntersectionArea, `+ Manual button intersects header label with area ${result.labelIntersectionArea}px²`).toBe(0);
    expect(result.firstRowIntersectionArea, `+ Manual button intersects first item row with area ${result.firstRowIntersectionArea}px²`).toBe(0);
    expect(result.selectIntersectionArea, `+ Manual button intersects meal type select with area ${result.selectIntersectionArea}px²`).toBe(0);
    expect(result.hitResults.top.isBtnOrDescendant, 'Top edge of + Manual button must hit button').toBe(true);
    expect(result.hitResults.center.isBtnOrDescendant, 'Center of + Manual button must hit button').toBe(true);
    expect(result.hitResults.bottom.isBtnOrDescendant, 'Bottom edge of + Manual button must hit button').toBe(true);
  });

  test('F: font >= 12px', async () => {
    const result = await checkFontSizes(cardLocator);
    console.log(JSON.stringify({
      test: 'F: font >= 12px',
      surface: 'F',
      minFontSize: result.minFontSize,
      minFontElement: result.minFontElement,
      offenderCount: result.offenders.length,
    }));
    expect(result.offenders, `Found fonts smaller than 12px: ${JSON.stringify(result.offenders)}`).toEqual([]);
  });

  test('F: taps >= 40px', async () => {
    const result = await checkTapTargets(cardLocator);
    console.log(JSON.stringify({
      test: 'F: taps >= 40px',
      surface: 'F',
      tapsUnder48Count: result.tapsUnder48.length,
      offendersUnder40Count: result.offendersUnder40.length,
      offendersUnder40: result.offendersUnder40,
    }));
    expect(result.offendersUnder40, `Found tap targets smaller than 40px: ${JSON.stringify(result.offendersUnder40)}`).toEqual([]);
  });

  test('F: no clipping', async () => {
    const result = await checkClipping(cardLocator);
    console.log(JSON.stringify({
      test: 'F: no clipping',
      surface: 'F',
      clippedCount: result.clippedElements.length,
      clippedElements: result.clippedElements,
    }));
    expect(result.clippedElements, `Found clipped elements: ${JSON.stringify(result.clippedElements)}`).toEqual([]);
  });

  test('F: D10 placement (cardTop in [0, 200], actionRowBottom <= navTop)', async () => {
    await waitForScrollSettled(page);
    const cardBox = (await cardLocator.boundingBox())!;
    const cardTop = Math.round(cardBox.y * 10) / 10;
    const navBox = (await navLocator.boundingBox())!;
    const navTop = Math.round(navBox.y * 10) / 10;
    const actionRowBox = (await actionRowLocator.boundingBox())!;
    const actionRowBottom = Math.round((actionRowBox.y + actionRowBox.height) * 10) / 10;

    console.log(JSON.stringify({
      test: 'F: D10 placement',
      surface: 'F',
      cardTop,
      actionRowBottom,
      navTop,
    }));

    expect(cardTop, `Card top (${cardTop}px) must be >= 0`).toBeGreaterThanOrEqual(0);
    expect(cardTop, `Card top (${cardTop}px) must be <= 200`).toBeLessThanOrEqual(200);
    expect(actionRowBottom, `Action row bottom (${actionRowBottom}px) must be <= nav top (${navTop}px)`).toBeLessThanOrEqual(navTop);
  });

  test('F: Add-item form open (font >= 12, taps >= 40, inputs 16px)', async () => {
    const addItemForm = cardLocator.locator('[data-testid="add-item-form"]');
    if (!(await addItemForm.isVisible())) {
      const addItemBtn = cardLocator.locator('[data-testid="add-item-button"]');
      await expect(addItemBtn).toBeVisible();
      await addItemBtn.click();
    }
    await expect(addItemForm).toBeVisible();

    try {
      const fontResult = await checkFontSizes(addItemForm);
      expect(fontResult.offenders, `Found fonts smaller than 12px in AddItemForm: ${JSON.stringify(fontResult.offenders)}`).toEqual([]);

      const tapResult = await checkTapTargets(addItemForm);
      expect(tapResult.offendersUnder40, `Found tap targets smaller than 40px in AddItemForm: ${JSON.stringify(tapResult.offendersUnder40)}`).toEqual([]);

      // Verify all input elements in AddItemForm have fontSize >= 16px (to prevent iOS auto-zoom)
      const inputsUnder16 = await addItemForm.evaluate((form) => {
        const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
        const under16: Array<{ name: string; fontSize: number }> = [];
        for (const input of inputs) {
          const fs = parseFloat(window.getComputedStyle(input).fontSize);
          if (fs < 16) {
            under16.push({
              name: input.getAttribute('name') || input.getAttribute('data-testid') || input.tagName,
              fontSize: fs,
            });
          }
        }
        return under16;
      });

      console.log(JSON.stringify({
        test: 'F: Add-item form inputs font size',
        surface: 'F',
        inputsUnder16,
      }));

      expect(inputsUnder16, `Found inputs with font-size < 16px in AddItemForm: ${JSON.stringify(inputsUnder16)}`).toEqual([]);
    } finally {
      const cancelBtn = cardLocator.locator('[data-testid="cancel-add-item-button"]');
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await expect(addItemForm).not.toBeVisible();
      }
    }
  });

  test('F: 4 items after Add item (height <= 480px)', async () => {
    // Establish precondition: ensure add-item form is open
    const addItemForm = cardLocator.locator('[data-testid="add-item-form"]');
    if (!(await addItemForm.isVisible())) {
      const addItemBtn = cardLocator.locator('[data-testid="add-item-button"]');
      await expect(addItemBtn).toBeVisible();
      await addItemBtn.click();
    }
    await expect(addItemForm).toBeVisible();

    // Add item 2
    await addItemForm.locator('[data-testid="add-item-name-input"]').fill('Steamed Jasmine Rice');
    await addItemForm.locator('[data-testid="add-item-quantity-input"]').fill('150');
    await addItemForm.locator('[data-testid="add-item-unit-input"]').fill('g');
    await addItemForm.locator('[data-testid="add-item-calories-input"]').fill('195');
    await addItemForm.locator('[data-testid="add-item-protein-input"]').fill('3.5');
    await addItemForm.locator('[data-testid="add-item-carbs-input"]').fill('42');
    await addItemForm.locator('[data-testid="add-item-fat-input"]').fill('0.5');
    await addItemForm.locator('[data-testid="add-item-fiber-input"]').fill('0.6');
    await addItemForm.locator('[data-testid="submit-add-item-button"]').click();
    await expect(addItemForm).not.toBeVisible();

    // Add item 3
    const addItemBtn = cardLocator.locator('[data-testid="add-item-button"]');
    await addItemBtn.click();
    await expect(addItemForm).toBeVisible();
    await addItemForm.locator('[data-testid="add-item-name-input"]').fill('Steamed Broccoli');
    await addItemForm.locator('[data-testid="add-item-quantity-input"]').fill('100');
    await addItemForm.locator('[data-testid="add-item-unit-input"]').fill('g');
    await addItemForm.locator('[data-testid="add-item-calories-input"]').fill('35');
    await addItemForm.locator('[data-testid="add-item-protein-input"]').fill('2.4');
    await addItemForm.locator('[data-testid="add-item-carbs-input"]').fill('7');
    await addItemForm.locator('[data-testid="add-item-fat-input"]').fill('0.4');
    await addItemForm.locator('[data-testid="add-item-fiber-input"]').fill('2.6');
    await addItemForm.locator('[data-testid="submit-add-item-button"]').click();
    await expect(addItemForm).not.toBeVisible();

    // Add item 4
    await addItemBtn.click();
    await expect(addItemForm).toBeVisible();
    await addItemForm.locator('[data-testid="add-item-name-input"]').fill('Olive Oil Drizzle');
    await addItemForm.locator('[data-testid="add-item-quantity-input"]').fill('10');
    await addItemForm.locator('[data-testid="add-item-unit-input"]').fill('ml');
    await addItemForm.locator('[data-testid="add-item-calories-input"]').fill('88');
    await addItemForm.locator('[data-testid="add-item-protein-input"]').fill('0');
    await addItemForm.locator('[data-testid="add-item-carbs-input"]').fill('0');
    await addItemForm.locator('[data-testid="add-item-fat-input"]').fill('10');
    await addItemForm.locator('[data-testid="add-item-fiber-input"]').fill('0');
    await addItemForm.locator('[data-testid="submit-add-item-button"]').click();
    await expect(addItemForm).not.toBeVisible();

    // Verify 4 component rows present
    const rows = cardLocator.locator('[data-testid="component-row"]');
    await expect(rows).toHaveCount(4);

    await waitForScrollSettled(page);
    const cardBox = (await cardLocator.boundingBox())!;
    console.log(JSON.stringify({
      test: 'F: 4 items after Add item (height <= 480px)',
      surface: 'F',
      cardHeight: Math.round(cardBox.height * 10) / 10,
    }));
    expect(cardBox.height).toBeLessThanOrEqual(480);
  });
});

// ---------------------------------------------------------------------------
// Surface G: Quick Log surface at 390×844 and 320×568 (D26 / D18)
// ---------------------------------------------------------------------------

test.describe('Surface G: Quick Log surface at 390×844 (D26)', () => {
  let page: Page;
  let sectionLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);
    sectionLocator = page.locator('section').filter({ hasText: 'Quick Log Favorites' });
    await expect(sectionLocator).toBeVisible();
    await sectionLocator.scrollIntoViewIfNeeded();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('G: 390 section height <= 450px and row heights ~56px', async () => {
    const measurements = await sectionLocator.evaluate((root) => {
      const sRect = root.getBoundingClientRect();
      const rows = Array.from(root.querySelectorAll('[data-testid^="favorite-row-"]'));
      const rowHeights = rows.map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10);
      return {
        sectionHeight: Math.round(sRect.height * 10) / 10,
        rowCount: rows.length,
        rowHeights,
      };
    });

    console.log(JSON.stringify({
      test: 'G: 390 section height <= 450px and row heights ~56px',
      surface: 'G-390',
      measurements,
    }));

    // Collapsed mode renders top 3 rows
    expect(measurements.rowCount).toBe(3);
    // Section height budget
    expect(measurements.sectionHeight).toBeLessThanOrEqual(450);
    // Row heights ~56px (52px to 60px)
    for (const h of measurements.rowHeights) {
      expect(h).toBeGreaterThanOrEqual(52);
      expect(h).toBeLessThanOrEqual(60);
    }
  });

  test('G: 390 font >= 12px', async () => {
    const result = await checkFontSizes(sectionLocator);
    console.log(JSON.stringify({
      test: 'G: 390 font >= 12px',
      surface: 'G-390',
      minFontSize: result.minFontSize,
      minFontElement: result.minFontElement,
      offenders: result.offenders,
    }));
    expect(result.offenders).toEqual([]);
  });

  test('G: 390 taps >= 40px', async () => {
    const result = await checkTapTargets(sectionLocator);
    console.log(JSON.stringify({
      test: 'G: 390 taps >= 40px',
      surface: 'G-390',
      tapsUnder48: result.tapsUnder48,
      offendersUnder40: result.offendersUnder40,
    }));
    expect(result.offendersUnder40).toEqual([]);
  });

  test('G: 390 no clipping', async () => {
    const result = await checkClipping(sectionLocator);
    console.log(JSON.stringify({
      test: 'G: 390 no clipping',
      surface: 'G-390',
      clippedElements: result.clippedElements,
    }));
    expect(result.clippedElements).toEqual([]);
  });
});

test.describe('Surface G: Quick Log surface at 320×568 (D26)', () => {
  let page: Page;
  let sectionLocator: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 1,
    });
    await setupPageAndLogin(page);
    sectionLocator = page.locator('section').filter({ hasText: 'Quick Log Favorites' });
    await expect(sectionLocator).toBeVisible();
    await sectionLocator.scrollIntoViewIfNeeded();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('G: 320 section height <= 450px and row heights ~56px', async () => {
    const measurements = await sectionLocator.evaluate((root) => {
      const sRect = root.getBoundingClientRect();
      const rows = Array.from(root.querySelectorAll('[data-testid^="favorite-row-"]'));
      const rowHeights = rows.map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10);
      return {
        sectionHeight: Math.round(sRect.height * 10) / 10,
        rowCount: rows.length,
        rowHeights,
      };
    });

    console.log(JSON.stringify({
      test: 'G: 320 section height <= 450px and row heights ~56px',
      surface: 'G-320',
      measurements,
    }));

    // Collapsed mode renders top 3 rows
    expect(measurements.rowCount).toBe(3);
    // Section height budget
    expect(measurements.sectionHeight).toBeLessThanOrEqual(450);
    // Row heights ~56px (52px to 60px)
    for (const h of measurements.rowHeights) {
      expect(h).toBeGreaterThanOrEqual(52);
      expect(h).toBeLessThanOrEqual(60);
    }
  });

  test('G: 320 font >= 12px', async () => {
    const result = await checkFontSizes(sectionLocator);
    console.log(JSON.stringify({
      test: 'G: 320 font >= 12px',
      surface: 'G-320',
      minFontSize: result.minFontSize,
      minFontElement: result.minFontElement,
      offenders: result.offenders,
    }));
    expect(result.offenders).toEqual([]);
  });

  test('G: 320 taps >= 40px', async () => {
    const result = await checkTapTargets(sectionLocator);
    console.log(JSON.stringify({
      test: 'G: 320 taps >= 40px',
      surface: 'G-320',
      tapsUnder48: result.tapsUnder48,
      offendersUnder40: result.offendersUnder40,
    }));
    expect(result.offendersUnder40).toEqual([]);
  });

  test('G: 320 no clipping', async () => {
    const result = await checkClipping(sectionLocator);
    console.log(JSON.stringify({
      test: 'G: 320 no clipping',
      surface: 'G-320',
      clippedElements: result.clippedElements,
    }));
    expect(result.clippedElements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D35: Type and input consistency (D18, D26, D31, D35)
// ---------------------------------------------------------------------------

test.describe('D35 type/input consistency', () => {
  test('D35: Quick Log row height <= 60px at 320px and 390px', async ({ browser }) => {
    for (const width of [320, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 844 },
        deviceScaleFactor: 1,
      });
      try {
        await setupPageAndLogin(page);
        const section = page.locator('section').filter({ hasText: 'Quick Log Favorites' });
        await expect(section).toBeVisible();
        const rowHeights = await section.evaluate((root) => {
          const rows = Array.from(root.querySelectorAll('[data-testid^="favorite-row-"]'));
          return rows.map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10);
        });
        expect(rowHeights.length).toBeGreaterThan(0);
        for (const h of rowHeights) {
          expect(h).toBeLessThanOrEqual(60);
        }
      } finally {
        await page.close();
      }
    }
  });

  test('D35: Quick Log dish name is 14px semibold (600) and all fonts in Quick Log >= 12px', async ({ browser }) => {
    for (const width of [320, 390, 700]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        deviceScaleFactor: 1,
      });
      try {
        await setupPageAndLogin(page);
        const section = page.locator('section').filter({ hasText: 'Quick Log Favorites' });
        await expect(section).toBeVisible();
        const dishNames = await section.evaluate((root) => {
          const names = Array.from(root.querySelectorAll('[id^="dish-name-"]'));
          return names.map((el) => {
            const style = window.getComputedStyle(el);
            return {
              text: el.textContent?.trim(),
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
            };
          });
        });
        expect(dishNames.length).toBeGreaterThan(0);
        for (const dn of dishNames) {
          expect(dn.fontSize).toBe('14px');
          expect(dn.fontWeight).toBe('600');
        }

        const fontCheck = await checkFontSizes(section);
        expect(fontCheck.offenders).toEqual([]);
      } finally {
        await page.close();
      }
    }
  });

  test('D35: computed font-size of every input/select/textarea in the nutrition tab == 16px at 390px and 700px', async ({ browser }) => {
    for (const width of [390, 700]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        deviceScaleFactor: 1,
      });
      try {
        await setupPageAndLogin(page);

        // 1. Search input in Quick Log
        const searchInput = page.locator('[data-testid="search-favorites-input"]');
        await expect(searchInput).toBeVisible();
        const searchFontSize = await searchInput.evaluate((el) => window.getComputedStyle(el).fontSize);
        expect(searchFontSize, `search input at ${width}px`).toBe('16px');

        // 2. AI input textarea (visible before staging)
        const aiTextarea = page.locator('textarea[placeholder*="Describe what you ate"]');
        await expect(aiTextarea).toBeVisible();
        const aiFontSize = await aiTextarea.evaluate((el) => window.getComputedStyle(el).fontSize);
        expect(aiFontSize, `AI textarea at ${width}px`).toBe('16px');

        // 3. Stage a meal via AI input to check staged card controls
        await aiTextarea.fill('single 1-item salmon');
        await page.click('button:has-text("Analyze Meal")');
        const card = page.locator('[data-testid="staged-meal-card"]');
        await expect(card).toBeVisible({ timeout: 15000 });

        const select = card.locator('select[aria-label="Meal type"]');
        const selectFontSize = await select.evaluate((el) => window.getComputedStyle(el).fontSize);
        expect(selectFontSize, `meal-type select at ${width}px`).toBe('16px');

        const mealNameInput = card.locator('[data-testid="dish-name-input"]');
        const nameFontSize = await mealNameInput.evaluate((el) => window.getComputedStyle(el).fontSize);
        expect(nameFontSize, `dish-name-input at ${width}px`).toBe('16px');

        const qtyInput = card.locator('[data-testid="component-quantity-input"]').first();
        if (await qtyInput.isVisible()) {
          const qtyFontSize = await qtyInput.evaluate((el) => window.getComputedStyle(el).fontSize);
          expect(qtyFontSize, `qty input at ${width}px`).toBe('16px');
        }

        // Discard staged card
        const discardBtn = card.locator('button[aria-label="Discard staged meal"]');
        await discardBtn.click();
        await expect(card).not.toBeVisible();

        // 4. Manual entry form fields
        const manualBtn = page.locator('button:has-text("Manual Entry")');
        await manualBtn.click();
        const manualForm = page.locator('form').filter({ hasText: 'Manual Macro Logging' });
        await expect(manualForm).toBeVisible();

        const formControls = await manualForm.evaluate((form) => {
          const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
          return controls
            .filter((c) => c.type !== 'hidden' && c.type !== 'submit' && c.type !== 'button')
            .map((c) => ({
              id: c.id,
              name: c.getAttribute('data-testid') || c.getAttribute('aria-label') || c.id || c.tagName,
              fontSize: window.getComputedStyle(c).fontSize,
            }));
        });
        expect(formControls.length).toBeGreaterThan(0);
        for (const ctrl of formControls) {
          expect(ctrl.fontSize, `manual form control ${ctrl.name} at ${width}px`).toBe('16px');
        }

        // Close manual form
        const cancelBtn = manualForm.locator('button:has-text("Cancel")').first();
        await cancelBtn.click();
      } finally {
        await page.close();
      }
    }
  });

  test('D35: select label not clipped at 700px (D31)', async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width: 700, height: 844 },
      deviceScaleFactor: 1,
    });
    try {
      await setupPageAndLogin(page);

      // Stage a meal to get the staged card
      await page.fill('textarea[placeholder*="Describe what you ate"]', 'single 1-item salmon');
      await page.click('button:has-text("Analyze Meal")');
      const card = page.locator('[data-testid="staged-meal-card"]');
      await expect(card).toBeVisible({ timeout: 15000 });

      // Check chevron geometry and clearance at 700px
      const geo = await checkSelectChevronGeometry(card);
      console.log(JSON.stringify({
        test: 'D35: select label not clipped at 700px',
        width: 700,
        geo,
      }));

      // Assert custom chevron is visible and within bounds
      expect(geo.hasCustomChevron).toBe(true);
      expect(geo.isChevronVisible).toBe(true);
      expect(geo.isInside).toBe(true);
      expect(geo.verticalDelta).toBeLessThanOrEqual(2);

      // Assert longest option 'Post-Workout' does not overlap chevron
      expect(geo.noOverlapLongest).toBe(true);
      expect(geo.clearanceLongest).toBeGreaterThanOrEqual(0);

      // Select 'Post-Workout' and assert no horizontal scroll clipping
      const select = card.locator('select[aria-label="Meal type"]');
      await select.selectOption('Post-Workout');
      const selectClip = await select.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        isClipped: el.scrollWidth > el.clientWidth,
      }));
      expect(selectClip.isClipped).toBe(false);
    } finally {
      await page.close();
    }
  });
});

// ---------------------------------------------------------------------------
// D37: Macro Ring Clearance (>= 4px clearance from stroke inner edge)
// ---------------------------------------------------------------------------

test.describe("D37 ring clearance", () => {
  const WORST_CASE_TARGETS = {
    calories: 1900,
    protein: 150,
    carbs: 140,
    fat: 70,
    fiber: 30,
  };

  const WORST_CASE_DAILY_LOGS = {
    calories: 1876,
    protein: 159,
    carbs: 147.3,
    fat: 55,
    fiber: 25,
  };

  async function setupRingsPage(
    browser: any,
    width: number,
    height: number,
    dailyTotals = WORST_CASE_DAILY_LOGS,
    targets = WORST_CASE_TARGETS
  ) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    const todayStr = new Date().toISOString().split("T")[0];

    await page.route("**/rest/v1/users*", async (route: any) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" } });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          id: "a0000000-0000-0000-0000-000000000002",
          email: "athlete@cybergym.io",
          username: "athlete",
          role: "athlete",
          target_calories: targets.calories,
          target_protein: targets.protein,
          target_carbs: targets.carbs,
          target_fat: targets.fat,
          target_fiber: targets.fiber,
          auto_rest_timer: true,
          timezone: "America/Los_Angeles",
        }),
      });
    });

    await page.route("**/rest/v1/nutrition_logs*", async (route: any) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" } });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          {
            id: "log-worst-case",
            user_id: "a0000000-0000-0000-0000-000000000002",
            food_name: "Worst Case Meal",
            meal_type: "Lunch",
            calories: dailyTotals.calories,
            protein: dailyTotals.protein,
            carbs: dailyTotals.carbs,
            fat: dailyTotals.fat,
            fiber: dailyTotals.fiber,
            serving_size: 1,
            serving_unit: "serving",
            logged_at: new Date().toISOString(),
            logged_date: todayStr,
            created_at: new Date().toISOString(),
            has_components: false,
          },
        ]),
      });
    });

    await setupPageAndLogin(page);
    await page.waitForSelector("[data-testid=\"macro-ring-calories\"]");
    await page.waitForFunction((expectedKcal: number) => {
      const el = document.querySelector("[data-testid=\"macro-ring-calories\"]");
      return el && el.textContent && el.textContent.includes(String(expectedKcal));
    }, dailyTotals.calories);

    const sectionLocator = page
      .locator("text=Today's Nutrition")
      .locator("xpath=ancestor::div[contains(@class, \"rounded-3xl\")]")
      .first();

    return { page, sectionLocator };
  }

  async function measureRingClearances(page: Page) {
    const ringIds = ["calories", "protein", "carbs", "fat", "fiber"];
    return await page.evaluate((ids) => {
      return ids.map((ringId) => {
        const container = document.querySelector(`[data-testid="macro-ring-${ringId}"]`);
        if (!container) throw new Error(`Ring container not found: macro-ring-${ringId}`);
        const svg = container.querySelector("svg");
        if (!svg) throw new Error(`SVG not found for ${ringId}`);
        const circle = svg.querySelector("circle");
        if (!circle) throw new Error(`Circle not found for ${ringId}`);
        const svgRect = svg.getBoundingClientRect();
        const cxAttr = parseFloat(circle.getAttribute("cx") || "38");
        const cyAttr = parseFloat(circle.getAttribute("cy") || "38");
        const rAttr = parseFloat(circle.getAttribute("r") || "34");
        const swAttr = parseFloat(
          circle.getAttribute("stroke-width") || circle.getAttribute("strokeWidth") || "3.5"
        );

        const vbWidth = svg.viewBox.baseVal?.width || 76;
        const scale = svgRect.width / vbWidth;

        const cx = svgRect.left + cxAttr * scale;
        const cy = svgRect.top + cyAttr * scale;
        const innerRadius = (rAttr - swAttr / 2) * scale;
        const outerRadius = (rAttr + swAttr / 2) * scale;

        const textContainer = svg.parentElement?.querySelector(".absolute.flex.flex-col");
        if (!textContainer) throw new Error(`Text container not found for ${ringId}`);
        const spans = textContainer.querySelectorAll("span");
        const valSpan = spans[0] as HTMLElement;
        const targetSpan = spans[1] as HTMLElement;
        if (!valSpan || !targetSpan) throw new Error(`Spans not found for ${ringId}`);

        function getMinCornerClearance(el: HTMLElement) {
          const r = el.getBoundingClientRect();
          const corners = [
            { x: r.left, y: r.top },
            { x: r.right, y: r.top },
            { x: r.left, y: r.bottom },
            { x: r.right, y: r.bottom },
          ];
          const maxDist = Math.max(...corners.map((c) => Math.hypot(c.x - cx, c.y - cy)));
          return Math.round((innerRadius - maxDist) * 100) / 100;
        }

        const valClearance = getMinCornerClearance(valSpan);
        const targetClearance = getMinCornerClearance(targetSpan);

        return {
          ringId,
          valText: valSpan.textContent?.trim() || "",
          targetText: targetSpan.textContent?.trim() || "",
          valClearance,
          targetClearance,
          minClearance: Math.min(valClearance, targetClearance),
          outerDiameter: Math.round(outerRadius * 2 * 10) / 10,
          strokeWidth: Math.round(swAttr * scale * 10) / 10,
          innerRadius: Math.round(innerRadius * 10) / 10,
        };
      });
    }, ringIds);
  }

  test("D37: 320px worst-case values clearance >= 4px, font >= 12px, no clipping", async ({ browser }) => {
    const { page, sectionLocator } = await setupRingsPage(browser, 320, 568);
    try {
      const clearances = await measureRingClearances(page);
      console.log(JSON.stringify({ test: "D37: 320px clearance", clearances }));

      for (const r of clearances) {
        expect(r.valClearance, `${r.ringId} value "${r.valText}" clearance`).toBeGreaterThanOrEqual(4.0);
        expect(r.targetClearance, `${r.ringId} target "${r.targetText}" clearance`).toBeGreaterThanOrEqual(4.0);
      }

      const fontResult = await checkFontSizes(sectionLocator);
      expect(fontResult.offenders).toEqual([]);

      const clipResult = await checkClipping(sectionLocator);
      expect(clipResult.clippedElements).toEqual([]);

      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(docOverflow).toBe(false);
    } finally {
      await page.close();
    }
  });

  test("D37: 390px worst-case values clearance >= 4px, section height <= base + 8, font >= 12px, no clipping", async ({ browser }) => {
    const { page, sectionLocator } = await setupRingsPage(browser, 390, 844);
    try {
      const clearances = await measureRingClearances(page);
      console.log(JSON.stringify({ test: "D37: 390px clearance", clearances }));

      for (const r of clearances) {
        expect(r.valClearance, `${r.ringId} value "${r.valText}" clearance`).toBeGreaterThanOrEqual(4.0);
        expect(r.targetClearance, `${r.ringId} target "${r.targetText}" clearance`).toBeGreaterThanOrEqual(4.0);
      }

      const sectionHeight = await sectionLocator.evaluate((el) => el.getBoundingClientRect().height);
      console.log(JSON.stringify({ test: "D37: 390px sectionHeight", sectionHeight }));
      // Base section height at 390px is 334px. Budget: <= base + 8px = 342px.
      expect(sectionHeight).toBeLessThanOrEqual(342);

      const fontResult = await checkFontSizes(sectionLocator);
      expect(fontResult.offenders).toEqual([]);

      const clipResult = await checkClipping(sectionLocator);
      expect(clipResult.clippedElements).toEqual([]);

      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(docOverflow).toBe(false);
    } finally {
      await page.close();
    }
  });

  test("D37: 700px worst-case values clearance >= 4px, font >= 12px, no clipping", async ({ browser }) => {
    const { page, sectionLocator } = await setupRingsPage(browser, 700, 900);
    try {
      const clearances = await measureRingClearances(page);
      console.log(JSON.stringify({ test: "D37: 700px clearance", clearances }));

      for (const r of clearances) {
        expect(r.valClearance, `${r.ringId} value "${r.valText}" clearance`).toBeGreaterThanOrEqual(4.0);
        expect(r.targetClearance, `${r.ringId} target "${r.targetText}" clearance`).toBeGreaterThanOrEqual(4.0);
      }

      const fontResult = await checkFontSizes(sectionLocator);
      expect(fontResult.offenders).toEqual([]);

      const clipResult = await checkClipping(sectionLocator);
      expect(clipResult.clippedElements).toEqual([]);
    } finally {
      await page.close();
    }
  });

  test("D37: 390px 4-digit over-target calories (2450/1900) clearance >= 4px", async ({ browser }) => {
    const overLogs = { ...WORST_CASE_DAILY_LOGS, calories: 2450 };
    const { page } = await setupRingsPage(browser, 390, 844, overLogs);
    try {
      const clearances = await measureRingClearances(page);
      console.log(JSON.stringify({ test: "D37: 390px over-target calories", clearances }));

      const cal = clearances.find((r) => r.ringId === "calories");
      expect(cal).toBeDefined();
      expect(cal.valClearance, `calories value "${cal.valText}" clearance`).toBeGreaterThanOrEqual(4.0);
      expect(cal.targetClearance, `calories target "${cal.targetText}" clearance`).toBeGreaterThanOrEqual(4.0);
    } finally {
      await page.close();
    }
  });
});
