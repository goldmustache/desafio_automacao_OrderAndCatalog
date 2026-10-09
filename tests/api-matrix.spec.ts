import { randomUUID } from 'node:crypto';
import { expect, test, type APIResponse } from '@playwright/test';
import { RestClient } from '../src/rest-client';

const ordersPath = '/api/v1/orders';
const activeProductId = process.env.API_ACTIVE_PRODUCT_ID ?? 'PROD-001';
const secondProductId = process.env.API_SECOND_PRODUCT_ID ?? 'PROD-002';
const inactiveProductId = process.env.API_INACTIVE_PRODUCT_ID ?? 'PROD-003';
const noPriceProductId = process.env.API_NO_PRICE_PRODUCT_ID ?? 'PROD-004';
const notFoundProductId = process.env.API_MISSING_PRODUCT_ID ?? 'PROD-005';
const activeUnitPrice = Number(process.env.API_ACTIVE_PRODUCT_PRICE ?? 50);
const secondUnitPrice = Number(process.env.API_SECOND_PRODUCT_PRICE ?? 1200);
const catalogBaseUrl = process.env.CATALOG_API_BASE_URL;
const bulkProductIds = (process.env.API_BULK_PRODUCT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);

interface ClientData {
  name: string;
  document: string;
  email: string;
}

interface OrderItemInput {
  productId: string;
  quantity: number;
  [extra: string]: unknown;
}

interface OrderResponse {
  id: string;
  client: ClientData;
  items: Array<{
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  createdAt: string;
}

interface ErrorEnvelope {
  error: { code: string; message: string; details: unknown[] };
  requestId: string;
}

function uniqueClient(): ClientData {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 18);
  return {
    name: `API test ${suffix}`,
    document: suffix.slice(0, 18),
    email: `api-${suffix}@example.test`,
  };
}

function orderBody(items: OrderItemInput[], client = uniqueClient()) {
  return { client, items };
}

async function expectCreated(response: APIResponse): Promise<OrderResponse> {
  expect(response.status()).toBe(201);
  expect(response.headers()['content-type']).toContain('application/json');
  const result = await response.json() as OrderResponse;
  expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(result.status).toBe('CRIADO');
  expect(Number.isFinite(result.subtotal)).toBe(true);
  expect(Number.isFinite(result.discount)).toBe(true);
  expect(Number.isFinite(result.total)).toBe(true);
  return result;
}

async function expectApiError(response: APIResponse, status: number, code: string): Promise<ErrorEnvelope> {
  expect(response.status()).toBe(status);
  expect(response.headers()['content-type']).toContain('application/json');
  const result = await response.json() as ErrorEnvelope;
  expect(result).toMatchObject({
    error: { code, message: expect.any(String), details: expect.any(Array) },
    requestId: expect.any(String),
  });
  return result;
}

async function createOrder(api: RestClient, items: OrderItemInput[], client = uniqueClient()): Promise<OrderResponse> {
  const response = await api.post(ordersPath, orderBody(items, client));
  return expectCreated(response);
}

async function listOrders(api: RestClient, query = ''): Promise<{ content: OrderResponse[]; page: number; size: number; totalElements: number; totalPages: number }> {
  const response = await api.get(`${ordersPath}${query}`);
  expect(response.status()).toBe(200);
  return await response.json();
}

function roundingFixtureRequired(): boolean {
  return Boolean(process.env.API_ROUNDING_PRODUCT_ID && process.env.API_ROUNDING_EXPECTED_DISCOUNT);
}

function catalogApiRequired(): boolean {
  return Boolean(catalogBaseUrl);
}

function catalogUrl(path: string): string {
  return `${catalogBaseUrl?.replace(/\/$/, '') ?? ''}${path}`;
}

