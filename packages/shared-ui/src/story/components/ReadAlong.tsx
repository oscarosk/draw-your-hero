import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { narrator } from '../narrator';

/** Even timings when there are no Polly speech marks (demo mode). */
export function estimateWordTimes(words: string[], msPerWord = 370): number[] {
  const out: number[] = [];
  let t = 150;
  for (const w of words) {
    out.push(t);
    t += msPerWord + (/[.,!?;:]$/.test(w) ? 260 : 0);
  }
  return out;
}

/** Who says each word, guessed from quote marks when the server didn't say. */
export function speakersFromQuotes(words: string[]): number[] {
  let inQuote = false;
  return words.map((w) => {
    const opens = /^[“"]/.test(w);
    const closes = /[”"][.,!?]*$/.test(w);
    if (opens) inQuote = true;
    const who = inQuote ? 1 : 0;
    if (closes && (inQuote || opens)) inQuote = false;
    return who;
  });
}

interface Props {
  text: string;
  wordTimes?: number[];
  /** Restart the clock when this changes (new page, resume after pause). */
  clockKey: string;
  running: boolean;
  /** Use the narrator's playback position (true when audio is playing for this text). */
  followAudio: boolean;
  style: StyleProp<TextStyle>;
  /** Colours for words still to come, the word being read, and words already read. */
  colors: { upcoming: string; current: string; done: string };
  msPerWord?: number;
  /** Who says each word (0 narrator, 1 hero, 2 friend). */
  speakers?: number[];
  /** Colours for dialogue words, by speaker 1 and 2 (narration uses `colors`). */
  voiceColors?: [string, string];
  /** Called with the index of the word being read. */
  onWord?: (index: number, speaker: number) => void;
}

/**
 * Text that lights up word by word as it is read aloud, like a karaoke
 * picture book. Timings come from Amazon Polly speech marks.
 */
export default function ReadAlong({ text, wordTimes, clockKey, running, followAudio, style, colors, msPerWord, speakers, voiceColors, onWord }: Props) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const who = useMemo(() => (speakers && speakers.length === words.length ? speakers : speakersFromQuotes(words)), [speakers, words]);
  const onWordRef = useRef(onWord);
  onWordRef.current = onWord;
  const times = useMemo(
    () => (wordTimes && wordTimes.length === words.length ? wordTimes : estimateWordTimes(words, msPerWord)),
    [wordTimes, words, msPerWord],
  );
  const [current, setCurrent] = useState(-1);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setCurrent(-1);
    startedAt.current = Date.now();
    if (!running) return undefined;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const fromAudio = followAudio ? narrator.positionMs() : undefined;
      let pos: number;
      if (fromAudio !== undefined && fromAudio > 0) pos = fromAudio;
      else if (followAudio && elapsed < 2500) return; // audio still starting
      else pos = followAudio ? elapsed - 2500 : elapsed; // no audio after all: read on a timer
      let i = -1;
      while (i + 1 < times.length && times[i + 1] <= pos) i++;
      setCurrent((c) => {
        if (c !== i) onWordRef.current?.(i, i >= 0 ? who[i] ?? 0 : 0);
        return c === i ? c : i;
      });
    }, 80);
    return () => clearInterval(tick);
  }, [clockKey, running, followAudio, times, who]);

  return (
    <Text style={style}>
      {words.map((w, i) => (
        <Text
          key={i}
          style={{
            color:
              i === current
                ? colors.current
                : voiceColors && who[i]
                  ? voiceColors[who[i] === 1 ? 0 : 1]
                  : i < current
                    ? colors.done
                    : colors.upcoming,
            fontStyle: who[i] ? 'italic' : 'normal',
          }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </Text>
      ))}
    </Text>
  );
}
