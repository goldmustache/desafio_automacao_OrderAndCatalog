import { expect, test, type Page } from '@playwright/test';
import { CatalogPage } from './pages/catalog-page';
import { DashboardPage } from './pages/dashboard-page';

interface CatalogProduct {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  currentPrice: { value: number; currency: string } | null;
}

const products: Record<string, CatalogProduct> = {
  'PROD-001': { id: 'PROD-001', name: 'Standard product', status: 'ACTIVE', currentPrice: { value: 100, currency: 'BRL' } },
  'PROD-002': { id: 'PROD-002', name: 'Second product', status: 'ACTIVE', currentPrice: { value: 200, currency: 'BRL' } },
  'PROD-PRICE': { id: 'PROD-PRICE', name: 'Price format product', status: 'ACTIVE', currentPrice: { value: 1234.5, currency: 'BRL' } },
  'PROD-WINDOW': { id: 'PROD-WINDOW', name: 'Current window product', status: 'ACTIVE', currentPrice: { value: 765.43, currency: 'BRL' } },
  'PROD-OFF': { id: 'PROD-OFF', name: 'Inactive product', status: 'INACTIVE', currentPrice: { value: 80, currency: 'BRL' } },
  'PROD-NOPR': { id: 'PROD-NOPR', name: 'No current price product', status: 'ACTIVE', currentPrice: null },
};

function productById(id: string): CatalogProduct | undefined {
  return products[id];
}

async function stubCatalogApi(page: Page): Promise<void> {
  await page.route('**/api/catalog/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    if (request.method() === 'GET') {
      const productId = requestUrl.pathname.split('/').pop() ?? '';
      const product = productById(productId);
      if (!product) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found', details: [] } }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(product) });
      return;
    }

    const body = request.postDataJSON() as { productIds: string[] };
    const prices = body.productIds.flatMap((productId) => {
      const product = productById(productId);
      if (!product) return [];
      const { id, ...price } = product;
      return [{ productId: id, ...price }];
    });
    const notFound = body.productIds.filter((productId) => !productById(productId));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prices, notFound }),
    });
  });
}

async function openCatalogWithProducts(page: Page): Promise<CatalogPage> {
  await stubCatalogApi(page);
  const catalog = new CatalogPage(page);
  await catalog.goto();
  return catalog;
}

function pricePattern(value: string): RegExp {
  const [integerPart, decimalPart] = value.split('.');
  return new RegExp(`${integerPart?.replaceAll(',', '[.,]')}[.,]${decimalPart}`);
}

