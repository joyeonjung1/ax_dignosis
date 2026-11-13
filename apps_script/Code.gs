/**
 * 구글 시트 저장 연결 스크립트 (Apps Script)
 * 설정 방법은 README.md 의 "3. 구글 시트 연결" 을 보세요.
 *
 * SECRET 이 비어 있으면(기본값) 비밀 문구 확인 없이 받습니다.
 * 나중에 쓰고 싶으면 문구를 적고 Vercel 환경변수 SHEET_SECRET 에 똑같이 넣으세요.
 */
var SECRET = '';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || (SECRET && body.secret !== SECRET)) return out_({ ok: false, error: 'forbidden' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    if (body.type === 'diagnosis') {
      var sh = sheet_(ss, '진단 결과', [
        '접수시각', '응답ID', '가게 소개', '시간 많이 쓰는 일', 'AI로 줄일 수 있는 시간(추정)',
        '매출 기회', '내일 할 일', '붙여넣을 말', '지원사업', '대화 기록', '진단서 원본(JSON)'
      ]);
      var d = body.diag || {};
      var time = (d.timeUse || []).map(function (x) {
        return x.task + (x.hours != null ? ' 주 ' + x.hours + '시간' : '') + (x.basis ? ' (' + x.basis + ')' : '');
      }).join('\n');
      var save = d.savable ? '주 ' + d.savable.min + '~' + d.savable.max + '시간' : '';
      var rev = (d.revenue || []).map(function (x) { return x.title; }).join('\n');
      var rx = d.rx || {};
      sh.appendRow([
        now, body.id, d.store || '', time, save, rev,
        (rx.title || '') + (rx.tool ? ' / ' + rx.tool : '') + (rx.minutes != null ? ' / ' + rx.minutes + '분' : ''),
        rx.prompt || '', d.support || '', body.transcript || '', JSON.stringify(d)
      ]);
      return out_({ ok: true });
    }

    if (body.type === 'contact') {
      var sh2 = sheet_(ss, '연락처', ['접수시각', '응답ID', '연락처', '진단서 발송 여부']);
      sh2.appendRow([now, body.id, body.contact || '', '']);
      return out_({ ok: true });
    }

    return out_({ ok: false, error: 'bad_type' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return out_({ ok: true, message: '연결됨' });
}

function sheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
  return sh;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
