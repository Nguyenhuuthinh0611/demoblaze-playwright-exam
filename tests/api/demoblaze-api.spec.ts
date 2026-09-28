import { expect } from "@playwright/test";
import { ALERTS, GENERIC_LOGIN_ERROR, PRODUCTS } from "src/data/demoblaze-data";
import { test } from "src/fixtures";
import { randomCode } from "src/utils/random";

/**
 * Backend contract tests against api.demoblaze.com — the same endpoints the
 * storefront's JS calls. No browser is launched (these tests never request a
 * Page fixture), so they run in seconds and pin failures to the server
 * rather than the UI.
 *
 * API specs assert on responses directly with `expect`: the "no expect in
 * specs" rule exists to keep UI specs free of selectors, and there is no page
 * here to hide them behind.
 *
 * Note the API's convention: failures are HTTP 200 with `{ errorMessage }`,
 * so every negative case asserts on the body, not only the status.
 */
test.describe("API: catalogue", () => {
	test(
		"API-001: GET /entries returns the first page of products",
		{ tag: "@smoke" },
		async ({ demoblazeApi }) => {
			const response = await demoblazeApi.rawEntries();
			expect(response.status()).toBe(200);
			expect(response.headers()["content-type"]).toContain("application/json");

			const body = await response.json();
			expect(body.Items.length).toBeGreaterThan(0);
			for (const product of body.Items) {
				expect(product).toEqual(
					expect.objectContaining({
						id: expect.any(Number),
						title: expect.any(String),
						price: expect.any(Number),
						cat: expect.stringMatching(/^(phone|notebook|monitor)$/),
					}),
				);
			}
			expect(body.LastEvaluatedKey).toBeDefined();
		},
	);

	test(
		"API-002: POST /view returns one product by id",
		{ tag: "@regression" },
		async ({ demoblazeApi }) => {
			const product = await demoblazeApi.view(PRODUCTS.samsungGalaxyS6.id);
			expect(product.id).toBe(PRODUCTS.samsungGalaxyS6.id);
			expect(product.title).toBe(PRODUCTS.samsungGalaxyS6.title);
			expect(product.price).toBe(PRODUCTS.samsungGalaxyS6.price);
		},
	);

	test(
		"API-003: POST /bycat returns only the requested category",
		{ tag: "@regression" },
		async ({ demoblazeApi }) => {
			for (const cat of ["phone", "notebook", "monitor"] as const) {
				const products = await demoblazeApi.byCategory(cat);
				expect(products.length, `category ${cat}`).toBeGreaterThan(0);
				expect(new Set(products.map((p) => p.cat))).toEqual(new Set([cat]));
			}
		},
	);
});

test.describe("API: authentication", () => {
	test(
		"API-004: Valid login returns a token that resolves to the user",
		{ tag: "@smoke" },
		async ({ demoblazeApi, account }) => {
			const auth = await demoblazeApi.login(account.username, account.password);
			expect(auth.ok, auth.errorMessage).toBe(true);
			expect(auth.token).toBeTruthy();
			expect(await demoblazeApi.whoAmI(auth.token as string)).toBe(
				account.username,
			);
		},
	);

	test(
		"API-005: Wrong password is rejected",
		{ tag: "@regression" },
		async ({ demoblazeApi, account }) => {
			const auth = await demoblazeApi.login(
				account.username,
				`${account.password}x`,
			);
			expect(auth.ok).toBe(false);
			expect(auth.token).toBeUndefined();
		},
	);

	test(
		"API-006: Unknown username is rejected",
		{ tag: "@regression" },
		async ({ demoblazeApi }) => {
			const auth = await demoblazeApi.login(`nouser_${randomCode(12)}`, "x");
			expect(auth.ok).toBe(false);
			expect(auth.token).toBeUndefined();
		},
	);

	test(
		"API-007: Signing up an existing username is rejected",
		{ tag: "@regression" },
		async ({ demoblazeApi, account }) => {
			const result = await demoblazeApi.signup(account.username, "anything");
			expect(result).toEqual({
				ok: false,
				errorMessage: ALERTS.userAlreadyExists,
			});
		},
	);

	test(
		"API-008: A forged token is not accepted as a session",
		{ tag: "@regression" },
		async ({ demoblazeApi }) => {
			expect(
				await demoblazeApi.whoAmI(`forged-${randomCode(16)}`),
			).toBeUndefined();
		},
	);
});

test.describe("API: account enumeration", () => {
	test(
		"API-010: Unknown user and wrong password return the same generic error",
		{
			tag: "@regression",
			annotation: {
				type: "known-defect",
				description:
					"DEF-15: /login answers 'User does not exist.' vs 'Wrong password.', revealing which usernames exist",
			},
		},
		async ({ demoblazeApi, account }) => {
			const unknownUser = await demoblazeApi.login(
				`nouser_${randomCode(12)}`,
				"x",
			);
			const wrongPassword = await demoblazeApi.login(
				account.username,
				`${account.password}x`,
			);
			expect([unknownUser.errorMessage, wrongPassword.errorMessage]).toEqual([
				GENERIC_LOGIN_ERROR,
				GENERIC_LOGIN_ERROR,
			]);
		},
	);
});

test.describe("API: cart", () => {
	test(
		"API-009: Add, view and delete cart lines",
		{ tag: "@regression" },
		async ({ demoblazeApi, account }) => {
			const auth = await demoblazeApi.login(account.username, account.password);
			const token = auth.token as string;
			await demoblazeApi.clearCart(token);

			await test.step("Step 1: Add two products", async () => {
				for (const product of [PRODUCTS.nexus6, PRODUCTS.sonyVaioI5]) {
					expect(
						(await demoblazeApi.addToCart(token, product.id)).status(),
					).toBe(200);
				}
			});

			const lines = await test.step("Step 2: View the cart", async () => {
				const cart = await demoblazeApi.viewCart(token);
				expect(cart.map((l) => l.prod_id).sort()).toEqual(
					[PRODUCTS.nexus6.id, PRODUCTS.sonyVaioI5.id].sort(),
				);
				return cart;
			});

			await test.step("Step 3: Delete one line", async () => {
				await demoblazeApi.deleteItem(lines[0].id);
				const remaining = await demoblazeApi.viewCart(token);
				expect(remaining.map((l) => l.id)).toEqual([lines[1].id]);
			});

			await test.step("Step 4: Clear the rest", async () => {
				await demoblazeApi.clearCart(token);
				expect(await demoblazeApi.viewCart(token)).toEqual([]);
			});
		},
	);
});
