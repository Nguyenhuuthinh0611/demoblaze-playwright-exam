# Contributing

Rules for extending this suite. What the framework is and how to run it is in
[README.md](README.md).

## Architecture: 3-layer POM

```
tests/**/*.spec.ts           Specs — Page method calls + test.step() only
src/pom/pages/**/*-page.ts   Page classes — business actions + assertions
src/pom/ui/**/*-ui.ts        UI files — a flat const object of selectors, nothing else
src/base/*.ts                Infrastructure — BaseComponent, BasePage, Widget, Popup
```

Copy the shape of `cart-ui.ts` → `cart-page.ts` → `cart-order.spec.ts`.
Each test type (UI, API, performance) has its own folder and Playwright
project; a new spec goes in the folder of its type.

## Adding a screen

1. **UI file** `src/pom/ui/<domain>/<name>-ui.ts`
   - XPath by default (`//input[@id='email']`, not `#email`).
   - Prefixes: `txt` input · `btn` button · `lbl` text · `img` · `chk` · `rad` · `ddl` dropdown · `root` container.
   - Placeholders are `$0`, `$1`… read with `locatorWithArgs()`.
2. **Page class** `src/pom/pages/<domain>/<name>-page.ts`
   - Extend `StorePage` (navbar, login modal and alerts are already there).
   - `protected _url` is a path (`/cart.html`), never a full URL.
   - Implement `assertLoaded()`; expose business actions and `assertXyz()` methods.
   - A modal is a `Popup` field, not entries in the UI file.
   - Pass every timeout through `scaled()`.
3. **Fixture** — only if it navigates or does setup. Otherwise construct the
   page from the one that led to it: `new CartPage(homePage.getPage())`.
4. **Spec** `tests/ui/<area>.spec.ts`
   - `import { test } from "src/fixtures"` — never from a single fixture file.
   - Title starts with the case ID from the workbook: `LOGIN-015: …`.
   - Each business action is a `test.step("Step N: …")` in the spec, not in the Page.
   - Exactly one tag: `@smoke` (core happy path) or `@regression`.

Then run `npx tsc --noEmit && npm run check` (type-check before formatting).

## Rules

- **No selectors and no `expect()` in UI specs.** A new check is a new
  `assertXyz()` on the Page. API and performance specs may use `expect`.
- **Tests are independent.** They run in parallel and in any order; never rely
  on another test's result or leftovers.
- **Known defects stay red.** A test for a confirmed bug asserts the correct
  behaviour and fails, with a `known-defect` annotation naming its DEF id.
  Never `test.skip()` or `test.fail()` — both hide the bug in the report.
- **Test data** comes from `src/data/demoblaze-data.ts`; accounts come from
  the `account` / `secondAccount` fixtures. Start a test logged in with
  `test.use({ session: "user" })`.
- **Imports** are root-relative: `src/...`, never `../../`.

## Fixtures

- Add each new `src/fixtures/<feature>-fixtures.ts` to `mergeTests(...)` in
  `src/fixtures/index.ts`; extend `base-fixtures`, never another feature file.
- Declare and implement a fixture in the same `extend()` call — otherwise it
  type-checks but fails at runtime with "Test has unknown parameter".
- A fixed account pool (`data/accounts.json`) needs at least
  **shards × workers** accounts, or parallel workers share one and corrupt
  each other's cart.

## DemoBlaze specifics

These cost real debugging time; the helpers below already handle them.

| Behaviour of the site | What to do |
|---|---|
| Errors and confirmations are native `alert()` dialogs | Use `clickAndCaptureDialog()` / `collectAlertsDuring()`; never leave a `page.on("dialog")` listener behind |
| Cart rows load one request at a time | Open the cart through `CartPage.navigate()` / `openCart()` / `reloadPage()`; they check the `/viewcart` line count |
| Login error wording is itself a defect (DEF-15) | Assert rejections with `assertLoginRejected()`; the wording is checked only in LOGIN-033 / API-010 |
| OK on the purchase confirmation can beat `/deletecart` (DEF-09) | Keep the wait in `CartPage.purchase()`. CART-037 reproduces the race and is flaky on WebKit by design — confirm it with `--repeat-each=10` |
| `page.reload()` after an accepted alert can hang | Re-open with `goto()`, as `CartPage.reloadPage()` does |
| API titles are not clean (`"Sony vaio i7\n"`) | Trim before comparing with the UI |
| The site is shared: fixed "unknown" usernames get registered | Generate negative data with `randomCode()` |
| WebKit sometimes reads a modal input back empty after `fill()` | `fill()` re-types once — keep that retry |
| More than ~3 workers makes the public site flaky | Keep `WORKERS` at 2–3 |

## Timeouts

- WebKit gets 2.5× the budgets: `WEBKIT_SCALE` in `playwright.config.ts` and
  `PROJECT_SCALE` in `src/utils/timeouts.ts` — change both together.
- Don't set timeouts with `test.describe.configure()`: it runs before the
  browser project is known and cannot be scaled.
- Raising a timeout diagnoses slowness; it is not a fix.

## Playwright pitfalls

- An XPath union `A | B` returns matches in document order — `.first()` can
  pick a hidden node. Race two separate waits instead.
- `.all()` and `expect.poll` don't re-render or reload anything; use
  auto-retrying assertions for content that changes.
- `waitForLoadState("networkidle")` never settles on sites that poll. Don't use it.
