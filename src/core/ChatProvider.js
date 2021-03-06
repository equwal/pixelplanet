/* @flow */
import logger from './logger';
import redis from '../data/redis';
import User from '../data/models/User';
import webSockets from '../socket/websockets';
import RateLimiter from '../utils/RateLimiter';
import { Channel, RegUser, UserChannel } from '../data/models';
import ChatMessageBuffer from './ChatMessageBuffer';
import { cheapDetector } from './isProxy';
import ttags from './ttag';

import { CHAT_CHANNELS, EVENT_USER_NAME, INFO_USER_NAME } from './constants';

export class ChatProvider {
  constructor() {
    this.defaultChannels = {};
    this.langChannels = {};
    this.enChannelId = 0;
    this.infoUserId = 1;
    this.eventUserId = 1;
    this.caseCheck = /^[A-Z !.]*$/;
    this.cyrillic = new RegExp('[\u0436-\u043B]');
    this.filters = [
      {
        regexp: /ADMIN/gi,
        matches: 4,
      },
      {
        regexp: /ADMlN/gi,
        matches: 4,
      },
      {
        regexp: /ADMlN/gi,
        matches: 4,
      },
      {
        regexp: /FUCK/gi,
        matches: 4,
      },
    ];
    this.substitutes = [
      {
        regexp: /http[s]?:\/\/(old.)?pixelplanet\.fun\/#/g,
        replace: '#',
      },
    ];
    this.mutedCountries = [];
    this.chatMessageBuffer = new ChatMessageBuffer();
  }

