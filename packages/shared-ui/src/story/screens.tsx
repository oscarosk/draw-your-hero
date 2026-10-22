import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationNode, SpatialNavigationRoot as RawRoot } from 'react-tv-space-navigation';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import HeroSprite from './components/HeroSprite';
import LivingScene from './components/LivingScene';
import ReadAlong from './components/ReadAlong';
import TvButton from './components/TvButton';
import {
  BounceText,
  Confetti,
  Float,
  Glow,
  ListeningBars,
  Particles,
  Rays,
  SparkleBurst,
  fxUrl,
  native,
  sceneUrl,
  useEntrance,
  useLoop,
  useSpringIn,
} from './components/fx';
import type { HeroCard, StoryPage, StoryQuestion } from './protocol';
import { getServerUrl } from './serverConfig';
import { playSfx, type Sfx } from './sfx';
import { palette, px } from './theme';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** True while a dialog (like "Leave the story?") owns the remote. */
export const NavLock = createContext(false);

/** A focus root that steps aside while a dialog is open. */
function SpatialNavigationRoot({ isActive = true, children }: { isActive?: boolean; children: React.ReactNode }) {
  const locked = useContext(NavLock);
  return <RawRoot isActive={isActive && !locked}>{children}</RawRoot>;
}

/** Plays a sound effect whenever `key` changes (after an optional delay). */
function useSfx(name: Sfx, key: unknown, delay = 0) {
  useEffect(() => {
    if (key === undefined || key === null) return undefined;
    const t = setTimeout(() => playSfx(name), delay);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Pulse({ children }: { children: React.ReactNode }) {
  const v = useLoop(1400, { easing: Easing.inOut(Easing.sin) });
  const scale = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] });
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/** Shows what the child just said, as a speech bubble, for a few seconds. */
export function HeardBubble({ heard }: { heard?: { text: string; from: 'phone' | 'tv'; id: number } }) {
  const [visible, setVisible] = useState<typeof heard>(undefined);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!heard) return;
    playSfx('chime');
    setVisible(heard);
    v.setValue(0);
    Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 5, tension: 80, useNativeDriver: native }),
      Animated.delay(4200),
      Animated.timing(v, { toValue: 0, duration: 400, useNativeDriver: native }),
    ]).start();
  }, [heard?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!visible) return null;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-px(80), 0] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View style={[s.heard, { opacity: v, transform: [{ translateY }, { scale }] }]} pointerEvents="none">
      <Text style={s.heardIcon}>{visible.from === 'phone' ? '🎤' : '👉'}</Text>
      <Text style={s.heardText} numberOfLines={2}>
        “{visible.text}”
      </Text>
    </Animated.View>
  );
}

export function StatusBadge({ text }: { text: string }) {
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{text}</Text>
    </View>
  );
}

/** Fades the screen in from the dark, like turning a page in a dim room. */
function PageTurn({ trigger, duration = 550 }: { trigger: unknown; duration?: number }) {
  const v = useEntrance(trigger, { duration, easing: Easing.out(Easing.quad) });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.nightDeep, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />;
}

// ---------------------------------------------------------------------------
// 1. Pair: QR code + try-it button
// ---------------------------------------------------------------------------

export function PairScreen({
  qrUrl,
  joinUrl,
  code,
  phoneConnected,
  reading,
  onDemo,
  demoMode,
}: {
  qrUrl?: string;
  joinUrl?: string;
  code?: string;
  phoneConnected: boolean;
  reading: boolean;
  onDemo: () => void;
  demoMode: boolean;
}) {
  const host = joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\/p\/.*/, '') : '';
  const card = useSpringIn('qr', { delay: 500, friction: 6 });

  if (reading) return <ReadingDrawing />;

  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting="night" seed={7} dim={0.12} entranceKey="pair" />
      <View pointerEvents="none" style={s.pairShade}>
        {[0.42, 0.4, 0.37, 0.33, 0.28, 0.22, 0.15, 0.08, 0.03].map((a, i) => (
          <View key={i} style={{ flex: i < 5 ? 2 : 1, backgroundColor: `rgba(14,10,38,${a})` }} />
        ))}
      </View>
      <PageTurn trigger="pair" duration={900} />
      <SpatialNavigationRoot>
        <View style={s.pairWrap}>
          <View style={s.pairLeft}>
            <Text style={s.kicker}>✏️ DRAW · 🎤 TALK · 📺 WATCH</Text>
            <BounceText text="Draw Your" style={s.logoTop} delay={200} />
            <BounceText text="Hero!" style={s.logoHero} delay={650} stagger={70} />
            <Text style={s.lead}>Your drawing becomes the star of a story you make up together.</Text>
            <View style={s.steps}>
              <Step n={1} text="Draw a hero on white paper" delay={900} />
              <Step n={2} text="Scan the code with a phone" delay={1050} />
              <Step n={3} text="Snap a photo and watch it come alive" delay={1200} />
            </View>
            {phoneConnected ? (
              <Pulse>
                <Text style={s.readingText}>📱 Phone connected! Take a photo of your drawing.</Text>
              </Pulse>
            ) : (
              <View style={s.btnRow}>
                <DefaultFocus>
                  <TvButton icon="▶" label="Try it with our hero" onSelect={onDemo} />
                </DefaultFocus>
              </View>
            )}
          </View>
          <Animated.View style={{ opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <Float amount={12} rotate={1.2}>
              <Glow size={900} color="white" opacity={0.35} style={{ left: -px(170), top: -px(170) }} />
              <View style={s.qrCard}>
                {qrUrl ? <Image source={{ uri: qrUrl }} style={s.qr} /> : <View style={[s.qr, { backgroundColor: '#eee' }]} />}
                <Text style={s.qrHint}>Scan with your phone camera</Text>
                {code ? (
                  <Text style={s.qrCode}>
                    or open <Text style={{ fontWeight: '800' }}>{host}/p/{code}</Text>
                  </Text>
                ) : null}
              </View>
            </Float>
            <View style={s.peekHero} pointerEvents="none">
              <HeroSprite uri={`${getServerUrl()}/static/demo-hero.png`} action="wave" size={230} entranceKey="peek" glow={false} />
            </View>
          </Animated.View>
        </View>
        {demoMode ? <StatusBadge text="Demo mode: built-in stories" /> : null}
      </SpatialNavigationRoot>
    </View>
  );
}

