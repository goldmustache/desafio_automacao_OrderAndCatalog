# Workspace Instructions

This repository contains TypeScript API and UI tests built with Playwright Test.

- Keep API base URLs and credentials in environment variables; never commit secrets.
- Keep tests focused on REST behavior: methods, status codes, headers, response contracts, and error responses.
- Use the shared `RestClient` in `src/rest-client.ts` for HTTP operations.
- Keep UI selectors and page actions in page objects under `tests/ui/pages`.
- Keep API and UI test settings in separate projects inside `playwright.ui.config.ts`.
- Run `npm run typecheck`, `npm run test:api`, and `npm run test:ui` after changes.
- Update `README.md` when setup or test commands change.
