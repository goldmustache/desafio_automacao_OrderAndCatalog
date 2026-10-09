import { expect, test, type Page } from '@playwright/test';
import { OrdersPage, type NewOrderClient } from './pages/orders-page';

interface ProductPrice {
  productId: string;
  name: string;
  status: string;
  currentPrice: { value: number; currency: string };
}

const client: NewOrderClient = {
  name: 'Test Customer',
  document: '52998224725',
  email: 'test@example.com',
};

const productPrices: Record<string, ProductPrice> = {
  'P-100': { productId: 'P-100', name: 'Product 100', status: 'ACTIVE', currentPrice: { value: 100, currency: 'BRL' } },
  'P-200': { productId: 'P-200', name: 'Product 200', status: 'ACTIVE', currentPrice: { value: 200, currency: 'BRL' } },
  'P-OFF': { productId: 'P-OFF', name: 'Inactive product', status: 'INACTIVE', currentPrice: { value: 100, currency: 'BRL' } },
};

async function stubCatalog(page: Page): Promise<void> {
  await page.route('**/api/catalog/prices', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const productId = new URL(request.url()).pathname.split('/').pop() ?? '';
      const product = productPrices[productId];
      if (product) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(product) });
      } else {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found', details: [] } }) });
      }
      return;
    }

    const requestBody = request.postDataJSON() as { productIds: string[] };
    const prices = requestBody.productIds.flatMap((productId) => productPrices[productId] ? [productPrices[productId]] : []);
    const notFound = requestBody.productIds.filter((productId) => !productPrices[productId]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prices, notFound }),
    });
  });
}

async function fillValidOrder(form: OrdersPage, productId = 'P-100', quantity = 1): Promise<void> {
  await form.fillClient(client);
  await form.addProduct(productId, quantity);
  await expect(form.itemRow(productId)).toBeVisible();
}

interface OrderFixture {
  id: number;
  customerName: string;
  customerDocument: string;
  customerEmail: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  createdAt: string;
}

const orderFixtures: OrderFixture[] = Array.from({ length: 21 }, (_, index) => {
  const sequence = 21 - index;
  return {
    id: sequence,
    customerName: `Customer ${sequence}`,
    customerDocument: `DOC-${sequence}`,
    customerEmail: `customer${sequence}@example.com`,
    items: [{ productId: 'P-100', productName: 'Product 100', quantity: 1, unitPrice: 100, total: 100 }],
    subtotal: 100,
    discount: 0,
    total: 100,
    status: sequence % 2 === 0 ? 'CRIADO' : 'CANCELADO',
    createdAt: new Date(Date.UTC(2026, 0, sequence)).toISOString(),
  };
});

async function stubOrders(page: Page): Promise<void> {
  await page.route('**/api/orders**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const pageNumber = Number(requestUrl.searchParams.get('page') ?? 0);
    const size = Number(requestUrl.searchParams.get('size') ?? 20);
    const status = requestUrl.searchParams.get('status');
    const filteredOrders = status
      ? orderFixtures.filter((order) => order.status === status)
      : orderFixtures;
    const content = filteredOrders.slice(pageNumber * size, (pageNumber + 1) * size);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content,
        page: pageNumber,
        size,
        totalElements: filteredOrders.length,
        totalPages: Math.ceil(filteredOrders.length / size),
      }),
    });
  });
}

