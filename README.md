# Remote Desktop

TeamViewer와 유사한 원격 데스크톱 프로그램입니다.

## 기능

- 🖥️ **실시간 화면 공유** - 낮은 지연시간으로 원격 화면 전송
- ⌨️ **원격 제어** - 마우스, 키보드 입력 제어
- 📁 **파일 전송** - 드래그 앤 드롭으로 파일 전송
- 🔐 **보안** - 종단간 암호화 (E2EE)

## 프로젝트 구조

```
remote-desktop/
├── apps/
│   ├── desktop/          # Electron 데스크톱 앱
│   └── server/           # 시그널링/릴레이 서버
├── packages/
│   ├── core/             # 공통 로직
│   ├── protocol/         # 프로토콜 정의
│   ├── crypto/           # 암호화 모듈
│   └── screen-capture/   # 화면 캡처 (네이티브)
└── docs/                 # 문서
```

## 시작하기

### 요구사항

- Node.js 18+
- npm 9+

### 설치

```bash
cd remote-desktop
npm install
```

### 개발 서버 실행

```bash
# 시그널링 서버 실행
npm run server

# 데스크톱 앱 실행 (다른 터미널)
npm run dev
```

### 빌드

```bash
npm run build
```

## 기술 스택

- **데스크톱**: Electron + React + TypeScript
- **서버**: Node.js + WebSocket + Express
- **암호화**: Web Crypto API (AES-256-GCM, ECDH)
- **네트워킹**: WebRTC + WebSocket

## 라이선스

MIT
