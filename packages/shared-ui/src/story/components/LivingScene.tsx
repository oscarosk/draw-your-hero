import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import type { Mood, Setting, Weather } from '../protocol';
import { px } from '../theme';
import SceneBackdrop from './SceneBackdrop';
import { Particles, LightShafts, fxUrl, native, sceneUrl, useLoop, type ParticleKind } from './fx';

// A painted picture-book scene in four layers (sky, far, mid, front) that
// drift at different speeds, so the camera seems to glide through the world.
// Each setting also has its own living details: fireflies, snow, bubbles,
// embers, drifting clouds, beams of light.

type Ambient = { particles: [ParticleKind, number, [number, number, number, number]?][]; shafts?: number };

const AMBIENT: Record<Setting, Ambient> = {
  meadow: { particles: [['cloud', 3, [0, 60, 1920, 360]], ['petal', 8], ['dust', 6, [0, 500, 1920, 900]]] },
  forest: { shafts: 3, particles: [['firefly', 10, [0, 380, 1920, 920]], ['leaf', 5]] },
  jungle: { shafts: 3, particles: [['firefly', 8, [0, 380, 1920, 900]], ['leaf', 6]] },
  ocean: { particles: [['cloud', 2, [0, 80, 1920, 340]], ['twinkle', 8, [500, 640, 1420, 900]]] },
  underwater: { shafts: 4, particles: [['bubble', 18, [0, 0, 1920, 1080]], ['dust', 8, [0, 200, 1920, 900]]] },
  beach: { particles: [['cloud', 3, [0, 60, 1920, 320]], ['twinkle', 6, [0, 620, 1920, 760]]] },
  sky: { particles: [['cloud', 4, [0, 120, 1920, 700]], ['twinkle', 6, [0, 0, 1920, 600]]] },
  space: { particles: [['twinkle', 18, [0, 0, 1920, 760]], ['dust', 6, [0, 100, 1920, 700]]] },
  night: { particles: [['twinkle', 14, [0, 0, 1920, 560]], ['firefly', 12, [0, 520, 1920, 980]]] },
  castle: { particles: [['cloud', 2, [0, 60, 1920, 320]], ['sparkle', 6, [200, 100, 1800, 700]], ['petal', 6]] },
  desert: { particles: [['dust', 14, [0, 560, 1920, 1040]]] },
  snow: { particles: [['snow', 34]] },
  city: { particles: [['cloud', 2, [0, 60, 1920, 300]], ['dust', 8, [0, 400, 1920, 900]]] },
  cave: { particles: [['firefly', 10, [0, 200, 1920, 900]], ['twinkle', 8, [0, 500, 1920, 900]]] },
  volcano: { particles: [['ember', 18, [0, 200, 1920, 1080]]] },
};

const LAYERS = ['far', 'mid', 'front'] as const;
const DRIFT = { sky: 10, far: 28, mid: 60, front: 110 };
const ENTER = { far: 70, mid: 160, front: 300 };

interface Props {
  setting: Setting;
  imageUrl?: string;
  seed?: number;
  /** Changing this replays the "camera glides in" entrance. */
  entranceKey?: string | number;
  /** Darkens the scene (0..1) so text and cards on top stay readable. */
  dim?: number;
  ambient?: boolean;
  /** Time of day (recolours the scene). */
  mood?: Mood;
  /** Weather or magic in the air. */
  weather?: Weather;
  /** Which of the three paintings of this place. */
  variant?: number;
}

const DARK_SETTINGS: Setting[] = ['night', 'space', 'cave'];

// Colour grades laid over the painting: [top colour, bottom colour] with alpha.
const GRADE: Partial<Record<Mood, [string, string]>> = {
  morning: ['rgba(255,186,140,0.20)', 'rgba(255,236,190,0.04)'],
  sunset: ['rgba(120,50,150,0.38)', 'rgba(255,128,64,0.26)'],
  night: ['rgba(6,8,40,0.66)', 'rgba(14,14,58,0.48)'],
};

const WEATHER: Record<Weather, [ParticleKind, number, [number, number, number, number]?][]> = {
  clear: [],
  rain: [['rain', 46]],
  snow: [['snow', 30]],
  fog: [['fog', 5, [0, 560, 1920, 980]]],
  stars: [['twinkle', 16, [0, 0, 1920, 560]], ['sparkle', 3, [200, 60, 1720, 500]]],
  sparkles: [['sparkle', 10, [100, 80, 1820, 900]]],
  leaves: [['leaf', 9]],
  bubbles: [['bubble', 14]],
};

function Grade({ mood }: { mood: Mood }) {
  const g = GRADE[mood];
  if (!g) return null;
  const parse = (c: string) => c.match(/[\d.]+/g)!.map(Number);
  const [a, b] = [parse(g[0]), parse(g[1])];
  const n = 8;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const c = a.map((v, k) => (k < 3 ? Math.round(v + (b[k] - v) * t) : +(v + (b[k] - v) * t).toFixed(3)));
        return <View key={i} style={{ flex: 1, backgroundColor: `rgba(${c[0]},${c[1]},${c[2]},${c[3]})` }} />;
      })}
    </View>
  );
}

