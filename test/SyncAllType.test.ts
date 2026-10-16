jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

import {buildAllSubConfig} from "../src/org/wanxp/douban/sync/model/SyncAllTypes";
import {SyncConditionType, SyncType} from "../src/org/wanxp/constant/Constsant";

const base = (over: any = {}) => ({
	syncType: SyncType.all,
	scope: "ALL",
	syncConditionType: SyncConditionType.ALL,
	force: false,
	dataFilePath: "",
	dataFileNamePath: "/{{type}}/{{title}}",
	cacheImage: false,
	cacheHighQuantityImage: false,
	attachmentPath: "assets",
	attachmentFileName: "{{title}}",
	templateFile: "",
	incrementalUpdate: true,
	...over,
}) as any;

const settings = {
	movieTemplateFile: "TPL/movie.md",
	celebrityTemplateFile: "TPL/celebrity.md",
	bookTemplateFile: "",
};

describe("buildAllSubConfig", () => {
	it("derives one config per type and keeps the settings the user chose", () => {
		const movie = buildAllSubConfig(base(), SyncType.movie, settings);

		expect(movie.syncType).toBe("movie");
		expect(movie.templateFile).toBe("TPL/movie.md");
		expect(movie.scope).toBe("ALL");
		// 路径等设置必须原样继承, 否则「全部」和单独同步会落到不同目录
		expect(movie.dataFilePath).toBe("");
		expect(movie.dataFileNamePath).toBe("/{{type}}/{{title}}");
		expect(movie.attachmentPath).toBe("assets");
		expect(movie.attachmentFileName).toBe("{{title}}");
		expect(movie.force).toBe(false);
		expect(movie.incrementalUpdate).toBe(true);
	});

	it("keeps the base config untouched", () => {
		const config = base();
		buildAllSubConfig(config, SyncType.book, settings);
		expect(config.syncType).toBe(SyncType.all);
		expect(config.templateFile).toBe("");
	});

	it("falls back to the built-in template when a type has none configured", () => {
		expect(buildAllSubConfig(base(), SyncType.book, settings).templateFile).toBe("");
		expect(buildAllSubConfig(base(), SyncType.music, {}).templateFile).toBe("");
	});

	it("skips a type whose list has no such state", () => {
		const forWish = base({scope: "wish"});

		expect(buildAllSubConfig(forWish, SyncType.movie, settings)).not.toBeNull();
		expect(buildAllSubConfig(forWish, SyncType.teleplay, settings)).not.toBeNull();
		expect(buildAllSubConfig(forWish, SyncType.book, settings)).not.toBeNull();
		// 影人的收藏只有一个列表, 没有想看
		expect(buildAllSubConfig(forWish, SyncType.celebrity, settings)).toBeNull();
	});

	it("skips the game when the scope is all, because its list has no all entry", () => {
		expect(buildAllSubConfig(base({scope: "ALL"}), SyncType.game, settings)).toBeNull();
		expect(buildAllSubConfig(base({scope: "collect"}), SyncType.game, settings)).not.toBeNull();
	});

	it("skips the type whose list has no collection date when syncing by date", () => {
		const byDate = base({syncConditionType: SyncConditionType.CUSTOM_TIME});

		expect(buildAllSubConfig(byDate, SyncType.movie, settings)).not.toBeNull();
		expect(buildAllSubConfig(byDate, SyncType.book, settings)).not.toBeNull();
		// 影人的列表页没有收藏时间
		expect(buildAllSubConfig(byDate, SyncType.celebrity, settings)).toBeNull();
	});

	it("does not skip anything on the plain all condition", () => {
		const forAll = base({scope: "ALL", syncConditionType: SyncConditionType.ALL});
		for (const type of [SyncType.movie, SyncType.teleplay, SyncType.book, SyncType.music, SyncType.celebrity]) {
			expect(buildAllSubConfig(forAll, type, settings)).not.toBeNull();
		}
	});
});
