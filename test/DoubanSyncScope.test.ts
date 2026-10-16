jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

jest.mock("../src/org/wanxp/utils/DoubanHttpUtil", () => ({
	DoubanHttpUtil: {httpRequestGet: jest.fn()},
}));

jest.mock("../src/org/wanxp/utils/TimeUtil", () => ({
	__esModule: true,
	default: {},
	sleepRange: () => Promise.resolve(),
}));

import {DoubanAbstractSyncHandler} from "../src/org/wanxp/douban/sync/handler/DoubanAbstractSyncHandler";
import {DoubanListHandler} from "../src/org/wanxp/douban/sync/handler/list/DoubanListHandler";
import DoubanMovieCollectListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanMovieCollectListHandler";
import DoubanMovieWishListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanMovieWishListHandler";
import DoubanMovieDoListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanMovieDoListHandler";
import DoubanSubject from "../src/org/wanxp/douban/data/model/DoubanSubject";
import SyncStatusHolder from "../src/org/wanxp/douban/sync/model/SyncStatusHolder";
import {SyncType} from "../src/org/wanxp/constant/Constsant";
import {DoubanHttpUtil} from "../src/org/wanxp/utils/DoubanHttpUtil";

const PAGE_SIZE = 30;
/** 各状态的条目总数, 0 表示该状态为空(与真实页面一致: .subject-num 显示 1-0 / 0) */
let stateTotals: Record<string, number> = {collect: 95, wish: 5, do: 0};

const stateOf = (url: string): string => {
	const matched = url.match(/\/(collect|wish|do)[?&]/);
	return matched ? matched[1] : "";
};

const listPageHtml = (start: number, total: number) => {
	const from = total === 0 ? 1 : start + 1;
	const to = Math.min(start + PAGE_SIZE, total);
	const count = Math.max(0, to - from + 1);
	const items = Array.from({length: count}, (_value, offset) => {
		const index = start + offset;
		const id = String(2000000 + index);
		return `<li class="item"><div class="item-show">` +
			`<div class="title"><a href="https://movie.douban.com/subject/${id}/">条目${index}</a></div>` +
			`<div class="date">2026-10-15</div>` +
			`</div></li>`;
	}).join("");
	return `<html><body><span class="subject-num">${from}-${to}&nbsp;/&nbsp;${total}</span>` +
		`<ul class="list-view">${items}</ul></body></html>`;
};

const requestedUrls: string[] = [];

/** 记录被处理的条目, 以及同时处于处理中的最大条目数 */
const makeLoader = () => {
	const handled: string[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	return {
		handled,
		getMaxInFlight: () => maxInFlight,
		loader: {
			handle: async (id: string) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight--;
				handled.push(id);
				return {} as any;
			},
		},
	};
};

class TestSyncHandler extends DoubanAbstractSyncHandler<DoubanSubject> {
	constructor(listHandlers: DoubanListHandler[], loader: any) {
		super({} as any, loader, listHandlers);
	}

	getSyncType(): SyncType {
		return SyncType.movie;
	}
}

const movieListHandlers = (): DoubanListHandler[] => [
	new DoubanMovieCollectListHandler(),
	new DoubanMovieWishListHandler(),
	new DoubanMovieDoListHandler(),
];

const makeContext = () => {
	const syncStatus = new SyncStatusHolder({
		syncType: "movie",
		scope: "ALL",
		dataFilePath: "",
	} as any);
	syncStatus.initSyncHandledData([]);
	const recorded: {allTotals: number[], totalNums: number[]} = {allTotals: [], totalNums: []};
	const originalSetAllTotal = syncStatus.setAllTotal.bind(syncStatus);
	syncStatus.setAllTotal = (value: number): void => {
		recorded.allTotals.push(value);
		originalSetAllTotal(value);
	};
	const originalTotalNum = syncStatus.totalNum.bind(syncStatus);
	syncStatus.totalNum = (value: number): void => {
		recorded.totalNums.push(value);
		originalTotalNum(value);
	};
	const context = {
		plugin: {
			statusHolder: {syncing: () => true, syncStatus},
			settingsManager: {getHeaders: () => ({}), debug: (): void => undefined},
		},
		userComponent: {getUserId: () => "39098150"},
		settings: {},
		action: "Sync",
		syncStatusHolder: {syncStatus},
	} as any;
	return {context, syncStatus, recorded};
};

