# coe-lead-desafio-master-automation

A TypeScript Playwright project with REST API validations and a page-object-based UI suite for the dashboard. API tests check status codes, JSON content types, response shapes, and not-found behavior. UI tests use accessible roles and labels from the application.

## Setup

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env`. Set `API_BASE_URL` to the Order Service API root, `CATALOG_API_BASE_URL` when running Catalog API cases, and `APP_BASE_URL` for UI tests.

The API suite in `tests/api-matrix.spec.ts` implements API-001 through API-052 for `/api/v1/orders` and `/api/v1/products`. Set seed product IDs and pricing values in `.env` to match the reference environment. Discount rounding and 100/101-item tests require the optional fixture variables shown in `.env.example`; catalog API tests require `CATALOG_API_BASE_URL`.

## Run

- `npm test` runs both API and UI suites through `playwright.ui.config.ts`.
- `npm run test:api` runs only the API project.
- `npm run test:ui` runs only the UI project against `http://localhost:4200` by default. Set `APP_BASE_URL` to override it.
- `npm run typecheck` checks TypeScript types.
- `npm run report` opens the last HTML report after a test run.

Install Chromium once before running UI tests with `npx playwright install chromium`.
UI tests open a visible Chromium window locally; when `CI` is set, they run headlessly.

Run the mutation suite only against a disposable test backend: order-creation cases persist records. API mutation, pricing-rule, pagination-seed, and dependency-fault scenarios require the reference data and service states listed in the API test matrix. Keep credentials and secrets out of source control; pass authentication through environment variables when required.

The shared `playwright.ui.config.ts` contains separate `api` and `ui` projects, with their own base URLs. `playwright.config.ts` re-exports the shared config so VS Code's Playwright discovery also finds both suites. The dashboard page object is in `tests/ui/pages/dashboard-page.ts`.
