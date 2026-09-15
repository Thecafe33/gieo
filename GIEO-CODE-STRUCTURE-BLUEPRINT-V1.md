# GIEO CODE STRUCTURE BLUEPRINT V1

> **Vai trò của tài liệu này:** đây là bản đồ **cây thư mục / mã nguồn cụ thể** để hiện thực hóa `GIEO-SYSTEM-REBUILD-PLAN.md` (nguyên tắc kiến trúc, 13 phase, invariants) và `GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` (brief bàn giao).
>
> Tài liệu này **không thay thế** hai file trên — nó là **annex bắt buộc đi kèm**, trả lời câu hỏi "vậy code nằm ở đâu, file nào import file nào, debug bắt đầu từ đâu".
>
> **Trạng thái:** PLAN — chưa code gì. Dùng để đưa cho phiên Claude tiếp theo bám theo mà build.

---

# 0. NGUYÊN TẮC ĐỌC TÀI LIỆU NÀY

1. Không đổi bất kỳ quyết định kiến trúc nào đã khóa ở `GIEO-SYSTEM-REBUILD-PLAN.md` (23 hard invariants, 13 phase, command catalog). Tài liệu này chỉ ánh xạ chúng vào thư mục/file thật.
2. Mọi phần đánh dấu `[GIẢ ĐỊNH — CẦN AUDIT PHASE 0]` là suy đoán từ việc lướt code cũ (`posgieo.html`, `quanlygieo.html`), **chưa được xác nhận**. Theo invariant #12 ("không đoán legacy semantics khi ambiguous"), các phần này phải được Phase 0 audit xác nhận hoặc sửa lại trước khi khóa.
3. Cây thư mục là **hexagonal / ports-and-adapters**: domain core (`packages/fifo-core`, `packages/traceability`, ...) không phụ thuộc Firebase; các adapter (`legacy-firebase-adapter`, `persistence-firebase`) implement "port" do core định nghĩa. Đây là cách duy nhất để giữ đúng invariant "FIFO Engine là owner, không lẫn với Firebase schema cũ".

---

# 1. QUYẾT ĐỊNH CÔNG NGHỆ (đề xuất — cần chốt trước khi code)

| Hạng mục | Đề xuất | Lý do |
|---|---|---|
| Monorepo | `pnpm` workspaces | nhẹ, hỗ trợ nhiều `packages/*` + `apps/*` độc lập version |
| Ngôn ngữ | TypeScript strict | ép kiểu Unit/Operation/MutationPlan, tránh lỗi "đổi tên field" như legacy |
| Test | Vitest | chạy nhanh, dùng chung cho domain core lẫn regression suite |
| Build app | Vite | build `apps/pos`, `apps/quanly` thành bundle tĩnh nạp được trong APK WebView (giữ nguyên cách APK load HTML hiện tại) |
| Ràng buộc kiến trúc | `dependency-cruiser` (hoặc `eslint-plugin-boundaries`) | chặn cứng việc `apps/pos` import thẳng `packages/fifo-core` — bắt buộc đi qua `packages/commands` / `packages/read-layer` |
| Backend job | Firebase Cloud Functions (`functions/`) | chạy compaction theo lịch, không nhét logic đó vào client |
| Data | Giữ Firebase (RTDB và/hoặc Firestore — `[GIẢ ĐỊNH — CẦN AUDIT PHASE 0]` xác nhận đang dùng RTDB là chính, thấy path kiểu `active_units_gieogieo/{itemId}`) | không rewrite hạ tầng dữ liệu, chỉ đổi cách tổ chức đọc/ghi |

Đây là đề xuất mặc định để có tree cụ thể; nếu người dùng muốn stack khác (vd. giữ vanilla JS không TypeScript), chỉ cần đổi phần này, **cấu trúc thư mục ở mục 4 không đổi bản chất**.

---

# 2. QUY TẮC HƯỚNG PHỤ THUỘC (import direction) — BẮT BUỘC

