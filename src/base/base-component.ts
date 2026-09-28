import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import logger from "src/utils/logger";
import { scaled } from "src/utils/timeouts";

/**
 * scaled(), but preserving `undefined` so Playwright still falls back to the
 * project-level `actionTimeout`/`expect.timeout` — which playwright.config.ts
 * already scales per project. Scaling an undefined into a number here would
 * silently override those.
 */
function scaledOrUndefined(ms: number | undefined): number | undefined {
	return ms === undefined ? undefined : scaled(ms);
}
import { randomCode } from "src/utils/random";

/**
 * Represents the options for waiting in UI automation.
 */
export interface IWait {
	/**
	 * Bounds how long the underlying Playwright wait/assertion/action may take
	 * to succeed. Forwarded directly into that call's own `timeout` option —
	 * never used to introduce a blocking sleep.
	 */
	timeout?: number;

	/**
	 * An explicit, deliberate pause — use only for a known fixed delay with no
	 * observable end-state to wait on instead (e.g. an animation). This is the
	 * only field that maps to a hard wait.
	 */
	sleep?: number;

	/**
	 * The state to wait for before continuing the automation.
	 * Possible values are "domcontentloaded", "load", or "networkidle".
	 */
	state?: "domcontentloaded" | "load" | "networkidle";
}

/**
 * Represents the options for filling a component.
 */
interface IFill extends IWait {
	/**
	 * Specifies whether to clear the component before filling it.
	 */
	clear?: boolean;
}

// click()'s own default timeout, before per-browser scaling. Pass a
// smaller/larger `timeout` explicitly at a call site that needs a different
// bound.
const DEFAULT_CLICK_TIMEOUT = 45000;

// clickAndCaptureDialog()'s wait for the dialog. Covers an alert raised
// after a server round trip (e.g. a login rejected by the API), not just a
// synchronous client-side validation alert.
const DEFAULT_DIALOG_TIMEOUT = 20000;

// fill()'s read-back check that the typed value stuck.
const FILL_VERIFY_TIMEOUT = 5000;

export default class BaseComponent {
	private _page: Page;
	/**
	 * Creates an instance of BasePage.
	 * @param {Page} page - The Playwright page object.
	 */
	constructor(page: Page) {
		this._page = page;
	}

	/**
	 * Retrieves the page associated with the base component.
	 * @returns The page associated with the base component.
	 */
	getPage(): Page {
		return this._page;
	}

	// Interaction methods

	/**
	 * Clicks on an element with the specified selector.
	 * @param {string} selector - The selector of the element to click.
	 */

	async click(selector: string | Locator, options?: IWait): Promise<void> {
		logger.debug(`Clicking element by selector: ${selector}`);
		await this.waitForOptions(options);
		try {
			await this.locator(selector).click({
				timeout: scaled(options?.timeout ?? DEFAULT_CLICK_TIMEOUT),
			});
		} catch (err) {
			logger.error(`Failed to click element: ${selector}. Error: ${err}`);
			throw err;
		}
	}

	/**
	 * Fills an input element with the specified text.
	 * @param {string} selector - The selector of the input element.
	 * @param {string} text - The text to fill in the input element.
	 */
	async fill(
		selector: string | Locator,
		text: string,
		options?: IFill,
	): Promise<void> {
		logger.debug(`Filling element by selector: ${selector} with text: ${text}`);
		await this.waitForOptions(options);
		const targetLocator = this.locator(selector);
		const attemptFill = async () => {
			if (options?.clear) {
				await targetLocator.clear({
					timeout: scaledOrUndefined(options?.timeout),
				});
			}
			await targetLocator.fill(text, {
				timeout: scaledOrUndefined(options?.timeout),
			});
			// Bounded: a value that did not stick will not appear by waiting
			// out the project's whole expect timeout (150s on WebKit).
			await expect(targetLocator).toHaveValue(text, {
				timeout: scaled(options?.timeout ?? FILL_VERIFY_TIMEOUT),
			});
		};
		try {
			await attemptFill();
		} catch (firstErr) {
			// Seen on WebKit in two Bootstrap modals (order card input, login
			// password input): the value read back empty after fill(). Root cause
			// not established. One re-type is cheap and has recovered it every
			// time; a field that is genuinely read-only or replaced still fails
			// on the second attempt.
			logger.warn(
				`Fill did not stick on ${selector}, retrying once. Error: ${firstErr}`,
			);
			try {
				await attemptFill();
			} catch (err) {
				logger.error(`Failed to fill element: ${selector}. Error: ${err}`);
				throw err;
			}
		}
	}

