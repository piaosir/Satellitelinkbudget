/**
 * 日凌（Sun Outage）计算器 v4
 * 第一性原理 ECEF 向量法
 *
 * 核心思路：直接在 ECEF（地心地固）坐标系中用三维向量计算
 * 太阳方向与卫星方向的夹角，不经过方位角/仰角中间变量。
 *
 * - 地球站位置：WGS84 大地坐标 → ECEF
 * - GEO 卫星位置：轨道经度 → ECEF
 * - 太阳方向：太阳 RA/Dec (TT) + GAST (UT) → ECEF 单位向量
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

// 频段参数：频率 GHz、太阳噪温 K（静态太阳，ITU-R S.733）、典型系统噪温 K
const BAND_PARAMS = {
  'C':     { freq: 3.95,  solarTemp: 42000, sysTemp: 65  },
  'Ku':    { freq: 12.50, solarTemp: 12000, sysTemp: 150 },
  'ExtKu': { freq: 11.75, solarTemp: 13000, sysTemp: 145 },
  'Ka':    { freq: 19.45, solarTemp: 9000,  sysTemp: 270 },
  'Q':     { freq: 40.00, solarTemp: 7500,  sysTemp: 450 }
};

/* ============================================================
 * ΔT = TT – UT1（秒）
 *
 * 2005–2025: IERS Earth Orientation Centre 实测年均值（线性内插）
 *   2018 起 ΔT = 69.184 − DUT1，DUT1 取 IERS Bulletin A 年均值
 * 2026+   : 二次外推
 *   线性项 +0.03 s/yr  — 2020–2025 近乎持平，取保守正增长
 *   二次项 +0.004 s/yr² — 长期潮汐减速 (~25.5 s/century²)
 *   预期值: 2030→69.5 | 2040→70.6 | 2050→72.5
 * ============================================================ */
