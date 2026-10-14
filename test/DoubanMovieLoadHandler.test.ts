jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

import {load} from "cheerio";
import DoubanMovieLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanMovieLoadHandler";
import {SupportType} from "../src/org/wanxp/constant/Constsant";

describe("DoubanMovieLoadHandler", () => {
	const handler = new DoubanMovieLoadHandler({} as any);

	/**
	 * 详情页 JSON-LD 的最小可用骨架, 只保留标题解析相关的字段。
	 */
	const movieHtml = (name: string | undefined, id = "2129039") => `
		<html><head>
		<script type="application/ld+json">${JSON.stringify({
		"@type": "Movie",
		name,
		url: `/subject/${id}/`,
		description: "简介",
		image: "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg",
		genre: [],
		director: [],
		actor: [],
		author: [],
		datePublished: "2009-08-04",
	})}</script>
		</head><body></body></html>`;

	const parse = (name: string | undefined, context: any = {}) => handler.parseSubjectFromHtml(load(movieHtml(name)), context);

	it("keeps the complete Chinese-English name in the title", () => {
		const movie = parse("飞屋环游记 Up");
		expect(movie.type).toBe(SupportType.movie);
		expect(movie.title).toBe("飞屋环游记 Up");
		expect(movie.originalTitle).toBe("Up");
	});

	it("does not truncate an original title at punctuation", () => {
		expect(parse("Mission: Impossible – Fallout 碟中谍6：全面瓦解")).toMatchObject({
			title: "Mission: Impossible – Fallout 碟中谍6：全面瓦解",
			originalTitle: "Mission: Impossible – Fallout",
		});
		expect(parse("爱，死亡和机器人 Love, Death & Robots")).toMatchObject({
			title: "爱，死亡和机器人 Love, Death & Robots",
			originalTitle: "Love, Death & Robots",
		});
		expect(parse("航海王：红发歌姬 ONE PIECE FILM RED")).toMatchObject({
			title: "航海王：红发歌姬 ONE PIECE FILM RED",
			originalTitle: "ONE PIECE FILM RED",
		});
		expect(parse("WALL·E")).toMatchObject({
			title: "WALL·E",
			originalTitle: "WALL·E",
		});
	});

	it("never reduces a title to bare punctuation", () => {
		const movie = parse("Mission: Impossible – Fallout 碟中谍6：全面瓦解");
		expect(movie.title).toMatch(/[0-9A-Za-z]/);
		expect(movie.title).not.toBe(":");
	});

	it("leaves a single mixed word unsplit instead of dropping either half", () => {
		expect(parse("Hello！树先生")).toMatchObject({
			title: "Hello！树先生",
			originalTitle: "Hello！树先生",
		});
	});

	it("falls back to the searched list title when the page has no name", () => {
		expect(parse(undefined, {listItem: {title: "皮囊之下"}})).toMatchObject({
			title: "皮囊之下",
			originalTitle: "皮囊之下",
		});
	});
});
