import type { Dialog, Page, TestInfo } from "@playwright/test";
import { getBaseUrl } from "configs/url";
import { ALERTS, GENERIC_LOGIN_ERROR } from "src/data/demoblaze-data";
import { expect } from "@playwright/test";
import Popup from "src/base/base-popup";
import BasePage from "src/base/base-page";
import HEADER_UI from "src/pom/ui/common/header-ui";
import logger from "src/utils/logger";
import { scaled } from "src/utils/timeouts";

// Bootstrap's modal fade is ~300ms; this only bounds how long a genuinely
// stuck modal is tolerated.
const MODAL_TIMEOUT = 10000;
// Login = one API round trip + a full page reload + a second /check round
// trip before "Welcome <user>" is written. Generous on purpose.
const LOGIN_SETTLE_TIMEOUT = 30000;
// How long collectAlertsDuring() keeps listening after its action. Covers an
// alert raised in an API success callback, which is the slowest case.
const ALERT_SETTLE_MS = 5000;

/**
 * Everything every DemoBlaze page shares: the navbar, the Log in modal (both
 * duplicated verbatim in index/prod/cart HTML), and the site's habit of
 * reporting results through native `alert()`.
 *
 * Not instantiated directly — HomePage, ProductPage and CartPage extend it.
 * Navigation that returns another Page object lives in those subclasses, so
 * this base never imports them (a base class importing its own subclasses is
 * a circular require that crashes at load time).
 */
export default abstract class StorePage extends BasePage {
	protected loginModal: Popup;
	/** Message of the last native alert a Page action captured. */
	protected lastAlertMessage?: string;
	/** Every alert collectAlertsDuring() saw, in order. */
	protected lastAlerts: string[] = [];

	constructor(page: Page, testInfo?: TestInfo) {
		super(page, testInfo);
		this.loginModal = new Popup(page, {
			root: HEADER_UI.rootLoginModal,
			trigger: HEADER_UI.btnNavLogin,
			btnClose: HEADER_UI.btnLoginClose,
		});
	}

	/** Page-specific readiness: content that only exists once its JS has run. */
	abstract assertLoaded(): Promise<void>;

	// ─── Login modal ───

	async openLoginModal(): Promise<void> {
		await this.loginModal.open();
		await this.loginModal.assertAppear({ timeout: MODAL_TIMEOUT });
	}

	async fillLoginForm(username: string, password: string): Promise<void> {
		await this.fill(HEADER_UI.txtLoginUsername, username, { clear: true });
		await this.fill(HEADER_UI.txtLoginPassword, password, { clear: true });
	}

	/**
	 * The happy path: open the modal, submit valid credentials, and wait until
	 * the reloaded page shows the user as signed in.
	 */
	async login(username: string, password: string): Promise<void> {
		logger.info(`Logging in as ${username}`);
		await this.openLoginModal();
		await this.fillLoginForm(username, password);
		await this.click(HEADER_UI.btnLoginSubmit);
		await this.assertLoggedInAs(username);
	}

	/**
	 * Submits credentials that are expected to be REJECTED and records the
	 * alert the site raises, for assertAlertShown(). Fails (by timeout) if no
	 * alert appears — which is exactly what an unexpectedly successful login
	 * looks like.
	 */
	async attemptLogin(username: string, password: string): Promise<void> {
		await this.openLoginModal();
		await this.fillLoginForm(username, password);
		await this.submitLoginExpectingAlert();
	}

	/** Clicks Log in on an already-filled modal and records the alert. */
	async submitLoginExpectingAlert(): Promise<void> {
		this.lastAlertMessage = await this.clickAndCaptureDialog(
			HEADER_UI.btnLoginSubmit,
		);
	}

	/** Presses Enter in the password field instead of clicking Log in. */
	async submitLoginWithEnter(): Promise<void> {
		await this.collectAlertsDuring(() =>
			this.locator(HEADER_UI.txtLoginPassword).press("Enter"),
		);
	}

	/** Double-clicks Log in, recording every alert the two clicks cause. */
	async doubleClickLoginSubmit(): Promise<void> {
		await this.collectAlertsDuring(() =>
			this.locator(HEADER_UI.btnLoginSubmit).dblclick(),
		);
	}

	/**
	 * Clicks Log in when the OUTCOME is unknown (e.g. the API is failing) and
	 * records whatever alerts appear — possibly none — for
	 * assertUserGotFeedback() / assertNoAlerts().
	 */
	async submitLoginCollectingAlerts(): Promise<void> {
		await this.collectAlertsDuring(() => this.click(HEADER_UI.btnLoginSubmit));
	}

