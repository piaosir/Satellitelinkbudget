'use strict';
/**
 * scripts/simArOrbit.js — AR 对星目标几何模块（pages/ar-align/arOrbit.js）的离线验证
 *   node scripts/simArOrbit.js
 *
 * 用几条固定的 OMM 根数（2026-09-06 从 CelesTrak 抓的 ISS / 天和 / 中星 6C / 中星 10 / 北斗 M1）验证：
 *   1) 同步轨道：SGP4 观测角与「标称轨位」回退口径在 ~1° 内一致（两者本就该差不多，差的是倾角与漂移）；
 *   2) 过境预报：升起/落下时刻仰角 ≈ 0、弧段中点可见、最高仰角不小于弧段内任意采样、耗时可接受；
 *   3) 分类：中星 → GEO、ISS/天和 → LEO、北斗 M1 → MEO。
 * 根数会随时间老化，本脚本只验证几何自洽，不验证「今天真的几点过境」。
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.wx = { env: { USER_DATA_PATH: '' } };
const tleStore = require(path.join(ROOT, 'miniprogram', 'utils', 'tleStore.js'));
const sat = require(path.join(ROOT, 'miniprogram', 'pages', 'ar-align', 'satellite.js'));
const orb = require(path.join(ROOT, 'miniprogram', 'pages', 'ar-align', 'arOrbit.js'));

const CSV = [
  'OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT',
  'ISS (ZARYA),1998-067A,2026-09-06T03:26:51.861984,15.49001728,.00050232,51.6309,259.4125,112.3189,247.8332,0,U,25544,999,58430,.7453319E-4,.3658E-4,0',
  'CSS (TIANHE),2021-035A,2026-09-06T06:15:46.430784,15.59622579,.00023499,41.4675,189.8186,260.0025,100.0548,0,U,48274,999,30582,.16863369E-3,.13514E-3,0',
  'ZHONGXING-6C,2019-012A,2026-09-06T06:16:07.171104,1.00271971,.00138927,0.0374,352.5878,70.6012,146.6658,0,U,44067,999,2755,0,-.35E-5,0',
  'ZHONGXING-10,2011-026A,2026-09-06T02:57:21.464640,1.00268721,.00029069,1.2483,83.1148,67.6684,324.2565,0,U,37677,999,5581,0,-.202E-5,0',
  'BEIDOU-3 M1 (C19),2017-069A,2026-09-05T03:20:44.716416,1.86230754,.00073397,56.7655,60.4552,325.6441,34.3476,0,U,43001,999,6009,0,0,0'
].join('\n');

const recs = {};
for (const s of tleStore.parseOMMCsv(CSV)) recs[s.name] = sat.omm2satrec(s);

// 固定起算时刻（根数历元附近），保证结果可复现
const T0 = new Date('2026-09-06T08:00:00Z');
const obs = orb.observer(39.9042, 116.4074, 0.05); // 北京
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');

console.log('== 分类 ==');
const expectCls = { 'ISS (ZARYA)': 'LEO', 'CSS (TIANHE)': 'LEO', 'ZHONGXING-6C': 'GEO', 'ZHONGXING-10': 'GEO', 'BEIDOU-3 M1 (C19)': 'MEO' };
for (const name of Object.keys(expectCls)) {
  const c = orb.classify(recs[name]);
  check(c.cls === expectCls[name], `${name.padEnd(20)} → ${c.cls} (期望 ${expectCls[name]})  周期 ${f1(c.periodMin)} min  倾角 ${f1(c.inclDeg)}°  高度 ${c.altKm.toFixed(0)} km`);
}

console.log('\n== 同步轨道：SGP4 vs 标称轨位 ==');
for (const [name, slot] of [['ZHONGXING-6C', 130.5], ['ZHONGXING-10', 85.5]]) {
  const a = orb.lookAt(recs[name], obs, T0);
  const b = orb.slotLook(obs, slot);
  const dAz = Math.abs(orb.norm360(a.az - b.az + 180) - 180), dEl = Math.abs(a.el - b.el);
  check(dAz < 1.5 && dEl < 1.5,
    `${name.padEnd(14)} SGP4 az ${f1(a.az)} el ${f1(a.el)} 距 ${a.range.toFixed(0)} km 星下点 ${f1(a.lon)}°E ${f1(a.lat)}°N | 轨位${slot}°E az ${f1(b.az)} el ${f1(b.el)} 距 ${b.range.toFixed(0)} km | Δaz ${dAz.toFixed(2)} Δel ${dEl.toFixed(2)}`);
}
// 中星 10 标称 110.5°E 那份旧口径与星历的差距（说明为什么要用星历）
{
  const a = orb.lookAt(recs['ZHONGXING-10'], obs, T0);
  const b = orb.slotLook(obs, 110.5);
  console.log(`      中星 10 若仍按 110.5°E 标称：az ${f1(b.az)} el ${f1(b.el)}，与星历 az ${f1(a.az)} el ${f1(a.el)} 相差 ${Math.abs(a.az - b.az).toFixed(1)}° / ${Math.abs(a.el - b.el).toFixed(1)}°`);
}

console.log('\n== 过境预报（北京，起算 ' + T0.toISOString() + '）==');
for (const name of ['ISS (ZARYA)', 'CSS (TIANHE)', 'BEIDOU-3 M1 (C19)']) {
  const rec = recs[name];
  const t = Date.now();
  const p = orb.nextPass(rec, obs, T0);
  const ms = Date.now() - t;
  if (!p) { check(false, `${name} 24h 内未找到过境（LEO/MEO 在北京一天内必有）`); continue; }
  const elAos = orb.lookAt(rec, obs, p.aos).el;
  const elLos = p.los ? orb.lookAt(rec, obs, p.los).el : NaN;
  const mid = p.los ? new Date((+p.aos + +p.los) / 2) : p.maxElAt;
  const elMid = orb.lookAt(rec, obs, mid).el;
  // 弧段内密集采样，最高仰角不应低于任何采样
  let worst = -90;
  if (p.los) for (let x = +p.aos; x <= +p.los; x += 2000) worst = Math.max(worst, orb.lookAt(rec, obs, new Date(x)).el);
  const okAos = Math.abs(elAos) < 0.05, okLos = !p.los || Math.abs(elLos) < 0.05, okMid = elMid > 0, okMax = p.maxEl >= worst - 0.2;
  check(okAos && okLos && okMid && okMax && !p.inProgress || (p.inProgress && okLos && okMax),
    `${name.padEnd(20)} ${p.inProgress ? '进行中' : '下次'} ${p.aos.toISOString().slice(11, 19)}→${p.los ? p.los.toISOString().slice(11, 19) : '窗口外'} 最高 ${f1(p.maxEl)}°@${p.maxElAt.toISOString().slice(11, 19)} 时长 ${p.durationSec === null ? '-' : Math.round(p.durationSec) + 's'} | el(aos) ${elAos.toFixed(3)} el(los) ${Number.isFinite(elLos) ? elLos.toFixed(3) : '-'} el(mid) ${f1(elMid)} 密采最高 ${f1(worst)} | 耗时 ${ms} ms`);
  check(ms < 1500, `      预报耗时 ${ms} ms < 1500 ms`);
  // 连续调用：从 los 之后再算，应得到下一段而不是同一段
  if (p.los) {
    const q = orb.nextPass(rec, obs, new Date(+p.los + 1000));
    check(!!q && +q.aos > +p.los, `      从落下 +1s 起算得到下一段：${q ? q.aos.toISOString().slice(11, 19) : '无'}`);
  }
  // 弧段内起算：应判定 inProgress 且 aos 与上面一致
  if (p.los) {
    const r = orb.nextPass(rec, obs, mid);
    check(!!r && r.inProgress && Math.abs(+r.aos - +p.aos) < 1500 && Math.abs(+r.los - +p.los) < 1500,
      `      从弧段中点起算：inProgress=${r && r.inProgress} aos 差 ${r ? Math.abs(+r.aos - +p.aos) : '-'} ms los 差 ${r ? Math.abs(+r.los - +p.los) : '-'} ms`);
  }
}

console.log('\n== 同步轨道不做预报 ==');
check(orb.nextPass(recs['ZHONGXING-6C'], obs, T0) === null, 'GEO nextPass → null');

console.log('\n== 坏根数 ==');
const bad = Object.assign({}, recs['ISS (ZARYA)']);
check(orb.lookAt({ no: 0.06, ecco: 0, inclo: 0, altp: -1, alta: -1, error: 1 }, obs, T0) === null || true, 'lookAt 对异常 satrec 不抛异常');
void bad;

console.log('\n' + (fails ? `${fails} 项失败` : '全部通过'));
process.exit(fails ? 1 : 0);
