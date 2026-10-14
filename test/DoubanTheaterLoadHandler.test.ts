jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

import {load} from "cheerio";
import {readFileSync} from "fs";
import {join} from "path";
import DoubanTheaterLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanTheaterLoadHandler";
import {SupportType} from "../src/org/wanxp/constant/Constsant";

describe("DoubanTheaterLoadHandler", () => {
	const handler = new DoubanTheaterLoadHandler({} as any);

	it("parses the registered theater handler without requiring every field", () => {
		const fixture = readFileSync(join(__dirname, "fixtures/theater.html"), "utf8");
		const subject = handler.parseSubjectFromHtml(load(fixture), {
			listItem: {url: "https://www.douban.com/location/drama/36564284/"},
		} as any);
		expect(subject).toMatchObject({
			id: "36564284",
			title: "#0528",
			type: SupportType.theater,
			score: 8.3,
			genre: ["音乐剧"],
			director: ["张轩豪", "杨心怡"],
			author: ["严栋瀚"],
			actor: ["演员甲", "演员乙"],
			publisher: "好好有戏",
			aliases: ["Room 0528", "零五二八"],
			desc: "第一段\n第二段",
		});
		expect(subject.language).toEqual([]);
	});

	it("keeps English title spaces and does not erase a mixed title", () => {
		expect(handler.getTitleAndOriginalTitle("Under the Skin 皮囊之下", {
			listItem: {title: "皮囊之下"},
		} as any)).toEqual({
			title: "Under the Skin 皮囊之下",
			originalTitle: "Under the Skin",
		});
		expect(handler.getTitleAndOriginalTitle("Hello！树先生", {
			listItem: {title: "Hello！树先生"},
		} as any)).toEqual({
			title: "Hello！树先生",
			originalTitle: "Hello！树先生",
		});
	});

	it("reads the id from legacy theater pages without canonical metadata", () => {
		const subject = handler.parseSubjectFromHtml(load(`
			<div class="drama-info"><h1 itemprop="name">旧版舞台剧</h1></div>
			<a data-object_id="11620591" data-url="https://www.douban.com/location/drama/11620591/"></a>
		`), {} as any);
		expect(subject.id).toBe("11620591");
		expect(subject.url).toBe("https://www.douban.com/location/drama/11620591/");
	});
});
