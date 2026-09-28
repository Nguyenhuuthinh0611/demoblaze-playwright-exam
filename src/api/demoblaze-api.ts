import { randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { getApiUrl } from "configs/url";
import { BaseEntity } from "src/base/base-entity";
import logger from "src/utils/logger";

/** A catalogue entry as `/entries`, `/bycat` and `/view` return it. */
export interface Product {
	id: number;
	title: string;
	price: number;
	cat: string;
	desc: string;
	img: string;
}

/** One line of a cart as `/viewcart` returns it. `id` is the LINE id. */
export interface CartLine {
	id: string;
	cookie: string;
	prod_id: number;
}

/** The typed result of an auth call: a token on success, the error otherwise. */
export interface AuthResult {
	ok: boolean;
	token?: string;
	errorMessage?: string;
}

/**
 * Encodes a password exactly as the storefront's own `b64EncodeUnicode()`
 * does before sending it. The API compares the ENCODED string, so a plain
 * password sent here would always come back "Wrong password.".
 */
export function encodePassword(password: string): string {
	return Buffer.from(password, "utf-8").toString("base64");
}

/**
 * Client for the DemoBlaze backend (`api.demoblaze.com`).
 *
 * Every endpoint is a JSON POST (except `/entries`), and failures come back as
 * HTTP 200 with an `{ errorMessage }` body — so callers must read the body,
 * never just the status. Methods here return parsed, typed values and leave
 * the verdict to the caller; `raw*` variants expose the APIResponse for the
 * API specs that assert on status, headers and timing.
 */
export default class DemoblazeApi extends BaseEntity {
	protected baseUrl = getApiUrl();

	constructor(request: APIRequestContext) {
		super(request, { headers: { "Content-Type": "application/json" } });
	}

	// ─── Auth ───

	async rawLogin(username: string, password: string): Promise<APIResponse> {
		return this.post("/login", {
			data: { username, password: encodePassword(password) },
		});
	}

	/** Logs in; success is a JSON string `"Auth_token: <token>"`. */
	async login(username: string, password: string): Promise<AuthResult> {
		const body = await (await this.rawLogin(username, password)).json();
		if (typeof body === "string" && body.startsWith("Auth_token: ")) {
			return { ok: true, token: body.replace("Auth_token: ", "") };
		}
		return { ok: false, errorMessage: body?.errorMessage ?? String(body) };
	}

	async rawSignup(username: string, password: string): Promise<APIResponse> {
		return this.post("/signup", {
			data: { username, password: encodePassword(password) },
		});
	}

	/** Registers an account. Any body other than `{ errorMessage }` is success. */
	async signup(username: string, password: string): Promise<AuthResult> {
		const response = await this.rawSignup(username, password);
		const text = await response.text();
		const body = text ? JSON.parse(text) : "";
		if (body && typeof body === "object" && "errorMessage" in body) {
			return { ok: false, errorMessage: body.errorMessage };
		}
		return { ok: response.ok() };
	}

	/** Resolves a token to its username, or undefined when the token is rejected. */
	async whoAmI(token: string): Promise<string | undefined> {
		const body = await (await this.post("/check", { data: { token } })).json();
		return body?.Item?.username;
	}

	// ─── Catalogue ───

	async rawEntries(): Promise<APIResponse> {
		return this.get("/entries");
	}

	/** The first page of the catalogue (9 products). */
	async entries(): Promise<Product[]> {
		return (await (await this.rawEntries()).json()).Items;
	}

	async byCategory(cat: "phone" | "notebook" | "monitor"): Promise<Product[]> {
		return (await (await this.post("/bycat", { data: { cat } })).json()).Items;
	}

	async rawView(id: number | string): Promise<APIResponse> {
		return this.post("/view", { data: { id: String(id) } });
	}

	async view(id: number | string): Promise<Product> {
		return (await this.rawView(id)).json();
	}

	// ─── Cart (logged-in user; `cookie` is the auth token, `flag: true`) ───

	async addToCart(token: string, productId: number): Promise<APIResponse> {
		return this.post("/addtocart", {
			data: {
				id: randomUUID(),
				cookie: token,
				prod_id: productId,
				flag: true,
			},
		});
	}

	async viewCart(token: string): Promise<CartLine[]> {
		const body = await (
			await this.post("/viewcart", { data: { cookie: token, flag: true } })
		).json();
		return body?.Items ?? [];
	}

	async deleteItem(lineId: string): Promise<APIResponse> {
		return this.post("/deleteitem", { data: { id: lineId } });
	}

	/**
	 * Empties a user's cart line by line. Non-fatal on purpose: it runs as
	 * test SETUP, and a reset that fails should not fail a test that has not
	 * started — the test's own cart assertions are the real signal.
	 */
	async clearCart(token: string): Promise<void> {
		try {
			const lines = await this.viewCart(token);
			for (const line of lines) {
				await this.deleteItem(line.id);
			}
			if (lines.length > 0) {
				logger.info(`clearCart: removed ${lines.length} line(s)`);
			}
		} catch (err) {
			logger.warn(`clearCart failed (continuing): ${err}`);
		}
	}
}
