export interface SubjectListItem {
	id:string;
	url:string;
	title:string;
	updateDate: Date | null;
	/**
	 * 豆瓣已删除该条目。
	 *
	 * 收藏列表里这种卡片被降级成 `.item-show.deleted`, 只剩标题与一个「删除」链接,
	 * 详情页会 404 —— 拿不到简介/封面/年代。同步时据此跳过详情页请求。
	 */
	invalid?: boolean;
}
