jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

import SyncStatusHolder from "../src/org/wanxp/douban/sync/model/SyncStatusHolder";

const syncConfig = () => ({syncType: "movie", scope: "collect", dataFilePath: ""}) as any;

describe("SyncStatusHolder progress counters", () => {
	it("caps the processed count at the denominator", () => {
		const holder = new SyncStatusHolder(syncConfig());
		holder.totalNum(5);
		for (let index = 0; index < 8; index++) {
			holder.handled(1);
		}
		expect(holder.getHasHandle()).toBe(8);
		expect(holder.getProgressHandled()).toBe(5);
	});

	it("never reports a negative remaining count", () => {
		const holder = new SyncStatusHolder(syncConfig());
		holder.totalNum(5);
		holder.handled(8);
		expect(holder.getNotHandled()).toBe(0);
	});

	it("reports the remaining count while work is left", () => {
		const holder = new SyncStatusHolder(syncConfig());
		holder.totalNum(10);
		holder.handled(3);
		expect(holder.getProgressHandled()).toBe(3);
		expect(holder.getNotHandled()).toBe(7);
	});
});

describe("SyncStatusHolder handled data", () => {
	const incremental = (over: any = {}) =>
		({syncType: "movie", scope: "ALL", dataFilePath: "", incrementalUpdate: true, ...over}) as any;

	it("keeps the records of other types when a sync starts", () => {
		const holder = new SyncStatusHolder(incremental());
		holder.initSyncHandledData([
			{key: "+movie+ALL", value: ["1", "2"]},
			{key: "+book+ALL", value: ["9"]},
		]);

		expect(holder.shouldSync("1")).toBe(false);
		expect(Array.from(holder.handledData.get("+movie+ALL"))).toEqual(["1", "2"]);
		// 默认 dataFilePath 为空串, 所有类型共用同一段; 同步电影不应把书籍的记录抹掉
		expect(Array.from(holder.handledData.get("+book+ALL"))).toEqual(["9"]);
	});

	it("clears only the current key when incremental sync is off", () => {
		const holder = new SyncStatusHolder(incremental({incrementalUpdate: false}));
		holder.initSyncHandledData([
			{key: "+movie+ALL", value: ["1"]},
			{key: "+book+ALL", value: ["9"]},
		]);

		// 关增量只影响本轮的类型
		expect(holder.shouldSync("1")).toBe(true);
		expect(Array.from(holder.handledData.get("+book+ALL"))).toEqual(["9"]);
	});
});
