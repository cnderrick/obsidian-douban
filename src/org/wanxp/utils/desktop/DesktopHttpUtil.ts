import type SettingsManager from "../../douban/setting/SettingsManager";
import {HttpResponse} from "../model/HttpResponse";

let https: any = null;
let http: any = null;
let keepAliveHttpsAgent: any = null;
let keepAliveHttpAgent: any = null;

export interface DesktopRequestOptions {
	method?: string;
	body?: string | Buffer;
	timeoutMs?: number;
	retryCount?: number;
	[key: string]: any;
}

export default class DesktopHttpUtil {
	private static readonly DEFAULT_TIMEOUT_MS = 30_000;
	private static readonly DEFAULT_RETRY_COUNT = 2;
	private static readonly MAX_KEEP_ALIVE_SOCKETS = 4;

	public static async request(
		url: string,
		headers: any,
		settingsManager?: SettingsManager,
		options: DesktopRequestOptions = {},
	): Promise<HttpResponse> {
		return this.requestWithRetry(url, headers, settingsManager, options, false);
	}

	public static async requestBuffer(
		url: string,
		headers: any,
		settingsManager?: SettingsManager,
		options: DesktopRequestOptions = {},
	): Promise<HttpResponse> {
		return this.requestWithRetry(url, headers, settingsManager, options, true);
	}

	private static async requestWithRetry(
		url: string,
		headers: any,
		settingsManager: SettingsManager,
		options: DesktopRequestOptions,
		asBuffer: boolean,
	): Promise<HttpResponse> {
		const headersInner: Record<string, string> = {};
		Object.entries(headers || {}).forEach(([key, value]) => {
			const lowerKey = key.toLowerCase();
			if (value != null && value !== '' && lowerKey !== 'accept-encoding' && lowerKey !== 'host' && lowerKey !== 'content-length') {
				headersInner[key] = String(value);
			}
		});

		const {
			timeoutMs = this.DEFAULT_TIMEOUT_MS,
			retryCount,
			...nativeOptions
		} = options || {};
		const method = String(nativeOptions.method || 'GET').toUpperCase();
		const retries = retryCount == null
			? (method === 'GET' || method === 'HEAD' ? this.DEFAULT_RETRY_COUNT : 0)
			: Math.max(0, retryCount);
		const requestOptions = {headers: headersInner, ...nativeOptions};

		let lastError: Error;
		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				return await this.requestOnce(url, requestOptions, timeoutMs, settingsManager, attempt, asBuffer);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				settingsManager?.debug(`Obsidian-Douban:请求失败 ${attempt + 1}/${retries + 1}: ${lastError.message}`);
			}
		}
		throw lastError;
	}

	private static requestOnce(
		url: string,
		options: DesktopRequestOptions,
		timeoutMs: number,
		settingsManager: SettingsManager,
		attempt: number,
		asBuffer: boolean,
	): Promise<HttpResponse> {
		if (settingsManager && settingsManager.isDebug()) {
			settingsManager.debug(`Obsidian-Douban:从网络获取开始:\nurl:${url}\nheaders:${JSON.stringify(options)}`);
		}

		return new Promise((resolve, reject) => {
			const {body, ...requestOptions} = options;
			requestOptions.method = requestOptions.method || 'GET';
			requestOptions.headers = {...(requestOptions.headers || {})};
			if (!requestOptions.agent) {
				requestOptions.agent = this.getKeepAliveAgent(url);
			}
			let redirectCookie = requestOptions.headers.Cookie || requestOptions.headers.cookie || '';
			requestOptions.beforeRedirect = (redirectOptions: any, response: any) => {
				const setCookie = response.headers && response.headers['set-cookie'];
				if (setCookie) {
					redirectCookie = this.mergeCookies(redirectCookie, Array.isArray(setCookie) ? setCookie : [setCookie]);
				}
				if (redirectCookie) {
					redirectOptions.headers.Cookie = redirectCookie;
					delete redirectOptions.headers.cookie;
				}
			};

			if (body && !requestOptions.headers['Content-Length'] && !requestOptions.headers['content-length']) {
				requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
			}

			let settled = false;
			const finishReject = (error: Error) => {
				if (!settled) {
					settled = true;
					reject(error);
				}
			};

			try {
				const request = this.getHttpClient(url).request(url, requestOptions, (response: any) => {
					const chunks: Buffer[] = [];
					let size = 0;
					settingsManager?.debug(`Obsidian-Douban:从网络获取响应${attempt}:url:\n${url}`);
					response.on('data', (chunk: Buffer) => {
						chunks.push(Buffer.from(chunk));
						size += chunk.length;
					});
					response.on('aborted', () => finishReject(new Error(`Response aborted for ${url}`)));
					response.on('error', finishReject);
					response.on('end', () => {
						if (settled) {
							return;
						}
						settled = true;
						const data = Buffer.concat(chunks, size);
						resolve(new HttpResponse(response.statusCode, response.headers, asBuffer ? data : data.toString()));
					});
				});
				request.on('error', finishReject);
				request.setTimeout(Math.max(1, timeoutMs), () => {
					request.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
				});
				if (body) {
					request.write(body);
				}
				request.end();
			} catch (error) {
				finishReject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private static mergeCookies(existingCookie: string, setCookies: string[]): string {
		const cookies = new Map<string, string>();
		const addCookie = (cookie: string) => {
			const pair = cookie.split(';', 1)[0].trim();
			const separator = pair.indexOf('=');
			if (separator > 0) {
				cookies.set(pair.substring(0, separator).trim(), pair.substring(separator + 1).trim());
			}
		};
		existingCookie.split(';').forEach(addCookie);
		setCookies.forEach(addCookie);
		return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
	}

	private static getHttpClient(url?: string) {
		if (url && url.startsWith('https')) {
			if (!https) {
				https = require('follow-redirects').https;
			}
			return https;
		}
		if (!http) {
			http = require('follow-redirects').http;
		}
		return http;
	}

	/**
	 * 复用 TCP/TLS 连接。
	 *
	 * follow-redirects 默认不复用连接, 每次请求都要重新握手; 一次全量同步动辄上千次
	 * 请求, 每次都多花一次往返, 累积起来就是几分钟。
	 */
	private static getKeepAliveAgent(url?: string) {
		if (url && url.startsWith('https')) {
			if (!keepAliveHttpsAgent) {
				const {Agent} = require('https');
				keepAliveHttpsAgent = new Agent({keepAlive: true, maxSockets: this.MAX_KEEP_ALIVE_SOCKETS});
			}
			return keepAliveHttpsAgent;
		}
		if (!keepAliveHttpAgent) {
			const {Agent} = require('http');
			keepAliveHttpAgent = new Agent({keepAlive: true, maxSockets: this.MAX_KEEP_ALIVE_SOCKETS});
		}
		return keepAliveHttpAgent;
	}
}
