/**
 * 日凌（Sun Outage）计算器 v4
 * 第一性原理 ECEF 向量法
 *
 * 核心思路：直接在 ECEF（地心地固）坐标系中用三维向量计算
 * 太阳方向与卫星方向的夹角，不经过方位角/仰角中间变量。
 *
 * - 地球站位置：WGS84 大地坐标 → ECEF
 * - GEO 卫星位置：轨道经度 → ECEF
 * - 太阳方向：Meeus 太阳 RA/Dec (TT) + GAST (UT) → ECEF 单位向量
 * - 角间距：两个方向向量的点积取反余弦
 * - 无 Az/El 中间步骤，无坐标系混用风险
 */

const PI = Math.PI;
const RAD = PI / 180;
const DEG = 180 / PI;
const SECONDS_PER_DAY = 86400;
const JD_SEC = 1 / 86400;
const JD_MIN = 1 / 1440;

// WGS84 椭球
const A_WGS = 6378.137;                          // 赤道半径 km
const F_WGS = 1 / 298.257223563;
const E2_WGS = 2 * F_WGS - F_WGS * F_WGS;       // 第一偏心率平方

// GEO 轨道：a = 42164.17 km（含地球自转）
const R_GEO = 42164.17;

// 频段参数：频率 GHz、太阳噪温 K、典型系统噪温 K
const BAND_PARAMS = {
  'C':     { freq: 3.95,  solarTemp: 50000, sysTemp: 70  },
  'Ku':    { freq: 12.50, solarTemp: 14000, sysTemp: 170 },
  'ExtKu': { freq: 11.75, solarTemp: 15000, sysTemp: 160 },
  'Ka':    { freq: 19.45, solarTemp: 10000, sysTemp: 300 },
  'Q':     { freq: 40.00, solarTemp: 8000,  sysTemp: 500 }
};

/* ============================================================
 * ΔT = TT – UT1（秒）
 * 2020-2024 实测约 69.2s 且基本稳定，保守外推到 2030 附近
 * ============================================================ */
