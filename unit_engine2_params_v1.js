/* SINH TỰ ĐỘNG bởi node tools/automation/engine2_sim.js --calibrate — KHÔNG SỬA TAY.
 * Tham số «hiệu chuẩn mô phỏng»: điểm xuất phát cho quán thật; cấp 6 tự kiểm / chỉnh (±5%/7 ngày) / quay lui khi có số liệu thật.
 * Bản đã phát hành bất biến: hiệu chuẩn lại sau deploy = unit_engine2_params_v2.js. */
(function(root){'use strict';const P={
 "version": "sim-741233ba-v1",
 "origin": "calibrated_simulation",
 "kEscalate": 2.5,
 "kClean": 1.9061249999999996,
 "coldStartFactor": 1.2879999999999998,
 "minMeasLearn": 10,
 "measUnsureFactor": 2.7625,
 "measUpper": 1,
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
  "h": 4
 },
 "flagLik": {
  "anomalyGivenSync": 0.9,
  "anomalyGivenOther": 0.05,
  "untrackedGivenUnrecorded": 0.9,
  "untrackedGivenOther": 0.05
 },
 "groupPrior": {
  "g": {
   "mu": 0.015,
   "tau": 0.01,
   "sigma": 0.02
  },
  "ml": {
   "mu": 0.012,
   "tau": 0.01,
   "sigma": 0.02
  },
  "cai": {
   "mu": 0.01,
   "tau": 0.02,
   "sigma": 0.05
  },
  "other": {
   "mu": 0.015,
   "tau": 0.02,
   "sigma": 0.04
  }
 },
 "minGroupItems": 3,
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
  },
  "kCap": 2.3
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
  "receiving": 0.04,
  "scale": 0.03,
  "physical": 0.12,
  "noise": 0.51
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
 "receivingSigma": 0.06,
 "receivingFirst": 0.2,
 "scaleSigma": 0.03,
 "minutes": {
  "tare_check": 2,
  "density_proof": 4,
  "recipe_portion_weigh": 5,
  "scan_open_units": 2,
  "resync_recount": 3,
  "weigh_sealed_unit": 2,
  "reference_weigh": 1,
  "handover_weigh_m2": 3,
  "m3_blind": 4
 },
 "calibration": {
  "minLabels": 30,
  "maxBrier": 0.2,
  "minFit": 10,
  "ridge": 1,
  "keep": 300
 },
 "bounds": {
  "baseline.kCap": [
   2,
   5
  ],
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
  "measUnsureFactor": [
   1,
   4
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
  "version": "sim-741233ba-v1",
  "parent": "prior-1",
  "mode": "sim",
  "dataHash": "ef7e3b8a",
  "window": {
   "from": "2026-01-05T20:00:00.000Z",
   "to": "2026-03-05T20:00:00.000Z",
   "train": 20089,
   "validation": 13394
  },
  "metricsBefore": {
   "n": 33483,
   "flags": 1092,
   "falseAlarm": 32,
   "falseAlarmRate": 0.029304029304029304,
   "missed": 10,
   "trueAbnormal": 1529,
   "missRate": 0.006540222367560497,
   "minutes": 66569,
   "failures": 0,
   "coverage90": 0.9349874664094389,
   "runs": 144
  },
  "metricsAfter": {
   "n": 33380,
   "flags": 1114,
   "falseAlarm": 31,
   "falseAlarmRate": 0.027827648114901255,
   "missed": 6,
   "trueAbnormal": 1521,
   "missRate": 0.0039447731755424065,
   "minutes": 66143,
   "failures": 0,
   "coverage90": 0.9355742568133792,
   "runs": 144
  },
  "changes": [
   {
    "param": "baseline.kCap",
    "from": 3,
    "to": 2.3
   },
   {
    "param": "kClean",
    "from": 1.5,
    "to": 1.9061249999999996
   },
   {
    "param": "coldStartFactor",
    "from": 1.6,
    "to": 1.2879999999999998
   },
   {
    "param": "measUnsureFactor",
    "from": 2.5,
    "to": 2.7625
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
   "du_hang",
   "nhan_hang_sai_dung_tich",
   "can_lech_he_so",
   "nhan_vien_moi_qua_tay",
   "cuoi_tuan_dong",
   "ban_dot_bien",
   "that_thoat_sau_ha_muc",
   "mo_nhieu_ma"
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
   "n": 55479,
   "flags": 1846,
   "falseAlarm": 17,
   "falseAlarmRate": 0.009209100758396533,
   "missed": 18,
   "trueAbnormal": 2656,
   "missRate": 0.00677710843373494,
   "minutes": 109767,
   "failures": 0,
   "coverage90": 0.9363385081492557,
   "runs": 240
  },
  "holdoutFailures": []
 }
};
if(typeof module==='object'&&module.exports)module.exports=P;root.UnitEngine2Params=P;
})(typeof window!=='undefined'?window:globalThis);
