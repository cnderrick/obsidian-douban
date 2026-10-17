jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

import {load} from "cheerio";
import DoubanPageParser from "../src/org/wanxp/utils/DoubanPageParser";
import DoubanBookLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanBookLoadHandler";
import DoubanMovieLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanMovieLoadHandler";
import {DoubanTeleplayLoadHandler} from "../src/org/wanxp/douban/data/handler/DoubanTeleplayLoadHandler";
import {SupportType} from "../src/org/wanxp/constant/Constsant";

/**
 * 真实的 book/27023063: 书名本身含一个字面反斜杠, 豆瓣把它原样(未转义)写进了
 * ld+json, 于是 `\U` 不是合法 JSON 转义, JSON.parse 抛 Bad escaped character。
 * 下面这些 fixture 直接抄自真实页面(含换行与缩进), 不要用 JSON.stringify 生成,
 * 否则反斜杠会被正确转义、重现不出这个 bug。
 */
const BROKEN_BOOK_NAME = "交互系统新概念设计(用户绩效和用户体验设计准则)/UI\\UE系列丛书";

const BROKEN_BOOK_LD_JSON = `
{
  "@context":"http://schema.org",
  "@type":"Book",
  "workExample": [],
  "name" : "交互系统新概念设计(用户绩效和用户体验设计准则)/UI\\UE系列丛书",
  "author": 
  [
    {
      "@type": "Person",
      "name": "阿维·法利赛 (Avi Parush)"
    }
  ]
,
  "url" : "https://book.douban.com/subject/27023063/",
  "isbn" : "9787111558736",
  "sameAs": "https://book.douban.com/subject/27023063/"
}
`;

/** 伪造一个片名里带反斜杠的影视条目, 与书名的失效方式完全相同。 */
const BROKEN_MEDIA_NAME = "反斜杠\\测试片名 Backslash";

const brokenMediaLdJson = (type: string, url: string) => `
{
  "@context": "http://schema.org",
  "@type": "${type}",
  "name" : "反斜杠\\测试片名 Backslash",
  "url" : "${url}",
  "description": "简介",
  "image": "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg",
  "director": [],
  "actor": [],
  "author": [],
  "genre": []
}
`;

