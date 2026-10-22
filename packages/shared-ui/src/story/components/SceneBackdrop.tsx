import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import type { Setting } from '../protocol';
import { px } from '../theme';

// A picture-book scene the TV draws itself, so every page has a background
// even without an image model. When Nova Canvas paints one, it fades in on top.

type Extra =
  | 'sun'
  | 'moon'
  | 'stars'
  | 'clouds'
  | 'trees'
  | 'pines'
  | 'waves'
  | 'bubbles'
  | 'castle'
  | 'dunes'
  | 'buildings'
  | 'crystals'
  | 'volcano'
  | 'planet'
  | 'snow';

interface SceneStyle {
  sky: [string, string];
  ground?: [string, string];
  groundHeight: number; // 0..1 of screen height
  extras: Extra[];
}

const SCENES: Record<Setting, SceneStyle> = {
  meadow: { sky: ['#8FD3FF', '#E4F6FF'], ground: ['#86CF6E', '#5DAA52'], groundHeight: 0.3, extras: ['sun', 'clouds'] },
  forest: { sky: ['#A7E0C8', '#EEF9F1'], ground: ['#5BA65F', '#3C7D44'], groundHeight: 0.28, extras: ['trees', 'clouds'] },
  jungle: { sky: ['#9BE0B0', '#E9FAE2'], ground: ['#3E8E41', '#2E6E33'], groundHeight: 0.26, extras: ['trees', 'sun'] },
  ocean: { sky: ['#7EC8F2', '#DCF2FF'], ground: ['#3A9BDB', '#1F6FB0'], groundHeight: 0.34, extras: ['sun', 'clouds', 'waves'] },
  underwater: { sky: ['#1E7FB8', '#6AD0EE'], ground: ['#EBD8A8', '#D9C08A'], groundHeight: 0.18, extras: ['bubbles'] },
  beach: { sky: ['#8FD3FF', '#EDF9FF'], ground: ['#F3DDA3', '#E5C47D'], groundHeight: 0.26, extras: ['sun', 'waves', 'clouds'] },
  sky: { sky: ['#7FC3FF', '#FFE3F1'], groundHeight: 0, extras: ['sun', 'clouds'] },
  space: { sky: ['#0B0A2A', '#2B1B5E'], ground: ['#CFCBE0', '#A9A5C2'], groundHeight: 0.22, extras: ['stars', 'planet'] },
  night: { sky: ['#151140', '#3B2F7A'], ground: ['#2F5246', '#22392F'], groundHeight: 0.26, extras: ['stars', 'moon'] },
  castle: { sky: ['#9AD0FF', '#F2F8FF'], ground: ['#86CF6E', '#5DAA52'], groundHeight: 0.26, extras: ['castle', 'clouds'] },
  desert: { sky: ['#FFC48A', '#FFEBC8'], ground: ['#F2C46D', '#E2AE52'], groundHeight: 0.3, extras: ['sun', 'dunes'] },
  snow: { sky: ['#BFD9F2', '#F1F7FF'], ground: ['#FFFFFF', '#E3EEF8'], groundHeight: 0.3, extras: ['pines', 'snow'] },
  city: { sky: ['#A9D4FF', '#FBEFFF'], ground: ['#A3ACBD', '#7C8598'], groundHeight: 0.18, extras: ['buildings', 'clouds'] },
  cave: { sky: ['#2B2140', '#4B3A6B'], ground: ['#3A2F52', '#2A2240'], groundHeight: 0.24, extras: ['crystals'] },
  volcano: { sky: ['#FFB38A', '#FFE3CC'], ground: ['#6E5547', '#55423A'], groundHeight: 0.24, extras: ['volcano', 'clouds'] },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Vertical gradient made of soft bands; works on every platform without native modules. */
function Bands({ from, to, count = 14, style }: { from: string; to: string; count?: number; style?: object }) {
  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: mix(from, to, i / (count - 1)) }} />
      ))}
    </View>
  );
}

// Deterministic pseudo-random so scenes don't jump between renders.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const W = 1920;
const H = 1080;

