import { expect } from "@playwright/test";
import { ALERTS } from "src/data/demoblaze-data";
import StorePage from "src/pom/pages/common/store-page";
import CartPage from "src/pom/pages/shop/cart-page";
import PRODUCT_UI from "src/pom/ui/shop/product-ui";
import logger from "src/utils/logger";
import { scaled } from "src/utils/timeouts";

const DETAILS_TIMEOUT = 20000;
// "Product added." arrives after the /addtocart round trip, not synchronously.
const ADD_TO_CART_TIMEOUT = 20000;

export interface ProductDetails {
	title: string;
	price: number;
}

/** Product detail page (prod.html?idp_=<id>). */
export default class ProductPage extends StorePage {
	protected _url = "/prod.html";

	/** Direct entry by catalogue id — the same URL the home grid links to. */
	async navigate(productId: number): Promise<void> {
		await this.goto(`${this._url}?idp_=${productId}`);
		await this.assertLoaded();
	}

	/**
	 * Opens a product URL WITHOUT asserting it loaded — for ids that may not
	 * exist. Returns once the page's own /view request has answered, so what
	 * is on screen is final.
	 */
	async open(productId: number): Promise<void> {
		const view = this.getPage().waitForResponse(
			(r) => r.url().endsWith("/view"),
			{ timeout: scaled(DETAILS_TIMEOUT) },
		);
		await this.goto(`${this._url}?idp_=${productId}`);
		const response = await view;
		logger.info(
			`/view answered ${response.status()}: ${(await response.text()).slice(0, 120)}`,
		);
	}

	/**
	 * A non-existent product shows a "not found" message and offers nothing
	 * to buy.
	 */
	async assertProductNotFound(): Promise<void> {
		await this.assertNotVisible(PRODUCT_UI.btnAddToCart);
		await expect(
			this.getPage().getByText(
				/not (be )?found|no longer available|does not exist/i,
			),
		).toBeVisible();
	}

	async assertLoaded(): Promise<void> {
		await this.assertVisible(PRODUCT_UI.lblProductName, {
			timeout: DETAILS_TIMEOUT,
		});
		await this.assertVisible(PRODUCT_UI.btnAddToCart);
	}

	async assertProductTitle(title: string): Promise<void> {
		await this.assertElementHasText(PRODUCT_UI.lblProductName, title);
	}

	/** Title and price as displayed ("$360 *includes tax" → 360). */
	async getProductDetails(): Promise<ProductDetails> {
		const title = await this.getTrimmedText(PRODUCT_UI.lblProductName);
		const priceText = await this.getTrimmedText(PRODUCT_UI.lblProductPrice);
		const match = priceText.match(/\$\s*([\d.,]+)/);
		if (!match) {
			throw new Error(`Could not parse a price from "${priceText}"`);
		}
		const price = Number(match[1].replace(/,/g, ""));
		logger.info(`Product details: ${title} — ${price}`);
		return { title, price };
	}

	/**
	 * Clicks Add to cart and records the confirmation alert for
	 * assertAlertShown(). Returns once the server has accepted the item —
	 * the alert is only raised in the request's success callback.
	 */
	async addToCart(): Promise<void> {
		this.lastAlertMessage = await this.clickAndCaptureDialog(
			PRODUCT_UI.btnAddToCart,
			{ timeout: ADD_TO_CART_TIMEOUT },
		);
	}

	/**
	 * Double-clicks Add to cart and returns how many "Product added."
	 * confirmations the user saw — the number of lines the cart must hold.
	 */
	async doubleClickAddToCart(): Promise<number> {
		const alerts = await this.collectAlertsDuring(() =>
			this.locator(PRODUCT_UI.btnAddToCart).dblclick(),
		);
		const confirmed = alerts.filter(
			(a) => a === ALERTS.productAddedUser,
		).length;
		logger.info(
			`Double-click produced ${confirmed} confirmation(s): ${JSON.stringify(alerts)}`,
		);
		return confirmed;
	}

	/** Clicks Add to cart when the outcome is unknown; see assertUserGotFeedback(). */
	async addToCartCollectingAlerts(): Promise<void> {
		await this.collectAlertsDuring(() => this.click(PRODUCT_UI.btnAddToCart));
	}

	async openCart(): Promise<CartPage> {
		const cartPage = new CartPage(this.getPage());
		await cartPage.trackCartLoad(() => this.clickNavCart());
		return cartPage;
	}
}
