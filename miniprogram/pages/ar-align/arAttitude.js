'use strict';
/**
 * arAttitude.js — AR 对星的姿态解算与传感器口径检测（纯函数，不依赖 wx，可在 Node 下仿真）
 *
 * 坐标约定（W3C DeviceOrientation）：
 *   设备系：X 指向屏幕右、Y 指向机顶、Z 指向屏幕外法线；后置相机方向为 -Z。
 *   地球系：E 东、N 北、U 天顶。R = Rz(alpha)·Rx(beta)·Ry(gamma) 把设备系向量变到地球系。
 *   alpha 逆时针为正（W3C），beta 机顶抬起为正，gamma 右边缘压低为正。
 *
 * 各平台 wx.onDeviceMotionChange 的实际口径并不统一（安卓 alpha 顺时针、beta/gamma 反号，
 * iOS alpha 以开始监听时的朝向为 0°，鸿蒙未知），本文件只负责：
 *   1) 把某种口径的 (alpha, beta, gamma) 换成上述 W3C 三元组并拼回旋转矩阵；
 *   2) 从矩阵直接取相机方位/仰角——手机竖直时 (beta≈90°) 正是 Z-X-Y 欧拉角的奇点，
 *      单独拿 alpha 或 gamma 都会剧烈摆动，只有矩阵是稳定的；
 *   3) 罗盘锚定器：iOS 的 alpha 不是绝对方位，用罗盘在「可信仰角带」内估计零点偏差 δ，
 *      带外靠姿态传播，输出在任意仰角连续，不再需要「仰角>45° 补 180°」的补丁；
 *   4) 三个运行时口径检测器（alpha 顺/逆时针、beta 符号、机顶投影翻转），
 *      供没有真机可测的平台（鸿蒙）自适应。
 *
 * 本文件放在 ar-align 分包内：分包不能 require 其他分包，主包 utils 又受「主包未使用 JS」检查约束。
 * 仿真台：scripts/simArAlign.js（三种鸿蒙口径假设 + 苹果罗盘切轴模型逐一回放）。
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function norm360(a) {
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}

// a - b 折到 (-180, 180]
function angDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// W3C 三元组（度）→ 旋转矩阵 R = Rz(alpha)·Rx(beta)·Ry(gamma)，设备系 → 地球系(E,N,U)
function eulerToMatrix(alpha, beta, gamma) {
  const a = (alpha || 0) * D2R;
  const b = (beta || 0) * D2R;
  const g = (gamma || 0) * D2R;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return [
    [cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG],
    [sA * cG + cA * sB * sG,  cA * cB, sA * sG - cA * sB * cG],
    [-cB * sG,                sB,      cB * cG]
  ];
}

// 相机（设备系 -Z）在地球系里的方向及派生量
//   azimuth    相机水平方位，自北顺时针 0~360
//   elevation  相机仰角，-90~90，正为朝天
//   tilt       机顶(+Y)偏离天顶的角度：竖直持机≈0°，平放≈90°
//   rollMetric 设备 X 轴的天顶分量：0 表示没有横滚，|0.5| 约 30° 横滚
function cameraFromMatrix(R) {
  const east = -R[0][2];
  const north = -R[1][2];
  const up = -R[2][2];
  return {
    east: east,
    north: north,
    up: up,
    azimuth: norm360(Math.atan2(east, north) * R2D),
    elevation: Math.asin(clamp(up, -1, 1)) * R2D,
    tilt: Math.acos(clamp(R[2][1], -1, 1)) * R2D,
    rollMetric: R[2][0]
  };
}

// 机顶(+Y)水平投影的方位（自北顺时针）——安卓系罗盘/方向传感器 azimuth 的口径
function yAxisHeading(R) {
  return norm360(Math.atan2(R[0][1], R[1][1]) * R2D);
}

function circularLerp(prev, target, k) {
  return norm360(prev + k * angDiff(target, prev));
}

/**
 * 平台口径 → W3C 三元组
 * profile: {
 *   alphaCW      true = 原始 alpha 自北顺时针递增（安卓/罗盘约定），需换成 W3C 逆时针
 *   betaSign     原始 beta 乘以该符号后成为 W3C beta（机顶抬起为正）
 *   gammaSign    原始 gamma 乘以该符号后成为 W3C gamma（右边缘压低为正）
 *   yProjPatch   true = 原始 alpha 是机顶投影方位（相机越过地平线后反 180°），需补回
 *   yProjDeadCos 补丁死区：cosβ 低于 -该值才补（避免 pitch 恰在 ±90° 时浮点抖动误触发），默认 0.02
 * }
 */
