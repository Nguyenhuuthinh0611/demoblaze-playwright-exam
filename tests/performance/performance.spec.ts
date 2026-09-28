import { expect } from "@playwright/test";
import {
	PERF_API_CONCURRENCY,
	PERF_API_SAMPLES,
	PERF_BUDGETS,
} from "configs/performance";
import { PRODUCTS } from "src/data/demoblaze-data";
import { test } from "src/fixtures";
import CartPage from "src/pom/pages/shop/cart-page";
import HomePage from "src/pom/pages/shop/home-page";
import ProductPage from "src/pom/pages/shop/product-page";
import {
	attachMetrics,
	getNavigationTimings,
	summarize,
	timed,
} from "src/utils/performance";

/**
 * Performance checks: page-load milestones from the browser's own Navigation
 * Timing API, and API latency percentiles. Budgets live in
 * configs/performance.ts and are overridable per run (PERF_*_BUDGET_MS).
 *
 * Runs in its own Chromium-only project ("performance" in
 * playwright.config.ts): timings are only comparable run-to-run on one
 * engine, and repeating them per browser would say nothing new.
 *
 * Every measurement is attached to the report as JSON, pass or fail.
 */
test.describe("Performance: page load", () => {
	test(
		"PERF-001: Home page loads and renders the catalogue within budget",
		{ tag: "@regression" },
		async ({ basePage }, testInfo) => {
			const homePage = new HomePage(basePage.getPage(), testInfo);
			// navigate() returns once the first product card is VISIBLE, so this
			// is time-to-content as a user sees it, not just time-to-DOM.
			const { ms: contentVisibleMs } = await timed(() => homePage.navigate());
			const timings = await getNavigationTimings(homePage.getPage());
			await attachMetrics(testInfo, "home-page-timings", {
				...timings,
				contentVisibleMs,
			});

			expect
				.soft(timings.domContentLoadedMs)
				.toBeLessThan(PERF_BUDGETS.domContentLoadedMs);
			expect.soft(timings.loadMs).toBeLessThan(PERF_BUDGETS.loadMs);
			expect.soft(contentVisibleMs).toBeLessThan(PERF_BUDGETS.contentVisibleMs);
		},
	);

	test(
		"PERF-002: Product page loads within budget",
		{ tag: "@regression" },
		async ({ basePage }, testInfo) => {
			const productPage = new ProductPage(basePage.getPage(), testInfo);
			const { ms: contentVisibleMs } = await timed(() =>
				productPage.navigate(PRODUCTS.samsungGalaxyS6.id),
			);
			const timings = await getNavigationTimings(productPage.getPage());
			await attachMetrics(testInfo, "product-page-timings", {
				...timings,
				contentVisibleMs,
			});

			expect
				.soft(timings.domContentLoadedMs)
				.toBeLessThan(PERF_BUDGETS.domContentLoadedMs);
			expect.soft(timings.loadMs).toBeLessThan(PERF_BUDGETS.loadMs);
			expect.soft(contentVisibleMs).toBeLessThan(PERF_BUDGETS.contentVisibleMs);
		},
	);

	test(
		"PERF-003: Cart page loads within budget",
		{ tag: "@regression" },
		async ({ basePage }, testInfo) => {
			const cartPage = new CartPage(basePage.getPage(), testInfo);
			const { ms: contentVisibleMs } = await timed(() => cartPage.navigate());
			const timings = await getNavigationTimings(cartPage.getPage());
			await attachMetrics(testInfo, "cart-page-timings", {
				...timings,
				contentVisibleMs,
			});

			expect
				.soft(timings.domContentLoadedMs)
				.toBeLessThan(PERF_BUDGETS.domContentLoadedMs);
			expect.soft(timings.loadMs).toBeLessThan(PERF_BUDGETS.loadMs);
			expect.soft(contentVisibleMs).toBeLessThan(PERF_BUDGETS.contentVisibleMs);
		},
	);
});

test.describe("Performance: API latency", () => {
	test(
		"PERF-004: Catalogue and product endpoints meet the p95 budget",
		{ tag: "@regression" },
		async ({ demoblazeApi }, testInfo) => {
			const endpoints = {
				"GET /entries": () => demoblazeApi.rawEntries(),
				"POST /view": () => demoblazeApi.rawView(PRODUCTS.samsungGalaxyS6.id),
			};
			for (const [name, call] of Object.entries(endpoints)) {
				const samples: number[] = [];
				for (let i = 0; i < PERF_API_SAMPLES; i++) {
					const { result, ms } = await timed(call);
					expect(result.status(), `${name} sample ${i + 1}`).toBe(200);
					samples.push(ms);
				}
				const summary = summarize(samples);
				await attachMetrics(testInfo, `${name} latency`, {
					...summary,
					samplesMs: samples,
				});
				expect
					.soft(summary.p95Ms, `${name} p95`)
					.toBeLessThan(PERF_BUDGETS.apiP95Ms);
			}
		},
	);

	test(
		"PERF-005: A small concurrent burst is served correctly and within budget",
		{ tag: "@regression" },
		async ({ demoblazeApi }, testInfo) => {
			const results = await Promise.all(
				Array.from({ length: PERF_API_CONCURRENCY }, () =>
					timed(() => demoblazeApi.rawEntries()),
				),
			);
			for (const { result } of results) {
				expect(result.status()).toBe(200);
			}
			const summary = summarize(results.map((r) => r.ms));
			await attachMetrics(testInfo, "burst latency", {
				concurrency: PERF_API_CONCURRENCY,
				...summary,
			});
			expect.soft(summary.p95Ms).toBeLessThan(PERF_BUDGETS.apiP95Ms);
		},
	);
});
