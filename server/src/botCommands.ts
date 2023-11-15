import path from 'path';
import fs from 'fs';
import { addissue } from './commands/github/addissue';
import { fetchcurrentsong } from './commands/spotify/fetchcurrentsong';
import { hasBotCommandParams } from './commands/helpers/hasBotCommandParams';
import { sendChatMessage } from './commands/helpers/sendChatMessage';
import { lastsong } from './commands/spotify/lastsong';
import { queuesong } from './commands/spotify/queuesong';
import { randomissue } from './commands/github/randomissue';
import { skipsong } from './commands/spotify/skipsong';
import { song } from './commands/spotify/song';
import { songqueue } from './commands/spotify/songqueue';

import Config from './config';
import { fetchChatters } from './handlers/twitch/helix/fetchChatters';
import { playSound } from './playSound';
import { getIO } from './runSocketServer';
import type { Command } from './storage-models/command-model';
import { Commands } from './storage-models/command-model';
import type { BotCommand, BotCommandCallback } from './types';
import { mention } from './utils/mention';

const botCommands: BotCommand[] = [];

export async function loadBotCommands() {
  botCommands.length = 0;
  const customCommands = await loadCustomCommands();
  const spotifyCommands = loadSpotifyCommands();
  const githubCommands = loadGitHubCommands();
  botCommands.push(...spotifyCommands, ...githubCommands, ...customCommands);
}

export async function loadCustomCommands(): Promise<BotCommand[]> {
  if (Config.features.commands_handler) {
    const messageCommands = loadMessageCommands();

    const complexBotCommands = await loadComplexCommands();
    // Need to merge the commands from the database with the message commands
    // as the messageCommands can contain aliases for the complex commands
    const loadedCommands = [...complexBotCommands];
    for (const messageCommand of messageCommands) {
      const foundIndex = loadedCommands.findIndex((c) => c.id === messageCommand.id);
      if (foundIndex === -1) {
        loadedCommands.push(messageCommand);
      } else {
        loadedCommands[foundIndex].command = messageCommand.command;
      }
    }

    return loadedCommands;
  }
  return [];
}

export function loadSpotifyCommands(): BotCommand[] {
  if (Config.spotify.enabled) {
    return spotifyCommands;
  }
  return [];
}

export function getBotCommands(): BotCommand[] {
  return botCommands;
}

export function loadGitHubCommands(): BotCommand[] {
  if (Config.github.enabled) {
    return githubCommands;
  }
  return [];
}

async function loadComplexCommands(): Promise<BotCommand[]> {
  const dirname = path.resolve();
  const commandsDir = path.join(dirname, 'src/commands');

  const fileExtension = process.env.NODE_ENV === 'production' ? '.js' : '.ts';

  const commandFiles = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith(fileExtension) && !file.includes('helpers') && !file.includes('spotify'));

  const loadedCommands: BotCommand[] = [];

  for (const file of commandFiles) {
    try {
      const fileName = path.basename(file, fileExtension);
      const commandModule = (await import(`./commands/${fileName}`)) as { [key: string]: BotCommand };
      const command = commandModule[fileName] as BotCommand | undefined;
      if (command) {
        loadedCommands.push(command);
      }
    } catch (error) {
      console.error(`Error loading command ${file}:`, error);
    }
  }

  return loadedCommands;
}

const spotifyCommands: BotCommand[] = [skipsong, song, songqueue, queuesong, lastsong, fetchcurrentsong];

const githubCommands: BotCommand[] = [addissue, randomissue];

const soundMatchRegex = /%sound:([a-zA-Z0-9-_.]+)%/g;
const messageMatchRegex = /%emit:([a-zA-Z0-9-_.]+)%/g;

export const messageWithoutTags = (message: string): string => {
  // Remove all instances of %sound:[something]% and %emit:[something]% from the message
  return message.replace(soundMatchRegex, '').replace(messageMatchRegex, '');
};

export const runMessageTags = async (message: string) => {
  const soundsToPlay: string[] = [];
  if (message.includes('%sound')) {
    let match;

    while ((match = soundMatchRegex.exec(message)) !== null) {
      soundsToPlay.push(match[1]);
    }
  }

  const messagesToEmit: string[] = [];
  if (message.includes('%emit')) {
    let match;

    while ((match = messageMatchRegex.exec(message)) !== null) {
      messagesToEmit.push(match[1]);
    }
  }

  // Emit all messages in sequence to the local socket server
  if (messagesToEmit.length > 0) {
    for (const message of messagesToEmit) {
      getIO().emit(message);
    }
  }

  // Play all sounds in sequence
  if (soundsToPlay.length > 0) {
    for (const sound of soundsToPlay) {
      if (sound.includes('.')) {
        const [soundName, soundExtension] = sound.split('.');
        if (soundExtension !== 'mp3') {
          // TODO: Support other sound formats
          continue;
        }
        await playSound(soundName, 'mp3');
      } else {
        // Default to wav
        await playSound(sound);
      }
    }
  }
};

export const commandCallbackGenerator =
  (c: Command): BotCommandCallback =>
  async (connection, parsedCommand) => {
    const command = Commands.data.find((cmd) => cmd.command === c.command);
    if (!command) {
      return;
    }

    const message = messageWithoutTags(c.message);

    // If there was a message other than just sounds, send it
    if (message) {
      let target = '';
      if (message.includes('%target%') && hasBotCommandParams(parsedCommand.parsedMessage)) {
        const chatters = await fetchChatters();

        const botCommandParam = parsedCommand.parsedMessage.command.botCommandParams.split(' ')[0];
        if (chatters.findIndex((chatter) => chatter.user_login === botCommandParam || chatter.user_name === botCommandParam) > -1) {
          target = mention(botCommandParam);
        }
      }

      let user = 'unknown';
      if (message.includes('%user%') && parsedCommand.parsedMessage.tags && parsedCommand.parsedMessage.tags['display-name']) {
        user = parsedCommand.parsedMessage.tags['display-name'];
      }

      sendChatMessage(
        connection,
        message
          .replace('%user%', user)
          .replace('%target%', target)
          .replace('%now%', new Date().toTimeString())
          .replace('%count%', String(command.timesUsed + 1)),
      );
    }

    await runMessageTags(c.message);
  };

function loadMessageCommands(): BotCommand[] {
  const commands = Commands.data;

  const botCommands: BotCommand[] = commands.map((c) => ({
    command: c.command,
    id: c.commandId,
    description: c.description || '',
    cooldown: c.cooldown || 0,
    callback: async (connection, parsedCommand) => commandCallbackGenerator(c)(connection, parsedCommand),
  }));

  return botCommands;
}
