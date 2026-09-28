# DemoBlaze E2E Automation Framework

A Playwright + TypeScript test automation framework, demonstrated against
[DemoBlaze](https://www.demoblaze.com): **logging in with valid credentials**,
and **adding to cart then placing an order**, with validations for both the
typical path and edge cases. The same framework also runs API and performance
tests.

- Conventions and architecture rules: [CONTRIBUTING.md](CONTRIBUTING.md)
- Test case design: [docs/test-cases/demoblaze-test-cases.xlsx](docs/test-cases/demoblaze-test-cases.xlsx). It holds 61 UI cases (Login 28, Cart 33, including the end-to-end journey E2E-001), 15 API/performance cases, 17 defects (all confirmed on the live site) with evidence, execution status from the automated runs, the test data for manual runs (accounts, products, form data) and a change log


---

## Run the demo

**Requirements:** Node.js 18+ (22 recommended) and internet access to
demoblaze.com. No accounts and no `.env` are needed (see
[Test accounts](#test-accounts)).

```bash
npm ci
npx playwright install chromium webkit

npx playwright test tests/ui/purchase-flow.spec.ts --project=chromium   # the core demo: log in → add to cart → place order
npm run test:ui          # all UI tests, Chromium
npm run test:api         # API tests (no browser)
npm run test:perf        # performance tests
npm test                 # everything: UI on every browser project + API + performance
```

To watch the demo run in a visible browser, run one case, or debug
interactively:

```bash
HEADLESS=0 npx playwright test tests/ui/purchase-flow.spec.ts --project=chromium --workers=1
npx playwright test --grep LOGIN-015 --project=webkit   # one case, one browser
npx playwright test --ui                                # UI mode with time-travel debugging
```

On Windows PowerShell, use `$env:HEADLESS=0; npx playwright test ...`.

**Open the reports afterwards:**

```bash
npx playwright show-report   # Playwright HTML report: traces, screenshots and video of failures
npm run allure:serve         # Allure report: steps, tags, attached metrics, history
```

### What a run looks like

| Command | Tests | Measured time |
|---|---|---|
| `npm test` (UI on Chromium + WebKit, API, performance) | 135 | about 20 min (3 workers; measured at 124 tests) |
| `npm run test:api` | 10 | about 10 s |
| `npm run test:perf` | 5 | about 30 s |

The UI suite is 60 tests per browser; WebKit takes roughly twice as long as
Chromium. Timings depend on the public site's latency on the day.

Fourteen UI tests per browser (and one API test) are shown as `✘` yet counted
as **passed**. These are known-defect tests (see [Defects found](#defects-found)). They are marked
`test.fail()`, so the suite stays green while the defect exists, and it goes
red the moment the defect is fixed, prompting someone to flip the test.

One test is **expected to be flaky on WebKit**: CART-037 reproduces a timing
race (DEF-09) that leaves the cart full in about 2 of 10 WebKit runs, and never
on Chromium. It carries a `known-flaky` annotation; a WebKit failure there is
the defect showing, not a broken test.

---

## Requirements coverage

| Requirement | Where it is met |
|---|---|
| **Playwright + TypeScript** | Playwright 1.6x, strict TypeScript, Biome for lint/format |
| **Cross-browser / platform** | Projects `chromium` (Chrome engine) and `webkit` (Safari engine) run the same UI specs. CI adds an OS matrix: Linux, Windows and macOS |
| **Modular design** | A 3-layer Page Object Model, a separate API client, and fixtures composed with `mergeTests` (see [Structure](#structure)) |
| **CI/CD** | GitHub Actions, run on demand: choose scope, browser and OS; sharded; the combined Allure report is published to GitHub Pages. Push, pull-request and nightly triggers are prepared but switched off |
| **Configurable parameters** | `.env` / environment variables for environment, URLs, workers, headless mode, screen size, slow-mo and performance budgets ([configs/.env.sample](configs/.env.sample)) |
| **Comprehensive reporting** | Playwright HTML (trace, screenshot and video on failure), Allure (numbered steps, tags, attached metrics; published to GitHub Pages), JSON, a console reporter, and GitHub annotations on CI. Optional Slack and e-mail notifications |
| **UI tests** | `tests/ui/` covers login, cart and checkout, plus one end-to-end journey |
| **API tests** | `tests/api/` covers catalogue, auth and cart endpoints, and runs without a browser |
| **Regression** | Tests are tagged `@smoke` (core happy paths) or `@regression` (everything else). Run a scope with `--grep` |
| **Performance** | `tests/performance/` covers page-load milestones from the browser's Navigation Timing API, and API p50/p95 latency, against configurable budgets |
| **Typical and edge cases** | Required-field validation, wrong or unknown credentials, case sensitivity, 1000-character input, duplicate items, delete and recalculate, persistence across logout, a closed modal, an empty-cart order, confirmation contents |

---

## Structure

```
configs/
  url.ts                    ENV → site and API base URLs (overridable via env)
  performance.ts            Performance budgets (overridable via env)
src/
  base/                     Layer 3: infrastructure shared by every page
    base-component.ts         actions and assertions, all logged; clickAndCaptureDialog()
    base-page.ts              navigation with bounded retry, screenshots
    base-widget.ts, base-popup.ts   component base class, and the modal (Popup) built on it
    base-entity.ts            HTTP client base for API clients
  pom/
    ui/                     Layer 2: selectors only, as flat const objects
      common/header-ui.ts     navbar + Log in modal
      shop/{home,product,cart}-ui.ts
    pages/                  Layer 1: business actions + assertions
      common/store-page.ts    shared by every page: login/logout, session, alerts
      shop/home-page.ts       catalogue → openProduct(), openCart()
      shop/product-page.ts    getProductDetails(), addToCart()
      shop/cart-page.ts       cart contents, delete, place order, confirmation
  api/demoblaze-api.ts      Typed client for api.demoblaze.com
  data/demoblaze-data.ts    Products, order builder (Faker), the site's alert texts
  fixtures/
    base-fixtures.ts        Browser/context lifecycle, video, viewport per engine
    shop-fixtures.ts        account, demoblazeApi, session, homePage, cartPage
    account-pool.ts         One account per worker (pool or auto-registered)
    index.ts                mergeTests(...): the single `test` specs import
  utils/                    logger (log4js), timeouts, performance, random, ...
tests/                      Layer 0: specs, one folder per test type
  ui/        login.spec.ts, cart-order.spec.ts, purchase-flow.spec.ts
  api/       demoblaze-api.spec.ts
  performance/ performance.spec.ts
docs/test-cases/            Test design workbook (Excel)
.github/workflows/          CI pipeline
```

### Why it is built this way

**A strict 3-layer Page Object Model.** Specs contain only business steps
(`homePage.login(...)`, `cartPage.placeOrder(order)`). Page classes hold the
actions and the assertions. UI files hold nothing but selectors. When
DemoBlaze changes its markup, the fix is one line in a `*-ui.ts` file. When a
flow changes, the fix is one Page method, and no spec needs editing. This is
what makes the suite cheap to update as it grows.

**Specs read like the test case.** Each test title starts with its ID from
the workbook (`LOGIN-015: Wrong password is rejected`), and each business
action is a numbered `test.step()`. The Allure report therefore reads as the
manual test case did, and a failure points to the exact step.

**The site's quirks are handled once, in the framework.** DemoBlaze has
three habits that make naive tests flaky, and each is solved in one place:

| Quirk | How the framework handles it |
|---|---|
| Errors and confirmations are native `alert()` dialogs | `clickAndCaptureDialog()` accepts exactly one dialog and returns its text. Pages record it, and `assertAlertShown()` checks it |
| Cart rows load one request at a time, in random order | The cart page reads the server's line count from `/viewcart` and waits for that exact number of rows. Comparisons ignore order. A cart that is still loading can never pass as a shorter one |
| Order outcome is either an alert (rejected) or a dialog (accepted) | `attemptPurchase()` races both, so a wrongly accepted order fails fast with a clear message instead of timing out |

**Setup goes through the API; the behaviour under test goes through the UI.**
Cart tests start already logged in with an empty cart. The fixture logs in
through the API, sets the session cookie and clears the cart, which takes
about 1 s instead of a UI login. The UI login itself is covered by its own
spec and by the end-to-end journey. Each cart test therefore fails only for
cart reasons.

**Known defects are executable.** A defect found during test design stays in
the suite as a `test.fail()` test with a `known-defect` annotation, instead
of being skipped.

### Test accounts

Tests that log in cannot share one account, because parallel workers would
overwrite each other's carts. Each worker therefore gets its own account:

- **Default:** each worker registers a throwaway account (`pwexam_…`) through
  the signup API when it starts. A fresh clone, and CI without secrets, run
  with no setup.
- **Fixed accounts:** copy `data/accounts.sample.json` to
  `data/accounts.json` (gitignored) and fill in real accounts, at least one
  per worker. In CI, put the same JSON in the `TEST_ACCOUNTS_JSON` secret.

In both cases the account's cart is emptied before every test.

**Manual testing** uses four fixed accounts (TD-ACC-01…04, incl. a mixed-case
and a unicode username) listed on the workbook's **Test Data** sheet, with the
products and order-form data each case needs. They are public throwaway
accounts, separate from the ones the automated suite registers.

---

## Configuration

Everything is optional. Copy `configs/.env.sample` to `.env`, or set the
variables inline:

| Variable | Default | Purpose |
|---|---|---|
| `ENV` | `production` | Chooses the URL set in `configs/url.ts` (`staging` / `production`) |
| `PRODUCTION_URL`, `PRODUCTION_API_URL`, `STAGING_*` | demoblaze.com | Point the suite at another deployment without code changes |
| `WORKERS` | `2` | Parallel workers |
| `HEADLESS` | `1` | `0` shows the browser |
| `SLOW_MO` | `0` | Slows every action down (ms), for demos |
| `SCREEN_SIZE` | `1920x1080` | Desktop viewport |
| `CAPTURE` | `0` | `1` attaches a screenshot at each navigation |
| `PERF_*_BUDGET_MS` | see file | Performance budgets |

Browser and test type are chosen with `--project`
(`chromium`, `webkit`, `api`, `performance`), and the
scope with `--grep @smoke` or `--grep @regression`.

---

## CI (GitHub Actions)

[.github/workflows/playwright.yml](.github/workflows/playwright.yml)

The pipeline is **manual-only**: open **Actions → Playwright Tests → Run
workflow** and choose:

| Input | Options | Default |
|---|---|---|
| Scope | smoke / regression / all | all (every test case) |
| Browser | chromium / webkit / all | chromium |
| OS | Linux / Windows / macOS / all | Linux |
| Test target | a spec file or a test ID (e.g. `LOGIN-015`) | empty (use the scope) |

API and performance tests run in every workflow run. The automatic triggers
(on push, on pull request, nightly) are already in the workflow, commented
out under `on:`; uncomment the ones you want to switch them on.

**Allure report:** every run publishes the combined report to **https://nguyenhuuthinh0611.github.io/demoblaze-playwright-exam/**
(the latest run replaces the previous one). Each run also attaches it as a
downloadable artifact, `allure-report-<run number>`, next to the Playwright
HTML reports and the traces of any failures.

Each UI browser leg is split into 2 shards. Publishing to Cloudflare Pages,
and the Slack and e-mail notifications, are optional: they switch on only
when their secrets or variables are configured.

---

## Defects found

Test design came from reading the site's client-side source. Running the
suite then **confirmed all 17** on the live site, on both Chromium and WebKit
unless noted:

| ID | Defect | Test |
|---|---|---|
| DEF-01 | Whitespace-only username/password is not rejected as empty. It reaches the server, which answered "Wrong password.", so an account named `"   "` has actually been registered | LOGIN-021 |
| DEF-02 | An order can be placed with an empty cart: the purchase confirmation appears | CART-022 |
| DEF-03 | The credit card number is not validated (`abcd-xyz` is accepted) | CART-020 |
| DEF-04 | Expiry month and year are not validated (month 13, year `abcd`, year 2000 all accepted) | CART-021 |
| DEF-05 | Whitespace-only Name and Credit card are accepted | CART-024 |
| DEF-06 | The purchase confirmation's date shows the previous month (`getMonth()` is 0-based) | CART-025 |
| DEF-07 | The "Product added" alert differs for guests ("Product added") and logged-in users ("Product added.") | CART-032 |
| DEF-08 | Pressing Enter does not submit the login form | LOGIN-026 |
| DEF-09 | The cart can stay full after a purchase if OK is clicked before the background `/deletecart` call finishes. Seen once, on WebKit; the regular suite waits for that call, as a reading user would | CART-037 |
| DEF-10 | The purchase confirmation shows the full 16-digit card number instead of masking it | CART-033 |
| DEF-11 | A failed API call gives the user no feedback at all (no request has an error handler) | CART-034 |
| DEF-12 | An invalid product id shows an `undefined` product priced `$undefined`, with a working Add to cart button | CART-023 |
| DEF-13 | No brute-force protection: after 10 wrong passwords the correct one logs straight in | LOGIN-030 |
| DEF-14 | Catalogue data: "Sony vaio i7" is stored with a trailing newline | found while automating CART-028 / CART-035 |
| DEF-15 | Login errors reveal which usernames exist ("User does not exist." vs "Wrong password.") instead of one generic message | LOGIN-033, API-010 |
| DEF-16 | Spaces around a valid username are not trimmed, so a correct login is rejected as "User does not exist." | LOGIN-022 |
| DEF-17 | Items added to the cart as a guest are lost when the user logs in, instead of being merged into the account cart | CART-026 |

DEF-12, DEF-13 and DEF-15 are judged against common industry practice, because
DemoBlaze publishes no requirements. The workbook's Findings sheet has the
source-code evidence for each defect.

---

## Extending

- **A new screen:** see [CONTRIBUTING.md → Adding a screen](CONTRIBUTING.md#adding-a-screen).
- **A new API endpoint:** add a method to `src/api/demoblaze-api.ts`.
- **Mobile:** `base-fixtures.ts` already supports device emulation, for
  example `devices["iPhone 15"]` (WebKit). LOGIN-031 already checks a
  390×844 viewport. DemoBlaze's navbar links stay visible at phone width
  because its collapse class is missing, so a full mobile project can be
  added to `playwright.config.ts` without POM changes.
- **Another environment:** set `ENV=staging` with `STAGING_URL` and
  `STAGING_API_URL`.

Type-checking, linting and the full command list are in
[CONTRIBUTING.md → Commands](CONTRIBUTING.md#commands).
