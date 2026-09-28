import {
	ALERTS,
	buildOrderDetails,
	type OrderDetails,
	PRODUCTS,
} from "src/data/demoblaze-data";
import { test } from "src/fixtures";
import type { CartItem } from "src/pom/pages/shop/cart-page";
import HomePage from "src/pom/pages/shop/home-page";
import ProductPage from "src/pom/pages/shop/product-page";

/**
 * Cart and checkout. Case ids map to the "Cart" sheet of
 * docs/test-cases/demoblaze-test-cases.xlsx.
 *
 * Starts logged in with an EMPTY cart (session "user": API login + cart reset
 * in the fixture), so each test only exercises what its title says. The full
 * UI-login journey is covered by tests/ui/purchase-flow.spec.ts.
 */
test.use({ session: "user" });

/**
 * Adds each product through the UI (home → product → Add to cart) and returns
 * them as displayed, so expectations use the site's own prices.
 */
async function addProducts(
	homePage: HomePage,
	titles: string[],
): Promise<CartItem[]> {
	const added: CartItem[] = [];
	for (const title of titles) {
		await homePage.navigate();
		const productPage = await homePage.openProduct(title);
		added.push(await productPage.getProductDetails());
		await productPage.addToCart();
		await productPage.assertAlertShown(ALERTS.productAddedUser);
	}
	return added;
}

const sum = (items: CartItem[]) =>
	items.reduce((total, i) => total + i.price, 0);

