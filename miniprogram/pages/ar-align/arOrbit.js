'use strict';
/**
 * arOrbit.js — AR 对星的目标几何（纯函数，不依赖 wx，可在 Node 下验证：scripts/simArOrbit.js）
 *
 * 职责：
 *   1) lookAt      某颗星（satrec）在某时刻相对观测站的方位/仰角/斜距（SGP4 → ECI → ECF → 站心系）；
 *   2) slotLook    只知道标称轨位（东经）时的同步轨道观测角——离线回退口径，把卫星当成赤道上空
 *                  42164 km 处的一个点，与 lookAt 同一套站心几何（WGS-84 椭球），不是另一套公式；
 *   3) classify    按根数分轨道类别：GEO / IGSO / LEO / MEO / HEO（页面据此决定「静态目标」还是「动目标」）；
 *   4) nextPass    非同步轨道的过境预报：从某时刻起在 horizon 内找下一次（或正在进行的这次）升起/落下，
 *                  粗扫 + 二分定到 ~0.1 s，并采样出最高仰角。
 *
 * 观测站 obs 用 satellite.js 的口径：{ latitude, longitude }（弧度）、height（km）。用 observer() 造。
 * 本文件放在 ar-align 分包内：分包不能 require 其他分包，satellite.js 也是分包各自内置一份。
 */

const sat = require('./satellite.js');

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const GEO_R = 42164.17;            // 同步轨道半径 km（地心）
const SIDEREAL_MIN = 1436.07;      // 恒星日 min
const SGP4_RE = 6378.135;          // SGP4 用的地球半径 km（rec.altp/alta 以它为单位）

