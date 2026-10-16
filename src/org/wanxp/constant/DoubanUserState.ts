import {i18nHelper} from "../lang/helper";
import {SupportType, SyncType} from "./Constsant";

export enum DoubanSubjectState {
	not = 'not',
	wish = 'wish',
	do = 'do',
	collect = 'collect',
}

function dynamicStateRecord(entries: Record<string, string>): Record<string, string> {
	const result: Record<string, string> = {};
	Object.entries(entries).forEach(([key, messageKey]) => {
		Object.defineProperty(result, key, {
			enumerable: true,
			get: () => i18nHelper.getMessage(messageKey),
		});
	});
	return result;
}

export const DoubanSubjectStateRecords_ALL = dynamicStateRecord({
	[DoubanSubjectState.not]: '500101',
	[DoubanSubjectState.wish]: '500102',
	[DoubanSubjectState.do]: '500103',
	[DoubanSubjectState.collect]: '500104',
}) as { [key in DoubanSubjectState]: string };

export const DoubanSubjectStateRecords_MOVIE = dynamicStateRecord({
	[DoubanSubjectState.not]: '500201',
	[DoubanSubjectState.wish]: '500202',
	[DoubanSubjectState.do]: '500203',
	[DoubanSubjectState.collect]: '500204',
}) as { [key in DoubanSubjectState]: string };

export const DoubanSubjectStateRecords_BOOK = dynamicStateRecord({
	[DoubanSubjectState.not]: '500301',
	[DoubanSubjectState.wish]: '500302',
	[DoubanSubjectState.do]: '500303',
	[DoubanSubjectState.collect]: '500304',
}) as { [key in DoubanSubjectState]: string };


export const DoubanSubjectStateRecords_MUSIC = dynamicStateRecord({
	[DoubanSubjectState.not]: '500401',
	[DoubanSubjectState.wish]: '500402',
	[DoubanSubjectState.do]: '500403',
	[DoubanSubjectState.collect]: '500404',
}) as { [key in DoubanSubjectState]: string };

export const DoubanSubjectStateRecords_NOTE = dynamicStateRecord({
	[DoubanSubjectState.not]: '500501',
	[DoubanSubjectState.wish]: '500502',
	[DoubanSubjectState.do]: '500503',
	[DoubanSubjectState.collect]: '500504',
}) as { [key in DoubanSubjectState]: string };

export const DoubanSubjectStateRecords_GAME = dynamicStateRecord({
	[DoubanSubjectState.not]: '500601',
	[DoubanSubjectState.wish]: '500602',
	[DoubanSubjectState.do]: '500603',
	[DoubanSubjectState.collect]: '500604',
}) as { [key in DoubanSubjectState]: string };

export const DoubanSubjectStateRecords_TELEPLAY = dynamicStateRecord({
	[DoubanSubjectState.not]: '500701',
	[DoubanSubjectState.wish]: '500702',
	[DoubanSubjectState.do]: '500703',
	[DoubanSubjectState.collect]: '500704',
}) as { [key in DoubanSubjectState]: string };

export const DoubanSubjectStateRecords_THEATER = dynamicStateRecord({
	[DoubanSubjectState.not]: '500701',
	[DoubanSubjectState.wish]: '500702',
	[DoubanSubjectState.do]: '500703',
	[DoubanSubjectState.collect]: '500704',
}) as { [key in DoubanSubjectState]: string };

/**
 * 影人收藏没有「想看/看过」这类状态, 这张表只被「解析我的状态」用到,
 * 而影人详情页没有用户状态, 永远走不到那里 —— 因此直接复用通用状态文案占位。
 */
export const DoubanSubjectStateRecords_CELEBRITY = DoubanSubjectStateRecords_ALL;

export const DoubanSubjectStateRecords: { [key in SupportType]: Record<DoubanSubjectState, string> } = {
	[SupportType.all]:DoubanSubjectStateRecords_ALL,
	[SupportType.movie]:DoubanSubjectStateRecords_MOVIE,
	[SupportType.book]:DoubanSubjectStateRecords_BOOK,
	[SupportType.music]:DoubanSubjectStateRecords_MUSIC,
	[SupportType.note]:DoubanSubjectStateRecords_NOTE,
	[SupportType.game]:DoubanSubjectStateRecords_GAME,
	[SupportType.teleplay]:DoubanSubjectStateRecords_TELEPLAY,
	[SupportType.theater]:DoubanSubjectStateRecords_THEATER,
	[SupportType.celebrity]:DoubanSubjectStateRecords_CELEBRITY,

}

export const ALL:string = 'ALL';

// @ts-ignore
export const DoubanSubjectStateRecords_MOVIE_SYNC = dynamicStateRecord({
	// @ts-ignore
	[ALL]: '500004',
	[DoubanSubjectState.wish]: '500202',
	[DoubanSubjectState.do]: '500203',
	[DoubanSubjectState.collect]: '500204',
});