test.describe("Cart", () => {
	test(
		"CART-002: Logged-in user adds a product to the cart",
		{ tag: "@smoke" },
		async ({ homePage }) => {
			const items =
				await test.step("Step 1: Add a product from its page", async () =>
					addProducts(homePage, [PRODUCTS.nokiaLumia1520.title]));
			const cartPage = await test.step("Step 2: Open the cart", async () =>
				homePage.openCart());
			await test.step("Step 3: Verify the row and the total", async () => {
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
			// Merged from CART-003.
			await test.step("Step 4: Verify the cart page layout", async () => {
				await cartPage.assertLayout();
			});
		},
	);

	test(
		"CART-004: Total equals the sum of several different products",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const items =
				await test.step("Step 1: Add three different products", async () =>
					addProducts(homePage, [
						PRODUCTS.samsungGalaxyS6.title,
						PRODUCTS.nexus6.title,
						PRODUCTS.sonyVaioI5.title,
					]));
			const cartPage = await test.step("Step 2: Open the cart", async () =>
				homePage.openCart());
			await test.step("Step 3: Verify all three rows and the summed total", async () => {
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
		},
	);

	test(
		"CART-005: Adding the same product twice lists it twice",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const items =
				await test.step("Step 1: Add the same product twice", async () =>
					addProducts(homePage, [
						PRODUCTS.nexus6.title,
						PRODUCTS.nexus6.title,
					]));
			const cartPage = await test.step("Step 2: Open the cart", async () =>
				homePage.openCart());
			await test.step("Step 3: Verify two rows and a doubled total", async () => {
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
		},
	);

	test(
		"CART-006: Deleting one item keeps the others and recalculates the total",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const items = await test.step("Step 1: Add two products", async () =>
				addProducts(homePage, [
					PRODUCTS.samsungGalaxyS6.title,
					PRODUCTS.nexus6.title,
				]));
			const cartPage = await test.step("Step 2: Open the cart", async () =>
				homePage.openCart());
			const [removed, kept] = items;
			await test.step(`Step 3: Delete "${removed.title}"`, async () => {
				await cartPage.deleteItem(removed.title, items.length);
			});
			await test.step("Step 4: Verify only the other item remains, with its price as total", async () => {
				await cartPage.assertContainsExactly([kept]);
				await cartPage.assertTotal(kept.price);
			});
		},
	);

	test(
		"CART-008: Cart persists after logout/login and in a new browser session",
		{ tag: "@regression" },
		async ({ homePage, account, freshPage }) => {
			const items = await test.step("Step 1: Add a product", async () =>
				addProducts(homePage, [PRODUCTS.samsungGalaxyS6.title]));
			await test.step("Step 2: Log out, then log back in through the UI", async () => {
				await homePage.logout();
				await homePage.login(account.username, account.password);
			});
			await test.step("Step 3: Verify the same cart is shown", async () => {
				const cartPage = await homePage.openCart();
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
			// Merged from CART-009: a separate browser, no shared cookies.
			await test.step("Step 4: Log in from a new browser session and verify the cart", async () => {
				const otherBrowser = new HomePage(freshPage.getPage());
				await otherBrowser.navigate();
				await otherBrowser.login(account.username, account.password);
				const cartPage = await otherBrowser.openCart();
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
		},
	);
});

test.describe("Place order", () => {
	test(
		"CART-012: Purchase with all fields filled",
		{ tag: "@smoke" },
		async ({ homePage }) => {
			const order = buildOrderDetails();
			const items = await test.step("Step 1: Add two products", async () =>
				addProducts(homePage, [
					PRODUCTS.nokiaLumia1520.title,
					PRODUCTS.sonyVaioI5.title,
				]));
			const cartPage =
				await test.step("Step 2: Open the cart and wait for every row", async () => {
					const cart = await homePage.openCart();
					await cart.assertContainsExactly(items);
					return cart;
				});
			// Merged from CART-011.
			await test.step("Step 3: Open Place order and verify the total and fields", async () => {
				await cartPage.openPlaceOrder();
				await cartPage.assertPlaceOrderModal(sum(items));
			});
			await test.step("Step 4: Fill every field and purchase", async () => {
				await cartPage.fillOrderForm(order);
				await cartPage.purchase();
			});
			await test.step("Step 5: Verify the confirmation matches the order", async () => {
				await cartPage.assertPurchaseConfirmed(order, sum(items));
			});
			await test.step("Step 6: Confirm, then verify the cart was emptied (CART-014)", async () => {
				await cartPage.confirmPurchase();
				await cartPage.navigate();
				await cartPage.assertCartEmpty();
			});
		},
	);

	test(
		"CART-013: Purchase with only the required fields",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const { name, card } = buildOrderDetails();
			const items =
				await test.step("Step 1: Add a product and open the cart", async () =>
					addProducts(homePage, [PRODUCTS.samsungGalaxyS6.title]));
			const cartPage = await homePage.openCart();
			await cartPage.assertContainsExactly(items);
			await test.step("Step 2: Fill Name and Credit card only, then purchase", async () => {
				await cartPage.placeOrder({ name, card });
			});
			await test.step("Step 3: Verify the confirmation", async () => {
				await cartPage.assertPurchaseConfirmed({ name, card }, sum(items));
			});
		},
	);

	test(
		"CART-016: Closing Place order leaves the cart unchanged",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const items =
				await test.step("Step 1: Add a product and open the cart", async () =>
					addProducts(homePage, [PRODUCTS.nexus6.title]));
			const cartPage = await homePage.openCart();
			await cartPage.assertContainsExactly(items);
			await test.step("Step 2: Open Place order, fill it, then Close", async () => {
				await cartPage.openPlaceOrder();
				await cartPage.fillOrderForm(buildOrderDetails());
				await cartPage.closePlaceOrder();
			});
			await test.step("Step 3: Reload and verify the cart is intact", async () => {
				await cartPage.reloadPage();
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
		},
	);

	// CART-017: the required-field check on Name and Credit card — one case,
	// three data sets (CART-018 and CART-019 were merged into it).
	const missingFieldCases = [
		{ title: "all fields empty", fields: {} },
		{
			title: "name empty",
			fields: { card: "4111111111111111" },
		},
		{
			title: "credit card empty",
			fields: { name: "QA Automation" },
		},
	];
	for (const c of missingFieldCases) {
		test(
			`CART-017: Required order fields are enforced (${c.title})`,
			{ tag: "@regression" },
			async ({ homePage }) => {
				const items =
					await test.step("Step 1: Add a product and open the cart", async () =>
						addProducts(homePage, [PRODUCTS.samsungGalaxyS6.title]));
				const cartPage = await homePage.openCart();
				await cartPage.assertContainsExactly(items);
				await test.step("Step 2: Submit the incomplete order form", async () => {
					await cartPage.openPlaceOrder();
					await cartPage.fillOrderForm(c.fields);
					await cartPage.attemptPurchase();
				});
				await test.step("Step 3: Verify the alert, and that nothing was ordered", async () => {
					await cartPage.assertOrderRejected();
					await cartPage.assertAlertShown(ALERTS.orderFieldsRequired);
					await cartPage.assertPlaceOrderModalOpen();
					await cartPage.reloadPage();
					await cartPage.assertContainsExactly(items);
				});
			},
		);
	}

	test(
		"CART-022: An order cannot be placed with an empty cart",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description:
					"DEF-02: purchaseOrder() never checks the cart; the order succeeds with 'Amount: 0 USD'",
			},
		},
		async ({ cartPage }) => {
			// Expected to fail until DEF-02 is fixed.
			test.fail();
			await test.step("Step 1: Verify the cart is empty", async () => {
				await cartPage.assertCartEmpty();
			});
			await test.step("Step 2: Submit a valid order form", async () => {
				await cartPage.openPlaceOrder();
				await cartPage.fillOrderForm(buildOrderDetails());
				await cartPage.attemptPurchase();
			});
			await test.step("Step 3: Verify the order was refused", async () => {
				await cartPage.assertOrderRejected();
			});
		},
	);

	test(
		"CART-025: Confirmation shows today's date",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description:
					"DEF-06: the date uses getMonth(), which is 0-based, so the month is one behind",
			},
		},
		async ({ homePage }) => {
			// Expected to fail until DEF-06 is fixed.
			test.fail();
			const items = await test.step("Step 1: Add a product", async () =>
				addProducts(homePage, [PRODUCTS.samsungGalaxyS6.title]));
			const cartPage = await test.step("Step 2: Purchase it", async () => {
				const cart = await homePage.openCart();
				await cart.assertContainsExactly(items);
				await cart.placeOrder(buildOrderDetails());
				return cart;
			});
			await test.step("Step 3: Verify the confirmation's date is today", async () => {
				await cartPage.assertConfirmationDateIsToday();
			});
		},
	);
});

test.describe("Guest cart", () => {
	test.use({ session: "guest" });

	test(
		"CART-001: Guest adds a product to the cart",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const productPage =
				await test.step("Step 1: Open a product as a guest", async () =>
					homePage.openProduct(PRODUCTS.samsungGalaxyS6.title));
			const product = await productPage.getProductDetails();
			await test.step("Step 2: Add it to the cart", async () => {
				await productPage.addToCart();
				// The guest branch of addToCart() has no trailing period (DEF-07).
				await productPage.assertAlertShown(ALERTS.productAddedGuest);
			});
			await test.step("Step 3: Verify the guest cart lists it", async () => {
				const cartPage = await productPage.openCart();
				await cartPage.assertContainsExactly([product]);
				await cartPage.assertTotal(product.price);
				await cartPage.assertLoggedOut();
			});
		},
	);
});

test.describe("Cart — more cases", () => {
	test(
		"CART-007: Deleting the last item empties the cart",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const items =
				await test.step("Step 1: Add one product and open the cart", async () =>
					addProducts(homePage, [PRODUCTS.nexus6.title]));
			const cartPage = await homePage.openCart();
			await cartPage.assertContainsExactly(items);
			await test.step("Step 2: Delete it", async () => {
				await cartPage.deleteItem(items[0].title, 1);
			});
			await test.step("Step 3: Verify the table and the total are empty", async () => {
				await cartPage.assertCartEmpty();
			});
		},
	);

	test(
		"CART-027: Carts are isolated between users",
		{ tag: "@regression" },
		async ({ homePage, secondAccount }) => {
			await test.step("Step 1: User A adds a product", async () => {
				await addProducts(homePage, [PRODUCTS.samsungGalaxyS6.title]);
			});
			await test.step("Step 2: Log out and log in as user B", async () => {
				await homePage.logout();
				await homePage.login(secondAccount.username, secondAccount.password);
			});
			await test.step("Step 3: Verify user B sees none of A's items", async () => {
				const cartPage = await homePage.openCart();
				await cartPage.assertCartEmpty();
			});
		},
	);

	test(
		"CART-028: A large cart (10 items) lists every item with an exact total",
		{ tag: "@regression" },
		async ({ homePage, demoblazeApi }) => {
			// Setup data: every product on the first catalogue page, plus one repeat.
			// Trimmed: the API returns "Sony vaio i7\n" with a trailing newline.
			const titles = (await demoblazeApi.entries()).map((p) => p.title.trim());
			const tenTitles = [...titles, titles[0]].slice(0, 10);
			const items =
				await test.step("Step 1: Add 10 products through the UI", async () =>
					addProducts(homePage, tenTitles));
			const cartPage = await test.step("Step 2: Open the cart", async () =>
				homePage.openCart());
			await test.step("Step 3: Verify all 10 rows and the exact total", async () => {
				await cartPage.assertContainsExactly(items);
				await cartPage.assertTotal(sum(items));
			});
		},
	);

	test(
		"CART-029: Double-clicking Add to cart adds one line per confirmation",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const productPage = await homePage.openProduct(PRODUCTS.nexus6.title);
			const confirmed =
				await test.step("Step 1: Double-click Add to cart", async () =>
					productPage.doubleClickAddToCart());
			await test.step("Step 2: Verify the cart holds exactly one line per confirmation", async () => {
				const cartPage = await productPage.openCart();
				await cartPage.assertItemCount(confirmed);
			});
		},
	);

	test(
		"CART-031: Cart state stays consistent across two tabs",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const items = await test.step("Step 1: Add two products", async () =>
				addProducts(homePage, [
					PRODUCTS.samsungGalaxyS6.title,
					PRODUCTS.nexus6.title,
				]));
			const [removed, kept] = items;
			const tabA = await homePage.openCart();
			await tabA.assertContainsExactly(items);
			const tabB =
				await test.step("Step 2: Open the cart in a second tab", async () => {
					const tab = await tabA.openInNewTab();
					await tab.assertContainsExactly(items);
					return tab;
				});
			await test.step(`Step 3: Delete "${removed.title}" in tab A`, async () => {
				await tabA.deleteItem(removed.title, items.length);
			});
			await test.step("Step 4: Reload tab B and verify it matches tab A", async () => {
				await tabB.reloadPage();
				await tabB.assertContainsExactly([kept]);
				await tabB.assertTotal(kept.price);
			});
		},
	);

	test(
		"CART-035: Add a product reached through a category filter",
		{ tag: "@regression" },
		async ({ homePage, demoblazeApi }) => {
			// Trimmed: the API returns "Sony vaio i7\n" with a trailing newline.
			const laptops = (await demoblazeApi.byCategory("notebook")).map((p) =>
				p.title.trim(),
			);
			await test.step("Step 1: Filter by Laptops", async () => {
				await homePage.filterByCategory("Laptops");
				await homePage.assertProductTitles(laptops);
			});
			const productPage = await test.step("Step 2: Open a laptop", async () =>
				homePage.openProduct(PRODUCTS.sonyVaioI5.title));
			const product = await productPage.getProductDetails();
			await test.step("Step 3: Add it and verify the cart", async () => {
				await productPage.addToCart();
				await productPage.assertAlertShown(ALERTS.productAddedUser);
				const cartPage = await productPage.openCart();
				await cartPage.assertContainsExactly([product]);
			});
		},
	);

	test(
		"CART-036: Add a product from the second page of the catalogue",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const page2 =
				await test.step("Step 1: Go to the next catalogue page", async () =>
					homePage.goToNextPage());
			const productPage =
				await test.step(`Step 2: Open "${page2[0]}"`, async () =>
					homePage.openProduct(page2[0]));
			const product = await productPage.getProductDetails();
			await test.step("Step 3: Add it and verify the cart", async () => {
				await productPage.addToCart();
				await productPage.assertAlertShown(ALERTS.productAddedUser);
				const cartPage = await productPage.openCart();
				await cartPage.assertContainsExactly([product]);
			});
		},
	);

	test(
		"CART-023: An invalid product id shows 'not found'",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description:
					"DEF-12: /view answers 'Not found.' but the page renders an 'undefined' product with Add to cart",
			},
		},
		async ({ homePage }) => {
			// Expected to fail until DEF-12 is fixed.
			test.fail();
			const productPage = new ProductPage(homePage.getPage());
			await test.step("Step 1: Open prod.html?idp_=99999", async () => {
				await productPage.open(99999);
			});
			await test.step("Step 2: Verify a not-found message and no Add to cart", async () => {
				await productPage.assertProductNotFound();
			});
		},
	);

	test(
		"CART-034: Add to cart gives feedback when the API is unavailable",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description:
					"DEF-11: addToCart() has no error callback, so a failed request is silent",
			},
		},
		async ({ homePage }) => {
			// Expected to fail until DEF-11 is fixed.
			test.fail();
			const productPage = await homePage.openProduct(PRODUCTS.nexus6.title);
			await test.step("Step 1: Make the /addtocart request fail", async () => {
				await productPage.simulateApiFailure("addtocart");
			});
			await test.step("Step 2: Click Add to cart", async () => {
				await productPage.addToCartCollectingAlerts();
			});
			await test.step("Step 3: Verify the user is told it did not work", async () => {
				await productPage.assertUserGotFeedback();
			});
		},
	);
});

