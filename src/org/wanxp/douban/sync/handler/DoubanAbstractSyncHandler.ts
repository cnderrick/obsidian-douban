import DoubanPlugin from "../../../main";
import {
	BasicConst,
	PAGE_SIZE,
	SyncConditionType,
	SyncType,
} from "../../../constant/Constsant";
import { DoubanSyncHandler } from "./DoubanSyncHandler";
import { SyncConfig } from "../model/SyncConfig";
import HandleContext from "../../data/model/HandleContext";
import { SubjectListItem } from "../../data/model/SubjectListItem";
import { sleepRange } from "../../../utils/TimeUtil";
import DoubanSubjectLoadHandler from "../../data/handler/DoubanSubjectLoadHandler";
import { DoubanListHandler } from "./list/DoubanListHandler";
import DoubanSubject from "../../data/model/DoubanSubject";
import { log } from "../../../utils/Logutil";
import { i18nHelper } from "../../../lang/helper";
import { SearchPage } from "../../data/model/SearchPage";
import {SearchPageTypeOf} from "../../data/model/SearchPageTypeOf";

/**
 * 取一页条目里最新的更新日期; 一页里没有任何可解析日期时返回 null。
 */
function newestDate(dataList: SubjectListItem[]): Date | null {
	return pickDate(dataList, (candidate, current) => candidate.getTime() > current.getTime());
}

/**
 * 取一页条目里最旧的更新日期; 一页里没有任何可解析日期时返回 null。
 */
function oldestDate(dataList: SubjectListItem[]): Date | null {
	return pickDate(dataList, (candidate, current) => candidate.getTime() < current.getTime());
}

function pickDate(
	dataList: SubjectListItem[],
	isBetter: (candidate: Date, current: Date) => boolean,
): Date | null {
	let result: Date | null = null;
	(dataList || []).forEach((item) => {
		const date = item ? item.updateDate : null;
		if (!(date instanceof Date) || isNaN(date.getTime())) {
			return;
		}
		if (result == null || isBetter(date, result)) {
			result = date;
		}
	});
	return result;
}

