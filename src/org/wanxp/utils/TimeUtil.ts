import NumberUtil from "./NumberUtil";
import {ESTIMATE_TIME_PER_WITH_REQUEST} from "../constant/Constsant";
import {i18nHelper} from "../lang/helper";

export default class TimeUtil {


	/**
	 * 计算预估需要的时间
	 *
	 * 条目之间的等待不再区分同步规模(恒为正常档), 所以按条目数乘单条耗时即可;
	 * 翻页等待没有计入 —— 它的次数取决于列表页数而不是待处理条目数, 硬算反而更不准。
	 *
	 * @param needHandled 需要处理的数量
	 * @return 需要耗费的毫秒数
	 */
	public static estimateTime(needHandled:number):number {
		if (needHandled <= 0) {
            return 0;
        }
		return ESTIMATE_TIME_PER_WITH_REQUEST * needHandled;
	}

	public static estimateTimeMsg(needHandled:number):string {
		const times:number = this.estimateTime(needHandled);
		if (times <= 0) {
            return 0+i18nHelper.getMessage('SECOND');
        }
		return this.formatDuring(times);
	}

	public static formatDuring(mss:number):string {
		let show:boolean = false;
		let message:string = "";
		const days = Math.floor(mss / (1000 * 60 * 60 * 24));
		const hours = Math.floor((mss % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((mss % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((mss % (1000 * 60)) / 1000);

		if (days > 0) {
			show = true;
			message += days + i18nHelper.getMessage("DAY");
		}
		if (hours > 0 || show) {
			show = true;
			message += hours + i18nHelper.getMessage("HOUR");
		}
		if (minutes > 0 || show) {
			show = true;
			message += minutes + i18nHelper.getMessage("MINUTE");
		}
		if (seconds > 0 || show) {
			message += seconds + i18nHelper.getMessage("SECOND");
		}
		return message;
	}

	/**
	 * 格式化日期
	 * 如：formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss') => 2021-01-01 12:00:00
	 * @param date
	 * @param format
	 */
	public static formatDate(date:Date, format: string = 'yyyy-MM-dd HH:mm:ss'):string {

		const year = date.getFullYear()
		const month = date.getMonth() + 1
		const day = date.getDate()
		const hour = date.getHours()
		const minute = date.getMinutes()
		const second = date.getSeconds()
		const formatMap: { [key: string]: any } = {
			yyyy: year.toString(),
			MM: month.toString().padStart(2, '0'),
			dd: day.toString().padStart(2, '0'),
			HH: hour.toString().padStart(2, '0'),
			mm: minute.toString().padStart(2, '0'),
			ss: second.toString().padStart(2, '0')
		}
		return format.replace(/yyyy|MM|dd|HH|mm|ss/g, (match) => formatMap[match])
	}


  public static getLastMonth() {
		const date = new Date();
		date.setMonth(date.getMonth() - 1);
		return date;

  }
}



export const sleep = (ms:number)=> {
	return new Promise(resolve=>setTimeout(resolve, ms))
}

export const sleepRange = (msMin: number, msMax:number)=> {
	const msTime = NumberUtil.getRandomNum(msMin, msMax);
	return new Promise(resolve=>setTimeout(resolve, msTime))
}