```text
apps/pos, apps/quanly
        │  (chỉ được import)
        ▼
packages/commands   packages/read-layer   packages/protected-adapters
        │                    │
        ▼                    ▼
packages/fifo-core   packages/traceability   packages/recipe-cost-btp   packages/compaction
        │
        ▼
packages/store-context   packages/shared-kernel
        ▲
        │ (implement port, không được domain core import ngược)
packages/persistence-firebase   packages/legacy-firebase-adapter
```

Quy tắc cứng:

1. `apps/*` **không bao giờ** import trực tiếp `packages/fifo-core`, `packages/compaction`, `packages/legacy-firebase-adapter`, `packages/persistence-firebase`. Chỉ qua `packages/commands` (ghi) và `packages/read-layer` (đọc).
2. `packages/fifo-core`, `packages/traceability`, `packages/recipe-cost-btp`, `packages/compaction` là **pure domain** — không import Firebase SDK trực tiếp. Chúng định nghĩa **port** (interface), ai cần đọc/ghi Firebase thì implement port đó ở `packages/persistence-firebase` hoặc `packages/legacy-firebase-adapter`.
3. `packages/legacy-firebase-adapter` chỉ được đọc, không ghi vào path cũ (trừ script migration/cutover riêng trong `tools/`).
4. `packages/read-layer` là nơi **duy nhất** được phép biết cả `LIVE` lẫn `COMPACT` cùng lúc — không package/app nào khác được tự ý "if còn raw thì đọc raw, nếu không thì đọc snapshot".
5. Vi phạm 1 trong 4 điều trên = build fail (CI chặn bằng `dependency-cruiser`), không phải "review sau".

---

# 3. CÂY THƯ MỤC TOÀN REPO