function deltaT(year) {
  if (year >= 2018 && year <= 2035) return 69.2;
  if (year >= 2005 && year < 2018) return 64.7 + 0.3 * (year - 2005);
  var t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

/* ============================================================
 * 儒略日
 * ============================================================ */
function julianDay(y, m, d) {
  if (m <= 2) { y--; m += 12; }
  var A = Math.floor(y / 100);
  var B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) +
         Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/* ============================================================
 * 太阳视位置（Meeus Ch.25 低精度法，输入必须是 JDE = TT 时刻）
 * 返回 apparent RA(°), Dec(°), R(AU)
 * ============================================================ */
function solarPosition(jde) {
  var T = (jde - 2451545.0) / 36525.0;

  var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  L0 = ((L0 % 360) + 360) % 360;

  var M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  M = ((M % 360) + 360) % 360;
  var Mr = M * RAD;

  var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
        + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
        + 0.000289 * Math.sin(3 * Mr);

  var theta = L0 + C;                             // 太阳真黄经

  var omega = (125.04 - 1934.136 * T) * RAD;      // Ω
  var lamApp = (theta - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;  // 视黄经

  var eps0 = 23.439291 - 0.0130042 * T;           // 平均黄赤交角（°）
  var eps  = (eps0 + 0.00256 * Math.cos(omega)) * RAD;  // 视黄赤交角

  var ra  = Math.atan2(Math.cos(eps) * Math.sin(lamApp), Math.cos(lamApp)) * DEG;
  var dec = Math.asin(Math.sin(eps) * Math.sin(lamApp)) * DEG;

  // 地日距离
  var R = 1.000001018 * (1 - 0.01671123 * Math.cos(Mr) - 0.00013972 * Math.cos(2 * Mr));

  // 章动（备用，供 GAST 计算）
  var dpsi = -0.00478 * Math.sin(omega);           // 黄经章动（°）

  return { ra: ((ra % 360) + 360) % 360, dec: dec, R: R, dpsi: dpsi, eps0: eps0 };
}

/* ============================================================
 * GMST（格林尼治平恒星时，输入 UT JD）
 * ============================================================ */
function gmst(jdUT) {
  var T = (jdUT - 2451545.0) / 36525.0;
  var g = 280.46061837
        + 360.98564736629 * (jdUT - 2451545.0)
        + 0.000387933 * T * T
        - T * T * T / 38710000;
  return ((g % 360) + 360) % 360;
}

/* ============================================================
 * ECEF 坐标计算
 * ============================================================ */

/** 地球站 WGS84 → ECEF (km) */
function stnXYZ(latD, lonD) {
  var la = latD * RAD, lo = lonD * RAD;
  var sl = Math.sin(la), cl = Math.cos(la);
  var N = A_WGS / Math.sqrt(1 - E2_WGS * sl * sl);
  return [N * cl * Math.cos(lo),
          N * cl * Math.sin(lo),
          N * (1 - E2_WGS) * sl];
}

/** GEO 卫星 → ECEF (km) */
function satXYZ(satLonD) {
  var lo = satLonD * RAD;
  return [R_GEO * Math.cos(lo), R_GEO * Math.sin(lo), 0];
}

/** 归一化向量 a→b */
function unitVec(a, b) {
  var dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  var r = Math.sqrt(dx*dx + dy*dy + dz*dz);
  return [dx/r, dy/r, dz/r];
}

/** 两个单位向量夹角（°） */
function vecAngle(u, v) {
  var d = u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
  return Math.acos(Math.max(-1, Math.min(1, d))) * DEG;
}

/* ============================================================
 * 太阳方向 ECEF 单位向量
 *
 * 太阳 apparent RA/Dec 是在赤道惯性系（指向春分点），
 * 需旋转 GAST（视恒星时）角度才能转换到 ECEF。
 * ============================================================ */
function sunDir(jdUT, dT) {
  var jde = jdUT + dT / SECONDS_PER_DAY;
  var sun = solarPosition(jde);

  // GAST = GMST + Δψ cos ε  （与 apparent RA 配套）
  var gastDeg = gmst(jdUT) + sun.dpsi * Math.cos(sun.eps0 * RAD);
  var gastR = gastDeg * RAD;

  var raR = sun.ra * RAD;
  var decR = sun.dec * RAD;
  var cd = Math.cos(decR);

  return {
    d: [cd * Math.cos(raR - gastR),
        cd * Math.sin(raR - gastR),
        Math.sin(decR)],
    R: sun.R
  };
}

/** 太阳是否在地平线以上（大地法线点乘太阳方向 > 0） */
function sunUp(latD, lonD, sd) {
  var la = latD * RAD, lo = lonD * RAD;
  var nx = Math.cos(la) * Math.cos(lo);
  var ny = Math.cos(la) * Math.sin(lo);
  var nz = Math.sin(la);
  return (nx*sd[0] + ny*sd[1] + nz*sd[2]) > -0.005;
}

/* ============================================================
 * 从 ECEF 向量算卫星 Az/El（仅供界面显示）
 * ENU 旋转矩阵基于大地纬度，与 WGS84 表面法线一致
 * ============================================================ */
function satAzElECEF(stn, sat, latD, lonD) {
  var la = latD * RAD, lo = lonD * RAD;
  var sl = Math.sin(la), cl = Math.cos(la);
  var sn = Math.sin(lo), cn = Math.cos(lo);
  var dx = sat[0]-stn[0], dy = sat[1]-stn[1], dz = sat[2]-stn[2];
  var e = -sn*dx + cn*dy;
  var n = -sl*cn*dx - sl*sn*dy + cl*dz;
  var u =  cl*cn*dx + cl*sn*dy + sl*dz;
  var el = Math.atan2(u, Math.sqrt(e*e + n*n)) * DEG;
  var az = Math.atan2(e, n) * DEG;
  if (az < 0) az += 360;
  return { az: az, el: el };
}

/* ============================================================
 * 分点精确 JDE（Meeus Ch.27 + Table 27.C 周期修正）
 * ============================================================ */
function equinoxJDE(year, season) {
  var Y = (year - 2000) / 1000;
  var JDE0;
  if (season === 'vernal') {
    JDE0 = 2451623.80984 + 365242.37404*Y + 0.05169*Y*Y
         - 0.00411*Y*Y*Y - 0.00057*Y*Y*Y*Y;
  } else {
    JDE0 = 2451810.21715 + 365242.01767*Y - 0.11575*Y*Y
         + 0.00337*Y*Y*Y + 0.00078*Y*Y*Y*Y;
  }
  var T = (JDE0 - 2451545.0) / 36525.0;
  var S = periodicSum(T);
  var W = 35999.373 * T - 2.47;
  var dL = 1 + 0.0334 * Math.cos(W * RAD) + 0.0007 * Math.cos(2 * W * RAD);
  return JDE0 + (0.00001 * S) / dL;
}

function periodicSum(T) {
  var terms = [
    [485,324.96,1934.136],[203,337.23,32964.467],[199,342.08,20.186],
    [182,27.85,445267.112],[156,73.14,45036.886],[136,171.52,22518.443],
    [77,222.54,65928.934],[74,296.72,3034.906],[70,243.58,9037.513],
    [58,119.81,33718.147],[52,297.17,150.678],[50,21.02,2281.226],
    [45,247.54,29929.562],[44,325.15,31555.956],[29,60.93,4443.417],
    [18,155.12,67555.328],[17,288.79,4562.452],[16,198.04,62894.029],
    [14,199.76,31436.921],[12,95.39,14577.848],[12,287.11,31931.756],
    [12,320.81,34777.259],[9,227.73,1222.114],[8,15.45,16859.074]
  ];
  var S = 0;
  for (var i = 0; i < terms.length; i++) {
    S += terms[i][0] * Math.cos((terms[i][1] + terms[i][2] * T) * RAD);
  }
  return S;
}

/* ============================================================
 * 扫描辅助
 * ============================================================ */

/** 某 UT 秒偏移处的角间距 */
function sepAtSec(dayJD, sec, stn, satU, dT, latD, lonD) {
  var jdUT = dayJD + sec * JD_SEC;
  var s = sunDir(jdUT, dT);
  var sep = vecAngle(satU, s.d);
  var up = sunUp(latD, lonD, s.d);
  return { sep: sep, up: up };
}

/** 二分精炼边界（1 秒精度） */
function refine(dayJD, inSec, outSec, thresh, stn, satU, dT, latD, lonD) {
  var lo = Math.min(inSec, outSec);
  var hi = Math.max(inSec, outSec);
  while (hi - lo > 1) {
    var mid = (lo + hi) >> 1;
    var r = sepAtSec(dayJD, mid, stn, satU, dT, latD, lonD);
    var inside = r.sep < thresh && r.up;
    if (inSec < outSec) {            // refine END boundary
      if (inside) lo = mid; else hi = mid;
    } else {                          // refine START boundary
      if (inside) hi = mid; else lo = mid;
    }
  }
  return inSec < outSec ? lo : hi;
}

/* ============================================================
 * 主入口
 * ============================================================ */
function calculateSunOutage(params) {
  var lat = params.lat, lon = params.lon, satLon = params.satLon;
  var diameter = params.diameter, year = params.year;
  var season = params.season, band = params.band;
  var customFreq = params.customFreq;
  var cnThreshold = params.cnThreshold || 1;

  var bi = BAND_PARAMS[band] || BAND_PARAMS['Ku'];
  var freq = customFreq || bi.freq;
  var solarTemp = bi.solarTemp;
  var sysTemp = bi.sysTemp;
  var dT = deltaT(year);

  // 天线 3dB 波束宽度 (100λ/D)
  var beamW = 30 / (freq * diameter);

  // ECEF 常量（不随时间变化）
  var stn = stnXYZ(lat, lon);
  var sat = satXYZ(satLon);
  var satU = unitVec(stn, sat);  // station → satellite 单位向量

  // 卫星 Az/El（显示用）
  var ae = satAzElECEF(stn, sat, lat, lon);
  if (ae.el <= 0) {
    return { error: true, message: '卫星在地平线以下，无法计算日凌', satEl: ae.el };
  }

  // 分点
  var eqJDE = equinoxJDE(year, season);
  var eqJDut = eqJDE - dT / SECONDS_PER_DAY;
  var seasonName = season === 'vernal' ? '春分' : '秋分';
  var eqD = jdToDate(eqJDut);
  var equinoxDateStr = fmtDate(eqD.y, eqD.m, eqD.d);
  var eqDayJD = Math.floor(eqJDut - 0.5) + 0.5;

  var scanDays = 21;
  var dailyResults = [];
  var peakIdx = null, maxDurSec = 0;

  for (var d = -scanDays; d <= scanDays; d++) {
    var dayJD = eqDayJD + d;

    // 每天正午太阳视半径
    var noonJDE = dayJD + 0.5 + dT / SECONDS_PER_DAY;
    var noonSun = solarPosition(noonJDE);
    var sunRad = 0.26656 / noonSun.R;       // 度
    var thresh = beamW / 2 + sunRad;

    // ──── 粗扫 1 分钟步长 ────
    var csMin = -1, ceMin = -1, cpMin = -1, minSep = 999;
    for (var m = 0; m < 1440; m++) {
      var jdUT = dayJD + m * JD_MIN;
      var sd = sunDir(jdUT, dT);
      if (!sunUp(lat, lon, sd.d)) continue;
      var sep = vecAngle(satU, sd.d);
      if (sep < thresh) {
        if (csMin < 0) csMin = m;
        ceMin = m;
      }
      if (sep < minSep) { minSep = sep; cpMin = m; }
    }
    if (csMin < 0) continue;

    // ──── 秒级精炼 ────
    var sOut = Math.max(0, (csMin - 1) * 60);
    var sIn  = csMin * 60;
    var pStart = refine(dayJD, sIn, sOut, thresh, stn, satU, dT, lat, lon);

    var eIn  = ceMin * 60;
    var eOut = Math.min(86399, (ceMin + 1) * 60);
    var pEnd = refine(dayJD, eIn, eOut, thresh, stn, satU, dT, lat, lon);

    // 峰值逐秒搜索
    var pkSec = cpMin * 60, pkSep = minSep;
    var ps = Math.max(0, (cpMin - 1) * 60);
    var pe = Math.min(86399, (cpMin + 1) * 60);
    for (var s = ps; s <= pe; s++) {
      var r = sepAtSec(dayJD, s, stn, satU, dT, lat, lon);
      if (r.up && r.sep < pkSep) { pkSep = r.sep; pkSec = s; }
    }

    // C/N 恶化
    var ratio = sunRad / (beamW / 2);
    var offAxis = Math.pow(10, -12 * Math.pow(pkSep / beamW, 2) / 10);
    var dTs = solarTemp * ratio * ratio * offAxis;
    var cn = 10 * Math.log10(1 + dTs / sysTemp);
    if (cn < cnThreshold) continue;

    var dur = pEnd - pStart;
    if (dur <= 0) continue;
    var dd = jdToDate(dayJD);

    var intensity, intensityClass;
    var halfBeam = beamW / 2;
    if (pkSep <= halfBeam * 0.5) { intensity = '高'; intensityClass = 'so-intensity-high'; }
    else if (pkSep <= halfBeam) { intensity = '中'; intensityClass = 'so-intensity-mid'; }
    else { intensity = '低'; intensityClass = 'so-intensity-low'; }

    var rec = {
      date:           fmtDate(dd.y, dd.m, dd.d),
      startTimeUTC:   secStr(pStart),
      endTimeUTC:     secStr(pEnd),
      peakTimeUTC:    secStr(pkSec),
      startTimeBJT:   secStr(toBJT(pStart)),
      endTimeBJT:     secStr(toBJT(pEnd)),
      peakTimeBJT:    secStr(toBJT(pkSec)),
      durationSec:    dur,
      durationStr:    fmtDur(dur),
      peakSeparation: Number(pkSep.toFixed(3)),
      peakCNdeg:      Number(cn.toFixed(2)),
      intensity:      intensity,
      intensityClass: intensityClass,
      isPeak:         false
    };
    dailyResults.push(rec);
    if (dur > maxDurSec) { maxDurSec = dur; peakIdx = dailyResults.length - 1; }
  }

  if (peakIdx !== null) dailyResults[peakIdx].isPeak = true;

  var total = dailyResults.length;
  return {
    error: false,
    seasonName:     seasonName,
    equinoxDate:    equinoxDateStr,
    beamWidth:      Number(beamW.toFixed(3)),
    thresholdAngle: Number((beamW / 2 + 0.267).toFixed(3)),
    satAz:          Number(ae.az.toFixed(2)),
    satEl:          Number(ae.el.toFixed(2)),
    frequency:      freq,
    totalDays:      total,
    startDate:      total > 0 ? dailyResults[0].date : '--',
    endDate:        total > 0 ? dailyResults[total - 1].date : '--',
    maxDurationSec: maxDurSec,
    maxDurationStr: fmtDur(maxDurSec),
    peakRecord:     peakIdx !== null ? dailyResults[peakIdx] : null,
    dailyResults:   dailyResults
  };
}

/* ============================================================
 * 工具函数
 * ============================================================ */
function jdToDate(jd) {
  var Z = Math.floor(jd + 0.5);
  var F = jd + 0.5 - Z;
  var AA = Math.floor((Z - 1867216.25) / 36524.25);
  var B = Z + 1 + AA - Math.floor(AA / 4) + 1524;
  var C = Math.floor((B - 122.1) / 365.25);
  var D = Math.floor(365.25 * C);
  var E = Math.floor((B - D) / 30.6001);
  var day = B - D - Math.floor(30.6001 * E) + F;
  var mon = E < 14 ? E - 1 : E - 13;
  var yr  = mon > 2 ? C - 4716 : C - 4715;
  return { y: yr, m: mon, d: Math.floor(day) };
}

function toBJT(sec) {
  return ((sec + 28800) % SECONDS_PER_DAY + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

function secStr(s) {
  s = ((s % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sc = s % 60;
  return pad2(h) + ':' + pad2(m) + ':' + pad2(sc);
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtDur(sec) {
  if (sec < 60) return sec + 's';
  var m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? m + 'm' + s + 's' : m + 'm';
}

function fmtDate(y, m, d) {
  return y + '-' + pad2(m) + '-' + pad2(d);
}

module.exports = {
  calculateSunOutage: calculateSunOutage,
  BAND_PARAMS: BAND_PARAMS
};
