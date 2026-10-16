import {CheerioAPI} from 'cheerio';
import {moment} from 'obsidian';
import DoubanAbstractLoadHandler from "./DoubanAbstractLoadHandler";
import DoubanCelebritySubject from "../model/DoubanCelebritySubject";
import DoubanSubject from "../model/DoubanSubject";
import DoubanPlugin from "../../../main";
import {i18nHelper} from 'src/org/wanxp/lang/helper';
import {SupportType} from "../../../constant/Constsant";
import HandleContext from "../model/HandleContext";
import {UserStateSubject} from "../model/UserStateSubject";
import {DataField} from "../../../utils/model/DataField";
import DoubanPageParser from "../../../utils/DoubanPageParser";
import {DoubanHttpUtil} from "../../../utils/DoubanHttpUtil";
import StringUtil from "../../../utils/StringUtil";

/**
 * 影人详情。
 *
 * 列表给的是 celebrity id, 但内容页已经迁到 www.douban.com/personage/{personageId}/:
 * 请求 movie.douban.com/celebrity/{celebrityId}/ 会被 302 到豆瓣的安全验证页, 而验证页
 * 表单里的 red 字段就是人物页地址。所以这里是两跳 —— 跳板页取地址, 再请求人物页。
 * 验证本身提交后仍然返回验证页(实测), 所以不能用 DoubanHttpUtil 的自动解验证通道。
 */
export default class DoubanCelebrityLoadHandler extends DoubanAbstractLoadHandler<DoubanCelebritySubject> {

	constructor(doubanPlugin: DoubanPlugin) {
		super(doubanPlugin);
	}

	getSupportType(): SupportType {
		return SupportType.celebrity;
	}

	/**
	 * 人物页里没有「我看过/我想看」这类状态文案, 让同步守卫对影人不生效:
	 * 守卫用的是整页关键词, 而人物页会列出该影人的作品, 有命中的风险, 一旦命中整条会被跳过。
	 */
	protected getGuessType(data: CheerioAPI): SupportType {
		return null;
	}

	/**
	 * 影人头像的高清地址。
	 *
	 * 影视封面用的是 view/photo/l, 影人头像用的是 view/personage/{s|m|l}; 请求失败时外层会
	 * 自动回落到普通头像, 所以这里直接写 l。
	 */
	getHighQuantityImageUrl(fileName: string): string {
		return `https://img9.doubanio.com/view/personage/l/public/${fileName}`;
	}

	getSubjectUrl(id: string): string {
		return `https://movie.douban.com/celebrity/${id}/`;
	}

	/**
	 * 影人没有需要二次加工的字段: 性别/出生日期/出生地/职业/更多姓名/IMDb 都由父类按
	 * 字段类型自动进入变量表。
	 */
	parseVariable(beforeContent: string, variableMap: Map<string, DataField>, extract: DoubanCelebritySubject, context: HandleContext): void {
	}

	support(extract: DoubanSubject): boolean {
		return !!extract && extract.type == SupportType.celebrity;
	}

	/**
	 * 影人收藏没有评分/状态/评论, 因此永远没有用户状态。
	 */
	analysisUser(html: CheerioAPI, context: HandleContext): {data: CheerioAPI, userState: UserStateSubject} {
		return {data: html, userState: null};
	}

	/**
	 * 先请求 celebrity 详情页拿到跳板里的 red, 再请求人物页。
	 */
	protected async fetchSubjectHtml(id: string, url: string, context: HandleContext): Promise<string> {
		const headers = context.plugin.settingsManager.getHeaders();
		const landingPage = await DoubanHttpUtil.httpRequestGetRaw(url, headers, context.plugin.settingsManager);
		if (this.isPersonagePage(landingPage)) {
			// 没有触发验证, 拿到的就是人物页本身
			return landingPage;
		}
		const personageUrl = this.getPersonageUrl(landingPage);
		if (!personageUrl) {
			throw new Error(i18nHelper.getMessage('130114'));
		}
		return DoubanHttpUtil.httpRequestGetRaw(personageUrl, headers, context.plugin.settingsManager);
	}