```text
gieo/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .dependency-cruiser.cjs          # enforce mục 2 (import direction)
├── .eslintrc.cjs
├── firebase.json
├── .firebaserc
├── database.rules.json              # rules cho path CANONICAL mới (tách biệt path legacy)
├── firestore.rules                  # nếu Phase 0 xác nhận có dùng Firestore
│
├── docs/                                          # mọi tài liệu .md — nguồn sự thật kiến trúc
│   ├── 00-master/
│   │   ├── GIEO-SYSTEM-REBUILD-PLAN.md            # (giữ nguyên, di dời vào đây khi dọn repo)
│   │   ├── GIEO-NEW-CHAT-HANDOFF-FLAN-1.md
│   │   └── GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md    # chính file này
│   ├── phase-0-legacy-audit/
│   │   ├── LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md
│   │   ├── LEGACY-FIFO-AUDIT.md
│   │   └── LEGACY-FIREBASE-PATH-MAP-V1.md         # bảng path cũ -> ý nghĩa -> path canonical mới
│   ├── phase-1-foundation/
│   │   ├── CANONICAL-DOMAIN-MODEL-V1.md
│   │   ├── STORE-CONTEXT-CONTRACT-V1.md
│   │   └── OPERATION-IDEMPOTENCY-CONTRACT-V1.md
│   ├── phase-3-fifo/
│   │   └── FIFO-CORE-ARCHITECTURE-V2.md
│   ├── phase-5-recipe-cost-btp/
│   │   └── RECIPE-COST-BTP-CONTRACT-V1.md
│   ├── phase-6-compaction/
│   │   └── FIFO-COMPACTION-CONTRACT-V1.md
│   ├── phase-7-read-layer/
│   │   └── UNIFIED-READ-LAYER-CONTRACT-V1.md
│   ├── phase-8-commands/
│   │   └── DOMAIN-COMMAND-CATALOG-V1.md
│   ├── phase-12-shadow/
│   │   └── SHADOW-COMPARISON-MATRIX-V1.md
│   ├── phase-13-cutover/
│   │   └── CUTOVER-RUNBOOK-V1.md
│   └── bugs/
│       ├── BUG-kho-can.md
│       └── BUG-kho-can-updated.md                 # 24 bug — mỗi bug ánh xạ 1 file trong tests/regression/
│
├── legacy/                                        # snapshot hệ thống cũ — CHỈ ĐỌC, không sửa
│   ├── posgieo.html
│   └── quanlygieo.html
│
├── packages/
│   │
│   ├── shared-kernel/                             # kiểu dữ liệu & khái niệm dùng chung, không phụ thuộc gì khác
│   │   └── src/
│   │       ├── ids.ts                             # OperationId, UnitId, BillId, StoreId... (branded types, không lẫn nhau — invariant #4)
│   │       ├── result.ts                          # Result/Either + error taxonomy (không swallow error — invariant #11)
│   │       ├── operation-state.ts                 # PENDING/RUNNING/COMPLETED/FAILED_RETRYABLE/FAILED_MANUAL_REVIEW/CANCELLED
│   │       ├── mutation-plan.ts                   # type MutationPlan{operationId,...} theo mục 12 Master Plan
│   │       ├── clock.ts                           # businessDate helper (testable, không new Date() rải rác)
│   │       └── index.ts
│   │
│   ├── store-context/
│   │   └── src/
│   │       ├── organization.ts
│   │       ├── store.ts
│   │       ├── context.ts                         # StoreContext{organizationId, storeId, appInstanceId, deviceId, businessDate, actor, permissions, featureFlags}
│   │       ├── access.ts                          # role/permission + "ALL STORES" = aggregation scope, không phải state vật lý dùng chung
│   │       └── index.ts
│   │
│   ├── legacy-firebase-adapter/                   # đọc schema CŨ -> map sang canonical model. Không quyết định kiến trúc mới.
│   │   └── src/
│   │       ├── paths/
│   │       │   └── legacy-paths.ts                # TẤT CẢ path Firebase cũ tập trung 1 file — vd active_units_gieogieo/{itemId}, bank_confirmations/{orderId} [GIẢ ĐỊNH — CẦN AUDIT PHASE 0]
│   │       ├── mappers/
│   │       │   ├── map-unit.ts
│   │       │   ├── map-bill.ts
│   │       │   ├── map-recipe.ts
│   │       │   └── map-stock-tx.ts
│   │       ├── ports-impl/                        # implement các *SourcePort do domain core định nghĩa, chiều đọc-only
│   │       └── index.ts
│   │
│   ├── persistence-firebase/                      # đọc/ghi path CANONICAL mới (namespaced theo org/store)
│   │   └── src/
│   │       ├── canonical-paths.ts                 # orgs/{orgId}/stores/{storeId}/units/{unitId}, .../ledger/{entryId}, .../operations/{operationId}, .../snapshots/{period}/...
│   │       ├── repositories/
│   │       │   ├── unit-repository.firebase.ts    # implement UnitRepositoryPort (định nghĩa ở fifo-core/ports)
│   │       │   ├── ledger-repository.firebase.ts
│   │       │   └── operation-repository.firebase.ts
│   │       └── index.ts
│   │
│   ├── fifo-core/                                 # ★ TRÁI TIM HỆ THỐNG — pure domain, không import Firebase
│   │   ├── src/
│   │   │   ├── unit/
│   │   │   │   ├── unit.ts                        # Unit entity: unitId, code/label, itemId, storeId, receiptId, supplier, baseQty, unitBase, costBasis, status
│   │   │   │   ├── unit-base.ts                   # reducer thuần cho unitBase (không side-effect)
│   │   │   │   └── unit-lifecycle.ts              # RECEIVED→SEALED→OPEN→CONSUMING→SYSTEM_EXHAUSTED→PHYSICALLY_FINISHED→COMPACTABLE + nhánh LOST/FOUND/WASTE/REVERSED/ADJUSTED
│   │   │   ├── engine/                            # 10 responsibility của FIFO Engine (mục 7 Master Plan)
│   │   │   │   ├── select-eligible-unit.ts
│   │   │   │   ├── allocate-consumption.ts
│   │   │   │   ├── handle-debt.ts
│   │   │   │   ├── open-unit.ts
│   │   │   │   ├── finish-unit.ts
│   │   │   │   ├── system-exhaustion.ts
│   │   │   │   ├── physical-reconciliation.ts     # READ FRESH -> delta = actualQty - currentUnitBase -> unitBase = actualQty
│   │   │   │   ├── reverse-allocation.ts
│   │   │   │   └── rebuild-unit-state.ts
│   │   │   ├── ledger/
│   │   │   │   ├── stock-ledger-entry.ts
│   │   │   │   └── stock-adjustment.ts
│   │   │   ├── projection/
│   │   │   │   └── current-stock-projection.ts    # CHỈ hiển thị — invariant #3: không phải sole source of truth
│   │   │   ├── ports/                             # interface mà persistence-firebase / legacy-firebase-adapter phải implement
│   │   │   │   ├── unit-repository.port.ts
│   │   │   │   ├── ledger-repository.port.ts
│   │   │   │   └── operation-repository.port.ts
│   │   │   └── index.ts
│   │   └── __tests__/                             # unit test thuần, không đụng Firebase — cổng test đầu tiên trước khi lên command/app
│   │
│   ├── traceability/
│   │   └── src/
│   │       ├── trace-dependency.ts                # registry TRACE_DEPENDENCY{sourceType, sourceId, referencedBy[], status}
│   │       ├── forward-trace.ts                   # supplier → receipt → unit → open → allocation → bill/BTP/waste/lost/reversal/adjustment
│   │       ├── reverse-trace.ts                   # unit → mọi allocation → bill/BTP/...
│   │       └── index.ts
│   │
│   ├── recipe-cost-btp/
│   │   └── src/
│   │       ├── recipe/
│   │       │   ├── recipe-master.ts
│   │       │   ├── recipe-version.ts              # effective-from/to + store applicability
│   │       │   └── recipe-resolver.ts             # resolve theo billDate — CẤM lấy recipe hiện tại tính lại bill cũ (invariant #13)
│   │       ├── cost/
│   │       │   ├── cost-basis.ts
│   │       │   └── cost-resolver.ts               # CẤM dùng current cost tính lại lịch sử (invariant #14)
│   │       ├── btp/
│   │       │   ├── prep-batch.ts
│   │       │   ├── prep-yield.ts
│   │       │   └── prep-unit.ts
│   │       ├── variance/
│   │       │   ├── theoretical.ts                 # RecipeVersion × Sales
│   │       │   ├── actual.ts                      # Unit events + Waste + Count + Receiving + BTP yield
│   │       │   └── variance.ts                    # actual vs theoretical (invariant #15)
│   │       └── index.ts
│   │
│   ├── compaction/
│   │   └── src/
│   │       ├── lifecycle.ts                       # LIVE→CLOSED→SNAPSHOT_READY→COMPACTED→ARCHIVED/PURGED
│   │       ├── eligibility.ts                     # điều kiện COMPACTABLE (mọi dependency đã resolved)
│   │       ├── snapshot-builder.ts                # build snapshot đủ trường (mục 15.2 Handoff)
│   │       ├── snapshot-verifier.ts               # RAW → build → recalc → compare → PASS mới compact
│   │       ├── purge.ts                           # chỉ purge khi verified + no unresolved dependency
│   │       └── correction-rebuild.ts              # snapshot v1 → correction → rebuild → v2 (không UPDATE mù)
│   │
│   ├── read-layer/                                # ★ CỔNG ĐỌC DUY NHẤT — apps/report bắt buộc đi qua đây
│   │   └── src/
│   │       ├── get-unit-trace.ts
│   │       ├── get-consumption.ts
│   │       ├── get-waste.ts
│   │       ├── get-lost.ts
│   │       ├── get-cogs.ts
│   │       ├── get-revenue.ts
│   │       ├── get-inventory-history.ts
│   │       ├── get-btp-history.ts
│   │       ├── internal/
│   │       │   ├── live-source.ts
│   │       │   ├── compact-source.ts
│   │       │   └── merge-canonical.ts             # LIVE + COMPACT -> 1 canonical read model, UI không biết nguồn
│   │       └── index.ts
│   │
│   ├── commands/                                  # command pipeline dùng chung POS + QUANLY
│   │   └── src/
│   │       ├── pipeline.ts                        # VALIDATE→READ→CALCULATE→MUTATION_PLAN→IDEMPOTENCY→ENGINE→LEDGER→PROJECT→AUDIT→VERIFY
│   │       ├── sales/
│   │       │   ├── start-checkout.ts
│   │       │   ├── apply-promotion.ts
│   │       │   ├── capture-payment.ts
│   │       │   ├── split-payment.ts
│   │       │   ├── finalize-order.ts
│   │       │   └── reverse-order.ts
│   │       ├── inventory/
│   │       │   ├── open-container.ts
│   │       │   ├── mark-out-of-stock.ts
│   │       │   ├── receive-goods.ts
│   │       │   ├── count-stock.ts
│   │       │   ├── record-waste.ts
│   │       │   ├── transfer-stock.ts
│   │       │   ├── report-lost-container.ts
│   │       │   └── restore-found-container.ts
│   │       ├── prep/
│   │       │   ├── start-prep-batch.ts
│   │       │   ├── record-prep-measurement.ts
│   │       │   ├── record-prep-yield.ts
│   │       │   ├── consume-prep.ts
│   │       │   └── record-prep-waste.ts
│   │       ├── shift/
│   │       │   ├── check-in.ts
│   │       │   ├── check-out.ts
│   │       │   ├── open-day.ts
│   │       │   ├── record-handover.ts
│   │       │   └── close-day.ts
│   │       ├── master/                            # CreateProduct, PublishRecipeVersion, CreateEmployee, CreateVessel...
│   │       ├── approval/                          # ApproveStockCount, ApproveLostContainer, ApproveExpense...
│   │       ├── correction/                        # AdjustInventory, CorrectReceiving, ReverseOrder, CorrectBatchYield...
│   │       ├── configuration/                     # UpdateFinancePolicy, UpdateRefillPolicy...
│   │       └── reporting/                         # BuildStoreReport, ReconcileInventory, ReconcilePrep...
│   │
│   ├── protected-adapters/                        # KHÔNG rewrite semantics — chỉ wrap infra cũ (mục 14 Handoff)
│   │   └── src/
│   │       ├── bank-payment-adapter.ts            # wrap genBankOrderId(), VietQR, RTDB bank_confirmations/{orderId} — bankOrderId ≠ operationId
│   │       ├── printer-adapter.ts                 # wrap window.AndroidPrinter hiện có (đã xác nhận tồn tại trong posgieo.html)
│   │       ├── scanner-adapter.ts                 # wrap barcode scanner APK — KHÔNG thay bằng web camera
│   │       └── native-bridge-adapter.ts           # wrap window.Android bridge
│   │
│   └── reporting/
│       └── src/
│           ├── revenue-report.ts
│           ├── cogs-report.ts
│           ├── waste-report.ts
│           ├── lost-report.ts
│           ├── inventory-report.ts
│           ├── usage-report.ts
│           ├── btp-report.ts
│           ├── variance-report.ts
│           ├── store-comparison-report.ts
│           └── all-stores-report.ts
│
├── apps/
│   ├── pos/                                       # THIN CLIENT — build ra bundle nạp trong APK WebView (giữ tương thích bridge)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── bootstrap/
│   │       │   ├── store-context-init.ts
│   │       │   └── feature-flags.ts
│   │       ├── screens/
│   │       │   ├── checkout/
│   │       │   ├── cart/
│   │       │   ├── payment/
│   │       │   ├── shift/
│   │       │   ├── prep/
│   │       │   └── stock-use/
│   │       └── components/
│   │
│   └── quanly/                                    # THIN MANAGEMENT UI
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.ts
│           ├── screens/
│           │   ├── dashboard/
│           │   ├── master-data/
│           │   ├── approvals/
│           │   ├── corrections/
│           │   ├── reports/
│           │   └── unit-trace-drilldown/          # Store → Item → Unit → Bill/BTP/Waste/Lost → Recipe → Actor → Timeline
│           └── components/
│
├── functions/                                     # Firebase Cloud Functions
│   └── src/
│       ├── scheduled/
│       │   └── run-compaction.ts                  # cron gọi packages/compaction theo policy daily/weekly/monthly/yearly
│       ├── triggers/
│       │   └── on-write-audit.ts
│       └── index.ts
│
├── tools/
│   ├── legacy-audit-scripts/                      # Phase 0 — quét Firebase cũ, sinh input cho LEGACY-*-AUDIT-V1.md
│   ├── shadow-compare/                            # Phase 12 — OLD vs NEW
│   │   └── src/
│   │       ├── run-compare.ts
│   │       └── matrix/                            # sale.ts, fifo.ts, stock.ts, cogs.ts, waste.ts, btp.ts, receiving.ts, stock-count.ts, reversal.ts, snapshot.ts, report.ts
│   └── migration-scripts/                         # Phase 13 — cutover, backfill canonical từ legacy
│
└── tests/
    ├── regression/                                # 1 file = 1 bug trong BUG-kho-can-updated.md (24 bug → 24 file, đặt tên trùng số bug để tra cứu tức thì)
    │   ├── bug-01-management-adjustment-overwritten-by-unit-engine.spec.ts
    │   ├── bug-02-stock-adjustment-cache-race.spec.ts
    │   ├── bug-03-weighing-unit-factor-wrong.spec.ts
    │   ├── ...
    │   └── bug-24-found-lost-e2e-idempotency.spec.ts
    ├── scenario/                                  # theo Regression Master Suite (mục 18 Master Plan)
    │   ├── unit-fifo/
    │   ├── weighing/
    │   ├── receiving/
    │   ├── stock-count/
    │   ├── btp/
    │   ├── reversal/
    │   ├── lost-found/
    │   ├── add-on/
    │   └── compaction/
    └── e2e/
        ├── pos/
        └── quanly/
```

