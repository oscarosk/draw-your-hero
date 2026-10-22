import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SpatialNavigationFocusableView } from 'react-tv-space-navigation';
import { palette, px } from '../theme';
import { native } from './fx';
import { playSfx } from '../sfx';

interface Props {
  label: string;
  onSelect: () => void;
  icon?: string;
  /** Letter or number shown in a round badge (e.g. A / B answers). */
  badge?: string;
  variant?: 'primary' | 'soft' | 'card';
  /** Accent colour for 'card' buttons. */
  color?: string;
  width?: number;
}

/**
 * Big, friendly remote-focusable button. When focused it springs up, glows
 * crayon-yellow and gently breathes, so a child always knows where they are.
 */
export default function TvButton(props: Props) {
  const select = () => {
    playSfx('pop');
    props.onSelect();
  };
  return (
    <SpatialNavigationFocusableView onSelect={select}>
      {({ isFocused }) => <Face {...props} onSelect={select} focused={isFocused} />}
    </SpatialNavigationFocusableView>
  );
}

function Face({ label, onSelect, icon, badge, variant = 'primary', color = palette.coral, width, focused }: Props & { focused: boolean }) {
  const f = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(f, { toValue: focused ? 1 : 0, friction: 5, tension: 140, useNativeDriver: native }).start();
    if (!focused) {
      breath.stopAnimation();
      breath.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(breath, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [focused, f, breath]);

  const scale = Animated.add(
    f.interpolate({ inputRange: [0, 1], outputRange: [1, variant === 'card' ? 1.1 : 1.08] }),
    breath.interpolate({ inputRange: [0, 1], outputRange: [0, 0.025] }),
  );
  const isCard = variant === 'card';

  return (
    <Animated.View style={[styles.wrap, width ? { width: px(width) } : null, { transform: [{ scale }] }]}>
      <Animated.View style={[styles.halo, { opacity: f }]} />
      <Pressable
        onPress={onSelect}
        style={[
          styles.base,
          variant === 'soft' && styles.soft,
          isCard && [styles.card, { borderColor: color }],
          focused && (isCard ? { backgroundColor: color, borderColor: palette.paper } : styles.focused),
        ]}
      >
        <View style={styles.row}>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: focused ? palette.paper : color }]}>
              <Text style={[styles.badgeText, { color: focused ? color : palette.paper }]}>{badge}</Text>
            </View>
          ) : null}
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text
            style={[styles.label, isCard && styles.cardLabel, focused && !isCard && styles.labelFocused, focused && isCard && { color: palette.paper }]}
            numberOfLines={isCard ? 3 : 2}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: px(28) },
  halo: {
    position: 'absolute',
    left: -px(10),
    right: -px(10),
    top: -px(10),
    bottom: -px(10),
    borderRadius: px(40),
    backgroundColor: 'rgba(255, 210, 63, 0.28)',
  },
  base: {
    minHeight: px(92),
    paddingHorizontal: px(40),
    paddingVertical: px(18),
    borderRadius: px(30),
    backgroundColor: 'rgba(255, 248, 231, 0.16)',
    borderWidth: px(4),
    borderColor: 'rgba(255, 248, 231, 0.4)',
    justifyContent: 'center',
  },
  soft: {
    backgroundColor: 'rgba(17, 13, 43, 0.6)',
  },
  card: {
    minHeight: px(150),
    width: px(560),
    paddingHorizontal: px(34),
    borderRadius: px(36),
    borderWidth: px(6),
    backgroundColor: 'rgba(255, 248, 231, 0.96)',
  },
  focused: {
    backgroundColor: palette.sun,
    borderColor: palette.paper,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { width: px(64), height: px(64), borderRadius: px(32), alignItems: 'center', justifyContent: 'center', marginRight: px(22) },
  badgeText: { fontSize: px(36), fontWeight: '900' },
  icon: { fontSize: px(40), marginRight: px(16) },
  label: { color: palette.paper, fontSize: px(36), fontWeight: '800', flexShrink: 1 },
  cardLabel: { color: palette.night, fontSize: px(40), lineHeight: px(50), fontWeight: '900' },
  labelFocused: { color: palette.night },
});
