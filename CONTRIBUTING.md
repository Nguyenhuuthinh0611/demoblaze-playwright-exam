# Contributing — Conventions and Architecture

The rules for extending this suite. What the framework is, how it is laid
out and how to run it are in [README.md](README.md); this file does not repeat
them.

> Keep it current: every rule below exists because ignoring it cost someone a
> debugging session.

## Architecture: 3-layer POM

Every screen/feature is modeled across three layers. Never mix responsibilities
across layers.

```
tests/**/*.spec.ts              Layer 0 — Specs. Page method calls + test.step() only.
        │  imports `test` from src/fixtures (index.ts)
        ▼
src/pom/pages/**/*-page.ts      Layer 1 — Page: business actions (login(), placeOrder())
        │  + the assertions specs call, composing Widget/Popup classes
        ▼
src/pom/ui/**/*-ui.ts           Layer 2 — UI: a flat const object of selector strings.
        │                                  No class, no actions, no assertions.
        ▼
src/base/*.ts                   Layer 3 — Infrastructure (BasePage, BaseComponent, Widget, Popup)
```

Reference implementation: `src/pom/ui/shop/cart-ui.ts` +
`src/pom/pages/shop/cart-page.ts` + `tests/ui/cart-order.spec.ts` (and
`common/header-ui.ts` + `common/store-page.ts` for what every page shares).
Copy their shape. Test case design lives in
`docs/test-cases/demoblaze-test-cases.xlsx` — spec titles start with its IDs.
To add a screen, follow [Adding a screen](#adding-a-screen).

Each test type (UI, API, performance) has its own folder AND Playwright
project — see [README → Structure](README.md#structure). A new spec goes in
the folder of its type, never across them.

### Layer 2 — UI locator files

A single flat `const` object mapping a semantic name to a raw selector string,
`export default`ed.

**Prefer XPath**, even where CSS would technically work — an `id` lookup is
still `//input[@id='email']`, not `#email`. Consistency across the suite
outweighs the marginal CSS performance edge. CSS is supported
(`BaseComponent.locator()` hands the string to Playwright, which auto-detects
which is which) where a specific case is meaningfully cleaner.

**Naming prefixes**: `txt` input · `btn` button · `lbl` label/text/feedback ·
`img` image · `tab` top-level tab · `sub` submenu · `chk` checkbox · `rad`
radio · `ddl` dropdown trigger · `root` container. Group related locators under
a `// ─── Section ───` comment.

### Layer 1 — Page classes

Extend `StorePage` (`src/pom/pages/common/store-page.ts`, which extends
`BasePage` and adds the navbar, login modal and alert handling every DemoBlaze
page shares). Import the UI object directly (it is stateless — there is no
`this.ui` field to carry), and call the inherited action methods against its
strings: `this.click(CART_UI.btnPlaceOrder)`.
Set `protected _url` — as a PATH, not an absolute URL — so `selfNavigate()`
works against whatever `baseURL` the environment resolved to.

**Composite widgets are NOT entries in the flat UI object.** A modal (or any
other stateful component) is a class extending `Widget`
(`src/base/base-widget.ts`) — `Popup` (`src/base/base-popup.ts`) is the one in
use — instantiated as a field in the Page and fed selector strings from the UI
object, as `CartPage` does with its Place order modal:

```ts
export default class CartPage extends StorePage {
	private orderModal: Popup;

	constructor(...args: ConstructorParameters<typeof StorePage>) {
		super(...args);
		this.orderModal = new Popup(this.getPage(), {
			root: CART_UI.rootOrderModal,
			trigger: CART_UI.btnPlaceOrder,
			btnClose: CART_UI.btnOrderClose,
		});
	}
}
```

Reuse `Popup` for any new modal before writing custom interaction code. A new
kind of component (a dropdown, a table) gets its own `Widget` subclass.

**Entities** (`src/base/base-entity.ts`) are for API-side helpers against an
`APIRequestContext`, separate from the UI POM tree.

### Key base-class methods (inherited by every POM class)

- Interaction: `click`, `fill` (verifies the value stuck, re-types once),
  `clickAndCaptureDialog` (accepts one native dialog, returns its text)
- Reading: `getTrimmedText`, `isVisible`
- Assertions (all logged, web-first where Playwright supports it):
  `assertVisible`, `assertNotVisible`, `assertElementCount`,
  `assertElementHasText`, `assertElementHasTextContains`,
  `assertElementAttributeHasValue`
- Locators: `locator(selector)` and `locatorWithArgs(selector, ...args)` for
  `$0`-style placeholders — always go through these, never `page.locator()`
  directly in POM code, so logging stays consistent
- Waiting: `waitForOptions`, `waitForTimeout`, `waitForLoadState`, `sleep`
- `BasePage` adds: `selfNavigate`, `goto` (bounded, retried once), `reload`,
  `goBack`, `waitForUrl`, `getCurrentUrl`, `screenshotAndAttach` (gated by
  `CAPTURE=1`)
- `StorePage` adds what every DemoBlaze page shares: login/logout, session
  assertions, `collectAlertsDuring()` / `assertAlertShown()`,
  `simulateApiFailure()`, `setSessionCookie()`, `setViewport()`

Utils in `src/utils/`: `logger` (log4js → `logs/test.log`), `random.ts`
(Faker: `randomCode`, `randomPassword`), `timeouts.ts` (`scaled()`),
`performance.ts` (Navigation Timing, percentiles).

## Fixtures

One file per responsibility; the files are listed in
[README → Structure](README.md#structure). **Specs always import `test` from
`src/fixtures`** — never from `base-fixtures.ts` or a single
`<feature>-fixtures.ts`, or that spec only sees one file's fixtures and fails
at runtime on any other.

Rules for a new named Page fixture:

- **Only if the fixture body actually does something** (navigates, or performs
  required setup). A page reached purely mid-flow gains nothing from a fixture
  — construct it inline in the test from whichever page got you there.
- Key = camelCase of the class name (`CheckoutPage` → `checkoutPage`).
- Build from `basePage.getPage()`, not a fresh browser launch.
- `.navigate()` inside the fixture only for direct entry points.
- Extend `base-fixtures`, never another feature file; add the file to
  `mergeTests(...)`.
- Never declare a key in the `extend<{...}>` type block without implementing it
  in the SAME call. TypeScript allows the mismatch (Playwright's types permit
  partial implementation across separate `.extend()` calls); the fixture
  hard-fails at runtime with "Test has unknown parameter".

## Account pooling (logged-in suites)

Why each worker needs its own account, and how to supply accounts, is in
[README → Test accounts](README.md#test-accounts). The rules for the pool in
`src/fixtures/account-pool.ts`:

**The sizing rule: the pool must hold at least `shards × workers` entries**,
plus one more for every fixture that reserves an entry for itself. Below that,
`pickAccountFromPool()` wraps two live workers onto one account, and it
presents as unrelated assertion failures — never as a pool problem.

`resolveShardedIndex()` exists because `testInfo.parallelIndex` restarts at 0
in every separate Playwright PROCESS: two CI shards' worker 0 otherwise collide
on the same account. CI must therefore pass `SHARD` (1-based) to each shard.

## Conventions

- **Imports**: root-relative `src/...` (`import BasePage from "src/base/base-page"`),
  not `../../` — enabled by the `paths` mapping in `tsconfig.json`.
- **File naming**: kebab-case, suffixed by layer — `*-page.ts`, `*-ui.ts`,
  `*.spec.ts`, under `src/pom/{pages,ui}/<domain>/`.
- **No raw selectors or `expect()` in UI specs.** A new check means a new
  `assertXyz()` on the Page. Specs read as a sequence of Page method calls.
  API and performance specs assert on responses/measurements with `expect`
  directly — there is no page to hide selectors behind.
- **DemoBlaze reports through native `alert()`.** Capture it with
  `clickAndCaptureDialog()` (store it in `lastAlertMessage`, check with
  `assertAlertShown()`); never leave a `page.on("dialog")` listener behind.
- **Cart rows load asynchronously, one request each.** Reach the cart through
  `CartPage.navigate()` / `openCart()` / `reloadPage()` — they record the
  `/viewcart` line count, which `assertItemCount()` checks first. A bare row
  count can pass transiently while later rows are still loading.
- **Known defects stay executable**: `test.fail()` + a `known-defect`
  annotation naming the DEF id from the workbook, never `test.skip()`.
- **Report steps**: wrap each business action in `test.step("Step N: ...")` in
  the SPEC, not inside the Page method — the same method gets reused by tests
  with different narratives, and a step name baked into the method cannot be
  reworded per test. Number sequentially from `beforeEach` onward.
  `allure-playwright` renders each as a collapsible step; without them a test
  is one flat block no PO or PM can read.
- **Env config**: `configs/url.ts` maps `ENV` to a base URL, consumed as the
  context `baseURL` in `base-fixtures.ts`. `configs/.env.sample` documents
  every supported variable. Copy it to `.env` locally; never commit `.env`.
- **Test data**: non-secret data (products, order builder, alert texts) lives
  in `src/data/demoblaze-data.ts`; never hard-code it in a spec. Accounts come
  from fixtures (`account`, `secondAccount`), never from a spec. Start a test
  logged in with `test.use({ session: "user" })` (API login + cookie, empty
  cart); the default `guest` still empties the account's cart.
- **Tags**: Playwright's native option — `test("title", { tag: "@smoke" }, ...)`,
  or on a whole `describe`. `@smoke` = the core happy path of a flow;
  `@regression` = everything else. They flow into Allure labels automatically.
  Every test in this suite carries exactly one of the two (CI's push/PR gate
  runs `@smoke`, the nightly run everything).
- Prefer the semantic assertion helpers over raw `expect()` in POM code, so
  failures log consistently through `logger`.

## Cross-browser timeouts

`src/utils/timeouts.ts` holds `PROJECT_SCALE` and `scaled(ms)`;
`playwright.config.ts` holds `WEBKIT_SCALE` for the budgets Playwright applies
on the suite's behalf. **Keep the two in step** — changing one leaves half the
suite on the old budget.

Two rules that are easy to get wrong:

- **Resolve the scale at CALL time**, via `test.info().project.name`. One
  process runs multiple projects, so a value captured at module load is
  whatever loaded first.
- **`test.describe.configure({ timeout })` cannot be scaled** — it runs at
  module load, before the project is known, and it OVERRIDES the per-project
  config. Don't use it for timeouts.

Raising a timeout is a **diagnostic tool**, not a fix: it separates
genuinely-slow tests from genuinely-broken ones. Scale first, then treat
everything that still fails as a real bug.

## Traps confirmed the hard way

Each of these cost real debugging time. They are not hypothetical.

### Found on DemoBlaze

- **`page.reload()` right after accepting a native alert was seen to hang**
  without re-requesting the page (cart page, Chromium). Re-open with `goto()`
  instead — see `CartPage.reloadPage()`.
- **Clicking OK on the purchase confirmation immediately can leave the cart
  full** (DEF-09): `/deletecart` is fire-and-forget. `CartPage.purchase()`
  waits for it; keep that wait.
- **A bare cart row count passes transiently** while later rows are still
  loading. Always compare against the `/viewcart` line count (see
  Conventions).
- **Catalogue titles are not clean**: the API returns `"Sony vaio i7\n"`.
  Trim titles taken from the API before comparing them with the UI.
- **The public site is shared**: someone registered `"a".repeat(1000)` and
  `"   "` as usernames. Negative "unknown user" data must be random
  (`randomCode()`), never a fixed string.
- **The navbar never collapses** at phone width (`#navbarExample` lacks
  Bootstrap's `collapse` class). Do not add hamburger-menu handling.
- **On WebKit, an input inside a Bootstrap modal occasionally reads back
  empty** right after `fill()`. `BaseComponent.fill()` re-types once; do not
  remove that retry. Root cause not established.
- **Many workers make the public site flaky**: at 6 workers, whole batches
  failed with aborted navigations and socket timeouts, and passed when re-run
  at 3. Load on the shared site is the likely cause (inferred, not proven).
  Keep `WORKERS` at 2–3.

### General Playwright and CI lessons

Carried over from the project this framework was extracted from; they apply
to any Playwright suite.

- **An XPath union `A | B` returns DOCUMENT order**, not the order you wrote.
  `.first()` on one can silently lock onto a hidden node. Start two separate
  waits and `Promise.race()` them instead.
- **`expect.poll` only re-calls its function — it never reloads the page.** For
  a client-rendered listing, the poll body itself must re-fetch (re-open the
  tab, re-navigate), or it re-reads the same stale DOM until it expires.
- **`.all()` resolves its locators ONCE.** Use
  auto-retrying assertions for anything that re-renders.
- **`toHaveText()` matches raw `textContent`** — newlines, indentation and all
  — and CSS `text-transform` is invisible to it (an uppercased header still
  reads as its source case). Match with a `/^\s*Label\s*$/i` regex.
- **`waitForLoadState("networkidle")` never settles** on sites with polling or
  long-lived connections. Do not build a wait on it.
- **Grid row buttons can render BEFORE their click handler is bound**, and a
  click in that window is swallowed in total silence — it looks exactly like a
  bad locator. Wait for the handler (e.g. poll jQuery's `_data(el, "events")`)
  before clicking. DemoBlaze's cart Delete link is not affected: its handler is
  an inline `onclick`, live the moment the row exists.
- **A site-wide overlay's dismisser must not be a Locator action** when it is
  also registered as a locator handler: the handler runs first, closes the
  popup, and the outer action then waits out the full `actionTimeout`. Hide it
  with `page.evaluate()` instead.
- **After a locator handler runs, Playwright waits for the watched locator to
  be HIDDEN.** `pointer-events: none` is not enough. Use `display: none`.
- **GitHub Actions storage quota is metered over the BILLING PERIOD** (GB-month).
  Deleting artifacts does not free it. That is why each CI job publishes its
  own Allure report directly instead of through an artifact.
- **Run `tsc --noEmit` BEFORE `biome --write`.** Formatting a syntactically
  broken file cascades damage into code you never touched.

## Commands

```bash
npm ci && npx playwright install chromium webkit --with-deps   # setup
npx playwright test                                    # all tests, headless
npx playwright test --headed                           # headed
npx playwright test --project chromium                 # one project
HEADLESS=0 npx playwright test --project chromium --workers=1 file.spec.ts
npx playwright test --ui                               # trace/UI mode
ENV=staging npx playwright test                        # another environment
npx playwright test --project api                      # API tests only
npx playwright test --project performance              # performance only

npx playwright test --grep @smoke                      # smoke only
npx playwright test --grep-invert @regression          # everything but regression

npx tsc --noEmit        # type-check
npm run check           # Biome lint (no writes)
npm run fix             # Biome lint --write

npm run allure:serve    # serve allure-results locally
npm run allure:report   # generate static allure-report/
```

⚠️ A positional path is a FILTER, not a scope. `playwright test tests/ui`
baked into an npm script makes every path a caller appends widen the run
instead of narrowing it. Scope by project `testMatch` in the config, as this
repo does, and select with `--project` in scripts.

## Adding a screen

Four files, in this order: locators → Page → fixture (only if earned) → spec.

1. **UI file** `src/pom/ui/<domain>/<name>-ui.ts` — a flat `const` of selector
   strings (XPath by default, naming prefixes as above), `export default`ed.
   Never an XPath union with `.first()`.
2. **Page class** `src/pom/pages/<domain>/<name>-page.ts` — extends
   `StorePage` (or `BasePage` for a page outside the store), sets `protected _url` as a path, implements
   `assertLoaded()`, and exposes business actions plus the `assertXyz()`
   methods specs need. Composite widgets are `Widget`/`Popup` fields, not UI
   entries. Every timeout goes through `scaled()`. No `test.step()` inside.
3. **Fixture** — only if it navigates or performs setup; otherwise construct
   the page inline from the page that led to it. Add it to
   `src/fixtures/<feature>-fixtures.ts` and to `mergeTests(...)`.
4. **Spec** `tests/ui/<area>.spec.ts` — `import { test } from "src/fixtures"`,
   Page method calls only, numbered `test.step()`s, title starting with the
   case ID from the workbook.

Then run `npx tsc --noEmit && npm run check` — type-check before formatting.