---

# 4. GIẢI THÍCH VÙNG CHỨC NĂNG

| Vùng | Trả lời câu hỏi | Ai được import nó |
|---|---|---|
| `packages/shared-kernel` | Kiểu dữ liệu nền tảng là gì? | mọi package |
| `packages/store-context` | Đang thao tác ở store/org nào, ai đang thao tác? | mọi package + apps |
| `packages/fifo-core` | Physical truth thay đổi thế nào? | chỉ `packages/commands`, `packages/read-layer`, `packages/traceability`, `packages/compaction` |
| `packages/traceability` | Trace 2 chiều thế nào? | `packages/read-layer`, `packages/commands` |
| `packages/recipe-cost-btp` | Recipe/cost/BTP tại thời điểm nào? | `packages/commands`, `packages/read-layer` |
| `packages/compaction` | Khi nào nén được, nén thành gì? | `packages/read-layer`, `functions/`, `tools/` |
| `packages/read-layer` | UI lấy dữ liệu để hiển thị ở đâu? | `apps/pos`, `apps/quanly`, `packages/reporting`, `tools/shadow-compare` |
| `packages/commands` | UI muốn thay đổi state thì gọi gì? | `apps/pos`, `apps/quanly` |
| `packages/protected-adapters` | Bank/máy in/scanner/bridge cũ nằm đâu? | `apps/pos` (chủ yếu), `packages/commands/sales` |
| `packages/legacy-firebase-adapter` | Dữ liệu cũ đọc ra sao mà không đoán bừa? | `packages/read-layer/internal`, `tools/migration-scripts` |
| `packages/persistence-firebase` | Dữ liệu mới ghi ở path nào? | implement port cho `packages/fifo-core`, `packages/compaction` |
| `apps/pos`, `apps/quanly` | UI thật, càng mỏng càng tốt | không ai import ngược lại chúng |

