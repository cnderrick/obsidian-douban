import {i18nHelper} from "../lang/helper";
import DoubanSearchResultSubject from "../douban/data/model/DoubanSearchResultSubject";
import StringUtil from "../utils/StringUtil";
import {DoubanPluginOnlineSettings} from "../douban/setting/model/DoubanPluginOnlineSettings";
import {DataField} from "../utils/model/DataField";

/**
 * 常量池
 */
export const BasicConst = {
	YAML_FRONT_MATTER_SYMBOL: '---',
	/**
	 * 状态栏显示毫秒数
	 */
	CLEAN_STATUS_BAR_DELAY: 5000,
	/**
	 * 条目与翻页之间的等待下限, 单位毫秒
	 */
	CALL_DOUBAN_DELAY: 1000,
	/**
	 * 等待的随机浮动范围, 单位毫秒;
	 * 实际等待 = [CALL_DOUBAN_DELAY, CALL_DOUBAN_DELAY + CALL_DOUBAN_DELAY_RANGE] = 1-2 秒
	 */
	CALL_DOUBAN_DELAY_RANGE: 1000,

}

/**
 * 预估程序处理时间长度
 * @private
 */
export const ESTIMATE_TIME_PER: number = 2000;

/**
 * 预估每次请求+处理时间长度(正常模式)
 * @private
 */
export const ESTIMATE_TIME_PER_WITH_REQUEST: number = ESTIMATE_TIME_PER + BasicConst.CALL_DOUBAN_DELAY + BasicConst.CALL_DOUBAN_DELAY_RANGE / 2;


/**
 * 模板类型
 */
export enum TemplateTextMode {
	NORMAL,
	YAML,
}

/**
 * 搜索结果处理模式
 */
export enum SearchHandleMode {
	/**
	 * 为了替换当前文档
	 */
	FOR_REPLACE,
	/**
	 * 为了创建文档
	 */
	FOR_CREATE,
}

/**
 * 名称模式
 */
export enum PersonNameMode {
	CH_NAME = "CH",
	EN_NAME = "EN",
	CH_EN_NAME = "CH_EN",
}

/**
 * 模板的key
 *
 */
export enum TemplateKey {
	movieTemplateFile = 'movieTemplateFile',
	bookTemplateFile = 'bookTemplateFile',
	musicTemplateFile = 'musicTemplateFile',
	noteTemplateFile = 'noteTemplateFile',
	gameTemplateFile = 'gameTemplateFile',
	teleplayTemplateFile = 'teleplayTemplateFile',
	theaterTemplateFile = 'theaterTemplateFile',
	celebrityTemplateFile = 'celebrityTemplateFile',
}

export enum SupportType {
	all = "all",
	movie = 'movie',
	book = 'book',
	music = 'music',
	note = 'note',
	game = 'game',
	teleplay = 'teleplay',
	theater = 'theater',
	celebrity = 'celebrity',
}
export const SupportTypeMap:object = {
	"all": SupportType.all,
	"movie": SupportType.movie,
	"book": SupportType.book,
	"music": SupportType.music,
	"note": SupportType.note,
	"game": SupportType.game,
	"teleplay": SupportType.teleplay,
	"theater": SupportType.theater,
	"celebrity": SupportType.celebrity,
	"ALL": SupportType.all,
	"MOVIE": SupportType.movie,
	"BOOK": SupportType.book,
	"MUSIC": SupportType.music,
	"NOTE": SupportType.note,
	"GAME": SupportType.game,
	"TELEPLAY": SupportType.teleplay,
	"THEATER": SupportType.theater,
	"CELEBRITY": SupportType.celebrity,
}


export enum PropertyName {
	//base
	id = "id",
	title = "title",
	type = "type",
	score = "score",
	image = "image",
	imageUrl = "imageUrl",
	url = "url",
	desc = "desc",
	publisher = "publisher",
	datePublished = "datePublished",
	genre = "genre",

	//user
	tags = "tags",
	rate = "rate",
	state = "state",
	collectionDate = "collectionDate",
	comment = "comment",


	//book
	author = "author",
	translator = "translator",
	isbn = "isbn",
	originalTitle = "originalTitle",
	subTitle = "subTitle",
	totalPage = "totalPage",
	series = "series",
	menu = "menu",
	price = "price",
	binding = "binding",
	producer = "producer",