function Step({ n, text, delay }: { n: number; text: string; delay: number }) {
  const v = useSpringIn(`step${n}`, { delay, friction: 6 });
  return (
    <Animated.View style={[s.step, { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-px(60), 0] }) }] }]}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <Text style={s.stepText}>{text}</Text>
    </Animated.View>
  );
}

/** While the drawing is cut out and read: a magical "coming to life" moment. */
function ReadingDrawing() {
  const LINES = ['Looking at your drawing…', 'Picking out your colours…', 'Sprinkling some magic…', 'Waking up your hero…'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 1800);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const spin = useLoop(2400);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting="night" seed={8} dim={0.35} />
      <View style={s.center}>
        <Rays size={1300} opacity={0.35} />
        <Glow size={700} opacity={0.8} />
        <Animated.Image
          source={{ uri: fxUrl('sparkle') }}
          style={{ width: px(260), height: px(260), transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.1, 0.8] }) }] }}
        />
        <Text style={s.readingBig}>✨ {LINES[i]}</Text>
      </View>
      <Particles kind="sparkle" count={14} area={[300, 150, 1620, 930]} seed={4} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Hero reveal + choose an idea
// ---------------------------------------------------------------------------

export const IDEA_SUGGESTIONS = ['Goes on a trip to the moon', 'Finds a secret door in the forest', 'Learns to swim with the fishes'];
const IDEA_ICONS = ['🚀', '✨', '🌈'];

const REVEAL_SIZE = 600;
const PANEL_DELAY = 2600;

/** How long the paper-to-hero moment lasts before the reveal (the greeting waits for it). */
export const PAPER_MS = 2900;

type HeroScreenProps = {
  hero: HeroCard;
  greeting?: { text: string; audioUrl?: string; wordTimes?: number[] };
  phoneConnected: boolean;
  onIdea: (idea: string, bedtime: boolean) => void;
};

/**
 * First the real photo of the paper appears, then the drawing peels off the
 * page and flies into the world, then the reveal. Without a photo (the demo
 * hero) it goes straight to the reveal.
 */
export function HeroScreen(props: HeroScreenProps) {
  const { hero } = props;
  const hasPaper = !!(hero.photoUrl && hero.photoCrop && hero.photoAspect);
  const [paperDone, setPaperDone] = useState<string | undefined>(undefined);
  if (hasPaper && paperDone !== hero.imageUrl) {
    return <PaperIntro hero={hero} onDone={() => setPaperDone(hero.imageUrl)} />;
  }
  return <HeroReveal {...props} />;
}

const PAPER_W = 1180;
const PAPER_H = 740;

function PaperIntro({ hero, onDone }: { hero: HeroCard; onDone: () => void }) {
  const aspect = hero.photoAspect!;
  const [cx, cy, cw, ch] = hero.photoCrop!;
  const w = aspect > PAPER_W / PAPER_H ? PAPER_W : PAPER_H * aspect;
  const h = aspect > PAPER_W / PAPER_H ? PAPER_W / aspect : PAPER_H;
  const left = (1920 - w) / 2;
  const top = (1080 - h) / 2 + 30;
  const cut = { left: cx * w, top: cy * h, width: Math.max(1, cw * w), height: Math.max(1, ch * h) };
  // Where the drawing has to travel to land where the reveal begins.
  const dx = w / 2 - (cut.left + cut.width / 2);
  const dy = 540 - (top + h / 2) + (h / 2 - (cut.top + cut.height / 2)) - 20;
  const grow = Math.min(REVEAL_SIZE / cut.width, REVEAL_SIZE / cut.height, 4);

  const drop = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timers = [setTimeout(() => playSfx('pop'), 80), setTimeout(() => playSfx('sparkle'), 1350), setTimeout(() => playSfx('whoosh'), 2050)];
    const a = Animated.sequence([
      Animated.timing(drop, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.2)), useNativeDriver: native }),
      Animated.timing(sweep, { toValue: 1, duration: 760, delay: 80, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(lift, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(2)), useNativeDriver: native }),
      Animated.timing(fly, { toValue: 1, duration: 720, delay: 160, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
    ]);
    a.start(({ finished }) => {
      if (finished) onDone();
    });
    const safety = setTimeout(onDone, PAPER_MS + 800);
    return () => {
      a.stop();
      timers.forEach(clearTimeout);
      clearTimeout(safety);
    };
  }, [hero.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const paperRotate = drop.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '-3deg'] });
  const paperBox = { position: 'absolute' as const, left: px(left), top: px(top), width: px(w), height: px(h) };
  const paperIn = {
    opacity: Animated.multiply(
      drop.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' }),
      fly.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
    ),
    transform: [
      { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, px(260)] }) },
      { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) },
      { rotate: paperRotate },
    ],
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#140F33' }]}>
      <LivingScene setting="meadow" seed={3} dim={0.6} />
      <Glow size={1500} opacity={0.35} style={{ left: px(210), top: px(-210) }} />
      <Animated.View style={[s.paperTitle, { opacity: Animated.multiply(drop, fly.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' })) }]} pointerEvents="none">
        <Text style={s.paperTitleText}>✨ Your drawing is waking up…</Text>
      </Animated.View>

      {/* The real paper */}
      <Animated.View style={[paperBox, paperIn]} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, s.paperShadow]} />
        <View style={[StyleSheet.absoluteFill, s.paperClip]}>
          <Image source={{ uri: hero.photoUrl }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
          {/* the page dims as the drawing lifts off it */}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#140F33', opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]} />
          {/* a sheet of light passes over the page */}
          <Animated.View
            style={[
              s.paperSweep,
              {
                height: px(h * 1.8),
                top: px(-h * 0.4),
                transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-px(260), px(w + 260)] }) }, { rotate: '18deg' }],
                opacity: sweep.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* The drawing itself, sitting exactly on the paper, then peeling off */}
      <Animated.View
        style={[
          paperBox,
          {
            opacity: drop.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [
              { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) },
              { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '0deg'] }) },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Animated.View
          style={{
            position: 'absolute',
            left: px(cut.left),
            top: px(cut.top),
            width: px(cut.width),
            height: px(cut.height),
            opacity: lift.interpolate({ inputRange: [0, 0.15], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [
              { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, px(dx)] }) },
              { translateY: Animated.add(lift.interpolate({ inputRange: [0, 1], outputRange: [0, -px(28)] }), fly.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, px(dy * 0.3) - px(120), px(dy)] })) },
              { scale: Animated.add(lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }), fly.interpolate({ inputRange: [0, 1], outputRange: [0, grow - 1.1] })) },
              { rotate: lift.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-5deg', '2deg'] }) },
            ],
          }}
        >
          <Image source={{ uri: hero.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
        </Animated.View>
      </Animated.View>
      <SparkleBurst trigger={hero.imageUrl} x={960} y={520} count={14} radius={420} delay={1450} />
    </View>
  );
}

