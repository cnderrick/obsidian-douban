jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
}), {virtual: true});

// 列表解析只吃 HTML, 不需要真的发请求
jest.mock("../src/org/wanxp/utils/DoubanHttpUtil", () => ({
	DoubanHttpUtil: {httpRequestGet: jest.fn(), httpRequestGetRaw: jest.fn()},
}));

import {load} from "cheerio";
import DoubanCelebrityListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanCelebrityListHandler";
import {CELEBRITY_PAGE_SIZE} from "../src/org/wanxp/constant/Constsant";
import {ALL} from "../src/org/wanxp/constant/DoubanUserState";

const handler = new DoubanCelebrityListHandler();

/**
 * 一张影人卡片, 标记与真实列表页一致(卡片是 .grid-view > .item, 标题在 li.title > em)。
 */
const card = (id: string, title: string, withLink = true) => `
	<div class="item">
		<div class="pic">
			<a href="https://movie.douban.com/celebrity/${id}/" title="${title}">
				<img src="https://img9.doubanio.com/view/celebrity/m/public/p${id}.webp" alt="${title}" />
			</a>
		</div>
		<div class="info"><ul>
			<li class="title"><a href="https://movie.douban.com/celebrity/${id}/"><em>${withLink ? title : ''}</em></a></li>
			<li class="intro">演员<br /></li>
			<li class="intro"><a href="https://movie.douban.com/subject/35180906/">王牌部队</a>&nbsp;/&nbsp;<a href="https://movie.douban.com/subject/36318037/">唐朝诡事录之长安</a><br /></li>
			<li class="clearfix opt-ln"><div class="opt-l gact"><a class="d_link" href="javascript:;" rel="${id}">删除</a></div></li>
		</ul></div>
	</div>`;

/**
 * 列表页骨架。总数写在 <title> 里, 页面没有 .subject-num。
 */
const listHtml = (options: {cards?: string[], title?: string, totalPage?: number} = {}) => {
	const cards = options.cards || [
		card("1325168", "毛林林 Linlin Mao"),
		card("1028795", "堺雅人 Masato Sakai"),
	];
	const title = options.title === undefined ? "我收藏的影人(169)" : options.title;
	const totalPage = options.totalPage === undefined ? 12 : options.totalPage;
	return `
		<html><head><title>${title}</title></head><body>
			<div class="grid-view">${cards.join('')}</div>
			<div class="paginator">
				<span class="thispage" data-total-page="${totalPage}">1</span>
				<a href="?start=15">2</a>
			</div>
		</body></html>`;
};

describe("DoubanCelebrityListHandler", () => {
	const parse = (html: string, syncOffset = 0) =>
		handler.parseSubjectFromHtml(load(html), {syncOffset} as any);

	const fifteenCards = () => Array.from({length: CELEBRITY_PAGE_SIZE}, (_v, index) =>
		card(String(1000000 + index), `影人${index}`));

	it("reads every card on the page", () => {
		const page = parse(listHtml({cards: fifteenCards()}));
		expect(page.list).toHaveLength(CELEBRITY_PAGE_SIZE);
		expect(page.list[0]).toMatchObject({
			id: "1000000",
			title: "影人0",
			url: "https://movie.douban.com/celebrity/1000000/",
		});
		expect(page.list[14].id).toBe("1000014");
	});

	it("reports 15 items per page, not the 30 used by the other lists", () => {
		expect(handler.getPageSize()).toBe(CELEBRITY_PAGE_SIZE);
		expect(parse(listHtml()).pageSize).toBe(CELEBRITY_PAGE_SIZE);
	});

	it("derives the page number from the offset with the celebrity page size", () => {
		expect(parse(listHtml(), 0).pageNum).toBe(1);
		expect(parse(listHtml(), CELEBRITY_PAGE_SIZE).pageNum).toBe(2);
		expect(parse(listHtml(), CELEBRITY_PAGE_SIZE * 11).pageNum).toBe(12);
	});

	it("reads the total from the page title", () => {
		expect(parse(listHtml()).total).toBe(169);
	});

	it("falls back to the pager's page count when the title has no count", () => {
		// 12 页 × 15 条, 只会略大于真实条数, 不会让翻页提前结束
		expect(parse(listHtml({title: "我收藏的影人", totalPage: 12})).total).toBe(180);
		expect(parse(listHtml({title: "我收藏的影人", totalPage: 0})).total).toBe(0);
	});

	it("drops cards without a celebrity id", () => {
		const page = parse(listHtml({cards: [card("1325168", "毛林林 Linlin Mao"), '<div class="item"><div class="pic"><a href="javascript:;">广告</a></div></div>']}));
		expect(page.list.map(item => item.id)).toEqual(["1325168"]);
	});

	it("falls back to the link title when the card has no em", () => {
		expect(parse(listHtml({cards: [card("1028795", "堺雅人 Masato Sakai", false)]})).list[0].title)
			.toBe("堺雅人 Masato Sakai");
	});

	it("leaves the collection date empty because the list does not show one", () => {
		expect(parse(listHtml()).list.every(item => item.updateDate == null)).toBe(true);
	});

	it("covers the only scope a celebrity collection has", () => {
		expect(handler.getDoType()).toBe(ALL);
		expect(handler.support({scope: ALL} as any)).toBe(true);
	});
});