**Quy tắc debug nhanh (lý do tổ chức theo cách này):**
- Bug "sai số lượng tồn kho" → luôn bắt đầu ở `packages/fifo-core/src/unit` + `engine/`, không mò trong UI.
- Bug "UI hiện sai sau khi nén dữ liệu" → luôn ở `packages/read-layer/src/internal/merge-canonical.ts`, vì đó là nơi DUY NHẤT gộp LIVE+COMPACT.
- Bug "in bill sai/2 lần" → luôn ở `packages/protected-adapters/printer-adapter.ts` hoặc `packages/commands/sales/finalize-order.ts` (idempotency), không phải ở màn hình.
- Thêm tính năng mới (vd. thêm 1 loại report) → chỉ thêm 1 file trong `packages/reporting/src/`, không đụng `fifo-core`.
- Thêm 1 command nghiệp vụ mới → thêm 1 file trong đúng thư mục con của `packages/commands/src/`, theo đúng pipeline có sẵn.

---

# 5. ÁNH XẠ PHASE (Master Plan) ↔ THƯ MỤC ĐƯỢC TẠO/HOÀN THIỆN

| Phase | Nội dung (đã khóa ở Master Plan) | Thư mục/deliverable tương ứng |
|---|---|---|
| P0 | Legacy & snapshot/compaction audit | `docs/phase-0-legacy-audit/*` (không code) |
| P1 | Canonical foundation + Store context | `packages/shared-kernel`, `packages/store-context`, `packages/legacy-firebase-adapter` (skeleton + paths), `packages/protected-adapters` (skeleton) |
| P2 | Unit identity & physical state | `packages/fifo-core/src/unit/*` |
| P3 | FIFO Engine | `packages/fifo-core/src/engine/*`, `src/ledger/*`, `src/ports/*` |
| P4 | Traceability graph | `packages/traceability/*` |
| P5 | Recipe/Cost/BTP | `packages/recipe-cost-btp/*` |
| P6 | Snapshot/Compaction | `packages/compaction/*`, `functions/src/scheduled/run-compaction.ts` |
| P7 | Unified Read Layer | `packages/read-layer/*` |
| P8 | Domain Commands | `packages/commands/*` |
| P9 | POS | `apps/pos/*` |
| P10 | QUANLY | `apps/quanly/*` |
| P11 | Reporting/Reconciliation | `packages/reporting/*` |
| P12 | Shadow/So sánh cũ-mới | `tools/shadow-compare/*` |
| P13 | Cutover | `tools/migration-scripts/*`, `docs/phase-13-cutover/CUTOVER-RUNBOOK-V1.md` |