  async initialize() {
    // find or create default channels
    for (let i = 0; i < CHAT_CHANNELS.length; i += 1) {
      const { name } = CHAT_CHANNELS[i];
      // eslint-disable-next-line no-await-in-loop
      const channel = await Channel.findOrCreate({
        where: { name },
        defaults: {
          name,
        },
      });
      const { id, type, lastTs } = channel[0];
      if (name === 'en') {
        this.enChannelId = id;
      }
      this.defaultChannels[id] = [
        name,
        type,
        lastTs,
      ];
    }
    // find or create non-english lang channels
    const langs = Object.keys(ttags);
    for (let i = 0; i < langs.length; i += 1) {
      const name = langs[i];
      if (name === 'default') {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const channel = await Channel.findOrCreate({
        where: { name },
        defaults: {
          name,
        },
      });
      const { id, type, lastTs } = channel[0];
      this.langChannels[name] = {
        id,
        type,
        lastTs,
      };
    }
    // find or create default users
    let name = INFO_USER_NAME;
    const infoUser = await RegUser.findOrCreate({
      attributes: [
        'id',
      ],
      where: { name },
      defaults: {
        name,
        verified: 3,
        email: 'info@example.com',
      },
      raw: true,
    });
    this.infoUserId = infoUser[0].id;
    name = EVENT_USER_NAME;
    const eventUser = await RegUser.findOrCreate({
      attributes: [
        'id',
      ],
      where: { name },
      defaults: {
        name,
        verified: 3,
        email: 'event@example.com',
      },
      raw: true,
    });
    this.eventUserId = eventUser[0].id;
  }

  getDefaultChannels(lang) {
    const langChannel = {};
    if (lang && lang !== 'default') {
      const { langChannels } = this;
      if (langChannels[lang]) {
        const {
          id, type, lastTs,
        } = langChannels[lang];
        langChannel[id] = [lang, type, lastTs];
      }
    }
    return {
      ...langChannel,
      ...this.defaultChannels,
    };
  }

  static async addUserToChannel(
    userId,
    channelId,
    channelArray,
  ) {
    const [, created] = await UserChannel.findOrCreate({
      where: {
        UserId: userId,
        ChannelId: channelId,
      },
      raw: true,
    });

    if (created) {
      webSockets.broadcastAddChatChannel(
        userId,
        channelId,
        channelArray,
      );
    }
  }

  /*
   * user.lang has to be set
   * this is just the case in chathistory.js and SocketServer
   */
  userHasChannelAccess(user, cid) {
    if (this.defaultChannels[cid]) {
      return true;
    }
    if (user.channels[cid]) {
      return true;
    }
    const { lang } = user;
    if (this.langChannels[lang]
      && this.langChannels[lang].id === cid) {
      return true;
    }
    return false;
  }

  checkIfDm(user, cid) {
    if (this.defaultChannels[cid]) {
      return null;
    }
    const channelArray = user.channels[cid];
    if (channelArray && channelArray.length === 4) {
      return user.channels[cid][3];
    }
    return null;
  }

  getHistory(cid, limit = 30) {
    return this.chatMessageBuffer.getMessages(cid, limit);
  }

  adminCommands(message: string, channelId: number) {
    // admin commands
    const cmdArr = message.split(' ');
    const cmd = cmdArr[0].substr(1);
    const args = cmdArr.slice(1);
    switch (cmd) {
      case 'mute': {
        const timeMin = Number(args.slice(-1));
        if (Number.isNaN(timeMin)) {
          return this.mute(args.join(' '), channelId);
        }
        return this.mute(
          args.slice(0, -1).join(' '),
          channelId,
          timeMin,
        );
      }

      case 'unmute':
        return this.unmute(args.join(' '), channelId);

      case 'mutec': {
        if (args[0]) {
          const cc = args[0].toLowerCase();
          this.mutedCountries.push(cc);
          this.broadcastChatMessage(
            'info',
            `Country ${cc} has been muted`,
            channelId,
            this.infoUserId,
          );
          return null;
        }
        return 'No country defined for mutec';
      }

      case 'unmutec': {
        if (args[0]) {
          const cc = args[0].toLowerCase();
          if (!this.mutedCountries.includes(cc)) {
            return `Country ${cc} is not muted`;
          }
          this.mutedCountries = this.mutedCountries.filter((c) => c !== cc);
          this.broadcastChatMessage(
            'info',
            `Country ${cc} has been unmuted`,
            channelId,
            this.infoUserId,
          );
          return null;
        }
        if (this.mutedCountries.length) {
          this.broadcastChatMessage(
            'info',
            `Countries ${this.mutedCountries} have been unmuted`,
            channelId,
            this.infoUserId,
          );
          this.mutedCountries = [];
          return null;
        }
        return 'No country is currently muted';
      }

      default:
        return `Couln't parse command ${cmd}`;
    }
  }

  /*
   * User.ttag for translation has to be set, this is just the case
   * in SocketServer for websocket connections
   * @param user User object
   * @param message string of message
   * @param channelId integer of channel
   * @return error message if unsuccessful, otherwise null
   */
  async sendMessage(
    user,
    message,
    channelId,
  ) {
    const { id } = user;
    const { t } = user.ttag;
    const name = user.getName();

    if (!user.userlvl && await cheapDetector(user.ip)) {
      logger.info(
        `${name} / ${user.ip} tried to send chat message with proxy`,
      );
      return t`You can not send chat messages with proxy`;
    }

    if (!name || !id) {
      // eslint-disable-next-line max-len
      return t`Couldn\'t send your message, pls log out and back in again.`;
    }

    if (message.charAt(0) === '/' && user.userlvl) {
      return this.adminCommands(message, channelId);
    }

    if (!user.rateLimiter) {
      user.rateLimiter = new RateLimiter(20, 15, true);
    }
    const waitLeft = user.rateLimiter.tick();
    if (waitLeft) {
      const waitTime = Math.floor(waitLeft / 1000);
      // eslint-disable-next-line max-len
      return t`You are sending messages too fast, you have to wait ${waitTime}s :(`;
    }

    if (!this.userHasChannelAccess(user, channelId)) {
      return t`You don\'t have access to this channel`;
    }

    const country = user.regUser.flag || 'xx';
    let displayCountry = (name.endsWith('berg') || name.endsWith('stein'))
      ? 'il'
      : country;
    /*
     * hard coded flag for Manchukuo_1940
     * TODO make it possible to modify user flags
     */
    if (user.id === 2927) {
      displayCountry = 'bt';
    }

    if (!user.regUser.verified) {
      return t`Your mail has to be verified in order to chat`;
    }

    const muted = await ChatProvider.checkIfMuted(user);
    if (muted === -1) {
      return t`You are permanently muted, join our guilded to apppeal the mute`;
    }
    if (muted > 0) {
      if (muted > 120) {
        const timeMin = Math.round(muted / 60);
        return t`You are muted for another ${timeMin} minutes`;
      }
      return t`You are muted for another ${muted} seconds`;
    }

    for (let i = 0; i < this.filters.length; i += 1) {
      const filter = this.filters[i];
      const count = (message.match(filter.regexp) || []).length;
      if (count >= filter.matches) {
        this.mute(name, channelId, 30);
        return t`Ow no! Spam protection decided to mute you`;
      }
    }

    for (let i = 0; i < this.substitutes.length; i += 1) {
      const subsitute = this.substitutes[i];
      message = message.replace(subsitute.regexp, subsitute.replace);
    }

    if (message.length > 200) {
      // eslint-disable-next-line max-len
      return t`You can\'t send a message this long :(`;
    }

    if (message.match(this.cyrillic) && channelId === this.enChannelId) {
      return t`Please use int channel`;
    }

    if (this.mutedCountries.includes(country)) {
      return t`Your country is temporary muted from chat`;
    }

    if (user.last_message && user.last_message === message) {
      user.message_repeat += 1;
      if (user.message_repeat >= 4) {
        this.mute(name, channelId, 60);
        user.message_repeat = 0;
        return t`Stop flooding.`;
      }
    } else {
      user.message_repeat = 0;
      user.last_message = message;
    }

    logger.info(
      `Received chat message ${message} from ${name} / ${user.ip}`,
    );
    this.broadcastChatMessage(
      name,
      message,
      channelId,
      id,
      displayCountry,
    );
    return null;
  }

  broadcastChatMessage(
    name,
    message,
    channelId,
    id,
    country: string = 'xx',
    sendapi: boolean = true,
  ) {
    if (message.length > 250) {
      return;
    }
    this.chatMessageBuffer.addMessage(
      name,
      message,
      channelId,
      id,
      country,
    );
    webSockets.broadcastChatMessage(
      name,
      message,
      channelId,
      id,
      country,
      sendapi,
    );
  }

  static async checkIfMuted(user) {
    const key = `mute:${user.id}`;
    const ttl: number = await redis.ttlAsync(key);
    return ttl;
  }

  async mute(plainName, channelId, timeMin = null) {
    const name = (plainName.startsWith('@')) ? plainName.substr(1) : plainName;
    const id = await User.name2Id(name);
    if (!id) {
      return `Couldn't find user ${name}`;
    }
    const key = `mute:${id}`;
    if (timeMin) {
      const ttl = timeMin * 60;
      await redis.setAsync(key, '', 'EX', ttl);
      this.broadcastChatMessage(
        'info',
        `${name} has been muted for ${timeMin}min`,
        channelId,
        this.infoUserId,
      );
    } else {
      await redis.setAsync(key, '');
      this.broadcastChatMessage(
        'info',
        `${name} has been muted forever`,
        channelId,
        this.infoUserId,
      );
    }
    logger.info(`Muted user ${id}`);
    return null;
  }

  async unmute(plainName, channelId) {
    const name = (plainName.startsWith('@')) ? plainName.substr(1) : plainName;
    const id = await User.name2Id(name);
    if (!id) {
      return `Couldn't find user ${name}`;
    }
    const key = `mute:${id}`;
    const delKeys = await redis.delAsync(key);
    if (delKeys !== 1) {
      return `User ${name} is not muted`;
    }
    this.broadcastChatMessage(
      'info',
      `${name} has been unmuted`,
      channelId,
      this.infoUserId,
    );
    logger.info(`Unmuted user ${id}`);
    return null;
  }
}

const chatProvider = new ChatProvider();
export default chatProvider;
