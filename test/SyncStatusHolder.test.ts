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