function norm360(a) {
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// 观测站（度、km）→ satellite.js 站心口径（弧度、km）
function observer(latDeg, lonDeg, heightKm) {
  return {
    latitude: (Number(latDeg) || 0) * D2R,
    longitude: (Number(lonDeg) || 0) * D2R,
    height: Number.isFinite(heightKm) ? heightKm : 0
  };
}

// 轨道类别：GEO（静止）/ IGSO（倾斜同步）/ HEO（大偏心）/ LEO / MEO
function classify(rec) {
  const periodMin = (2 * Math.PI) / rec.no;         // rec.no 单位 rad/min
  const ecc = rec.ecco;
  const inclDeg = rec.inclo * R2D;
  const altKm = ((rec.altp + rec.alta) / 2) * SGP4_RE; // 平均高度
  const sync = Math.abs(periodMin - SIDEREAL_MIN) < 12 && ecc < 0.01;
  const isGeo = sync && inclDeg < 15;
  let cls;
  if (isGeo) cls = 'GEO';
  else if (sync) cls = 'IGSO';
  else if (ecc >= 0.25) cls = 'HEO';
  else if (altKm < 2000) cls = 'LEO';
  else cls = 'MEO';
  return { cls: cls, isGeo: isGeo, periodMin: periodMin, ecc: ecc, inclDeg: inclDeg, altKm: altKm };
}

// 某时刻观测角。失败（根数坏/已再入）返回 null。
//   az 自北顺时针 0~360，el -90~90，range 斜距 km，alt 星下点高度 km，lat/lon 星下点（度）
function lookAt(rec, obs, date) {
  let pv;
  try { pv = sat.propagate(rec, date); } catch (e) { return null; }
  if (!pv || !pv.position || typeof pv.position !== 'object') return null;
  const gmst = sat.gstime(date);
  const ecf = sat.eciToEcf(pv.position, gmst);
  const la = sat.ecfToLookAngles(obs, ecf);
  const gd = sat.eciToGeodetic(pv.position, gmst);
  if (![la.azimuth, la.elevation, la.rangeSat].every(Number.isFinite)) return null;
  return {
    az: norm360(la.azimuth * R2D),
    el: la.elevation * R2D,
    range: la.rangeSat,
    alt: gd.height,
    lat: gd.latitude * R2D,
    lon: gd.longitude * R2D
  };
}

// 标称轨位（东经为正）的同步轨道观测角：把星当作赤道面上空 GEO_R 处的一点
function slotLook(obs, slotLonDeg) {
  const lam = (Number(slotLonDeg) || 0) * D2R;
  const ecf = { x: GEO_R * Math.cos(lam), y: GEO_R * Math.sin(lam), z: 0 };
  const la = sat.ecfToLookAngles(obs, ecf);
  return {
    az: norm360(la.azimuth * R2D),
    el: la.elevation * R2D,
    range: la.rangeSat,
    alt: GEO_R - 6378.137,
    lat: 0,
    lon: Number(slotLonDeg) || 0
  };
}

function elAt(rec, obs, ms) {
  const l = lookAt(rec, obs, new Date(ms));
  return l ? l.el : NaN;
}

/**
 * 过境预报。
 *   from       起算时刻（Date 或 ms）
 *   options    { horizonMs 搜索窗口（默认 24 h）, minEl 可见门限（默认 0°）, stepSec 粗扫步长（默认按周期自适应）}
 * 返回 null（窗口内没有可见弧段）或
 *   { inProgress 起算时刻是否已在弧段内, aos 升起, los 落下(窗口内未落下则 null), maxEl 最高仰角, maxElAt, durationSec }
 * GEO/IGSO 这类同步轨道不做预报（要么长期可见要么长期不可见），返回 null，由页面按 el 直接判定。
 */
function nextPass(rec, obs, from, options) {
  const o = Object.assign({ horizonMs: 24 * 3600e3, minEl: 0, stepSec: 0 }, options || {});
  const c = classify(rec);
  if (c.cls === 'GEO' || c.cls === 'IGSO') return null;
  const t0 = +from;
  const periodMs = c.periodMin * 60e3;
  const step = (o.stepSec || clamp((c.periodMin * 60) / 180, 10, 300)) * 1000; // LEO ≈ 30 s、MEO ≈ 4~5 min
  const up = (e) => Number.isFinite(e) && e >= o.minEl;
  const el0 = elAt(rec, obs, t0);
  if (!Number.isFinite(el0)) return null;

  // 二分：ta 与 tb 两端可见性相反，收敛到 ~step/16384
  const cross = (ta, tb) => {
    const upA = up(elAt(rec, obs, ta));
    for (let i = 0; i < 14; i++) {
      const tm = (ta + tb) / 2;
      if (up(elAt(rec, obs, tm)) === upA) ta = tm; else tb = tm;
    }
    return (ta + tb) / 2;
  };

  let aos, los = null;
  const inProgress = up(el0);
  let guard = 0;
  if (inProgress) {
    // 向前回溯到升起（最多一个周期）
    let tb = t0, ta = t0 - step;
    while (guard++ < 1e4 && up(elAt(rec, obs, ta)) && t0 - ta < periodMs) { tb = ta; ta -= step; }
    aos = up(elAt(rec, obs, ta)) ? ta : cross(ta, tb);
    // 向后找落下（窗口内）
    ta = t0; tb = t0 + step; guard = 0;
    while (guard++ < 1e5 && tb - t0 <= o.horizonMs && up(elAt(rec, obs, tb))) { ta = tb; tb += step; }
    if (tb - t0 <= o.horizonMs) los = cross(ta, tb);
  } else {
    // 向后粗扫到第一次可见
    let ta = t0, tb = t0 + step, found = false;
    while (tb - t0 <= o.horizonMs) {
      if (up(elAt(rec, obs, tb))) { found = true; break; }
      ta = tb; tb += step;
    }
    if (!found) return null;
    aos = cross(ta, tb);
    ta = tb; tb += step; guard = 0;
    while (guard++ < 1e5 && up(elAt(rec, obs, tb)) && tb - aos < periodMs) { ta = tb; tb += step; }
    los = up(elAt(rec, obs, tb)) ? null : cross(ta, tb);
  }

  // 最高仰角：弧段内按 step/8 采样（弧段未闭合则采到窗口末尾）
  const end = los !== null ? los : Math.min(t0 + o.horizonMs, aos + periodMs);
  const fine = Math.max((end - aos) / 64, step / 8, 1000);
  let maxEl = -90, maxElAt = aos;
  for (let t = aos; t <= end; t += fine) {
    const e = elAt(rec, obs, t);
    if (e > maxEl) { maxEl = e; maxElAt = t; }
  }
  const eEnd = elAt(rec, obs, end);
  if (eEnd > maxEl) { maxEl = eEnd; maxElAt = end; }
  return {
    inProgress: inProgress,
    aos: new Date(aos),
    los: los !== null ? new Date(los) : null,
    maxEl: maxEl,
    maxElAt: new Date(maxElAt),
    durationSec: los !== null ? (los - aos) / 1000 : null
  };
}

module.exports = {
  D2R: D2R,
  R2D: R2D,
  GEO_R: GEO_R,
  norm360: norm360,
  clamp: clamp,
  observer: observer,
  classify: classify,
  lookAt: lookAt,
  slotLook: slotLook,
  nextPass: nextPass
};
