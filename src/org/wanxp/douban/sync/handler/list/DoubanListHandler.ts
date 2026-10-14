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

	support(config:SyncConfig):boolean;
}