function Extras({ scene, seed }: { scene: SceneStyle; seed: number }) {
  const r = useMemo(() => rng(seed), [seed]);
  const groundTop = H * (1 - scene.groundHeight);
  const out: React.ReactNode[] = [];

  for (const extra of scene.extras) {
    switch (extra) {
      case 'sun':
        out.push(<View key="sun" style={[s.circle, { left: px(1500), top: px(110), width: px(190), height: px(190), backgroundColor: '#FFE066', borderWidth: px(14), borderColor: 'rgba(255,224,102,0.35)' }]} />);
        break;
      case 'moon':
        out.push(<View key="moon" style={[s.circle, { left: px(1080), top: px(70), width: px(140), height: px(140), backgroundColor: '#FFF4C2' }]} />);
        break;
      case 'stars':
        for (let i = 0; i < 46; i++) {
          const size = 4 + r() * 7;
          out.push(<View key={`st${i}`} style={[s.circle, { left: px(r() * W), top: px(r() * groundTop * 0.85), width: px(size), height: px(size), backgroundColor: '#FFFBE6', opacity: 0.5 + r() * 0.5 }]} />);
        }
        break;
      case 'planet':
        out.push(<View key="planet" style={[s.circle, { left: px(230), top: px(150), width: px(220), height: px(220), backgroundColor: '#FF9F80' }]} />);
        out.push(<View key="ring" style={{ position: 'absolute', left: px(170), top: px(245), width: px(340), height: px(36), borderRadius: px(18), borderWidth: px(8), borderColor: '#FFD9A0', transform: [{ rotate: '-14deg' }] }} />);
        break;
      case 'clouds':
        for (let i = 0; i < 4; i++) {
          const x = 120 + i * 470 + r() * 120;
          const y = 90 + r() * 160;
          const w = 220 + r() * 120;
          out.push(
            <View key={`cl${i}`} style={{ position: 'absolute', left: px(x), top: px(y), width: px(w), height: px(w * 0.42) }}>
              <View style={[s.cloud, { left: 0, top: px(w * 0.14), width: px(w * 0.55), height: px(w * 0.28) }]} />
              <View style={[s.cloud, { left: px(w * 0.25), top: 0, width: px(w * 0.5), height: px(w * 0.38) }]} />
              <View style={[s.cloud, { left: px(w * 0.5), top: px(w * 0.12), width: px(w * 0.5), height: px(w * 0.3) }]} />
            </View>,
          );
        }
        break;
      case 'trees':
      case 'pines':
        for (let i = 0; i < 7; i++) {
          const x = i * 300 - 40 + r() * 90;
          if (x > 640 && x < 1180) continue; // keep the centre open for the hero
          const h = 260 + r() * 160;
          const top = groundTop - h + 40;
          const leaf = extra === 'pines' ? '#2F6D53' : i % 2 ? '#3F8F49' : '#4FA65A';
          out.push(
            <View key={`tr${i}`} style={{ position: 'absolute', left: px(x), top: px(top), width: px(170), height: px(h) }}>
              <View style={{ position: 'absolute', left: px(70), bottom: 0, width: px(30), height: px(h * 0.45), backgroundColor: '#7A5233', borderRadius: px(8) }} />
              {extra === 'pines' ? (
                <View style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, borderLeftWidth: px(85), borderRightWidth: px(85), borderBottomWidth: px(h * 0.75), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: leaf }} />
              ) : (
                <View style={[s.circle, { left: 0, top: 0, width: px(170), height: px(h * 0.62), backgroundColor: leaf }]} />
              )}
            </View>,
          );
        }
        break;
      case 'waves':
        for (let i = 0; i < 9; i++) {
          out.push(<View key={`wv${i}`} style={{ position: 'absolute', left: px(i * 230 - 40 + r() * 40), top: px(groundTop + 40 + (i % 3) * 70), width: px(150), height: px(18), borderRadius: px(9), backgroundColor: 'rgba(255,255,255,0.55)' }} />);
        }
        break;
      case 'bubbles':
        for (let i = 0; i < 26; i++) {
          const size = 16 + r() * 40;
          out.push(<View key={`bb${i}`} style={[s.circle, { left: px(r() * W), top: px(r() * groundTop), width: px(size), height: px(size), borderWidth: px(4), borderColor: 'rgba(255,255,255,0.6)' }]} />);
        }
        break;
      case 'castle':
        out.push(
          <View key="castle" style={{ position: 'absolute', left: px(1340), top: px(groundTop - 380), width: px(420), height: px(420) }}>
            <View style={{ position: 'absolute', left: px(60), bottom: 0, width: px(300), height: px(260), backgroundColor: '#E9DFF7' }} />
            <View style={{ position: 'absolute', left: 0, bottom: 0, width: px(110), height: px(360), backgroundColor: '#D8CCEE' }} />
            <View style={{ position: 'absolute', right: 0, bottom: 0, width: px(110), height: px(360), backgroundColor: '#D8CCEE' }} />
            <View style={{ position: 'absolute', left: px(160), bottom: 0, width: px(100), height: px(130), backgroundColor: '#8E6FC7', borderTopLeftRadius: px(50), borderTopRightRadius: px(50) }} />
            <View style={{ position: 'absolute', left: px(48), top: px(18), width: px(14), height: px(60), backgroundColor: '#7A5233' }} />
            <View style={{ position: 'absolute', left: px(62), top: px(18), width: px(50), height: px(30), backgroundColor: '#FF6B6B' }} />
          </View>,
        );
        break;
      case 'dunes':
        out.push(<View key="d1" style={[s.circle, { left: px(-200), top: px(groundTop - 90), width: px(1100), height: px(300), backgroundColor: '#EBB95E' }]} />);
        out.push(<View key="d2" style={[s.circle, { left: px(1100), top: px(groundTop - 120), width: px(1100), height: px(320), backgroundColor: '#E6B256' }]} />);
        break;
      case 'buildings':
        for (let i = 0; i < 9; i++) {
          const x = i * 220 - 20;
          if (x > 700 && x < 1150) continue;
          const h = 220 + r() * 260;
          const colors = ['#FFB4A2', '#B5E2FA', '#FDE68A', '#C4B5FD', '#A7F3D0'];
          out.push(
            <View key={`bd${i}`} style={{ position: 'absolute', left: px(x), top: px(groundTop - h + 6), width: px(180), height: px(h), backgroundColor: colors[i % colors.length], borderTopLeftRadius: px(10), borderTopRightRadius: px(10) }}>
              {Array.from({ length: Math.floor(h / 90) }, (_, k) => (
                <View key={k} style={{ position: 'absolute', left: px(32), top: px(28 + k * 80), width: px(116), height: px(34), backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: px(6) }} />
              ))}
            </View>,
          );
        }
        break;
      case 'crystals':
        for (let i = 0; i < 10; i++) {
          const x = r() * W;
          if (x > 650 && x < 1250) continue;
          const h = 90 + r() * 170;
          const colors = ['#8EE3EF', '#C9A7FF', '#FFB3E6'];
          out.push(<View key={`cr${i}`} style={{ position: 'absolute', left: px(x), top: px(groundTop - h + 30), width: 0, height: 0, borderLeftWidth: px(36), borderRightWidth: px(36), borderBottomWidth: px(h), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors[i % 3], opacity: 0.85 }} />);
        }
        break;
      case 'volcano':
        out.push(<View key="vol" style={{ position: 'absolute', left: px(1160), top: px(groundTop - 420), width: 0, height: 0, borderLeftWidth: px(360), borderRightWidth: px(360), borderBottomWidth: px(440), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#7C5F50' }} />);
        out.push(<View key="glow" style={[s.circle, { left: px(1460), top: px(groundTop - 450), width: px(120), height: px(70), backgroundColor: '#FF8A3D' }]} />);
        break;
      case 'snow':
        for (let i = 0; i < 40; i++) {
          const size = 6 + r() * 10;
          out.push(<View key={`sn${i}`} style={[s.circle, { left: px(r() * W), top: px(r() * H * 0.8), width: px(size), height: px(size), backgroundColor: '#FFFFFF', opacity: 0.85 }]} />);
        }
        break;
    }
  }
  return <>{out}</>;
}

export default function SceneBackdrop({ setting, imageUrl, seed = 1 }: { setting: Setting; imageUrl?: string; seed?: number }) {
  const scene = SCENES[setting] ?? SCENES.meadow;
  const groundTop = H * (1 - scene.groundHeight);
  const fade = useRef(new Animated.Value(0)).current;
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    fade.setValue(0);
    setLoadedUrl(undefined);
  }, [imageUrl, fade]);

  const onLoad = () => {
    setLoadedUrl(imageUrl);
    Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Bands from={scene.sky[0]} to={scene.sky[1]} />
      {scene.ground && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: px(groundTop), bottom: 0 }}>
          <Bands from={scene.ground[0]} to={scene.ground[1]} count={6} />
          <View style={[s.circle, { left: px(-300), top: px(-90), width: px(1300), height: px(260), backgroundColor: scene.ground[0] }]} />
          <View style={[s.circle, { left: px(900), top: px(-60), width: px(1400), height: px(220), backgroundColor: scene.ground[0] }]} />
        </View>
      )}
      <Extras scene={scene} seed={seed} />
      {imageUrl ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: loadedUrl === imageUrl ? fade : 0 }]}>
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={onLoad} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  circle: { position: 'absolute', borderRadius: 9999 },
  cloud: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 9999 },
});