**Không được tạo thư mục của phase sau trước khi phase trước PASS gate** (đúng invariant "No-Skip Matrix" mục 19 Master Plan) — vd. không tạo `apps/pos/src/screens/checkout` thật (chỉ skeleton rỗng được phép) trước khi `packages/commands/src/sales` đã có contract từ P8.

---

# 6. QUY TẮC ĐẶT TÊN & FILE ĐI KÈM MỖI PACKAGE

Mỗi thư mục trong `packages/*` bắt buộc có:

```text
packages/<tên>/
├── package.json
├── README.md        # trả lời đủ 12 câu hỏi ở mục 23 GIEO-SYSTEM-REBUILD-PLAN.md
│                     # (physical truth ở đâu? owner mutation là ai? ledger gì? operationId?
│                     #  retry thế nào? reversal thế nào? forward/reverse trace? sau compact đọc lại thế nào?
│                     #  regression case nào bảo vệ nó?)
├── src/
└── __tests__/
```

Nếu README.md của 1 package chưa trả lời đủ 12 câu → package đó **chưa được phép implement**, đúng nguyên văn Master Plan.

Quy ước tên file test:
- `tests/regression/bug-<NN>-<slug-ngắn-mô-tả-bug>.spec.ts` — số `<NN>` khớp đúng thứ tự bug trong `BUG-kho-can-updated.md` để tra cứu 2 chiều tức thì.
- `packages/<x>/__tests__/<file-being-tested>.spec.ts` — test đơn vị nằm cạnh domain, không tách xa.

