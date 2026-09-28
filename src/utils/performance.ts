import type { Page, TestInfo } from "@playwright/test";

/** Navigation Timing Level 2 milestones, relative to navigation start (ms). */
export interface NavigationTimings {
	ttfbMs: number;
	domContentLoadedMs: number;
	loadMs: number;
	transferSizeBytes: number;
}

/**
 * Reads the browser's own Navigation Timing entry for the current document.
 * Waits for the `load` event first — `loadEventEnd` is 0 until it fires.
 */
export async function getNavigationTimings(
	page: Page,
): Promise<NavigationTimings> {
	await page.waitForLoadState("load");
	return page.evaluate(() => {
		const [nav] = performance.getEntriesByType(
			"navigation",
		) as PerformanceNavigationTiming[];
		return {
			ttfbMs: Math.round(nav.responseStart - nav.startTime),
			domContentLoadedMs: Math.round(
				nav.domContentLoadedEventEnd - nav.startTime,
			),
			loadMs: Math.round(nav.loadEventEnd - nav.startTime),
			transferSizeBytes: nav.transferSize,
		};
	});
}

/** Times one async operation in wall-clock milliseconds. */
export async function timed<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
	const start = performance.now();
	const result = await fn();
	return { result, ms: Math.round(performance.now() - start) };
}

/** Nearest-rank percentile (p in 0..100) of a non-empty sample. */
export function percentile(samples: number[], p: number): number {
	if (samples.length === 0) {
		throw new Error("percentile() of an empty sample");
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const rank = Math.ceil((p / 100) * sorted.length);
	return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export interface LatencySummary {
	samples: number;
	minMs: number;
	p50Ms: number;
	p95Ms: number;
	maxMs: number;
}

export function summarize(samples: number[]): LatencySummary {
	return {
		samples: samples.length,
		minMs: Math.min(...samples),
		p50Ms: percentile(samples, 50),
		p95Ms: percentile(samples, 95),
		maxMs: Math.max(...samples),
	};
}

/**
 * Attaches measurements to the report as JSON, so every run leaves a record
 * that can be compared across runs — a budget pass/fail alone says nothing
 * about the trend.
 */
export async function attachMetrics(
	testInfo: TestInfo,
	name: string,
	metrics: unknown,
): Promise<void> {
	await testInfo.attach(name, {
		body: JSON.stringify(metrics, null, 2),
		contentType: "application/json",
	});
}