function HeroReveal({ hero, greeting, phoneConnected, onIdea }: HeroScreenProps) {
  const [bedtime, setBedtime] = useState(false);
  // Act 1: the drawing bursts into life in the centre. Act 2: it steps aside
  // and the idea panel slides in.
  const flash = useEntrance(hero.imageUrl, { duration: 900, easing: Easing.out(Easing.quad) });
  const move = useEntrance(hero.imageUrl, { duration: 900, delay: PANEL_DELAY, easing: Easing.inOut(Easing.cubic) });
  const [panelReady, setPanelReady] = useState(false);
  useSfx('sparkle', hero.imageUrl, 150);
  useEffect(() => {
    setPanelReady(false);
    const t = setTimeout(() => setPanelReady(true), PANEL_DELAY + 300);
    return () => clearTimeout(t);
  }, [hero.imageUrl]);

  const centerLeft = (1920 - REVEAL_SIZE) / 2;
  const heroX = move.interpolate({ inputRange: [0, 1], outputRange: [0, px(130 - centerLeft)] });
  const heroScale = move.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });
  const nameOpacity = move.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' });
  const panelX = move.interpolate({ inputRange: [0, 1], outputRange: [px(900), 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting="meadow" seed={3} entranceKey={hero.imageUrl} dim={0.05} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,10,38,0.55)', opacity: move.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} pointerEvents="none" />

      <Animated.View style={[s.revealStage, { transform: [{ translateX: heroX }, { scale: heroScale }] }]} pointerEvents="none">
        <Animated.View style={[s.center, { opacity: move.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }) }]}>
          <Rays size={1400} opacity={0.55} />
        </Animated.View>
        <View style={{ width: px(REVEAL_SIZE), height: px(REVEAL_SIZE) }}>
          <HeroSprite uri={hero.imageUrl} action="wave" size={REVEAL_SIZE} entranceKey={hero.imageUrl} />
        </View>
      </Animated.View>

      <SparkleBurst trigger={hero.imageUrl} x={960} y={500} count={18} radius={520} delay={250} />
      <Confetti trigger={hero.imageUrl} delay={300} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flash.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }) }]} />

      <Animated.View style={[s.revealName, { opacity: nameOpacity }]} pointerEvents="none">
        <BounceText text={hero.returning ? `${hero.name} is back!` : `Meet ${hero.name}!`} style={s.revealNameText} delay={700} stagger={55} trigger={hero.imageUrl} />
      </Animated.View>

      <Animated.View style={[s.heroPanel, { opacity: move, transform: [{ translateX: panelX }] }]}>
        <Text style={s.meet}>{hero.returning ? `⭐ Welcome back · Episode ${hero.returning.episode}` : '⭐ Meet'}</Text>
        <Text style={s.heroName}>{hero.name}</Text>
        {greeting ? (
          <ReadAlong
            text={greeting.text}
            wordTimes={greeting.wordTimes}
            clockKey={hero.imageUrl}
            running
            followAudio={!!greeting.audioUrl}
            style={s.greeting}
            colors={{ upcoming: 'rgba(255,248,231,0.55)', current: palette.sun, done: palette.paper }}
          />
        ) : null}
        <View style={s.askRow}>
          {phoneConnected ? <ListeningBars /> : null}
          <Text style={s.askIdea}>{phoneConnected ? 'Say your idea on the phone, or pick one:' : 'Pick an adventure:'}</Text>
        </View>
        <SpatialNavigationRoot isActive={panelReady}>
          <SpatialNavigationNode orientation="vertical">
            <View>
              {(hero.ideas && hero.ideas.length ? hero.ideas.slice(0, 3) : IDEA_SUGGESTIONS).map((idea, i) => (
                <View key={idea} style={{ marginBottom: px(18) }}>
                  {i === 0 ? (
                    <DefaultFocus>
                      <TvButton label={idea} onSelect={() => onIdea(idea, bedtime)} variant="soft" icon={IDEA_ICONS[i]} />
                    </DefaultFocus>
                  ) : (
                    <TvButton label={idea} onSelect={() => onIdea(idea, bedtime)} variant="soft" icon={IDEA_ICONS[i]} />
                  )}
                </View>
              ))}
              <View style={{ marginTop: px(6) }}>
                <TvButton
                  icon={bedtime ? '🌙' : '☀️'}
                  label={bedtime ? 'Bedtime story: ON (calm & cosy)' : 'Bedtime story: off'}
                  onSelect={() => setBedtime((b) => !b)}
                  variant={bedtime ? 'primary' : 'soft'}
                />
              </View>
            </View>
          </SpatialNavigationNode>
        </SpatialNavigationRoot>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3. Painting (waiting for the AI) — with a tiny game while you wait
// ---------------------------------------------------------------------------

const PAINTING_LINES = ['Mixing the colours…', 'Sharpening the crayons…', 'Thinking up something wonderful…', 'Painting the sky…', 'Almost ready…'];