test.describe('API-001 to API-045 | Order Service', () => {
  test('API-001 | creates a valid one-item order', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 2 }]);

    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      productId: activeProductId,
      unitPrice: activeUnitPrice,
      quantity: 2,
      lineTotal: activeUnitPrice * 2,
    });
    expect(order.subtotal).toBe(activeUnitPrice * 2);
    expect(order.total).toBe(order.subtotal - order.discount);
  });

  test('API-002 | creates an order with multiple items', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [
      { productId: activeProductId, quantity: 1 },
      { productId: secondProductId, quantity: 1 },
    ]);

    expect(order.items).toHaveLength(2);
    expect(order.items.map((item) => item.lineTotal)).toEqual([activeUnitPrice, secondUnitPrice]);
    expect(order.subtotal).toBe(activeUnitPrice + secondUnitPrice);
    expect(order.total).toBe(order.subtotal - order.discount);
  });

  test('API-003 | ignores client-supplied item prices and totals', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{
      productId: activeProductId,
      quantity: 2,
      unitPrice: 0,
      lineTotal: 0,
      productName: 'Forged name',
    }]);

    expect(order.items[0]).toMatchObject({
      productId: activeProductId,
      productName: expect.not.stringMatching(/Forged name/),
      unitPrice: activeUnitPrice,
      lineTotal: activeUnitPrice * 2,
    });
    expect(order.total).toBe(order.subtotal - order.discount);
  });

  test('API-004 | preserves the price and product name in the created order detail', async ({ request }) => {
    const api = new RestClient(request);
    const created = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const response = await api.get(`${ordersPath}/${created.id}`);

    expect(response.status()).toBe(200);
    const detail = await response.json() as OrderResponse;
    expect(detail.items[0]).toMatchObject({
      productId: activeProductId,
      productName: created.items[0].productName,
      unitPrice: created.items[0].unitPrice,
      lineTotal: created.items[0].lineTotal,
    });
  });

  test('API-005 | creates every accepted order with status CRIADO', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);

    expect(order.status).toBe('CRIADO');
  });

  test('API-006 | does not discount a subtotal below the configured threshold', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 19 }]);

    expect(order.subtotal).toBeLessThan(1000);
    expect(order.discount).toBe(0);
    expect(order.total).toBe(order.subtotal);
  });

  test('API-007 | applies the active discount at the 1000.00 threshold', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 20 }]);

    expect(order.subtotal).toBe(1000);
    expect(order.discount).toBe(100);
    expect(order.total).toBe(900);
  });

  test('API-008 | rounds a configured half-cent discount using half-up rounding', async ({ request }) => {
    test.skip(!roundingFixtureRequired(), 'Set API_ROUNDING_PRODUCT_ID and API_ROUNDING_EXPECTED_DISCOUNT for the half-cent seed rule.');
    const api = new RestClient(request);
    const quantity = Number(process.env.API_ROUNDING_QUANTITY ?? 1);
    const order = await createOrder(api, [{ productId: process.env.API_ROUNDING_PRODUCT_ID!, quantity }]);

    expect(order.discount).toBe(Number(process.env.API_ROUNDING_EXPECTED_DISCOUNT));
    expect(order.total).toBe(Number((order.subtotal - order.discount).toFixed(2)));
  });

  test('API-009 | rounds item and order totals to two decimal places', async ({ request }) => {
    test.skip(!roundingFixtureRequired(), 'Set API_ROUNDING_PRODUCT_ID and API_ROUNDING_EXPECTED_DISCOUNT for the rounding fixture.');
    const api = new RestClient(request);
    const quantity = Number(process.env.API_ROUNDING_QUANTITY ?? 3);
    const order = await createOrder(api, [{ productId: process.env.API_ROUNDING_PRODUCT_ID!, quantity }]);

    for (const amount of [order.subtotal, order.discount, order.total, ...order.items.map((item) => item.lineTotal)]) {
      expect(Number.isInteger(amount * 100)).toBe(true);
    }
    expect(order.discount).toBe(Number(process.env.API_ROUNDING_EXPECTED_DISCOUNT));
  });

  test('API-010 | applies no discount when the product has no active discount rule', async ({ request }) => {
    test.skip(!process.env.API_NO_DISCOUNT_PRODUCT_ID, 'Set API_NO_DISCOUNT_PRODUCT_ID to a product without an active rule.');
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: process.env.API_NO_DISCOUNT_PRODUCT_ID!, quantity: 1 }]);

    expect(order.discount).toBe(0);
    expect(order.total).toBe(order.subtotal);
  });

  test('API-011 | applies the configured 15 percent rule at its 500.00 minimum', async ({ request }) => {
    test.skip(!process.env.API_SPECIAL_DISCOUNT_PRODUCT_ID, 'Set API_SPECIAL_DISCOUNT_PRODUCT_ID after configuring the 15%/500.00 rule.');
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: process.env.API_SPECIAL_DISCOUNT_PRODUCT_ID!, quantity: 12 }]);

    expect(order.subtotal).toBe(600);
    expect(order.discount).toBe(90);
    expect(order.total).toBe(510);
  });

  test('API-012 | rejects quantity zero', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 0 }]));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-013 | accepts the lower quantity boundary of one', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);

    expect(order.items[0].quantity).toBe(1);
  });

  test('API-014 | accepts the upper quantity boundary of 999', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 999 }]);

    expect(order.items[0].quantity).toBe(999);
    expect(order.items[0].lineTotal).toBe(order.items[0].unitPrice * 999);
  });

  test('API-015 | rejects quantity 1000', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1000 }]));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-016 | rejects negative quantity', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: -1 }]));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-017 | rejects an order with no items', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([]));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-018 | accepts an order containing one item', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);

    expect(order.items).toHaveLength(1);
  });

  test('API-019 | accepts an order containing 100 distinct items', async ({ request }) => {
    test.skip(bulkProductIds.length < 100, 'Set API_BULK_PRODUCT_IDS to 100 active product IDs for this boundary case.');
    const api = new RestClient(request);
    const items = bulkProductIds.slice(0, 100).map((productId) => ({ productId, quantity: 1 }));
    const order = await createOrder(api, items);

    expect(order.items).toHaveLength(100);
  });

  test('API-020 | rejects an order containing 101 items', async ({ request }) => {
    test.skip(bulkProductIds.length < 101, 'Set API_BULK_PRODUCT_IDS to 101 distinct product IDs for this boundary case.');
    const api = new RestClient(request);
    const items = bulkProductIds.slice(0, 101).map((productId) => ({ productId, quantity: 1 }));
    const response = await api.post(ordersPath, orderBody(items));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-021 | rejects a repeated product in one order', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([
      { productId: activeProductId, quantity: 1 },
      { productId: activeProductId, quantity: 1 },
    ]));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-022 | rejects an empty customer name', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }], { ...uniqueClient(), name: '' }));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-023 | rejects an empty customer document', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }], { ...uniqueClient(), document: '' }));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-024 | rejects an invalid customer document', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }], { ...uniqueClient(), document: '111.111.111-11' }));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-025 | rejects an invalid customer email', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }], { ...uniqueClient(), email: 'not-an-email' }));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-026 | rejects an empty customer email', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }], { ...uniqueClient(), email: '' }));

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-027 | rejects a JSON request body larger than one megabyte', async ({ request }) => {
    const api = new RestClient(request);
    const oversizedBody = JSON.stringify({
      client: { ...uniqueClient(), name: 'x'.repeat(1_600_000) },
      items: [{ productId: activeProductId, quantity: 1 }],
    });
    const response = await api.postRaw(ordersPath, oversizedBody);

    expect(response.status()).toBe(413);
    await expectApiError(response, 413, 'PAYLOAD_TOO_LARGE');
  });

  test('API-028 | rejects malformed JSON with the standard error envelope', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.postRaw(ordersPath, '{"client":');

    expect(response.status()).toBe(400);
    const error = await response.json() as ErrorEnvelope;
    expect(error.error).toMatchObject({ code: expect.any(String), message: expect.any(String), details: expect.any(Array) });
    expect(error.requestId).toEqual(expect.any(String));
  });

  test('API-029 | rejects a product that does not exist', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: notFoundProductId, quantity: 1 }]));

    await expectApiError(response, 422, 'PRODUCT_NOT_FOUND');
  });

  test('API-030 | rejects an inactive product', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: inactiveProductId, quantity: 1 }]));

    await expectApiError(response, 422, 'PRODUCT_INACTIVE');
  });

  test('API-031 | rejects an active product without a current price', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: noPriceProductId, quantity: 1 }]));

    await expectApiError(response, 422, 'NO_CURRENT_PRICE');
  });

  test('API-032 | persists no order when one item in the request is invalid', async ({ request }) => {
    const api = new RestClient(request);
    const before = await listOrders(api, '?page=0&size=1');
    const response = await api.post(ordersPath, orderBody([
      { productId: activeProductId, quantity: 1 },
      { productId: notFoundProductId, quantity: 1 },
    ]));
    await expectApiError(response, 422, 'PRODUCT_NOT_FOUND');
    const after = await listOrders(api, '?page=0&size=1');

    expect(after.totalElements).toBe(before.totalElements);
  });

  test('API-033 | stores the catalog price used when the order was created', async ({ request }) => {
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const detailResponse = await api.get(`${ordersPath}/${order.id}`);
    const detail = await detailResponse.json() as OrderResponse;

    expect(detail.items[0].unitPrice).toBe(order.items[0].unitPrice);
    expect(detail.items[0].productName).toBe(order.items[0].productName);
  });

  test('API-034 | returns CATALOG_UNAVAILABLE while the catalog service is stopped', async ({ request }) => {
    test.skip(process.env.API_CATALOG_FAULT_MODE !== 'down', 'Run with the catalog service stopped and API_CATALOG_FAULT_MODE=down.');
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }]));

    await expectApiError(response, 503, 'CATALOG_UNAVAILABLE');
  });

  test('API-035 | returns CATALOG_TIMEOUT when the catalog service times out', async ({ request }) => {
    test.skip(process.env.API_CATALOG_FAULT_MODE !== 'timeout', 'Run with the catalog service delayed and API_CATALOG_FAULT_MODE=timeout.');
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([{ productId: activeProductId, quantity: 1 }]));

    await expectApiError(response, 504, 'CATALOG_TIMEOUT');
  });

  test('API-036 | recovers after the catalog service returns', async ({ request }) => {
    test.skip(process.env.API_CATALOG_FAULT_MODE !== 'recovered', 'Run after restoring the catalog service with API_CATALOG_FAULT_MODE=recovered.');
    const api = new RestClient(request);
    const order = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);

    expect(order.status).toBe('CRIADO');
  });

  test('API-037 | lists the newest created order first', async ({ request }) => {
    const api = new RestClient(request);
    const older = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const newer = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const page = await listOrders(api, '?page=0&size=100');

    expect(page.content[0].id).toBe(newer.id);
    expect(page.content.findIndex((order) => order.id === older.id)).toBeGreaterThan(page.content.findIndex((order) => order.id === newer.id));
  });

  test('API-038 | accepts a page size of one', async ({ request }) => {
    const api = new RestClient(request);
    const page = await listOrders(api, '?page=0&size=1');

    expect(page.size).toBe(1);
    expect(page.content.length).toBeLessThanOrEqual(1);
  });

  test('API-039 | accepts a page size of 100', async ({ request }) => {
    const api = new RestClient(request);
    const page = await listOrders(api, '?page=0&size=100');

    expect(page.size).toBe(100);
    expect(page.content.length).toBeLessThanOrEqual(100);
  });

  test('API-040 | rejects a page size of 101', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.get(`${ordersPath}?page=0&size=101`);

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-041 | rejects a page size of zero', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.get(`${ordersPath}?page=0&size=0`);

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test('API-042 | filters the order list by CRIADO status', async ({ request }) => {
    const api = new RestClient(request);
    await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const page = await listOrders(api, '?page=0&size=100&status=CRIADO');

    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.every((order) => order.status === 'CRIADO')).toBe(true);
  });

  test('API-043 | paginates without duplicate or missing IDs between pages', async ({ request }) => {
    const api = new RestClient(request);
    const first = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const second = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const firstPage = await listOrders(api, '?page=0&size=1');
    const secondPage = await listOrders(api, '?page=1&size=1');
    const ids = [firstPage.content[0]?.id, secondPage.content[0]?.id];

    expect(firstPage.totalElements).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
  });

  test('API-044 | retrieves an order detail by UUID', async ({ request }) => {
    const api = new RestClient(request);
    const created = await createOrder(api, [{ productId: activeProductId, quantity: 1 }]);
    const response = await api.get(`${ordersPath}/${created.id}`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ id: created.id, client: created.client, status: 'CRIADO' });
  });

  test('API-045 | returns ORDER_NOT_FOUND for an unknown UUID', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.get(`${ordersPath}/${randomUUID()}`);

    await expectApiError(response, 404, 'ORDER_NOT_FOUND');
  });
});

