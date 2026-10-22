import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { FromTv, HeroCard, Stage, StoryPage, StoryQuestion, ToTv } from './protocol';
import { getServerUrl, toWebSocketUrl } from './serverConfig';

export interface LiveAct {
  index: number;
  title?: string;
  pageCount: number;
  pages: Array<StoryPage | undefined>;
  question?: StoryQuestion;
  final: boolean;
  ended: boolean;
}

export interface SessionState {
  conn: 'connecting' | 'open' | 'closed';
  room?: { code: string; joinUrl: string; qrUrl: string; mode: 'aws' | 'demo' };
  phoneConnected: boolean;
  stage: Stage;
  hero?: HeroCard;
  greeting?: { text: string; audioUrl?: string; wordTimes?: number[] };
  acts: LiveAct[];
  heard?: { text: string; from: 'phone' | 'tv'; id: number };
  /** Finished storybook id, for the keepsake QR code. */
  bookId?: string;
  bedtime?: boolean;
  /** The latest thing the child drew for the story (shown with a big reveal). */
  prop?: { imageUrl: string; label: string; id: number; role?: 'friend' | 'thing'; name?: string };
  error?: string;
}

const initial: SessionState = { conn: 'connecting', phoneConnected: false, stage: 'waiting-phone', acts: [] };

type Action = { type: 'conn'; conn: SessionState['conn'] } | { type: 'msg'; msg: ToTv };

let heardId = 0;

function reducer(state: SessionState, action: Action): SessionState {
  if (action.type === 'conn') return { ...state, conn: action.conn };
  const msg = action.msg;
  switch (msg.t) {
    case 'room':
      return { ...state, room: { code: msg.code, joinUrl: msg.joinUrl, qrUrl: msg.qrUrl, mode: msg.mode } };
    case 'phone':
      return { ...state, phoneConnected: msg.connected };
    case 'stage': {
      const next: SessionState = { ...state, stage: msg.stage, error: msg.stage === 'error' ? msg.message : undefined };
      if (msg.stage === 'waiting-phone' || msg.stage === 'need-drawing') {
        next.hero = undefined;
        next.greeting = undefined;
        next.acts = [];
      }
      if (msg.stage === 'need-idea') {
        next.acts = [];
        next.bookId = undefined;
      }
      if (msg.stage === 'reading-drawing') {
        // A new drawing is coming: show the "looking at your drawing" screen.
        next.hero = undefined;
        next.greeting = undefined;
        next.acts = [];
      }
      return next;
    }
    case 'hero':
      return { ...state, hero: msg.hero, greeting: msg.greeting, acts: [], prop: undefined };
    case 'story_saved':
      return { ...state, bookId: msg.storyId };
    case 'mode':
      return { ...state, bedtime: msg.bedtime };
    case 'prop':
      return { ...state, prop: { imageUrl: msg.imageUrl, label: msg.label, role: msg.role, name: msg.name, id: ++heardId } };
    case 'act_start': {
      const acts = state.acts.filter((a) => a.index !== msg.index);
      acts.push({
        index: msg.index,
        title: msg.title,
        pageCount: msg.pageCount,
        pages: new Array(msg.pageCount).fill(undefined),
        final: false,
        ended: false,
      });
      acts.sort((a, b) => a.index - b.index);
      return { ...state, acts };
    }
    case 'page':
      return {
        ...state,
        acts: state.acts.map((a) => {
          if (a.index !== msg.act) return a;
          const pages = a.pages.slice();
          pages[msg.index] = msg.page;
          return { ...a, pages };
        }),
      };
    case 'act_end':
      return {
        ...state,
        acts: state.acts.map((a) => (a.index === msg.act ? { ...a, ended: true, question: msg.question, final: msg.final } : a)),
      };
    case 'heard':
      return { ...state, heard: { text: msg.text, from: msg.from, id: ++heardId } };
    case 'error':
      return { ...state, error: msg.message };
    default:
      return state;
  }
}

export function useStorySession() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef<string | undefined>(undefined);
  const closedByUs = useRef(false);

  useEffect(() => {
    closedByUs.current = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      dispatch({ type: 'conn', conn: 'connecting' });
      const base = getServerUrl();
      const query = codeRef.current ? `?code=${codeRef.current}` : '';
      const ws = new WebSocket(toWebSocketUrl(base, `/ws/tv${query}`));
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        dispatch({ type: 'conn', conn: 'open' });
      };
      ws.onmessage = (ev) => {
        let msg: ToTv;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t === 'room') codeRef.current = msg.code;
        dispatch({ type: 'msg', msg });
      };
      ws.onclose = () => {
        if (closedByUs.current) return;
        dispatch({ type: 'conn', conn: 'closed' });
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 600 * retry);
      };
      ws.onerror = () => {
        // onclose follows and handles reconnection
      };
    };

    connect();
    ping = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping' } satisfies FromTv));
    }, 20000);

    return () => {
      closedByUs.current = true;
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: FromTv) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }, []);

  return {
    state,
    demo: useCallback(() => send({ t: 'demo' }), [send]),
    idea: useCallback((text: string, bedtime?: boolean) => send({ t: 'idea', text, bedtime }), [send]),
    answer: useCallback((text: string) => send({ t: 'answer', text }), [send]),
    again: useCallback(() => send({ t: 'again' }), [send]),
    reset: useCallback(() => send({ t: 'reset' }), [send]),
    reached: useCallback((what: 'question' | 'end') => send({ t: 'reached', what }), [send]),
  };
}
