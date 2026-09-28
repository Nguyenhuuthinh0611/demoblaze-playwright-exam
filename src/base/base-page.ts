import { errors } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { config } from "dotenv";
import BaseComponent, { IWait } from "src/base/base-component";
import logger from "src/utils/logger";
import { scaled } from "src/utils/timeouts";
config();

// Shared by selfNavigate()/goto() below. Bounded so a stuck navigation fails
// with an honest navigation timeout, instead of running until the test's own
// timeout kills the page mid-navigation (which surfaces as a misleading
// "Target page ... has been closed" error).
/**
 * Base navigation budget, BEFORE per-browser scaling. Always pass it through
 * scaled() at the call site rather than using it raw — see
 * src/utils/timeouts.ts: WebKit navigates noticeably slower than Chromium,
 * which is what the scaling exists to absorb.
 */
export const NAVIGATION_TIMEOUT = 30000;

// A navigation the SITE interrupted with one of its own — a goto()/reload()
// can land while the page fires its own redirect, common on sites with
// client-side auth/session-driven routing. Each engine words it differently,
// so both spellings are treated as the same benign case (Edge shares
// Chromium's networking stack and reports the identical "net::ERR_ABORTED").
// A genuine TimeoutError is treated as benign here too — by the time this
// fires, the page has very likely already reflected whatever the caller was
// waiting on; a caller that needs a harder guarantee should verify the
// resulting state explicitly rather than lean on this alone.
const BENIGN_NAVIGATION_INTERRUPTIONS = [
	"net::ERR_ABORTED", // Chromium (and Edge)
	"Navigation canceled by policy check", // WebKit
];

/**
 * Whether a goto()/reload() rejection is one of the above benign,
 * safe-to-swallow-and-continue interruptions rather than a real failure.
 * Exported standalone (not a class method) so any call site — a Page class,
 * or a project-specific auth helper — can reuse the
 * exact same check without depending on a BasePage instance.
 */
export function isBenignNavigationInterruption(err: unknown): boolean {
	return (
		BENIGN_NAVIGATION_INTERRUPTIONS.some((s) => String(err).includes(s)) ||
		(err as Error)?.name === "TimeoutError"
	);
}

/**
 * Represents a base page component.
 * This class is used to create a new page, including Home, Login, Register, Dashboard, etc.
 * The BasePage class extends the BaseComponent class and adds page-specific fields like url, actions around navigation, and API collection.
 */
export default class BasePage extends BaseComponent {
	protected _url!: string;
	public static _testInfo: TestInfo;
	constructor(page: Page, testInfo?: TestInfo) {
		super(page);
		// Single source of truth for the "current test" TestInfo — always take
		// the latest one given (not `||`, which would lock onto the first test
		// ever constructed in this worker process and never update again,
		// silently misattaching every later test's screenshots to it).
		if (testInfo) {
			BasePage._testInfo = testInfo;
		}
	}

	// Actions

	/**
	 * Shared navigation call behind selfNavigate()/goto() below — bounded to
	 * NAVIGATION_TIMEOUT and waits only for `domcontentloaded` rather than the
	 * full `load` event, so a slow-to-settle asset/analytics script can't
	 * stall the whole navigation on its own. A genuine timeout here is
	 * rethrown as a plain, purpose-built Error naming the URL and the bound
	 * that was exceeded — distinct from Playwright's own TimeoutError (whose
	 * generic call-log wording doesn't say "this was navigation, to this
	 * URL") and, more importantly, distinct from the misleading "Target page
	 * ... has been closed" error a caller would otherwise see if this ran
	 * unbounded until the surrounding test's own timeout force-closed the
	 * page mid-navigation.
	 *
	 * The retry deliberately drops to `waitUntil: "commit"` — it does NOT get
	 * a bigger budget (still the same NAVIGATION_TIMEOUT, still exactly one
	 * retry), it just accepts a weaker readiness signal on the last-ditch
	 * attempt. A cold or congested load can take far longer than a warm one,
	 * and a second `domcontentloaded` attempt would then fail the whole test
	 * on a site that is merely slow, not broken. "commit" only
	 * needs the response headers; the DOM is then given one more bounded but
	 * BEST-EFFORT chance to finish parsing, so a caller is handed a page in
	 * the usual state whenever the site gets there at all, and simply an
	 * earlier one when it doesn't (every locator that follows auto-waits
	 * regardless). This makes the suite tolerate a slow public site rather
	 * than pretending to fix it; aborted navigations (seen under parallel
	 * load) get the same single retry.
	 */
	private async navigateTo(url: string): Promise<void> {
		const attemptGoto = (waitUntil: "domcontentloaded" | "commit") =>
			this.getPage().goto(url, {
				timeout: scaled(NAVIGATION_TIMEOUT),
				waitUntil,
			});
		try {
			await attemptGoto("domcontentloaded");
		} catch (err) {
			// An ABORTED navigation (another navigation or the engine cancelled
			// it — seen against DemoBlaze under parallel load) gets the same
			// single retry as a timeout: the page is simply
			// not there yet, and one more attempt is what a user would do.
			if (
				!(err instanceof errors.TimeoutError) &&
				!isBenignNavigationInterruption(err)
			) {
				throw err;
			}
			// Observed tripping this bound on a single Chromium run while the
			// same site loaded fine on Edge/WebKit moments later — a one-off
			// slow/stalled load (cold connection, transient network hiccup),
			// not a page that's genuinely stuck. Retry once, still bounded by
			// the same timeout, before treating it as a real failure.
			logger.warn(
				`Navigation to "${url}" timed out once, retrying (waiting only for "commit" this time). Error: ${err}`,
			);
			try {
				await attemptGoto("commit");
			} catch (retryErr) {
				if (retryErr instanceof errors.TimeoutError) {
					throw new Error(
						`Navigation timeout: "${url}" did not even return response headers within ${scaled(NAVIGATION_TIMEOUT)}ms after a retry (site may be slow/unresponsive).`,
					);
				}
				throw retryErr;
			}
			// Best-effort by design: the retry above already succeeded, so a
			// page that is still parsing is not a failure to report — it just
			// reaches the caller a little earlier in its life than usual.
			await this.getPage()
				.waitForLoadState("domcontentloaded", {
					timeout: scaled(NAVIGATION_TIMEOUT),
				})
				.catch((settleErr) =>
					logger.warn(
						`Navigation to "${url}" committed but had not reached "domcontentloaded" ${scaled(NAVIGATION_TIMEOUT)}ms later — continuing anyway. Error: ${settleErr}`,
					),
				);
		}
	}

