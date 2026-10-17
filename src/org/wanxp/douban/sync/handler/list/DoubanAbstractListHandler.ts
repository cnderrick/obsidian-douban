import { request, RequestUrlParam } from "obsidian";
import { i18nHelper } from "src/org/wanxp/lang/helper";
import { log } from "src/org/wanxp/utils/Logutil";
import { CheerioAPI, load } from "cheerio";
import HandleContext from "../../../data/model/HandleContext";
import { doubanSubjectSyncListUrl } from "../../../../constant/Douban";
import {
	BasicConst,
	PAGE_SIZE,
	SyncType,
	SyncTypeUrlDomain,
} from "../../../../constant/Constsant";
import { SubjectListItem } from "../../../data/model/SubjectListItem";
import { DoubanListHandler } from "./DoubanListHandler";
import { SyncConfig } from "../../model/SyncConfig";
import { sleepRange } from "../../../../utils/TimeUtil";
import { ALL } from "../../../../constant/DoubanUserState";
import HttpUtil from "../../../../utils/HttpUtil";
import { DoubanHttpUtil } from "../../../../utils/DoubanHttpUtil";
import { SearchPage } from "../../../data/model/SearchPage";
import {SearchPageTypeOf} from "../../../data/model/SearchPageTypeOf";

export default abstract class DoubanAbstractListHandler
	implements DoubanListHandler
{
	/**
	 * 取一页列表数据。
	 *
	 * start 参数决定实际取到的是哪一页, 而豆瓣在 start 缺失时会返回第 1 页, 所以这里把
	 * 未指定、未初始化的 offset 规范成 0, 并回写 context.syncOffset, 让解析出的页码
	 * (parseSubjectFromHtml 依赖它) 与实际请求的页保持一致。
	 *
	 * @param context 处理上下文
	 * @param offset 起始条目偏移; 不传时使用 context.syncOffset
	 */
	async getPageData(context: HandleContext, offset?: number): Promise<SearchPage> {
		const start: number = offset == null ? (context.syncOffset == null ? 0 : context.syncOffset) : offset;
		context.syncOffset = start;
		const url: string = this.getUrl(context, start);
		if (!context.plugin.statusHolder.syncing()) {
			return SearchPage.emptyWithNoType();
		}
		let subjectListItemSearchPageTypeOf = await this.getPageList(url, context);
		return subjectListItemSearchPageTypeOf;
	}

	async delay(ms: number) {}

	/**
	 * 默认每页 30 条; 每页条数不同的列表(如影人 15 条)覆盖它。
	 */
	getPageSize(): number {
		return PAGE_SIZE;
	}

	protected getUrl(context: HandleContext, start: number) {
		return doubanSubjectSyncListUrl(
			this.getSyncTypeDomain(),
			context.userComponent.getUserId(),
			this.getDoType(),
			start,
		);
	}

	abstract getDoType(): string;

	abstract getSyncType(): SyncType;

	getSyncTypeDomain(): string {
		return SyncTypeUrlDomain.get(this.getSyncType());
	}

	async getPageList(
		url: string,
		context: HandleContext,
	): Promise<SearchPageTypeOf<SubjectListItem>> {
		return DoubanHttpUtil.httpRequestGet(
			url,
			context.plugin.settingsManager.getHeaders(),
			context.plugin.settingsManager,
		)
			.then(load)
			.then((data) => this.parseSubjectFromHtml(data, context))
			.catch((e) =>
				log.error(
					i18nHelper
						.getMessage("130101")
						.replace("{0}", e.toString()),
					e,
				),
			);
	}

	/**
	 * 卡片是不是「条目已被豆瓣删除」的残影。
	 *
	 * 影视/书籍/音乐/电视剧的列表里, 这种卡片会被降级成 `.item-show.deleted` —— 只剩
	 * 标题链接与一个「删除」按钮, 没有封面、没有信息行、没有收藏日期, 详情页会 404。
	 * 各类型共用一个判断, 别的列表结构(影人 `.grid-view .item`、游戏 `.common-item`)
	 * 只要豆瓣给了 deleted 类也一并认出来。
	 *
	 * 认不出来也不影响正确性: 详情页 404 时 DoubanAbstractLoadHandler 仍会退回列表数据
	 * 建卡, 只是多花一次请求。
	 */
	protected isInvalidCard(item: any): boolean {
		return item.hasClass("deleted");
	}

	parseSubjectFromHtml(
		dataHtml: CheerioAPI,
		context: HandleContext,
	): SearchPageTypeOf<SubjectListItem> {
		const items = dataHtml(".item-show")
			.get()
			.map((i: any): SubjectListItem | null => {
				const item = dataHtml(i);
				const linkValue: string = item
					.find("div.title > a")
					.attr("href");
				const titleValue: string = item
					.find("div.title > a")
					.text()
					.trim();
				const updateDateStr: string = item.find("div.date").text().trim();
				let updateDate = null;
				try {
					updateDate = new Date(updateDateStr);
				}catch (e) {
					console.error(e);
					log.info("parse date error:" + titleValue);
				}
				let idPattern = /(\d){5,10}/g;
				let ececResult = idPattern.exec(linkValue);
				const invalid: boolean = this.isInvalidCard(item);
				return !ececResult ? null : {id: ececResult[0], url: linkValue, title: titleValue, updateDate: updateDate, invalid: invalid};
			})
			// 取不到 id 的条目直接丢弃, 避免 null 条目在后续处理中被当成正常条目
			.filter((item): item is SubjectListItem => item != null);
		const subjectNumText = dataHtml(".subject-num").text().trim();
		const totalNumMatch = subjectNumText.match(/\/\s*(\d+)/);
		const totalNum = totalNumMatch ? parseInt(totalNumMatch[1], 10) : 0;
		const pageSize = this.getPageSize();
		return new SearchPage(
			totalNum,
			Math.floor(context.syncOffset / pageSize) + 1,
			pageSize,
			null,
			items,
		);
	}

	support(config: SyncConfig): boolean {
		return this.getDoType() == config.scope || ALL == config.scope;
	}
}
