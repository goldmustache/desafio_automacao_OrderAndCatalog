import type { Locator, Page } from '@playwright/test';

export type CatalogLanguage = 'Português' | 'English' | 'Español';

export class CatalogPage {
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly lookupNotice: Locator;
  readonly productIdsInput: Locator;
  readonly productIdsHelp: Locator;
  readonly searchButton: Locator;
  readonly initialEmptyState: Locator;
  readonly resultsTable: Locator;
  readonly notFoundAlert: Locator;
  readonly errorState: Locator;
  readonly languageButton: Locator;
  readonly languageMenu: Locator;
  readonly navigation: Locator;
  readonly catalogNavigationLink: Locator;
  readonly ordersNavigationLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: /Catalog|Catálogo/ });
    this.subtitle = page.getByText(/Product and current price lookup|Consulta de productos y precios vigentes|Consulta de produtos e preços vigentes/);
    this.lookupNotice = page.getByRole('note');
    this.productIdsInput = page.getByRole('textbox', { name: /Product IDs|IDs de productos|IDs dos produtos/ });
    this.productIdsHelp = page.getByText(/One ID for a single lookup|Un ID para consulta individual|Um ID para consulta individual/);
    this.searchButton = page.getByRole('button', { name: /Search|Consultar|Buscar/ });
    this.initialEmptyState = page.getByText(/Enter one or more product IDs to search|Informe um ou mais IDs de produtos para consultar|Ingrese uno o más IDs de productos para buscar/);
    this.resultsTable = page.getByRole('table', { name: /Results|Resultados/ });
    this.notFoundAlert = page.getByRole('alert');
    this.errorState = page.locator('app-error-state');
    this.languageButton = page.getByRole('button', { name: /Language|Idioma/ });
    this.languageMenu = page.locator('.dropdown-menu.show');
    this.navigation = page.getByRole('navigation', { name: /Menu de navegação|Menú de navegación|Navigation menu/ });
    this.catalogNavigationLink = this.navigation.locator('a[href="/catalog"]');
    this.ordersNavigationLink = this.navigation.locator('a[href="/orders"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/catalog');
  }

  async openFromSidebar(): Promise<void> {
    await this.page.goto('/');
    await this.navigation.locator('a[href="/catalog"]').click();
  }

  async searchFor(ids: string): Promise<void> {
    await this.productIdsInput.fill(ids);
    await this.searchButton.click();
  }

  productRow(productId: string): Locator {
    return this.resultsTable.getByRole('row').filter({
      has: this.page.getByRole('cell', { name: productId, exact: true }),
    });
  }

  async selectLanguage(language: CatalogLanguage): Promise<void> {
    await this.languageButton.click();
    await this.languageMenu.getByRole('button', { name: new RegExp(language) }).click();
  }
}
