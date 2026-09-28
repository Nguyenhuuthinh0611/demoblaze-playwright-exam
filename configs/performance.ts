/**
 * Performance budgets, in milliseconds. Every value can be overridden from
 * `.env` or the CI job without editing code — e.g. loosen them for a slow
 * network, or tighten them once a baseline is established.
 *
 * Defaults are deliberately loose: DemoBlaze is a public demo on shared
 * hosting, and a budget that trips on normal internet jitter only teaches
 * people to ignore the suite. They exist to catch a regression of an order
 * of magnitude, not a 10% drift.
 */
const num = (name: string, fallback: number) => {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const PERF_BUDGETS = {
	/** Navigation Timing: DOMContentLoaded, measured from navigation start. */
	domContentLoadedMs: num("PERF_DCL_BUDGET_MS", 5_000),
	/** Navigation Timing: the `load` event. */
	loadMs: num("PERF_LOAD_BUDGET_MS", 10_000),
	/** Until the page's own content (grid, product, cart rows) is visible. */
	contentVisibleMs: num("PERF_CONTENT_BUDGET_MS", 8_000),
	/** p95 of repeated API calls. */
	apiP95Ms: num("PERF_API_P95_BUDGET_MS", 2_000),
} as const;

/** Samples per API endpoint. Sequential, to measure latency, not load. */
export const PERF_API_SAMPLES = num("PERF_API_SAMPLES", 10);

/**
 * Concurrent requests in the burst test. Kept small on purpose: this is a
 * third-party public site, so the suite checks that a modest burst is served
 * correctly — it is not a load test and must never become one.
 */
export const PERF_API_CONCURRENCY = Math.min(
	num("PERF_API_CONCURRENCY", 5),
	10,
);
