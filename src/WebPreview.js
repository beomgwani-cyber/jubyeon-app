// 개발용: 웹(PC 브라우저)에서 인포그래픽·결과 화면 디자인을 확인한다. 휴대폰 앱에서는 쓰이지 않는다.
// 사용: 웹 빌드 폴더에 preview.json(기록 1개)과 사진을 두고 index.html#infographic 또는 #screen 으로 연다.
//       책상정리는 preview_desk.json을 두고 #desk(결과 화면) 또는 #deskcard(공유 카드)로 연다.
//       맞춤 안경은 preview_glasses.json을 두고 #glasses(결과 화면) 또는 #glassescard(공유 카드)로 연다.

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import Infographic from './components/Infographic.js';
import { DeskShareCard } from './desk/DeskParts.js';
import { GlassesShareCard } from './glasses/GlassesParts.js';
import GlassesResultScreen from './glasses/GlassesResultScreen.js';
import { normalizeGlasses } from './glasses/rules.js';
import DeskResultScreen from './desk/DeskResultScreen.js';
import { normalizeDesk } from './desk/rules.js';
import { normalize } from './rules.js';
import ResultScreen from './screens/ResultScreen.js';

export function isWebPreview() {
  return typeof window !== 'undefined' && /^#(infographic|screen|desk|deskcard|glasses|glassescard)$/.test(window.location?.hash || '');
}

export default function WebPreview() {
  const [record, setRecord] = useState(null);
  const mode = window.location.hash.slice(1);
  const isDesk = mode.startsWith('desk');
  const isGlasses = mode.startsWith('glasses');
  useEffect(() => {
    fetch(isDesk ? 'preview_desk.json' : isGlasses ? 'preview_glasses.json' : 'preview.json')
      .then((r) => r.json())
      .then((rec) => {
        const result = isDesk
          ? normalizeDesk(rec.raw, rec.budget)
          : isGlasses
            ? normalizeGlasses(rec.raw, rec.prefs)
            : normalize(rec.raw);
        setRecord({ ...rec, result });
      });
  }, [isDesk, isGlasses]);
  if (!record) return <Text>loading</Text>;
  if (mode === 'infographic' || mode === 'deskcard' || mode === 'glassescard') {
    const Card = { deskcard: DeskShareCard, glassescard: GlassesShareCard }[mode] || Infographic;
    return (
      <View nativeID="shot" style={{ alignSelf: 'flex-start' }}>
        <Card record={record} />
      </View>
    );
  }
  const Screen = isDesk ? DeskResultScreen : isGlasses ? GlassesResultScreen : ResultScreen;
  return (
    <View style={{ width: window.innerWidth, height: window.innerHeight }}>
      <Screen record={record} apiKey="" onBack={() => {}} onDelete={() => {}} onUpdate={() => {}} />
    </View>
  );
}
