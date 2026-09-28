/**
 * Product detail page (prod.html?idp_=<id>). The whole block is injected by
 * js/prod.js after `/view` responds.
 */
export const PRODUCT_UI = {
	// ─── Product details ───
	lblProductName: "//div[@id='tbodyid']/h2[@class='name']",
	// Reads "$360 *includes tax" — the price is the leading number.
	lblProductPrice: "//div[@id='tbodyid']/h3[@class='price-container']",
	btnAddToCart: "//div[@id='tbodyid']//a[normalize-space()='Add to cart']",
} as const;

export default PRODUCT_UI;
