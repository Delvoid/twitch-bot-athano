import classNames from 'classnames';

import type { ChatCheer, ChatEmote } from '../../types';
import type { Emotes } from '../../twitchTypes';
import useStore from '../../store/store';
import { parseSevenTVModifierFlags } from './parseSevenTVModifierFlags';
import { parseFrankerFaceZModifierFlags } from './parseFrankerFaceZModifierFlags';

// emote regex which separates strings based on whitespace
const emoteRegex = /(\s+)/g;

export const ChatImageRenderer = ({
  emotes,
  bits,
  message = '',
  offset = 0,
}: {
  emotes?: Emotes;
  bits?: number;
  message: string;
  offset?: number;
}): JSX.Element => {
  const chatEmotes = useStore((s) => s.chatEmotes);
  const chatCheers = useStore((s) => s.chatCheers);

  message = message.slice(offset);

  if (!message) {
    return <></>;
  }

  const twitchEmoteMap: Record<string, ChatEmote> = {};

  if (emotes) {
    Object.entries(emotes).forEach(([emoteUrlPart, positioning]) => {
      const emoteName = message.slice(Number(positioning[0].startPosition - offset), Number(positioning[0].endPosition - offset) + 1);
      twitchEmoteMap[emoteName] = {
        origin: 'twitch',
        src: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteUrlPart}/default/dark/1.0`,
        srcSet: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteUrlPart}/default/dark/1.0 1x, https://static-cdn.jtvnw.net/emoticons/v2/${emoteUrlPart}/default/dark/2.0 2x, https://static-cdn.jtvnw.net/emoticons/v2/${emoteUrlPart}/default/dark/3.0 4x`,
        width: null,
        height: null,
        modifier: false,
        hidden: false,
        modifierFlags: 0,
      };
    });
  }

  const messageParts: {
    match: string;
    emote: ChatEmote | undefined;
    cheer: ChatCheer | undefined;
    skip: boolean;
  }[] = [];

  message.split(emoteRegex).forEach((match) => {
    if (bits) {
      let closestCheer: ChatCheer | undefined = undefined;
      // A match might look like VoHiYo199, but the cheer name is VoHiYo, so we need to remove the bits
      const cheerName = match.replace(/\d+$/, '');
      for (const cheer of Object.values(chatCheers)) {
        // Check if the cheer name matches the message part
        if (!cheer.name.startsWith(cheerName)) {
          continue;
        }

        if (cheer.minBits <= bits) {
          if (!closestCheer || cheer.minBits > closestCheer.minBits) {
            closestCheer = cheer;
            continue;
          }

          closestCheer = cheer;
        }
      }

      if (closestCheer) {
        console.log({ match, closestCheer });
        messageParts.push({
          match,
          emote: undefined,
          cheer: closestCheer,
          skip: false,
        });
        return;
      }
    }

    if (twitchEmoteMap[match]) {
      messageParts.push({
        match,
        emote: twitchEmoteMap[match],
        cheer: undefined,
        skip: false,
      });
    } else if (chatEmotes[match] && !chatEmotes[match].hidden) {
      messageParts.push({
        match,
        emote: chatEmotes[match],
        cheer: undefined,
        skip: false,
      });
    } else {
      messageParts.push({
        match,
        emote: undefined,
        cheer: undefined,
        skip: false,
      });
    }
  });

  return (
    <>
      {messageParts.map(({ match, emote, cheer, skip }, index) => {
        if (cheer) {
          // Get the cheer amount without the name:
          const cheerAmount = Number(match.replace(/\D/g, ''));

          return (
            <>
              <img
                className={classNames('chat-cheer')}
                key={`${match}.${index}`}
                src={cheer.url}
                // srcSet={emote.srcSet}
                alt={match}
                title={match}
                width={28}
              />
              <span className={classNames('chat-cheer-amount')} style={{ color: cheer.color }}>
                {cheerAmount}
              </span>
            </>
          );
        }

        if (!emote || !emote.src) {
          return match;
        }

        if (skip) {
          return null;
        }

        const modifierClasses: string[] = [];
        const zeroWidthEmotes: ChatEmote[] = [];
        let nextIndex = index + 1;

        while (nextIndex > -1) {
          const nextMessagePart = messageParts[nextIndex];

          // No next message part
          if (!nextMessagePart) {
            nextIndex = -1;
            continue;
          }

          // Next message part is a space
          if (nextMessagePart.match === ' ') {
            nextIndex++;
            continue;
          }

          // Next message part is not an emote
          if (!nextMessagePart.emote) {
            nextIndex = -1;
            continue;
          }

          // Next message part is a modifier
          if (nextMessagePart.emote && nextMessagePart.emote.modifierFlags > 0) {
            let nextMessageParsedFlags: string[] = [];
            if (nextMessagePart.emote.origin === 'sevenTV') {
              nextMessageParsedFlags = parseSevenTVModifierFlags(nextMessagePart.emote.modifierFlags);
            } else if (nextMessagePart.emote.origin === 'frankerFaceZ') {
              nextMessageParsedFlags = parseFrankerFaceZModifierFlags(nextMessagePart.emote.modifierFlags);
            }

            // Next message part is a modifier that applies to this emote
            if (nextMessageParsedFlags.length > 0) {
              if (nextMessagePart.emote.origin === 'sevenTV' && nextMessageParsedFlags.includes('zerowidth')) {
                zeroWidthEmotes.push(nextMessagePart.emote);
              }
              // Hide the next message part
              messageParts[nextIndex].skip = true;

              // Add the modifier flags to this emote
              const filteredFlags = nextMessageParsedFlags.filter((flag) => flag !== 'hidden');
              modifierClasses.push(...filteredFlags);

              // Continue to the next message part
              nextIndex++;
              continue;
            }
          }

          // Next message part is not a modifier that applies to this emote
          nextIndex = -1;
        }

        if (emote) {
          if (zeroWidthEmotes.length > 0) {
            return (
              <div className="chat-emote--zero-width-wrapper" key={`${match}.${index}`}>
                <img
                  className={classNames(
                    'chat-emote',
                    modifierClasses.map((flag) => `chat-emote--${flag}`)
                  )}
                  key={`${match}.${index}`}
                  src={emote.src}
                  srcSet={emote.srcSet}
                  alt={match}
                  title={match}
                  {...(modifierClasses.includes('growx') ? { width: emote.width || 36 * 2 } : {})}
                />
                {zeroWidthEmotes.map((zeroWidthEmote, index) => (
                  <span key={index} className="chat-emote--zero-width-span">
                    <img
                      className={classNames('chat-emote', 'chat-emote--zero-width-img')}
                      src={zeroWidthEmote.src}
                      srcSet={zeroWidthEmote.srcSet}
                      alt={''}
                      title={''}
                    />
                  </span>
                ))}
              </div>
            );
          } else {
            return (
              <img
                className={classNames(
                  'chat-emote',
                  modifierClasses.map((flag) => `chat-emote--${flag}`)
                )}
                key={`${match}.${index}`}
                src={emote.src}
                srcSet={emote.srcSet}
                alt={match}
                title={match}
                {...(modifierClasses.includes('growx') ? { width: emote.width || 36 * 2 } : {})}
              />
            );
          }
        }
      })}
    </>
  );
};