/**
 * The navbar and the Log in modal. Both are duplicated verbatim in the HTML of
 * every DemoBlaze page (index, prod, cart), so one locator set serves them all.
 * Source: https://www.demoblaze.com/index.html
 */
export const HEADER_UI = {
	// ─── Navbar ───
	rootNavbar: "//nav[@id='narvbarx']",
	btnNavHome: "//a[@id='nava']",
	btnNavCart: "//a[@id='cartur']",
	btnNavLogin: "//a[@id='login2']",
	btnNavSignup: "//a[@id='signin2']",
	btnNavLogout: "//a[@id='logout2']",
	// Filled by the page's own JS with "Welcome <username>" once /check succeeds.
	lblWelcome: "//a[@id='nameofuser']",

	// ─── Log in modal ───
	rootLoginModal: "//div[@id='logInModal']",
	// Scoped to the modal: cart.html reuses the id "logInModalLabel" on its
	// "About us" modal too, so an id-only lookup is ambiguous there.
	lblLoginModalTitle: "//div[@id='logInModal']//h5[@class='modal-title']",
	txtLoginUsername: "//input[@id='loginusername']",
	txtLoginPassword: "//input[@id='loginpassword']",
	// Present in the markup for inline errors; the site's JS never writes to it.
	lblLoginError: "//label[@id='errorl']",
	btnLoginSubmit:
		"//div[@id='logInModal']//div[@class='modal-footer']/button[normalize-space()='Log in']",
	btnLoginClose:
		"//div[@id='logInModal']//div[@class='modal-footer']/button[normalize-space()='Close']",
	btnLoginCloseX: "//div[@id='logInModal']//button[@class='close']",
} as const;

export default HEADER_UI;