test.describe("Place order — validation", () => {
	/** Adds one product, opens Place order and submits `fields`. */
	async function submitOrder(
		homePage: HomePage,
		fields: Partial<OrderDetails>,
	) {
		const items = await addProducts(homePage, [PRODUCTS.samsungGalaxyS6.title]);
		const cartPage = await homePage.openCart();
		await cartPage.assertContainsExactly(items);
		await cartPage.openPlaceOrder();
		await cartPage.fillOrderForm(fields);
		await cartPage.attemptPurchase();
		return cartPage;
	}

	test(
		"CART-020: A non-numeric credit card number is rejected",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description:
					"DEF-03: purchaseOrder() only checks that the card is not empty",
			},
		},
		async ({ homePage }) => {
			test.fail();
			const cartPage =
				await test.step("Step 1: Submit an order with card 'abcd-xyz'", async () =>
					submitOrder(homePage, { name: "QA Automation", card: "abcd-xyz" }));
			await test.step("Step 2: Verify the order is refused", async () => {
				await cartPage.assertOrderRejected();
			});
		},
	);

	const badDates = [
		{ title: "month 13, non-numeric year", month: "13", year: "abcd" },
		{ title: "expired year 2000", month: "12", year: "2000" },
	];
	for (const d of badDates) {
		test(
			`CART-021: An invalid expiry date is rejected (${d.title})`,
			{
				tag: "@regression",
				annotation: {
					type: "known-defect",
					description:
						"DEF-04: Month and Year are never read by purchaseOrder()",
				},
			},
			async ({ homePage }) => {
				test.fail();
				const cartPage =
					await test.step("Step 1: Submit an order with the invalid date", async () =>
						submitOrder(homePage, {
							...buildOrderDetails(),
							month: d.month,
							year: d.year,
						}));
				await test.step("Step 2: Verify the order is refused", async () => {
					await cartPage.assertOrderRejected();
				});
			},
		);
	}

	test(
		"CART-024: Whitespace-only Name and Credit card are treated as empty",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description: "DEF-05: purchaseOrder() only checks == ''",
			},
		},
		async ({ homePage }) => {
			test.fail();
			const cartPage =
				await test.step("Step 1: Submit spaces in Name and Credit card", async () =>
					submitOrder(homePage, { name: "   ", card: "   " }));
			await test.step("Step 2: Verify the required-fields alert", async () => {
				await cartPage.assertOrderRejected();
				await cartPage.assertAlertShown(ALERTS.orderFieldsRequired);
			});
		},
	);

	test(
		"CART-030: Very long and markup-bearing order input is handled safely",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const markup = "<b>x</b>";
			const name = `${markup}${"N".repeat(492)}`;
			const cartPage =
				await test.step("Step 1: Submit a 500-char name with markup and a 50-digit card", async () =>
					submitOrder(homePage, { name, card: "4".repeat(50) }));
			await test.step("Step 2: Verify it is refused, or shown as plain text without breaking the layout", async () => {
				await cartPage.assertInputHandledSafely(markup);
			});
		},
	);
});

