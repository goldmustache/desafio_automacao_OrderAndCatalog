import { expect, test } from '@playwright/test';
import { DashboardPage } from './pages/dashboard-page';

interface DashboardOrder {
  id: number;
  total: number;
  status: string;
}

async function stubOrders(page: import('@playwright/test').Page, content: DashboardOrder[], totalElements = content.length): Promise<void> {
  await page.route('**/api/orders**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      content,
      page: 0,
      size: 100,
      totalElements,
      totalPages: Math.ceil(totalElements / 100),
    }),
  }));
}

function orders(count: number): DashboardOrder[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    total: 100,
    status: index % 2 === 0 ? 'CONFIRMED' : 'PENDING',
  }));
}

test.describe('Dashboard page', () => {
  test('DASH-001 | loads the dashboard with the service available and Portuguese selected', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const ordersResponse = page.waitForResponse((response) => response.url().includes('/api/orders'));
    await dashboard.goto();

    expect((await ordersResponse).status()).toBe(200);
    await dashboard.selectLanguage('Português');
    await expect(dashboard.languageButton).toContainText('Português');
    await expect(dashboard.heading).toBeVisible();
  });

  test('DASH-002 | highlights Dashboard in the active menu', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.dashboardNavLink).toHaveClass(/active/);
  });

  test('DASH-003 | shows the dashboard title and subtitle', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.description).toBeVisible();
  });

  test('DASH-004 | shows the application footer', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.footer).toContainText(/Technical challenge|Desafio técnico/);
  });

  test('DASH-006 and DASH-011 | shows the empty state and unavailable-metrics notice', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await stubOrders(page, []);
    await dashboard.goto();

    await expect(dashboard.emptyStateMessage).toBeVisible();
    await expect(dashboard.metricsNote).toContainText(/Indicadores não disponíveis|Unavailable metrics/);
  });

  test('DASH-007 | derives totals from loaded orders', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await stubOrders(page, [
      { id: 1, total: 100, status: 'CONFIRMED' },
      { id: 2, total: 1000, status: 'PENDING' },
      { id: 3, total: 2500, status: 'CONFIRMED' },
    ]);
    await dashboard.goto();

    await expect(dashboard.emptyStateMessage).toBeHidden();
    await expect(dashboard.main).toContainText(/3,600|3\.600|3600/);
  });

  test('DASH-008 | removes the empty state when the first order becomes available', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    let requestCount = 0;
    await page.route('**/api/orders**', (route) => {
      requestCount += 1;
      const content = requestCount === 1 ? [] : [{ id: 1, total: 1234.56, status: 'CONFIRMED' }];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content, page: 0, size: 100, totalElements: content.length, totalPages: 1 }),
      });
    });
    await dashboard.goto();
    await expect(dashboard.emptyStateMessage).toBeVisible();

    await page.reload();

    await expect(dashboard.emptyStateMessage).toBeHidden();
    await expect(dashboard.main).toContainText(/1,234\.56|1\.234,56|1234\.56/);
  });

  test('DASH-009 | renders loaded monetary values in a readable numeric format', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await stubOrders(page, [{ id: 1, total: 1234.56, status: 'CONFIRMED' }]);
    await dashboard.goto();

    await expect(dashboard.main).toContainText(/1,234\.56|1\.234,56|1234\.56/);
  });

  test('DASH-010 | reports totals when many orders are loaded', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await stubOrders(page, orders(45), 45);
    await dashboard.goto();

    await expect(dashboard.emptyStateMessage).toBeHidden();
    await expect(dashboard.main).toContainText('45');
    await expect(dashboard.main).toContainText('4,500');
  });

  test('DASH-012 | does not show the empty state while orders are loading', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route('**/api/orders**', async (route) => {
      await responseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }),
      });
    });
    const navigation = dashboard.goto();
    await expect(dashboard.emptyStateMessage).toBeHidden();
    releaseResponse();
    await navigation;

    await expect(dashboard.emptyStateMessage).toBeVisible();
  });

  test('DASH-013 to DASH-015 | quick actions navigate to their destinations', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.quickActionsHeading).toBeVisible();
    await dashboard.openCreateOrder();
    await expect(page).toHaveURL(/\/orders\/new$/);
    await dashboard.goto();
    await dashboard.viewOrdersLink.click();
    await expect(page).toHaveURL(/\/orders$/);
    await dashboard.goto();
    await dashboard.catalogActionLink.click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test('DASH-016 | sidebar links navigate between Dashboard, Orders, and Catalog', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await dashboard.openOrders();
    await expect(page).toHaveURL(/\/orders$/);
    await dashboard.openCatalog();
    await expect(page).toHaveURL(/\/catalog$/);
    await dashboard.openDashboardFromNavigation();
    await expect(page).toHaveURL(/\/$/);
  });

  test('DASH-017 | brand link returns to Dashboard', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.openOrders();

    await dashboard.openDashboardFromBrand();

    await expect(page).toHaveURL(/\/$/);
    await expect(dashboard.heading).toBeVisible();
  });

  test('DASH-018 | browser back and forward restore navigation history', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/orders$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('DASH-019 | Ctrl-clicking a quick action opens a new tab', async ({ page, context }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const newTabPromise = context.waitForEvent('page');

    await dashboard.createOrderLink.click({ modifiers: ['Control'] });

    const newTab = await newTabPromise;
    await newTab.waitForLoadState();
    await expect(newTab).toHaveURL(/\/orders\/new$/);
  });

  test('DASH-020 | unknown routes show the not-found page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await page.goto('/xyz');

    await expect(page).toHaveURL(/\/404$/);
    await expect(dashboard.notFoundHeading).toBeVisible();
  });

  test('DASH-021 | language selector lists all supported languages', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.languageButton.click();

    await expect(dashboard.languageMenu.getByRole('button')).toHaveCount(3);
  });

  test('DASH-022 and DASH-024 | switches to English and persists after reload', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.selectLanguage('English');
    await page.reload();

    await expect(dashboard.languageButton).toContainText('English');
    await expect(dashboard.createOrderLink).toBeVisible();
  });

  test('DASH-023 | switches to Spanish', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.selectLanguage('Español');

    await expect(dashboard.languageButton).toContainText('Español');
    await expect(dashboard.ordersNavLink).toBeVisible();
  });

  test('DASH-025 | does not expose raw translation keys', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const visibleText = await page.locator('body').innerText();

    expect(visibleText).not.toMatch(/\b(?:dashboard|nav|common)\.[a-z][\w.]*/i);
  });

  test('DASH-026 | selected language persists across screens', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.selectLanguage('English');
    await dashboard.openCreateOrder();

    await expect(dashboard.languageButton).toContainText('English');
  });

  test('DASH-028 | mobile menu opens and navigates to Orders', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await page.setViewportSize({ width: 800, height: 900 });
    await dashboard.goto();

    await expect(dashboard.mobileMenuButton).toHaveAttribute('aria-expanded', 'false');
    await dashboard.mobileMenuButton.click();
    await expect(dashboard.mobileMenuButton).toHaveAttribute('aria-expanded', 'true');
    await dashboard.openOrders();
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('DASH-033, DASH-035, and DASH-036 | navigation remains usable and dashboard recovers after service failure', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    let requestCount = 0;
    await page.route('**/api/orders**', (route) => {
      requestCount += 1;
      if (requestCount < 3) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service unavailable"}' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }),
      });
    });
    await dashboard.goto();
    await expect(dashboard.errorState).toBeVisible();

    await dashboard.openCatalog();
    await expect(page).toHaveURL(/\/catalog$/);
    await dashboard.openDashboardFromNavigation();
    await expect(dashboard.errorState).toBeVisible();
    await dashboard.retryButton.click();

    await expect(dashboard.emptyStateMessage).toBeVisible();
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });
});
