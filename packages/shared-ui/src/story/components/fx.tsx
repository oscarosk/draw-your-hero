import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View, type ImageStyle, type StyleProp, type TextStyle } from 'react-native';
import { getServerUrl } from '../serverConfig';
import { px } from '../theme';

// Small animation toolkit shared by every screen. Everything runs on the
// native driver on Fire TV (transform + opacity only), so animations stay
// smooth while JavaScript is busy talking to the story service.

export const native = Platform.OS !== 'web';

export const fxUrl = (name: string) => `${getServerUrl()}/static/fx/${name}.png`;
export const sceneUrl = (setting: string, layer: 'sky' | 'far' | 'mid' | 'front', variant = 0) =>
  `${getServerUrl()}/static/scenes/${setting}/${variant ? `v${variant}/` : ''}${layer}.${layer === 'sky' ? 'jpg' : 'png'}`;

const prefetched = new Set<string>();
/** Warms the image cache so a scene is ready before its page is shown. */
export function prefetchScene(setting: string, variant = 0): void {
  for (const layer of ['sky', 'far', 'mid', 'front'] as const) {
    const url = sceneUrl(setting, layer, variant);
    if (prefetched.has(url)) continue;
    prefetched.add(url);
    try {
      Image.prefetch?.(url)?.catch?.(() => prefetched.delete(url));
    } catch {
      // prefetch is best-effort
    }
  }
}

/** A 0..1 value that loops forever (linear unless an easing is given). */
export function useLoop(duration: number, { easing = Easing.linear, delay = 0, running = true }: { easing?: (t: number) => number; delay?: number; running?: boolean } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!running) return undefined;
    v.setValue(0);
    const anim = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: native }));
    const t = setTimeout(() => anim.start(), delay);
    return () => {
      clearTimeout(t);
      anim.stop();
    };
  }, [duration, delay, running]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** 0 -> 1 once whenever `key` changes. */
export function useEntrance(key: unknown, { duration = 900, delay = 0, easing = Easing.out(Easing.cubic) }: { duration?: number; delay?: number; easing?: (t: number) => number } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function useSpringIn(key: unknown, { delay = 0, friction = 5, tension = 60 }: { delay?: number; friction?: number; tension?: number } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    const a = Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction, tension, useNativeDriver: native })]);
    a.start();
    return () => a.stop();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

// Deterministic randomness so particles don't jump around on re-render.
export function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------------------
// Ambient particles
// ---------------------------------------------------------------------------

export type ParticleKind = 'firefly' | 'snow' | 'bubble' | 'twinkle' | 'ember' | 'leaf' | 'petal' | 'dust' | 'cloud' | 'sparkle' | 'rain' | 'fog';

const SPRITE: Record<ParticleKind, string> = {
  firefly: 'firefly',
  snow: 'snowflake',
  bubble: 'bubble',
  twinkle: 'twinkle',
  ember: 'ember',
  leaf: 'leaf',
  petal: 'petal',
  dust: 'dust',
  cloud: 'cloud1',
  sparkle: 'sparkle',
  rain: 'raindrop',
  fog: 'fog',
};

const LOOP_MS: Record<ParticleKind, number> = {
  firefly: 9000,
  snow: 16000,
  bubble: 14000,
  twinkle: 5200,
  ember: 9000,
  leaf: 15000,
  petal: 13000,
  dust: 20000,
  cloud: 120000,
  sparkle: 4200,
  rain: 1300,
  fog: 60000,
};

interface ParticlesProps {
  kind: ParticleKind;
  count: number;
  seed?: number;
  /** Area in design pixels: [x0, y0, x1, y1]. */
  area?: [number, number, number, number];
  size?: [number, number];
  opacity?: number;
}

/**
 * One looping driver per particle system; each particle reads it with its own
 * phase and speed (Animated.modulo), so 20 particles cost one animation.
 */
