# Hàm ghi vào dữ liệu thuộc engine (tự sinh từ AST)

Sinh bởi `tools/bang_ghi_engine.js` từ `inv_ast.json`. `inventory_items` / `prep_items` chỉ tính khi có ghi trường trạng thái tồn (2.9).

## POS — 51 hàm

| Hàm | Dòng | Ghi gì |
|---|---|---|
| `unitEngineAllocateConsumption` | 3687 | `(động)` update (unitBase); RT transaction |
| `_ueRecomputeCurrentStock` | 3843 | `(động)` tx.update (_ueLastRecomputeStart, currentStock, pendingShortage) |
| `_ueSyncQtyRemainingClamped` | 3944 | `prep_batches` update (qtyRemaining) |
| `unitEngineReverseAllocations` | 3969 | `(động)` update (unitBase); RT transaction |
| `_ueClaimedReverseAllocations` | 4061 | `reversal_unit_claims` tx.set/set (itemId, status) |
| `unitEngineOnOpen` | 4138 | `(động)` update; RT transaction |
| `unitEngineFinishOpenUnit` | 4216 | RT transaction |
| `_applyFifoNotEmpty` | 4530 | `stock_containers` update (needsReview, unitBase); `stock_transactions` add (itemId, qty, status, type); RT transaction |
| `submitOpenContainer` | 4924 | `stock_containers` tx.update (openedAt, status) |
| `confirmOpenLabelStuck` | 5140 | `stock_containers` update |
| `writeAtomicContainerFinish` | 5299 | RT transaction |
| `_reverseAtomicContainerFinish` | 5367 | `stock_containers` update (status); RT set |
| `markOpenLabelStuck` | 5575 | `stock_containers` update |
| `markStockLabelsPrinted` | 5686 | `stock_containers` update |
| `logStockAnomalyPOS` | 5857 | `stock_anomalies` set (itemId, qty, status) |
| `createContainersForReceipt` | 5900 | `stock_containers` set |
| `_wastePrepQtyPOS` | 9785 | `prep_items` tx.update (currentStock); `prep_transactions` tx.set (qty, type) |
| `_submitKhoTxImpl` | 10218 | `stock_containers` tx.update/update (finishedAt, needsReview, status, unitBase); RT transaction/remove |
| `prepReconAcquire` | 12021 | RT transaction |
| `prepReconRelease` | 12047 | `prep_ingredient_locks` tx.delete; RT transaction |
| `prepReconSetUnit` | 12071 | `stock_containers` update (unitBase); RT transaction |
| `prepReconAttachOpenUnit` | 12168 | `prep_batches` tx.update |
| `prepReconRegisterNew` | 12203 | `prep_batches` tx.update |
| `prepReconOpenNext` | 12240 | `prep_batches` tx.update |
| `prepReconRefreshStale` | 12445 | `prep_batches` tx.update |
| `prepReconPostSave` | 12641 | `prep_batches` tx.update/update; `stock_containers` update (unitBase) |
| `_startPrepBatchImpl` | 12995 | `prep_batches` set (finishedAt, qtyRemaining, status) |
| `_submitPrepCancelImpl` | 13594 | `prep_batches` tx.update/update (status) |
| `_submitPrepFinishImpl` | 13698 | `prep_batches` tx.update/update (finishedAt, qtyRemaining, status, unitBase); `prep_items` tx.update (currentStock); `prep_transactions` tx.set (qty, type) |
| `_applyPrepYieldEdit` | 13984 | `prep_batches` update (qtyRemaining, status, unitBase); `prep_transactions` add (qty, type); RT transaction |
| `_submitPrepWasteImpl` | 14203 | `prep_items` tx.update (currentStock); `prep_transactions` tx.set (qty, type); RT transaction/remove |
| `submitFoundLostContainer` | 14849 | `stock_containers` update (status); RT set |
| `bulkReprintByDateConfirm` | 15123 | `stock_containers` update (code); RT update |
| `missingLabelDoReprint` | 15325 | `stock_containers` update (code); RT update |
| `applyStockTransactionPOS` | 15841 | `stock_transactions` tx.set |
| `setLocationStockFromCountPOS` | 16065 | `inventory_items` tx.update (locationStock); `stock_transactions` tx.set (itemId, qty, status, type) |
| `applyStockTransferPOS` | 16099 | `stock_transactions` tx.set |
| `prepShortageClearAll` | 19361 | `prep_items` update (untrackedPendingDelta); RT remove |
| `_submitPrepCountImpl` | 19802 | `prep_batches` update (_ueRtStale, qtyRemaining, status, unitBase); `prep_items` tx.update (currentStock, pendingShortage, untrackedPendingDelta); `prep_transactions` tx.set (qty, type); RT remove/transaction |
| `shiftWeighApplyLinePOS` | 20480 | RT transaction |
| `shiftWeighFinishPOS` | 20616 | `stock_containers` update (unitBase) |
| `shiftWeighReclassToConsumptionPOS` | 20712 | `stock_transactions` tx.set (itemId, qty, status, type) |
| `submitShiftInventoryCountPOS` | 20830 | `(động)` tx.set |
| `applyPrepConsumptionPOS` | 22500 | `prep_transactions` tx.set (qty, type) |
| `applySalesConsumptionPOS` | 22622 | `order_stock_traces` set |
| `applyBackfillConsumptionNoStockEffect` | 22830 | `stock_transactions` add (itemId, qty, status, type); `prep_transactions` add (qty, type); `order_stock_traces` set |
| `reverseSalesConsumptionPOS` | 22962 | `order_stock_traces` set |
| `_voidBackfillConsumptionPOS` | 23034 | `order_stock_traces` set |
| `_reverseIngredientConsumptionPOS` | 23124 | `stock_transactions` tx.set (itemId, qty, status, type) |
| `_reversePrepConsumptionPOS` | 23229 | `prep_transactions` tx.set (qty, type) |
| `applyAddonConsumptionPOS` | 27156 | `order_stock_traces` set |

