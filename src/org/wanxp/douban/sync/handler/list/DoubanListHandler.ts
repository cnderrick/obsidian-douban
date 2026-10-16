import HandleContext from "../../../data/model/HandleContext";
import {SyncConfig} from "../../model/SyncConfig";
import {SearchPage} from "../../../data/model/SearchPage";

export interface DoubanListHandler {

	/**
	 * 取一页列表数据。
	 *
	 * @param context 处理上下文
	 * @param offset 起始条目偏移; 不传时使用 context.syncOffset
	 */
	getPageData(context: HandleContext, offset?: number):Promise<SearchPage>;

	/**
	 * 该列表每页的条数。
	 *
	 * 豆瓣各列表每页条数不同(影视/书籍等 30 条, 影人 15 条), 页号与偏移的换算,
	 * 以及「自定义条数」同步里按条数切页, 都依赖它。
	 */
	getPageSize():number;

	support(config:SyncConfig):boolean;
}
