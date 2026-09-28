import { expect } from "@playwright/test";
import Popup from "src/base/base-popup";
import type { OrderDetails } from "src/data/demoblaze-data";
import StorePage from "src/pom/pages/common/store-page";
import CART_UI from "src/pom/ui/shop/cart-ui";
import logger from "src/utils/logger";
import { scaled } from "src/utils/timeouts";

// Each row costs its own /view round trip after /viewcart, so a cart of N
// items settles N requests after DOMContentLoaded.
const ROWS_TIMEOUT = 20000;
const MODAL_TIMEOUT = 10000;

export interface CartItem {
	title: string;
	price: number;
}

/** Parsed "Thank you for your purchase!" details. */
export interface PurchaseConfirmation {
	id: string;
	amount: number;
	cardNumber: string;
	name: string;
	date: string;
}

/**
 * Cart page (cart.html), with its Place order modal and the purchase
 * confirmation. Rows render asynchronously and in arbitrary order, so every
 * read here first waits for an expected row COUNT, and compares sets rather
 * than sequences.
 */
export default class CartPage extends StorePage {
	protected _url = "/cart.html";
	private orderModal: Popup;
	private lastConfirmation?: PurchaseConfirmation;
	/** Lines the server reported in the last /viewcart this page loaded. */
	private serverLineCount?: number;
	private purchaseOutcome?: "rejected" | "confirmed";

	constructor(...args: ConstructorParameters<typeof StorePage>) {
		super(...args);
		this.orderModal = new Popup(this.getPage(), {
			root: CART_UI.rootOrderModal,
			trigger: CART_UI.btnPlaceOrder,
			btnClose: CART_UI.btnOrderClose,
		});
	}

	/** The cart in a second tab of the same browser (same session). */
	async openInNewTab(): Promise<CartPage> {
		const tab = await this.getPage().context().newPage();
		const cartPage = new CartPage(tab);
		await cartPage.navigate();
		return cartPage;
	}

	async navigate(): Promise<void> {
		await this.trackCartLoad(() => this.selfNavigate());
	}

	/**
	 * Runs an action that (re)loads the cart page and records how many lines
	 * the server returned for it. Without this, "0 rows" is ambiguous right
	 * after a navigation: it reads the same for an empty cart and for a full
	 * one whose rows simply have not rendered yet.
	 */
	async trackCartLoad(load: () => Promise<unknown>): Promise<void> {
		const viewCart = this.getPage().waitForResponse(
			(r) => r.url().endsWith("/viewcart") && r.request().method() === "POST",
			{ timeout: scaled(ROWS_TIMEOUT) },
		);
		await load();
		const body = await (await viewCart).json();
		this.serverLineCount = body?.Items?.length ?? 0;
		logger.info(`Cart loaded: server reports ${this.serverLineCount} line(s)`);
		await this.assertLoaded();
	}

	async assertLoaded(): Promise<void> {
		await this.assertVisible(CART_UI.btnPlaceOrder);
	}

	/**
	 * Re-opens the cart by navigating to it, not via `page.reload()`: a
	 * reload issued right after a native alert was accepted was seen to hang
	 * without ever re-requesting cart.html, while goto() is bounded and
	 * retried (see BasePage.navigateTo()).
	 */
	async reloadPage(): Promise<void> {
		await this.trackCartLoad(() => this.goto(this._url));
	}

	// ─── Cart contents ───

	/** Table headers Pic / Title / Price / x, the Total panel and Place Order. */
	async assertLayout(): Promise<void> {
		await expect(this.locator(CART_UI.lblTableHeaders)).toHaveText([
			"Pic",
			"Title",
			"Price",
			"x",
		]);
		await this.assertVisible(CART_UI.lblTotalHeading);
		await this.assertVisible(CART_UI.lblTotal);
		await this.assertVisible(CART_UI.btnPlaceOrder);
	}

