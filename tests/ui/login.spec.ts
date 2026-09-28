import type DemoblazeApi from "src/api/demoblaze-api";
import { ALERTS, PRODUCTS } from "src/data/demoblaze-data";
import { test } from "src/fixtures";
import HomePage from "src/pom/pages/shop/home-page";
import { randomCode } from "src/utils/random";

/**
 * Login, session and logout. Case ids map to the "Login" sheet of
 * docs/test-cases/demoblaze-test-cases.xlsx. Every test starts as a guest on
 * the home page (the `homePage` fixture's default session).
 */
test.describe("Login", () => {
	test.describe("Valid credentials", () => {
		test(
			"LOGIN-002: Log in with valid credentials",
			{ tag: "@smoke" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Open the Log in modal", async () => {
					await homePage.openLoginModal();
				});
				await test.step("Step 2: Submit a valid username and password", async () => {
					await homePage.fillLoginForm(account.username, account.password);
					await homePage.submitLogin(account.username);
				});
				await test.step("Step 3: Verify the navbar shows the signed-in user", async () => {
					await homePage.assertLoggedInAs(account.username);
				});
			},
		);

		test(
			"LOGIN-003: Session persists across reload, navigation and a new tab",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Log in", async () => {
					await homePage.login(account.username, account.password);
				});
				await test.step("Step 2: Reload the home page", async () => {
					await homePage.reloadPage();
					await homePage.assertLoggedInAs(account.username);
				});
				await test.step("Step 3: Open the cart page", async () => {
					const cartPage = await homePage.openCart();
					await cartPage.assertLoggedInAs(account.username);
				});
				// Merged from LOGIN-004: same session cookie, so a new tab is signed in.
				await test.step("Step 4: Open the site in a new tab", async () => {
					const newTab = await homePage.openInNewTab();
					await newTab.assertLoggedInAs(account.username);
				});
			},
		);

		test(
			"LOGIN-005: Log out returns the user to the logged-out state",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Log in", async () => {
					await homePage.login(account.username, account.password);
				});
				await test.step("Step 2: Log out and verify the logged-out navbar", async () => {
					await homePage.logout();
				});
				await test.step("Step 3: Reload and verify the session does not come back", async () => {
					await homePage.reloadPage();
					await homePage.assertLoggedOut();
				});
			},
		);

		test(
			"LOGIN-028: A failed attempt can be corrected without reopening the modal",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Submit a wrong password", async () => {
					await homePage.attemptLogin(account.username, `${account.password}x`);
					await homePage.assertLoginRejected();
				});
				await test.step("Step 2: Correct the password in the same modal and submit", async () => {
					await homePage.fillLoginForm(account.username, account.password);
					await homePage.submitLogin(account.username);
				});
			},
		);
	});

	test.describe("Login modal", () => {
		test(
			"LOGIN-001: Open the Log in modal from the navbar; password is masked",
			{ tag: "@regression" },
			async ({ homePage }) => {
				await test.step("Step 1: Click Log in in the navbar", async () => {
					await homePage.openLoginModal();
				});
				await test.step("Step 2: Verify the modal's title, fields and buttons", async () => {
					await homePage.assertLoginModalOpen();
				});
				// Merged from LOGIN-007.
				await test.step("Step 3: Verify the password field masks input", async () => {
					await homePage.assertPasswordMasked();
				});
			},
		);

		test(
			"LOGIN-008: Closing the modal does not log the user in",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Type credentials, then close with the Close button", async () => {
					await homePage.openLoginModal();
					await homePage.fillLoginForm(account.username, account.password);
					await homePage.closeLoginModal("button");
				});
				await test.step("Step 2: Reopen, then close with the X icon", async () => {
					await homePage.openLoginModal();
					await homePage.closeLoginModal("x");
				});
				await test.step("Step 3: Verify the user is still logged out", async () => {
					await homePage.assertLoggedOut();
				});
			},
		);
	});

	test.describe("Rejected credentials", () => {
		// LOGIN-011: the client-side required-field check, one case with three
		// data sets (LOGIN-012 and LOGIN-013 were merged into it).
		const missingFieldCases = [
			{
				title: "both fields empty",
				username: "",
				password: "",
			},
			{
				title: "username empty",
				username: "",
				password: "secret",
			},
			{
				title: "password empty",
				username: "someone",
				password: "",
			},
		];
		for (const c of missingFieldCases) {
			test(
				`LOGIN-011: Required fields are enforced (${c.title})`,
				{ tag: "@regression" },
				async ({ homePage }) => {
					await test.step("Step 1: Submit the incomplete form", async () => {
						await homePage.attemptLogin(c.username, c.password);
					});
					await test.step("Step 2: Verify the required-fields alert and no session", async () => {
						await homePage.assertAlertShown(ALERTS.loginFieldsRequired);
						await homePage.assertLoggedOut();
					});
				},
			);
		}

		test(
			"LOGIN-014: Non-existent username is rejected",
			{ tag: "@regression" },
			async ({ homePage }) => {
				await test.step("Step 1: Submit an unregistered username", async () => {
					await homePage.attemptLogin(`nouser_${randomCode(12)}`, "whatever");
				});
				await test.step("Step 2: Verify the login is rejected and no session", async () => {
					await homePage.assertLoginRejected();
					await homePage.assertLoggedOut();
				});
			},
		);

		test(
			"LOGIN-015: Wrong password is rejected",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Submit a valid username with a wrong password", async () => {
					await homePage.attemptLogin(
						account.username,
						`wrong-${randomCode(6)}`,
					);
				});
				await test.step("Step 2: Verify the login is rejected and no session", async () => {
					await homePage.assertLoginRejected();
					await homePage.assertLoggedOut();
				});
			},
		);

		test(
			"LOGIN-016: Password is case-sensitive",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				const swappedCase = [...account.password]
					.map((ch) =>
						ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(),
					)
					.join("");
				await test.step("Step 1: Submit the password with its letter case swapped", async () => {
					await homePage.attemptLogin(account.username, swappedCase);
				});
				await test.step("Step 2: Verify the login is rejected", async () => {
					await homePage.assertLoginRejected();
					await homePage.assertLoggedOut();
				});
			},
		);

		test(
			"LOGIN-024: Very long credentials are rejected gracefully",
			{ tag: "@regression" },
			async ({ homePage }) => {
				// Random, not "a".repeat(1000): someone has registered exactly that
				// username on the public site, which turns this into a wrong-password case.
				const longValue = randomCode(1000);
				await test.step("Step 1: Submit 1000-character username and password", async () => {
					await homePage.attemptLogin(longValue, longValue);
				});
				await test.step("Step 2: Verify a normal rejection, not a crash", async () => {
					await homePage.assertLoginRejected();
					await homePage.assertLoggedOut();
				});
			},
		);

		test(
			"LOGIN-021: Whitespace-only credentials are treated as empty",
			{
				tag: "@regression",
				annotation: {
					type: "known-defect",
					description:
						"DEF-01: logIn() only checks == '' so spaces are sent to the server",
				},
			},
			async ({ homePage }) => {
				await test.step("Step 1: Submit spaces in both fields", async () => {
					await homePage.attemptLogin("   ", "   ");
				});
				await test.step("Step 2: Verify the required-fields alert", async () => {
					await homePage.assertAlertShown(ALERTS.loginFieldsRequired);
				});
			},
		);
	});

	test.describe("Username rules and error messages", () => {
		/** A fresh account whose username mixes upper and lower case. */
		async function registerMixedCaseUser(api: DemoblazeApi) {
			const user = {
				username: `PwExam_Mixed_${randomCode(6)}`,
				password: `Mixed@${randomCode(6)}`,
			};
			await api.signup(user.username, user.password);
			return user;
		}

		test(
			"LOGIN-022: Spaces around a valid username are trimmed and login succeeds",
			{
				tag: "@regression",
				annotation: {
					type: "known-defect",
					description:
						"DEF-16: the username is not trimmed, so '  <valid>  ' is answered 'User does not exist.'",
				},
			},
			async ({ homePage, account }) => {
				await test.step("Step 1: Enter the valid username wrapped in spaces", async () => {
					await homePage.openLoginModal();
					await homePage.fillLoginForm(
						`  ${account.username}  `,
						account.password,
					);
				});
				await test.step("Step 2: Click Log in", async () => {
					await homePage.submitLoginCollectingAlerts();
				});
				await test.step("Step 3: Verify the user is logged in under the trimmed name", async () => {
					await homePage.assertNoAlerts();
					await homePage.assertLoggedInAs(account.username);
				});
			},
		);

		test(
			"LOGIN-032: A mixed-case username logs in exactly as registered",
			{ tag: "@regression" },
			async ({ homePage, demoblazeApi }) => {
				const user =
					await test.step("Step 1: Register a mixed-case username (API setup)", async () =>
						registerMixedCaseUser(demoblazeApi));
				await test.step("Step 2: Log in with the username exactly as registered", async () => {
					await homePage.login(user.username, user.password);
				});
				await test.step("Step 3: Verify the welcome text keeps the original letter case", async () => {
					await homePage.assertLoggedInAs(user.username);
				});
			},
		);

		test(
			"LOGIN-023: A username in a different letter case is rejected",
			{ tag: "@regression" },
			async ({ homePage, demoblazeApi }) => {
				const user =
					await test.step("Step 1: Register a mixed-case username (API setup)", async () =>
						registerMixedCaseUser(demoblazeApi));
				for (const variant of [
					user.username.toLowerCase(),
					user.username.toUpperCase(),
				]) {
					await test.step(`Step 2: Log in as "${variant}" with the right password`, async () => {
						await homePage.openLoginModal();
						await homePage.fillLoginForm(variant, user.password);
						await homePage.submitLoginCollectingAlerts();
					});
					await test.step("Step 3: Verify the login is rejected and no session starts", async () => {
						await homePage.assertLoginRejected();
						await homePage.assertLoggedOut();
					});
				}
			},
		);

		test(
			"LOGIN-033: Wrong username and wrong password show the same generic message",
			{
				tag: "@regression",
				annotation: {
					type: "known-defect",
					description:
						"DEF-15: the site answers 'User does not exist.' vs 'Wrong password.', revealing which usernames exist",
				},
			},
			async ({ homePage, account }) => {
				const unknownUser =
					await test.step("Step 1: Submit an unregistered username", async () => {
						await homePage.attemptLogin(
							`nouser_${randomCode(12)}`,
							account.password,
						);
						return homePage.getLastAlert();
					});
				const wrongPassword =
					await test.step("Step 2: Submit a registered username with a wrong password", async () => {
						await homePage.attemptLogin(
							account.username,
							`wrong-${randomCode(6)}`,
						);
						return homePage.getLastAlert();
					});
				await test.step("Step 3: Verify both show the same generic message", async () => {
					await homePage.assertGenericLoginError([unknownUser, wrongPassword]);
				});
			},
		);
	});

	test.describe("Session and navigation", () => {
		test(
			"LOGIN-006: Browser Back after logout does not restore the session",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Log in, then log out", async () => {
					await homePage.login(account.username, account.password);
					await homePage.logout();
				});
				await test.step("Step 2: Press Back and reload", async () => {
					await homePage.goBackAndReload();
				});
				await test.step("Step 3: Verify the user is still logged out", async () => {
					await homePage.assertLoggedOut();
				});
			},
		);

		test(
			"LOGIN-009: Log in from the Cart page and from a Product page",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				const cartPage =
					await test.step("Step 1: Open the cart as a guest", async () =>
						homePage.openCart());
				await test.step("Step 2: Log in there and stay on the cart page", async () => {
					await cartPage.login(account.username, account.password);
					await cartPage.assertOnPage(/\/cart\.html/);
				});
				await test.step("Step 3: Log out (lands on the home page)", async () => {
					await cartPage.logout();
				});
				const productPage =
					await test.step("Step 4: Open a product as a guest", async () =>
						new HomePage(cartPage.getPage()).openProduct(
							PRODUCTS.samsungGalaxyS6.title,
						));
				await test.step("Step 5: Log in there and stay on the product page", async () => {
					await productPage.login(account.username, account.password);
					await productPage.assertOnPage(/\/prod\.html/);
				});
			},
		);

		test(
			"LOGIN-010: Switch account — log out user A, log in user B",
			{ tag: "@regression" },
			async ({ homePage, account, secondAccount }) => {
				await test.step("Step 1: Log in as user A, then log out", async () => {
					await homePage.login(account.username, account.password);
					await homePage.logout();
				});
				await test.step("Step 2: Log in as user B", async () => {
					await homePage.login(secondAccount.username, secondAccount.password);
				});
				await test.step("Step 3: Verify the navbar shows user B", async () => {
					await homePage.assertLoggedInAs(secondAccount.username);
				});
			},
		);

		test(
			"LOGIN-019: A tampered session cookie is rejected",
			{ tag: "@regression" },
			async ({ homePage }) => {
				await test.step("Step 1: Set the session cookie to an invalid token", async () => {
					await homePage.setSessionCookie(`invalid-token-${randomCode(8)}`);
				});
				await test.step("Step 2: Reload the page", async () => {
					await homePage.reloadCollectingAlerts();
				});
				await test.step("Step 3: Verify the error alert and that the user is not logged in", async () => {
					await homePage.assertAlertShown(ALERTS.tokenMalformed);
					await homePage.assertLoggedOut();
				});
			},
		);
	});

	test.describe("Input and interaction", () => {
		test(
			"LOGIN-025: Unicode and special characters in credentials",
			{ tag: "@regression" },
			async ({ homePage, demoblazeApi }) => {
				const unicodeUser = {
					username: `tëst_用户_😀_${randomCode(6)}`,
					password: `pässwörd!@#${randomCode(4)}`,
				};
				await test.step("Step 1: Register an account with unicode credentials (API setup)", async () => {
					await demoblazeApi.signup(unicodeUser.username, unicodeUser.password);
				});
				await test.step("Step 2: Log in with them through the UI", async () => {
					await homePage.login(unicodeUser.username, unicodeUser.password);
				});
				await test.step("Step 3: Verify the welcome text renders the unicode name", async () => {
					await homePage.assertLoggedInAs(unicodeUser.username);
				});
			},
		);

		test(
			"LOGIN-026: Pressing Enter submits the login form",
			{
				tag: "@regression",
				annotation: {
					type: "known-defect",
					description:
						"DEF-08: the form has no submit button, so Enter does nothing",
				},
			},
			async ({ homePage, account }) => {
				await test.step("Step 1: Fill valid credentials", async () => {
					await homePage.openLoginModal();
					await homePage.fillLoginForm(account.username, account.password);
				});
				await test.step("Step 2: Press Enter in the password field", async () => {
					await homePage.submitLoginWithEnter();
				});
				await test.step("Step 3: Verify the user is logged in", async () => {
					await homePage.assertLoggedInAs(account.username, 10_000);
				});
			},
		);

		test(
			"LOGIN-027: Double-clicking Log in logs in once, without errors",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Fill valid credentials", async () => {
					await homePage.openLoginModal();
					await homePage.fillLoginForm(account.username, account.password);
				});
				await test.step("Step 2: Double-click Log in", async () => {
					await homePage.doubleClickLoginSubmit();
				});
				await test.step("Step 3: Verify one clean login", async () => {
					await homePage.assertNoAlerts();
					await homePage.assertLoggedInAs(account.username);
				});
			},
		);

		test(
			"LOGIN-030: Repeated wrong passwords trigger brute-force protection",
			{
				tag: "@regression",
				annotation: {
					type: "known-defect",
					description:
						"DEF-13: no lockout, delay or captcha — the 11th (correct) attempt logs straight in",
				},
			},
			async ({ homePage, account }) => {
				await test.step("Step 1: Submit a wrong password 10 times", async () => {
					for (let i = 1; i <= 10; i++) {
						await homePage.attemptLogin(
							account.username,
							`wrong-${i}-${randomCode(4)}`,
						);
						await homePage.assertLoginRejected();
					}
				});
				await test.step("Step 2: Submit the correct password", async () => {
					await homePage.fillLoginForm(account.username, account.password);
					await homePage.submitLoginCollectingAlerts();
				});
				await test.step("Step 3: Verify the attempt is throttled, not let through", async () => {
					await homePage.assertUserGotFeedback();
					await homePage.assertLoggedOut();
				});
			},
		);
	});

	test.describe("Responsive", () => {
		test(
			"LOGIN-031: Log in on a phone-sized viewport",
			{ tag: "@regression" },
			async ({ homePage, account }) => {
				await test.step("Step 1: Switch to a 390x844 viewport", async () => {
					await homePage.setViewport(390, 844);
					await homePage.reloadPage();
				});
				await test.step("Step 2: Verify the navbar links are visible and usable", async () => {
					await homePage.assertNavLinksVisible();
				});
				await test.step("Step 3: Open Log in and verify the modal fits the screen", async () => {
					await homePage.openLoginModal();
					await homePage.assertLoginModalFitsViewport();
				});
				await test.step("Step 4: Log in and verify the welcome text", async () => {
					await homePage.fillLoginForm(account.username, account.password);
					await homePage.submitLogin(account.username);
				});
			},
		);
	});
});