export function PaintingScreen({ hero, setting = 'night', imageUrl }: { hero?: HeroCard; setting?: StoryPage['setting']; imageUrl?: string }) {
  const [i, setI] = useState(0);
  const [hops, setHops] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % PAINTING_LINES.length), 2200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const listener = (k: SupportedKeys) => {
      if (k === SupportedKeys.Enter || k === SupportedKeys.PlayPause || k === SupportedKeys.Up) {
        playSfx('boing');
        setHops((h) => h + 1);
      }
    };
    RemoteControlManager.addKeydownListener(listener);
    return () => RemoteControlManager.removeKeydownListener(listener);
  }, []);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting={setting} imageUrl={imageUrl} seed={11} dim={0.4} />
      <View style={s.center}>
        {hero ? <HeroSprite uri={hero.imageUrl} action="walk" size={400} entranceKey="painting" hopKey={hops} /> : null}
        <Pulse>
          <Text style={s.paintingTitle}>🎨 {PAINTING_LINES[i]}</Text>
        </Pulse>
        {hero ? (
          <Text style={s.hopHint}>
            {hops === 0 ? `Press OK to make ${hero.name} jump!` : `${hops} ${hops === 1 ? 'jump' : 'jumps'}! ${hops >= 10 ? '🏆 Super jumper!' : hops >= 5 ? '🌟 Wow!' : '✨'}`}
          </Text>
        ) : null}
      </View>
      {hops > 0 ? <SparkleBurst trigger={hops} x={960} y={420} count={10} radius={300} delay={150} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 4. A story page
// ---------------------------------------------------------------------------

export function PageView({
  page,
  hero,
  pageKey,
  title,
  paused,
  progress,
}: {
  page: StoryPage;
  hero: HeroCard;
  pageKey: string;
  title?: string;
  paused: boolean;
  progress: { index: number; total: number };
}) {
  const cap = useSpringIn(pageKey, { delay: 350, friction: 7, tension: 50 });
  useSfx('whoosh', pageKey);
  const [speaking, setSpeaking] = useState(0); // 0 narrator, 1 hero, 2 friend
  useEffect(() => setSpeaking(0), [pageKey]);
  const heroTalking = speaking === 1;
  const friendDrawing = page.drawing && page.drawingRole === 'friend' ? page.drawing : undefined;
  const friendSide: StoryPage['heroSide'] = page.heroSide === 'right' ? 'left' : 'right';
  const seed = useMemo(() => [...pageKey].reduce((a, c) => a + c.charCodeAt(0), 0) + progress.index * 13, [pageKey, progress.index]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting={page.setting} imageUrl={page.imageUrl} seed={seed} entranceKey={pageKey} mood={page.mood} weather={page.weather} variant={page.variant} />
      {page.props?.length || (page.drawing && !friendDrawing) ? (
        <StoryProps props={friendDrawing ? (page.props ?? []).slice(0, 1) : page.props ?? []} drawing={friendDrawing ? undefined : page.drawing} heroSide={page.heroSide} trigger={pageKey} high={!!friendDrawing} />
      ) : null}
      {friendDrawing ? (
        <HeroSprite uri={friendDrawing} action={page.heroAction === 'sleep' ? 'sleep' : 'walk'} side={friendSide} size={340} entranceKey={`f${pageKey}`} placed paused={paused} talking={speaking === 2 && !paused} />
      ) : null}
      {title ? <TitleBanner title={title} trigger={pageKey} /> : null}
      <HeroSprite uri={hero.imageUrl} action={page.heroAction} side={page.heroSide} size={400} entranceKey={pageKey} placed paused={paused} talking={heroTalking && !paused} />
      <Animated.View style={[s.caption, { opacity: cap, transform: [{ translateY: cap.interpolate({ inputRange: [0, 1], outputRange: [px(80), 0] }) }] }]}>
        <ReadAlong
          text={page.text}
          wordTimes={page.wordTimes}
          clockKey={`${pageKey}-${paused}`}
          running={!paused}
          followAudio={!!page.audioUrl}
          style={s.captionText}
          colors={{ upcoming: 'rgba(255,248,231,0.5)', current: palette.sun, done: palette.paper }}
          speakers={page.wordSpeakers}
          voiceColors={['#7FE7DC', '#CDBFFF']}
          onWord={(_, who) => setSpeaking(who)}
        />
        <View style={s.dots}>
          {Array.from({ length: progress.total }, (_, i) => (
            <View key={i} style={[s.dot, i < progress.index && s.dotDone, i === progress.index && s.dotOn]} />
          ))}
        </View>
      </Animated.View>
      <PageTurn trigger={pageKey} />
      {paused ? <StatusBadge text="⏸ Paused · press Select to continue" /> : null}
    </View>
  );
}

/** Story objects (a cake, a door, an octopus…) popping into the scene beside the hero. */
function StoryProps({ props, drawing, heroSide, trigger, high = false }: { props: string[]; drawing?: string; heroSide: StoryPage['heroSide']; trigger: string; high?: boolean }) {
  const spots = high ? [960, 960] : heroSide === 'left' ? [1260, 1560] : heroSide === 'right' ? [300, 620] : [330, 1460];
  const emojis = props.slice(0, drawing ? 1 : 2);
  const offset = drawing ? 1 : 0;
  return (
    <>
      {drawing ? <DrawnProp uri={drawing} x={spots[0]} y={560} trigger={trigger} /> : null}
      {emojis.map((p, i) => (
        <StoryProp key={`${trigger}-${i}`} emoji={p} x={spots[i + offset]} y={high ? 300 : i + offset ? 600 : 540} delay={700 + (i + offset) * 350} trigger={trigger} />
      ))}
    </>
  );
}

/** Something the child drew mid-story, standing in the scene like a sticker. */
function DrawnProp({ uri, x, y, trigger }: { uri: string; x: number; y: number; trigger: string }) {
  const v = useSpringIn(trigger, { delay: 600, friction: 4, tension: 60 });
  const size = 280;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: px(x - size / 2),
        top: px(y - size / 2),
        width: px(size),
        height: px(size),
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['25deg', '-3deg'] }) }],
      }}
    >
      <Glow size={size * 1.4} opacity={0.6} style={{ left: -px(size * 0.2), top: -px(size * 0.2) }} />
      <Float amount={14} duration={3400} rotate={3}>
        <Image source={{ uri }} style={{ width: px(size), height: px(size) }} resizeMode="contain" />
      </Float>
    </Animated.View>
  );
}