	/**
	 * Clicks, then waits for the ONE native dialog (alert/confirm) the click
	 * causes, accepts it and returns its message — for apps that report
	 * validation and results through `alert()` instead of the DOM.
	 *
	 * Unlike the `waitForPageDialogTo*()` listeners below, this handles
	 * exactly one dialog and leaves no listener behind, so two calls in a row
	 * cannot double-accept. The accept runs inside the event's own callback,
	 * not after `await click`: a synchronous `alert()` in an onclick blocks
	 * the click itself until the dialog is handled, so awaiting the click
	 * first would deadlock.
	 *
	 * Rejects with a timeout when no dialog appears — which is itself the
	 * signal for a test that expected one.
	 */
	async clickAndCaptureDialog(
		selector: string | Locator,
		options?: IWait,
	): Promise<string> {
		const timeout = scaled(options?.timeout ?? DEFAULT_DIALOG_TIMEOUT);
		const dialogMessage = this.getPage()
			.waitForEvent("dialog", { timeout })
			.then(async (dialog) => {
				const message = dialog.message();
				logger.info(`Accepting ${dialog.type()} dialog: "${message}"`);
				await dialog.accept();
				return message;
			});
		// Keeps a timeout here from surfacing as an unhandled rejection if the
		// click throws first; the awaited promise below still rejects normally.
		dialogMessage.catch(() => {});
		await this.click(selector);
		return dialogMessage;
	}

	// Read attribute methods

	/**
	 * Retrieves the inner text of an element, trimmed of surrounding
	 * whitespace — the common `(await this.locator(x).innerText()).trim()`
	 * idiom repeated across most Page-class getters. Prefer this over a raw
	 * `.innerText()` call for UI text (there's no separate untrimmed variant
	 * — trimming is correct for virtually every case a Page class reads UI
	 * copy for).
	 */
	async getTrimmedText(selector: string | Locator): Promise<string> {
		return (await this.locator(selector).innerText()).trim();
	}

	/**
	 * Asserts that an element specified by the given selector is visible.
	 *
	 * @param selector - The selector or locator of the element to assert visibility for.
	 * @param options - Optional wait options for the assertion.
	 */
	async assertVisible(selector: string | Locator, options?: IWait) {
		logger.debug(`Asserting element is visible: ${selector}`);

		try {
			await this.waitForOptions(options);
			await expect(this.locator(selector)).toBeVisible({
				timeout: scaledOrUndefined(options?.timeout),
			});
		} catch (err) {
			throw new Error(`Element is not visible: ${selector}, error: ${err}`);
		}
	}

	/**
	 * Asserts that an element with the specified selector is not visible.
	 *
	 * @param {string} selector - The selector of the element to assert.
	 * @return {Promise<void>} - A Promise that resolves when the assertion is successful.
	 */
	async assertNotVisible(selector: string | Locator, options?: IWait) {
		logger.debug(`Asserting element is not visible: ${selector}`);
		await this.waitForOptions(options);
		await expect(this.locator(selector)).not.toBeVisible({
			timeout: scaledOrUndefined(options?.timeout),
		});
	}

	/**
	 * Asserts the count of elements matching the given selector — a web-first
	 * assertion that retries internally, rather than a one-shot `.count()`
	 * read compared with a plain `expect().toBe()`.
	 *
	 * @param selector - The selector to match the elements.
	 * @param count - The expected count of elements.
	 * @param options - Optional wait options.
	 */
	async assertElementCount(
		selector: string | Locator,
		count: number,
		options?: IWait,
	) {
		logger.debug(`Asserting element ${selector} count: ${count}`);
		await this.waitForOptions(options);
		await expect(this.locator(selector)).toHaveCount(count, {
			timeout: scaled(options?.timeout ?? 5000),
		});
	}

	/**
	 * Asserts that the inner text of the element located by the given selector is equal to the specified text.
	 *
	 * @param {string} selector - The selector of the element to assert.
	 * @param {string} text - The text to check for in the inner text of the element.
	 * @return {Promise<void>} - A Promise that resolves when the assertion is successful.
	 */
	async assertElementHasText(
		selector: string | Locator,
		text: string | RegExp,
		options?: IWait,
	) {
		logger.debug(`Asserting element ${selector} has text: ${text}`);
		// Web-first: retries until the text matches, so content rendered after
		// an async request is not read too early. A string match normalises
		// whitespace; pass a RegExp for anything stricter.
		await expect(this.locator(selector)).toHaveText(text, {
			timeout: scaledOrUndefined(options?.timeout),
		});
	}

