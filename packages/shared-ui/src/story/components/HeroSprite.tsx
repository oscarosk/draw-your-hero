import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import type { HeroAction } from '../protocol';
import { px } from '../theme';
import { Glow, native } from './fx';

interface Props {
  uri: string;
  action?: HeroAction;
  side?: 'left' | 'center' | 'right';
  /** Height in design pixels (1080p). */
  size?: number;
  /** Change this to replay the entrance animation (e.g. on every new page). */
  entranceKey?: string | number;
  /** Absolute placement for story pages; otherwise rendered inline. */
  placed?: boolean;
  paused?: boolean;
  /** Warm magical glow behind the drawing. */
  glow?: boolean;
  /** Change this to make the hero do a happy hop (e.g. when the child presses OK). */
  hopKey?: number;
  /** True while the hero's own lines are being read: the drawing bobs as if speaking. */
  talking?: boolean;
  /** Ground shadow under the drawing. */
  shadow?: boolean;
}

/**
 * The child's own drawing, brought to life: it pops onto each page with a
 * squash-and-stretch landing, glows softly, and moves the way the story says.
 */
export default function HeroSprite({ uri, action = 'walk', side = 'center', size = 460, entranceKey, placed = false, paused = false, glow = true, hopKey = 0, talking = false, shadow = true }: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  const land = useRef(new Animated.Value(1)).current;
  const loop = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const loopAnim = useRef<Animated.CompositeAnimation | null>(null);
  const talk = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!talking) {
      Animated.timing(talk, { toValue: 0, duration: 120, useNativeDriver: native }).start();
      return undefined;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(talk, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(talk, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: native }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [talking, talk]);

  useEffect(() => {
    enter.setValue(0);
    land.setValue(0);
    Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }),
      Animated.timing(land, { toValue: 0.5, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.spring(land, { toValue: 1, friction: 3.5, tension: 120, useNativeDriver: native }),
    ]).start();
  }, [entranceKey, enter, land]);

  useEffect(() => {
    if (!hopKey) return;
    hop.setValue(0);
    Animated.timing(hop, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: native }).start();
  }, [hopKey, hop]);

  useEffect(() => {
    loopAnim.current?.stop();
    loop.setValue(0);
    if (paused) return;
    const duration = action === 'sleep' ? 2600 : action === 'fly' || action === 'swim' ? 1800 : action === 'jump' ? 900 : 1100;
    loopAnim.current = Animated.loop(Animated.timing(loop, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }));
    loopAnim.current.start();
    return () => loopAnim.current?.stop();
  }, [action, loop, paused]);

  // Motion per action, all driven by one 0..1 loop value.
  const wave = loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
  let translateY: Animated.AnimatedInterpolation<number> | number = 0;
  let translateX: Animated.AnimatedInterpolation<number> | number = 0;
  let rotate: Animated.AnimatedInterpolation<string> | string = '0deg';
  let scaleY: Animated.AnimatedInterpolation<number> | number = 1;
  let lift: Animated.AnimatedInterpolation<number> | number = 0; // 0 on the ground, 1 high up (for the shadow)

  switch (action) {
    case 'jump':
      translateY = loop.interpolate({ inputRange: [0, 0.12, 0.5, 0.88, 1], outputRange: [0, 0, -px(110), 0, 0] });
      scaleY = loop.interpolate({ inputRange: [0, 0.06, 0.14, 0.5, 0.86, 0.94, 1], outputRange: [1, 0.86, 1.08, 1, 1.06, 0.88, 1] });
      lift = loop.interpolate({ inputRange: [0, 0.12, 0.5, 0.88, 1], outputRange: [0, 0, 1, 0, 0] });
      break;
    case 'fly':
      translateY = wave.interpolate({ inputRange: [0, 1], outputRange: [-px(60), -px(130)] });
      rotate = wave.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] });
      lift = wave.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
      break;
    case 'swim':
      translateX = wave.interpolate({ inputRange: [0, 1], outputRange: [-px(40), px(40)] });
      translateY = wave.interpolate({ inputRange: [0, 1], outputRange: [px(10), -px(26)] });
      rotate = wave.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] });
      lift = 0.5;
      break;
    case 'dance':
      rotate = loop.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-12deg', '12deg', '0deg'] });
      translateY = wave.interpolate({ inputRange: [0, 1], outputRange: [0, -px(36)] });
      scaleY = loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.94, 1.05, 0.94] });
      lift = wave.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] });
      break;
    case 'wave':
      rotate = loop.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-6deg', '6deg', '0deg'] });
      scaleY = wave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
      break;
    case 'sleep':
      scaleY = wave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
      rotate = '-8deg';
      break;
    case 'walk':
    default:
      translateY = wave.interpolate({ inputRange: [0, 1], outputRange: [0, -px(24)] });
      rotate = loop.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-4deg', '4deg', '0deg'] });
      scaleY = wave.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.02] });
      lift = wave.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] });
      break;
  }

  const fromX = side === 'right' ? px(420) : side === 'left' ? -px(420) : 0;
  const enterX = enter.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] });
  const enterY = enter.interpolate({ inputRange: [0, 1], outputRange: [-px(side === 'center' ? 160 : 60), 0] });
  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [side === 'center' ? 0.3 : 0.7, 1] });
  // Landing squash: wide and short for a moment, then springs back.
  const squashY = land.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.08, 0.82, 1] });
  const squashX = land.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.94, 1.14, 1] });
  // Happy hop when the child presses OK.
  const hopY = hop.interpolate({ inputRange: [0, 0.15, 0.5, 0.85, 1], outputRange: [0, px(10), -px(160), 0, 0] });
  const hopSpin = hop.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: ['0deg', '0deg', '360deg', '360deg'] });

  const shadowScale = typeof lift === 'number' ? 1 - lift * 0.4 : lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });
  const shadowOpacity = typeof lift === 'number' ? 0.28 - lift * 0.14 : lift.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.14] });

  const left = side === 'left' ? 230 : side === 'right' ? 1920 - 230 - size : (1920 - size) / 2;
  const wrapStyle = placed
    ? { position: 'absolute' as const, left: px(left), bottom: px(250), width: px(size), height: px(size) }
    : { width: px(size), height: px(size) };

  return (
    <Animated.View style={[wrapStyle, { opacity: enter.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ translateX: enterX }, { translateY: enterY }, { scale: enterScale }] }]} pointerEvents="none">
      {shadow ? <Animated.View
        style={[
          styles.shadow,
          { width: px(size * 0.62), left: px(size * 0.19), height: px(size * 0.09), opacity: shadowOpacity as never, transform: [{ scaleX: shadowScale as never }] },
        ]}
      /> : null}
      {glow ? <Glow size={size * 1.25} opacity={0.55} style={{ left: px(-size * 0.125), top: px(-size * 0.125) }} /> : null}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { translateY: hopY },
              { rotate: hopSpin },
              { translateY: px(size / 2) },
              { scaleY: talk.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
              { scaleX: talk.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) },
              { translateY: -px(size / 2) },
            ],
          },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: px(size / 2) }, { scaleX: squashX }, { scaleY: squashY }, { translateY: -px(size / 2) }] }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }, { translateY }, { rotate }, { translateY: px(size / 2) }, { scaleY }, { translateY: -px(size / 2) }] }]}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {action === 'sleep' && !talking ? <Text style={[styles.zzz, { right: px(size * 0.05) }]}>Zz</Text> : null}
      {talking ? (
        <Animated.View style={[styles.talkBubble, { right: -px(size * 0.05), opacity: talk.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }]}>
          <Text style={styles.talkDots}>• • •</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: -px(10),
    borderRadius: 9999,
    backgroundColor: '#000000',
  },
  talkBubble: {
    position: 'absolute',
    top: -px(10),
    backgroundColor: '#FFF8E7',
    borderRadius: px(30),
    paddingHorizontal: px(18),
    paddingVertical: px(4),
    borderWidth: px(4),
    borderColor: '#2EC4B6',
  },
  talkDots: { color: '#1B1640', fontSize: px(30), fontWeight: '900' },
  zzz: {
    position: 'absolute',
    top: 0,
    fontSize: px(64),
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 6,
  },
});
