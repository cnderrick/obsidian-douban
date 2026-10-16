import {DoubanAbstractSyncHandler} from "./DoubanAbstractSyncHandler";
import {SyncType} from "../../../constant/Constsant";
import DoubanPlugin from "../../../main";
import DoubanCelebrityLoadHandler from "../../data/handler/DoubanCelebrityLoadHandler";
import DoubanCelebritySubject from "../../data/model/DoubanCelebritySubject";
import DoubanCelebrityListHandler from "./list/DoubanCelebrityListHandler";

/**
 * 我收藏的影人的同步。
 *
 * 只有一个列表(没有想看/看过), 因此状态列表里就它一个 —— 父类的
 * prepareSyncStates/forEachState 会退化成单状态, 不需要额外处理。
 */
export class DoubanCelebritySyncHandler extends DoubanAbstractSyncHandler<DoubanCelebritySubject> {

	constructor(plugin: DoubanPlugin) {
		super(plugin, new DoubanCelebrityLoadHandler(plugin), [
			new DoubanCelebrityListHandler(),
		]);
	}

	getSyncType(): SyncType {
		return SyncType.celebrity;
	}
}