## Quản lý — 23 hàm

| Hàm | Dòng | Ghi gì |
|---|---|---|
| `addInventoryItem` | 4426 | `inventory_items` add (currentStock) |
| `fixRecWizApply` | 4883 | `stock_containers` tx.update/update (needsReview, status, unitBase); `inventory_items` tx.update (currentStock); `stock_transactions` tx.update (qty); RT transaction |
| `ctnMarkReviewed` | 5029 | `stock_containers` update (needsReview) |
| `ctnAdjustCore` | 5605 | `inventory_items` tx.update (currentStock); `stock_transactions` tx.set (itemId, qty, status, type); `stock_containers` tx.update (unitBase); RT transaction |
| `ctnRestoreAtomicSealed` | 5669 | `stock_containers` update (status) |
| `applyStockTransaction` | 6445 | `stock_transactions` tx.set |
| `logStockAnomaly` | 6514 | `stock_anomalies` set (itemId, qty, status) |
| `recomputeTemStock` | 6526 | `inventory_items` tx.update (currentStock) |
| `recomputePrepStock` | 6560 | `prep_items` tx.update (currentStock, pendingShortage) |
| `reverseIntoUnits` | 6582 | `(động)` update; RT transaction |
| `approvePendingLostReportsForItem` | 6656 | `stock_containers` tx.update (status); `stock_transactions` set (itemId, qty, status, type); RT remove |
| `applyStockTransfer` | 6841 | `inventory_items` tx.update (locationStock); `stock_transactions` tx.set |
| `addPrepItem` | 7077 | `prep_items` add (currentStock) |
| `wasteAssignSave` | 8468 | `(động)` update (responsibility) |
| `_btpSaveSubs` | 10116 | `(động)` update |
| `_btpAmApplySubstitution` | 10139 | `stock_anomalies` update (status) |
| `prepBatchSetQtyCore` | 12748 | `prep_batches` update (_ueRtStale, qtyRemaining, unitBase); `prep_items` tx.update (currentStock); RT transaction |
| `prepBatchRestoreCore` | 12802 | `prep_batches` update (_ueRtStale, qtyRemaining, status, unitBase); `prep_items` tx.update (currentStock); `prep_transactions` tx.update (reclassifiedFrom, type); RT set |
| `prepBatchExtendExpiryCore` | 12985 | `prep_batches` update |
| `qlReverseStockForOrder` | 14614 | `reversal_unit_claims` tx.set/set (itemId, status); `stock_transactions` tx.set (itemId, qty, status, type); `prep_transactions` tx.set (qty, type) |
| `thangKetDuyetSuKien` | 18579 | `stock_transactions` update (needsReview) |
| `submitPrepAdjust` | 23446 | `prep_items` tx.update (currentStock); `prep_transactions` tx.set (qty, type); `prep_batches` update (qtyRemaining, status, unitBase); RT transaction/remove |
| `setLocationStock` | 24229 | `inventory_items` tx.update (locationStock); `stock_transactions` tx.set (itemId, qty, status, type) |