test.describe('API-046 to API-049 | Catalog Service', () => {
  test('API-046 | queries a single product by ID', async ({ request }) => {
    test.skip(!catalogApiRequired(), 'Set CATALOG_API_BASE_URL to run Catalog Service API cases.');
    const api = new RestClient(request);
    const response = await api.get(catalogUrl(`/api/v1/products/${activeProductId}`));

    expect(response.status()).toBe(200);
    const product = await response.json();
    expect(product).toMatchObject({ id: activeProductId, name: expect.any(String), status: expect.any(String) });
    expect(product.currentPrice).toMatchObject({ value: expect.any(Number), currency: expect.any(String) });
  });

  test('API-047 | batch-queries existing and unknown product IDs', async ({ request }) => {
    test.skip(!catalogApiRequired(), 'Set CATALOG_API_BASE_URL to run Catalog Service API cases.');
    const api = new RestClient(request);
    const response = await api.post(catalogUrl('/api/v1/products/batch'), { productIds: [activeProductId, secondProductId, notFoundProductId] });

    expect(response.status()).toBe(200);
    const result = await response.json() as { prices: Array<{ productId: string }>; notFound: string[] };
    expect(result.prices.map((product) => product.productId)).toEqual(expect.arrayContaining([activeProductId, secondProductId]));
    expect(result.notFound).toContain(notFoundProductId);
  });

  test('API-048 | confirms the Catalog API has no full product listing endpoint', async ({ request }) => {
    test.skip(!catalogApiRequired(), 'Set CATALOG_API_BASE_URL to run Catalog Service API cases.');
    const api = new RestClient(request);
    const response = await api.get(catalogUrl('/api/v1/products'));

    await expectApiError(response, 404, 'NOT_FOUND');
  });

  test('API-049 | confirms reference seed product data is available', async ({ request }) => {
    test.skip(!catalogApiRequired(), 'Set CATALOG_API_BASE_URL to run Catalog Service API cases.');
    const api = new RestClient(request);
    const response = await api.get(catalogUrl(`/api/v1/products/${activeProductId}`));

    expect(response.status()).toBe(200);
    const product = await response.json();
    expect(product).toMatchObject({ id: activeProductId, status: 'ACTIVE' });
    expect(product.currentPrice).toMatchObject({ value: expect.any(Number), currency: expect.any(String) });
  });
});

