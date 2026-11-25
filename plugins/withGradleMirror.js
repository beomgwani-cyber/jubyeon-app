// EAS 빌드 서버에서 Gradle을 GitHub에서 내려받다가 HTTP 504로 실패하는 문제를 피하기 위해
// Gradle 배포 파일 주소를 미러로 바꾼다.
// 공식 SHA-256 값을 함께 지정하므로, 미러 파일이 공식 파일과 1바이트라도 다르면 빌드가 즉시 중단된다.

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MIRROR = 'https://mirrors.cloud.tencent.com/gradle';
// 공식 체크섬: https://services.gradle.org/distributions/gradle-<버전>-bin.zip.sha256
const OFFICIAL_SHA256 = {
  '8.14.3': 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531',
};

module.exports = function withGradleMirror(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
      let text = fs.readFileSync(file, 'utf8');
      const m = text.match(/^distributionUrl=.*gradle-([\d.]+)-(bin|all)\.zip\s*$/m);
      const sha = m && OFFICIAL_SHA256[m[1]];
      if (!m || m[2] !== 'bin' || !sha) {
        // 체크섬을 모르는 버전이면 안전을 위해 원래 주소를 그대로 둔다
        console.warn(`[withGradleMirror] 알 수 없는 Gradle 버전이라 미러를 적용하지 않습니다: ${m ? m[0] : '(없음)'}`);
        return cfg;
      }
      text = text.replace(m[0], `distributionUrl=${MIRROR}/gradle-${m[1]}-bin.zip`);
      text = text.replace(/^distributionSha256Sum=.*\n?/m, '');
      text = text.trimEnd() + `\ndistributionSha256Sum=${sha}\n`;
      fs.writeFileSync(file, text);
      return cfg;
    },
  ]);
};