	/**
	 * Navigates to the current page URL and takes a screenshot.
	 *
	 * @return {Promise<void>} A promise that resolves when the navigation and screenshot are complete.
	 */
	async selfNavigate() {
		logger.info(`Self navigating to: ${this._url}`);
		try {
			if (this.getCurrentUrl() !== this._url) {
				await this.navigateTo(this._url);
				await this.screenshotAndAttach(`Self navigate to: ${this._url}`, {
					state: "domcontentloaded",
					sleep: 2000,
				});
			}
		} catch (err) {
			logger.error(`Failed to self-navigate to: ${this._url}. Error: ${err}`);
			throw err;
		}
	}

	/**
	 * Reloads the current page.
	 *
	 * @return {Promise<void>} A promise that resolves when the page is successfully reloaded.
	 */
	async reload() {
		try {
			await this.getPage().reload();
		} catch (err) {
			logger.error(`Failed to reload page. Error: ${err}`);
			throw err;
		}
	}

	/**
	 * Navigates back to the previous page in the browser's history. Bounded,
	 * and waits only for `commit` — confirmed live this specific case (a
	 * history entry whose URL is identical to the current page, e.g. after a
	 * a POST-and-redirect form control that returns to the
	 * SAME URL, adding a duplicate history entry rather than updating the
	 * page in place) restores from the browser's back/forward cache instead
	 * of firing a fresh `domcontentloaded` — waiting on that event here hangs
	 * indefinitely (well past this method's own `timeout`, since the
	 * underlying navigation never actually settles for Playwright to time
	 * out on). `commit` only waits for the navigation to be received and
	 * about to commit, which still fires for a bfcache restore.
	 */
	async goBack() {
		logger.info("Navigating back to the previous page");
		try {
			await this.getPage().goBack({
				timeout: scaled(NAVIGATION_TIMEOUT),
				waitUntil: "commit",
			});
		} catch (err) {
			logger.error(`Failed to navigate back. Error: ${err}`);
			throw err;
		}
	}

	/**
	 * Navigates to the specified URL.
	 * @param {string} url - The URL to navigate to.
	 */
	async goto(url: string) {
		logger.info(`Navigating to: ${url}`);
		try {
			await this.navigateTo(url);
		} catch (err) {
			logger.error(`Failed to navigate to: ${url}. Error: ${err}`);
			throw err;
		}
	}

	/**
	 * Waits for the page's URL to match — for SPA hash-route transitions
	 * (e.g. `#shipping` -> `#payment`) that don't trigger a full navigation,
	 * where a preceding click can silently no-op (validation still pending
	 * server-side) and leave the page on its current step.
	 */
	async waitForUrl(
		url: string | RegExp,
		options?: {
			timeout?: number;
			waitUntil?: "load" | "domcontentloaded" | "networkidle";
		},
	) {
		logger.debug(`Waiting for URL: ${url}`);
		await this.getPage().waitForURL(url, options);
	}

	// Get information

	/**
	 * Returns the current URL of the page.
	 * @returns {Promise<string>} - The current URL.
	 */

	getCurrentUrl(): string {
		try {
			return this.getPage().url();
		} catch (err) {
			logger.error(`Failed to get current URL. Error: ${err}`);
			throw err;
		}
	}

	/**
	 * Takes a screenshot and attaches it to the test report.
	 * @param title - The title of the screenshot.
	 * @param options - Optional parameters for customizing the screenshot behavior.
	 */
	async screenshotAndAttach(title: string, options?: IWait) {
		logger.info(`Taking screenshot and attaching: ${title} after...`);
		try {
			if (process.env.CAPTURE === "1") {
				await this.waitForOptions(options || { sleep: 3000 });
				const screenshot = await this.screenshot();
				if (BasePage._testInfo) {
					await BasePage._testInfo.attach(title, {
						body: screenshot,
						contentType: "image/png",
					});
				}
			}
		} catch (err) {
			logger.error(`Failed to take/attach screenshot: ${title}. Error: ${err}`);
			throw err;
		}
	}
}