// @ts-ignore
export const DoubanSubjectStateRecords_TELEPLAY_SYNC = dynamicStateRecord({
	// @ts-ignore
	[ALL]: '500004',
	[DoubanSubjectState.wish]: '500202',
	[DoubanSubjectState.do]: '500203',
	[DoubanSubjectState.collect]: '500204',
});

// @ts-ignore
export const DoubanSubjectStateRecords_BOOK_SYNC = dynamicStateRecord({
	// @ts-ignore
	[ALL]: '500004',
	[DoubanSubjectState.wish]: '500302',
	[DoubanSubjectState.do]: '500303',
	[DoubanSubjectState.collect]: '500304',
});

// @ts-ignore
export const DoubanSubjectStateRecords_GAME_SYNC = dynamicStateRecord({
	// @ts-ignore
	// [ALL]: i18nHelper.getMessage('500004'),
	[DoubanSubjectState.wish]: '500602',
	[DoubanSubjectState.do]: '500603',
	[DoubanSubjectState.collect]: '500604',
});

export const DoubanSubjectStateRecords_BROADCAST_SYNC = dynamicStateRecord({[ALL]: '500004'});

export const DoubanSubjectStateRecords_NOTE_SYNC = dynamicStateRecord({[ALL]: '500004'});

/**
 * 影人收藏只有一个列表, 没有 scope 可选, 因此只保留「所有」一项。
 */
export const DoubanSubjectStateRecords_CELEBRITY_SYNC = dynamicStateRecord({[ALL]: '500004'});

/**
 * 「全部」类型的同步状态选项: 取各类型的并集(所有 / 想看 / 在看 / 看过)。
 * 某个类别不支持所选状态时(例如影人没有想看、游戏没有所有), 由编排层跳过它。
 */
export const DoubanSubjectStateRecords_ALL_SYNC = dynamicStateRecord({
	// @ts-ignore
	[ALL]: '500004',
	[DoubanSubjectState.wish]: '500102',
	[DoubanSubjectState.do]: '500103',
	[DoubanSubjectState.collect]: '500104',
});

// @ts-ignore
export const DoubanSubjectStateRecords_MUSIC_SYNC = dynamicStateRecord({
	// @ts-ignore
	[ALL]: '500004',
	[DoubanSubjectState.wish]: '500402',
	[DoubanSubjectState.do]: '500403',
	[DoubanSubjectState.collect]: '500404',
});

// @ts-ignore
export const DoubanSubjectStateRecords_SYNC: { [key in SyncType]: Record<DoubanSubjectState, string> } = {
	[SyncType.all]:DoubanSubjectStateRecords_ALL_SYNC,
	[SyncType.movie]:DoubanSubjectStateRecords_MOVIE_SYNC,
	[SyncType.book]:DoubanSubjectStateRecords_BOOK_SYNC,
	[SyncType.music]:DoubanSubjectStateRecords_MUSIC_SYNC,
	// [SyncType.note]:DoubanSubjectStateRecords_NOTE_SYNC,
	[SyncType.game]:DoubanSubjectStateRecords_GAME_SYNC,
	[SyncType.teleplay]:DoubanSubjectStateRecords_TELEPLAY_SYNC,
	[SyncType.celebrity]:DoubanSubjectStateRecords_CELEBRITY_SYNC,
	// [SyncType.theater]:DoubanSubjectStateRecords_THEATER_SYNC,
}



export const DoubanSubjectStateRecords_KEY_WORD_TYPE: Map<string, SupportType> = new Map<string, SupportType> (
	[['我看过这部电视剧', SupportType.teleplay],
	['我最近看过这部电视剧', SupportType.teleplay],
	['我想看这部电视剧', SupportType.teleplay],
	['我在看这部电视剧', SupportType.teleplay],
	['我最近在看这部电视剧', SupportType.teleplay],

	['我最近看过这部电影', SupportType.movie],
	['我看过这部电影', SupportType.movie],
	['我想看这部电影', SupportType.movie],

	['我读过这本书', SupportType.book],
	['我想读这本书', SupportType.book],
	['我在读这本书', SupportType.book],
	['我最近在读这本书', SupportType.book],

	['我最近听过这张唱片', SupportType.music],
	['我听过这张唱片', SupportType.music],
	['我想听这张唱片', SupportType.music],
	['我在听这张唱片', SupportType.music],
	['我最近在听这张唱片', SupportType.music],

	['我最近玩过这个游戏', SupportType.game],
	['我玩过这个游戏', SupportType.game],
	['我想玩这个游戏', SupportType.game],
	['我在玩这个游戏', SupportType.game],
	['我最近在玩这个游戏', SupportType.game],

		['我最近看过这部电影', SupportType.movie],
		['我看过这部电影', SupportType.movie],
		['我想看这部电影', SupportType.movie],
	]
)




