/**
 * Environment base URLs.
 *
 * `ENV` selects one; anything unrecognised falls back to production, the only
 * environment DemoBlaze publishes. Playwright receives the web URL as the
 * context's `baseURL` (see src/fixtures/base-fixtures.ts), which is what lets
 * every Page class keep `_url` as a plain path like "/cart.html".
 *
 * Each value can be overridden from `.env` without editing code — point
 * `STAGING_URL` / `STAGING_API_URL` at a private copy of the site and run with
 * `ENV=staging`.
 */
export const BaseURL = {
	PRODUCTION_URL: process.env.PRODUCTION_URL ?? "https://www.demoblaze.com",
	PRODUCTION_API_URL:
		process.env.PRODUCTION_API_URL ?? "https://api.demoblaze.com",
	STAGING_URL: process.env.STAGING_URL ?? "https://www.demoblaze.com",
	STAGING_API_URL: process.env.STAGING_API_URL ?? "https://api.demoblaze.com",
} as const;

export function getBaseUrl(env = process.env.ENV): string {
	return env === "staging" ? BaseURL.STAGING_URL : BaseURL.PRODUCTION_URL;
}

/** The backend the storefront's own JS calls (see its `config.json`). */
export function getApiUrl(env = process.env.ENV): string {
	return env === "staging"
		? BaseURL.STAGING_API_URL
		: BaseURL.PRODUCTION_API_URL;
}

export default BaseURL;
