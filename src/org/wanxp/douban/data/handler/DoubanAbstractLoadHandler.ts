import DoubanPlugin from "../../../main";
import DoubanSubject, {DoubanParameterName} from '../model/DoubanSubject';
import DoubanSubjectLoadHandler from "./DoubanSubjectLoadHandler";
import {moment, Platform, TFile} from "obsidian";
import {i18nHelper} from 'src/org/wanxp/lang/helper';
import {log} from "src/org/wanxp/utils/Logutil";
import {CheerioAPI, load} from "cheerio";
import YamlUtil, {TITLE_ALIASES_SPECIAL_CHAR_REG_G} from "../../../utils/YamlUtil";
import {
	BasicConst,
	DataValueType,
	PersonNameMode,
	PropertyName,
	SearchHandleMode,
	SupportType,
	TemplateKey,
	TemplateTextMode
} from "../../../constant/Constsant";
import HandleContext from "../model/HandleContext";
import HandleResult from "../model/HandleResult";
import {getDefaultTemplateContent} from "../../../constant/DefaultTemplateContent";
import StringUtil from "../../../utils/StringUtil";
import {DEFAULT_SETTINGS} from "../../../constant/DefaultSettings";
import {DoubanUserParameter, DoubanUserParameterName, UserStateSubject} from "../model/UserStateSubject";
import {
	DoubanSubjectState,
	DoubanSubjectStateRecords,
	DoubanSubjectStateRecords_KEY_WORD_TYPE
} from "../../../constant/DoubanUserState";
import {Person} from "schema-dts";
import HttpUtil from "../../../utils/HttpUtil";
import HtmlUtil from "../../../utils/HtmlUtil";
import {VariableUtil} from "../../../utils/VariableUtil";
import {DataField} from "../../../utils/model/DataField";
import NumberUtil from "../../../utils/NumberUtil";
import {DoubanHttpUtil} from "../../../utils/DoubanHttpUtil";
import {logger} from "bs-logger";
import DoubanPageParser from "../../../utils/DoubanPageParser";

export default abstract class DoubanAbstractLoadHandler<T extends DoubanSubject> implements DoubanSubjectLoadHandler<T> {


	public doubanPlugin: DoubanPlugin;

	constructor(doubanPlugin: DoubanPlugin) {
		this.doubanPlugin = doubanPlugin;
	}

	async parse(extract: T, context: HandleContext): Promise<HandleResult> {
		const template: string = await this.getTemplate(extract, context);
		const variableMap = this.buildVariableMap(extract, context);
		this.parseUserInfo(template, variableMap, extract, context);
		this.parseVariable(template, variableMap, extract, context);
		await this.saveImage(extract, context, variableMap);

		const frontMatterStart: number = template.indexOf(BasicConst.YAML_FRONT_MATTER_SYMBOL, 0);
		const frontMatterEnd: number = template.indexOf(BasicConst.YAML_FRONT_MATTER_SYMBOL, frontMatterStart + 1);
		let frontMatter = '';
		let frontMatterBefore = '';
		let frontMatterAfter = '';
		let result = '';

		if (frontMatterStart > -1 && frontMatterEnd > -1) {
			frontMatterBefore = template.substring(0, frontMatterStart);
			frontMatter = template.substring(frontMatterStart, frontMatterEnd + 3);
			frontMatterAfter = template.substring(frontMatterEnd + 3);
			if (frontMatterBefore.length > 0) {
				frontMatterBefore = this.parsePartText(frontMatterBefore, extract, context, variableMap);
			}
			if (frontMatterAfter.length > 0) {
				frontMatterAfter = this.parsePartText(frontMatterAfter, extract, context, variableMap);
			}
			if (frontMatter.length > 0) {
				frontMatter = this.parsePartYml(frontMatter, extract, context, variableMap);
			}
			result = frontMatterBefore + frontMatter + frontMatterAfter;
		} else {
			result = this.parsePartText(template, extract, context, variableMap);
		}
		let filePath = '';
		if (SearchHandleMode.FOR_CREATE == context.mode) {
			filePath = this.parsePartPath(this.getFilePath(context), extract, context, variableMap);
		}
		let fileName = '';
		if (SearchHandleMode.FOR_CREATE == context.mode) {
			fileName = this.parsePartPath(this.getFileName(context), extract, context, variableMap);
		}
		return {content: result,filePath: filePath, fileName: fileName, subject:extract};
	}

