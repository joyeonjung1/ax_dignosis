# 제주 소상공인 AX 진단 설문 (Vercel 배포용)

사장님이 QR을 찍으면 로그인 없이 열리는 설문입니다.
AI 대화는 Gemini가 맡고, 결과는 구글 시트에 한 줄씩 쌓입니다.

```
사장님 휴대폰 ─ Vercel(화면 + /api) ─ Gemini API
                          └──────── 구글 시트(Apps Script)
```

## 폴더 구성
| 파일 | 하는 일 |
|---|---|
| `public/index.html` | 사장님이 보는 화면 (대화, 진단서, PDF 저장, 연락처 남기기) |
| `api/chat.js` | 질문 이어가기 (Gemini 호출) |
| `api/diag.js` | 진단서 만들기 (Gemini 호출) |
| `api/save.js` | 구글 시트로 저장 |
| `api/_prompts.js` | AI 지침. 서버에만 있고 화면에는 내려가지 않습니다 |
| `apps_script/Code.gs` | 구글 시트에 붙이는 연결 스크립트 |

## 1. Gemini API 키 발급
1. https://aistudio.google.com/apikey 에서 **API 키 만들기**
2. 키를 복사해 둡니다. (남에게 보이면 안 됩니다)

## 2. 구글 시트 연결 (가장 먼저 해 두세요)
1. 응답을 모을 구글 시트를 엽니다. (https://docs.google.com/spreadsheets/d/1LAVkdAoEAlVKboThSLZK1w2i4p7rBTSEQ6EBr8UndaI/edit)
2. 메뉴 **확장 프로그램 → Apps Script** 를 엽니다.
3. 기본 코드를 지우고 `apps_script/Code.gs` 내용을 전부 붙여넣습니다.
4. 비밀 문구(`SECRET`)는 기본값(빈칸)이라 따로 정하지 않아도 됩니다.
5. 오른쪽 위 **배포 → 새 배포 → 유형: 웹 앱**
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
6. **배포**를 누르고 권한 허용 창이 뜨면 허용합니다. (이 단계는 직접 눌러야 합니다)
7. 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사합니다.

## 3. Vercel 배포
터미널에서 이 폴더(`ax-survey-app`)로 이동한 뒤:

```bash
npm i -g vercel
```
```bash
vercel login
```
```bash
vercel --prod
```
처음 질문에는 모두 엔터(기본값)로 답해도 됩니다.

배포가 끝나면 Vercel 사이트의 **프로젝트 → Settings → Environment Variables**에 아래 4개를 넣습니다.

| 이름 | 값 |
|---|---|
| `GEMINI_API_KEY` | 1번에서 만든 키 |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `GEMINI_THINKING_LEVEL` | `low` |
| `SHEET_WEBHOOK_URL` | 2번 7단계의 웹 앱 URL |

`SHEET_SECRET`은 넣지 않아도 됩니다. (Code.gs의 SECRET을 비워 두었기 때문입니다.)

환경변수를 넣은 뒤에는 한 번 더 배포해야 적용됩니다.
```bash
vercel --prod
```

## 4. QR코드 만들기
배포 후 나오는 주소(`https://….vercel.app`)를 Claude에게 알려 주시면 QR코드와 안내문 PDF를 만들어 드립니다.

## 시험해 보기
1. 배포 주소를 휴대폰에서 열어 질문에 끝까지 답합니다.
2. 진단서가 나오고 PDF가 내려받아지는지 확인합니다.
3. 구글 시트 `진단 결과` 탭에 한 줄이 생겼는지 확인합니다.

## 비용과 안전
- 사장님이 한 번 진단을 끝내면 Gemini 호출이 약 10번 일어납니다. 사용량은 https://aistudio.google.com 에서 확인하세요.
- `api/*`에는 같은 사람이 짧은 시간에 너무 많이 쓰지 못하게 막는 간단한 제한이 들어 있습니다. 큰 행사에 배포하기 전에는 Gemini 쪽에서도 하루 사용 한도를 걸어 두세요.
- 연락처는 `연락처` 탭에만 저장됩니다. 진단서를 보낸 뒤에는 지워 주세요.
- 이 폴더의 `.env`는 올리지 마세요. 키는 Vercel 환경변수에만 넣습니다.
