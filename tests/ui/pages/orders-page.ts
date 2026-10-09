import type { Locator, Page } from '@playwright/test';

export interface NewOrderClient {
  name: string;
  document: string;
  email: string;
}

export class OrdersPage {
  readonly heading: Locator;
  readonly newOrderLink: Locator;
  readonly emptyStateMessage: Locator;
  readonly emptyStateHint: Locator;
  readonly emptyStateCreateButton: Locator;
  readonly ordersTable: Locator;
  readonly statusFilter: Locator;
  readonly nextPageButton: Locator;
  readonly newOrderHeading: Locator;
  readonly nameInput: Locator;
  readonly documentInput: Locator;
  readonly emailInput: Locator;
  readonly productIdInput: Locator;
  readonly addProductQuantityInput: Locator;
  readonly addProductButton: Locator;
  readonly selectedItemsTable: Locator;
  readonly createOrderButton: Locator;
  readonly alerts: Locator;
  readonly main: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: /Pedidos|Orders/ });
    this.newOrderLink = page.getByRole('link', { name: /Novo pedido|New order/ });
    this.emptyStateMessage = page.getByText(/Nenhum pedido encontrado|No orders found/);
    this.emptyStateHint = page.getByText(/Crie o primeiro pedido da aplicação|Create the first order of the application/);
    this.emptyStateCreateButton = page.getByRole('button', { name: /Novo pedido|New order/ });
    this.ordersTable = page.getByRole('table');
    this.statusFilter = page.getByRole('combobox').first();
    this.nextPageButton = page.getByRole('button', { name: /Próxima|Next/ });
    this.newOrderHeading = page.getByRole('heading', { level: 1, name: /New order|Novo pedido/ });
    this.nameInput = page.getByRole('textbox', { name: /^(Name|Nome)$/ });
    this.documentInput = page.getByRole('textbox', { name: /^(Document|Documento)$/ });
    this.emailInput = page.getByRole('textbox', { name: /^(E-mail|Email)$/ });
    this.productIdInput = page.getByRole('textbox', { name: /^(Product|Produto)$/ });
    this.addProductQuantityInput = page.getByRole('spinbutton', { name: /^(Quantity|Quantidade)$/ });
    this.addProductButton = page.getByRole('button', { name: /Add product|Adicionar produto/ });
    this.selectedItemsTable = page.getByRole('table', { name: /Selected items|Itens selecionados/ });
    this.createOrderButton = page.getByRole('button', { name: /Create order|Criar pedido/ });
    this.alerts = page.getByRole('alert');
    this.main = page.getByRole('main');
  }

  async goto(): Promise<void> {
    await this.page.goto('/orders');
  }

  async gotoNewOrder(): Promise<void> {
    await this.page.goto('/orders/new');
  }

  async startNewOrderFromEmptyState(): Promise<void> {
    await this.emptyStateCreateButton.click();
  }

  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status);
  }

  orderRow(orderId: string | number): Locator {
    return this.ordersTable.getByRole('row').filter({
      hasText: new RegExp(`^\\s*${String(orderId)}(?:\\s|$)`),
    });
  }

  async openOrderDetails(orderId: string | number): Promise<void> {
    const row = this.orderRow(orderId);
    const detailsLink = row.getByRole('link');
    if (await detailsLink.count()) {
      await detailsLink.first().click();
      return;
    }

    await row.click();
  }

  async goToNextPage(): Promise<void> {
    await this.nextPageButton.click();
  }

  async fillClient(client: NewOrderClient): Promise<void> {
    await this.nameInput.fill(client.name);
    await this.documentInput.fill(client.document);
    await this.emailInput.fill(client.email);
  }

  async addProduct(productId: string, quantity = 1): Promise<void> {
    await this.productIdInput.fill(productId);
    await this.addProductQuantityInput.fill(String(quantity));
    await this.addProductButton.click();
  }

  itemRow(productId: string): Locator {
    return this.selectedItemsTable.getByRole('row').filter({ hasText: productId });
  }

  itemQuantity(productName: string): Locator {
    return this.selectedItemsTable.getByRole('spinbutton', {
      name: new RegExp(`Quantity: ${productName}|Quantidade: ${productName}`),
    });
  }

  async submit(): Promise<void> {
    await this.createOrderButton.click();
  }
}
