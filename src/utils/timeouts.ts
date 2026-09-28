import { test } from "@playwright/test";

/**
 * Per-browser timeout scaling.
 *
 * The site's async chain — page load, then API calls that render the product
 * grid, product details and cart rows — runs noticeably slower on WebKit than
 * on Chromium (on this suite, roughly twice as long end to end). That is a
 * property of the engine, not a test defect, so the slower engine gets a
 * bigger time budget in one place rather than per-case tuning (see
 * CONTRIBUTING.md, "Cross-browser timeouts").
 *
 * The scale is resolved at CALL time from the running test's own project
 * name, not at module load: a single Playwright process runs more than one
 * project, so a module-level constant would bake in whichever project
 * happened to load the file first.
 */
const PROJECT_SCALE: Readonly<Record<string, number>> = {
	webkit: 2.5,
};

/** Scale factor for the project currently executing, or 1 outside a test. */
export function timeoutScale(): number {
	try {
		return PROJECT_SCALE[test.info().project.name] ?? 1;
	} catch {
		// test.info() throws outside a running test (e.g. a module-level
		// constant, or a standalone script). Unscaled is the safe default.
		return 1;
	}
}

/**
 * `ms` adjusted for the browser currently under test.
 *
 * Use this for every timeout a POM method passes to Playwright. Chromium is
 * unaffected (scale 1), so an existing value stays exactly as tuned while
 * WebKit gets the headroom it measurably needs.
 */
export function scaled(ms: number): number {
	return Math.round(ms * timeoutScale());
}
