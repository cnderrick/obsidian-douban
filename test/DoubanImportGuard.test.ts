jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Notice: jest.fn(),
	Platform: {isDesktopApp: true},
	normalizePath: (path: string) => path.replace(/\/+/g, '/'),
}), {virtual: true});

import {load} from "cheerio";
import DoubanMovieLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanMovieLoadHandler";
import {DoubanTeleplayLoadHandler} from "../src/org/wanxp/douban/data/handler/DoubanTeleplayLoadHandler";
import {DoubanHttpUtil} from "../src/org/wanxp/utils/DoubanHttpUtil";
import HttpUtil from "../src/org/wanxp/utils/HttpUtil";
import DoubanPageGuard, {DoubanPageProblem} from "../src/org/wanxp/utils/DoubanPageGuard";
import DoubanNotFoundError from "../src/org/wanxp/utils/DoubanNotFoundError";
import {SubjectListItem} from "../src/org/wanxp/douban/data/model/SubjectListItem";

const loginRedirectHtml = `
	<html>
		<head><title>豆瓣 - 登录跳转页</title></head>
		<body>
			<h1>登录跳转</h1>
			<p>有异常请求从你的 IP 发出，请
				<a href="https://accounts.douban.com/passport/login?redir=https%3A%2F%2Fmovie.douban.com%2Fsubject%2F35183324%2F">登录</a>
			</p>
		</body>
	</html>
`;

