import type { BotCommand } from '../types';
import { getRandomNumberInRange } from '../utils/getRandomNumberInRange';
import { sendChatMessage } from './helpers/sendChatMessage';

export const play: BotCommand = {
  command: 'play',
  id: 'play',
  description: 'Get the play link for Between Worlds',
  callback: (connection) => {
    const links = ['https://www.betweenworlds.net', 'https://athanoquest.com', 'https://athano.quest'];
    const number = getRandomNumberInRange(0, links.length -1);
    sendChatMessage(connection, links[number]);
  },
};