test.describe("Guest cart — more cases", () => {
	test.use({ session: "guest" });

	test(
		"CART-010: The guest cart persists after a reload",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const productPage = await homePage.openProduct(PRODUCTS.nexus6.title);
			const product = await productPage.getProductDetails();
			await test.step("Step 1: Add a product as a guest", async () => {
				await productPage.addToCart();
				await productPage.assertAlertShown(ALERTS.productAddedGuest);
			});
			const cartPage = await productPage.openCart();
			await cartPage.assertContainsExactly([product]);
			await test.step("Step 2: Reload the cart and verify the item is still there", async () => {
				await cartPage.reloadPage();
				await cartPage.assertContainsExactly([product]);
			});
		},
	);

	test(
		"CART-015: A guest can complete a purchase",
		{ tag: "@regression" },
		async ({ homePage }) => {
			const order = buildOrderDetails();
			const productPage = await homePage.openProduct(
				PRODUCTS.samsungGalaxyS6.title,
			);
			const product = await productPage.getProductDetails();
			await test.step("Step 1: Add a product as a guest", async () => {
				await productPage.addToCart();
				await productPage.assertAlertShown(ALERTS.productAddedGuest);
			});
			const cartPage = await productPage.openCart();
			await cartPage.assertContainsExactly([product]);
			await test.step("Step 2: Place the order", async () => {
				await cartPage.placeOrder(order);
				await cartPage.assertPurchaseConfirmed(order, product.price);
			});
			await test.step("Step 3: Confirm and verify the guest cart was emptied", async () => {
				await cartPage.confirmPurchase();
				await cartPage.navigate();
				await cartPage.assertCartEmpty();
			});
		},
	);
});