describe("Douban import response guards", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("recognizes the HTTP 200 login redirect page returned for subject requests", () => {
		expect(DoubanPageGuard.detect(loginRedirectHtml)).toBe(DoubanPageProblem.loginRequired);
		expect(DoubanPageGuard.detect("<html><title>禁止访问</title></html>"))
			.toBe(DoubanPageProblem.accessDenied);
		expect(DoubanPageGuard.detect("<html><title>普通条目</title></html>")).toBeNull();
	});

	it("turns a login redirect into an actionable request error", async () => {
		await expect(DoubanHttpUtil.humanCheck(
			loginRedirectHtml,
			"https://movie.douban.com/subject/35183324/",
			{debug: jest.fn()} as any,
		)).rejects.toThrow("豆瓣返回了登录跳转页");
	});

	const removedSubjectHtml = `<html><head><title>页面不存在</title></head>
		<body><h1>呃...你想访问的页面不存在</h1></body></html>`;

	it("recognizes the page Douban returns for a removed subject", async () => {
		expect(DoubanPageGuard.detect(removedSubjectHtml)).toBe(DoubanPageProblem.notFound);
		await expect(DoubanHttpUtil.humanCheck(
			removedSubjectHtml,
			"https://movie.douban.com/subject/36449225/",
			{debug: jest.fn()} as any,
		)).rejects.toThrow("豆瓣已删除该条目");
	});

	it("turns an HTTP 404 into a not-found error instead of a generic failure", async () => {
		jest.spyOn(HttpUtil, "getText").mockResolvedValue({status: 404, textString: ""} as any);
		await expect(DoubanHttpUtil.httpRequestGet(
			"https://movie.douban.com/subject/36449225/",
			{},
			{debug: jest.fn()} as any,
		)).rejects.toBeInstanceOf(DoubanNotFoundError);
	});

	it("does not manufacture empty movie or teleplay subjects from an invalid page", () => {
		const page = load("<html><head><title>temporary error</title></head></html>");
		const plugin = {} as any;
		const context = {} as any;

		expect(new DoubanMovieLoadHandler(plugin).parseSubjectFromHtml(page, context)).toBeUndefined();
		expect(new DoubanTeleplayLoadHandler(plugin).parseSubjectFromHtml(page, context)).toBeUndefined();
	});

	it("keeps the metadata fallback for a valid subject page", () => {
		const page = load(`<html><head>
			<meta property="og:title" content="花漾少女杀人事件">
			<meta property="og:url" content="https://movie.douban.com/subject/35183324/">
			<meta property="og:description" content="电影简介">
		</head></html>`);

		expect(new DoubanMovieLoadHandler({} as any).parseSubjectFromHtml(page, {} as any))
			.toMatchObject({id: "35183324", title: "花漾少女杀人事件"});
	});

	it("stops the import before Obsidian receives an empty subject", async () => {
		jest.spyOn(console, "log").mockImplementation(() => undefined);
		jest.spyOn(console, "error").mockImplementation(() => undefined);
		jest.spyOn(DoubanHttpUtil, "httpRequestGet")
			.mockResolvedValue("<html><head><title>temporary error</title></head></html>");
		const plugin = {
			putToObsidian: jest.fn(),
			settingsManager: {
				isDebug: () => false,
				debug: jest.fn(),
				getHeaders: () => ({}),
				getSelector: (): string[] => [],
			},
		} as any;
		const context = {
			plugin,
			settings: {},
			syncActive: false,
			userComponent: {isLogin: () => false},
		} as any;

		const result = await new DoubanMovieLoadHandler(plugin).handle("35183324", context);

		expect(result).toBeUndefined();
		expect(plugin.putToObsidian).not.toHaveBeenCalled();
	});

	describe("list fallback for a subject Douban has removed", () => {
		const buildPlugin = () => ({
			putToObsidian: jest.fn(),
			fileHandler: {createNewNoteWithData: jest.fn().mockResolvedValue(true)},
			settingsManager: {
				isDebug: () => false,
				debug: jest.fn(),
				getHeaders: () => ({}),
				getSelector: (): string[] => [],
			},
		} as any);

		const buildContext = (plugin: any) => {
			const skipMissing = jest.fn();
			return {
				plugin,
				settings: {},
				syncActive: true,
				syncStatusHolder: {syncStatus: {skipMissing, fail: jest.fn()}},
				userComponent: {isLogin: () => false},
			} as any;
		};

		const listItem: SubjectListItem = {
			id: "36449225",
			url: "https://movie.douban.com/subject/36449225/",
			title: "蒙古",
			updateDate: null,
		};

		it("creates the note from the list entry without requesting the dead detail page", async () => {
			jest.spyOn(console, "log").mockImplementation(() => undefined);
			const request = jest.spyOn(DoubanHttpUtil, "httpRequestGet");
			jest.spyOn(DoubanMovieLoadHandler.prototype, "parse")
				.mockResolvedValue({content: "NOTE", filePath: "/movie", fileName: "蒙古 36449225"} as any);

			const plugin = buildPlugin();
			const context = buildContext(plugin);
			const handler = new DoubanMovieLoadHandler(plugin);

			const result = await handler.handle("36449225", context, {...listItem, invalid: true});

			expect(result).toBeDefined();
			expect(request).not.toHaveBeenCalled();
			expect(plugin.fileHandler.createNewNoteWithData)
				.toHaveBeenCalledWith("/movie/蒙古 36449225", "NOTE", false, false);
			expect(context.syncStatusHolder.syncStatus.skipMissing).toHaveBeenCalledWith("36449225", "蒙古");
		});

		it("falls back to the list entry when the detail page turns out to be 404", async () => {
			jest.spyOn(console, "log").mockImplementation(() => undefined);
			jest.spyOn(DoubanMovieLoadHandler.prototype, "parse")
				.mockResolvedValue({content: "NOTE", filePath: "/movie", fileName: "蒙古 36449225"} as any);
			jest.spyOn(DoubanHttpUtil, "httpRequestGet")
				.mockRejectedValue(new DoubanNotFoundError("豆瓣已删除该条目（页面不存在）"));

			const plugin = buildPlugin();
			const context = buildContext(plugin);
			const result = await new DoubanMovieLoadHandler(plugin).handle("36449225", context, listItem);

			expect(result).toBeDefined();
			expect(context.syncStatusHolder.syncStatus.skipMissing).toHaveBeenCalledWith("36449225", "蒙古");
			expect(context.syncStatusHolder.syncStatus.fail).not.toHaveBeenCalled();
		});
	});
});