	/**
	 * Asserts that the inner text of the element located by the given selector contains the specified text.
	 *
	 * @param {string} selector - The selector of the element to assert.
	 * @param {string} text - The text to check for in the inner text of the element.
	 * @return {Promise<void>} - A Promise that resolves when the assertion is successful.
	 */
	async assertElementHasTextContains(
		selector: string | Locator,
		text: string | RegExp,
		options?: IWait,
	) {
		logger.debug(`Asserting element ${selector} contains text: ${text}`);
		await expect(this.locator(selector)).toContainText(text, {
			timeout: scaledOrUndefined(options?.timeout),
		});
	}

	/**
	 * Asserts that the attribute of an element has the specified value.
	 *
	 * @param {string | Locator} selector - The selector of the element or a Locator object.
	 * @param {string} attribute - The attribute of the element to check.
	 * @param {string} value - The value to check for in the attribute.
	 * @return {Promise<void>} - A Promise that resolves when the assertion is successful.
	 */
	async assertElementAttributeHasValue(
		selector: string | Locator,
		attribute: string,
		value: string,
	) {
		expect(await this.locator(selector).getAttribute(attribute)).toBe(value);
	}

	/**
	 * Pauses the execution for a specified amount of time.
	 * @param time - The duration to sleep in milliseconds. If not provided, defaults to 200 milliseconds.
	 */
	async sleep(time?: number) {
		const _time = time || 200;
		logger.debug(`Sleeping for: ${_time}...`);
		await new Promise((resolve) => setTimeout(resolve, _time));
		logger.debug("wake up!");
	}

	/**
	 * Runs any wait conditions common to actions/assertions: an explicit
	 * `sleep`, then a page load `state`. `timeout` is intentionally not
	 * consumed here — the calling method forwards it to its own underlying
	 * Playwright call, so the bound applies to the actual action/assertion
	 * rather than a blind sleep.
	 */
	async waitForOptions(options?: IWait) {
		if (options?.sleep) {
			await this.sleep(options.sleep);
		}
		if (options?.state) {
			await this.waitForLoadState(options.state);
		}
	}

	/**
	 * Waits for the specified time in milliseconds.
	 * @param {number} time - The time to wait in milliseconds.
	 */
	async waitForTimeout(time: number) {
		logger.debug(`Waiting for timeout: ${time}`);
		await this._page.waitForTimeout(time);
	}

	async waitForLoadState(state: "load" | "domcontentloaded" | "networkidle") {
		logger.debug(`Wait for load state: ${state}`);
		await this._page.waitForLoadState(state);
	}

	/**
	 * Takes a screenshot of the current page.
	 * @returns {Promise<Buffer | void>} A promise that resolves to a Buffer containing the screenshot image data, or void if an error occurs.
	 */
	async screenshot(): Promise<Buffer> {
		const imageName = `screenshot-${Date.now()}-${randomCode(8)}.png`;
		logger.debug(`Capturing screenshot: ${imageName}`);
		try {
			return await this._page.screenshot({
				path: `playwright-report/data/screenshots/${imageName}.png`,
				timeout: 5000,
			});
		} catch (err) {
			logger.error(`Failed to capture screenshot: ${imageName}. Error: ${err}`);
			throw err;
		}
	}

	// Element methods

	/**
	 * Returns a Locator object for the specified selector.
	 * @param selector - The selector string or Locator object.
	 * @param options - Optional parameters for locating the element.
	 * @returns The Locator object for the specified selector.
	 * @throws Error if the page is not initialized.
	 */
	locator(selector: string | Locator): Locator {
		if (!this._page) {
			throw new Error("Page is not initialized");
		}
		return typeof selector === "string"
			? this._page.locator(selector)
			: selector;
	}

	/**
	 * Replaces the placeholders in the given selector with the provided arguments and returns a Locator object.
	 *
	 * Placeholders are `$0`, `$1`, … — see e.g. `HOME_UI.btnProductByName`.
	 *
	 * @param selector - The selector string with placeholders.
	 * @param args - The arguments to replace the placeholders in the selector.
	 * @returns A Locator object representing the updated selector.
	 * @throws Error if the page is not initialized.
	 */
	locatorWithArgs(selector: string, ...args: any[]): Locator {
		if (!this._page) {
			throw new Error("Page is not initialized");
		}
		let _selector = selector;
		for (let i = 0; i < args.length; i++) {
			_selector = _selector.replace(`$${i}`, args[i]);
		}
		return this.locator(_selector);
	}

	/**
	 * Checks if an element with the specified selector is visible.
	 * @param {string} selector - The selector of the element.
	 * @returns {Promise<boolean>} - True if the element is visible, false otherwise.
	 */
	async isVisible(
		selector: string | Locator,
		options?: IWait,
	): Promise<boolean> {
		await this.waitForOptions(options);
		return await this.locator(selector).isVisible();
	}
}
