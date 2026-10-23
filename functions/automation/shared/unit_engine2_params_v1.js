/* SINH TỰ ĐỘNG bởi node tools/automation/engine2_sim.js --calibrate — KHÔNG SỬA TAY.
 * Tham số «hiệu chuẩn mô phỏng»: điểm xuất phát cho quán thật; cấp 6 tự kiểm / chỉnh (±5%/7 ngày) / quay lui khi có số liệu thật.
 * Bản đã phát hành bất biến: hiệu chuẩn lại sau deploy = unit_engine2_params_v2.js. */
(function(root){'use strict';const P={
 "version": "sim-ce296084-v1",
 "origin": "calibrated_simulation",
 "kEscalate": 2.5,
 "kClean": 1.9061249999999996,
 "coldStartFactor": 1.1199999999999999,
 "minMeasLearn": 10,
 "measUnsureFactor": 2.875,
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
  "kCap": 2.9899999999999998
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
  "spec": 0.04,
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
 "specMinFrac": 0.15,
 "specTol": 0.1,
 "scaleSigma": 0.03,
 "minutes": {
  "tare_check": 2,
  "density_proof": 4,
  "recipe_portion_weigh": 5,
  "scan_open_units": 2,
  "resync_recount": 3,
  "spec_confirm": 2,
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
  "version": "sim-ce296084-v1",
  "parent": "prior-1",
  "mode": "sim",
  "dataHash": "f7f6f7f3",
  "window": {
   "from": "2026-01-05T20:00:00.000Z",
   "to": "2026-03-05T20:00:00.000Z",
   "train": 20904,
   "validation": 13937
  },
  "metricsBefore": {
   "n": 34841,
   "flags": 1096,
   "falseAlarm": 32,
   "falseAlarmRate": 0.029197080291970802,
   "missed": 10,
   "trueAbnormal": 1447,
   "missRate": 0.006910850034554251,
   "minutes": 69044,
   "failures": 0,
   "coverage90": 0.9363745886360891,
   "runs": 150
  },
  "metricsAfter": {
   "n": 34767,
   "flags": 1119,
   "falseAlarm": 31,
   "falseAlarmRate": 0.02770330652368186,
   "missed": 6,
   "trueAbnormal": 1420,
   "missRate": 0.004225352112676056,
   "minutes": 68681,
   "failures": 0,
   "coverage90": 0.9367758753052858,
   "runs": 150
  },
  "changes": [
   {
    "param": "baseline.kCap",
    "from": 3,
    "to": 2.9899999999999998
   },
   {
    "param": "kClean",
    "from": 1.5,
    "to": 1.9061249999999996
   },
   {
    "param": "coldStartFactor",
    "from": 1.6,
    "to": 1.1199999999999999
   },
   {
    "param": "measUnsureFactor",
    "from": 2.5,
    "to": 2.875
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
   "quy_cach_khac_khai_bao",
   "quy_cach_mot_ma",
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
   "n": 57773,
   "flags": 1846,
   "falseAlarm": 18,
   "falseAlarmRate": 0.009750812567713976,
   "missed": 18,
   "trueAbnormal": 2488,
   "missRate": 0.007234726688102894,
   "minutes": 113929,
   "failures": 0,
   "coverage90": 0.9370010891460162,
   "runs": 250
  },
  "holdoutFailures": []
 }
};
if(typeof module==='object'&&module.exports)module.exports=P;root.UnitEngine2Params=P;
})(typeof window!=='undefined'?window:globalThis);