	//movie
	director = "director",
	actor = "actor",
	aggregateRating = "aggregateRating",
	aliases = "aliases",
	country = "country",
	language = "language",
	time = "time",
	IMDb = "IMDb",

	//music
	albumType = "albumType",
	medium = "medium",
	records = "records",
	barcode = "barcode",

	//game
	platform = "platform",
	developer = "developer",


	//teleplay
	episode = "episode",

	//celebrity
	gender = "gender",
	birthday = "birthday",
	birthplace = "birthplace",
	profession = "profession",
	personageId = "personageId",

	//theater


	//note
	authorUrl = "authorUrl",
	content = "content",
}

/**
 * 名称模式选项
 */
// @ts-ignore
function dynamicI18nRecord(entries: Record<string, string>): Record<string, string> {
	const result: Record<string, string> = {};
	Object.entries(entries).forEach(([key, messageKey]) => {
		Object.defineProperty(result, key, {
			enumerable: true,
			get: () => i18nHelper.getMessage(messageKey),
		});
	});
	return result;
}

function dynamicSubjectTitle<T extends {title: string}>(subject: T, messageKey: string): T {
	Object.defineProperty(subject, 'title', {
		enumerable: true,
		get: () => i18nHelper.getMessage(messageKey),
	});
	return subject;
}

/**
 * 搜索类型选项。
 *
 * 影人(celebrity)故意不在这里: 搜索接口的影视类目(cat=1002)把影人和作品混在一起,
 * 插件没有按人过滤的入口, 放进来只会多出一个点了会报错的选项。影人只通过同步接入。
 */
export const SearchTypeRecords: { [key in SupportType | string]: string } = dynamicI18nRecord({
	[SupportType.all]: 'ALL',
	[SupportType.movie]: 'MOVIE_AND_TELEPLAY',
	[SupportType.book]: 'BOOK',
	[SupportType.music]: 'MUSIC',
	[SupportType.note]: 'NOTE',
	[SupportType.game]: 'GAME',
	[SupportType.theater]: 'THEATER',
}) as { [key in SupportType | string]: string };

/**
 * 名称模式选项
 */
export const PersonNameModeRecords: { [key in PersonNameMode]: string } = dynamicI18nRecord({
	[PersonNameMode.CH_NAME]: '121206',
	[PersonNameMode.EN_NAME]: '121207',
	[PersonNameMode.CH_EN_NAME]: '121208',
}) as { [key in PersonNameMode]: string };

export enum SyncType {
	movie = 'movie',
	book = 'book',
	game = 'game',
	broadcast = 'broadcast',
	note = 'note',
	music = 'music',
	teleplay = 'teleplay',
	celebrity = 'celebrity'
}

export const SyncTypeUrlDomain: Map<SyncType, string> = new Map([
	[SyncType.movie , 'movie'],
	[SyncType.book , 'book'],
	[SyncType.broadcast , 'broadcast'],
	[SyncType.note , 'note'],
	[SyncType.music , 'music'],
	[SyncType.teleplay , 'movie'],
	[SyncType.game, 'games'],
	[SyncType.celebrity, 'movie'],
	]
)

/**
 * 同步模式选项
 */
// @ts-ignore
export const SyncTypeRecords: { [key in SyncType | string]: string } = dynamicI18nRecord({
	[SyncType.movie]: '504103',
	[SyncType.teleplay]: '504107',
	[SyncType.book]: '504102',
	// [SyncType.broadcast]: i18nHelper.getMessage('504104'),
	// [SyncType.note]: i18nHelper.getMessage('504105'),
	[SyncType.music]: '504106',
	[SyncType.game]: '504108',
	[SyncType.celebrity]: '504109',
});

/**
 * 同步豆瓣每页的大小
 */
export const PAGE_SIZE: number = 30;

/**
 * 我收藏的影人列表每页 15 条(其余同步列表都是 30 条)。
 * 分页偏移与页号换算必须用它, 否则从第 2 页起就会错位。
 */
export const CELEBRITY_PAGE_SIZE: number = 15;

/**
 * 动作
 */
export enum Action {
	SearchAndReplace = 'SearchAndReplace',
	SearchAndCrate = 'SearchAndCrate',
	Sync = 'Sync',
	SearchEditorAndReplace = 'SearchEditorAndReplace'
}

