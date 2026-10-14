jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

jest.mock("../src/org/wanxp/utils/DoubanHttpUtil", () => ({
	DoubanHttpUtil: {httpRequestGet: jest.fn()},
}));

import {DoubanMovieSyncHandler} from "../src/org/wanxp/douban/sync/handler/DoubanMovieSyncHandler";
import DoubanMovieCollectListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanMovieCollectListHandler";
import {SubjectListItem} from "../src/org/wanxp/douban/data/model/SubjectListItem";
import {DoubanHttpUtil} from "../src/org/wanxp/utils/DoubanHttpUtil";

const PAGE_SIZE = 30;
const TOTAL = 95;
const BASE_DATE = new Date("2026-10-15T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** 第 index 个条目的更新日期: 从最新往回每天一条, 与豆瓣 sort=time 的倒序一致 */
const dateForIndex = (index: number) => new Date(BASE_DATE.getTime() - index * DAY);
const isoDate = (date: Date) => date.toISOString().substring(0, 10);

/** 造一页列表 HTML, 结构对齐真实页面: .subject-num 是「范围&nbsp;/&nbsp;总数」 */
const listPageHtml = (start: number, total: number) => {
	const from = start + 1;
	const to = Math.min(start + PAGE_SIZE, total);
	const count = Math.max(0, to - from + 1);
	const items = Array.from({length: count}, (_value, offset) => {
		const index = start + offset;
		const id = String(1000000 + index);
		return `<li class="item"><div class="item-show">` +
			`<div class="title"><a href="https://movie.douban.com/subject/${id}/">影片${index}</a></div>` +
			`<div class="date">${isoDate(dateForIndex(index))}</div>` +
			`</div></li>`;
	}).join("");
	return `<html><body><span class="subject-num">${from}-${to}&nbsp;/&nbsp;${total}</span>` +
		`<ul class="list-view">${items}</ul></body></html>`;
};

const requestedUrls: string[] = [];

const context = () => ({
	plugin: {
		statusHolder: {
			syncing: () => true,
			syncStatus: {setAllTotal: jest.fn(), setMessage: jest.fn()},
		},
		settingsManager: {getHeaders: () => ({}), debug: (): void => undefined},
	},
	userComponent: {getUserId: () => "39098150"},
	settings: {},
	action: "Sync",
}) as any;

const syncConfig = (from: string, to: string) => ({
	syncType: "movie",
	scope: "collect",
	syncConditionType: "customTime",
	syncConditionDateFromValue: new Date(from),
	syncConditionDateToValue: new Date(to),
	dataFilePath: "",
}) as any;

/** 调用私有的 getByTimeLimit, 返回收集到的条目 */
const fetchItems = (
	handler: DoubanMovieSyncHandler,
	from: string,
	to: string,
): Promise<SubjectListItem[]> => (handler as any).getByTimeLimit(syncConfig(from, to), context());

const startOffsets = (): (number | null)[] => requestedUrls.map(url => {
	const matched = url.match(/[?&]start=(\d+)/);
	return matched ? Number(matched[1]) : null;
});

describe("custom-time sync paging", () => {
	beforeEach(() => {
		requestedUrls.length = 0;
		(DoubanHttpUtil.httpRequestGet as jest.Mock).mockImplementation(async (url: string) => {
			requestedUrls.push(url);
			const matched = url.match(/[?&]start=(\d+)/);
			return listPageHtml(matched ? Number(matched[1]) : 0, TOTAL);
		});
	});

	it("always sends an explicit numeric start offset", async () => {
		const listHandler = new DoubanMovieCollectListHandler();
		await listHandler.getPageData(context());
		expect(requestedUrls[0]).toMatch(/[?&]start=0&/);
		expect(requestedUrls[0]).not.toContain("undefined");
	});

	it("requests every list page at most once instead of re-fetching the first page", async () => {
		const handler = new DoubanMovieSyncHandler({} as any);
		const items = await fetchItems(handler, "2026-01-01", "2026-12-31");

		expect(items.length).toBe(TOTAL);
		expect(new Set(items.map(item => item.id)).size).toBe(TOTAL);
		expect(startOffsets().filter(offset => offset == null)).toEqual([]);
		expect(new Set(startOffsets()).size).toBe(startOffsets().length);
	});

	it("collects exactly the items inside the requested date range", async () => {
		const handler = new DoubanMovieSyncHandler({} as any);
		const items = await fetchItems(handler, "2026-09-01", "2026-09-30");

		const expected = Array.from({length: TOTAL}, (_value, index) => index)
			.filter(index => {
				const date = dateForIndex(index);
				return date >= new Date("2026-09-01") && date <= new Date("2026-09-30");
			});

		expect(expected.length).toBeGreaterThan(0);
		expect(expected.length).toBeLessThan(TOTAL);
		expect(items.length).toBe(expected.length);
		expect(new Set(items.map(item => item.id)).size).toBe(items.length);
		items.forEach(item => {
			expect(item.updateDate >= new Date("2026-09-01")).toBe(true);
			expect(item.updateDate <= new Date("2026-09-30")).toBe(true);
		});
	});

	it("never reports more items than the list total", async () => {
		const handler = new DoubanMovieSyncHandler({} as any);
		const items = await fetchItems(handler, "2000-01-01", "2030-12-31");
		expect(items.length).toBeLessThanOrEqual(TOTAL);
	});

	it("returns nothing when the range is outside the list", async () => {
		const handler = new DoubanMovieSyncHandler({} as any);
		expect(await fetchItems(handler, "2027-01-01", "2027-12-31")).toEqual([]);

		requestedUrls.length = 0;
		expect(await fetchItems(handler, "2000-01-01", "2001-12-31")).toEqual([]);
	});
});