	private getFileName(context: HandleContext): string {
		const {syncConfig} = context;
		if (syncConfig) {
			return syncConfig.dataFileNamePath;
		}
		const {dataFileNamePath} = context.settings;
		return dataFileNamePath ? dataFileNamePath : DEFAULT_SETTINGS.dataFileNamePath;
	}

	private getFilePath(context: HandleContext): string {
		const {syncConfig} = context;
		if (syncConfig) {
			return syncConfig.dataFilePath;
		}
		const {dataFilePath} = context.settings;
		return dataFilePath ? dataFilePath : DEFAULT_SETTINGS.dataFilePath;
	}





	abstract getSupportType(): SupportType;

	abstract parseVariable(beforeContent: string, variableMap:Map<string, DataField>, extract: T, context: HandleContext): void;

	abstract support(extract: DoubanSubject): boolean;

	/**
	 * 取详情页的 HTML。
	 *
	 * 默认直接请求 getSubjectUrl(id); 需要先过一次「跳板」的类型(影人)覆盖它。
	 * 抛出的错误由 handle 统一记为失败, 下次同步会重试。
	 */
	protected async fetchSubjectHtml(id: string, url: string, context: HandleContext): Promise<string> {
		return DoubanHttpUtil.httpRequestGet(url, context.plugin.settingsManager.getHeaders(), context.plugin.settingsManager);
	}

	async handle(id: string, context: HandleContext): Promise<T> {
		const url:string = this.getSubjectUrl(id);
		if (context.plugin.settingsManager.isDebug()) {
			context.plugin.settingsManager.debug(`开始请求地址:${url}`)
			context.plugin.settingsManager.debug(`(注意:请勿向任何人透露你的Cookie,此处若需要截图请**打码**)请求header:${context.settings.loginHeadersContent}`)
		}
		return await this.fetchSubjectHtml(id, url, context)
			.then(load)
			.then(data => this.analysisUserState(data, context))
			.then(({data, userState}) => {
				let guessType = this.getSupportType();
				if (context.syncActive) {
					guessType = this.getGuessType(data);
				}
				const sub = this.parseSubjectFromHtml(data, context, id);
				if (!sub || !String(sub.id || '').trim() || !String(sub.title || '').trim()) {
					throw new Error(i18nHelper.getMessage('130113'));
				}
				sub.userState = userState;
				sub.guessType = guessType;
				return sub;
			})
			.then(content => this.toEditor(context, content))
			// .then(content => content ? editor.replaceSelection(content) : content)
			.catch(e =>  {
				log.error(i18nHelper.getMessage('130101',  e.toString()), e);
				if (url) {
					const id = StringUtil.analyzeIdByUrl(url);
					context.syncStatusHolder?context.syncStatusHolder.syncStatus.fail(id, ''):null;
				}else {
					context.syncStatusHolder?context.syncStatusHolder.syncStatus.handled(1):null;
				}
				return undefined;
			});


	}

	/**
	 * 通过判断 data中是否包含关键字符串 “我看过的电视剧” 判断是不是 movie
	 *
	 * 同步时用它给条目定类型, 与解析出的 type 不一致就跳过(见 putToObsidian)。
	 * 详情页里没有任何状态文案的类型要覆盖它返回 null —— 守卫的判据是
	 * `guessType && ...`, 返回 null 即等于「该类型不参与守卫」。
	 * @param data
	 * @protected
	 */
	protected getGuessType(data: CheerioAPI):SupportType {
		if (data) {
			const text = data.html();
			if (text) {
				for (const [key, value] of DoubanSubjectStateRecords_KEY_WORD_TYPE) {
					if (text.indexOf(key) >= 0) {
						return value;
					}
				}
			}
		}
		return null;
	}


	/**
	 * 从详情页解析条目。
	 *
	 * @param data 详情页
	 * @param context 处理上下文
	 * @param requestedId 调用方请求时使用的条目 id。
	 *        多数类型的详情页自己能给出 id; 影人不行 —— 列表给的是 celebrity id,
	 *        内容页却是 personage id, 而增量记账用的必须是列表里的那个 id。
	 */
	abstract parseSubjectFromHtml(data: CheerioAPI, context: HandleContext, requestedId?: string): T | undefined;

