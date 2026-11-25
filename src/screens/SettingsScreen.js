import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_MODEL } from '../openai.js';
import { C } from '../theme.js';

export default function SettingsScreen({ settings, onSave, onBack }) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [showKey, setShowKey] = useState(false);

  async function save() {
    await onSave({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL });
    Alert.alert('저장됨', '설정을 저장했습니다.');
    onBack();
  }

  function clearKey() {
    Alert.alert('키 삭제', '휴대폰에 저장된 API 키를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setApiKey('');
          await onSave({ apiKey: '', model: model.trim() || DEFAULT_MODEL });
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>설정</Text>

      <Text style={styles.label}>ChatGPT API 키</Text>
      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="sk-..."
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!showKey}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Pressable style={styles.smallBtn} onPress={() => setShowKey((v) => !v)}>
          <Text style={styles.smallBtnText}>{showKey ? '가리기' : '보기'}</Text>
        </Pressable>
        <Pressable style={styles.smallBtn} onPress={clearKey}>
          <Text style={[styles.smallBtnText, { color: '#D32F2F' }]}>키 삭제</Text>
        </Pressable>
      </View>
      <Text style={styles.help}>
        platform.openai.com → API keys 에서 발급하고, Billing에서 크레딧을 충전해야 합니다.
        키는 이 휴대폰 안에만 저장되며 앱 코드나 다른 곳으로 보내지 않습니다(분석 요청 시 OpenAI에만 전달).
      </Text>

      <Text style={styles.label}>분석 모델</Text>
      <TextInput style={styles.input} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} />
      <Text style={styles.help}>기본값 {DEFAULT_MODEL}. 모델 오류가 나면 gpt-5 등으로 바꿔 보세요.</Text>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>개인정보·보안 안내</Text>
        <Text style={styles.noticeText}>
          분석할 사진은 인터넷을 통해 OpenAI 서버로 전송됩니다. 기관 보안 규정상 업무 공간 사진의
          외부 전송이 허용되는지 확인하고 사용하세요. 사람 얼굴·문서·화면이 찍히지 않게 촬영하세요.
        </Text>
      </View>

      <Pressable style={[styles.btn, { backgroundColor: C.navy }]} onPress={save}>
        <Text style={styles.btnText}>저장</Text>
      </Pressable>
      <Pressable style={[styles.btn, { backgroundColor: C.card }]} onPress={onBack}>
        <Text style={[styles.btnText, { color: C.navy }]}>취소</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: C.navy, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text },
  help: { fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 17 },
  smallBtn: { backgroundColor: 'white', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnText: { color: C.navy, fontWeight: '700' },
  notice: { backgroundColor: '#FFF4E0', borderRadius: 10, padding: 12, marginTop: 20 },
  noticeTitle: { color: '#9A4F00', fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#7A3E00', fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  btnText: { color: 'white', fontWeight: '800', fontSize: 16 },
});
