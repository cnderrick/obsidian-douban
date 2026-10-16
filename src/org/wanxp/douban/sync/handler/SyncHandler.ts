import HandleContext from "../../data/model/HandleContext";
import {SyncConfig} from "../model/SyncConfig";
import DoubanPlugin from "../../../main";
import {App, moment} from "obsidian";
import {DoubanSyncHandler} from "./DoubanSyncHandler";
import {DoubanOtherSyncHandler} from "./DoubanOtherSyncHandler";
import { DoubanMovieSyncHandler } from "./DoubanMovieSyncHandler";
import { DoubanMusicSyncHandler } from "./DoubanMusicSyncHandler";
import { DoubanBookSyncHandler } from "./DoubanBookSyncHandler";
import {i18nHelper} from "../../../lang/helper";
import {DoubanTeleplaySyncHandler} from "./DoubanTeleplaySyncHandler";
import {SyncConditionType, SYNC_ALL_TYPES, SyncType} from "../../../constant/Constsant";
import {DoubanGameSyncHandler} from "./DoubanGameSyncHandler";
import {DoubanCelebritySyncHandler} from "./DoubanCelebritySyncHandler";
import {DataField} from "../../../utils/model/DataField";
import {VariableUtil} from "../../../utils/VariableUtil";
import {FileUtil} from "../../../utils/FileUtil";
import SyncStatusHolder from "../model/SyncStatusHolder";
import {buildAllSubConfig} from "../model/SyncAllTypes";

export default class SyncHandler {
	private app: App;
	private plugin: DoubanPlugin;
	private syncConfig: SyncConfig;
	private context: HandleContext;
	private syncHandlers: DoubanSyncHandler[];
	private defaultSyncHandler: DoubanSyncHandler;


	 constructor(app: App, plugin: DoubanPlugin, syncConfig: SyncConfig, context: HandleContext) {
		this.app = app;
		this.plugin = plugin;
		this.syncConfig = syncConfig;
		this.context = context;
		this.defaultSyncHandler = new DoubanOtherSyncHandler(plugin);
		this.syncHandlers =
			 [
				 new DoubanMovieSyncHandler(plugin),
				 new DoubanBookSyncHandler(plugin),
				 // new DoubanBroadcastSyncHandler(plugin),
				 // new DoubanNoteSyncHandler(plugin),
				 new DoubanMusicSyncHandler(plugin),
				 new DoubanTeleplaySyncHandler(plugin),
				 new DoubanGameSyncHandler(plugin),
				 new DoubanCelebritySyncHandler(plugin),
				 this.defaultSyncHandler
			 ];
	 }

	async sync() {
		if (this.syncConfig && this.syncConfig.syncType && this.syncConfig.scope) {
			const configMessage = this.checkSyncConfig();
			if (configMessage) {
				this.context.syncStatusHolder.syncStatus.setMessage(configMessage);
				return;
			}
			if (this.syncConfig.syncType == SyncType.all) {
				await this.syncEveryType();
				return;
			}
			await this.syncOneType(this.syncConfig);
		}
		await this.showResult();
	}

	/** 单个类别: 交给它的处理器; 没有匹配的处理器时落到兜底处理器 */
	private async syncOneType(syncConfig: SyncConfig) {
		let syncHandler = this.syncHandlers.find(handler => handler.support(syncConfig.syncType));
		if (syncHandler) {
			await syncHandler.sync(syncConfig, this.context);
		} else {
			await this.defaultSyncHandler.sync(syncConfig, this.context);
		}
	}

	/**
	 * 「全部」: 把每个类别依次当成一次独立同步来跑。
	 *
	 * 记账的 key 里含 syncType, 所以每个类别必须有自己的 SyncStatusHolder ——
	 * 否则不同类别的豆瓣 id(都是纯数字, 可能重号)会挤进同一个 Set, 把对方判成"已同步"而漏同步。
	 * 每换一个类别前先把上一个的记录写回设置, 不然下一次 initHandledData 会让它整段丢失。
	 */
	private async syncEveryType(): Promise<void> {
		const {statusHolder} = this.context.plugin;
		let isFirst = true;
		for (const syncType of SYNC_ALL_TYPES) {
			if (!statusHolder.syncing()) {
				return;
			}
			const subConfig = buildAllSubConfig(this.syncConfig, syncType, this.plugin.settings);
			if (!subConfig) {
				// 该类别没有这个状态(影人只有「所有」), 或没有这个条件(影人的列表没有收藏时间)
				continue;
			}
			if (!isFirst) {
				await statusHolder.saveHandledData();
			}
			isFirst = false;
			statusHolder.syncStatus = new SyncStatusHolder(subConfig);
			this.context.syncConfig = subConfig;
			statusHolder.initHandledData();
			// 每个类别各出一份结果报告, 所以用一个独立的 SyncHandler 走完整流程
			await new SyncHandler(this.app, this.plugin, subConfig, this.context).sync();
		}
	}