export enum SyncItemStatus {
	exists = 'exists',
	replace = 'replace',
	create = 'create',
	fail = 'fail',
	failByDiffType = 'failByDiffType',
	unHandle = 'unHandle',
}

export enum NavigateType {
	previous = "previous",
	next = "next",

	nextNeedLogin = "nextNeedLogin"
}

export const DoubanSearchResultSubjectPreviousPage: DoubanSearchResultSubject = dynamicSubjectTitle({
	cast: "",
	datePublished: undefined,
	desc: "",
	genre: [],
	id: "",
	image: "",
	imageUrl: "",
	publisher: "",
	score: 0,
	title: "",
	type: "navigate",
	url: NavigateType.previous
}, "150102");

export const DoubanSearchGroupPublishResultSubjectPreviousPage: DoubanSearchResultSubject = dynamicSubjectTitle({
	cast: "",
	datePublished: undefined,
	desc: "",
	genre: [],
	id: "",
	image: "",
	imageUrl: "",
	publisher: "",
	score: 0,
	title: "",
	type: "navigate",
	url: NavigateType.previous
}, "150106");

export const DoubanSearchGroupPublishResultSubjectNextPage: DoubanSearchResultSubject = dynamicSubjectTitle({
	cast: "",
	datePublished: undefined,
	desc: "",
	genre: [],
	id: "",
	image: "",
	imageUrl: "",
	publisher: "",
	score: 0,
	title: "",
	type: "navigate",
	url: NavigateType.next
}, "150105");

export const DoubanSearchResultSubjectNextPage: DoubanSearchResultSubject = dynamicSubjectTitle({
	cast: "",
	datePublished: undefined,
	desc: "",
	genre: [],
	id: "",
	image: "",
	imageUrl: "",
	publisher: "",
	score: 0,
	title: "",
	type: "navigate",
	url: NavigateType.next
}, "150103");

export const DoubanSearchResultSubjectNextPageNeedLogin: DoubanSearchResultSubject = dynamicSubjectTitle({
	cast: "",
	datePublished: undefined,
	desc: "",
	genre: [],
	id: "",
	image: "",
	imageUrl: "",
	publisher: "",
	score: 0,
	title: "",
	type: "navigate",
	url: NavigateType.nextNeedLogin
}, "150104");

export const SEARCH_ITEM_PAGE_SIZE: number = 20;

/**
 * 豆瓣默认请求头
 * @type {string}
 **/
export const DEFAULT_DOUBAN_HEADERS = StringUtil.parseHeaders(`
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Accept-Language: zh-CN,zh;q=0.9
Cache-Control: max-age=0
Connection: keep-alive
Host: www.douban.com
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: none
Sec-Fetch-User: ?1
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36
sec-ch-ua: "Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "Windows"
`)

/**
 * 同步的默认并发数: 1 表示完全串行, 与历史行为一致。
 * 调高后每个条目的等待仍保留, 只是让多个条目的等待与请求重叠, 请求会更密,
 * 触发豆瓣风控的风险也随之上升。
 */
export const SYNC_CONCURRENCY_DEFAULT: number = 1;

/**
 * 同步并发数的上限
 */
export const SYNC_CONCURRENCY_MAX: number = 5;

/**
 * 属性设置
 */
export const ONLINE_SETTING_DEFAULT: DoubanPluginOnlineSettings = {
	properties: [
		{
			type: SupportType.book,
			name: PropertyName.comment,
			selectors: ['#interest_sect_level > div > span:nth-child(7)'
			]
		},
		{
			type: SupportType.movie,
			name: PropertyName.comment,
			selectors: ['#interest_sect_level > div > span:nth-child(8)',
				'#interest_sect_level > div > span:nth-child(7)',
				'#interest_sect_level > div > span:nth-child(9)'
			]
		}
	]
}

/**
 * 处理状态
 */
export enum SubjectHandledStatus {
	init = 'init',
	saved = 'saved',
	syncTypeDiffAbort = 'syncTypeDiffAbort',
}

export const DEFAULT_SETTINGS_ARRAY_INPUT_SIZE = 2;


export enum DataValueType {
	date,
	number,
	string,
	person,
	array,
	url,
	path,
}

export enum DataTargetType {
	fileName,
	yaml,
	content,
}

export const EXAMPLE_RATE = 8.5;
export const EXAMPLE_RATE_MAX = 10;

