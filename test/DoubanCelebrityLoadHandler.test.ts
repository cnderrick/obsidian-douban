jest.mock("obsidian", () => ({
	getLanguage: () => "zh-CN",
	// 只实现解析用到的部分: isValid/format/toDate
	moment: (value: any) => {
		const text = String(value);
		const parsed = /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/.exec(text)
			|| /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
		return {
			format: () => text,
			isValid: () => parsed != null,
			toDate: () => parsed
				? new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3] || 1))
				: null,
		};
	},
	Platform: {isDesktopApp: true},
}), {virtual: true});

// 影人详情走的是原始通道(不自动解安全验证), 这里只关心调用顺序与入参
jest.mock("../src/org/wanxp/utils/DoubanHttpUtil", () => ({
	DoubanHttpUtil: {httpRequestGetRaw: jest.fn()},
}));

import {load} from "cheerio";
import DoubanCelebrityLoadHandler from "../src/org/wanxp/douban/data/handler/DoubanCelebrityLoadHandler";
import {SupportType} from "../src/org/wanxp/constant/Constsant";
import {DoubanHttpUtil} from "../src/org/wanxp/utils/DoubanHttpUtil";

const PERSONAGE_ID = "27483938";
const CELEBRITY_ID = "1325168";
const AVATAR = "https://img9.doubanio.com/view/personage/m/public/c98ff4c762c0a71626e3054fd400b1b6.jpg";

/**
 * 人物页(www.douban.com/personage/{id}/)的最小骨架, 字段标记与真实页面一致。
 */
const personageHtml = (options: {
	properties?: [string, string][],
	name?: string,
	ogTitle?: string,
	ogUrl?: string,
	desc?: string,
	withAvatar?: boolean,
} = {}) => {
	const properties = options.properties === undefined
		? [['性别:', '女'], ['出生日期:', '1986年10月8日'], ['出生地:', '中国,浙江,温州,平阳县'], ['更多中文名:', '毛林颖'], ['IMDb编号:', 'nm8822192'], ['职业:', '演员']] as [string, string][]
		: options.properties;
	const ogUrl = options.ogUrl === undefined ? `https://www.douban.com/personage/${PERSONAGE_ID}` : options.ogUrl;
	const desc = options.desc === undefined ? '内地青年女演员，2005年在古装宫廷剧《太祖秘史》中饰演“兴尼雅”一角而正式出道。' : options.desc;
	return `
		<html><head>
			<meta property="og:title" content="${options.ogTitle === undefined ? '毛林林' : options.ogTitle}" />
			<meta property="og:description" content="${desc}" />
			${ogUrl ? `<meta property="og:url" content="${ogUrl}" />` : ''}
			<meta property="og:image" content="${AVATAR}" />
		</head><body>
			<section class="subject-target">
				<div>
					${options.name === undefined ? '<h1 class="subject-name">毛林林 Linlin Mao</h1>' : (options.name ? `<h1 class="subject-name">${options.name}</h1>` : '')}
					<div class="left">
						<div class="avatar-container">
							${options.withAvatar === false ? '' : `<img class="avatar" src="${AVATAR}" alt="毛林林" />`}
						</div>
					</div>
					<div class="right">
						<ul class="subject-property">
							${properties.map(([label, value]) => `<li><span class="label">${label}</span><span class="value">${value}</span></li>`).join('')}
						</ul>
					</div>
				</div>
			</section>
			<section class="subject-mod subject-intro">
				<h2>人物简介</h2>
				<div class="desc"><div class="content"><p>${desc}</p></div></div>
			</section>
		</body></html>`;
};