	async toEditor(context: HandleContext, extract: T): Promise<T> {
		await this.doubanPlugin.putToObsidian(context, extract);
		return extract;
	}

	getPersonName(name: string, context: HandleContext): string {
		return this.getPersonNameByMode(name, context.settings.personNameMode);
	}

	getPersonName2(originalName: string, chineseName: string, context: HandleContext): string {
		return this.getPersonNameByMode2(originalName, chineseName, context.settings.personNameMode);
	}


	getPersonNameByMode2(originalName: string, chineseName: string, personNameMode: string): string {
		if (!originalName || !personNameMode) {
			return "";
		}
		let resultName: string;
		switch (personNameMode) {
			case PersonNameMode.CH_NAME:
				resultName = chineseName;
				break;
			case PersonNameMode.EN_NAME:
				resultName  = originalName.trim().replace(chineseName, '').trim();
				if (!resultName) {
					resultName = originalName;
				}
				break;
			default:
				resultName = originalName;
		}
		return resultName;
	}


	getPersonNameByMode(name: string, personNameMode: string): string {
		if (!name || !personNameMode) {
			return "";
		}
		let resultName: string;
		let regValue: RegExpExecArray;
		switch (personNameMode) {
			case PersonNameMode.CH_NAME:
				regValue = /[\u4e00-\u9fa50-9. ·:\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5()]{2,}/g.exec(name);
				resultName = regValue ? regValue[0] : name;
				break;
			case PersonNameMode.EN_NAME:
				regValue = /[0-9a-zA-Z.\s-:]{2,}/g.exec(name);
				resultName = regValue ? regValue[0] : name;
				break;
			default:
				resultName = name;
		}
		return resultName.trim();
	}

	/**
	 * 汉字字符:中日韩统一表意文字及其扩展区、兼容区。
	 */
	private static readonly CJK_CHAR_REG = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

