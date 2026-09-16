/**
 * Employee — domain [0] IDENTITY, gốc của cây tính năng.
 *
 * Cấp `actorId` cho MỌI mutation ở mọi nhánh bên dưới (FEATURE-TREE-V1.md §2).
 *
 * `employeeId` và `actorId` là HAI id khác nhau, cố ý (invariant #4):
 *   - employeeId = hồ sơ nhân sự (lương, ca, hợp đồng)
 *   - actorId    = danh tính thao tác, thứ được ghi vào mọi ledger/audit
 * Tách ra vì thao tác của một người không nên chết theo hồ sơ nhân sự: nhân
 * viên nghỉ việc thì hồ sơ đóng lại, nhưng mọi bill/ledger họ từng ký vẫn phải
 * trỏ về đúng actor đó vĩnh viễn. Gộp 2 id là tự chuốc bài toán "xoá nhân viên
 * làm mồ côi lịch sử".
 */
GIEO.define('hr/employee', [
  'shared-kernel/ids',
  'shared-kernel/result',
  'compaction/versioned-input'
], function (ids, R, VI) {
  'use strict';

  function createEmployee(spec) {
    if (!spec || !spec.name) return R.err('VALIDATION', 'employee cần name');
    if (!ids.isId(spec.storeId, 'store')) return R.err('VALIDATION', 'employee cần storeId hợp lệ');
    if (spec.role && typeof spec.role !== 'string') return R.err('VALIDATION', 'role phải là chuỗi');

    return R.ok({
      employeeId: spec.employeeId || ids.newId('employee'),
      /* Cấp actorId ngay lúc tạo hồ sơ — không có đường nào tạo được nhân viên
         mà thiếu danh tính thao tác. */
      actorId: spec.actorId || ids.newId('actor'),
      storeId: spec.storeId,
      name: String(spec.name),
      /* FEATURE-TREE §3 mục [0]: thiết kế field role NGAY từ đầu dù legacy chưa
         có phân quyền thật — thêm sau thì dữ liệu cũ không có gì để điền. */
      role: spec.role || 'POS_OPERATOR',
      active: spec.active === undefined ? true : !!spec.active,
      hiredAt: spec.hiredAt || null,
      terminatedAt: spec.terminatedAt || null
    });
  }

  /** Nghỉ việc = đóng hồ sơ, KHÔNG xoá — lịch sử thao tác phải còn trỏ về được. */
  function terminate(employee, at) {
    if (!employee.active) return R.err('PRECONDITION', 'nhân viên đã nghỉ việc');
    if (typeof at !== 'number') return R.err('VALIDATION', 'terminate cần thời điểm');
    var next = Object.assign({}, employee, { active: false, terminatedAt: at });
    return R.ok(next);
  }

  function isEmployedAt(employee, at) {
    if (employee.hiredAt && at < employee.hiredAt) return false;
    if (employee.terminatedAt && at >= employee.terminatedAt) return false;
    return true;
  }

  /**
   * PayTerms đi qua ĐÚNG cơ chế versioning dùng chung, không phải cơ chế riêng
   * của payroll (FIFO-COMPACTION-CONTRACT-V1.md §1 — đây là instance #5 của lớp
   * lỗi đã xác nhận 7 lần).
   */
  function publishPayTerms(registry, spec) {
    if (!spec) return R.err('VALIDATION', 'publishPayTerms cần spec');
    if (!ids.isId(spec.employeeId, 'employee')) return R.err('VALIDATION', 'cần employeeId hợp lệ');

    var t = spec.terms;
    if (!t) return R.err('VALIDATION', 'publishPayTerms cần terms');
    if (typeof t.rate !== 'number' || t.rate < 0) return R.err('VALIDATION', 'terms.rate phải là số không âm');
    if (t.otRate !== undefined && (typeof t.otRate !== 'number' || t.otRate < 0)) {
      return R.err('VALIDATION', 'terms.otRate phải là số không âm');
    }
    if (t.otThreshold !== undefined && (typeof t.otThreshold !== 'number' || t.otThreshold <= 0)) {
      return R.err('VALIDATION', 'terms.otThreshold phải là số dương');
    }

    return registry.publish({
      kind: VI.KINDS.payTerms,
      subjectId: spec.employeeId,
      storeId: spec.storeId,
      effectiveFrom: spec.effectiveFrom,
      publishedBy: spec.publishedBy,
      payload: {
        rate: t.rate,
        otRate: t.otRate === undefined ? t.rate : t.otRate,
        otThreshold: t.otThreshold === undefined ? 8 : t.otThreshold,
        /* Lương cứng: có mặt nhưng công thức trừ theo lịch làm việc còn để ngỏ,
           xem README "Điểm còn treo". Không tự quyết thay chủ quán. */
        fixedMonthlySalary: t.fixedMonthlySalary === undefined ? null : t.fixedMonthlySalary
      }
    });
  }

  /** Resolve PayTerms có hiệu lực tại thời điểm sự kiện — KHÔNG phải hiện tại. */
  function resolvePayTermsAt(registry, employeeId, storeId, at) {
    return registry.resolveAt(VI.KINDS.payTerms, employeeId, storeId, at);
  }

  return {
    createEmployee: createEmployee,
    terminate: terminate,
    isEmployedAt: isEmployedAt,
    publishPayTerms: publishPayTerms,
    resolvePayTermsAt: resolvePayTermsAt
  };
});
