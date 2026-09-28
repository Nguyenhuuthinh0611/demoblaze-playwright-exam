/**
 * Home page product grid. Cards are appended client-side after `/entries`
 * (or `/bycat`) responds, so none of these exist at DOMContentLoaded.
 * Source: https://www.demoblaze.com/index.html + js/index.js
 */
export const HOME_UI = {
	// ─── Categories ───
	// Every category link shares id="itemc" in the source, so match by text.
	btnCategory: "//a[@id='itemc' and normalize-space()='$0']",

	// ─── Product grid ───
	rootProductGrid: "//div[@id='tbodyid']",
	lblProductTitles: "//div[@id='tbodyid']//a[@class='hrefch']",
	lblProductCards: "//div[@id='tbodyid']//div[contains(@class,'card h-100')]",
	btnProductByName:
		"//div[@id='tbodyid']//a[@class='hrefch' and normalize-space()='$0']",

	// ─── Pagination ───
	btnNextPage: "//button[@id='next2']",
} as const;

export default HOME_UI;