	/**
	 * 原名首尾需要清理的标点以及空白。
	 */
	private static readonly TITLE_EDGE_PUNCTUATION_REG =
		/^[\s:：,，.。;；!！?？~～|/·"'“”‘’()（）\[\]【】\-–—_]+|[\s:：,，.。;；!！?？~～|/·"'“”‘’()（）\[\]【】\-–—_]+$/g;

	/**
	 * 计算笔记标题与原名。
	 *
	 * 豆瓣 JSON-LD 的 name 通常是「中文名 英文名」的形式(如「飞屋环游记 Up」)。
	 * 旧实现用「人名正则」从 name 中抽取中文段作为 title,导致名称里的英文字母
	 * 从标题和笔记文件名中消失;中英之间夹着标点时还会把标题切剩一个「:」。
	 *
	 * 现在的规则:
	 * <li>title 保留完整名称(中英都保留),名称统一压缩成单空格;name 缺失时回退搜索结果标题</li>
	 * <li>originalTitle 取剔除中文段后的原名,只有中文段与非中文段之间存在空白分隔时
	 * 才切分,切分结果为空或只剩标点时回退完整名称</li>
	 *
	 * @param name 详情页解析出的名称
	 * @param context 处理上下文,用于在 name 缺失时回退 listItem
	 */
	getTitleAndOriginalTitle(name: string, context: HandleContext): {title: string, originalTitle: string} {
		// 详情页 h1 等来源会带换行与缩进,标题统一压缩成单空格再使用
		const fullName = [name, context?.listItem?.title]
			.map(value => String(value || '').replace(/\s+/g, ' ').trim())
			.find(value => value) || '';
		if (!fullName) {
			return {title: '', originalTitle: ''};
		}
		return {title: fullName, originalTitle: this.extractOriginalTitle(fullName)};
	}

	/**
	 * 从完整名称中取出「原名」部分,即剔除中文段后的非中文内容。
	 *
	 * 名称只有中文段或只有非中文段时不做切分,直接返回完整名称;
	 * 剔除后只剩标点(如「东京物语 —」里的「—」)时同样回退完整名称。
	 *
	 * @param fullName 完整名称
	 */
	private extractOriginalTitle(fullName: string): string {
		const words = fullName.split(/\s+/).filter(word => word);
		if (words.length < 2) {
			return fullName;
		}
		const chineseWords = words.filter(word => DoubanAbstractLoadHandler.CJK_CHAR_REG.test(word));
		if (chineseWords.length == 0 || chineseWords.length == words.length) {
			return fullName;
		}
		const originalTitle = words
			.filter(word => !DoubanAbstractLoadHandler.CJK_CHAR_REG.test(word))
			.join(' ')
			.replace(DoubanAbstractLoadHandler.TITLE_EDGE_PUNCTUATION_REG, '')
			.trim();
		const hasContent = /[0-9A-Za-z]/.test(originalTitle) || /[^\x00-\x7F]/.test(originalTitle);
		return hasContent ? originalTitle : fullName;
	}

	// html_encode(str: string): string {
	// 	let s = "";
	// 	if (str.length == 0) return "";
	// 	s = str.replace(/&/g, "&amp;");
	// 	s = s.replace(/</g, "&lt;");
	// 	s = s.replace(/>/g, "&gt;");
	// 	s = s.replace(/ /g, "&nbsp;");
	// 	s = s.replace(/\'/g, "&#39;");
	// 	s = s.replace(/\"/g, "&quot;");
	// 	s = s.replace(/\n/g, "<br/>");
	// 	return s;
	// }

	html_decode(str: string): string {
		let s = "";
		if (str.length == 0) return "";
		s = str.replace(/&amp;/g, "&");
		s = s.replace(/&lt;/g, "<");
		s = s.replace(/&gt;/g, ">");
		s = s.replace(/&nbsp;/g, " ");
		s = s.replace(/&#39;/g, "'");
		s = s.replace(/&quot;/g, "\"");
		s = s.replace(/<br\/>/g, "\n");
		return s;
	}

	private parsePartYml(template: string, extract: T, context: HandleContext,  variableMap : Map<string, DataField>): string {
		return VariableUtil.replaceSubject(variableMap, template, this.getSupportType(), this.doubanPlugin.settingsManager, 'yml_text');
	}

	private parsePartText(template: string, extract: T, context: HandleContext,  variableMap : Map<string, DataField>): string {
		return VariableUtil.replaceSubject(variableMap, template, this.getSupportType(), this.doubanPlugin.settingsManager, 'text');
	}

	private parsePartPath(template: string, extract: T, context: HandleContext,  variableMap : Map<string, DataField>): string {
		return VariableUtil.replaceSubject(variableMap, template, this.getSupportType(), this.doubanPlugin.settingsManager, 'path');
	}

	private buildVariableMap(extract: T, context: HandleContext) {
		extract.desc = DoubanPageParser.normalizeText(extract.desc);
		const variableMap: Map<string, DataField> = new Map();
		for (const [key, value] of Object.entries(extract)) {
			if (!value) {
				continue;
			}
			const type: DataValueType = VariableUtil.getType(value);
			if (key == 'score') {
				variableMap.set(DoubanParameterName.SCORE_STAR, new DataField(
					DoubanParameterName.SCORE_STAR,
					DataValueType.string,
					value,
					NumberUtil.getRateStar(value, 10, {scoreSetting: context.settings.scoreSetting})
				));
			}
			variableMap.set(key, new DataField(key, type, value, value));
		}
		variableMap.set(DoubanParameterName.IMAGE_URL, new DataField(
			DoubanParameterName.IMAGE_URL,
			DataValueType.url,
			extract.imageUrl,
			extract.imageUrl
		));
		const imageName = this.getImageBasename(extract.image);
		variableMap.set(DoubanParameterName.IMAGE_NAME, new DataField(
			DoubanParameterName.IMAGE_NAME,
			DataValueType.string,
			imageName,
			imageName,
		));
		variableMap.set(DoubanParameterName.YEAR_PUBLISHED, new DataField(
			DoubanParameterName.YEAR_PUBLISHED,
			DataValueType.date,
			extract.datePublished,
			extract.datePublished ? moment(extract.datePublished).format('yyyy') : ''
		));
		variableMap.set(DoubanParameterName.DATE_PUBLISHED, new DataField(
			DoubanParameterName.DATE_PUBLISHED,
			DataValueType.date,
			extract.datePublished,
			extract.datePublished ? moment(extract.datePublished).format(context.settings.dateFormat) : ''
		));
		variableMap.set(DoubanParameterName.TIME_PUBLISHED, new DataField(
			DoubanParameterName.TIME_PUBLISHED,
			DataValueType.date,
			extract.datePublished,
			extract.datePublished ? moment(extract.datePublished).format(context.settings.timeFormat) : ''
		));
		const currentDate = new Date();
		variableMap.set(DoubanParameterName.CURRENT_DATE, new DataField(
			DoubanParameterName.CURRENT_DATE,
			DataValueType.date,
			currentDate,
			moment(currentDate).format(context.settings.dateFormat)
		));
		variableMap.set(DoubanParameterName.CURRENT_TIME, new DataField(
			DoubanParameterName.CURRENT_TIME,
			DataValueType.date,
			currentDate,
			moment(currentDate).format(context.settings.timeFormat)
		));
		return variableMap;
	}

	private parseUserInfo(resultContent: string, variableMap:Map<string, DataField>, extract: T, context: HandleContext) {
		const userState = extract.userState;
		if ((resultContent.indexOf(DoubanUserParameter.MY_TAGS) >= 0 ||
			resultContent.indexOf(DoubanUserParameter.MY_RATING) >= 0 ||
			resultContent.indexOf(DoubanUserParameter.MY_STATE) >= 0 ||
			resultContent.indexOf(DoubanUserParameter.MY_COMMENT) >= 0 ||
			resultContent.indexOf(DoubanUserParameter.MY_COLLECTION_DATE) >= 0 ) && !this.doubanPlugin.userComponent.isLogin()) {
			log.warn(i18nHelper.getMessage('100113'));
			return resultContent;
		}
		if (!userState) {
			return resultContent;
		}
		let tags: string[] = [];
		if (userState.tags && userState.tags.length > 0 ) {
			tags = [extract.type, ...userState.tags.map(tag => tag.trim())];
		}else {
			tags = [extract.type];
		}
		Object.entries(userState).forEach(([key, value]) => {
			if (!value) {
				return;
			}
			variableMap.set(key, new DataField(key, VariableUtil.getType(value), value, value));
		});
		if (userState.tags && userState.tags.length > 0 ) {
			variableMap.set(DoubanUserParameterName.MY_TAGS, new DataField(DoubanUserParameterName.MY_TAGS, DataValueType.array, tags, tags));
		}
		if (userState.comment) {
			variableMap.set(DoubanUserParameterName.MY_COMMENT, new DataField(
				DoubanUserParameterName.MY_COMMENT,
				DataValueType.string,
				userState.comment,
				userState.comment
			));
		}
		if (userState.state) {
			variableMap.set(DoubanUserParameterName.MY_STATE, new DataField(
				DoubanUserParameterName.MY_STATE,
				DataValueType.string,
				userState.state,
				userState.stateName || this.getUserStateName(userState.state)
			));
		}
		if (userState.rate) {
			variableMap.set(DoubanUserParameterName.MY_RATING, new DataField(
				DoubanUserParameterName.MY_RATING,
				DataValueType.number,
				userState.rate,
				userState.rate)
			);
			variableMap.set(DoubanUserParameterName.MY_RATING_STAR, new DataField(
				DoubanUserParameterName.MY_RATING_STAR,
				DataValueType.string,
				userState.rate,
				NumberUtil.getRateStar(userState.rate, 5, {scoreSetting: context.settings.scoreSetting})
			));
		}
		if (userState.collectionDate) {
			variableMap.set(DoubanUserParameterName.MY_COLLECTION_DATE, new DataField(
				DoubanUserParameterName.MY_COLLECTION_DATE,
				DataValueType.date,
				userState.collectionDate,
				userState.collectionDate ? moment(userState.collectionDate).format(context.settings.dateFormat) : ''
			));
		}

	}



	private getTemplateKey():TemplateKey {
		let templateKey: TemplateKey;
		switch (this.getSupportType()) {
			case SupportType.movie:
				templateKey = TemplateKey.movieTemplateFile;
				break;
			case SupportType.book:
				templateKey = TemplateKey.bookTemplateFile;
				break;
			case SupportType.music:
				templateKey = TemplateKey.musicTemplateFile;
				break;
			case SupportType.teleplay:
				templateKey = TemplateKey.teleplayTemplateFile;
				break;
			case SupportType.game:
				templateKey = TemplateKey.gameTemplateFile;
				break;
			case SupportType.note:
				templateKey = TemplateKey.noteTemplateFile;
				break;
			case SupportType.theater:
				templateKey = TemplateKey.theaterTemplateFile;
				break;
			default:
				templateKey = null;

		}
		return templateKey;
	}

	private async getTemplate(extract: T, context: HandleContext): Promise<string> {
		const {syncConfig} = context;
		if (syncConfig) {
			if(syncConfig.templateFile) {
				const val = await this.doubanPlugin.fileHandler.getFileContent(syncConfig.templateFile);
				if (val) {
					return val;
				}
			}
		}
		const tempKey: TemplateKey = this.getTemplateKey();
		const templatePath: string = context.settings[tempKey];
		let useUserState:boolean = context.userComponent.isLogin() &&
			extract.userState &&
			extract.userState.collectionDate != null  &&
			extract.userState.collectionDate != undefined;

		useUserState = useUserState ? useUserState : false;

		// @ts-ignore
		if (!templatePath || StringUtil.isBlank(templatePath)) {
			return getDefaultTemplateContent(tempKey, useUserState);
		}
		const defaultContent = getDefaultTemplateContent(tempKey, useUserState);
		const firstLinkpathDest: TFile = this.doubanPlugin.app.metadataCache.getFirstLinkpathDest(templatePath, '');
		if (!firstLinkpathDest) {
			return defaultContent;
		} else {
			const val = await this.doubanPlugin.fileHandler.getFileContent(firstLinkpathDest.path);
			return val ? val : defaultContent;
		}
	}

	analysisUserState(html: CheerioAPI, context: HandleContext): {data:CheerioAPI ,  userState: UserStateSubject} {
		if (!context.userComponent.isLogin()) {
			return {data: html, userState: null};
		}
		if(!html('.nav-user-account')) {
			return {data: html, userState: null};
		}
		return this. analysisUser(html, context);
	}

	abstract analysisUser(html: CheerioAPI, context: HandleContext): {data:CheerioAPI ,  userState: UserStateSubject};


	public static getUserState(stateWord:string):DoubanSubjectState {
		let state:DoubanSubjectState;
		if(!stateWord) {
			return null;
		}
		if(stateWord.indexOf('想')>=0 ) {
			state = DoubanSubjectState.wish;
		}else if(stateWord.indexOf('在')>=0) {
			state = DoubanSubjectState.do;
		}else if(stateWord.indexOf('过')>=0) {
			state = DoubanSubjectState.collect;
		}else {
			state = DoubanSubjectState.not;
		}
		return state;

	}

	private getUserStateName(state: DoubanSubjectState): string {
		if (!state) {
			return '';
		}
		const v = DoubanSubjectStateRecords[this.getSupportType()];
		switch (state) {
			case DoubanSubjectState.wish:
				return v.wish;
			case DoubanSubjectState.do:
				return v.do;
			case DoubanSubjectState.collect:
				return v.collect;
			case DoubanSubjectState.not:
				return v.not;
			default:
				return '';
		}
	}

	private async saveImage(extract: T, context: HandleContext, variableMap : Map<string, DataField>) {
		const {syncConfig} = context;
		if (!extract.image || (syncConfig && !syncConfig.cacheImage)  || !context.settings.cacheImage) {
			return;
		}
		const image = extract.image;
		let folder = syncConfig? syncConfig.attachmentPath : context.settings.attachmentPath;
		if (!folder) {
			folder = DEFAULT_SETTINGS.attachmentPath;
		}
		folder = this.parsePartPath(folder, extract, context, variableMap)
		let fileName = syncConfig? syncConfig.attachmentFileName : context.settings.attachmentFileName;
		if (!fileName) {
			fileName = DEFAULT_SETTINGS.attachmentFileName;
		}
		let fileNameSuffix = image ? image.substring(image.lastIndexOf('.')) : '.jpg';
		if (fileNameSuffix && fileNameSuffix.length > 10) {
			fileNameSuffix = '.jpg';
		}
		fileName = this.parsePartPath(fileName, extract, context, variableMap)
		fileName = fileName + fileNameSuffix;
		const imageReferer = (extract.id ? this.getSubjectUrl(extract.id) : '') || extract.url;
		const referHeaders = HttpUtil.buildImageRequestHeaders(
			context.plugin.settingsManager.getHeaders() as Record<string, any>,
			imageReferer
		);
		if ((syncConfig ? syncConfig.cacheHighQuantityImage : context.settings.cacheHighQuantityImage) && context.userComponent.isLogin()) {
			try {
				const highImageFilename = this.getImageFilename(image);
				const highImage = this.getHighQuantityImageUrl(highImageFilename);
				const highImageHeaders = HttpUtil.buildImageRequestHeaders(
					context.plugin.settingsManager.getHeaders() as Record<string, any>,
					imageReferer
				);
				const resultValue = await this.handleImage(highImage, folder, fileName, context, false, highImageHeaders);
				if (resultValue && resultValue.success) {
					extract.image = resultValue.filepath;
					this.initImageVariableMap(extract, context, variableMap);
					return;
				}
			}catch (e) {
				console.error(e);
				console.error('下载高清封面失败，将会使用普通封面')
			}
		}
		const resultValue = await this.handleImage(image, folder, fileName, context, true, referHeaders);
		if (resultValue && resultValue.success) {
			extract.image = resultValue.filepath;
			this.initImageVariableMap(extract, context, variableMap);
		}
	}

	private getImageFilename(image: string): string {
		if (!image) {
			return '';
		}
		const imageUrl = image.split('?').first() || image;
		return imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
	}

	private initImageVariableMap(extract: T, context: HandleContext, variableMap : Map<string, DataField>) {
		variableMap.set(DoubanParameterName.IMAGE_URL, new DataField(
			DoubanParameterName.IMAGE_URL,
			DataValueType.url,
			extract.imageUrl,
			extract.imageUrl
		));
		variableMap.set(DoubanParameterName.IMAGE, new DataField(
			DoubanParameterName.IMAGE,
			DataValueType.path,
			extract.image,
			extract.image
		));
		const imageName = this.getImageBasename(extract.image);
		variableMap.set(DoubanParameterName.IMAGE_NAME, new DataField(
			DoubanParameterName.IMAGE_NAME,
			DataValueType.string,
			imageName,
			imageName,
		));

	}

	private getImageBasename(image: string): string {
		if (!image) {
			return '';
		}
		const cleanPath = image.split(/[?#]/, 1)[0].replace(/\\/g, '/');
		return cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
	}

	private async handleImage(image: string, folder: string, filename: string, context: HandleContext, showError: boolean, headers?: any) {
		//只有在桌面版且开启了图片上传才会使用PicGo，并且开启图床功能
		if (context.settings.pictureBedFlag && Platform.isDesktopApp) {
			//临时限定只支持PicGo
			const checked = await context.netFileHandler.downloadDBUploadPicGoByClipboardBefore(context);
			if (!checked) {
				//TODO 国际化
				log.notice('连接PicGo软件失败, 请检查是否已开启PicGo的Server服务 或 检查插件中配置地址是否正确，现使用默认的下载到本地的方式');
				return  await context.netFileHandler.downloadDBFile(image, folder, filename, context, false, headers);
			}
			return await context.netFileHandler.downloadDBUploadPicGoByClipboard(image, filename, context, showError, headers);
		}else {
			return  await context.netFileHandler.downloadDBFile(image, folder, filename, context, false, headers);
		}

	}

	abstract getHighQuantityImageUrl(fileName:string):string;

	abstract getSubjectUrl(id:string):string;

	handlePersonNameByMeta(html: CheerioAPI, movie: DoubanSubject, context: HandleContext,
								   metaProperty:string, objectProperty:string) {
		if (!movie) {
			return;
		}
		const metaProperties: string[] = html(`head > meta[property='${metaProperty}']`).get()
			.map((e) => {
				return html(e).attr('content');
			});
		// @ts-ignore
		const currentArray = movie[objectProperty];
		if (!Array.isArray(currentArray)) {
			return;
		}
		// @ts-ignore
		currentArray
			// @ts-ignore
			.filter((p:Person) => p.name)
			// @ts-ignore
			.map((p:Person) => {
				// @ts-ignore
				const persons = metaProperties.filter((a) => p.name.indexOf(a) >= 0);
				if (persons) {
					// @ts-ignore
					p.name = this.getPersonName2(p.name, persons[0], context);
				}
			})
	}


	protected getPropertyValue(html: CheerioAPI, name: PropertyName): string {
		return HtmlUtil.getHtmlText(html, this.doubanPlugin.settingsManager.getSelector(this.getSupportType(), name));
	}




}