const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`;

const ctx = {} as any;

describe("DoubanPageParser.parseJsonLd", () => {
	it("returns the parsed object for a well-formed block", () => {
		expect(DoubanPageParser.parseJsonLd('{"name":"普通书名"}')).toEqual({name: "普通书名"});
	});

	it("recovers a title whose backslash Douban forgot to escape", () => {
		const obj = DoubanPageParser.parseJsonLd(BROKEN_BOOK_LD_JSON);
		expect(obj).not.toBeNull();
		expect(obj.name).toBe(BROKEN_BOOK_NAME);
		expect(obj.isbn).toBe("9787111558736");
		expect(obj.author.map((a: any) => a.name)).toEqual(["阿维·法利赛 (Avi Parush)"]);
	});

	it("keeps legal escapes untouched", () => {
		const obj = DoubanPageParser.parseJsonLd('{"a":"斜杠\\\\结尾","b":"换行\\n制表\\t","c":"引号\\""}');
		expect(obj.a).toBe('斜杠\\结尾');
		expect(obj.b).toBe('换行\n制表\t');
		expect(obj.c).toBe('引号"');
	});

	it("does not treat \\u as legal unless it carries four hex digits", () => {
		expect(DoubanPageParser.parseJsonLd('{"a":"\\u4e2d\\u6587"}').a).toBe("中文");
		expect(DoubanPageParser.parseJsonLd('{"a":"通\\uZZZZ用"}').a).toBe("通\\uZZZZ用");
	});

	it("returns null instead of throwing when the block cannot be repaired", () => {
		expect(DoubanPageParser.parseJsonLd('{"name": 这不是合法 JSON }')).toBeNull();
		expect(DoubanPageParser.parseJsonLd('')).toBeNull();
		expect(DoubanPageParser.parseJsonLd(undefined)).toBeNull();
	});
});

describe("ld+json 解析失败时的兜底", () => {
	const bookHandler = new DoubanBookLoadHandler({} as any);
	const movieHandler = new DoubanMovieLoadHandler({} as any);
	const teleplayHandler = new DoubanTeleplayLoadHandler({} as any);

	it("keeps the complete book title when only the escape is broken", () => {
		const book = bookHandler.parseSubjectFromHtml(load(page(
			`<script type="application/ld+json">${BROKEN_BOOK_LD_JSON}</script>`,
		)), ctx);

		expect(book.title).toBe(BROKEN_BOOK_NAME);
		expect(book.id).toBe("27023063");
		expect(book.url).toBe("https://book.douban.com/subject/27023063/");
		expect(book.type).toBe(SupportType.book);
		expect(book.author).toEqual(["阿维·法利赛 (Avi Parush)"]);
	});

	it("falls back to the h1 title when the book block is beyond repair", () => {
		const book = bookHandler.parseSubjectFromHtml(load(page(
			`<meta property="og:url" content="https://book.douban.com/subject/27023063/">
			 <script type="application/ld+json">{ "name": 这不是合法 JSON }</script>`,
			`<h1><span property="v:itemreviewed">从 h1 取到的书名</span></h1>
			 <div id="info"><span class="pl">作者</span>: <a>某某</a></div>`,
		)), ctx);

		expect(book.title).toBe("从 h1 取到的书名");
		expect(book.id).toBe("27023063");
		expect(book.author).toEqual(["某某"]);
	});

	it("uses the requested id for the url when the page exposes no url", () => {
		const book = bookHandler.parseSubjectFromHtml(load(page(
			`<script type="application/ld+json">{ "name": 坏掉的 JSON }</script>`,
			`<h1>只有 h1 的书名</h1>`,
		)), ctx, "27023063");

		expect(book.title).toBe("只有 h1 的书名");
		expect(book.id).toBe("27023063");
		expect(book.url).toBe("https://book.douban.com/subject/27023063/");
	});

	it("recovers a movie title from a block whose backslash Douban forgot to escape", () => {
		const movie = movieHandler.parseSubjectFromHtml(load(page(
			`<meta property="og:url" content="https://movie.douban.com/subject/1292052/">
			 <script type="application/ld+json">${brokenMediaLdJson('Movie', '/subject/1292052/')}</script>`,
		)), ctx);

		expect(movie).toBeDefined();
		expect(movie.type).toBe(SupportType.movie);
		expect(movie.title).toBe(BROKEN_MEDIA_NAME);
		expect(movie.id).toBe("1292052");
	});

	it("recovers a teleplay title from a block whose backslash Douban forgot to escape", () => {
		const teleplay = teleplayHandler.parseSubjectFromHtml(load(page(
			`<meta property="og:url" content="https://movie.douban.com/subject/34925323/">
			 <script type="application/ld+json">${brokenMediaLdJson('TVSeries', '/subject/34925323/')}</script>`,
		)), ctx);

		expect(teleplay).toBeDefined();
		expect(teleplay.type).toBe(SupportType.teleplay);
		expect(teleplay.title).toBe(BROKEN_MEDIA_NAME);
		expect(teleplay.id).toBe("34925323");
	});

	it("never throws and falls back to og:title when a movie block cannot be repaired", () => {
		const movie = movieHandler.parseSubjectFromHtml(load(page(
			`<meta property="og:title" content="兜底片名 (豆瓣)">
			 <meta property="og:url" content="https://movie.douban.com/subject/1292052/">
			 <script type="application/ld+json">{ "name": 坏掉的 JSON }</script>`,
		)), ctx);

		expect(movie).toBeDefined();
		expect(movie.title).toBe("兜底片名 (豆瓣)");
		expect(movie.id).toBe("1292052");
	});

	it("never throws and falls back to og:title when a teleplay block cannot be repaired", () => {
		const teleplay = teleplayHandler.parseSubjectFromHtml(load(page(
			`<meta property="og:title" content="兜底剧名 第二季">
			 <meta property="og:url" content="https://movie.douban.com/subject/34925323/">
			 <script type="application/ld+json">{ "name": 坏掉的 JSON }</script>`,
		)), ctx);

		expect(teleplay).toBeDefined();
		expect(teleplay.type).toBe(SupportType.teleplay);
		expect(teleplay.title).toBe("兜底剧名 第二季");
		expect(teleplay.id).toBe("34925323");
	});

	it("still returns the parsed value when the movie block is fine", () => {
		const movie = movieHandler.parseSubjectFromHtml(load(page(
			`<script type="application/ld+json">${JSON.stringify({
				"@type": "Movie",
				name: "飞屋环游记 Up",
				url: "/subject/2129039/",
			})}</script>`,
		)), ctx);

		expect(movie.title).toBe("飞屋环游记 Up");
		expect(movie.id).toBe("2129039");
	});
});