	async showResult() {
		const {syncStatusHolder} = this.context;
		const {syncStatus} = syncStatusHolder;
		const {statusHandleMap} = syncStatus;
		const {syncResultMap} = syncStatus;
		const {syncConfig} = this;

		let extendCondition = '';
		if (syncConfig.syncConditionType == SyncConditionType.CUSTOM_ITEM) {
			extendCondition = `${syncConfig.syncConditionCountFromValue} - ${syncConfig.syncConditionCountToValue}`;
		} else if (syncConfig.syncConditionType == SyncConditionType.CUSTOM_TIME) {
			extendCondition = `${syncConfig.syncConditionDateFromValue.toISOString().substring(0, 10)} - ${syncConfig.syncConditionDateToValue.toISOString().substring(0, 10)}`;
		}


		const condition = `
1. ${i18nHelper.getMessage('110030')} \`${syncStatus.getTypeName()}\`
2. ${i18nHelper.getMessage('110032')} \`${syncStatus.getScopeName()}\`
3. ${i18nHelper.getMessage('110070')} \`${syncStatus.getSyncConditionName()}\`${extendCondition? (' => ' + extendCondition) : ''}
4. ${i18nHelper.getMessage('110039')} \`${syncConfig.incrementalUpdate?i18nHelper.getMessage('110055'):i18nHelper.getMessage('110056')}\`
5. ${i18nHelper.getMessage('110031')} \`${syncConfig.force?i18nHelper.getMessage('110055'):i18nHelper.getMessage('110056')}\`
`


		let summary:string
			= `${i18nHelper.getMessage('110053', i18nHelper.getMessage('110050'), i18nHelper.getMessage('110051'), i18nHelper.getMessage('110052'))} 
|-----|----|----------------------------------|
`;
		summary += `${i18nHelper.getMessage('110053', i18nHelper.getMessage('syncall'), syncStatus.getTotal(), i18nHelper.getMessage('syncall_desc'))}
`;
		for (const [key, value] of statusHandleMap) {
			// @ts-ignore
			summary+= `${i18nHelper.getMessage('110053', i18nHelper.getMessage(key), value, i18nHelper.getMessage(key + '_desc'))}
`;
		}
		summary += `${i18nHelper.getMessage('110053', i18nHelper.getMessage('notsync'), syncStatus.getNotHandled(), i18nHelper.getMessage('notsync_desc'))}
`;
		let details:string = '';
		for (const [key, value] of syncResultMap) {
			if (value.status == 'unHandle') {
				// @ts-ignore
				details+= `${value.id}-  ${value.title}  :  ${i18nHelper.getMessage(value.status)}
`;
			}else {
				// 链接要跟实际文件名一致(文件名末段带 id), 否则报告里的链接指不到文件
				details+= `${value.id}-[[${FileUtil.replaceSpecialCharactersForFileName(value.title)} ${value.id}]]:  ${i18nHelper.getMessage(value.status)}
`;
			}

		}
		const result : string = i18nHelper.getMessage('110037', condition, summary, details);
		const resultFileName = `${i18nHelper.getMessage('110038')}_${moment(new Date()).format('YYYYMMDDHHmmss')}`
		await this.plugin.fileHandler.createNewNoteWithData(`${this.syncConfig.dataFilePath}/${resultFileName}`, result, true);
	}

	private checkSyncConfig() {
		 const {syncConfig} = this;
		 switch (syncConfig.syncConditionType) {
			 case SyncConditionType.CUSTOM_ITEM:
				 if (syncConfig.syncConditionCountFromValue && syncConfig.syncConditionCountToValue) {
					 if (syncConfig.syncConditionCountFromValue > syncConfig.syncConditionCountToValue) {
						 return i18nHelper.getMessage('110044');
					 }
				 }
			 	break;
			 case SyncConditionType.CUSTOM_TIME:
				 if (syncConfig.syncConditionDateToValue && syncConfig.syncConditionDateFromValue) {
					 if (syncConfig.syncConditionDateFromValue > syncConfig.syncConditionDateToValue) {
						 return i18nHelper.getMessage('110045');
					 }
				 }

		 }
	}
}
