export enum DoubanPageProblem {
	accessDenied = 'access-denied',
	loginRequired = 'login-required',
	/** 条目已被豆瓣删除: 页面标题与正文都是「页面不存在」 */
	notFound = 'not-found',
}

/**
 * Detects HTML pages that Douban returns with HTTP 200 even though they are
 * not the requested content page. Passing these pages to a subject parser can
 * otherwise create an empty note that looks like a successful import.
 */
export default class DoubanPageGuard {
	static detect(html: string): DoubanPageProblem | null {
		const page = String(html || '');
		if (!page) {
			return null;
		}

		if (/<title[^>]*>\s*禁止访问\s*<\/title>/i.test(page)) {
			return DoubanPageProblem.accessDenied;
		}

		// 被删掉的条目: 404 页(标题「页面不存在」, 正文「呃…你想访问的页面不存在」)。
		// 豆瓣有时以 200 返回同样的页面, 所以不能只看状态码。
		if (/<title[^>]*>\s*页面不存在\s*<\/title>/i.test(page) || page.indexOf('你想访问的页面不存在') >= 0) {
			return DoubanPageProblem.notFound;
		}

		const isLoginRedirectTitle = /<title[^>]*>\s*豆瓣\s*-\s*登录跳转页\s*<\/title>/i.test(page);
		const hasLoginRedirectLink = /accounts\.douban\.com\/passport\/login[^"'<>\s]*redir=/i.test(page);
		if (isLoginRedirectTitle || hasLoginRedirectLink) {
			return DoubanPageProblem.loginRequired;
		}

		return null;
	}
}
