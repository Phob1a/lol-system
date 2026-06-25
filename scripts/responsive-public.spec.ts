import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const PUBLIC_PATHS = ['/', '/tournament/data', '/register', '/login'];
const MOBILE_WIDTHS = [360, 390, 430];

async function pageWidthMetrics(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
    };
  });
}

test.describe('public mobile layout', () => {
  for (const width of MOBILE_WIDTHS) {
    test(`does not create page-level horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      for (const path of PUBLIC_PATHS) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
        await page.waitForFunction(() => {
          const doc = document.scrollingElement ?? document.documentElement;
          return doc.scrollWidth <= doc.clientWidth + 2;
        });

        const metrics = await pageWidthMetrics(page);
        expect(metrics.scrollWidth, `${path} at ${width}px`).toBeLessThanOrEqual(
          metrics.clientWidth + 2,
        );
      }
    });
  }
});
