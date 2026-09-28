import { expect } from "@playwright/test";
import StorePage from "src/pom/pages/common/store-page";
import CartPage from "src/pom/pages/shop/cart-page";
import ProductPage from "src/pom/pages/shop/product-page";
import HOME_UI from "src/pom/ui/shop/home-ui";
import logger from "src/utils/logger";
import { scaled } from "src/utils/timeouts";

// The grid is rendered from an `/entries` response after `config.json`
// loads — two round trips after DOMContentLoaded.
const GRID_TIMEOUT = 20000;

/** DemoBlaze home page: the product grid and category filter. */
export default class HomePage extends StorePage {
	protected _url = "/index.html";

	/**
	 * Opens the home page, re-navigating ONCE if the grid never renders.
	 * Observed (Firefox, full parallel run): the `/entries` response simply
	 * never arrived within budget on one load of the public site. Slowness is
	 * the performance suite's job to measure; a UI test re-trying the load
	 * once, as a user would, keeps it about the behaviour under test.
	 */
	async navigate(): Promise<void> {
		await this.selfNavigate();
		try {
			await this.assertLoaded();
		} catch (err) {
			logger.warn(`Home grid did not render, re-navigating once. ${err}`);
			await this.selfNavigate();
			await this.assertLoaded();
		}
	}

	async assertLoaded(): Promise<void> {
		await this.assertVisible(this.locator(HOME_UI.lblProductCards).first(), {
			timeout: GRID_TIMEOUT,
		});
	}

	/** Titles currently listed in the grid, in display order. */
	async getProductTitles(): Promise<string[]> {
		return (await this.locator(HOME_UI.lblProductTitles).allInnerTexts()).map(
			(t) => t.trim(),
		);
	}

	/**
	 * The grid lists exactly these titles (order-insensitive). Polls, because
	 * a category click or page change swaps the grid only when its request
	 * returns.
	 */
	async assertProductTitles(expected: string[]): Promise<void> {
		await expect
			.poll(async () => (await this.getProductTitles()).sort(), {
				timeout: scaled(GRID_TIMEOUT),
			})
			.toEqual([...expected].sort());
	}

	async filterByCategory(
		name: "Phones" | "Laptops" | "Monitors",
	): Promise<void> {
		logger.info(`Filtering by category: ${name}`);
		await this.click(this.locatorWithArgs(HOME_UI.btnCategory, name));
	}

	/**
	 * Clicks Next and waits until the grid shows a different, non-empty set
	 * of products. Returns the new page's titles.
	 */
	async goToNextPage(): Promise<string[]> {
		const before = await this.getProductTitles();
		await this.click(HOME_UI.btnNextPage);
		await expect
			.poll(
				async () => {
					const now = await this.getProductTitles();
					return now.length > 0 && now.join("|") !== before.join("|");
				},
				{ timeout: scaled(GRID_TIMEOUT) },
			)
			.toBe(true);
		const after = await this.getProductTitles();
		logger.info(`Page 2 products: ${after.join(", ")}`);
		return after;
	}

	async openProduct(title: string): Promise<ProductPage> {
		logger.info(`Opening product: ${title}`);
		await this.click(this.locatorWithArgs(HOME_UI.btnProductByName, title));
		const productPage = new ProductPage(this.getPage());
		await productPage.assertLoaded();
		await productPage.assertProductTitle(title);
		return productPage;
	}

	/**
	 * Opens the home page in a NEW TAB of the same browser context — same
	 * cookies, so the same session — and returns it loaded.
	 */
	async openInNewTab(): Promise<HomePage> {
		const tab = await this.getPage().context().newPage();
		const homePage = new HomePage(tab);
		await homePage.navigate();
		return homePage;
	}

	async openCart(): Promise<CartPage> {
		const cartPage = new CartPage(this.getPage());
		await cartPage.trackCartLoad(() => this.clickNavCart());
		return cartPage;
	}
}
