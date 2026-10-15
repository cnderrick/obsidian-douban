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
import {SyncType} from "../src/org/wanxp/constant/Constsant";
import {DoubanHttpUtil} from "../src/org/wanxp/utils/DoubanHttpUtil";

const PAGE_SIZE = 30;
/** 各状态的条目总数, 0 表示该状态为空(与真实页面一致: .subject-num 显示 1-0 / 0) */
const STATE_TOTALS: Record<string, number> = {collect: 95, wish: 5, do: 0};

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

class TestSyncHandler extends DoubanAbstractSyncHandler<DoubanSubject> {
	constructor(listHandlers: DoubanListHandler[], handled: string[]) {
		super({} as any, {
			handle: async (id: string) => {
				handled.push(id);
				return {} as any;
			},
		} as any, listHandlers);
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
	const syncStatus = {
		setAllTotal: jest.fn(),
		totalNum: jest.fn(),
		getTotal: jest.fn(() => 0),
		getHasHandle: jest.fn(() => 0),
		setNeedHandled: jest.fn(),
		shouldSync: () => true,
		unHandle: jest.fn(),
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
	return {context, syncStatus};
};

describe("sync scope", () => {
	beforeEach(() => {
		requestedUrls.length = 0;
		(DoubanHttpUtil.httpRequestGet as jest.Mock).mockImplementation(async (url: string) => {
			requestedUrls.push(url);
			const matched = url.match(/[?&]start=(\d+)/);
			const start = matched ? Number(matched[1]) : 0;
			return listPageHtml(start, STATE_TOTALS[stateOf(url)] ?? 0);
		});
	});

	it("prepares every state and reports their totals as one sum", async () => {
		const {context, syncStatus} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), []);
		await (handler as any).prepareSyncStates({scope: "ALL", syncType: "movie"} as any, context);

		expect((handler as any).syncStates.map((state: any) => state.total)).toEqual([95, 5, 0]);
		expect(syncStatus.setAllTotal).toHaveBeenCalledWith(100);
		expect(new Set(requestedUrls.map(stateOf))).toEqual(new Set(["collect", "wish", "do"]));
	});

	it("prepares a single state when a concrete scope is selected", async () => {
		const {context} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), []);
		await (handler as any).prepareSyncStates({scope: "collect", syncType: "movie"} as any, context);

		expect((handler as any).syncStates.map((state: any) => state.total)).toEqual([95]);
	});

	it("walks every state during a run and uses the summed denominator", async () => {
		const handled: string[] = [];
		const {context, syncStatus} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), handled);

		await handler.sync({
			scope: "ALL",
			syncType: "movie",
			syncConditionType: "lastThirty",
			dataFilePath: "",
		} as any, context);

		expect(new Set(requestedUrls.map(stateOf))).toEqual(new Set(["collect", "wish", "do"]));
		// 分母 = 各状态首页条目数之和(收藏 30 + 想看 5 + 在看 0)
		expect(syncStatus.totalNum).toHaveBeenCalledWith(35);
		expect(handled.length).toBe(35);
	});

	it("counts the run total as the sum of the state totals", async () => {
		const {context} = makeContext();
		const handler = new TestSyncHandler(movieListHandlers(), []);
		await (handler as any).prepareSyncStates({scope: "ALL", syncType: "movie"} as any, context);
		expect((handler as any).computeRunTotal({syncConditionType: "all"} as any)).toBe(100);
	});
});
