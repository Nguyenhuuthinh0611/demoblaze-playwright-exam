import { APIRequestContext, APIResponse } from "@playwright/test";
import { config } from "dotenv";
import logger from "src/utils/logger";
config();

export interface IRequest {
	headers?: any;
	data?: any;
	queries?: any;
	params?: any;
	method?: "GET" | "POST" | "PUT" | "DELETE";
	form?: { [key: string]: string | number | boolean };
}

function queryUrl(url: string, queries?: any) {
	let query = "";
	let _url = url;
	if (url.endsWith("/")) {
		_url = url.slice(0, -1);
	}
	for (const key in queries) {
		query += `${key}=${queries[key]}&`;
	}
	if (query.length === 0) {
		return _url;
	}
	return `${_url}?${query}`.slice(0, -1);
}

function paramUrl(url: string, params?: any) {
	let _url = url;
	for (const key in params) {
		_url = _url.replace(`:${key}`, params[key]);
	}
	return _url;
}

export class BaseEntity {
	private request: APIRequestContext;
	protected headers: any;
	protected baseUrl = "";
	constructor(request: APIRequestContext, options?: IRequest) {
		this.request = request;
		this.headers = options?.headers || {};
	}
	processUrl(url: string, options?: IRequest): string {
		let _url = url;
		if (!url.startsWith("http") && this.baseUrl.startsWith("https")) {
			_url = this.baseUrl + url;
		}
		if (options?.queries) {
			_url = queryUrl(_url, options.queries);
		}
		if (options?.params) {
			_url = paramUrl(_url, options.params);
		}
		return _url;
	}
	async fetch(
		method: "GET" | "POST" | "PUT" | "DELETE",
		url: string,
		options?: IRequest,
	): Promise<APIResponse> {
		const _url = this.processUrl(url, options);
		logger.debug(`Sending ${method} ${_url}`);

		const _response = await this.request.fetch(_url, {
			data: options?.data,
			headers: this.headers,
			method: method,
			form: options?.form,
		});
		logger.debug(`Response: ${_response.status()} ${_response.statusText()}`);
		return _response;
	}
	async post(url: string, options?: IRequest): Promise<APIResponse> {
		return await this.fetch("POST", url, options);
	}
	async get(url: string, options?: IRequest): Promise<APIResponse> {
		return await this.fetch("GET", url, options);
	}
}
export default BaseEntity;