	/**
	 * Waits until exactly `count` rows are listed. This is the synchronisation
	 * point for everything else on the page — the total is a running sum that
	 * is only final once the last row has loaded.
	 */
	async assertItemCount(count: number): Promise<void> {
		// The server's line count is the real target: waiting for the ROW count
		// alone can pass transiently while later rows are still loading (1 of
		// 2 rendered reads as "1 row" just as well as a 1-line cart does).
		if (this.serverLineCount !== undefined) {
			expect(
				this.serverLineCount,
				"Lines returned by /viewcart for this page load",
			).toBe(count);
		}
		await this.assertElementCount(CART_UI.lblCartRows, count, {
			timeout: ROWS_TIMEOUT,
		});
	}

	async assertCartEmpty(): Promise<void> {
		expect(
			this.serverLineCount,
			"Cart was not loaded through navigate()/trackCartLoad(), so emptiness cannot be told apart from rows still loading",
		).toBeDefined();
		expect(this.serverLineCount).toBe(0);
		await this.assertItemCount(0);
		await this.assertElementHasText(CART_UI.lblTotal, "");
	}

	/** All rows as {title, price}. Call assertItemCount() first. */
	async getItems(): Promise<CartItem[]> {
		const titles = await this.locator(CART_UI.lblRowTitles).allInnerTexts();
		const prices = await this.locator(CART_UI.lblRowPrices).allInnerTexts();
		return titles.map((title, i) => ({
			title: title.trim(),
			price: Number(prices[i]),
		}));
	}

	/**
	 * Exactly these items are listed (order-insensitive; duplicates count).
	 * Waits for the row count first, so it is safe right after navigation.
	 */
	async assertContainsExactly(items: CartItem[]): Promise<void> {
		await this.assertItemCount(items.length);
		const byTitle = (a: CartItem, b: CartItem) =>
			a.title.localeCompare(b.title) || a.price - b.price;
		const actual = [...(await this.getItems())].sort(byTitle);
		const expected = [...items].sort(byTitle);
		logger.info(`Cart items: ${JSON.stringify(actual)}`);
		expect(actual).toEqual(expected);
	}

	/** The Total panel equals `expected` (call assertItemCount() first). */
	async assertTotal(expected: number): Promise<void> {
		await this.assertElementHasText(CART_UI.lblTotal, String(expected));
	}

	/**
	 * Deletes one row with this title and waits for the page to reload with
	 * one fewer row. A plain click is safe: the Delete link's handler is an
	 * inline `onclick` attribute, live the moment the row is inserted, so the
	 * "row rendered before its handler is bound" race cannot happen here.
	 */
	async deleteItem(title: string, currentCount: number): Promise<void> {
		logger.info(`Deleting cart item: ${title}`);
		await this.assertItemCount(currentCount);
		// Delete reloads the page, which re-fetches /viewcart.
		await this.trackCartLoad(() =>
			this.click(this.locatorWithArgs(CART_UI.btnDeleteByTitle, title)),
		);
		await this.assertItemCount(currentCount - 1);
	}

	// ─── Place order ───

	async openPlaceOrder(): Promise<void> {
		await this.orderModal.open();
		await this.orderModal.assertAppear({ timeout: MODAL_TIMEOUT });
	}

	async assertPlaceOrderModal(expectedTotal: number): Promise<void> {
		await this.orderModal.assertAppear({ timeout: MODAL_TIMEOUT });
		await this.assertElementHasText(
			CART_UI.lblOrderTotal,
			`Total: ${expectedTotal}`,
		);
		for (const field of [
			CART_UI.txtName,
			CART_UI.txtCountry,
			CART_UI.txtCity,
			CART_UI.txtCard,
			CART_UI.txtMonth,
			CART_UI.txtYear,
			CART_UI.btnPurchase,
			CART_UI.btnOrderClose,
		]) {
			await this.assertVisible(field);
		}
	}