---

# 7. FIREBASE PATH — LEGACY vs CANONICAL (nháp, chờ Phase 0 xác nhận)

`[GIẢ ĐỊNH — CẦN AUDIT PHASE 0]` — bảng dưới chỉ dựa trên các path/tên hàm thấy được khi lướt `posgieo.html` (`active_units_gieogieo/{itemId}`, `bank_confirmations/{orderId}`, biến `_ueActiveUnitsRef`). Phase 0 phải liệt kê đầy đủ và xác nhận lại, không được lấy bảng này làm sự thật cuối cùng.

```text
LEGACY (đọc qua legacy-firebase-adapter, KHÔNG sửa)
  active_units_gieogieo/{itemId}          -> map-unit.ts
  bank_confirmations/{orderId}            -> bank-payment-adapter.ts (PROTECTED, không đổi)

CANONICAL MỚI (ghi qua persistence-firebase)
  orgs/{organizationId}/stores/{storeId}/units/{unitId}
  orgs/{organizationId}/stores/{storeId}/ledger/{entryId}
  orgs/{organizationId}/stores/{storeId}/operations/{operationId}
  orgs/{organizationId}/stores/{storeId}/snapshots/{period}/{unitId}
  orgs/{organizationId}/stores/{storeId}/bills/{billId}
```

