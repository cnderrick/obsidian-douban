import {CheerioAPI, load} from "cheerio";
import {AnyNode} from "domhandler";

/**
 * DOM helpers shared by Douban subject handlers.  Douban changes wrapper
 * elements fairly often, so these helpers deliberately key off labels and
 * content semantics instead of sibling positions such as next().next().
 */
export default class DoubanPageParser {
	private static readonly USER_SCOPES = [
		'#interest_sect_level',
		'.collection-section',
		'#interest_section',
	];

	/**
	 * 宽松解析详情页里的 JSON-LD。
	 *
	 * 豆瓣偶尔会把带反斜杠的标题原样(未转义)写进 ld+json, 例如书名
	 * `交互系统新概念设计(用户绩效和用户体验设计准则)/UI\UE系列丛书` 会变成
	 * `"name" : ".../UI\UE系列丛书"`, 而 `\U` 不是合法的 JSON 转义, 直接
	 * JSON.parse 会抛 `Bad escaped character` —— 整条会因此被判为失败, 且因为
	 * 记录里从未成功过, 每次同步都会重抓再失败一次。
	 *
	 * 因此这里先原样解析, 失败再把「不构成合法转义的孤立反斜杠」翻倍后重试;
	 * 仍失败则返回 null(不抛错), 交给调用方退回 DOM/meta 兜底。
	 *
	 * @param value script[type='application/ld+json'] 的文本
	 */
	static parseJsonLd(value: string | null | undefined): any | null {
		const text = String(value == null ? '' : value);
		if (!text.trim()) {
			return null;
		}
		try {
			return JSON.parse(text);
		} catch (_error) {
			// 落到下面的修复分支
		}
		try {
			return JSON.parse(this.repairInvalidJsonEscapes(text));
		} catch (_error) {
			return null;
		}
	}

	/**
	 * 把不构成合法 JSON 转义的反斜杠翻倍。
	 *
	 * 合法的转义只有 `"` `\` `/` `b` `f` `n` `r` `t` 与 `uXXXX`;
	 * 其余(含结尾处的孤立反斜杠)都是豆瓣漏转义的, 翻倍后即可被 JSON.parse 接受。
	 */
	private static repairInvalidJsonEscapes(text: string): string {
		return text.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
	}

	static normalizeText(value: string): string {
		if (!value) {
			return '';
		}
		return value
			.replace(/\r\n?/g, '\n')
			.split('\n')
			.map(line => line.replace(/[\t\f\v ]+/g, ' ').trim())
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	}

	static extractText(html: CheerioAPI, selectors: string[]): string {
		for (const selector of selectors) {
			const elements = html(selector).get();
			if (elements.length === 0) {
				continue;
			}
			const paragraphs = elements
				.map(element => {
					const fragment = html(element).html();
					const value = fragment == null
						? html(element).text()
						: load(`<div>${fragment.replace(/<br\s*\/?\s*>/gi, '\n')}</div>`)('div').text();
					return this.normalizeText(value);
				})
				.filter(Boolean);
			if (paragraphs.length > 0) {
				return paragraphs.join('\n\n');
			}
		}
		return '';
	}

	static parseUserTags(html: CheerioAPI): string[] {
		const labeled = this.findLabeledElement(html, /^标签\s*[:：]/);
		if (!labeled) {
			return null;
		}
		let text = this.normalizeText(html(labeled).text())
			.replace(/^标签\s*[:：]\s*/, '');
		if (!text && labeled.parent) {
			text = this.normalizeText(html(labeled.parent as AnyNode).text())
				.replace(/^标签\s*[:：]\s*/, '');
		}
		const tags = text.split(/\s+/).map(tag => tag.trim()).filter(Boolean);
		return tags.length > 0 ? tags : null;
	}

	static parseUserComment(html: CheerioAPI, fallbackSelectors: string[] = []): string {
		const explicit = this.extractText(html, [
			...fallbackSelectors,
			...this.USER_SCOPES.flatMap(scope => [
				`${scope} textarea[name='comment']`,
				`${scope} [data-field='comment']`,
				`${scope} .comment-text`,
				`${scope} .comment-content`,
			]),
		]);
		if (explicit && this.isCommentCandidate(explicit)) {
			return explicit;
		}

		const tagElement = this.findLabeledElement(html, /^标签\s*[:：]/);
		if (tagElement) {
			let sibling = tagElement.nextSibling;
			while (sibling) {
				const candidate = this.normalizeText(html(sibling as AnyNode).text());
				if (this.isCommentCandidate(candidate)) {
					return candidate;
				}
				sibling = sibling.nextSibling;
			}
		}

		// Last-resort fallback for older pages: inspect leaf-like elements in the
		// user-state area and choose the final non-metadata value.
		const candidates: string[] = [];
		for (const scope of this.USER_SCOPES) {
			html(`${scope} span, ${scope} p, ${scope} div`).each((_index, element) => {
				if (html(element).children().length > 0) {
					return;
				}
				const candidate = this.normalizeText(html(element).text());
				if (this.isCommentCandidate(candidate)) {
					candidates.push(candidate);
				}
			});
			if (candidates.length > 0) {
				break;
			}
		}
		return candidates.length > 0 ? candidates[candidates.length - 1] : null;
	}

	static collectFollowingFieldText(html: CheerioAPI, labelElement: AnyNode): string {
		const values: string[] = [];
		let sibling = labelElement.nextSibling;
		while (sibling) {
			if (sibling.type === 'tag' && sibling.name === 'br') {
				break;
			}
			const value = this.normalizeText(html(sibling as AnyNode).text());
			if (value && !/^[\/、,，;；]+$/.test(value)) {
				values.push(value);
			}
			sibling = sibling.nextSibling;
		}
		return Array.from(new Set(values)).join(' / ');
	}

	private static findLabeledElement(html: CheerioAPI, label: RegExp): AnyNode | null {
		for (const scope of this.USER_SCOPES) {
			const elements = html(`${scope} span, ${scope} div, ${scope} p`).get();
			const matching = elements
				.map(element => ({element, text: this.normalizeText(html(element).text())}))
				.filter(item => label.test(item.text))
				.sort((a, b) => a.text.length - b.text.length);
			if (matching.length > 0) {
				return matching[0].element;
			}
		}
		return null;
	}

	private static isCommentCandidate(text: string): boolean {
		if (!text || text.length < 2) {
			return false;
		}
		if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text) || /^\d+(?:\.\d+)?$/.test(text)) {
			return false;
		}
		if (/^标签\s*[:：]/.test(text) || /^(我的)?评价\s*[:：]?$/.test(text)) {
			return false;
		}
		if (/^(想看|看过|在看|想读|读过|在读|想听|听过|在听|想玩|玩过|在玩)/.test(text)) {
			return false;
		}
		if (/^(修改|删除|评分|暂无评价)$/.test(text)) {
			return false;
		}
		if (/^[一二三四五1-5]星$/.test(text) || /^(很差|较差|还行|推荐|力荐)$/.test(text)) {
			return false;
		}
		return true;
	}
}