test.describe('Catalog page', () => {
  test('CAT-001 | opens Catalog from the sidebar', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/orders**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    }));
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.selectLanguage('Português');
    await dashboard.openCatalog();
    const catalog = new CatalogPage(page);

    await expect(page).toHaveURL(/\/catalog$/);
    await expect(catalog.heading).toHaveText('Catálogo');
    await expect(catalog.subtitle).toHaveText('Consulta de produtos e preços vigentes');
    await expect(catalog.catalogNavigationLink).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });

  test('CAT-002 | opens Catalog directly through its deep URL', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(page).toHaveURL(/\/catalog$/);
    await expect(catalog.heading).toBeVisible();
    await expect(catalog.catalogNavigationLink).toHaveClass(/active/);
  });

  test('CAT-003 | explains ID and batch lookup in an informative note', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.lookupNotice).toContainText(/lookup by ID|consulta por ID/i);
    await expect(catalog.lookupNotice).toContainText(/batch lookup|consulta em lote|consulta por lote/i);
    await expect(catalog.lookupNotice).toContainText(/no full product listing|no hay list|não há listagem/i);
  });

  test('CAT-004 | shows the initial empty state without a results table', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.initialEmptyState).toBeVisible();
    await expect(catalog.resultsTable).toHaveCount(0);
  });

  test('CAT-005 | shows the field label, placeholder, and batch help text', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.productIdsInput).toBeVisible();
    await expect(catalog.productIdsInput).toHaveAttribute('placeholder', /PROD-001/);
    await expect(catalog.productIdsHelp).toContainText(/comma-separated|separated by commas|separados por vírgula/);
    await expect(catalog.productIdsHelp).toContainText(/50/);
  });

  test('CAT-006 | does not expose product registration or listing controls', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(page.getByRole('button', { name: /Create product|New product|Add product|Cadastrar produto|Novo produto|Adicionar produto|Delete|Edit|Excluir|Editar/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Create product|New product|Cadastrar produto|Novo produto|List all/ })).toHaveCount(0);
  });

  test('CAT-007 | looks up one existing product with its current details', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-001');

    const row = catalog.productRow('PROD-001');
    await expect(row).toContainText('Standard product');
    await expect(row).toContainText(/100[.,]00/);
    await expect(row).toContainText('BRL');
    await expect(row).toContainText('ACTIVE');
  });

  test('CAT-008 | displays name, price, currency, and status from the API response', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/catalog/PROD-001'));
    await catalog.searchFor('PROD-001');
    const response = await responsePromise;
    const apiProduct = await response.json() as CatalogProduct;
    const row = catalog.productRow(apiProduct.id);

    expect(response.status()).toBe(200);
    await expect(row).toContainText(apiProduct.name);
    await expect(row).toContainText(pricePattern(apiProduct.currentPrice!.value.toFixed(2)));
    await expect(row).toContainText(apiProduct.currentPrice!.currency);
    await expect(row).toContainText(apiProduct.status);
  });

  test('CAT-009 | displays the current price supplied for the effective price window', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-WINDOW');

    const row = catalog.productRow('PROD-WINDOW');
    await expect(row).toContainText('Current window product');
    await expect(row).toContainText(pricePattern('765.43'));
    await expect(row).not.toContainText('100.00');
  });

  test('CAT-010 | formats BRL prices in Brazilian Portuguese', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.selectLanguage('Português');
    await catalog.searchFor('PROD-PRICE');

    await expect(catalog.productRow('PROD-PRICE')).toContainText(/R\$\s?1\.234,50/);
    await expect(catalog.productRow('PROD-PRICE')).toContainText('BRL');
  });

  test('CAT-011 | identifies an inactive product distinctly from an active product', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-OFF');

    await expect(catalog.productRow('PROD-OFF').getByRole('cell').last()).toHaveText('INACTIVE');
  });

  test('CAT-012 | shows a clear placeholder when the product has no current price', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-NOPR');
    const row = catalog.productRow('PROD-NOPR');

    await expect(row).toContainText('No current price product');
    await expect(row.getByRole('cell', { name: '—', exact: true })).toHaveCount(2);
    await expect(row).toContainText('ACTIVE');
  });

  test('CAT-013 | reports an unknown product ID without breaking the page', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('P-404');

    await expect(catalog.errorState).toContainText(/not found|não encontrado|no encontrado/i);
    await expect(catalog.productIdsInput).toHaveValue('P-404');
    await expect(catalog.heading).toBeVisible();
  });

  test('CAT-014 | trims leading and trailing spaces from a product ID', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    const requestPromise = page.waitForRequest((request) => request.url().includes('/api/catalog/PROD-001'));
    await catalog.searchFor('  PROD-001  ');

    const request = await requestPromise;
    expect(new URL(request.url()).pathname).toBe('/api/catalog/PROD-001');
    await expect(catalog.productRow('PROD-001')).toContainText('Standard product');
  });

  test('CAT-015 | treats product IDs as case-sensitive', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    const requestPromise = page.waitForRequest((request) => request.url().includes('/api/catalog/prod-001'));
    await catalog.searchFor('prod-001');

    const request = await requestPromise;
    expect(new URL(request.url()).pathname).toBe('/api/catalog/prod-001');
    await expect(catalog.errorState).toContainText(/not found|não encontrado|no encontrado/i);
  });

  test('CAT-016 | returns both products for a comma-separated batch', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-001,PROD-002');

    await expect(catalog.productRow('PROD-001')).toContainText('Standard product');
    await expect(catalog.productRow('PROD-002')).toContainText('Second product');
    await expect(catalog.resultsTable.getByRole('row')).toHaveCount(3);
  });

  test('CAT-017 | ignores spaces after commas in a batch lookup', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-001, PROD-002');

    await expect(catalog.productRow('PROD-001')).toBeVisible();
    await expect(catalog.productRow('PROD-002')).toBeVisible();
    await expect(catalog.resultsTable.getByRole('row')).toHaveCount(3);
  });

  test('CAT-018 | keeps known products visible when a batch includes an unknown ID', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-001, P-404');

    await expect(catalog.productRow('PROD-001')).toContainText('Standard product');
    await expect(catalog.notFoundAlert).toContainText('P-404');
    await expect(catalog.productRow('P-404')).toHaveCount(0);
  });

  test('CAT-019 | shows active, inactive, and no-price products independently in a batch', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    await catalog.searchFor('PROD-001, PROD-OFF, PROD-NOPR');

    await expect(catalog.productRow('PROD-001')).toContainText('ACTIVE');
    await expect(catalog.productRow('PROD-OFF')).toContainText('INACTIVE');
    await expect(catalog.productRow('PROD-NOPR').getByRole('cell', { name: '—', exact: true })).toHaveCount(2);
    await expect(catalog.notFoundAlert).toHaveCount(0);
  });

  test('CAT-020 | deduplicates repeated IDs in a batch request', async ({ page }) => {
    const catalog = await openCatalogWithProducts(page);
    let catalogRequestCount = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/catalog/')) catalogRequestCount += 1;
    });
    await catalog.searchFor('PROD-001, PROD-001');

    await expect(catalog.productRow('PROD-001')).toContainText('Standard product');
    await expect(catalog.resultsTable.getByRole('row')).toHaveCount(2);
    expect(catalogRequestCount).toBe(1);
  });
});
