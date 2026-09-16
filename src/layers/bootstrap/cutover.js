/**
 * P13 — PRODUCTION CUTOVER (GIEO-SYSTEM-REBUILD-PLAN.md §17).
 *
 * Trình tự bắt buộc:
 *
 *     OLD WRITER STOP → FINAL RECONCILIATION → NEW SYSTEM SOLE WRITER
 *                     → OLD SYSTEM RETAINED → ROLLBACK WINDOW
 *
 * Ba luật của §17 và cách chúng được cài vào cấu trúc chứ không nằm ở lời dặn:
 *
 *   "Không dual writer production" — trạng thái ghi được biểu diễn bằng MỘT
 *   trường `writer` nhận đúng một giá trị ('OLD' | 'NONE' | 'NEW'). Không có
 *   cách nào viết ra một trạng thái mà cả hai cùng ghi, nên không có gì để
 *   quên kiểm tra.
 *
 *   "Không partial migration" — không có bước nào chuyển một phần domain. Bước
 *   duy nhất đổi writer là `newSoleWriter`, và nó đổi toàn bộ.
 *
 *   "Cutover chỉ một lần" — `newSoleWriter` chạy lần thứ hai bị từ chối. Quay
 *   lui là đường RIÊNG (`rollback`) chỉ mở trong cửa sổ đã khai, và sau khi quay
 *   lui thì phải làm lại từ đầu, không "tiếp tục cutover dở".
 *
 * Module này KHÔNG tự ghi gì. Nó chỉ trả lời "được phép chuyển bước chưa" và
 * ghi lại ai chuyển, lúc nào, dựa trên bằng chứng nào.
 */
