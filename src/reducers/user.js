/* @flow */

import type { Action } from '../actions/types';

import { createNameRegExp } from '../core/utils';



export type UserState = {
  name: string,
  center: Cell,
  wait: ?Date,
  coolDown: ?number, // ms
  lastCoolDownEnd: ?Date,
  requestingPixel: boolean,
  online: ?number,
  // messages are sent by api/me, like not_verified status
  messages: Array,
  mailreg: boolean,
  // stats
  totalPixels: number,
  dailyTotalPixels: number,
  ranking: number,
  dailyRanking: number,
  // global stats
  totalRanking: Object,
  totalDailyRanking: Object,
  // minecraft
  minecraftname: string,
  // blocking all Dms
  blockDm: boolean,
  // if user is using touchscreen
  isOnMobile: boolean,
  // small notifications for received cooldown
  notification: string,
  // 1: Admin, 2: Mod, 0: ordinary user
  userlvl: number,
  // regExp for detecting ping
  nameRegExp: RegExp,
};

const initialState: UserState = {
  name: null,
  center: [0, 0],
  wait: null,
  coolDown: null,
  lastCoolDownEnd: null,
  requestingPixel: true,
  online: null,
  messages: [],
  mailreg: false,
  totalRanking: {},
  totalDailyRanking: {},
  minecraftname: null,
  blockDm: false,
  isOnMobile: false,
  notification: null,
  userlvl: 0,
  nameRegExp: null,
};

export default function user(
  state: UserState = initialState,
  action: Action,
): UserState {
  switch (action.type) {
    case 'COOLDOWN_SET': {
      const { coolDown } = action;
      return {
        ...state,
        coolDown: coolDown || null,
      };
    }

    case 'COOLDOWN_END': {
      return {
        ...state,
        coolDown: null,
        lastCoolDownEnd: new Date(),
        wait: null,
      };
    }

    case 'SET_PLACE_ALLOWED': {
      const { requestingPixel } = action;
      return {
        ...state,
        requestingPixel,
      };
    }

    case 'SET_WAIT': {
      const { wait: duration } = action;
      const wait = duration
        ? new Date(Date.now() + duration)
        : null;
      return {
        ...state,
        wait,
      };
    }

    case 'RECEIVE_COOLDOWN': {
      const { wait: duration } = action;
      const wait = duration
        ? new Date(Date.now() + duration)
        : null;
      return {
        ...state,
        wait,
        coolDown: null,
      };
    }

    case 'SET_MOBILE': {
      const { mobile: isOnMobile } = action;
      return {
        ...state,
        isOnMobile,
      };
    }

    case 'PLACED_PIXELS': {
      let { totalPixels, dailyTotalPixels } = state;
      const { amount } = action;
      totalPixels += amount;
      dailyTotalPixels += amount;
      return {
        ...state,
        totalPixels,
        dailyTotalPixels,
      };
    }

    case 'RECEIVE_ONLINE': {
      const { online } = action;
      return {
        ...state,
        online,
      };
    }

    case 'RECEIVE_ME':
    case 'LOGIN': {
      const {
        name,
        mailreg,
        totalPixels,
        dailyTotalPixels,
        ranking,
        dailyRanking,
        minecraftname,
        blockDm,
        userlvl,
      } = action;
      const nameRegExp = createNameRegExp(name);
      const messages = (action.messages) ? action.messages : [];
      return {
        ...state,
        name,
        messages,
        mailreg,
        totalPixels,
        dailyTotalPixels,
        ranking,
        dailyRanking,
        minecraftname,
        blockDm,
        userlvl,
        nameRegExp,
      };
    }

    case 'LOGOUT': {
      return {
        ...state,
        name: null,
        messages: [],
        mailreg: false,
        minecraftname: null,
        blockDm: false,
        userlvl: 0,
        nameRegExp: null,
      };
    }

    case 'RECEIVE_STATS': {
      const { totalRanking, totalDailyRanking } = action;
      return {
        ...state,
        totalRanking,
        totalDailyRanking,
      };
    }

    case 'SET_NAME': {
      const { name } = action;
      const nameRegExp = createNameRegExp(name);
      return {
        ...state,
        name,
        nameRegExp,
      };
    }

    case 'SET_BLOCKING_DM': {
      const { blockDm } = action;
      return {
        ...state,
        blockDm,
      };
    }

    case 'SET_MINECRAFT_NAME': {
      const { minecraftname } = action;
      return {
        ...state,
        minecraftname,
      };
    }

    case 'SET_NOTIFICATION': {
      return {
        ...state,
        notification: action.notification,
      };
    }

    case 'UNSET_NOTIFICATION': {
      return {
        ...state,
        notification: null,
      };
    }

    case 'REM_FROM_MESSAGES': {
      const { message } = action;
      const messages = [...state.messages];
      const index = messages.indexOf(message);
      if (index > -1) {
        messages.splice(index);
      }
      return {
        ...state,
        messages,
      };
    }

    case 'SET_MAILREG': {
      const { mailreg } = action;
      return {
        ...state,
        mailreg,
      };
    }

    default:
      return state;
  }
}