export abstract class DoubanAbstractSyncHandler<T extends DoubanSubject>
	implements DoubanSyncHandler
{
	private plugin: DoubanPlugin;
	private doubanSubjectLoadHandler: DoubanSubjectLoadHandler<T>;
	private doubanListHandlers: DoubanListHandler[];

	constructor(
		plugin: DoubanPlugin,
		doubanSubjectLoadHandler: DoubanSubjectLoadHandler<T>,
		doubanListHandlers: DoubanListHandler[],
	) {
		this.plugin = plugin;
		this.doubanSubjectLoadHandler = doubanSubjectLoadHandler;
		this.doubanListHandlers = doubanListHandlers;
	}

	support(t: string): boolean {
		return this.getSyncType() == t;
	}

	abstract getSyncType(): SyncType;

	async sync(syncConfig: SyncConfig, context: HandleContext): Promise<void> {
		if (syncConfig.syncConditionType == SyncConditionType.CUSTOM_TIME) {
			await this.syncByTimeLimit(syncConfig, context);
		} else if (syncConfig.syncConditionType == SyncConditionType.CUSTOM_ITEM) {
			await this.syncByCountLimit(syncConfig, context);
		}else if (syncConfig.syncConditionType == SyncConditionType.ALL) {
			await this.syncAll(syncConfig, context);
		}else if (syncConfig.syncConditionType == SyncConditionType.LAST_THIRTY) {
			await this.syncLastThirty(syncConfig, context);
		}else {
			log.warn(i18nHelper.getMessage("110083"));
		}
	}

	/**
	 * 拉取指定日期范围内的条目。
	 *
	 * 列表按时间倒序返回, 所以「日期落在范围内」的条目是连续的一段, 可以用两次二分把
	 * 区间两端的页找出来, 再只取这一段:
	 * <li>跳过整页都晚于结束日期的页(它们还没进入范围)</li>
	 * <li>在第一个整页都早于起始日期的页处停下(范围已经结束)</li>
	 * <li>区间内逐页取回, 再按条目日期过滤</li>
	 *
	 * 取页必须显式给出页号(由 getItems 换算成 start 偏移)。旧实现依赖从未赋值的
	 * context.syncOffset, 每次请求都在抓第 1 页, 汇总时把同一页条目重复累加,
	 * 于是「需要同步数」可以超过列表总数。
	 */
	async getByTimeLimit(syncConfig: SyncConfig, context: HandleContext): Promise<SubjectListItem[]> {
		const startDate = syncConfig.syncConditionDateFromValue
			? new Date(syncConfig.syncConditionDateFromValue)
			: null;
		const endDate = syncConfig.syncConditionDateToValue
			? new Date(syncConfig.syncConditionDateToValue)
			: null;
		if (!startDate && !endDate) {
			log.warn(i18nHelper.getMessage("110081"));
			return;
		}
		const firstPage = await this.getItems(syncConfig, context, 1);
		if (!firstPage) {
			return;
		}
		const lastPage: number = Math.max(1, Math.ceil(firstPage.total / PAGE_SIZE));
		const cacheList = new Map<number, SearchPageTypeOf<SubjectListItem>>();
		cacheList.set(firstPage.pageNum, firstPage);
		/**
		 * 按页号取页, 已取过的直接复用。缓存键用实际取到的页号, 避免把某一页的数据
		 * 挂在别的页号下(旧实现就是按意图页号挂, 于是二分探测全都被第 1 页顶替)。
		 */
		const fetchPage = async (pageNum: number): Promise<SearchPageTypeOf<SubjectListItem>> => {
			const cached = cacheList.get(pageNum);
			if (cached) {
				return cached;
			}
			const page = await this.getItems(syncConfig, context, pageNum);
			if (page) {
				cacheList.set(page.pageNum, page);
			}
			return page;
		};
		/**
		 * 在页序列里二分查找第一个满足条件的页号; 一页都不满足时返回 fallback。
		 */
		const findFirstPage = async (
			matched: (page: SearchPageTypeOf<SubjectListItem>) => boolean,
			fallback: number,
		): Promise<number> => {
			let left = 1;
			let right = lastPage;
			let result = fallback;
			while (left <= right) {
				if (!context.plugin.statusHolder.syncing()) {
					break;
				}
				const mid = Math.floor((left + right) / 2);
				const page = await fetchPage(mid);
				if (!page || !page.list || page.list.length == 0) {
					break;
				}
				if (matched(page)) {
					result = mid;
					right = mid - 1;
				} else {
					left = mid + 1;
				}
			}
			return result;
		};
		const startPage: number = endDate
			? await findFirstPage((page) => {
				const date = oldestDate(page.list);
				return date == null || date <= endDate;
			}, lastPage + 1)
			: 1;
		const endPage: number = startDate
			? (await findFirstPage((page) => {
				const date = newestDate(page.list);
				return date != null && date < startDate;
			}, lastPage + 1)) - 1
			: lastPage;
		if (startPage > endPage) {
			return [];
		}
		const needHandleItems: SubjectListItem[] = [];
		for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
			if (!context.plugin.statusHolder.syncing()) {
				break;
			}
			const page = await fetchPage(pageNum);
			if (!page) {
				break;
			}
			// 每页只取一次, 按日期过滤后累加
			needHandleItems.push(...page.list.filter((item) => {
				const itemDate = item.updateDate;
				return (!startDate || itemDate >= startDate) && (!endDate || itemDate <= endDate);
			}));
		}
		return needHandleItems;
	}
	async syncByTimeLimit(syncConfig: SyncConfig, context: HandleContext) {
		const items = await this.getByTimeLimit(syncConfig, context);
		if (!items || items.length == 0) {
			return;
		}

		let subjectListItems = await this.removeExists(
			items,
			syncConfig,
			context,
		);

		const searchPage = new SearchPageTypeOf<SubjectListItem>(subjectListItems.length,
			1,
			subjectListItems.length,
			null,subjectListItems);
		await this.handleItems(searchPage, subjectListItems, context);

	}

	/**
	 * 取一页列表数据。
	 *
	 * @param pageNum 页号(从 1 开始); 不传时沿用 context.syncOffset 表示的偏移
	 */
	private async getItems(
		syncConfig: SyncConfig,
		context: HandleContext,
		pageNum?: number,
	): Promise<SearchPageTypeOf<SubjectListItem>> {
		const supportHandlers: DoubanListHandler[] =
			this.doubanListHandlers.filter((h) => h.support(syncConfig));
		const handler = supportHandlers[0];
		if (!context.plugin.statusHolder.syncing() || !handler) {
			return SearchPage.emptyWithNoType();
		}
		const offset = pageNum == null ? undefined : Math.max(0, (pageNum - 1) * PAGE_SIZE);
		const item = await handler.getPageData(context, offset);
		if (!context.plugin.statusHolder.syncing()) {
			return SearchPage.emptyWithNoType();
		}
		return item;
	}

	private async removeExists(
		items: SubjectListItem[],
		syncConfig: SyncConfig,
		context: HandleContext,
	): Promise<SubjectListItem[]> {
		if (!context.plugin.statusHolder.syncing()) {
			return [];
		}
		return items;
	}

	private async handleItems(
		searchPage: SearchPage,
		items: SubjectListItem[],
		context: HandleContext,
	): Promise<void> {
		if (!items || items.length == 0) {
			return;
		}
		const { syncStatus } = context.syncStatusHolder;
		syncStatus.totalNum(searchPage.total);
		const needHandled: number =
			syncStatus.getTotal() - syncStatus.getHasHandle();
		syncStatus.setNeedHandled(needHandled);
		for (const item of items) {
			if (!context.plugin.statusHolder.syncing()) {
				return;
			}
			try {
				if (syncStatus.shouldSync(item.id)) {
					let subject: DoubanSubject =
						await this.doubanSubjectLoadHandler.handle(
							item.id,
							context,
						);

					await sleepRange(
						BasicConst.CALL_DOUBAN_DELAY,
						BasicConst.CALL_DOUBAN_DELAY +
							BasicConst.CALL_DOUBAN_DELAY_RANGE,
					);
				} else {
					syncStatus.unHandle(item.id, item.title);
				}
			} catch (e) {
				log.notice(i18nHelper.getMessage("130120"));
			}
		}
	}

	private async syncByCountLimit(syncConfig: SyncConfig, context: HandleContext) {
		const {syncConditionCountFromValue, syncConditionCountToValue} = syncConfig;
		const startOffset = Math.floor((syncConditionCountFromValue - 1)/ PAGE_SIZE) * PAGE_SIZE;
		context.syncOffset = startOffset;
		//结束点是第几条
		let endOffsetNumberForCustom = 0;
		let needHandleTotalCustomItem = 0;
		let isFirstStep = true;
		let handleCount = 0;
		do {
			let searchPage = await this.getItems(syncConfig, context);
			if (!context.plugin.statusHolder.syncing()) {
				break;
			}
			const {list, total} = searchPage;
			if (
				!searchPage ||
				!list ||
				list.length == 0
			) {
				break;
			}
			if (syncConditionCountFromValue > total) {
				context.syncStatusHolder.syncStatus.setMessage(i18nHelper.getMessage("130121", total));
				break;
			}
			if (endOffsetNumberForCustom == 0) {
				endOffsetNumberForCustom = Math.min(syncConditionCountToValue?syncConditionCountToValue:searchPage.total, searchPage.total);
				needHandleTotalCustomItem = endOffsetNumberForCustom - syncConditionCountFromValue + 1;

			}
			let subjectListItems = [];

			//在开始和结束同一页
			if (Math.floor((syncConditionCountFromValue - 1) / PAGE_SIZE) == Math.floor((endOffsetNumberForCustom - 1) / PAGE_SIZE)) {
				const startIndex = Math.floor((syncConditionCountFromValue - 1) % PAGE_SIZE);
				const endIndex =  Math.floor((endOffsetNumberForCustom - 1) % PAGE_SIZE);
				subjectListItems = await this.removeExists(
					list.slice(startIndex, endIndex + 1),
					syncConfig,
					context,
				);
				handleCount += (endIndex - startIndex + 1);
			//第一页
			} else if (isFirstStep) {
				const startIndex = (syncConditionCountFromValue - 1) % PAGE_SIZE;
				handleCount += (list.length - startIndex);
				subjectListItems = await this.removeExists(
					list.slice(startIndex),
					syncConfig,
					context,
				);
				isFirstStep = false;
			}
			//最后一页
			else if (needHandleTotalCustomItem - handleCount <= PAGE_SIZE) {
				const endIndex = needHandleTotalCustomItem - handleCount;
				subjectListItems = await this.removeExists(
					list.slice(0, endIndex),
					syncConfig,
					context,
				);
				handleCount += endIndex;
				//中间页
			} else {
				subjectListItems = await this.removeExists(
					list,
					syncConfig,
					context,
				);
				handleCount += PAGE_SIZE;
			}


			if (!subjectListItems || subjectListItems.length == 0) {
				await sleepRange(
					BasicConst.CALL_DOUBAN_DELAY,
					BasicConst.CALL_DOUBAN_DELAY +
					BasicConst.CALL_DOUBAN_DELAY_RANGE,
				);
				continue;
			}

			searchPage.total = needHandleTotalCustomItem;
			//处理
			await this.handleItems(searchPage, subjectListItems, context);

			context.syncOffset = context.syncOffset + PAGE_SIZE;
			await sleepRange(
				BasicConst.CALL_DOUBAN_DELAY,
				BasicConst.CALL_DOUBAN_DELAY +
				BasicConst.CALL_DOUBAN_DELAY_RANGE,
			);
		} while (handleCount < needHandleTotalCustomItem);
	}

	private async syncAll(syncConfig: SyncConfig, context: HandleContext) {
		//最多100000条
		context.syncOffset = 0;
		let handleCount = 0;
		let totalForHandle = 0;
		let isFirstStep = true;
		do {
			let searchPage = await this.getItems(syncConfig, context);
			if (!context.plugin.statusHolder.syncing()) {
				break;
			}

			const {list, total} = searchPage;
			if (
				!searchPage ||
				!list ||
				list.length == 0
			) {
				break;
			}
			if (isFirstStep) {
				totalForHandle = total;
				isFirstStep = false;
			}
			handleCount += list.length;
			let subjectListItems = await this.removeExists(
				list,
				syncConfig,
				context,
			);
			if (!subjectListItems || subjectListItems.length == 0) {
				await sleepRange(
					BasicConst.CALL_DOUBAN_DELAY,
					BasicConst.CALL_DOUBAN_DELAY +
					BasicConst.CALL_DOUBAN_DELAY_RANGE,
				);
				continue;
			}
			await this.handleItems(searchPage, subjectListItems, context);
			context.syncOffset = context.syncOffset + PAGE_SIZE;
			await sleepRange(
				BasicConst.CALL_DOUBAN_DELAY,
				BasicConst.CALL_DOUBAN_DELAY +
				BasicConst.CALL_DOUBAN_DELAY_RANGE,
			);
		} while (handleCount <= totalForHandle);
	}

	private async syncLastThirty(syncConfig: SyncConfig, context: HandleContext) {
		context.syncOffset = 0;
		let searchPage = await this.getItems(syncConfig, context);
		if (!context.plugin.statusHolder.syncing()) {
			return;
		}
		const {list, total} = searchPage;
		if (
			!searchPage ||
			!list ||
			list.length == 0
		) {
			return;
		}

		let subjectListItems = await this.removeExists(
			list,
			syncConfig,
			context,
		);
		if (!subjectListItems || subjectListItems.length == 0) {
			return;
		}
		searchPage.total = Math.min(list.length, total);
		await this.handleItems(searchPage, subjectListItems, context);
	}
}