function rawToW3C(raw, profile) {
  const p = profile || {};
  const beta = (raw.beta || 0) * (p.betaSign === -1 ? -1 : 1);
  const gamma = (raw.gamma || 0) * (p.gammaSign === -1 ? -1 : 1);
  let alpha = raw.alpha || 0;
  // 机顶投影在 cosβ<0（相机抬过地平线）时与相机方位差 180°，加 180 在顺/逆时针两个域里等价
  const dead = Number.isFinite(p.yProjDeadCos) ? p.yProjDeadCos : 0.02;
  if (p.yProjPatch && Math.cos(beta * D2R) < -dead) alpha += 180;
  if (p.alphaCW) alpha = 360 - alpha;
  return { alpha: norm360(alpha), beta: beta, gamma: gamma };
}

function solveCamera(raw, profile) {
  const w = rawToW3C(raw, profile);
  return cameraFromMatrix(eulerToMatrix(w.alpha, w.beta, w.gamma));
}

/**
 * 罗盘锚定器：delta = 罗盘方位 − 姿态解算的相对方位，只在可信带内更新并做圆周低通。
 *   可信带（默认）：tilt ≤ 33° 且 |rollMetric| ≤ 0.45。
 *   依据：苹果罗盘竖直持机时报后摄朝向，机顶后仰超过约 45° 才切成机顶方向并反 180°；
 *   带内罗盘 = 相机方位，带外只靠姿态传播。
 *   离群：与当前 delta 差 > outlierDeg 的样本先不采信，连续 outlierReset 次（约 2 s）仍如此则视为真变化直接重锚。
 */
function createHeadingAnchor(options) {
  const o = Object.assign({
    k: 0.1,
    maxTilt: 33,
    maxRoll: 0.45,
    outlierDeg: 60,
    outlierReset: 40
  }, options || {});
  let delta = null;
  let bad = 0;
  let lastInBand = false;
  let updates = 0;
  return {
    get anchored() { return delta !== null; },
    get delta() { return delta; },
    get inBand() { return lastInBand; },
    get updates() { return updates; },
    update(compass, yawRel, tilt, rollMetric) {
      const ok = Number.isFinite(compass) && Number.isFinite(yawRel) && Number.isFinite(tilt) &&
        tilt <= o.maxTilt && Math.abs(rollMetric || 0) <= o.maxRoll;
      lastInBand = ok;
      if (!ok) return delta;
      const sample = norm360(compass - yawRel);
      if (delta === null) {
        delta = sample;
        updates++;
        return delta;
      }
      const d = angDiff(sample, delta);
      if (Math.abs(d) > o.outlierDeg) {
        bad++;
        if (bad >= o.outlierReset) {
          delta = sample;
          bad = 0;
        }
        return delta;
      }
      bad = 0;
      delta = norm360(delta + o.k * d);
      updates++;
      return delta;
    },
    heading(yawRel) {
      return delta === null ? null : norm360(yawRel + delta);
    },
    reset() {
      delta = null;
      bad = 0;
      lastInBand = false;
      updates = 0;
    }
  };
}

/**
 * alpha 转向检测：罗盘方位在所有平台都是顺时针递增；比较同一时间窗内 alpha 与罗盘的变化方向，
 * 同向 → 'cw'（安卓口径），反向 → 'ccw'（W3C 口径）。
 *   只在 |cosβ| ≥ minAbsCos 时采样（贴近竖直是欧拉奇点，alpha 会无意义地摆动）；
 *   单窗变化 > maxTurnDeg 视为翻转/跳变而非转身，不投票；连续 needVotes 票同向才下结论。
 */
function createAlphaSenseDetector(options) {
  const o = Object.assign({
    windowMs: 400,
    minTurnDeg: 8,
    maxTurnDeg: 90,
    needVotes: 12,
    minAbsCos: 0.35,
    maxAgeMs: 1500
  }, options || {});
  const buf = [];
  let votes = 0;
  let lastVote = 0;
  let result = null;
  return {
    get result() { return result; },
    get votes() { return votes; },
    feed(ts, alpha, cosBeta, compass) {
      if (!Number.isFinite(alpha) || !Number.isFinite(compass) || !Number.isFinite(cosBeta) ||
          Math.abs(cosBeta) < o.minAbsCos) {
        buf.length = 0;
        return result;
      }
      buf.push({ ts: ts, alpha: alpha, compass: compass });
      while (buf.length && ts - buf[0].ts > o.maxAgeMs) buf.shift();
      let ref = null;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (ts - buf[i].ts >= o.windowMs) {
          ref = buf[i];
          break;
        }
      }
      if (!ref) return result;
      const dA = angDiff(alpha, ref.alpha);
      const dC = angDiff(compass, ref.compass);
      if (Math.abs(dA) < o.minTurnDeg || Math.abs(dC) < o.minTurnDeg) return result;
      if (Math.abs(dA) > o.maxTurnDeg || Math.abs(dC) > o.maxTurnDeg) return result;
      const v = dA * dC > 0 ? 1 : -1;
      if (v === lastVote) {
        votes++;
      } else {
        votes = 1;
        lastVote = v;
      }
      if (votes >= o.needVotes) result = v > 0 ? 'cw' : 'ccw';
      return result;
    }
  };
}

