jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	moment: (value: any) => ({format: () => String(value)}),
	Platform: {isDesktopApp: true},
	normalizePath: (path: string) => path,
	request: jest.fn(),
}), {virtual: true});

import {load} from "cheerio";
import DoubanMovieCollectListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanMovieCollectListHandler";
import DoubanCelebrityListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanCelebrityListHandler";
import DoubanGameCollectListHandler from "../src/org/wanxp/douban/sync/handler/list/DoubanGameCollectListHandler";

/**
 * 收藏列表里, 被豆瓣删掉的条目会被降级成 `.item-show.deleted`:
 * 没有封面、没有信息行、没有收藏日期, 只剩标题和一个「删除」链接。
 */
const listHtml = `
<html><body>
	<div class="subject-num">1-30 / 5918</div>
	<div class="item-show">
		<div class="title"><a href="https://movie.douban.com/subject/1292052/">肖申克的救赎 / The Shawshank Redemption</a></div>
		<div class="date">2026-10-07</div>
	</div>
	<div class="item-show deleted" style="cursor: default;">
		<div class="clearfix opt-ln" style="float: right; margin: 0;">
			<a class="d_link" rel="36449225:P" href="javascript:;">删除</a>
		</div>
		<div class="title"><a href="https://movie.douban.com/subject/36449225/">蒙古</a></div>
	</div>
</body></html>
`;

describe("收藏列表里的失效条目", () => {
	const handler = new DoubanMovieCollectListHandler();
	const page = handler.parseSubjectFromHtml(load(listHtml), {syncOffset: 0} as any);

	it("keeps the title of a removed subject", () => {
		expect(page.list).toHaveLength(2);
		expect(page.list[1]).toMatchObject({
			id: "36449225",
			title: "蒙古",
			url: "https://movie.douban.com/subject/36449225/",
		});
	});

	it("marks the removed subject so the sync can skip its dead detail page", () => {
		expect(page.list[0].invalid).toBe(false);
		expect(page.list[1].invalid).toBe(true);
	});

	it("still reads the collection total from the page", () => {
		expect(page.total).toBe(5918);
	});
});

describe("影人/游戏列表里的失效条目", () => {
	it("marks a removed celebrity whose cover is gone but whose title link is left", () => {
		const html = `
		<html><head><title>我收藏的影人(2)</title></head><body>
			<div class="grid-view">
				<div class="item">
					<div class="pic"><a href="https://movie.douban.com/celebrity/1325168/" title="毛林林 Linlin Mao"><img src="a.jpg"></a></div>
					<div class="info"><ul>
						<li class="title"><a href="https://movie.douban.com/celebrity/1325168/"><em>毛林林 Linlin Mao</em></a></li>
						<li class="intro">演员</li>
					</ul></div>
				</div>
				<div class="item deleted">
					<div class="info"><ul>
						<li class="title"><a href="https://movie.douban.com/celebrity/1028795/"><em>堺雅人 Masato Sakai</em></a></li>
					</ul></div>
				</div>
			</div>
		</body></html>`;
		const items = new DoubanCelebrityListHandler()
			.parseSubjectFromHtml(load(html), {syncOffset: 0} as any).list;

		expect(items).toHaveLength(2);
		expect(items[0].invalid).toBe(false);
		expect(items[1]).toMatchObject({
			id: "1028795",
			title: "堺雅人 Masato Sakai",
			invalid: true,
		});
	});

	it("marks a removed game in the game list", () => {
		const html = `
		<html><body>
			<div class="tabs"><a>想玩(1)</a><a>玩过(1)</a></div>
			<div class="common-item">
				<div class="title"><a href="https://www.douban.com/game/26933689/">正常游戏</a></div>
				<span class="date">2026-10-07</span>
			</div>
			<div class="common-item deleted">
				<div class="title"><a href="https://www.douban.com/game/26933690/">下架的游戏</a></div>
			</div>
		</body></html>`;
		const context = {syncOffset: 0, syncConfig: {scope: "collect"}} as any;
		const items = new DoubanGameCollectListHandler()
			.parseSubjectFromHtml(load(html), context).list;

		expect(items).toHaveLength(2);
		expect(items[0].invalid).toBe(false);
		expect(items[1]).toMatchObject({
			id: "26933690",
			title: "下架的游戏",
			invalid: true,
		});
	});
});