test.describe('New order and Catalog workflows', () => {
  test('UI-001 | creates a discounted order and displays API-calculated totals', async ({ page }) => {
    await stubCatalog(page);
    let submittedOrder: unknown;
    await page.route('**/api/orders**', async (route) => {
      if (route.request().method() === 'POST') {
        submittedOrder = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 9001, status: 'CRIADO', subtotal: 2500, discount: 250, total: 2250 }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 9001,
          client,
          items: [{ productId: 'P-100', productName: 'Product 100', quantity: 25, unitPrice: 100, subtotal: 2500 }],
          subtotal: 2500,
          discount: 250,
          total: 2250,
          status: 'CRIADO',
          createdAt: '2026-10-09T12:00:00Z',
        }),
      });
    });

    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await fillValidOrder(form, 'P-100', 25);
    await expect(form.main).toContainText(/R\$\s?2,500\.00|R\$\s?2\.500,00/);
    await form.submit();

    await expect(page).toHaveURL(/\/orders\/9001$/);
    await expect(page.getByRole('main')).toContainText(/Created|CRIADO/);
    await expect(page.getByRole('main')).toContainText(/R\$\s?2,500\.00|R\$\s?2\.500,00/);
    await expect(page.getByRole('main')).toContainText(/R\$\s?250\.00|R\$\s?250,00/);
    await expect(page.getByRole('main')).toContainText(/R\$\s?2,250\.00|R\$\s?2\.250,00/);
    expect(submittedOrder).toEqual({ client, items: [{ productId: 'P-100', quantity: 25 }] });
  });

  test('UI-002 | shows PRODUCT_INACTIVE and preserves form data after submit fails', async ({ page }) => {
    await stubCatalog(page);
    await page.route('**/api/orders**', (route) => route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'PRODUCT_INACTIVE', message: 'Product is inactive', details: [] } }),
    }));
    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await fillValidOrder(form, 'P-OFF');
    await form.submit();

    await expect(form.alerts).toContainText(/Product inactive in the catalog/i);
    await expect(form.nameInput).toHaveValue(client.name);
    await expect(form.documentInput).toHaveValue(client.document);
    await expect(form.emailInput).toHaveValue(client.email);
    await expect(form.itemRow('P-OFF')).toBeVisible();
  });

  test('UI-003 | blocks adding the same product twice with a clear message', async ({ page }) => {
    await stubCatalog(page);
    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await form.addProduct('P-100');
    await expect(form.itemRow('P-100')).toBeVisible();
    await form.addProduct('P-100');

    await expect(form.alerts).toContainText(/Product already added: P-100/i);
    await expect(form.selectedItemsTable.getByRole('row')).toHaveCount(2);
  });

  test('UI-004 | enforces quantity boundaries and accepts 1 and 999', async ({ page }) => {
    await stubCatalog(page);
    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await form.productIdInput.fill('P-100');
    await form.addProductQuantityInput.fill('0');
    await form.addProductButton.click();
    await expect(form.main).toContainText(/Quantity must be between 1 and 999/i);
    await expect(form.itemRow('P-100')).toHaveCount(0);

    await form.addProduct('P-100', 1);
    await expect(form.itemRow('P-100')).toBeVisible();
    await form.addProduct('P-200', 999);
    await expect(form.itemRow('P-200')).toBeVisible();
    await expect(form.main).toContainText(/199,900\.00|199\.900,00/);

    await form.productIdInput.fill('P-200');
    await form.addProductQuantityInput.fill('1000');
    await form.addProductButton.click();
    await expect(form.main).toContainText(/Quantity must be between 1 and 999/i);
    await expect(form.itemRow('P-200')).toHaveCount(1);
  });

  test('UI-005 | blocks invalid email and overlong document without creating an order', async ({ page }) => {
    await stubCatalog(page);
    let createRequestCount = 0;
    await page.route('**/api/orders**', async (route) => {
      if (route.request().method() === 'POST') createRequestCount += 1;
      await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    });
    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await form.fillClient({ ...client, email: 'invalid-email' });
    await form.addProduct('P-100');
    await form.submit();
    await expect(form.emailInput).toHaveClass(/is-invalid/);
    await expect(form.main).toContainText(/Invalid e-mail/i);
    expect(createRequestCount).toBe(0);

    await form.emailInput.fill(client.email);
    await form.documentInput.fill('123456789012345678901');
    await form.submit();
    await expect(form.documentInput).toHaveClass(/is-invalid/);
    expect(createRequestCount).toBe(0);
  });

  test('UI-006 | reports an unknown product ID', async ({ page }) => {
    await stubCatalog(page);
    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await form.addProduct('P-404');

    await expect(form.alerts).toContainText(/Product not found: P-404/i);
    await expect(form.itemRow('P-404')).toHaveCount(0);
  });

  test('UI-007 | shows CATALOG_UNAVAILABLE and preserves the order when submit fails', async ({ page }) => {
    await stubCatalog(page);
    await page.route('**/api/orders**', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE', message: 'Catalog service unavailable', details: [] } }),
    }));
    const form = new OrdersPage(page);
    await form.gotoNewOrder();
    await fillValidOrder(form);
    await form.submit();

    await expect(form.alerts).toContainText(/catalog/i);
    await expect(form.nameInput).toHaveValue(client.name);
    await expect(form.documentInput).toHaveValue(client.document);
    await expect(form.emailInput).toHaveValue(client.email);
    await expect(form.itemRow('P-100')).toBeVisible();
  });

test('UI-008 | paginates orders and opens the selected order details', async ({ page }) => {
    await stubOrders(page);
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();

    await expect(ordersPage.ordersTable).toBeVisible();
    await expect(ordersPage.orderRow(21)).toBeVisible();
    await expect(ordersPage.orderRow(1)).toHaveCount(0);
    await expect(ordersPage.nextPageButton).toBeVisible();
    await ordersPage.goToNextPage();
    await expect(ordersPage.orderRow(1)).toBeVisible();
    await expect(ordersPage.orderRow(21)).toHaveCount(0);
    await ordersPage.openOrderDetails(1);

    await expect(page).toHaveURL(/\/orders\/1$/);
  });

  test('UI-009 | filters the orders list by status', async ({ page }) => {
    await stubOrders(page);
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();

    await expect(ordersPage.statusFilter).toBeVisible();
    await ordersPage.filterByStatus('CRIADO');

    await expect(ordersPage.orderRow(20)).toBeVisible();
    await expect(ordersPage.orderRow(19)).toHaveCount(0);
  });

});


