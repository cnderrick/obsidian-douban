import {SyncConfig} from "./SyncConfig";
import {SyncItemResult} from "./SyncItemResult";
import {
	SupportType,
	SyncConditionTypeRecords,
	SyncItemStatus,
	SyncTypeRecords
} from "../../../constant/Constsant";
import {SyncHandledData} from "../../setting/model/SyncHandledData";
import {
	DoubanSubjectState,
	DoubanSubjectStateRecords,
	DoubanSubjectStateRecords_SYNC
} from "../../../constant/DoubanUserState";

export default class SyncStatusHolder {

	public handledData: Map<string, Set<string>>;
	public syncResultMap: Map<string, SyncItemResult> = new Map();
	public statusHandleMap: Map<SyncItemStatus, number> = new Map([
	[SyncItemStatus.exists, 0],
	[SyncItemStatus.replace, 0],
	[SyncItemStatus.create, 0],
	[SyncItemStatus.missing, 0],
	[SyncItemStatus.fail, 0],
		[SyncItemStatus.failByDiffType, 0],
		[SyncItemStatus.unHandle, 0],
	]);

	private key: string;
	//不管处不处理的总数，比如会包含已经存在的，或者条件没覆盖的部分，比如过滤条件选择了1-2条，但总共其实有10条
	private allTotal: number;

	public syncConfig: SyncConfig;
	//处理的总数
	private total:number;
	private handle:number;
	private message:string = '';

	constructor(syncConfig: SyncConfig) {
		this.syncConfig = syncConfig;
		this.total = 0;
		this.handle = 0;
		this.key =this.getKey(syncConfig);
	}

	handled(num:number) {
		this.handle = this.handle + num;
	}

	totalNum(num:number) {
		this.total = num ;
	}

	getTotal():number {
		return this.total;
	}

	getAllTotal():number {
		return this.allTotal;
	}

	setAllTotal(allTotal:number) {
		this.allTotal = allTotal;
	}



	/**
	 * 已处理总数，包含已经存在不需要同步的部分
	 */
	getHasHandle():number {
		return this.handle;
	}

	/**
	 * 进度分子: 与分母口径一致的已处理数。
	 *
	 * 分母在整轮同步开始时确定一次, 正常情况下分子不会超过它; 万一因为异常出现超过,
	 * 按分母封顶, 避免界面上出现 45/30 这类数字。
	 */
	getProgressHandled():number {
		return this.total > 0 ? Math.min(this.handle, this.total) : this.handle;
	}

	/**
	 * 尚未处理的条目数: 分母减去已处理数, 不会为负。
	 */
	getNotHandled():number {
		return Math.max(0, this.getTotal() - this.getHasHandle());
	}


	public replace(id:string, title:string) {
		this.putToHandled(id, title);
		this.updateResult(id, title, SyncItemStatus.replace);
	}

	public exists(id:string, title:string) {
		this.putToHandled(id, title);
		this.updateResult(id, title, SyncItemStatus.exists);
	}

	public unHandle(id:string, title:string) {
		this.updateResult(id, title, SyncItemStatus.unHandle);
	}


	public create(id:string, title:string) {
		this.putToHandled(id, title);
		this.updateResult(id, title, SyncItemStatus.create);
	}

	public fail(id:string, title:string) {
		this.updateResult(id, title, SyncItemStatus.fail);
	}

	/**
	 * 豆瓣已删除该条目, 用列表信息建了卡。
	 *
	 * 与 fail 不同, 这里会**写进增量记录** —— 否则这条 id 永远不会被跳过,
	 * 每轮同步都要再请求一次注定 404 的详情页。
	 */
	public skipMissing(id:string, title:string) {
		this.putToHandled(id, title);
		this.updateResult(id, title, SyncItemStatus.missing);
	}

	public failByDiffType(id:string, title:string) {
		this.updateResult(id, title, SyncItemStatus.failByDiffType);
	}

	private updateResult(id:string, title:string, status:SyncItemStatus) {
		this.syncResultMap.set(id, {id: id,title:title,status:status});
		this.statusHandleMap.set(status, this.statusHandleMap.get(status) + 1);
		this.handled(1);
	}

	public setTotal(total:number) {
		this.totalNum(total);
	}


	private putToHandled(id: string, title: string) {
		if (!this.handledData) {
			this.handledData = new Map<string, Set<string>>();
		}
		const {key} = this;
		if (!this.handledData.has(key)) {
			this.handledData.set(key, new Set<string>());
		}
		this.handledData.get(key).add(id)
	}

	shouldSync(id: string) {
		return this.handledData.get(this.key)?!this.handledData.get(this.key).has(id):true;
	}

	 getKey(syncConfig: SyncConfig):string {
		 const type:string = syncConfig.syncType ? syncConfig.syncType : '';
		 const scope:string = syncConfig.scope ? syncConfig.scope : '';
		 const path:string = syncConfig.dataFilePath ? syncConfig.dataFilePath : '';
		 return `${path}+${type}+${scope}`;
	 }

	public initSyncHandledData(data:SyncHandledData[]) {
		this.handledData = new Map<string, Set<string>>();
		const {handledData} = this;
		data.forEach((d) => {
			handledData.set(d.key,new Set<string>(d.value));
		})
		// 只在本轮关掉增量时清空**当前 key** 的记录。
		//
		// 这里以前还会调用 resetTypeOtherSyncHandledData(), 把「同一 dataFilePath 段下其它 key」
		// 的记录一并 clear。而默认 dataFilePath 是空串、所有类型共用同一段, 于是每同步一个类别
		// 就会清掉其它所有类别的记录 —— 交替同步电影/书籍时增量完全失效, 每次都要重翻整份列表;
		// 被清空的 Set 还会被 saveHandledData 写回, 让记录彻底消失。已删除该行为。
		if (!this.syncConfig.incrementalUpdate) {
			this.resetSyncHandledData();
		}
	}

	public resetSyncHandledData() {
		return this.handledData.set(this.key, new Set());
	}

	public setMessage(s: string) {
		this.message = s;
	}

	public getMessage() {
		return this.message;
	}

	public getScopeName():string {
		//@ts-ignore
		return DoubanSubjectStateRecords_SYNC[this.syncConfig.syncType][this.syncConfig.scope];
	}

	public getTypeName():string {
		return SyncTypeRecords[this.syncConfig.syncType];


	}

	public getSyncConditionName() {
		return SyncConditionTypeRecords[this.syncConfig.syncConditionType];
	}
}