function LivingScene({ setting, imageUrl, seed = 1, entranceKey, dim = 0, ambient = true, mood, weather, variant = 0 }: Props) {
  const grade = mood && !DARK_SETTINGS.includes(setting) ? mood : undefined;
  const weatherFx = ambient && weather ? WEATHER[weather] ?? [] : [];
  const amb = AMBIENT[setting] ?? AMBIENT.meadow;
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const fades = useRef<Record<string, Animated.Value>>({}).current;
  const fade = (k: string) => {
    if (!fades[k]) fades[k] = new Animated.Value(0);
    return fades[k];
  };

  useEffect(() => {
    setLoaded({});
    for (const k of Object.keys(fades)) fades[k].setValue(0);
  }, [setting, variant]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoad = (k: string) => () => {
    setLoaded((l) => (l[k] ? l : { ...l, [k]: true }));
    Animated.timing(fade(k), { toValue: 1, duration: 600, useNativeDriver: native }).start();
  };

  // Camera: a slow sideways glide forever, plus a dolly-in when the page changes.
  const pan = useLoop(26000, { easing: Easing.inOut(Easing.sin) });
  const enter = useRef(new Animated.Value(1)).current;
  const dir = (typeof entranceKey === 'number' ? entranceKey : String(entranceKey ?? '').length + seed) % 2 === 0 ? 1 : -1;
  useEffect(() => {
    if (entranceKey === undefined) return undefined;
    enter.setValue(0);
    const a = Animated.timing(enter, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [entranceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const swing = pan.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-1, 1, -1] });
  const skyScale = Animated.add(
    pan.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.03, 1.08, 1.03] }),
    enter.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0] }),
  );

  const layerTransform = (k: (typeof LAYERS)[number]) => [
    {
      translateX: Animated.add(
        Animated.multiply(swing, px(DRIFT[k])),
        enter.interpolate({ inputRange: [0, 1], outputRange: [px(ENTER[k] * dir), 0] }),
      ),
    },
    { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1 + ENTER[k] / 2000, 1] }) },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {!loaded.sky ? <SceneBackdrop setting={setting} seed={seed} /> : null}

      {imageUrl ? (
        <Animated.Image
          source={{ uri: imageUrl }}
          onLoad={onLoad('sky')}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { opacity: fade('sky'), transform: [{ scale: skyScale }] }]}
        />
      ) : (
        <>
          <Animated.Image
            source={{ uri: sceneUrl(setting, 'sky', variant) }}
            onLoad={onLoad('sky')}
            resizeMode="cover"
            style={[StyleSheet.absoluteFill, { opacity: fade('sky'), transform: [{ translateX: Animated.multiply(swing, px(DRIFT.sky)) }, { scale: skyScale }] }]}
          />
          {amb.particles
            .filter(([k]) => k === 'cloud' || k === 'twinkle')
            .map(([k, n, area], i) =>
              ambient ? <Particles key={`b${i}`} kind={k} count={n} area={area} seed={seed + i} opacity={k === 'cloud' ? 0.9 : 1} /> : null,
            )}
          {LAYERS.map((k) => (
            <Animated.Image
              key={k}
              source={{ uri: sceneUrl(setting, k, variant) }}
              onLoad={onLoad(k)}
              resizeMode="stretch"
              style={[styles.layer, { opacity: fade(k), transform: layerTransform(k) }]}
            />
          ))}
        </>
      )}

      {ambient && amb.shafts ? <LightShafts count={amb.shafts} seed={seed} tint={setting === 'underwater' ? 0.3 : 0.38} /> : null}
      {ambient
        ? amb.particles
            .filter(([k]) => imageUrl || (k !== 'cloud' && k !== 'twinkle'))
            .map(([k, n, area], i) => <Particles key={`f${i}`} kind={k} count={n} area={area} seed={seed * 7 + i} />)
        : null}

      {grade ? <Grade mood={grade} /> : null}
      {grade === 'night' && ambient ? (
        <>
          <Particles kind="twinkle" count={14} area={[0, 0, 1920, 520]} seed={seed + 40} />
          <Particles kind="firefly" count={8} area={[0, 520, 1920, 960]} seed={seed + 41} />
        </>
      ) : null}
      {weatherFx.map(([k, n, area], i) => (
        <Particles key={`w${weather}${i}`} kind={k} count={n} area={area} seed={seed * 3 + 50 + i} />
      ))}
      {weather === 'rain' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(40,60,90,0.16)' }]} /> : null}
      <Image source={{ uri: fxUrl('vignette') }} resizeMode="stretch" style={StyleSheet.absoluteFill} />
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(14,10,38,${dim})` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: -px(140), width: px(2200), height: px(1080) },
});

export default memo(LivingScene);