/** "You drew a purple key!": the child's drawing flies into the story with sparkles. */
export function PropReveal({ prop, hero }: { prop: { imageUrl: string; label: string; id: number; role?: 'friend' | 'thing'; name?: string }; hero?: HeroCard }) {
  const isFriend = prop.role === 'friend';
  const v = useEntrance(prop.id, { duration: 5200, easing: Easing.linear });
  const pop = useSpringIn(prop.id, { delay: 250, friction: 4, tension: 60 });
  useSfx('sparkle', prop.id, 100);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    const t = setTimeout(() => setDone(true), 5400);
    return () => clearTimeout(t);
  }, [prop.id]);
  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: v.interpolate({ inputRange: [0, 0.05, 0.88, 1], outputRange: [0, 1, 1, 0] }) }]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,10,38,0.93)' }]} />
      <View style={s.center}>
        <Rays size={1300} opacity={0.5} />
      </View>
      <View style={[s.center, { flexDirection: 'row' }]}>
        {hero ? (
          <View style={{ marginRight: px(40) }}>
            <HeroSprite uri={hero.imageUrl} action="jump" size={340} entranceKey={`p${prop.id}`} glow={false} />
          </View>
        ) : null}
        <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-40deg', '0deg'] }) }] }}>
          <Glow size={620} opacity={0.75} style={{ left: -px(90), top: -px(90) }} />
          <Image source={{ uri: prop.imageUrl }} style={{ width: px(440), height: px(440) }} resizeMode="contain" />
        </Animated.View>
      </View>
      <View style={[s.revealName, { bottom: px(110) }]}>
        <BounceText text={isFriend ? `Say hi to ${prop.name ?? 'your new friend'}!` : `You drew ${prop.label}!`} style={s.propText} delay={600} stagger={40} trigger={prop.id} />
        <Text style={s.propSub}>{isFriend ? `${prop.name ?? 'Your friend'} is joining the adventure ✨` : "It's in the story now ✨"}</Text>
      </View>
      <SparkleBurst trigger={prop.id} x={1060} y={480} count={16} radius={460} delay={300} />
      <Confetti trigger={prop.id} delay={400} count={30} />
    </Animated.View>
  );
}

function StoryProp({ emoji, x, y, delay, trigger }: { emoji: string; x: number; y: number; delay: number; trigger: string }) {
  const v = useSpringIn(trigger, { delay, friction: 4, tension: 70 });
  const size = 150;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: px(x - size / 2),
        top: px(y - size / 2),
        width: px(size),
        height: px(size),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }],
      }}
    >
      <Glow size={size * 1.6} opacity={0.45} style={{ left: -px(size * 0.3), top: -px(size * 0.3) }} />
      <Float amount={16} duration={3000 + delay} rotate={4}>
        <Text style={{ fontSize: px(size * 0.72), lineHeight: px(size * 0.9), textAlign: 'center' }}>{emoji}</Text>
      </Float>
    </Animated.View>
  );
}

function TitleBanner({ title, trigger }: { title: string; trigger: string }) {
  const v = useSpringIn(trigger, { delay: 500, friction: 6 });
  return (
    <Animated.View style={[s.storyTitle, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-px(120), 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
      <Text style={s.storyTitleStar}>✦</Text>
      <Text style={s.storyTitleText} numberOfLines={1}>
        {title}
      </Text>
      <Text style={s.storyTitleStar}>✦</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// 5. Question for the child
// ---------------------------------------------------------------------------

export function QuestionScreen({
  question,
  hero,
  lastPage,
  phoneConnected,
  onPick,
  answered = false,
}: {
  question: StoryQuestion;
  hero: HeroCard;
  lastPage?: StoryPage;
  phoneConnected: boolean;
  onPick: (text: string) => void;
  /** Someone already answered (on the phone or here): lock the buttons. */
  answered?: boolean;
}) {
  const [pickedHere, setPicked] = useState(false);
  const picked = pickedHere || answered;
  const bubble = useSpringIn(question.prompt, { delay: 250, friction: 5 });
  useSfx('question', question.prompt, 200);
  const cards = useSpringIn(question.prompt, { delay: 900, friction: 6 });
  const pick = (t: string) => {
    if (picked) return;
    setPicked(true);
    onPick(t);
  };
  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting={lastPage?.setting ?? 'meadow'} imageUrl={lastPage?.imageUrl} seed={5} dim={0.42} mood={lastPage?.mood} weather={lastPage?.weather} variant={lastPage?.variant} />
      <SpatialNavigationRoot isActive={!picked}>
        <View style={s.questionWrap}>
          <View>
            <HeroSprite uri={hero.imageUrl} action="wave" size={380} entranceKey={question.prompt} />
          </View>
          <View style={s.questionRight}>
            <Animated.View style={[s.bubble, { opacity: bubble, transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
              <View style={s.bubbleTail} />
              <Text style={s.bubbleKicker}>WHAT HAPPENS NEXT?</Text>
              <ReadAlong
                text={question.prompt}
                wordTimes={question.wordTimes}
                clockKey={question.prompt}
                running
                followAudio={!!question.audioUrl}
                style={s.bubbleText}
                colors={{ upcoming: palette.night, current: palette.coral, done: palette.night }}
              />
            </Animated.View>
            {question.kind === 'draw' ? (
              <View style={s.drawAsk}>
                <DrawingPencil />
                <View style={{ flex: 1 }}>
                  <Text style={s.drawAskTitle}>Draw {question.drawWhat || 'it'} on paper!</Text>
                  <Text style={s.drawAskSub}>{phoneConnected ? 'Then snap a photo with the phone. It will appear in the story!' : 'Scan the code with a phone to add your drawing.'}</Text>
                </View>
              </View>
            ) : phoneConnected ? (
              <View style={s.askRow}>
                <ListeningBars height={46} />
                <Text style={s.sayIt}>Say your answer on the phone!</Text>
              </View>
            ) : null}
            <Text style={s.orPick}>{question.kind === 'draw' ? 'No paper? Pick one:' : phoneConnected ? 'or pick one:' : 'Pick one:'}</Text>
            <Animated.View style={{ opacity: cards, transform: [{ translateY: cards.interpolate({ inputRange: [0, 1], outputRange: [px(80), 0] }) }] }}>
              <SpatialNavigationNode orientation="horizontal">
                <View style={s.btnRow}>
                  <DefaultFocus>
                    <TvButton variant="card" badge="A" color={palette.coral} label={question.options[0]} onSelect={() => pick(question.options[0])} />
                  </DefaultFocus>
                  <TvButton variant="card" badge="B" color={palette.teal} label={question.options[1]} onSelect={() => pick(question.options[1])} />
                </View>
              </SpatialNavigationNode>
            </Animated.View>
          </View>
        </View>
      </SpatialNavigationRoot>
      {picked ? <WritingNext /> : null}
      <PageTurn trigger={question.prompt} />
    </View>
  );
}

/** Shown on the TV the moment an answer arrives (from the phone or the remote). */
function WritingNext() {
  const v = useSpringIn('writing', { friction: 6 });
  const spin = useLoop(2400);
  return (
    <Animated.View pointerEvents="none" style={[s.writing, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [px(60), 0] }) }] }]}>
      <Animated.Text style={{ fontSize: px(46), transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>✨</Animated.Text>
      <Text style={s.writingText}>Got it! Writing what happens next…</Text>
    </Animated.View>
  );
}

function DrawingPencil() {
  const v = useLoop(1400, { easing: Easing.inOut(Easing.sin) });
  return (
    <Animated.Text
      style={{
        fontSize: px(90),
        marginRight: px(24),
        transform: [
          { rotate: v.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '-14deg', '6deg', '-10deg', '0deg'] }) },
          { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, px(18), 0] }) },
        ],
      }}
    >
      ✏️
    </Animated.Text>
  );
}

