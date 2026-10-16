import DoubanSubject from "./DoubanSubject";

/**
 * 影人(我收藏的影人)。
 *
 * 列表页给的是 celebrity id, 而内容页已经迁到 www.douban.com/personage/{personageId}/
 * 两者不是同一个数字, 所以这里两个都留着: id 用 celebrity id(列表天然提供, 也是增量记账的键),
 * personageId 用人物页 id(打开页面用)。
 */
export default class DoubanCelebritySubject extends DoubanSubject {
	personageId: string;
	gender: string;
	birthday: Date;
	birthplace: string;
	profession: string;
	aliases: string[];
	IMDb: string;
}

export const DoubanCelebrityParameter = {
	personageId: 'personageId',
	gender: 'gender',
	birthday: 'birthday',
	birthplace: 'birthplace',
	profession: 'profession',
	aliases: 'aliases',
	IMDb: 'IMDb',
}