const runSync = (
	handler: TestSyncHandler,
	context: any,
	syncConfig: object,
): Promise<void> => handler.sync({
	syncType: "movie",
	dataFilePath: "",
	...syncConfig,
} as any, context);

describe("sync scope", () => {
	beforeEach(() => {
		requestedUrls.length = 0;
		stateTotals = {collect: 95, wish: 5, do: 0};
		(DoubanHttpUtil.httpRequestGet as jest.Mock).mockImplementation(async (url: string) => {
			requestedUrls.push(url);
			const matched = url.match(/[?&]start=(\d+)/);
			const start = matched ? Number(matched[1]) : 0;
			return listPageHtml(start, stateTotals[stateOf(url)] ?? 0);
		});
	});

	it("prepares every state and reports their totals as one sum", async () => {
		const {context, recorded} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), makeLoader().loader);
		await (handler as any).prepareSyncStates({scope: "ALL", syncType: "movie"} as any, context);

		expect((handler as any).syncStates.map((state: any) => state.total)).toEqual([95, 5, 0]);
		expect(recorded.allTotals).toEqual([100]);
		expect(new Set(requestedUrls.map(stateOf))).toEqual(new Set(["collect", "wish", "do"]));
	});

	it("prepares a single state when a concrete scope is selected", async () => {
		const {context} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), makeLoader().loader);
		await (handler as any).prepareSyncStates({scope: "collect", syncType: "movie"} as any, context);

		expect((handler as any).syncStates.map((state: any) => state.total)).toEqual([95]);
	});

	it("walks every state during a run and uses the summed denominator", async () => {
		const tracker = makeLoader();
		const {context, recorded} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), tracker.loader);

		await runSync(handler, context, {scope: "ALL", syncConditionType: "lastThirty"});

		expect(new Set(requestedUrls.map(stateOf))).toEqual(new Set(["collect", "wish", "do"]));
		// 分母 = 各状态首页条目数之和(收藏 30 + 想看 5 + 在看 0)
		expect(recorded.totalNums).toEqual([35, 35]);
		expect(tracker.handled.length).toBe(35);
	});

	it("counts the run total as the sum of the state totals", async () => {
		const {context} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), makeLoader().loader);
		await (handler as any).prepareSyncStates({scope: "ALL", syncType: "movie"} as any, context);
		expect((handler as any).computeRunTotal({syncConditionType: "all"} as any)).toBe(100);
	});

	it("keeps the wait constant regardless of the run size", async () => {
		const {syncStatus} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), makeLoader().loader);

		syncStatus.totalNum(95);
		expect((handler as any).delayRange()).toEqual({min: 1000, max: 2000});

		syncStatus.totalNum(500);
		expect((handler as any).delayRange()).toEqual({min: 1000, max: 2000});
	});

	it("processes one item at a time by default", async () => {
		stateTotals = {collect: 5, wish: 0, do: 0};
		const tracker = makeLoader();
		const {context} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), tracker.loader);

		await runSync(handler, context, {scope: "collect", syncConditionType: "lastThirty"});

		expect(tracker.handled.length).toBe(5);
		expect(tracker.getMaxInFlight()).toBe(1);
	});

	it("overlaps items up to the configured concurrency", async () => {
		stateTotals = {collect: 5, wish: 0, do: 0};
		const tracker = makeLoader();
		const {context} = makeContext();
		context.settings = {syncConcurrency: 3};
		const handler = new TestSyncHandler(movieListHandlers(), tracker.loader);

		await runSync(handler, context, {scope: "collect", syncConditionType: "lastThirty"});

		expect(tracker.handled.length).toBe(5);
		expect(tracker.getMaxInFlight()).toBe(3);
	});
});