// ---------------------------------------------------------------------------
// 6. The end: a collectible hero card + story shelf
// ---------------------------------------------------------------------------

export interface ShelfStory {
  id: string;
  title: string;
  hero: HeroCard;
  pages: StoryPage[];
}

function traits(hero: HeroCard): string[] {
  const words = `${hero.personality}`
    .split(/,| and |;|\./)
    .map((w) => w.trim())
    .filter((w) => w && w.length < 22);
  const pick = words.slice(0, 3);
  while (pick.length < 3) pick.push(['Brave', 'Kind', 'Curious'][pick.length]);
  return pick.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function HeroCardView({ story }: { story: ShelfStory }) {
  const last = story.pages[story.pages.length - 1];
  const setting = last?.setting ?? 'meadow';
  const shine = useLoop(3800, { easing: Easing.inOut(Easing.quad) });
  const enter = useSpringIn(story.id, { delay: 200, friction: 5, tension: 40 });
  return (
    <Animated.View style={{ opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: enter.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '-4deg'] }) }] }}>
      <Float amount={14} rotate={1.5}>
        <View style={s.card}>
          <View style={s.cardArt}>
            <Image source={{ uri: sceneUrl(setting, 'sky', last?.variant ?? 0) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <Image source={{ uri: sceneUrl(setting, 'mid', last?.variant ?? 0) }} style={[StyleSheet.absoluteFill, { left: -px(40), right: -px(40) }]} resizeMode="cover" />
            <View style={s.cardHero}>
              <Glow size={420} opacity={0.6} style={{ left: -px(40), top: -px(40) }} />
              <Image source={{ uri: story.hero.imageUrl }} style={{ width: px(340), height: px(340) }} resizeMode="contain" />
            </View>
            <Animated.Image
              source={{ uri: fxUrl('shimmer') }}
              resizeMode="stretch"
              style={{
                position: 'absolute',
                top: -px(200),
                width: px(160),
                height: px(900),
                transform: [{ translateX: shine.interpolate({ inputRange: [0, 0.6, 1], outputRange: [-px(300), px(700), px(700)] }) }, { rotate: '20deg' }],
              }}
            />
          </View>
          <Text style={s.cardName} numberOfLines={1}>
            {story.hero.name}
          </Text>
          <Text style={s.cardLook} numberOfLines={2}>
            {story.hero.look}
          </Text>
          <View style={s.cardTraits}>
            {traits(story.hero).map((t, i) => (
              <View key={i} style={[s.trait, { backgroundColor: [palette.coral, palette.teal, palette.lilac][i] }]}>
                <Text style={s.traitText}>{t}</Text>
              </View>
            ))}
          </View>
          <Text style={s.cardFoot}>★ ★ ★  HERO OF “{story.title}”</Text>
        </View>
      </Float>
    </Animated.View>
  );
}

export function EndScreen({
  story,
  shelf,
  onAgain,
  onNewHero,
  onReplay,
  bookId,
}: {
  bookId?: string;
  story: ShelfStory;
  shelf: ShelfStory[];
  onAgain: () => void;
  onNewHero: () => void;
  onReplay: (s: ShelfStory) => void;
}) {
  const last = story.pages[story.pages.length - 1];
  const others = shelf.filter((x) => x.id !== story.id).slice(-4);
  useSfx('tada', story.id, 300);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LivingScene setting={last?.setting ?? 'night'} imageUrl={last?.imageUrl} seed={9} dim={0.5} mood={last?.mood} variant={last?.variant} />
      <View style={[s.center, { right: px(900) }]} pointerEvents="none">
        <Rays size={1300} opacity={0.4} />
      </View>
      <SpatialNavigationRoot>
        <View style={s.endWrap}>
          <View style={s.endLeft}>
            <HeroCardView story={story} />
          </View>
          <View style={s.endRight}>
            <BounceText text="THE END" style={s.endKicker} trigger={story.id} delay={600} stagger={80} />
            <Text style={s.endTitle}>{story.title}</Text>
            <Text style={s.lead}>Your hero card is on the story shelf ⭐</Text>
            <SpatialNavigationNode orientation="vertical">
              <View>
                <SpatialNavigationNode orientation="horizontal">
                  <View style={[s.btnRow, { marginTop: px(30) }]}>
                    <DefaultFocus>
                      <TvButton icon="✨" label={`New story with ${story.hero.name}`} onSelect={onAgain} />
                    </DefaultFocus>
                    <TvButton icon="✏️" label="Draw a new hero" onSelect={onNewHero} />
                  </View>
                </SpatialNavigationNode>
                <SpatialNavigationNode orientation="horizontal">
                  <View style={[s.btnRow, { marginTop: px(24) }]}>
                    <TvButton icon="📖" label="Read it again" onSelect={() => onReplay(story)} variant="soft" />
                    {others.map((o) => (
                      <TvButton key={o.id} icon="📕" label={o.title} onSelect={() => onReplay(o)} variant="soft" width={360} />
                    ))}
                  </View>
                </SpatialNavigationNode>
              </View>
            </SpatialNavigationNode>
          </View>
        </View>
      </SpatialNavigationRoot>
      {bookId ? <BookQr bookId={bookId} /> : null}
      <Confetti trigger={story.id} count={44} delay={400} />
      <PageTurn trigger={story.id} duration={800} />
    </View>
  );
}

/** Parents scan this to keep the story as a little book on their phone. */
function BookQr({ bookId }: { bookId: string }) {
  const v = useSpringIn(bookId, { delay: 1600, friction: 6 });
  return (
    <Animated.View style={[s.bookQr, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [px(80), 0] }) }] }]}>
      <Image source={{ uri: `${getServerUrl()}/qr/book/${bookId}.png` }} style={{ width: px(170), height: px(170), borderRadius: px(12) }} />
      <View style={{ marginLeft: px(18), width: px(220) }}>
        <Text style={s.bookQrTitle}>📖 Keep this story</Text>
        <Text style={s.bookQrSub}>Scan to open the storybook on a phone. Replay it, save it, share it.</Text>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles (1920x1080 design, scaled)