	/**
	 * 从跳板页里取人物页地址。
	 *
	 * 优先读验证页表单的 red 字段(它就是验证通过后要去的地址), 其次退回到页面里出现的
	 * 第一个 personage 链接。
	 */
	private getPersonageUrl(html: string): string {
		const page = String(html || '');
		const redField = page.match(/name=["']red["'][^>]*value=["']([^"']+)["']/i);
		const candidate = redField
			? redField[1]
			: (page.match(/https?:\/\/www\.douban\.com\/personage\/\d+\/?/) || [])[0];
		return this.normalizePersonageUrl(candidate);
	}

	private isPersonagePage(html: string): boolean {
		return /class="subject-property"|class="subject-name"/.test(String(html || ''));
	}

	private normalizePersonageUrl(value: string): string {
		const personageId = String(value || '').match(/personage\/(\d+)/);
		return personageId ? `https://www.douban.com/personage/${personageId[1]}/` : '';
	}

	parseSubjectFromHtml(data: CheerioAPI, context: HandleContext, requestedId?: string): DoubanCelebritySubject {
		const personageUrl = this.normalizePersonageUrl(this.getMetaContent(data, 'og:url'));
		const properties = this.parseProperties(data);
		const image = data("img.avatar").first().attr("src") || this.getMetaContent(data, 'og:image') || '';
		let desc = DoubanPageParser.extractText(data, [
			"section.subject-intro div.desc div.content p",
			"section.subject-intro div.desc div.content",
			"section.subject-intro div.desc",
		]);
		if (!desc) {
			desc = DoubanPageParser.normalizeText(this.getMetaContent(data, 'og:description'));
		}
		const result: DoubanCelebritySubject = {
			// 增量记账与文件名用的是列表里的 celebrity id, 不是内容页的 personage id
			id: requestedId || StringUtil.analyzeIdByUrl(personageUrl),
			personageId: (personageUrl.match(/personage\/(\d+)/) || [])[1] || '',
			type: SupportType.celebrity,
			// 人物页的标题就是完整中英名(如「毛林林 Linlin Mao」), 取不到时退回 og:title
			title: this.getTitleAndOriginalTitle(
				data("h1.subject-name").first().text() || this.getMetaContent(data, 'og:title'),
				context,
			).title,
			image: image,
			imageUrl: image,
			url: personageUrl,
			desc: desc,
			score: null,
			publisher: '',
			datePublished: undefined,
			genre: [],
			gender: properties.get('gender') || '',
			birthday: this.parseBirthday(properties.get('birthday')),
			birthplace: properties.get('birthplace') || '',
			profession: properties.get('profession') || '',
			aliases: properties.get('aliases') || [],
			IMDb: properties.get('imdb') || '',
		};
		return result;
	}

	/**
	 * 人物页的字段表: ul.subject-property 下每条是 span.label + span.value。
	 */
	private parseProperties(data: CheerioAPI): Map<string, any> {
		const result = new Map<string, any>();
		data("ul.subject-property > li").each((_index, element) => {
			const item = data(element);
			const label = item.find("span.label").text().replace(/\s+/g, '');
			const value = DoubanPageParser.normalizeText(item.find("span.value").text());
			if (!label || !value) {
				return;
			}
			if (label.indexOf('更多中文名') >= 0 || label.indexOf('更多外文名') >= 0 || label.indexOf('别名') >= 0) {
				const names = value.split(/\s*\/\s*/).map(name => name.trim()).filter(name => name);
				result.set('aliases', Array.from(new Set([...(result.get('aliases') || []), ...names])));
			} else if (label.indexOf('性别') >= 0) {
				result.set('gender', value);
			} else if (label.indexOf('出生日期') >= 0) {
				result.set('birthday', value);
			} else if (label.indexOf('出生地') >= 0) {
				result.set('birthplace', value);
			} else if (label.indexOf('职业') >= 0) {
				result.set('profession', value);
			} else if (/^imdb/i.test(label)) {
				result.set('imdb', value);
			}
		});
		return result;
	}

	private getMetaContent(data: CheerioAPI, property: string): string {
		return String(data(`head > meta[property='${property}']`).attr('content') || '').trim();
	}

	/**
	 * 出生日期在页面上是中文本地化写法(如「1986年10月8日」), 也可能只精确到年月。
	 */
	private parseBirthday(value: string): Date {
		if (!value) {
			return null;
		}
		const parsed = moment(value, ['YYYY年M月D日', 'YYYY年M月', 'YYYY-MM-DD', 'YYYY/MM/DD'], true);
		return parsed.isValid() ? parsed.toDate() : null;
	}
}