export function Particles({ kind, count, seed = 1, area = [0, 0, 1920, 1080], size, opacity = 1 }: ParticlesProps) {
  const base = useLoop(LOOP_MS[kind]);
  const items = useMemo(() => {
    const r = seeded(seed * 97 + kind.length * 13);
    const [mn, mx] = size ?? defaultSize(kind);
    return Array.from({ length: count }, (_, i) => ({
      i,
      x: area[0] + r() * (area[2] - area[0]),
      y: area[1] + r() * (area[3] - area[1]),
      s: mn + r() * (mx - mn),
      phase: r(),
      speed: kind === 'cloud' ? 1 : 1 + Math.floor(r() * 2),
      sway: 20 + r() * 50,
      spin: r() < 0.5 ? -1 : 1,
      sprite: kind === 'cloud' ? ['cloud1', 'cloud2', 'cloud3'][i % 3] : SPRITE[kind],
    }));
  }, [kind, count, seed, area[0], area[1], area[2], area[3]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animated nodes are built once per particle set, not on every render.
  const styles = useMemo(
    () =>
      items.map((p) => {
        const t = Animated.modulo(Animated.add(Animated.multiply(base, p.speed), p.phase), 1);
        const h = kind === 'cloud' ? p.s * 0.62 : kind === 'fog' ? p.s * 0.33 : p.s;
        const w = kind === 'rain' ? p.s * 0.17 : p.s;
        return [{ position: 'absolute', width: px(w), height: px(h), opacity }, particleStyle(kind, p, t, area)] as StyleProp<ImageStyle>;
      }),
    [items, base, opacity], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((p, i) => (
        <Animated.Image key={p.i} source={{ uri: fxUrl(p.sprite) }} style={styles[i]} resizeMode="contain" />
      ))}
    </View>
  );
}

function defaultSize(kind: ParticleKind): [number, number] {
  switch (kind) {
    case 'firefly':
      return [36, 70];
    case 'snow':
      return [14, 34];
    case 'bubble':
      return [24, 72];
    case 'twinkle':
      return [26, 56];
    case 'ember':
      return [18, 38];
    case 'leaf':
      return [40, 64];
    case 'petal':
      return [26, 40];
    case 'dust':
      return [16, 34];
    case 'cloud':
      return [300, 520];
    case 'sparkle':
      return [50, 110];
    case 'rain':
      return [60, 100];
    case 'fog':
      return [700, 1100];
  }
}

type P = { x: number; y: number; s: number; sway: number; spin: number };

function particleStyle(kind: ParticleKind, p: P, t: Animated.AnimatedInterpolation<number> | Animated.AnimatedNode, area: [number, number, number, number]) {
  const T = t as unknown as Animated.Value;
  const left = px(p.x - p.s / 2);
  const top = px(p.y - p.s / 2);
  const height = area[3] - area[1];
  const width = area[2] - area[0];
  switch (kind) {
    case 'firefly':
      return {
        left,
        top,
        opacity: T.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0.15, 1, 0.35, 0.9, 0.15] }),
        transform: [
          { translateX: T.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, px(p.sway), 0, -px(p.sway), 0] }) },
          { translateY: T.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -px(p.sway * 0.8), 0] }) },
        ],
      };
    case 'twinkle':
    case 'sparkle':
      return {
        left,
        top,
        opacity: T.interpolate({ inputRange: [0, 0.4, 0.5, 0.6, 1], outputRange: [0, 0.15, 1, 0.15, 0] }),
        transform: [
          { scale: T.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] }) },
          { rotate: T.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 90}deg`] }) },
        ],
      };
    case 'snow':
    case 'leaf':
    case 'petal':
      return {
        left,
        top: px(area[1] - p.s),
        opacity: T.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: T.interpolate({ inputRange: [0, 1], outputRange: [0, px(height + p.s * 2)] }) },
          { translateX: T.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, px(p.sway), px(kind === 'snow' ? 0 : p.sway * 0.5), -px(p.sway * 0.6), px(kind === 'snow' ? 0 : -p.sway)] }) },
          { rotate: T.interpolate({ inputRange: [0, 1], outputRange: ['0deg', kind === 'snow' ? '0deg' : `${p.spin * 540}deg`] }) },
        ],
      };
    case 'bubble':
    case 'ember':
      return {
        left,
        top: px(area[3]),
        opacity: T.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, kind === 'ember' ? 1 : 0.9, kind === 'ember' ? 0.6 : 0.9, 0] }),
        transform: [
          { translateY: T.interpolate({ inputRange: [0, 1], outputRange: [0, -px(height + p.s)] }) },
          { translateX: T.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, px(p.sway * 0.6), 0, -px(p.sway * 0.6), 0] }) },
          { scale: T.interpolate({ inputRange: [0, 1], outputRange: [0.6, kind === 'ember' ? 0.4 : 1.15] }) },
        ],
      };
    case 'dust':
      return {
        left,
        top,
        opacity: T.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, 0.7, 0.7, 0] }),
        transform: [{ translateX: T.interpolate({ inputRange: [0, 1], outputRange: [0, px(220)] }) }, { translateY: T.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -px(30), 0] }) }],
      };
    case 'rain':
      return {
        left,
        top: px(area[1] - p.s),
        opacity: 0.75,
        transform: [
          { translateY: T.interpolate({ inputRange: [0, 1], outputRange: [0, px(height + p.s * 2)] }) },
          { translateX: T.interpolate({ inputRange: [0, 1], outputRange: [0, -px(140)] }) },
          { rotate: '8deg' },
        ],
      };
    case 'fog':
      return {
        left: px(area[0] - p.s),
        top: px(p.y - p.s * 0.16),
        opacity: 0.5,
        transform: [{ translateX: T.interpolate({ inputRange: [0, 1], outputRange: [0, px(width + p.s * 2)] }) }],
      };
    case 'cloud':
      return {
        left: px(area[0] - p.s),
        top: px(p.y - p.s * 0.3),
        opacity: 0.85,
        transform: [{ translateX: T.interpolate({ inputRange: [0, 1], outputRange: [0, px(width + p.s * 2)] }) }],
      };
  }
}

// ---------------------------------------------------------------------------
// Light, glows and bursts
// ---------------------------------------------------------------------------

/** Soft beams of light falling from the top, gently breathing. */
export function LightShafts({ count = 3, seed = 1, tint = 0.35 }: { count?: number; seed?: number; tint?: number }) {
  const v = useLoop(7000, { easing: Easing.inOut(Easing.sin) });
  const items = useMemo(() => {
    const r = seeded(seed * 31);
    return Array.from({ length: count }, (_, i) => ({ x: 200 + r() * 1500, w: 260 + r() * 200, rot: -18 + r() * 14, ph: i / count }));
  }, [count, seed]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((it, i) => {
        const t = Animated.modulo(Animated.add(v, it.ph), 1);
        return (
          <Animated.Image
            key={i}
            source={{ uri: fxUrl('shaft') }}
            resizeMode="stretch"
            style={{
              position: 'absolute',
              left: px(it.x),
              top: -px(80),
              width: px(it.w),
              height: px(1200),
              opacity: (t as unknown as Animated.Value).interpolate({ inputRange: [0, 0.5, 1], outputRange: [tint * 0.4, tint, tint * 0.4] }),
              transform: [{ rotate: `${it.rot}deg` }],
            }}
          />
        );
      })}
    </View>
  );
}

/** Slowly turning rays behind something special (the hero reveal, the end card). */
export function Rays({ size = 1100, opacity = 0.5, style }: { size?: number; opacity?: number; style?: object }) {
  const v = useLoop(40000);
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.Image
      source={{ uri: fxUrl('rays') }}
      style={[{ position: 'absolute', width: px(size), height: px(size), opacity, transform: [{ rotate }] }, style] as StyleProp<ImageStyle>}
      pointerEvents="none"
    />
  );
}

export function Glow({ size, color = 'warm', opacity = 0.8, style, pulse = true }: { size: number; color?: 'warm' | 'white'; opacity?: number; style?: object; pulse?: boolean }) {
  const v = useLoop(3200, { easing: Easing.inOut(Easing.sin), running: pulse });
  const scale = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.94, 1.06, 0.94] });
  return (
    <Animated.Image
      source={{ uri: fxUrl(color === 'warm' ? 'warmglow' : 'glow') }}
      style={[{ position: 'absolute', width: px(size), height: px(size), opacity, transform: [{ scale }] }, style] as StyleProp<ImageStyle>}
      pointerEvents="none"
    />
  );
}

/** A one-shot burst of sparkles flying out from a point. Re-fires when `trigger` changes. */
export function SparkleBurst({ trigger, x, y, count = 14, radius = 380, delay = 0 }: { trigger: unknown; x: number; y: number; count?: number; radius?: number; delay?: number }) {
  const v = useEntrance(trigger, { duration: 1300, delay, easing: Easing.out(Easing.quad) });
  const items = useMemo(() => {
    const r = seeded(Math.floor(Math.random() * 100000) + 1);
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + r() * 0.4;
      const d = radius * (0.55 + r() * 0.45);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, s: 50 + r() * 70, spin: r() < 0.5 ? -1 : 1 };
    });
  }, [trigger, count, radius]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((it, i) => (
        <Animated.Image
          key={i}
          source={{ uri: fxUrl(i % 3 === 0 ? 'twinkle' : 'sparkle') }}
          style={{
            position: 'absolute',
            left: px(x - it.s / 2),
            top: px(y - it.s / 2),
            width: px(it.s),
            height: px(it.s),
            opacity: v.interpolate({ inputRange: [0, 0.05, 0.6, 1], outputRange: [0, 1, 0.9, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, px(it.dx)] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, px(it.dy)] }) },
              { scale: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1.2, 0.5] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${it.spin * 180}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const CONFETTI_COLORS = ['#FFD23F', '#FF6B6B', '#2EC4B6', '#B8A9FF', '#FF9F1C', '#7BDFF2', '#FFFFFF'];

/** Confetti that pops up from the bottom and floats down. Re-fires on `trigger`. */
export function Confetti({ trigger, count = 36, delay = 0 }: { trigger: unknown; count?: number; delay?: number }) {
  const v = useEntrance(trigger, { duration: 3600, delay, easing: Easing.linear });
  const items = useMemo(() => {
    const r = seeded(Math.floor(Math.random() * 100000) + 1);
    return Array.from({ length: count }, (_, i) => ({
      x: 100 + r() * 1720,
      peak: 80 + r() * 420,
      drift: (r() - 0.5) * 300,
      w: 14 + r() * 14,
      h: 24 + r() * 20,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      spin: (r() < 0.5 ? -1 : 1) * (360 + r() * 720),
      round: r() < 0.3,
    }));
  }, [trigger, count]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((c, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: px(c.x),
            top: px(1100),
            width: px(c.w),
            height: px(c.round ? c.w : c.h),
            borderRadius: c.round ? px(c.w) : px(3),
            backgroundColor: c.color,
            opacity: v.interpolate({ inputRange: [0, 0.02, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, -px(1100 - c.peak), -px(1100 - c.peak - 900)] }) },
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, px(c.drift)] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${c.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** Title text whose letters bounce in one after another, then gently float. */
export function BounceText({ text, style, trigger, delay = 0, stagger = 45 }: { text: string; style: StyleProp<TextStyle>; trigger?: unknown; delay?: number; stagger?: number }) {
  const letters = useMemo(() => Array.from(text), [text]);
  const values = useRef<Animated.Value[]>([]);
  if (values.current.length !== letters.length) values.current = letters.map(() => new Animated.Value(0));
  useEffect(() => {
    values.current.forEach((v) => v.setValue(0));
    const a = Animated.stagger(
      stagger,
      values.current.map((v) => Animated.spring(v, { toValue: 1, friction: 4, tension: 90, useNativeDriver: native })),
    );
    const t = setTimeout(() => a.start(), delay);
    return () => {
      clearTimeout(t);
      a.stop();
    };
  }, [trigger ?? text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group letters into words so lines only wrap between words.
  const words: { ch: string; i: number }[][] = [[]];
  letters.forEach((ch, i) => {
    if (ch === ' ') words.push([]);
    else words[words.length - 1].push({ ch, i });
  });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.map((w, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {w.map(({ ch, i }) => {
            const v = values.current[i];
            return (
              <Animated.Text
                key={i}
                style={[
                  style,
                  {
                    opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                    transform: [
                      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [px(-60), 0] }) },
                      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    ],
                  },
                ]}
              >
                {ch}
              </Animated.Text>
            );
          })}
          {wi < words.length - 1 ? <Text style={style}> </Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Gentle up-and-down float for anything (cards, logos). */
export function Float({ children, amount = 14, duration = 4200, rotate = 0, style }: { children: React.ReactNode; amount?: number; duration?: number; rotate?: number; style?: object }) {
  const v = useLoop(duration, { easing: Easing.inOut(Easing.sin) });
  const translateY = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -px(amount), 0] });
  const rot = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [`${-rotate}deg`, `${rotate}deg`, `${-rotate}deg`] });
  return <Animated.View style={[style, { transform: [{ translateY }, { rotate: rot }] }]}>{children}</Animated.View>;
}

/** Three bouncing bars: "I'm listening". */
export function ListeningBars({ color = '#FFD23F', height = 40 }: { color?: string; height?: number }) {
  const v = useLoop(900);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: px(height), marginRight: px(16) }}>
      {[0, 0.33, 0.66].map((ph, i) => {
        const t = Animated.modulo(Animated.add(v, ph), 1) as unknown as Animated.Value;
        return (
          <Animated.View
            key={i}
            style={{
              width: px(10),
              height: px(height),
              borderRadius: px(5),
              backgroundColor: color,
              marginHorizontal: px(4),
              transform: [{ scaleY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] }) }],
            }}
          />
        );
      })}
    </View>
  );
}
