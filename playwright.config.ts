import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config();

/**
 * How much longer WebKit gets than Chromium for the same work. Keep in step
 * with PROJECT_SCALE.webkit in src/utils/timeouts.ts — that one scales the
 * timeouts POM methods pass to Playwright themselves, this one scales the
 * budgets Playwright applies on their behalf. Changing one without the other
 * leaves half the suite on the old budget.
 *
 * WebKit runs the same flows noticeably slower than Chromium (on this suite,
 * roughly twice as long end to end), so it gets a bigger budget in one place
 * instead of per-test tuning. Scale first; whatever still fails afterwards is
 * a genuine bug, which is what makes the scaling useful as a diagnostic.
 */
const WEBKIT_SCALE = 2.5;

/** Browser-driven specs; run once per browser project below. */
const UI_SPECS = "ui/**/*.spec.ts";

export default defineConfig({
	testDir: "./tests",
	/**
	 * Generous on purpose. A cart or checkout test makes several navigations
	 * and API round trips against a public site whose latency varies, so a
	 * tight budget fails on latency rather than on a broken step — and a
	 * test-level timeout surfaces as a misleading "Target page has been
	 * closed" error on whichever step was in flight, not as the real cause.
	 */
	timeout: 150 * 1000,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	/**
	 * Retry on CI only, and only once. A second retry absorbs slightly more
	 * latency flakiness, but with action-level timeouts this high a
	 * genuinely-failing test costs the full budget per attempt — 2 retries
	 * risks blowing past the job's own `timeout-minutes`.
	 */
	retries: process.env.CI ? 1 : 0,
	/**
	 * WORKERS from the environment (CI sets it per job), default 2. Each
	 * worker gets an account of its own — auto-registered, or from
	 * data/accounts.json, whose pool must then hold at least shards x workers
	 * entries (see src/fixtures/account-pool.ts). Kept modest by default
	 * because the site under test is a shared public demo.
	 */
	workers: Number(process.env.WORKERS) || 2,
	/**
	 * Console (list, plus inline annotations on GitHub Actions), a
	 * self-contained HTML report, machine-readable JSON, and Allure for
	 * history/trends and per-step drill-down.
	 */
	reporter: [
		process.env.CI ? ["github"] : ["list"],
		["html", { outputFolder: "playwright-report", open: "never" }],
		["json", { outputFile: "playwright-report/results.json" }],
		["allure-playwright"],
	],
	/**
	 * Default for web-first assertions when a call site passes no `timeout`.
	 * Playwright's own 5s built-in is too short for content DemoBlaze renders
	 * only after one or more API responses.
	 */
	expect: {
		timeout: 60_000,
	},
	use: {
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		headless: true,
		/**
		 * Default for locating/acting on an element. Unbounded (Playwright's
		 * default of 0) means a stuck or missing element silently eats the
		 * whole test budget instead of failing with a clear error.
		 */
		actionTimeout: 60_000,
	},

	/**
	 * One project per test TYPE, and per browser for UI:
	 *
	 *   api          tests/api/**          no browser — request context only
	 *   performance  tests/performance/**  Chromium only: timings are compared
	 *                                      run-to-run, not browser-to-browser
	 *   chromium / webkit
	 *                tests/ui/**           the same UI specs on every engine
	 *
	 * Pick with --project, e.g. `--project=api` or `--project=webkit`.
	 */
	projects: [
		{
			name: "api",
			testMatch: "api/**/*.spec.ts",
		},

		{
			name: "performance",
			testMatch: "performance/**/*.spec.ts",
			use: { ...devices["Desktop Chrome"] },
			// Timing is the thing under test — never retry a slow run into a pass.
			retries: 0,
		},

		{
			name: "chromium",
			testMatch: UI_SPECS,
			use: { ...devices["Desktop Chrome"] },
		},

		{
			name: "webkit",
			testMatch: UI_SPECS,
			use: {
				...devices["Desktop Safari"],
				actionTimeout: 60_000 * WEBKIT_SCALE,
			},
			timeout: 150 * 1000 * WEBKIT_SCALE,
			expect: { timeout: 60_000 * WEBKIT_SCALE },
		},

		// Mobile emulation (e.g. devices["iPhone 15"], a WebKit preset) is
		// supported by src/fixtures/base-fixtures.ts but not enabled as a
		// project. Phone width is covered by LOGIN-031, which resizes the
		// viewport. DemoBlaze's navbar links stay visible at that width (its
		// collapse class is missing), so no extra POM work is needed.
	],
});