export const EXAMPLE_SUBJECT_MAP: Map<string, DataField> = new Map([
	["id", new DataField("id", DataValueType.string, DataValueType.string, "2253379")],
	["title", new DataField("title", DataValueType.string, DataValueType.string, "简爱")],
	["type", new DataField("type", DataValueType.string, DataValueType.string, "book")],
	["score", new DataField("score", DataValueType.number, DataValueType.number, EXAMPLE_RATE)],
	["image", new DataField("image", DataValueType.url, DataValueType.url, "https://img9.doubanio.com/view/subject/s/public/s1070959.jpg")],
	["imageUrl", new DataField("imageUrl", DataValueType.url, DataValueType.url, "https://img9.doubanio.com/view/subject/s/public/s1070959.jpg")],
	["url", new DataField("url", DataValueType.url, DataValueType.url, "https://book.douban.com/subject/2253379/")],
	["desc", new DataField("desc", DataValueType.string, DataValueType.string, "简爱是一部关于爱、关于成长、关于追求自由与尊严的伟大小说。")],
	["publisher", new DataField("publisher", DataValueType.string, DataValueType.string, "人民文学出版社")],
	["datePublished", new DataField("datePublished", DataValueType.date, DataValueType.date, "2020-1-1")],
	["genre", new DataField("genre", DataValueType.array, DataValueType.array, "小说")],
	["tags", new DataField("tags", DataValueType.array, DataValueType.array, "小说")],
	["rate", new DataField("rate", DataValueType.number, DataValueType.number, 9.0)],
	["state", new DataField("state", DataValueType.string, DataValueType.string, "wish")],
	["collectionDate", new DataField("collectionDate", DataValueType.date, DataValueType.date, "2020-1-1")],
	["comment", new DataField("comment", DataValueType.string, DataValueType.string, "简爱是一部关于爱、关于成长、关于追求自由与尊严的伟大小说。")],
	["author", new DataField("author", DataValueType.person, DataValueType.person, "夏洛蒂·勃朗特")],
	["translator", new DataField("translator", DataValueType.person, DataValueType.person, "李继宏")],
]);

export const MAX_STAR_NUMBER = 100;

export enum PictureBedType {
	PicGo = "PicGo"
}

export const PictureBedSetting_PicGo ={
	url: "http://127.0.0.1:36677/upload"
}

export const PictureBedTypeRecords: { [key in PictureBedType]: string } = {
	[PictureBedType.PicGo]: PictureBedType.PicGo
}


export enum SyncConditionType {
	/**
	 * 最近新变动
	 */
	ALL = "all",
	// /**
	//  * 最近新变动
	//  */
	// LAST_UPDATE = "lastUpdate",

	/**
	 * 最近10条
	 */
	LAST_THIRTY = "lastThirty",

	/**
	 * 自定义时间
	 */
	CUSTOM_TIME = "customTime",

	/**
	 * 自定义条数
	 */
	CUSTOM_ITEM = "customItem",

}

/**
 * 名称模式选项
 */
// @ts-ignore
export const SyncConditionTypeRecords: { [key in SyncConditionType|string]: string } = dynamicI18nRecord({
	[SyncConditionType.ALL]: '110071',
	// [SyncConditionType.LAST_UPDATE]: i18nHelper.getMessage('110072'),
	[SyncConditionType.LAST_THIRTY]: '110075',
	[SyncConditionType.CUSTOM_ITEM]: '110076',
	[SyncConditionType.CUSTOM_TIME]: '110074',

});


export const DoubanSearchResultSubject_EMPTY: DoubanSearchResultSubject = dynamicSubjectTitle({
	id: '',
	title: '',
	score: null,
	cast: '',
	type: 'navigate',
	desc: '-',
	url:  'https://www.douban.com',
	image: "",
	imageUrl: "",
	publisher: "",
	datePublished: undefined,
	genre: []
}, '150107');

export const DoubanSearchResultSubject_TIP_EMPTY: DoubanSearchResultSubject = dynamicSubjectTitle({
	id: '',
	title: '',
	score: null,
	cast: '',
	type: 'navigate',
	desc: '-',
	url:  'https://www.douban.com',
	image: "",
	imageUrl: "",
	publisher: "",
	datePublished: undefined,
	genre: []
}, '150108');