// ---------------------------------------------------------------------------

const shadow = { textShadowColor: 'rgba(10,6,30,0.45)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 };

// ---------------------------------------------------------------------------
// "Leave the story?" (Back button)
// ---------------------------------------------------------------------------

export function LeavePrompt({ hero, onStay, onNewHero, onExit }: { hero?: HeroCard; onStay: () => void; onNewHero: () => void; onExit?: () => void }) {
  const pop = useSpringIn('leave', { friction: 6, tension: 90 });
  useSfx('boing', 'leave');
  return (
    <View style={[StyleSheet.absoluteFill, s.leaveDim]}>
      <Animated.View style={[s.leaveCard, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
        {hero ? (
          <View style={s.leaveHero}>
            <HeroSprite uri={hero.imageUrl} action="wave" size={220} glow={false} shadow={false} />
          </View>
        ) : null}
        <Text style={s.leaveTitle}>Leave the story?</Text>
        <Text style={s.leaveSub}>{hero ? `${hero.name} will miss you!` : 'Your adventure is paused.'}</Text>
        <RawRoot>
          <SpatialNavigationNode orientation="vertical">
            <View style={{ alignItems: 'center' }}>
              <DefaultFocus>
                <TvButton icon="▶️" label="Keep playing" onSelect={onStay} />
              </DefaultFocus>
              <View style={{ height: px(16) }} />
              <TvButton icon="✏️" label="Draw a new hero" onSelect={onNewHero} variant="soft" />
              {onExit ? (
                <>
                  <View style={{ height: px(16) }} />
                  <TvButton icon="👋" label="Exit Draw Your Hero" onSelect={onExit} variant="soft" />
                </>
              ) : null}
            </View>
          </SpatialNavigationNode>
        </RawRoot>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  leaveDim: { backgroundColor: 'rgba(8,6,24,0.72)', alignItems: 'center', justifyContent: 'center' },
  leaveCard: {
    width: px(760),
    paddingTop: px(150),
    paddingBottom: px(48),
    paddingHorizontal: px(48),
    borderRadius: px(48),
    backgroundColor: '#241A5C',
    borderWidth: px(4),
    borderColor: 'rgba(255,210,63,0.6)',
    alignItems: 'center',
  },
  leaveHero: { position: 'absolute', top: -px(110), alignSelf: 'center' },
  leaveTitle: { color: palette.paper, fontSize: px(64), fontWeight: '900', lineHeight: px(78) },
  leaveSub: { color: 'rgba(255,248,231,0.75)', fontSize: px(32), fontWeight: '700', marginTop: px(6), marginBottom: px(34) },
  kicker: { color: palette.sun, fontSize: px(30), fontWeight: '800', letterSpacing: px(4), marginBottom: px(12) },
  lead: { color: palette.paper, fontSize: px(38), lineHeight: px(52), marginTop: px(16), maxWidth: px(900), fontWeight: '600', ...shadow },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },

  pairWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(130), justifyContent: 'space-between' },
  pairLeft: { width: px(1000) },
  pairShade: { position: 'absolute', left: 0, top: 0, bottom: 0, width: px(1300), flexDirection: 'row' },
  logoTop: { color: palette.paper, fontSize: px(110), lineHeight: px(128), fontWeight: '900', ...shadow },
  logoHero: { color: palette.sun, fontSize: px(170), lineHeight: px(190), fontWeight: '900', ...shadow },
  steps: { marginVertical: px(34) },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: px(18) },
  stepNum: { width: px(62), height: px(62), borderRadius: px(31), backgroundColor: palette.sun, alignItems: 'center', justifyContent: 'center', marginRight: px(24) },
  stepNumText: { color: palette.night, fontSize: px(34), fontWeight: '900' },
  stepText: { color: palette.paper, fontSize: px(36), fontWeight: '700', ...shadow },
  readingText: { color: palette.sun, fontSize: px(42), fontWeight: '800', ...shadow },
  readingBig: { color: palette.paper, fontSize: px(64), fontWeight: '900', marginTop: px(40), ...shadow },
  qrCard: { backgroundColor: palette.paper, borderRadius: px(44), padding: px(40), alignItems: 'center', width: px(560), borderWidth: px(8), borderColor: palette.sun },
  qr: { width: px(460), height: px(460), borderRadius: px(16) },
  qrHint: { color: palette.night, fontSize: px(34), fontWeight: '800', marginTop: px(20) },
  qrCode: { color: palette.night, fontSize: px(24), marginTop: px(8), textAlign: 'center' },
  peekHero: { position: 'absolute', left: -px(150), bottom: -px(90) },

  revealStage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: px(120) },
  revealName: { position: 'absolute', left: 0, right: 0, bottom: px(90), alignItems: 'center' },
  revealNameText: { color: palette.sun, fontSize: px(120), lineHeight: px(140), fontWeight: '900', ...shadow },
  heroPanel: {
    position: 'absolute',
    right: px(110),
    top: px(110),
    bottom: px(110),
    width: px(980),
    backgroundColor: 'rgba(17,13,43,0.86)',
    borderRadius: px(48),
    padding: px(52),
    borderWidth: px(4),
    borderColor: 'rgba(255,210,63,0.5)',
    justifyContent: 'center',
  },
  meet: { color: palette.sun, fontSize: px(40), fontWeight: '800' },
  heroName: { color: palette.paper, fontSize: px(92), lineHeight: px(112), fontWeight: '900', flexShrink: 0 },
  paperTitle: { position: 'absolute', top: px(70), left: 0, right: 0, alignItems: 'center' },
  paperTitleText: { color: palette.paper, fontSize: px(52), fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 },
  paperShadow: { backgroundColor: '#000000', opacity: 0.45, borderRadius: px(10), transform: [{ translateX: px(18) }, { translateY: px(24) }] },
  paperClip: { overflow: 'hidden', borderRadius: px(10), backgroundColor: '#F4F1EA', borderWidth: px(6), borderColor: '#FFFFFF' },
  paperSweep: { position: 'absolute', left: 0, width: px(180), backgroundColor: 'rgba(255,255,255,0.38)' },
  greeting: { fontSize: px(32), lineHeight: px(46), marginTop: px(10), marginBottom: px(24), fontWeight: '700', flexShrink: 0 },
  askRow: { flexDirection: 'row', alignItems: 'center', marginBottom: px(18) },
  askIdea: { color: palette.sun, fontSize: px(34), fontWeight: '800' },

  paintingTitle: { color: palette.paper, fontSize: px(60), fontWeight: '900', marginTop: px(50), ...shadow },
  hopHint: { color: palette.sun, fontSize: px(38), fontWeight: '800', marginTop: px(18), ...shadow },

  storyTitle: {
    position: 'absolute',
    top: px(46),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,13,43,0.78)',
    paddingHorizontal: px(44),
    paddingVertical: px(16),
    borderRadius: px(40),
    borderWidth: px(4),
    borderColor: palette.sun,
    maxWidth: px(1500),
  },
  storyTitleText: { color: palette.sun, fontSize: px(44), fontWeight: '900', marginHorizontal: px(18) },
  storyTitleStar: { color: palette.paper, fontSize: px(34) },
  caption: {
    position: 'absolute',
    left: px(170),
    right: px(170),
    bottom: px(38),
    backgroundColor: 'rgba(17, 13, 43, 0.8)',
    borderRadius: px(40),
    paddingHorizontal: px(56),
    paddingTop: px(28),
    paddingBottom: px(22),
    borderWidth: px(3),
    borderColor: 'rgba(255,248,231,0.18)',
  },
  captionText: { fontSize: px(46), lineHeight: px(62), fontWeight: '800', textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: px(16) },
  dot: { width: px(16), height: px(16), borderRadius: px(8), backgroundColor: 'rgba(255,248,231,0.28)', marginHorizontal: px(6) },
  dotDone: { backgroundColor: 'rgba(255,210,63,0.6)' },
  dotOn: { backgroundColor: palette.sun, width: px(44) },

  questionWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(120), paddingTop: px(130) },
  questionRight: { flex: 1, marginLeft: px(60) },
  bubble: { backgroundColor: palette.paper, borderRadius: px(52), paddingHorizontal: px(54), paddingVertical: px(42), marginBottom: px(30), borderWidth: px(6), borderColor: palette.sun },
  bubbleTail: { position: 'absolute', left: -px(30), top: px(120), width: px(60), height: px(60), backgroundColor: palette.paper, transform: [{ rotate: '45deg' }], borderLeftWidth: px(6), borderBottomWidth: px(6), borderColor: palette.sun },
  bubbleKicker: { color: palette.coral, fontSize: px(28), fontWeight: '900', letterSpacing: px(3), marginBottom: px(8) },
  bubbleText: { fontSize: px(60), lineHeight: px(74), fontWeight: '900' },
  drawAsk: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,210,63,0.16)', borderRadius: px(36), padding: px(24), marginBottom: px(16), borderWidth: px(4), borderColor: palette.sun },
  drawAskTitle: { color: palette.sun, fontSize: px(50), fontWeight: '900', ...shadow },
  drawAskSub: { color: palette.paper, fontSize: px(30), fontWeight: '700', marginTop: px(4) },
  propText: { color: palette.sun, fontSize: px(84), lineHeight: px(100), fontWeight: '900', ...shadow },
  propSub: { color: palette.paper, fontSize: px(38), fontWeight: '800', marginTop: px(6), ...shadow },
  bookQr: { position: 'absolute', right: px(60), bottom: px(50), flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderRadius: px(28), padding: px(18), borderWidth: px(5), borderColor: palette.sun },
  bookQrTitle: { color: palette.night, fontSize: px(30), fontWeight: '900' },
  bookQrSub: { color: '#5B547E', fontSize: px(21), lineHeight: px(27), fontWeight: '700', marginTop: px(4) },
  writing: { position: 'absolute', left: 0, right: 0, bottom: px(60), alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  writingText: { color: palette.sun, fontSize: px(46), fontWeight: '900', marginLeft: px(16), textShadowColor: 'rgba(10,6,30,0.6)', textShadowRadius: 12 },
  sayIt: { color: palette.sun, fontSize: px(44), fontWeight: '900', ...shadow },
  orPick: { color: palette.paper, fontSize: px(32), fontWeight: '700', marginBottom: px(20), ...shadow },

  endWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: px(110) },
  endLeft: { width: px(640), alignItems: 'center' },
  endRight: { flex: 1, marginLeft: px(70) },
  endKicker: { color: palette.sun, fontSize: px(120), lineHeight: px(140), fontWeight: '900', ...shadow },
  endTitle: { color: palette.paper, fontSize: px(64), lineHeight: px(74), fontWeight: '900', marginTop: px(6), ...shadow },

  card: {
    width: px(560),
    backgroundColor: palette.paper,
    borderRadius: px(36),
    padding: px(22),
    borderWidth: px(10),
    borderColor: palette.sun,
    alignItems: 'center',
  },
  cardArt: { width: '100%', height: px(420), borderRadius: px(22), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.night },
  cardHero: { width: px(340), height: px(340) },
  cardName: { color: palette.night, fontSize: px(54), fontWeight: '900', marginTop: px(16) },
  cardLook: { color: '#5B547E', fontSize: px(26), lineHeight: px(32), textAlign: 'center', marginTop: px(4), fontWeight: '600' },
  cardTraits: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: px(14) },
  trait: { borderRadius: px(30), paddingHorizontal: px(20), paddingVertical: px(8), margin: px(6) },
  traitText: { color: '#FFFFFF', fontSize: px(24), fontWeight: '900' },
  cardFoot: { color: palette.night, fontSize: px(22), fontWeight: '900', marginTop: px(14), letterSpacing: px(1), textAlign: 'center' },

  heard: {
    position: 'absolute',
    top: px(150),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderRadius: px(40),
    paddingHorizontal: px(40),
    paddingVertical: px(20),
    maxWidth: px(1500),
    borderWidth: px(5),
    borderColor: palette.coral,
  },
  heardIcon: { fontSize: px(48), marginRight: px(16) },
  heardText: { color: palette.night, fontSize: px(46), fontWeight: '900' },

  badge: { position: 'absolute', right: px(40), top: px(36), backgroundColor: 'rgba(17,13,43,0.7)', borderRadius: px(20), paddingHorizontal: px(22), paddingVertical: px(10) },
  badgeText: { color: palette.muted, fontSize: px(24), fontWeight: '700' },
});
