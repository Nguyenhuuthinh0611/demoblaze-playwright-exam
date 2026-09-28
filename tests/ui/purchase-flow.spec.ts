import { buildOrderDetails, PRODUCTS, ALERTS } from "src/data/demoblaze-data";
import { test } from "src/fixtures";

/**
 * The exam's core journey, end to end through the UI only: log in with valid
 * credentials, add a product to the cart, place the order, and confirm the
 * cart is emptied afterwards. Covers LOGIN-002 + CART-002 + CART-012 +
 * CART-014 as one user story.
 */
test.describe("E2E: log in, add to cart, place an order", () => {
	test(
		"E2E-001: A registered user buys a product end to end",
		{ tag: "@smoke" },
		async ({ homePage, account }) => {
			const order = buildOrderDetails();

			await test.step("Step 1: Log in with valid credentials", async () => {
				await homePage.login(account.username, account.password);
			});

			const productPage =
				await test.step("Step 2: Open a product from the catalogue", async () =>
					homePage.openProduct(PRODUCTS.samsungGalaxyS6.title));
			const product = await productPage.getProductDetails();

			await test.step("Step 3: Add the product to the cart", async () => {
				await productPage.addToCart();
				await productPage.assertAlertShown(ALERTS.productAddedUser);
			});

			const cartPage = await test.step("Step 4: Open the cart", async () =>
				productPage.openCart());

			await test.step("Step 5: Verify the cart lists the product and its total", async () => {
				await cartPage.assertContainsExactly([product]);
				await cartPage.assertTotal(product.price);
			});

			await test.step("Step 6: Place the order", async () => {
				await cartPage.openPlaceOrder();
				await cartPage.assertPlaceOrderModal(product.price);
				await cartPage.fillOrderForm(order);
				await cartPage.purchase();
			});

			await test.step("Step 7: Verify the purchase confirmation", async () => {
				await cartPage.assertPurchaseConfirmed(order, product.price);
			});

			await test.step("Step 8: Confirm and verify the cart is now empty", async () => {
				await cartPage.confirmPurchase();
				await cartPage.navigate();
				await cartPage.assertCartEmpty();
				await cartPage.assertLoggedInAs(account.username);
			});
		},
	);
});
