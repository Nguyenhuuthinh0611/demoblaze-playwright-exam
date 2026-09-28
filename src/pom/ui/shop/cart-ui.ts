/**
 * Cart page (cart.html), its Place order modal and the purchase confirmation.
 * Rows are appended one per `/view` response, in whatever order those
 * responses land — never rely on row order.
 * Source: https://www.demoblaze.com/cart.html + js/cart.js
 */
export const CART_UI = {
	// ─── Cart table ───
	lblTableHeaders: "//tbody[@id='tbodyid']/preceding-sibling::thead//th",
	lblTotalHeading: "//h2[normalize-space()='Total']",
	lblCartRows: "//tbody[@id='tbodyid']/tr",
	lblRowTitles: "//tbody[@id='tbodyid']/tr/td[2]",
	lblRowPrices: "//tbody[@id='tbodyid']/tr/td[3]",
	lblRowByTitle: "//tbody[@id='tbodyid']/tr[td[2][normalize-space()='$0']]",
	btnDeleteByTitle:
		"//tbody[@id='tbodyid']/tr[td[2][normalize-space()='$0']]//a[normalize-space()='Delete']",
	// Empty until at least one row has loaded; holds the running sum.
	lblTotal: "//h3[@id='totalp']",
	btnPlaceOrder: "//button[normalize-space()='Place Order']",

	// ─── Place order modal ───
	rootOrderModal: "//div[@id='orderModal']",
	lblOrderTotal: "//label[@id='totalm']",
	txtName: "//input[@id='name']",
	txtCountry: "//input[@id='country']",
	txtCity: "//input[@id='city']",
	txtCard: "//input[@id='card']",
	txtMonth: "//input[@id='month']",
	txtYear: "//input[@id='year']",
	btnPurchase:
		"//div[@id='orderModal']//div[@class='modal-footer']/button[normalize-space()='Purchase']",
	btnOrderClose:
		"//div[@id='orderModal']//div[@class='modal-footer']/button[normalize-space()='Close']",

	// ─── Purchase confirmation (bootstrap-sweetalert) ───
	rootConfirmation:
		"//div[contains(@class,'sweet-alert') and contains(@class,'visible')]",
	lblConfirmationTitle:
		"//div[contains(@class,'sweet-alert') and contains(@class,'visible')]/h2",
	// "Id: …\nAmount: … USD\nCard Number: …\nName: …\nDate: D/M/YYYY"
	lblConfirmationDetails:
		"//div[contains(@class,'sweet-alert') and contains(@class,'visible')]/p[contains(@class,'lead')]",
	// Any element parsed from the details text — there should be none.
	lblConfirmationDetailsMarkup:
		"//div[contains(@class,'sweet-alert') and contains(@class,'visible')]/p[contains(@class,'lead')]/*[not(self::br)]",
	btnConfirmationOk:
		"//div[contains(@class,'sweet-alert') and contains(@class,'visible')]//button[normalize-space()='OK']",
} as const;

export default CART_UI;
