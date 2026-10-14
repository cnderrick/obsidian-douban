jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

import {load} from "cheerio";
import DoubanGameLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanGameLoadHandler";
import {SupportType} from "../src/org/wanxp/constant/Constsant";

describe("DoubanGameLoadHandler", () => {
	const handler = new DoubanGameLoadHandler({} as any);

	/**
	 * 游戏详情页的最小可用骨架, 只保留标题解析与其依赖的 id 来源。
	 */
	const gameHtml = (heading: string, id = "10769607") => `
		<html><head>
			<meta name="mobile-agent" content="url=https://www.douban.com/game/${id}/">
		</head><body>
			<div id="content">${heading}</div>
		</body></html>`;

	const parse = (heading: string, context: any = {}) => handler.parseSubjectFromHtml(load(gameHtml(heading)), context);

	it("keeps the complete Chinese-English game name in the title", () => {
		const game = parse("<h1>巫师3：狂猎 The Witcher 3: Wild Hunt</h1>");
		expect(game.type).toBe(SupportType.game);
		expect(game.id).toBe("10769607");
		expect(game.url).toBe("https://www.douban.com/game/10769607/");
		expect(game.title).toBe("巫师3：狂猎 The Witcher 3: Wild Hunt");
	});

	it("collapses line breaks and indentation inside a page heading", () => {
		expect(parse("<h1>\n\t\t巫师3：狂猎\n\t\tThe Witcher 3\n\t</h1>").title)
			.toBe("巫师3：狂猎 The Witcher 3");
	});

	it("leaves a Chinese-only game name untouched", () => {
		expect(parse("<h1>原神</h1>").title).toBe("原神");
	});

	it("does not reduce a mixed game name to its Chinese half", () => {
		expect(parse("<h1>塞尔达传说：旷野之息 The Legend of Zelda: Breath of the Wild</h1>").title)
			.toBe("塞尔达传说：旷野之息 The Legend of Zelda: Breath of the Wild");
	});

	it("falls back to the searched list title when the heading is missing", () => {
		expect(parse("", {listItem: {title: "塞尔达传说"}}).title).toBe("塞尔达传说");
	});
});
