import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import { prefetchScene } from './components/fx';
import { narrator } from './narrator';
import { setSfxQuiet } from './sfx';
import type { HeroCard, StoryPage } from './protocol';
import {
  EndScreen,
  HeardBubble,
  HeroScreen,
  LeavePrompt,
  NavLock,
  PAPER_MS,
  PageView,
  PropReveal,
  PairScreen,
  PaintingScreen,
  QuestionScreen,
  StatusBadge,
  type ShelfStory,
} from './screens';
import { palette } from './theme';
import { useStorySession, type LiveAct } from './useStorySession';

type Phase = 'page' | 'question' | 'end';

interface Cursor {
  act: number;
  page: number;
}

/** Reading time when there is no narration audio (demo mode / Polly unavailable). */
function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(4500, words * 420);
}

/**
 * Draw Your Hero on the TV. One self-contained component so both the Vega app
 * and the Expo app (Fire OS, web) can render it without their own navigation.
 */
export default function StoryApp() {
  const session = useStorySession();
  const { state } = session;

  const [cursor, setCursor] = useState<Cursor>({ act: 0, page: 0 });
  const [phase, setPhase] = useState<Phase>('page');
  const [paused, setPaused] = useState(false);
  const [shelf, setShelf] = useState<ShelfStory[]>([]);
  const [replay, setReplay] = useState<{ story: ShelfStory; page: number } | null>(null);
  const [endedStory, setEndedStory] = useState<ShelfStory | null>(null);

  // While the child's new drawing is being revealed, the story waits.
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (!state.prop) return undefined;
    setHolding(true);
    const t = setTimeout(() => setHolding(false), 5200);
    return () => clearTimeout(t);
  }, [state.prop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSfxQuiet(!!state.bedtime), [state.bedtime]);

  const acts = state.acts;
  const hero = state.hero;
  const liveAct: LiveAct | undefined = acts.find((a) => a.index === cursor.act);
  const livePage: StoryPage | undefined = liveAct?.pages[cursor.page];

  // Warm up the painted scenes before their pages are shown.
  useEffect(() => {
    prefetchScene('night');
    prefetchScene('meadow');
  }, []);
  useEffect(() => {
    for (const act of acts) for (const p of act.pages) if (p) prefetchScene(p.setting, p.variant ?? 0);
  }, [acts]);

  // New story or new hero: start from the top.
  useEffect(() => {
    if (acts.length === 0) {
      setCursor({ act: 0, page: 0 });
      setPhase('page');
      setPaused(false);
      setEndedStory(null);
    }
  }, [acts.length]);

  // A new act arrived after the child answered: jump to its first page.
  const newestAct = acts.length ? acts[acts.length - 1].index : -1;
  useEffect(() => {
    if (newestAct > cursor.act) {
      setCursor({ act: newestAct, page: 0 });
      setPhase('page');
      setPaused(false);
    }
  }, [newestAct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Moving through the live story
  // ---------------------------------------------------------------------------

  const finishStory = useCallback(() => {
    if (!hero) return;
    const pages = acts.flatMap((a) => a.pages.filter((p): p is StoryPage => !!p));
    const story: ShelfStory = {
      id: `${Date.now()}`,
      title: acts[0]?.title || `${hero.name}'s Adventure`,
      hero,
      pages,
    };
    setShelf((prev) => [...prev, story].slice(-8));
    setEndedStory(story);
    setPhase('end');
    session.reached('end');
  }, [acts, hero, session]);

  const advance = useCallback(() => {
    if (!liveAct) return;
    if (cursor.page + 1 < liveAct.pageCount) {
      setCursor({ act: cursor.act, page: cursor.page + 1 });
      return;
    }
    // Last page of this act: wait for act_end if it hasn't arrived yet.
    if (!liveAct.ended) {
      setCursor({ act: cursor.act, page: liveAct.pageCount }); // "waiting" position
      return;
    }
    if (liveAct.final) {
      finishStory();
    } else if (liveAct.question) {
      setPhase('question');
      session.reached('question');
    }
  }, [cursor, liveAct, finishStory, session]);

  // If we were waiting at the end of an act and act_end arrives, continue.
  useEffect(() => {
    if (phase === 'page' && liveAct && liveAct.ended && cursor.page >= liveAct.pageCount) {
      if (liveAct.final) finishStory();
      else if (liveAct.question) {
        setPhase('question');
        session.reached('question');
      }
    }
  }, [liveAct?.ended, cursor.page, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Narrate the current page, then turn it.
  const pageKey = `${cursor.act}-${cursor.page}`;
  useEffect(() => {
    if (replay || phase !== 'page' || !livePage || paused || holding) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      if (!cancelled) timer = setTimeout(() => !cancelled && advance(), 900);
    };
    if (livePage.audioUrl) {
      narrator.play(livePage.audioUrl).then((ok) => {
        if (cancelled) return;
        if (ok) next();
        else timer = setTimeout(() => !cancelled && advance(), readingMs(livePage.text));
      });
    } else {
      timer = setTimeout(() => !cancelled && advance(), readingMs(livePage.text));
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      narrator.stop();
    };
  }, [pageKey, !!livePage, paused, phase, replay, holding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hero greeting and questions are spoken too.
  useEffect(() => {
    if (hero && acts.length === 0 && state.greeting?.audioUrl && state.stage === 'need-idea') {
      const url = state.greeting.audioUrl;
      // Wait for the drawing to peel off the paper first.
      const wait = hero.photoUrl && hero.photoCrop ? PAPER_MS : 0;
      const t = setTimeout(() => narrator.play(url), wait);
      return () => {
        clearTimeout(t);
        narrator.stop();
      };
    }
    return undefined;
  }, [hero?.imageUrl, state.greeting?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'question' && liveAct?.question?.audioUrl) {
      narrator.play(liveAct.question.audioUrl);
      return () => narrator.stop();
    }
    return undefined;
  }, [phase, liveAct?.question?.prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Replaying a story from the shelf (no server needed)
  // ---------------------------------------------------------------------------

  const replayPage = replay ? replay.story.pages[replay.page] : undefined;
  useEffect(() => {
    if (!replay || !replayPage || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      if (cancelled) return;
      if (replay.page + 1 < replay.story.pages.length) setReplay({ ...replay, page: replay.page + 1 });
      else {
        setEndedStory(replay.story);
        setReplay(null);
        setPhase('end');
      }
    };
    if (replayPage.audioUrl) {
      narrator.play(replayPage.audioUrl).then((ok) => {
        if (!cancelled) timer = setTimeout(next, ok ? 900 : readingMs(replayPage.text));
      });
    } else {
      timer = setTimeout(next, readingMs(replayPage.text));
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      narrator.stop();
    };
  }, [replay?.story.id, replay?.page, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Remote control while a page is showing
  // ---------------------------------------------------------------------------

  // Back: steps out of a replay, otherwise asks "Leave the story?" instead of
  // dropping a child out of their adventure. On the pairing screen it exits.
  const [leaving, setLeaving] = useState(false);
  const backHandler = useRef<() => boolean>(() => false);
  backHandler.current = () => {
    if (leaving) {
      setLeaving(false);
      setPaused(false);
      return true;
    }
    if (replay) {
      setReplay(null);
      setPaused(false);
      return true;
    }
    if (!hero) return false;
    narrator.stop();
    setPaused(true);
    setLeaving(true);
    return true;
  };
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Browsers have no hardware Back: the remote's Back arrives as a key.
      const listener = (k: SupportedKeys) => {
        if (k === SupportedKeys.Back) backHandler.current();
      };
      RemoteControlManager.addKeydownListener(listener);
      return () => RemoteControlManager.removeKeydownListener(listener);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => backHandler.current());
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!hero) setLeaving(false);
  }, [hero]);

  const showingPage = !!(replay ? replayPage : phase === 'page' && livePage);
  const keyHandler = useRef<(k: SupportedKeys) => void>(() => undefined);
  keyHandler.current = (key: SupportedKeys) => {
    if (!showingPage || leaving) return;
    if (key === SupportedKeys.Enter || key === SupportedKeys.PlayPause) {
      setPaused((p) => !p);
    } else if (key === SupportedKeys.Right || key === SupportedKeys.FastForward) {
      setPaused(false);
      if (replay) {
        if (replay.page + 1 < replay.story.pages.length) setReplay({ ...replay, page: replay.page + 1 });
      } else {
        narrator.stop();
        advance();
      }
    } else if (key === SupportedKeys.Left || key === SupportedKeys.Rewind) {
      setPaused(false);
      if (replay) {
        if (replay.page > 0) setReplay({ ...replay, page: replay.page - 1 });
      } else if (cursor.page > 0) {
        setCursor({ act: cursor.act, page: cursor.page - 1 });
      }
    }
  };
  useEffect(() => {
    const listener = (k: SupportedKeys) => keyHandler.current(k);
    RemoteControlManager.addKeydownListener(listener);
    return () => RemoteControlManager.removeKeydownListener(listener);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const lastPageShown = useMemo(() => {
    const act = acts.find((a) => a.index === cursor.act);
    const pages = act?.pages.filter((p): p is StoryPage => !!p) ?? [];
    return pages[pages.length - 1];
  }, [acts, cursor.act]);

  let screen: React.ReactNode;
  if (replay && replayPage) {
    screen = (
      <PageView
        page={replayPage}
        hero={replay.story.hero}
        pageKey={`r-${replay.story.id}-${replay.page}`}
        title={replay.page === 0 ? replay.story.title : undefined}
        paused={paused}
        progress={{ index: replay.page, total: replay.story.pages.length }}
      />
    );
  } else if (phase === 'end' && endedStory) {
    screen = (
      <EndScreen
        bookId={replay ? undefined : state.bookId}
        story={endedStory}
        shelf={shelf}
        onAgain={session.again}
        onNewHero={session.reset}
        onReplay={(st) => {
          setPaused(false);
          setReplay({ story: st, page: 0 });
        }}
      />
    );
  } else if (!hero) {
    screen = (
      <PairScreen
        qrUrl={state.room?.qrUrl}
        joinUrl={state.room?.joinUrl}
        code={state.room?.code}
        phoneConnected={state.phoneConnected}
        reading={state.stage === 'reading-drawing'}
        onDemo={session.demo}
        demoMode={state.room?.mode === 'demo'}
      />
    );
  } else if (acts.length === 0) {
    screen =
      state.stage === 'telling' ? (
        <PaintingScreen hero={hero} />
      ) : (
        <HeroScreen hero={hero} greeting={state.greeting} phoneConnected={state.phoneConnected} onIdea={session.idea} />
      );
  } else if (phase === 'question' && liveAct?.question) {
    screen = (
      <QuestionScreen
        question={liveAct.question}
        hero={hero}
        lastPage={lastPageShown}
        phoneConnected={state.phoneConnected}
        answered={state.stage === 'telling'}
        onPick={session.answer}
      />
    );
  } else if (livePage) {
    screen = (
      <PageView
        page={livePage}
        hero={hero}
        pageKey={pageKey}
        title={cursor.page === 0 ? liveAct?.title : undefined}
        paused={paused}
        progress={{ index: cursor.page, total: liveAct?.pageCount ?? 1 }}
      />
    );
  } else {
    screen = <PaintingScreen hero={hero} setting={lastPageShown?.setting} imageUrl={lastPageShown?.imageUrl} />;
  }

  return (
    <View style={styles.root}>
      <NavLock.Provider value={leaving}>{screen}</NavLock.Provider>
      {state.prop ? <PropReveal key={state.prop.id} prop={state.prop} hero={hero} /> : null}
      <HeardBubble heard={state.heard} />
      {state.conn !== 'open' ? <StatusBadge text="Connecting to the story service…" /> : null}
      {leaving ? (
        <LeavePrompt
          hero={hero}
          onStay={() => {
            setLeaving(false);
            setPaused(false);
          }}
          onNewHero={() => {
            setLeaving(false);
            setPaused(false);
            setReplay(null);
            session.reset();
          }}
          onExit={Platform.OS === 'web' ? undefined : () => BackHandler.exitApp()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.nightDeep, overflow: 'hidden' },
});

export type { HeroCard };
