/* SINH TỰ ĐỘNG bởi node tools/automation/engine2_sim.js --calibrate — KHÔNG SỬA TAY.
 * Tham số «hiệu chuẩn mô phỏng»: điểm xuất phát cho quán thật; cấp 6 tự kiểm / chỉnh (±5%/7 ngày) / quay lui khi có số liệu thật.
 * Bản đã phát hành bất biến: hiệu chuẩn lại sau deploy = unit_engine2_params_v2.js. */
(function(root){'use strict';const P={
 "version": "sim-dacde777-v1",
 "origin": "calibrated_simulation",
 "kEscalate": 2.5,
 "kClean": 1.1803312499999996,
 "coldStartFactor": 1.36,
 "minMeasLearn": 10,
 "minExcess": {
  "g": 15,
  "ml": 15,
  "cai": 2,
  "other": 5
 },
 "measSigma": {
  "g": 3,
  "ml": 4,
  "cai": 0.5,
  "other": 2
 },
 "cusum": {
  "k": 0.5,
  "h": 2.8
 },
 "flagLik": {
  "anomalyGivenSync": 0.9,
  "anomalyGivenOther": 0.05,
  "untrackedGivenUnrecorded": 0.9,
  "untrackedGivenOther": 0.05
 },
 "baseline": {
  "minTrusted": 20,
  "minDays": 14,
  "minLearning": 3,
  "tauFloor": 0.004,
  "sigmaFloor": 0.006,
  "minObsUsed": {
   "g": 50,
   "ml": 50,
   "cai": 5,
   "other": 10
  }
 },
 "release": {
  "validPoints": 5,
  "activeDays": 3,
  "minUsedRatio": 2,
  "daysBetween": 7
 },
 "priors": {
  "tare": 0.08,
  "density": 0.04,
  "recipe": 0.08,
  "unrecorded": 0.06,
  "sync": 0.04,
  "physical": 0.12,
  "noise": 0.58
 },
 "tareSigma": {
  "g": 12,
  "ml": 12,
  "cai": 0,
  "other": 5
 },
 "densitySigma": {
  "unproven": 0.05,
  "proven": 0.01
 },
 "minutes": {
  "tare_check": 2,
  "density_proof": 4,
  "recipe_portion_weigh": 5,
  "scan_open_units": 2,
  "resync_recount": 3,
  "handover_weigh_m2": 3,
  "m3_blind": 4
 },
 "calibration": {
  "minLabels": 30,
  "maxBrier": 0.2
 },
 "bounds": {
  "kEscalate": [
   1.8,
   4
  ],
  "kClean": [
   0.8,
   2.5
  ],
  "coldStartFactor": [
   1,
   2.5
  ],
  "cusum.h": [
   2.5,
   8
  ],
  "release.validPoints": [
   3,
   12
  ],
  "release.activeDays": [
   2,
   10
  ]
 },
 "liveStep": 0.05,
 "parent": "prior-1",
 "record": {
  "version": "sim-dacde777-v1",
  "parent": "prior-1",
  "mode": "sim",
  "dataHash": "dacde777",
  "window": {
   "from": "2026-01-05T20:00:00.000Z",
   "to": "2026-03-05T20:00:00.000Z",
   "train": 14102,
   "validation": 9402
  },
  "metricsBefore": {
   "n": 23504,
   "flags": 846,
   "falseAlarm": 80,
   "falseAlarmRate": 0.09456264775413711,
   "missed": 172,
   "trueAbnormal": 938,
   "missRate": 0.18336886993603413,
   "minutes": 47399,
   "failures": 1,
   "coverage90": 0.7291726283725312,
   "runs": 102
  },
  "metricsAfter": {
   "n": 23951,
   "flags": 886,
   "falseAlarm": 94,
   "falseAlarmRate": 0.10609480812641084,
   "missed": 149,
   "trueAbnormal": 941,
   "missRate": 0.15834218916046758,
   "minutes": 48875,
   "failures": 1,
   "coverage90": 0.7327946263707016,
   "runs": 102
  },
  "changes": [
   {
    "param": "kClean",
    "from": 1.5,
    "to": 1.1803312499999996
   },
   {
    "param": "coldStartFactor",
    "from": 1.6,
    "to": 1.36
   },
   {
    "param": "cusum.h",
    "from": 4,
    "to": 2.8
   }
  ],
  "rollbackRef": "prior-1",
  "origin": "calibrated_simulation",
  "scenarios": [
   "yen_tinh",
   "that_thoat_keo_dai",
   "that_thoat_mot_nguoi",
   "sai_bi",
   "sai_ty_trong",
   "dinh_muc_thieu_giua_ky",
   "dinh_muc_thieu_tu_dau",
   "tieu_hao_khong_khai",
   "loi_dong_bo",
   "drift_mua",
   "me_do_mot_lan",
   "doi_nha_cung_cap",
   "mon_it_ban",
   "nhieu_loi_cung_luc",
   "can_nhieu",
   "thieu_nho_lap_lai",
   "du_hang"
  ],
  "trainSeeds": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "holdoutSeeds": [
   101,
   102,
   103,
   104,
   105,
   106,
   107,
   108,
   109,
   110
  ],
  "holdoutMetrics": {
   "n": 39058,
   "flags": 1465,
   "falseAlarm": 133,
   "falseAlarmRate": 0.09078498293515358,
   "missed": 232,
   "trueAbnormal": 1564,
   "missRate": 0.1483375959079284,
   "minutes": 78560,
   "failures": 1,
   "coverage90": 0.7302587549587256,
   "runs": 170
  },
  "holdoutFailures": [
   "can_nhieu#108: báo động sai 100% > 35%"
  ]
 }
};
if(typeof module==='object'&&module.exports)module.exports=P;root.UnitEngine2Params=P;
})(typeof window!=='undefined'?window:globalThis);