	/** Clicks Log in on an already-filled modal and waits for the session. */
	async submitLogin(username: string): Promise<void> {
		await this.click(HEADER_UI.btnLoginSubmit);
		await this.assertLoggedInAs(username);
	}

	async closeLoginModal(via: "button" | "x" = "button"): Promise<void> {
		if (via === "x") {
			await this.click(HEADER_UI.btnLoginCloseX);
		} else {
			await this.loginModal.close();
		}
		await this.loginModal.assertDisappear({ timeout: MODAL_TIMEOUT });
	}

	async assertLoginModalOpen(): Promise<void> {
		await this.loginModal.assertAppear({ timeout: MODAL_TIMEOUT });
		await this.assertElementHasText(HEADER_UI.lblLoginModalTitle, "Log in");
		await this.assertVisible(HEADER_UI.txtLoginUsername);
		await this.assertVisible(HEADER_UI.txtLoginPassword);
		await this.assertVisible(HEADER_UI.btnLoginSubmit);
		await this.assertVisible(HEADER_UI.btnLoginClose);
	}

	/** The password field must mask its input (type="password"). */
	async assertPasswordMasked(): Promise<void> {
		await this.assertElementAttributeHasValue(
			HEADER_UI.txtLoginPassword,
			"type",
			"password",
		);
	}

	// ─── Session ───

	async logout(): Promise<void> {
		await this.click(HEADER_UI.btnNavLogout);
		await this.waitForUrl(/\/index\.html$/, {
			timeout: scaled(LOGIN_SETTLE_TIMEOUT),
		});
		await this.assertLoggedOut();
	}

	/** Navbar shows "Welcome <username>" + Log out, and hides Log in / Sign up. */
	async assertLoggedInAs(
		username: string,
		timeout = LOGIN_SETTLE_TIMEOUT,
	): Promise<void> {
		await this.assertElementHasText(
			HEADER_UI.lblWelcome,
			`Welcome ${username}`,
			{
				timeout,
			},
		);
		await this.assertVisible(HEADER_UI.btnNavLogout, { timeout });
		await this.assertNotVisible(HEADER_UI.btnNavLogin, { timeout });
		await this.assertNotVisible(HEADER_UI.btnNavSignup, { timeout });
	}

	/**
	 * Log in / Sign up visible, no Welcome / Log out. Note the page shows Log
	 * in by default and only hides it once its `/check` call confirms a
	 * token — so this is only meaningful once the page has had that chance
	 * (call assertLoaded() first on a freshly loaded page).
	 */
	async assertLoggedOut(): Promise<void> {
		await this.assertVisible(HEADER_UI.btnNavLogin);
		await this.assertVisible(HEADER_UI.btnNavSignup);
		await this.assertNotVisible(HEADER_UI.lblWelcome);
		await this.assertNotVisible(HEADER_UI.btnNavLogout);
	}

	/**
	 * Plants a session cookie directly — for tests of how the site treats a
	 * token it did not issue (tampered, forged). Takes effect on next load.
	 */
	async setSessionCookie(token: string): Promise<void> {
		await this.getPage()
			.context()
			.addCookies([{ name: "tokenp_", value: token, url: getBaseUrl() }]);
	}

	/** Reloads and records any alerts the page raises while loading. */
	async reloadCollectingAlerts(): Promise<void> {
		await this.collectAlertsDuring(() => this.reload());
	}

	// ─── Navigation ───

	/**
	 * DemoBlaze's navbar never collapses: `#navbarExample` lacks Bootstrap's
	 * `collapse` class, so at phone width the links wrap but stay visible.
	 * This checks they are there and usable at the current viewport.
	 */
	async assertNavLinksVisible(): Promise<void> {
		for (const link of [
			HEADER_UI.btnNavHome,
			HEADER_UI.btnNavCart,
			HEADER_UI.btnNavLogin,
			HEADER_UI.btnNavSignup,
		]) {
			await this.assertVisible(link);
		}
	}