Việc chốt bảng đầy đủ là output bắt buộc của `docs/phase-0-legacy-audit/LEGACY-FIREBASE-PATH-MAP-V1.md`.

---

# 8. VIỆC ĐẦU TIÊN CHO PHIÊN CLAUDE TIẾP THEO (không code ngay)

Theo đúng mục 22 của `GIEO-NEW-CHAT-HANDOFF-FLAN-1.md`, thứ tự bắt buộc:

1. Đọc `docs/00-master/*`, `docs/bugs/*`, và chính file này.
2. Tạo `docs/phase-0-legacy-audit/LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md` bằng cách đọc thật kỹ `legacy/posgieo.html` + `legacy/quanlygieo.html` (không đoán).
3. Tạo `docs/phase-0-legacy-audit/LEGACY-FIFO-AUDIT.md`.
4. Tạo `docs/phase-0-legacy-audit/LEGACY-FIREBASE-PATH-MAP-V1.md` (thay thế bảng nháp ở mục 7 file này).
5. Chỉ sau khi 3 file trên PASS, mới tạo `docs/phase-3-fifo/FIFO-CORE-ARCHITECTURE-V2.md`.
6. Sau đó mới tạo `docs/phase-6-compaction/FIFO-COMPACTION-CONTRACT-V1.md` và `docs/phase-7-read-layer/UNIFIED-READ-LAYER-CONTRACT-V1.md`.
7. **Chỉ sau khi 6 tài liệu trên được chốt mới được khởi tạo `pnpm-workspace.yaml` + scaffold `packages/shared-kernel`, `packages/store-context`.** Không nhảy thẳng vào `fifo-core`/`commands`/`apps` trước đó.

---

# 9. ĐỊNH NGHĨA "XONG" CHO TÀI LIỆU NÀY

Blueprint này coi là đủ dùng khi phiên Claude kế tiếp có thể, chỉ nhìn cây thư mục ở mục 3, trả lời được:
- Bug ở đâu thì sửa file nào (mục 4).
- Thêm tính năng X thì tạo file mới ở đâu, không đụng gì khác.
- Vì sao không được cho `apps/pos` gọi thẳng `fifo-core` (mục 2).
- Việc đầu tiên phải làm là gì (mục 8), không phải viết code POS/QUANLY ngay.
