import {SyncConfig} from "./SyncConfig";
import {SyncConditionType, SyncType} from "../../../constant/Constsant";
import {DoubanSubjectStateRecords_SYNC} from "../../../constant/DoubanUserState";
import {DEFAULT_SETTINGS} from "../../../constant/DefaultSettings";

/**
 * 派生「全部」模式下某个类别的同步配置。
 *
 * 路径、条件、开关全部继承用户选的; 只把同步类型与模板换成该类别的 ——
 * 类别之间只有这两项不同, 否则「全部」跑出来会和单独同步某个类别不一致。
 *
 * @param base 用户在弹窗里选的配置(类型是 all)
 * @param syncType 要派生的类别
 * @param settings 插件设置, 用来取该类别配的模板文件
 * @returns 该类别不支持所选状态或不支持所选条件时返回 null, 表示这个类别跳过
 */
export function buildAllSubConfig(base: SyncConfig, syncType: SyncType, settings: any): SyncConfig | null {
	// 各类型支持的状态不同: 影人只有「所有」, 游戏没有「所有」
	const states: any = DoubanSubjectStateRecords_SYNC[syncType];
	if (!states || !states[base.scope]) {
		return null;
	}
	// 影人的收藏列表里没有收藏时间, 「自定义时间」对它无从下手
	if (base.syncConditionType == SyncConditionType.CUSTOM_TIME && syncType == SyncType.celebrity) {
		return null;
	}
	const templateKey = `${syncType}TemplateFile`;
	const templateFile = (settings || {})[templateKey] || (DEFAULT_SETTINGS as any)[templateKey] || '';
	return {...base, syncType, templateFile};
}
