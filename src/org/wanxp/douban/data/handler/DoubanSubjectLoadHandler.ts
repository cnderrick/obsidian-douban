import DoubanSubject from "../model/DoubanSubject";
import HandleContext from "../model/HandleContext";
import HandleResult from "../model/HandleResult";
import {SubjectListItem} from "../model/SubjectListItem";

export default interface DoubanSubjectLoadHandler<T extends DoubanSubject> {

	parse(extract: T, context: HandleContext): Promise<HandleResult>;

	support(extract: DoubanSubject): boolean;

	/**
	 * 抓详情页并建卡。
	 *
	 * @param listItem 同步时这条在收藏列表里的样子。列表页会标出「已被豆瓣删除」的条目,
	 *        并给出标题 —— 详情页 404 时靠它兜底建卡。
	 */
	handle(id: string, context: HandleContext, listItem?: SubjectListItem): Promise<T>;

}
