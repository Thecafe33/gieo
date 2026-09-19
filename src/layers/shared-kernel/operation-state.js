/**
 * Operation state machine — invariant #5 ("mutation phải idempotent").
 *
 * Mọi mutation nghiệp vụ có đúng 1 operationId và đi qua đúng máy trạng thái này.
 * Legacy để mỗi hàm tự chế lớp chống-đúp riêng (3/6 đường tiêu thụ thiếu txId,
 * stock count dùng .add() random) — FIFO-CORE-ARCHITECTURE-V2.md §7.
 *
 * Tách FAILED_RETRYABLE khỏi FAILED_MANUAL_REVIEW là có chủ đích: máy được phép
 * tự thử lại cái thứ nhất, KHÔNG được tự thử lại cái thứ hai.
 */
GIEO.define('shared-kernel/operation-state', ['shared-kernel/result'], function (R) {
  'use strict';

  var STATES = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED_RETRYABLE: 'FAILED_RETRYABLE',
    FAILED_MANUAL_REVIEW: 'FAILED_MANUAL_REVIEW',
    CANCELLED: 'CANCELLED'
  };

  /* COMPLETED và CANCELLED là terminal — không đường ra. Chạy lại 1 operation
     COMPLETED phải là no-op trả kết quả cũ, không phải làm lại. */
  var TRANSITIONS = {
    PENDING: ['RUNNING', 'CANCELLED', 'FAILED_RETRYABLE', 'FAILED_MANUAL_REVIEW'],
    RUNNING: ['COMPLETED', 'FAILED_RETRYABLE', 'FAILED_MANUAL_REVIEW'],
    FAILED_RETRYABLE: ['RUNNING', 'CANCELLED', 'FAILED_MANUAL_REVIEW'],
    FAILED_MANUAL_REVIEW: ['RUNNING', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: []
  };

  var TERMINAL = { COMPLETED: true, CANCELLED: true };

  function isState(s) { return Object.prototype.hasOwnProperty.call(STATES, s); }
  function isTerminal(s) { return !!TERMINAL[s]; }

  function canTransition(from, to) {
    if (!isState(from) || !isState(to)) return false;
    return TRANSITIONS[from].indexOf(to) !== -1;
  }

  /** Trả Result thay vì throw: chuyển trạng thái sai là tình huống nghiệp vụ, không phải bug. */
  function transition(from, to) {
    if (!isState(from)) return R.err('VALIDATION', 'trạng thái nguồn không hợp lệ: ' + from);
    if (!isState(to)) return R.err('VALIDATION', 'trạng thái đích không hợp lệ: ' + to);
    if (isTerminal(from)) {
      return R.err('PRECONDITION', 'operation đã ở trạng thái cuối "' + from + '", không thể chuyển sang "' + to + '"');
    }
    if (!canTransition(from, to)) {
      return R.err('PRECONDITION', 'không cho phép chuyển "' + from + '" -> "' + to + '"');
    }
    return R.ok(to);
  }

  return {
    STATES: STATES,
    TRANSITIONS: TRANSITIONS,
    isState: isState,
    isTerminal: isTerminal,
    canTransition: canTransition,
    transition: transition
  };
});