test.describe('API-050 to API-052 | Error envelope and request IDs', () => {
  test('API-050 | returns a consistent error envelope for validation and lookup failures', async ({ request }) => {
    const api = new RestClient(request);
    const validationResponse = await api.post(ordersPath, orderBody([]));
    const validation = await expectApiError(validationResponse, 400, 'VALIDATION_ERROR');
    const missingResponse = await api.get(`${ordersPath}/${randomUUID()}`);
    const missing = await expectApiError(missingResponse, 404, 'ORDER_NOT_FOUND');

    expect(Object.keys(validation).sort()).toEqual(Object.keys(missing).sort());
    expect(Object.keys(validation.error).sort()).toEqual(Object.keys(missing.error).sort());
  });

  test('API-051 | echoes a client-supplied X-Request-Id', async ({ request }) => {
    const api = new RestClient(request);
    const requestId = `api-matrix-${randomUUID()}`;
    const response = await api.post(ordersPath, orderBody([]), { 'X-Request-Id': requestId });
    const envelope = await expectApiError(response, 400, 'VALIDATION_ERROR');

    expect(response.headers()['x-request-id']).toBe(requestId);
    expect(envelope.requestId).toBe(requestId);
  });

  test('API-052 | generates an X-Request-Id when none is supplied', async ({ request }) => {
    const api = new RestClient(request);
    const response = await api.post(ordersPath, orderBody([]));
    const envelope = await expectApiError(response, 400, 'VALIDATION_ERROR');

    expect(response.headers()['x-request-id']).toEqual(expect.any(String));
    expect(envelope.requestId).toBe(response.headers()['x-request-id']);
  });
});
