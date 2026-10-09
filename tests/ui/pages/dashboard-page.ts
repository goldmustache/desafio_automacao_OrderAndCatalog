import type { Locator, Page } from '@playwright/test';

export type DashboardLanguage = 'Português' | 'English' | 'Español';

export class DashboardPage {
  readonly main: Locator;
  readonly heading: Locator;
  readonly description: Locator;
  readonly emptyStateMessage: Locator;
  readonly metricsNote: Locator;
  readonly quickActionsHeading: Locator;
  readonly createOrderLink: Locator;
  readonly viewOrdersLink: Locator;
  readonly catalogActionLink: Locator;
  readonly languageButton: Locator;
  readonly languageMenu: Locator;
  readonly navigation: Locator;
  readonly dashboardNavLink: Locator;
  readonly ordersNavLink: Locator;
  readonly catalogNavLink: Locator;
  readonly brandLink: Locator;
  readonly footer: Locator;
  readonly errorState: Locator;
  readonly retryButton: Locator;
  readonly mobileMenuButton: Locator;
  readonly notFoundHeading: Locator;

  constructor(private readonly page: Page) {
    this.main = page.getByRole('main');
    this.heading = page.getByRole('heading', { level: 1, name: 'Dashboard' });
    this.description = page.getByText(/Indicadores derivados dos dados carregados das APIs|Metrics derived from data loaded from the APIs/, { exact: true });
    this.emptyStateMessage = page.getByText(/Nenhum pedido carregado ainda\.|No orders loaded yet\./, { exact: true });
    this.metricsNote = page.getByRole('note');
    this.quickActionsHeading = page.getByRole('heading', { name: /Ações rápidas|Quick actions/ });
    this.createOrderLink = page.getByRole('link', { name: /Criar pedido|Create order/, exact: true });
    this.viewOrdersLink = page.getByRole('link', { name: /Ver pedidos|View orders/, exact: true });
    this.catalogActionLink = page.getByRole('link', { name: /Consultar catálogo|Browse catalog/, exact: true });
    this.languageButton = page.getByRole('button', { name: /Idioma|Language/ });
    this.languageMenu = page.locator('.dropdown-menu.show');
    this.navigation = page.getByRole('navigation', { name: /Menu de navegação|Menú de navegación|Navigation menu/ });
    this.dashboardNavLink = this.navigation.locator('a[href="/"]');
    this.ordersNavLink = this.navigation.locator('a[href="/orders"]');
    this.catalogNavLink = this.navigation.locator('a[href="/catalog"]');
    this.brandLink = page.getByRole('link', { name: /Pedidos & Catálogo|Orders & Catalog/ });
    this.footer = page.getByRole('contentinfo');
    this.errorState = page.locator('app-error-state');
    this.retryButton = this.errorState.getByRole('button');
    this.mobileMenuButton = page.getByRole('button', { name: /Menu de navegação|Navigation menu/ });
    this.notFoundHeading = page.getByRole('heading', { name: /Page not found|Página não encontrada|Página no encontrada/ });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async openOrders(): Promise<void> {
    await this.ordersNavLink.click();
  }

  async openCatalog(): Promise<void> {
    await this.catalogNavLink.click();
  }

  async openDashboardFromNavigation(): Promise<void> {
    await this.dashboardNavLink.click();
  }

  async openDashboardFromBrand(): Promise<void> {
    await this.brandLink.click();
  }

  async openCreateOrder(): Promise<void> {
    await this.createOrderLink.click();
  }

  async selectLanguage(language: DashboardLanguage): Promise<void> {
    await this.languageButton.click();
    await this.languageMenu.getByRole('button', { name: new RegExp(language) }).click();
  }
}