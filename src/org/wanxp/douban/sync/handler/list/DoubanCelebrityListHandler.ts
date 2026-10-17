import {CheerioAPI} from "cheerio";
import DoubanAbstractListHandler from "./DoubanAbstractListHandler";
import {CELEBRITY_PAGE_SIZE, SyncType} from "../../../../constant/Constsant";
import HandleContext from "../../../data/model/HandleContext";
import {SearchPageTypeOf} from "../../../data/model/SearchPageTypeOf";
import {SubjectListItem} from "../../../data/model/SubjectListItem";
import {SearchPage} from "../../../data/model/SearchPage";
import {doubanCelebritySyncListUrl} from "../../../../constant/Douban";
import {ALL} from "../../../../constant/DoubanUserState";

/**
 * 我收藏的影人列表。
 *
 * 这套标记和影视/书籍列表完全不同, 所以自己实现解析:
 * <li>卡片是 .grid-view > .item, 每页 15 条(不是 30)</li>
 * <li>没有 .subject-num, 总数写在 <title>我收藏的影人(169)</title> 里</li>
 * <li>页面上没有收藏时间, 所以条目的 updateDate 恒为 null(因此不支持「自定义时间」条件)</li>
 */
export default class DoubanCelebrityListHandler extends DoubanAbstractListHandler {

	getDoType(): string {
		//影人收藏只有一个列表, 没有想看/看过之分, scope 恒为「所有」
		return ALL;
	}

	getSyncType(): SyncType {
		return SyncType.celebrity;
	}

	getPageSize(): number {
		return CELEBRITY_PAGE_SIZE;
	}

	protected getUrl(context: HandleContext, start: number) {
		return doubanCelebritySyncListUrl(context.userComponent.getUserId(), start);
	}

	parseSubjectFromHtml(
		dataHtml: CheerioAPI,
		context: HandleContext,
	): SearchPageTypeOf<SubjectListItem> {
		const items = dataHtml(".grid-view .item")
			.get()
			.map((i: any): SubjectListItem | null => {
				const item = dataHtml(i);
				// 失效条目可能没有封面(div.pic), 标题链接还在就够用
				const linkValue: string = item.find("div.pic > a").attr("href")
					|| item.find("div.info li.title a").attr("href");
				const titleValue: string = item.find("div.info li.title em").text().trim()
					|| item.find("div.info li.title a").text().trim()
					|| item.find("div.pic > a").attr("title")
					|| "";
				const idPattern = /(\d){5,10}/g;
				const execResult = idPattern.exec(linkValue);
				const invalid: boolean = this.isInvalidCard(item);
				return !execResult
					? null
					// 列表页没有日期, 自定义时间条件对影人不可用
					: {id: execResult[0], url: linkValue, title: titleValue, updateDate: null, invalid: invalid};
			})
			// 取不到 id 的条目直接丢弃, 避免 null 条目在后续处理中被当成正常条目
			.filter((item): item is SubjectListItem => item != null);
		const pageSize = this.getPageSize();
		return new SearchPage(
			this.getTotal(dataHtml),
			Math.floor(context.syncOffset / pageSize) + 1,
			pageSize,
			null,
			items,
		);
	}

	/**
	 * 总数。
	 *
	 * 页面没有 .subject-num, 总数在标题里(我收藏的影人(169)); 取不到时退回分页器上的
	 * 总页数(data-total-page) × 每页条数 —— 这个值只会略大于真实条数, 不会小到让翻页提前结束。
	 */
	private getTotal(dataHtml: CheerioAPI): number {
		const titleMatch = dataHtml("head > title").text().trim().match(/\((\d+)\)\s*$/);
		if (titleMatch) {
			return parseInt(titleMatch[1], 10);
		}
		const totalPage = Number(dataHtml(".paginator .thispage").attr("data-total-page"));
		return totalPage > 0 ? totalPage * this.getPageSize() : 0;
	}
}