	/** The open Log in modal fits horizontally inside the viewport. */
	async assertLoginModalFitsViewport(): Promise<void> {
		const box = await this.locator(
			`${HEADER_UI.rootLoginModal}//div[@class='modal-content']`,
		).boundingBox();
		const viewport = this.getPage().viewportSize();
		expect(box, "Login modal has no layout box").not.toBeNull();
		if (box && viewport) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
		}
	}

	async setViewport(width: number, height: number): Promise<void> {
		await this.getPage().setViewportSize({ width, height });
	}

	/** The browser is on this page (path match on the current URL). */
	async assertOnPage(path: RegExp): Promise<void> {
		await expect(this.getPage()).toHaveURL(path);
	}

	/** Browser Back, then a reload — what a user does to "undo" a logout. */
	async goBackAndReload(): Promise<void> {
		await this.goBack();
		await this.reloadPage();
	}

	protected async clickNavCart(): Promise<void> {
		await this.click(HEADER_UI.btnNavCart);
		await this.waitForUrl(/\/cart\.html/);
	}

	async reloadPage(): Promise<void> {
		await this.reload();
		await this.assertLoaded();
	}

	// ─── Native alerts ───

	/**
	 * Runs `action` and records EVERY native dialog raised during it and for
	 * ALERT_SETTLE_MS afterwards, accepting each one. For outcomes where the
	 * number of alerts — or their absence — is the thing under test.
	 *
	 * The settle wait is a deliberate fixed wait: it is waiting for the
	 * ABSENCE of an event, which has no condition to poll for. The listener is
	 * always removed, so nothing leaks into later steps.
	 */
	protected async collectAlertsDuring(
		action: () => Promise<unknown>,
	): Promise<string[]> {
		const messages: string[] = [];
		const onDialog = async (dialog: Dialog) => {
			messages.push(dialog.message());
			logger.info(`Collected ${dialog.type()} dialog: "${dialog.message()}"`);
			await dialog.accept();
		};
		this.getPage().on("dialog", onDialog);
		try {
			await action();
			await this.waitForTimeout(scaled(ALERT_SETTLE_MS));
		} finally {
			this.getPage().off("dialog", onDialog);
		}
		this.lastAlerts = messages;
		this.lastAlertMessage = messages.at(-1);
		return messages;
	}

	/** Makes the named API endpoint fail at the network level for this page. */
	async simulateApiFailure(endpoint: string): Promise<void> {
		logger.info(`Simulating a network failure for /${endpoint}`);
		await this.getPage().route(`**/${endpoint}`, (route) =>
			route.abort("failed"),
		);
	}

	/** The last collected action produced no alert at all. */
	async assertNoAlerts(): Promise<void> {
		expect(this.lastAlerts, "Unexpected alert(s)").toEqual([]);
	}

	/**
	 * The user was told SOMETHING about the last action: an alert, or text
	 * in the login modal's inline error label.
	 */
	async assertUserGotFeedback(): Promise<void> {
		const inlineError = (
			await this.locator(HEADER_UI.lblLoginError)
				.innerText()
				.catch(() => "")
		).trim();
		expect(
			this.lastAlerts.length > 0 || inlineError.length > 0,
			"The action failed silently: no alert and no inline error message",
		).toBe(true);
	}

	/** The message of the last alert a Page action captured, if any. */
	getLastAlert(): string | undefined {
		return this.lastAlertMessage;
	}

	/**
	 * The last login attempt was refused with an error alert — any error
	 * other than the required-fields check, which means the form was not even
	 * submitted. Deliberately not tied to the site's exact wording (see
	 * assertGenericLoginError() for the wording rule).
	 */
	async assertLoginRejected(): Promise<void> {
		expect(
			this.lastAlertMessage,
			"No alert was captured — the login was not rejected",
		).toBeDefined();
		expect(this.lastAlertMessage).not.toBe(ALERTS.loginFieldsRequired);
	}

	/**
	 * Every failed login shows the SAME generic message, so it does not reveal
	 * whether the username exists. Compares all given messages at once, so a
	 * failure shows every actual message side by side.
	 */
	async assertGenericLoginError(
		messages: (string | undefined)[],
	): Promise<void> {
		logger.info(`Login error messages: ${JSON.stringify(messages)}`);
		expect(messages).toEqual(messages.map(() => GENERIC_LOGIN_ERROR));
	}

	/** Asserts the last alert captured by a Page action had exactly `message`. */
	async assertAlertShown(message: string): Promise<void> {
		logger.info(
			`Asserting alert: expected "${message}", got "${this.lastAlertMessage}"`,
		);
		expect(
			this.lastAlertMessage,
			"No alert was captured — the action did not raise the expected alert",
		).toBeDefined();
		expect(this.lastAlertMessage).toBe(message);
	}
}