	async fillOrderForm(order: Partial<OrderDetails>): Promise<void> {
		const fields: [string, string | undefined][] = [
			[CART_UI.txtName, order.name],
			[CART_UI.txtCountry, order.country],
			[CART_UI.txtCity, order.city],
			[CART_UI.txtCard, order.card],
			[CART_UI.txtMonth, order.month],
			[CART_UI.txtYear, order.year],
		];
		for (const [selector, value] of fields) {
			if (value !== undefined) {
				await this.fill(selector, value, { clear: true });
			}
		}
	}

	/** Clicks Purchase expecting success: waits for the confirmation and parses it. */
	async purchase(): Promise<PurchaseConfirmation> {
		// purchaseOrder() empties the cart with a fire-and-forget /deletecart
		// call, and OK on the confirmation navigates away at once. Clicking OK
		// before that call lands was seen (WebKit) to leave the cart FULL
		// server-side, so wait for it the way a reading user naturally does.
		const cartCleared = this.getPage().waitForResponse(
			(r) => r.url().endsWith("/deletecart"),
			{ timeout: scaled(ROWS_TIMEOUT) },
		);
		cartCleared.catch(() => {});
		await this.click(CART_UI.btnPurchase);
		await this.assertVisible(CART_UI.rootConfirmation, {
			timeout: MODAL_TIMEOUT,
		});
		await cartCleared;
		this.lastConfirmation = this.parseConfirmation(
			await this.getTrimmedText(CART_UI.lblConfirmationDetails),
		);
		logger.info(`Purchase confirmed: ${JSON.stringify(this.lastConfirmation)}`);
		return this.lastConfirmation;
	}

	/**
	 * Clicks Purchase when the outcome is the thing under test, and records
	 * which one happened: a validation `alert()` (message kept for
	 * assertAlertShown()) or the purchase confirmation. Racing the two means
	 * a wrongly ACCEPTED order fails fast with a clear reason, instead of
	 * surfacing as a 20s "no dialog appeared" timeout.
	 */
	async attemptPurchase(): Promise<void> {
		const timeout = scaled(MODAL_TIMEOUT);
		this.lastAlertMessage = undefined;
		const alert = this.getPage()
			.waitForEvent("dialog", { timeout })
			.then(async (dialog) => {
				this.lastAlertMessage = dialog.message();
				await dialog.accept();
				return "rejected" as const;
			});
		const confirmation = this.locator(CART_UI.rootConfirmation)
			.waitFor({ state: "visible", timeout })
			.then(() => "confirmed" as const);
		// The losing side of the race rejects on its own timeout later; that
		// is expected and must not surface as an unhandled rejection.
		alert.catch(() => {});
		confirmation.catch(() => {});
		await this.click(CART_UI.btnPurchase);
		this.purchaseOutcome = await Promise.race([alert, confirmation]);
		logger.info(`Purchase attempt outcome: ${this.purchaseOutcome}`);
	}

	/**
	 * Long or markup-bearing input was handled safely: either the order was
	 * refused, or the confirmation shows the text LITERALLY (no HTML parsed
	 * out of it) and the dialog still fits the viewport.
	 */
	async assertInputHandledSafely(literal: string): Promise<void> {
		if (this.purchaseOutcome === "rejected") {
			logger.info("Input was rejected by validation — safe outcome");
			return;
		}
		await this.assertElementHasTextContains(
			CART_UI.lblConfirmationDetails,
			literal,
		);
		await this.assertElementCount(CART_UI.lblConfirmationDetailsMarkup, 0);
		const box = await this.locator(CART_UI.rootConfirmation).boundingBox();
		const viewport = this.getPage().viewportSize();
		expect(box, "Confirmation dialog has no layout box").not.toBeNull();
		if (box && viewport) {
			expect(box.x, "Dialog starts off-screen").toBeGreaterThanOrEqual(0);
			expect(
				box.x + box.width,
				"Dialog overflows the viewport",
			).toBeLessThanOrEqual(viewport.width);
		}
	}

