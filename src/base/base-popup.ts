import type { Locator, Page } from "@playwright/test";
import Widget, { IWidget } from "src/base/base-widget";
import logger from "src/utils/logger";
import { IWait } from "./base-component";
export interface IPopup extends IWidget {
	btnClose?: string | Locator;
	trigger?: string | Locator;
	root: string | Locator;
}
/** A modal: opened by its trigger, asserted by its root, closed by btnClose. */
class Popup extends Widget {
	protected btnClose?: Locator | string;
	protected root: Locator | string;
	constructor(page: Page, options: IPopup) {
		super(page, options);
		this.root = options.root;
		this.btnClose = options?.btnClose;
		this.trigger = options?.trigger;
	}
	async open() {
		if (await this.isVisible(this.root)) {
			logger.debug("Popup is already opened.");
			return;
		}
		if (!this.trigger) {
			throw new Error("Trigger is not set. Cannot activate the popup.");
		}
		await this.click(this.trigger);
	}

	/**
	 * Asserts that the popup appears.
	 * @param options - Optional parameters for waiting.
	 * @returns A Promise that resolves when the assertion is successful.
	 */
	async assertAppear(options?: IWait): Promise<void> {
		logger.debug(
			"Asserting that the popup appears with root locator: ",
			this.root,
		);
		await this.assertVisible(this.root, options || { timeout: 500 });
	}

	/**
	 * Asserts that the popup element disappears from the page.
	 *
	 * @param options - The options for waiting. Popup normally takes a while to disappear, so the default timeout is 500ms.
	 * @returns A Promise that resolves when the element disappears.
	 */
	async assertDisappear(options?: IWait): Promise<void> {
		logger.debug("Asserting that the popup disappears.");
		await this.assertNotVisible(this.root, options || { timeout: 500 });
	}

	async close(): Promise<void> {
		logger.debug("Closing the popup.");
		if (!this.btnClose) {
			throw new Error("Close button is not set.");
		}
		await this.click(this.btnClose);
	}
}
export default Popup;