GIEO.define('bootstrap/cutover', [
  'shared-kernel/result'
], function (R) {
  'use strict';

  /* Ai đang được ghi. Đúng một giá trị tại một thời điểm. */
  var WRITER = { OLD: 'OLD', NONE: 'NONE', NEW: 'NEW' };

  var STEP = {
    NOT_STARTED: 'NOT_STARTED',
    OLD_WRITER_STOPPED: 'OLD_WRITER_STOPPED',
    FINAL_RECONCILED: 'FINAL_RECONCILED',
    NEW_SOLE_WRITER: 'NEW_SOLE_WRITER',
    ROLLED_BACK: 'ROLLED_BACK'
  };

  /* Ai được ghi ở mỗi bước. Cửa sổ NONE ở giữa là CỐ Ý: quán dừng ghi trong lúc
     đối chiếu lần cuối. Không có bước nào ánh xạ tới "cả hai". */
  var WRITER_AT = {
    NOT_STARTED: WRITER.OLD,
    OLD_WRITER_STOPPED: WRITER.NONE,
    FINAL_RECONCILED: WRITER.NONE,
    NEW_SOLE_WRITER: WRITER.NEW,
    ROLLED_BACK: WRITER.OLD
  };

  /* Điều kiện tiên quyết §17: P0..P12 đều phải PASS. */
  var REQUIRED_PHASES = [
    'P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
    'P7', 'P8', 'P9', 'P10', 'P11', 'P12'
  ];

  function actorAndTime(spec, what) {
    if (!spec || !spec.actorId) return 'bước ' + what + ' cần actorId — không có ai chịu trách nhiệm thì không phải cutover';
    if (typeof spec.at !== 'number') return 'bước ' + what + ' cần mốc thời gian';
    return null;
  }

  function createCutover(opts) {
    opts = opts || {};
    var step = STEP.NOT_STARTED;
    var phases = Object.create(null);
    var log = [];
    var rollbackWindowMs = typeof opts.rollbackWindowMs === 'number' ? opts.rollbackWindowMs : null;
    var cutoverAt = null;
    var attempted = false;

    function writer() { return WRITER_AT[step]; }

    function append(action, spec, extra) {
      log.push(Object.assign({
        action: action, step: step, writer: writer(),
        actorId: spec.actorId, at: spec.at
      }, extra || {}));
    }

    /**
     * Ghi nhận một phase đã PASS. BẮT BUỘC có bằng chứng — "đánh dấu xong" mà
     * không kèm bằng chứng thì chỉ là một ô tick, và ô tick không chặn được gì.
     */
    function recordPhase(spec) {
      if (!spec || REQUIRED_PHASES.indexOf(spec.phase) === -1) {
        return R.err('VALIDATION', 'phase không hợp lệ: ' + (spec && spec.phase));
      }
      var bad = actorAndTime(spec, 'ghi nhận phase');
      if (bad) return R.err('VALIDATION', bad);
      if (!spec.evidence || (typeof spec.evidence === 'string' && !spec.evidence.trim())) {
        return R.err('VALIDATION',
          'phase ' + spec.phase + ' cần bằng chứng PASS (tên test suite, số hiệu run, biên bản) — ' +
          'đánh dấu xong mà không có bằng chứng thì cổng này vô nghĩa');
      }
      phases[spec.phase] = {
        phase: spec.phase, evidence: spec.evidence,
        actorId: spec.actorId, at: spec.at
      };
      return R.ok(phases[spec.phase]);
    }

    function missingPhases() {
      return REQUIRED_PHASES.filter(function (p) { return !phases[p]; });
    }

    /** Cổng tiên quyết. MẶC ĐỊNH ĐÓNG. */
    function preconditions() {
      var missing = missingPhases();
      return missing.length
        ? R.err('PRECONDITION', 'thiếu ' + missing.length + ' phase chưa PASS: ' + missing.join(', '),
          { missing: missing })
        : R.ok({ ready: true, phases: REQUIRED_PHASES.map(function (p) { return phases[p]; }) });
    }

    function expect(current, what) {
      if (step !== current) {
        return R.err('PRECONDITION',
          what + ' phải chạy khi đang ở bước ' + current + ', hiện đang ở ' + step);
      }
      return null;
    }

    /** Bước 1 — dừng hệ cũ. Từ đây KHÔNG ai ghi cho tới khi đối chiếu xong. */
    function stopOldWriter(spec) {
      var e = expect(STEP.NOT_STARTED, 'dừng hệ cũ'); if (e) return e;
      var bad = actorAndTime(spec, 'dừng hệ cũ'); if (bad) return R.err('VALIDATION', bad);
      var pre = preconditions();
      if (R.isErr(pre)) return pre;
      step = STEP.OLD_WRITER_STOPPED;
      append('STOP_OLD_WRITER', spec);
      return R.ok({ step: step, writer: writer() });
    }

    /**
     * Bước 2 — đối chiếu lần cuối. Còn chênh lệch chưa giải thích thì KHÔNG đi
     * tiếp; quay lui ở đây rẻ, quay lui sau khi đã ghi thì không.
     */
    function finalReconciliation(spec) {
      var e = expect(STEP.OLD_WRITER_STOPPED, 'đối chiếu lần cuối'); if (e) return e;
      var bad = actorAndTime(spec, 'đối chiếu lần cuối'); if (bad) return R.err('VALIDATION', bad);
      if (!spec.report) return R.err('VALIDATION', 'đối chiếu lần cuối cần báo cáo đối chiếu');
      var unresolved = spec.report.unresolved || [];
      if (unresolved.length) {
        return R.err('PRECONDITION',
          'còn ' + unresolved.length + ' chênh lệch chưa giải quyết — KHÔNG cutover',
          { unresolved: unresolved });
      }
      step = STEP.FINAL_RECONCILED;
      append('FINAL_RECONCILIATION', spec, { report: spec.report });
      return R.ok({ step: step, writer: writer() });
    }

    /**
     * Bước 3 — hệ mới thành sole writer. Đây là điểm không quay đầu miễn phí,
     * nên nó chạy đúng một lần.
     */
    function newSoleWriter(spec) {
      if (attempted) {
        return R.err('CONFLICT',
          'cutover chỉ chạy MỘT lần (§17). Muốn về hệ cũ thì dùng rollback(), ' +
          'và sau rollback phải làm lại từ đầu chứ không tiếp tục cutover dở');
      }
      var e = expect(STEP.FINAL_RECONCILED, 'chuyển hệ mới thành sole writer'); if (e) return e;
      var bad = actorAndTime(spec, 'chuyển sole writer'); if (bad) return R.err('VALIDATION', bad);
      attempted = true;
      step = STEP.NEW_SOLE_WRITER;
      cutoverAt = spec.at;
      append('NEW_SOLE_WRITER', spec);
      return R.ok({
        step: step, writer: writer(),
        /* Hệ cũ được GIỮ LẠI (§17 "OLD SYSTEM RETAINED") — giữ lại để đọc, chứ
           không phải để ghi. Hai việc đó khác nhau. */
        oldSystemRetained: true,
        rollbackUntil: rollbackWindowMs === null ? null : spec.at + rollbackWindowMs
      });
    }

    function rollbackOpen(at) {
      if (step !== STEP.NEW_SOLE_WRITER) return false;
      if (rollbackWindowMs === null) return true;
      return at <= cutoverAt + rollbackWindowMs;
    }

    /**
     * Quay lui về hệ cũ. Chỉ trong cửa sổ đã khai, và phải nêu lý do —
     * quay lui không lý do thì không ai học được gì từ lần cutover hỏng.
     */
    function rollback(spec) {
      var e = expect(STEP.NEW_SOLE_WRITER, 'rollback'); if (e) return e;
      var bad = actorAndTime(spec, 'rollback'); if (bad) return R.err('VALIDATION', bad);
      if (!spec.reason || !String(spec.reason).trim()) {
        return R.err('VALIDATION', 'rollback cần lý do');
      }
      if (!rollbackOpen(spec.at)) {
        return R.err('PRECONDITION',
          'đã quá cửa sổ rollback — từ đây phải xử lý bằng correction có audit, không quay lui hàng loạt');
      }
      step = STEP.ROLLED_BACK;
      append('ROLLBACK', spec, { reason: spec.reason });
      return R.ok({ step: step, writer: writer(), reason: spec.reason });
    }

    /**
     * Mode runtime tương ứng với bước hiện tại. Hệ mới chỉ được WRITE sau khi
     * cutover xong — một nơi trả lời, để không ai tự đặt mode bằng tay.
     */
    function runtimeMode() {
      return step === STEP.NEW_SOLE_WRITER ? 'WRITE' : 'READ_ONLY';
    }

    function state() {
      return {
        step: step,
        writer: writer(),
        runtimeMode: runtimeMode(),
        cutoverAt: cutoverAt,
        rollbackWindowMs: rollbackWindowMs,
        missingPhases: missingPhases(),
        log: log.slice()
      };
    }

    /**
     * Khôi phục trạng thái đã lưu. Không có nó thì tải lại trang là quay về
     * bước đầu, và một hệ thống đã cutover sẽ tự coi mình chưa cutover.
     */
    function hydrate(saved) {
      if (!saved) return R.ok(state());
      if (saved.step && !Object.prototype.hasOwnProperty.call(STEP, saved.step)) {
        return R.err('VALIDATION', 'trạng thái cutover đã lưu không hợp lệ: ' + saved.step);
      }
      step = saved.step || STEP.NOT_STARTED;
      cutoverAt = typeof saved.cutoverAt === 'number' ? saved.cutoverAt : null;
      attempted = !!saved.attempted || step === STEP.NEW_SOLE_WRITER || step === STEP.ROLLED_BACK;
      if (typeof saved.rollbackWindowMs === 'number') rollbackWindowMs = saved.rollbackWindowMs;
      (saved.phases || []).forEach(function (p) {
        if (p && REQUIRED_PHASES.indexOf(p.phase) !== -1) phases[p.phase] = p;
      });
      log = (saved.log || []).slice();
      return R.ok(state());
    }

    /** Hình dạng đem đi lưu — đọc lại được bằng `hydrate`. */
    function toPersisted() {
      return {
        step: step,
        cutoverAt: cutoverAt,
        attempted: attempted,
        rollbackWindowMs: rollbackWindowMs,
        phases: REQUIRED_PHASES.map(function (p) { return phases[p]; }).filter(Boolean),
        log: log.slice()
      };
    }

    return {
      hydrate: hydrate,
      toPersisted: toPersisted,
      recordPhase: recordPhase,
      preconditions: preconditions,
      stopOldWriter: stopOldWriter,
      finalReconciliation: finalReconciliation,
      newSoleWriter: newSoleWriter,
      rollback: rollback,
      rollbackOpen: rollbackOpen,
      runtimeMode: runtimeMode,
      state: state
    };
  }

  return {
    WRITER: WRITER,
    STEP: STEP,
    WRITER_AT: WRITER_AT,
    REQUIRED_PHASES: REQUIRED_PHASES,
    createCutover: createCutover
  };
});
