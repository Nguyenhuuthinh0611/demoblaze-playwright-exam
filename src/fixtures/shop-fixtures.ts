import type { Page } from "@playwright/test";
import { getBaseUrl } from "configs/url";
import DemoblazeApi from "src/api/demoblaze-api";
import {
	type Account,
	loadAccountPool,
	pickAccountFromPool,
	resolveShardedIndex,
} from "src/fixtures/account-pool";
import { test as base } from "src/fixtures/base-fixtures";
import CartPage from "src/pom/pages/shop/cart-page";
import HomePage from "src/pom/pages/shop/home-page";
import logger from "src/utils/logger";
import { randomCode, randomPassword } from "src/utils/random";

/**
 * Which state a Page fixture starts the test in:
 * - `guest` — a fresh browser context, nobody logged in (the default).
 * - `user`  — the worker's `account` already logged in, with an EMPTY cart.
 *
 * Set per file or per describe: `test.use({ session: "user" })`.
 *
 * A `user` session logs in through the API and plants the session cookie,
 * not through the UI: the login form has its own spec (tests/ui/login.spec.ts),
 * and repeating it as setup for every cart test would only add time and a
 * second reason for those tests to fail.
 */
export type Session = "guest" | "user";

/**
 * Registers a throwaway account for one worker. Used only when
 * data/accounts.json is absent, which makes a fresh clone (and CI without the
 * secret) runnable with no setup. The prefix keeps them identifiable.
 */
async function registerWorkerAccount(
	api: DemoblazeApi,
	parallelIndex: number,
): Promise<Account> {
	const account = {
		username: `pwexam_${Date.now().toString(36)}_w${parallelIndex}_${randomCode(4).toLowerCase()}`,
		password: await randomPassword(),
	};
	const result = await api.signup(account.username, account.password);
	if (!result.ok) {
		throw new Error(
			`Could not register a test account (${account.username}): ${result.errorMessage}`,
		);
	}
	logger.info(`Registered worker account ${account.username}`);
	return account;
}

/**
 * Prepares the worker's account and puts the browser into the requested
 * session BEFORE the first navigation (the site decides logged-in vs guest
 * from the `tokenp_` cookie on page load).
 *
 * The account's cart is emptied for EVERY session, guest included: a guest
 * test may still log in through the UI (the login and E2E specs do), and then
 * it must not inherit items an earlier test on this worker left behind.
 * Done before the test rather than after, because a run killed mid-test never
 * reaches a teardown and the next run must still start clean.
 */
async function startSession(
	page: Page,
	session: Session,
	account: Account,
	api: DemoblazeApi,
): Promise<void> {
	const auth = await api.login(account.username, account.password);
	if (!auth.ok || !auth.token) {
		throw new Error(
			`API login failed for ${account.username}: ${auth.errorMessage}`,
		);
	}
	await api.clearCart(auth.token);
	if (session === "user") {
		await page
			.context()
			.addCookies([{ name: "tokenp_", value: auth.token, url: getBaseUrl() }]);
	}
}

export const test = base.extend<
	{
		session: Session;
		demoblazeApi: DemoblazeApi;
		homePage: HomePage;
		cartPage: CartPage;
	},
	{ account: Account; secondAccount: Account }
>({
	session: ["guest", { option: true }],

	/**
	 * One account per concurrently-running worker — from data/accounts.json
	 * when present (see account-pool.ts for the sizing rule), otherwise
	 * registered on the fly. Worker-scoped, so it is resolved once per worker
	 * process, not per test.
	 */
	account: [
		async ({ playwright }, use, workerInfo) => {
			const pool = loadAccountPool("pool");
			if (pool) {
				await use(pickAccountFromPool(pool, resolveShardedIndex(workerInfo)));
				return;
			}
			const request = await playwright.request.newContext();
			try {
				const account = await registerWorkerAccount(
					new DemoblazeApi(request),
					workerInfo.parallelIndex,
				);
				await use(account);
			} finally {
				await request.dispose();
			}
		},
		{ scope: "worker" },
	],

	/**
	 * A second user for tests that need two (switching accounts, cart
	 * isolation). Always registered on the fly, even when data/accounts.json
	 * exists, so it never collides with the pool. Its cart is never written
	 * to, which is what lets CART-027 treat it as "a user with an empty cart".
	 */
	secondAccount: [
		async ({ playwright }, use, workerInfo) => {
			const request = await playwright.request.newContext();
			try {
				await use(
					await registerWorkerAccount(
						new DemoblazeApi(request),
						workerInfo.parallelIndex,
					),
				);
			} finally {
				await request.dispose();
			}
		},
		{ scope: "worker" },
	],

	demoblazeApi: async ({ request }, use) => {
		await use(new DemoblazeApi(request));
	},

	homePage: async (
		{ basePage, session, account, demoblazeApi },
		use,
		testInfo,
	) => {
		await startSession(basePage.getPage(), session, account, demoblazeApi);
		const homePage = new HomePage(basePage.getPage(), testInfo);
		await homePage.navigate();
		if (session === "user") {
			await homePage.assertLoggedInAs(account.username);
		}
		await use(homePage);
	},

	cartPage: async (
		{ basePage, session, account, demoblazeApi },
		use,
		testInfo,
	) => {
		await startSession(basePage.getPage(), session, account, demoblazeApi);
		const cartPage = new CartPage(basePage.getPage(), testInfo);
		await cartPage.navigate();
		if (session === "user") {
			await cartPage.assertLoggedInAs(account.username);
		}
		await use(cartPage);
	},
});