/**
 * beta 符号检测：AR 持机时机顶必然朝上，W3C 口径下 beta 为正（≈ 60°~130°），
 * 安卓口径（机顶压低为正）下为负。取 50°≤|beta|≤150° 的样本做多数表决。
 */
function createBetaSignDetector(options) {
  const o = Object.assign({ minAbs: 50, maxAbs: 150, needVotes: 20 }, options || {});
  let pos = 0;
  let neg = 0;
  let result = null;
  return {
    get result() { return result; },
    counts() { return { pos: pos, neg: neg }; },
    feed(rawBeta) {
      if (!Number.isFinite(rawBeta)) return result;
      const a = Math.abs(rawBeta);
      if (a < o.minAbs || a > o.maxAbs) return result;
      if (rawBeta > 0) pos++;
      else neg++;
      if (pos + neg >= o.needVotes) result = pos > neg ? 'w3c' : 'android';
      return result;
    }
  };
}

/**
 * 过地平线检测：相机越过地平线（cosβ 变号）前后比较 alpha。
 *   |Δalpha| ≥ jumpDeg → 'yproj'：alpha 是机顶投影，越过后反 180°，需要 yProjPatch；
 *   |Δalpha| ≤ flatDeg → 'continuous'：alpha 连续，不需要补丁（需 needContinuous 次干净越过且从未见过跳变；
 *   机顶投影口径下越过必然跳 180°，一次干净越过就足以排除它，用户抬手机通常也只越过一次）。
 * 「前」样本取越过前最后一个离开死区（|cosβ| ≥ refAbsCos）的样本，「后」样本等 postMs 且离开死区再取，
 * 避免贴近竖直时机顶投影本身抖动造成误判。
 */
function createHorizonCrossingDetector(options) {
  const o = Object.assign({
    minAbsCos: 0.06,
    refAbsCos: 0.12,
    postMs: 350,
    waitMaxMs: 1500,
    jumpDeg: 120,
    flatDeg: 45,
    needContinuous: 1,
    maxAgeMs: 3000
  }, options || {});
  const buf = [];
  let stableSign = 0;
  let pending = null;
  let yproj = 0;
  let cont = 0;
  let result = null;
  return {
    get result() { return result; },
    counts() { return { yproj: yproj, continuous: cont }; },
    feed(ts, alpha, cosBeta) {
      if (!Number.isFinite(alpha) || !Number.isFinite(cosBeta)) return result;
      buf.push({ ts: ts, alpha: alpha, cos: cosBeta });
      while (buf.length && ts - buf[0].ts > o.maxAgeMs) buf.shift();
      const s = Math.abs(cosBeta) >= o.minAbsCos ? (cosBeta > 0 ? 1 : -1) : 0;
      if (stableSign === 0) {
        if (s !== 0) stableSign = s;
        return result;
      }
      if (!pending) {
        if (s !== 0 && s !== stableSign) {
          let before = null;
          for (let i = buf.length - 1; i >= 0; i--) {
            if (buf[i].cos * stableSign >= o.refAbsCos) {
              before = buf[i];
              break;
            }
          }
          pending = { tc: ts, signAfter: s, before: before };
        }
        return result;
      }
      if (s === stableSign) {
        pending = null; // 又回到原侧，不算越过
        return result;
      }
      if (ts - pending.tc < o.postMs) return result;
      if (Math.abs(cosBeta) >= o.refAbsCos && s === pending.signAfter) {
        if (pending.before) {
          const d = Math.abs(angDiff(alpha, pending.before.alpha));
          if (d >= o.jumpDeg) {
            yproj++;
            result = 'yproj';
          } else if (d <= o.flatDeg) {
            cont++;
            if (yproj === 0 && cont >= o.needContinuous) result = 'continuous';
          }
        }
        stableSign = pending.signAfter;
        pending = null;
      } else if (ts - pending.tc > o.waitMaxMs) {
        stableSign = pending.signAfter;
        pending = null;
      }
      return result;
    }
  };
}

module.exports = {
  D2R: D2R,
  R2D: R2D,
  norm360: norm360,
  angDiff: angDiff,
  clamp: clamp,
  eulerToMatrix: eulerToMatrix,
  cameraFromMatrix: cameraFromMatrix,
  yAxisHeading: yAxisHeading,
  circularLerp: circularLerp,
  rawToW3C: rawToW3C,
  solveCamera: solveCamera,
  createHeadingAnchor: createHeadingAnchor,
  createAlphaSenseDetector: createAlphaSenseDetector,
  createBetaSignDetector: createBetaSignDetector,
  createHorizonCrossingDetector: createHorizonCrossingDetector
};