	/** The last attemptPurchase() was refused — no order was created. */
	async assertOrderRejected(): Promise<void> {
		expect(
			this.purchaseOutcome,
			"The purchase was CONFIRMED although it should have been rejected",
		).toBe("rejected");
	}

	/** Full checkout from an open cart: modal → form → Purchase. */
	async placeOrder(order: OrderDetails): Promise<PurchaseConfirmation> {
		await this.openPlaceOrder();
		await this.fillOrderForm(order);
		return this.purchase();
	}

	async closePlaceOrder(): Promise<void> {
		await this.orderModal.close();
		await this.orderModal.assertDisappear({ timeout: MODAL_TIMEOUT });
	}

	async assertPlaceOrderModalOpen(): Promise<void> {
		await this.orderModal.assertAppear({ timeout: MODAL_TIMEOUT });
	}

	/**
	 * The confirmation matches the order: title, a numeric Id, the cart total
	 * as Amount, and the card number and name as entered.
	 */
	async assertPurchaseConfirmed(
		order: Pick<OrderDetails, "name" | "card">,
		expectedAmount: number,
	): Promise<void> {
		await this.assertElementHasText(
			CART_UI.lblConfirmationTitle,
			"Thank you for your purchase!",
		);
		const confirmation = this.requireConfirmation();
		expect(confirmation.id).toMatch(/^\d+$/);
		expect(confirmation.amount).toBe(expectedAmount);
		expect(confirmation.cardNumber).toBe(order.card);
		expect(confirmation.name).toBe(order.name);
	}

	/**
	 * The confirmation's Date is today, as D/M/YYYY with a 1-based month.
	 * Compared against the BROWSER's clock, not the test runner's, since that
	 * is what the page itself read.
	 */
	async assertConfirmationDateIsToday(): Promise<void> {
		const today = await this.getPage().evaluate(() => {
			const d = new Date();
			return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
		});
		expect(this.requireConfirmation().date).toBe(today);
	}

	/** Clicks OK on the confirmation; the site then redirects to the home page. */
	/**
	 * Purchase and click OK on the confirmation the instant it appears,
	 * WITHOUT waiting for the background /deletecart call that purchase()
	 * waits for. Reproduces a user who dismisses the dialog immediately
	 * (CART-037). Returns once the site has navigated to the home page.
	 */
	async purchaseAndConfirmImmediately(): Promise<void> {
		await this.click(CART_UI.btnPurchase);
		await this.assertVisible(CART_UI.rootConfirmation, {
			timeout: MODAL_TIMEOUT,
		});
		await this.confirmPurchase();
	}

	async confirmPurchase(): Promise<void> {
		await this.click(CART_UI.btnConfirmationOk);
		await this.waitForUrl(/\/index\.html/, { timeout: scaled(ROWS_TIMEOUT) });
	}

	private requireConfirmation(): PurchaseConfirmation {
		if (!this.lastConfirmation) {
			throw new Error(
				"No purchase confirmation captured — call purchase() first.",
			);
		}
		return this.lastConfirmation;
	}

	/**
	 * Splits on the labels themselves rather than on line breaks: whether the
	 * dialog's "\n"s survive into innerText depends on the widget's CSS, and
	 * splitting on labels reads the same either way.
	 */
	private parseConfirmation(text: string): PurchaseConfirmation {
		const parts = text.split(/\s*(Id|Amount|Card Number|Name|Date):\s*/);
		const values = new Map<string, string>();
		for (let i = 1; i < parts.length; i += 2) {
			values.set(parts[i], parts[i + 1]?.trim() ?? "");
		}
		const field = (label: string) => values.get(label) ?? "";
		return {
			id: field("Id"),
			amount: Number(field("Amount").replace(/\s*USD$/, "")),
			cardNumber: field("Card Number"),
			name: field("Name"),
			date: field("Date"),
		};
	}
}