function deltaT(year) {
  // IERS 实测年均值 [2005 … 2025]
  var _obs = [
    64.69, 64.85, 65.15, 65.46, 65.78,  // 2005-2009
    66.07, 66.32, 66.60, 66.91, 67.28,  // 2010-2014
    67.64, 68.10, 68.59, 69.11, 69.24,  // 2015-2019
    69.36, 69.28, 69.18, 69.16, 69.20,  // 2020-2024
    69.22                                // 2025 (preliminary)
  ];
  var Y0 = 2005;
  var YN = Y0 + _obs.length - 1; // 2025

  // 查表 + 线性内插
  if (year >= Y0 && year <= YN) {
    var idx = Math.min(Math.floor(year - Y0), _obs.length - 2);
    var frac = year - Y0 - idx;
    return _obs[idx] + frac * (_obs[idx + 1] - _obs[idx]);
  }

  // 2026+ 中长期预测
  if (year > YN) {
    var t = year - YN;
    return 69.22 + 0.03 * t + 0.004 * t * t;
  }

  // < 2005 兜底
  var t = year - 2000;
  return 63.83 + 0.24 * t + 0.005 * t * t;
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
 * VSOP87 高精度太阳位置 — Bretagnon & Francou (1988)
 * 截断自 Meeus "Astronomical Algorithms" 2nd ed. Appendix II
 * 配合 IAU 1980 章动模型（63 项）
 * 黄经精度 ≈ 1″（对应时间误差 ≈ 0.4 秒）
 *
 * 输入：JDE（TT 儒略日）
 * 输出：apparent RA(°), Dec(°), R(AU), dpsi(°), eps0(°)
 * ============================================================ */

/* ── VSOP87 求和辅助 ── */
function _vS(c, tau) {
  var s = 0;
  for (var i = 0; i < c.length; i++) s += c[i][0] * Math.cos(c[i][1] + c[i][2] * tau);
  return s;
}

/* ── 地球日心黄经 L 系数 [A, B, C] ── */
var _L0 = [
  [175347046,0,0],[3341656,4.6692568,6283.07585],[34894,4.6261,12566.1517],
  [3497,2.7441,5753.3849],[3418,2.8289,3.5232],[3136,3.6277,77713.7715],
  [2676,4.4181,7860.4194],[2343,6.1352,3930.2097],[1324,0.7425,11506.7698],
  [1273,2.0371,529.691],[1199,1.1096,1577.3436],[990,5.233,5884.927],
  [902,2.045,26.298],[857,3.508,398.149],[780,1.179,5223.694],
  [753,2.533,5507.553],[505,4.583,18849.228],[492,4.205,775.523],
  [357,2.920,0.067],[317,5.849,11790.629],[284,1.899,796.298],
  [271,0.315,10977.079],[243,0.345,5486.778],[206,4.806,2544.314],
  [205,1.869,5573.143],[202,2.458,6069.777],[156,0.833,213.299],
  [132,3.411,2942.463],[126,1.083,20.775],[115,0.645,0.980],
  [103,0.636,4694.003],[99,6.21,2146.17],[98,0.68,155.42],
  [86,5.98,161000.69],[85,1.30,6275.96],[85,3.67,71430.70],[80,1.81,17260.15]
];
var _L1 = [
  [628331966747,0,0],[206059,2.678235,6283.07585],[4303,2.6351,12566.1517],
  [425,1.590,3.523],[119,5.796,26.298],[109,2.966,1577.344],
  [93,2.59,18849.23],[72,1.14,529.69],[68,1.87,398.15],
  [67,4.41,5507.55],[59,2.89,5223.69],[56,2.17,155.42],
  [45,0.40,796.30],[36,0.47,775.52],[29,2.65,7.11],
  [21,5.34,0.98],[19,1.85,5486.78],[19,4.97,213.30],
  [17,2.99,6275.96],[16,0.03,2544.31]
];
var _L2 = [
  [52919,0,0],[8720,1.0721,6283.0758],[309,0.867,12566.152],
  [27,0.05,3.52],[16,5.19,26.30],[16,3.68,155.42],
  [10,0.76,18849.23],[9,2.06,77713.77],[7,0.83,775.52],[5,4.66,1577.34]
];
var _L3 = [
  [289,5.844,6283.076],[35,0,0],[17,5.49,12566.15],
  [3,5.20,155.42],[1,4.72,3.52],[1,5.30,18849.23],[1,5.97,242.73]
];
var _L4 = [[114,3.142,0],[8,4.13,6283.08],[1,3.84,12566.15]];
var _L5 = [[1,3.14,0]];

/* ── 地球日心黄纬 B 系数 ── */
var _B0 = [[280,3.199,84334.662],[102,5.422,5507.553],[80,3.88,5223.69],[44,3.70,2352.87],[32,4.00,1577.34]];
var _B1 = [[9,3.90,5507.55],[6,1.73,5223.69]];

/* ── 地球日心距离 R 系数 ── */
var _R0 = [
  [100013989,0,0],[1670700,3.098464,6283.07585],[13956,3.05525,12566.1517],
  [3084,5.1985,77713.7715],[1628,1.1739,5753.3849],[1576,2.8469,7860.4194],
  [925,5.453,11506.770],[542,4.564,3930.210],[472,3.661,5884.927],
  [346,0.964,5507.553],[329,5.900,5223.694],[307,0.299,5573.143],
  [243,4.273,11790.629],[212,5.847,1577.344],[186,5.022,10977.079],
  [175,3.012,18849.228],[110,5.055,5486.778],[98,0.89,6069.78],
  [86,5.69,15720.84],[86,1.27,161000.69],[65,0.27,17260.15],
  [63,0.92,529.69],[57,2.01,83996.85],[56,5.24,71430.70],
  [49,3.25,2544.31],[47,2.58,775.52],[45,5.54,9437.76],
  [43,6.01,6275.96],[39,5.36,4694.00],[38,2.39,8827.39]
];
var _R1 = [
  [103019,1.10749,6283.07585],[1721,1.0644,12566.1517],[702,3.142,0],
  [32,1.02,18849.23],[31,2.84,5507.55],[25,1.32,5223.69],
  [18,1.42,1577.34],[10,5.91,10977.08]
];
var _R2 = [
  [4359,5.7846,6283.0758],[124,5.579,12566.152],[12,3.14,0],
  [9,3.63,77713.77],[6,1.87,5573.14],[3,5.47,18849.23]
];
var _R3 = [[145,4.273,6283.076],[7,3.92,12566.15]];
var _R4 = [[4,2.56,6283.08]];

/* ── IAU 1980 章动 63 项 [D,M,Mp,F,Ω, ψS,ψSt, εC,εCt] (单位 0.0001″) ── */
var _NT = [
  [0,0,0,0,1,-171996,-174.2,92025,8.9],
  [-2,0,0,2,2,-13187,-1.6,5736,-3.1],
  [0,0,0,2,2,-2274,-0.2,977,-0.5],
  [0,0,0,0,2,2062,0.2,-895,0.5],
  [0,1,0,0,0,1426,-3.4,54,-0.1],
  [0,0,1,0,0,712,0.1,-7,0],
  [-2,1,0,2,2,-517,1.2,224,-0.6],
  [0,0,0,2,1,-386,-0.4,200,0],
  [0,0,1,2,2,-301,0,129,-0.1],
  [-2,-1,0,2,2,217,-0.5,-95,0.3],
  [-2,0,1,0,0,-158,0,0,0],
  [-2,0,0,2,1,129,0.1,-70,0],
  [0,0,-1,2,2,123,0,-53,0],
  [2,0,0,0,0,63,0,0,0],
  [0,0,1,0,1,63,0.1,-33,0],
  [2,0,-1,2,2,-59,0,26,0],
  [0,0,-1,0,1,-58,-0.1,32,0],
  [0,0,1,2,1,-51,0,27,0],
  [-2,0,2,0,0,48,0,0,0],
  [0,0,-2,2,1,46,0,-24,0],
  [2,0,0,2,2,-38,0,16,0],
  [0,0,2,2,2,-31,0,13,0],
  [0,0,2,0,0,29,0,0,0],
  [-2,0,1,2,2,29,0,-12,0],
  [0,0,0,2,0,26,0,0,0],
  [-2,0,0,2,0,-22,0,0,0],
  [0,0,-1,2,1,21,0,-10,0],
  [0,2,0,0,0,17,-0.1,0,0],
  [2,0,-1,0,1,16,0,-8,0],
  [-2,2,0,2,2,-16,0.1,7,0],
  [0,1,0,0,1,-15,0,9,0],
  [-2,0,1,0,1,-13,0,7,0],
  [0,-1,0,0,1,-12,0,6,0],
  [0,0,2,-2,0,11,0,0,0],
  [2,0,-1,2,1,-10,0,5,0],
  [2,0,1,2,2,-8,0,3,0],
  [0,1,0,2,2,7,0,-3,0],
  [-2,1,1,0,0,-7,0,0,0],
  [0,-1,0,2,2,-7,0,3,0],
  [2,0,0,2,1,-7,0,3,0],
  [2,0,1,0,0,-8,0,0,0],
  [-2,0,2,2,2,6,0,-3,0],
  [-2,0,1,2,1,6,0,-3,0],
  [2,0,-2,0,1,-6,0,3,0],
  [2,0,0,0,1,-6,0,3,0],
  [0,-1,1,0,0,5,0,0,0],
  [-2,-1,0,2,1,-5,0,3,0],
  [-2,0,0,0,1,-5,0,3,0],
  [0,0,2,2,1,-5,0,3,0],
  [-2,0,2,0,1,4,0,0,0],
  [-2,1,0,2,1,4,0,0,0],
  [0,0,1,-2,0,4,0,0,0],
  [-1,0,1,0,0,-4,0,0,0],
  [-2,1,0,0,0,-4,0,0,0],
  [1,0,0,0,0,-4,0,0,0],
  [0,0,1,2,0,3,0,0,0],
  [0,0,-2,2,2,-3,0,0,0],
  [-1,-1,1,0,0,-3,0,0,0],
  [0,1,1,0,0,-3,0,0,0],
  [0,-1,1,2,2,-3,0,0,0],
  [2,-1,-1,2,2,-3,0,0,0],
  [0,0,3,2,2,-3,0,0,0],
  [2,-1,0,2,2,-3,0,0,0]
];

/* ── 章动计算 (IAU 1980) ── */
function _nutation(T) {
  var D  = (297.85036 + 445267.11148*T - 0.0019142*T*T + T*T*T/189474) * RAD;
  var Ms = (357.52772 + 35999.05034*T  - 0.0001603*T*T - T*T*T/300000) * RAD;
  var Mm = (134.96298 + 477198.86740*T + 0.0086972*T*T + T*T*T/56250)  * RAD;
  var F  = (93.27191  + 483202.01754*T - 0.0036825*T*T + T*T*T/327270) * RAD;
  var Om = (125.04452 - 1934.13626*T   + 0.0020708*T*T + T*T*T/450000) * RAD;
  var dp = 0, de = 0;
  for (var i = 0; i < _NT.length; i++) {
    var n = _NT[i];
    var a = n[0]*D + n[1]*Ms + n[2]*Mm + n[3]*F + n[4]*Om;
    dp += (n[5] + n[6]*T) * Math.sin(a);
    de += (n[7] + n[8]*T) * Math.cos(a);
  }
  // 0.0001″ → 度: ÷ (3600 × 10000)
  return { dpsi: dp / 36000000, deps: de / 36000000 };
}

/* ── 太阳视位置主函数 ── */
function solarPosition(jde) {
  var T = (jde - 2451545.0) / 36525;
  var tau = T / 10;
  var t2 = tau*tau, t3 = t2*tau, t4 = t3*tau, t5 = t4*tau;

  // 地球日心坐标 (弧度, 弧度, AU)
  var L = (_vS(_L0,tau) + tau*_vS(_L1,tau) + t2*_vS(_L2,tau)
         + t3*_vS(_L3,tau) + t4*_vS(_L4,tau) + t5*_vS(_L5,tau)) / 1e8;
  var B = (_vS(_B0,tau) + tau*_vS(_B1,tau)) / 1e8;
  var R = (_vS(_R0,tau) + tau*_vS(_R1,tau) + t2*_vS(_R2,tau)
         + t3*_vS(_R3,tau) + t4*_vS(_R4,tau)) / 1e8;

  // 日心 → 地心
  var geoL = ((L + PI) % (2*PI) + 2*PI) % (2*PI);
  var geoB = -B;

  // FK5 修正 (Meeus p.166)
  var Lp = (geoL * DEG - 1.397*T - 0.00031*T*T) * RAD;
  geoL += -0.09033 / 3600 * RAD;
  geoB +=  0.03916 / 3600 * RAD * (Math.cos(Lp) - Math.sin(Lp));

  // 章动
  var nut = _nutation(T);

  // 光行差 (κ = 20.4898″)
  var aberr = -20.4898 / 3600 / R * RAD;

  // 视黄经
  var lamApp = geoL + nut.dpsi * RAD + aberr;

  // 平均黄赤交角 (Lieske 1979, Meeus Ch.22)
  var eps0 = 23.4392911 - 0.0130042*T - 0.000000164*T*T + 0.000000504*T*T*T;

  // 真黄赤交角
  var eps = (eps0 + nut.deps) * RAD;

  // 视赤经/赤纬 (含黄纬修正)
  var sinL = Math.sin(lamApp), cosL = Math.cos(lamApp);
  var sinB = Math.sin(geoB), cosB = Math.cos(geoB), tanB = Math.tan(geoB);
  var cosE = Math.cos(eps), sinE = Math.sin(eps);

  var ra  = Math.atan2(sinL*cosE - tanB*sinE, cosL) * DEG;
  var dec = Math.asin(sinB*cosE + cosB*sinE*sinL) * DEG;

  return {
    ra: ((ra % 360) + 360) % 360,
    dec: dec,
    R: R,
    dpsi: nut.dpsi,   // 度
    eps0: eps0         // 度
  };
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
  var cnThreshold = params.cnThreshold || 0;

  var bi = BAND_PARAMS[band] || BAND_PARAMS['Ku'];
  var freq = customFreq || bi.freq;
  var solarTemp = bi.solarTemp;
  var sysTemp = bi.sysTemp;
  var dT = deltaT(year);

  // 天线 3dB 波束宽度 (~117λ/D)
  var beamW = 32 / (freq * diameter);

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

  var scanDays = 30;
  var dailyResults = [];
  var peakIdx = null, maxDurSec = 0;

  for (var d = -scanDays; d <= scanDays; d++) {
    var dayJD = eqDayJD + d;

    // 每天正午太阳视半径（0.26656° = 959.63″ 为1AU处标准值，除以实际日地距离R得到当日视半径）
    var noonJDE = dayJD + 0.5 + dT / SECONDS_PER_DAY;
    var noonSun = solarPosition(noonJDE);
    var sunRad = 0.26656 / noonSun.R;       // 度
    var thresh = beamW / 2 + sunRad;

    // ──── 粗扫 15 秒步长 ────
    var SCAN_STEP = 15;
    var csStep = -1, ceStep = -1, cpStep = -1, minSep = 999;
    for (var s = 0; s < 86400; s += SCAN_STEP) {
      var jdUT = dayJD + s * JD_SEC;
      var sd = sunDir(jdUT, dT);
      if (!sunUp(lat, lon, sd.d)) continue;
      var sep = vecAngle(satU, sd.d);
      if (sep < thresh) {
        if (csStep < 0) csStep = s;
        ceStep = s;
      }
      if (sep < minSep) { minSep = sep; cpStep = s; }
    }
    if (csStep < 0) continue;

    // ──── 秒级精炼 ────
    var sOut = Math.max(0, csStep - SCAN_STEP);
    var sIn  = csStep;
    var pStart = refine(dayJD, sIn, sOut, thresh, stn, satU, dT, lat, lon);

    var eIn  = ceStep;
    var eOut = Math.min(86399, ceStep + SCAN_STEP);
    var pEnd = refine(dayJD, eIn, eOut, thresh, stn, satU, dT, lat, lon);

    // 峰值逐秒搜索
    var pkSec = cpStep, pkSep = minSep;
    var ps = Math.max(0, cpStep - SCAN_STEP);
    var pe = Math.min(86399, cpStep + SCAN_STEP);
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
