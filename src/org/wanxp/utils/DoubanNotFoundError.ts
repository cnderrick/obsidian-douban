/**
 * 豆瓣已经把该条目删掉了: 详情页返回 404, 或返回「页面不存在」。
 *
 * 与普通网络错误分开, 调用方据此决定「用列表页剩下的信息建卡」而不是记成失败。
 */
export default class DoubanNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DoubanNotFoundError';
		// 有些打包方式会切断原型链, 用一个显式标记让判断不依赖 instanceof
		(this as any).doubanNotFound = true;
	}

	static is(error: any): boolean {
		return !!error && (error instanceof DoubanNotFoundError || error.doubanNotFound === true);
	}
}