describe("DoubanCelebrityLoadHandler", () => {
	const handler = new DoubanCelebrityLoadHandler({} as any);

	const parse = (html: string, requestedId?: string, context: any = {}) =>
		handler.parseSubjectFromHtml(load(html), context, requestedId);

	const syncContext = () => ({
		plugin: {
			settingsManager: {
				getHeaders: () => ({}),
				isDebug: () => false,
				debug: (): void => undefined,
			},
		},
	}) as any;

	beforeEach(() => {
		(DoubanHttpUtil.httpRequestGetRaw as jest.Mock).mockReset();
	});

	it("reads every field the personage page exposes", () => {
		const subject = parse(personageHtml(), CELEBRITY_ID);
		expect(subject).toMatchObject({
			personageId: PERSONAGE_ID,
			type: SupportType.celebrity,
			title: "毛林林 Linlin Mao",
			url: `https://www.douban.com/personage/${PERSONAGE_ID}/`,
			gender: "女",
			birthplace: "中国,浙江,温州,平阳县",
			profession: "演员",
			aliases: ["毛林颖"],
			IMDb: "nm8822192",
			image: AVATAR,
			imageUrl: AVATAR,
		});
		expect(subject.birthday).toEqual(new Date(1986, 9, 8));
		expect(subject.desc).toContain("内地青年女演员");
	});

	/**
	 * 列表给的是 celebrity id, 内容页却是 personage id。增量记账和文件名必须用列表里的
	 * 那个 id, 否则记账的键和查询的键对不上, 每次同步都会重抓全部条目。
	 */
	it("keys the subject by the id the list asked for", () => {
		expect(parse(personageHtml(), CELEBRITY_ID).id).toBe(CELEBRITY_ID);
	});

	it("normalizes the personage url to a trailing slash", () => {
		const subject = parse(personageHtml({ogUrl: `https://www.douban.com/personage/${PERSONAGE_ID}`}), CELEBRITY_ID);
		expect(subject.url).toBe(`https://www.douban.com/personage/${PERSONAGE_ID}/`);
		expect(subject.personageId).toBe(PERSONAGE_ID);
	});

	it("keeps the complete Chinese-English name and falls back to og:title", () => {
		expect(parse(personageHtml({name: '堺雅人 Masato Sakai'}), CELEBRITY_ID).title).toBe("堺雅人 Masato Sakai");
		expect(parse(personageHtml({name: '', ogTitle: '毛林林'}), CELEBRITY_ID).title).toBe("毛林林");
	});

	it("merges every alias row and removes duplicates", () => {
		const subject = parse(personageHtml({
			properties: [
				['更多中文名:', '毛林颖'],
				['更多外文名:', 'Linlin Mao / Linlin Mao'],
			],
		}), CELEBRITY_ID);
		expect(subject.aliases).toEqual(["毛林颖", "Linlin Mao"]);
	});

	it("accepts a birthday that only has year and month, and drops an unparsable one", () => {
		expect(parse(personageHtml({properties: [['出生日期:', '1986年10月']]}), CELEBRITY_ID).birthday)
			.toEqual(new Date(1986, 9, 1));
		expect(parse(personageHtml({properties: [['出生日期:', '不详']]}), CELEBRITY_ID).birthday).toBeNull();
	});

	it("falls back to og:image and og:description when the markup is missing", () => {
		const subject = parse(personageHtml({withAvatar: false, desc: ''}), CELEBRITY_ID);
		expect(subject.image).toBe(AVATAR);
		expect(subject.desc).toBe('');
	});

	it("tolerates a page without any property rows", () => {
		const subject = parse(personageHtml({properties: []}), CELEBRITY_ID);
		expect(subject.gender).toBe('');
		expect(subject.profession).toBe('');
		expect(subject.aliases).toEqual([]);
		expect(subject.IMDb).toBe('');
		expect(subject.birthday).toBeNull();
	});

	it("does not take part in the sync type guard", () => {
		// 人物页会列出该影人的作品, 用整页关键词判类型有误杀风险
		expect((handler as any).getGuessType(load(personageHtml()))).toBeNull();
	});

	describe("resolving the personage page", () => {
		const LANDING = "https://movie.douban.com/celebrity/1325168/";
		const CHALLENGE_PAGE = `
			<html><head><title>豆瓣</title></head><body>
				<form name="sec" id="sec" method="POST" action="/c">
					<input type="hidden" id="red" name="red" value="https://www.douban.com/personage/${PERSONAGE_ID}/" />
				</form>
			</body></html>`;

		it("reads the personage url from the challenge page and fetches it", async () => {
			(DoubanHttpUtil.httpRequestGetRaw as jest.Mock)
				.mockResolvedValueOnce(CHALLENGE_PAGE)
				.mockResolvedValueOnce(personageHtml());

			const html = await (handler as any).fetchSubjectHtml(CELEBRITY_ID, LANDING, syncContext());

			expect(html).toContain("class=\"subject-property\"");
			expect((DoubanHttpUtil.httpRequestGetRaw as jest.Mock).mock.calls.map(call => call[0]))
				.toEqual([LANDING, `https://www.douban.com/personage/${PERSONAGE_ID}/`]);
		});

		it("uses the page directly when no challenge is served", async () => {
			(DoubanHttpUtil.httpRequestGetRaw as jest.Mock).mockResolvedValueOnce(personageHtml());

			const html = await (handler as any).fetchSubjectHtml(CELEBRITY_ID, LANDING, syncContext());

			expect(html).toContain("class=\"subject-property\"");
			expect((DoubanHttpUtil.httpRequestGetRaw as jest.Mock)).toHaveBeenCalledTimes(1);
		});

		it("fails loudly when the landing page hides the personage url", async () => {
			(DoubanHttpUtil.httpRequestGetRaw as jest.Mock)
				.mockResolvedValueOnce("<html><head><title>豆瓣</title></head><body></body></html>");

			await expect((handler as any).fetchSubjectHtml(CELEBRITY_ID, LANDING, syncContext()))
				.rejects.toThrow();
		});
	});
});
