// 星间链路 ISL 可视化
// 复用首页参数，在 3D 地球模型上分别设置两颗卫星的轨道（高度 / 倾角 / 升交点赤经 / 幅角），
// 支持 GEO + MEO 等异轨道场景，计算两星实际 ISL 距离、几何视距上限与切线高度。

const RE = 6378.137;          // 地球赤道半径 km (WGS-84，与链路计算一致)
const C_KM_S = 299792.458;    // 光速 km/s
const DEG = Math.PI / 180;
const COASTLINE = require('./coastline.js'); // 海岸线 + 国界 折线 [[lon,lat,...], ...]（度）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, def) => {
  const n = parseFloat(v);
  return (isFinite(n)) ? n : def;
};

Page({
  data: {
    // 卫星1 轨道根数
    h1: '1145', i1: '53', raan1: '10', u1: '265',
    // 卫星2 轨道根数
    h2: '1145', i2: '53', raan2: '30', u2: '255',
    // 大气遮挡高度 (km)：视距切线需高于 RE+clearance（默认 100 km 大气层/卡门线）
    clearance: '100',
    // 计算结果
    dCur: '--',          // 当前 ISL 斜距 km
    dMax: '--',          // 几何视距上限 km
    losMargin: '--',     // 视距裕量 = 上限 − 当前 km
    thetaCur: '--',      // 当前地心角分离 °
    thetaMaxDeg: '--',   // 几何最大角分离 °
    tangentText: '--',   // 切线高度描述
    deltaH: '--',        // 两星高度差 km
    delayMs: '--',       // ISL 单向时延 ms
    rttMs: '--',         // ISL 往返时延 ms
    statusText: '视距通畅',
    blocked: false,
    // 显示开关
    show1: true, show2: true, showStation: true,
    // 地球站（辅助计算斜距）
    esLat: '39.93', esLon: '116.4',
    latHemi: '°N', lonHemi: '°E', esAddr: '--',
    slant1: '--', elev1: '--', az1: '--', esDelay1: '--', vis1: true,
    slant2: '--', elev2: '--', az2: '--', esDelay2: '--', vis2: true
  },

  // 渲染 / 交互状态
  _ctx: null,
  _canvas: null,
  _cw: 0,
  _ch: 0,
  _yaw: 0.6,
  _pitch: -0.42,
  _dragging: false,
  _lastX: 0,
  _lastY: 0,
  _autoRotate: true,
  _rafId: 0,

  onLoad() {
    // 默认使用固定典型轨道（不读取卫星/链路计算参数），直接按 data 默认值计算
    this._recompute();
  },

  onReady() {
    this._initCanvas();
  },

  onUnload() {
    if (this._rafId && this._canvas) this._canvas.cancelAnimationFrame(this._rafId);
  },

  // ===================== 轨道几何 =====================

  // 圆轨道卫星 ECI 位置（极轴=Y，赤道=XZ 平面）
  // 升交点赤经绕极轴(Y)旋转，倾角绕节线(X)旋转，幅角 u 自升交点起算
  _satPos(R, iDeg, raanDeg, uDeg) {
    const i = iDeg * DEG, raan = raanDeg * DEG, u = uDeg * DEG;
    const cu = Math.cos(u), su = Math.sin(u);
    // 倾角抬升
    const x0 = R * cu;
    const y0 = -R * su * Math.sin(i);
    const z0 = R * su * Math.cos(i);
    // 升交点赤经绕 Y
    const cO = Math.cos(raan), sO = Math.sin(raan);
    return [
      x0 * cO + z0 * sO,
      y0,
      -x0 * sO + z0 * cO
    ];
  },

  // 地球站地表位置（与海岸线同一坐标系：极轴=Y，经度 0 在 +X，经度取负以对齐地图朝向）
  _stationPos(latDeg, lonDeg) {
    const lat = latDeg * DEG, lon = lonDeg * DEG;
    const cl = Math.cos(lat);
    return [RE * cl * Math.cos(lon), RE * Math.sin(lat), -RE * cl * Math.sin(lon)];
  },

  // 地球站到卫星的斜距 / 仰角 / 方位角（本地 ENU 坐标，极轴=Y）
  _slant(station, P) {
    const lx = P[0] - station[0], ly = P[1] - station[1], lz = P[2] - station[2];
    const slant = Math.sqrt(lx * lx + ly * ly + lz * lz);
    // 本地天顶 up = 站点单位矢量
    const ux = station[0] / RE, uy = station[1] / RE, uz = station[2] / RE;
    // 东向 east = normalize(up × Y轴)
    let ex = -uz, ey = 0, ez = ux;
    const en = Math.hypot(ex, ey, ez) || 1;
    ex /= en; ey /= en; ez /= en;
    // 北向 north = east × up
    const nx = ey * uz - ez * uy, ny = ez * ux - ex * uz, nz = ex * uy - ey * ux;
    const e = lx * ex + ly * ey + lz * ez;
    const n = lx * nx + ly * ny + lz * nz;
    const u = lx * ux + ly * uy + lz * uz;
    const elev = slant > 0 ? Math.asin(clamp(u / slant, -1, 1)) / DEG : 0;
    let az = Math.atan2(e, n) / DEG;
    if (az < 0) az += 360;
    return { slant, elev, az };
  },

  _recompute() {
    const d = this.data;
    const h1 = num(d.h1, 0), h2 = num(d.h2, 0);
    const R1 = RE + h1, R2 = RE + h2;
    const Rc = RE + Math.max(0, num(d.clearance, 0));

    const P1 = this._satPos(R1, num(d.i1, 0), num(d.raan1, 0), num(d.u1, 0));
    const P2 = this._satPos(R2, num(d.i2, 0), num(d.raan2, 0), num(d.u2, 0));

    // 弦长 + 当前地心角
    const dx = P2[0] - P1[0], dy = P2[1] - P1[1], dz = P2[2] - P1[2];
    const dCur = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dot = P1[0] * P2[0] + P1[1] * P2[1] + P1[2] * P2[2];
    const thetaCur = Math.acos(clamp(dot / (R1 * R2), -1, 1)) / DEG;

    // 视线与地心最近距离（切线高度）
    const dd = dx * dx + dy * dy + dz * dz;
    const t = dd > 0 ? -(P1[0] * dx + P1[1] * dy + P1[2] * dz) / dd : -1;
    let minDist, hasGrazing;
    if (t > 0 && t < 1) {
      const fx = P1[0] + t * dx, fy = P1[1] + t * dy, fz = P1[2] + t * dz;
      minDist = Math.sqrt(fx * fx + fy * fy + fz * fz);
      hasGrazing = true;
    } else {
      minDist = Math.min(R1, R2);
      hasGrazing = false;
    }
    const tangentAlt = minDist - RE;
    const blocked = hasGrazing && (minDist < Rc);

    // 几何视距上限（与相位无关，仅取决于半径与余隙）
    const a1 = R1 > Rc ? Math.acos(clamp(Rc / R1, -1, 1)) : 0;
    const a2 = R2 > Rc ? Math.acos(clamp(Rc / R2, -1, 1)) : 0;
    const thetaMax = (a1 + a2) / DEG;
    const dMax = Math.sqrt(Math.max(0, R1 * R1 - Rc * Rc)) + Math.sqrt(Math.max(0, R2 * R2 - Rc * Rc));

    const tangentText = hasGrazing ? `${tangentAlt.toFixed(0)} km` : '不掠地球';
    const statusText = blocked ? '视线被地球遮挡' : '视距通畅';

    // 地球站斜距 / 仰角 / 方位角
    const latV = num(d.esLat, 0), lonV = num(d.esLon, 0);
    const station = this._stationPos(latV, lonV);
    const s1 = this._slant(station, P1);
    const s2 = this._slant(station, P2);
    const delay = dCur / C_KM_S * 1000;
    // 经纬度半球标注
    const latHemi = latV >= 0 ? '°N' : '°S';
    const lonHemi = lonV >= 0 ? '°E' : '°W';
    const esAddr = `${Math.abs(latV)}${latHemi} / ${Math.abs(lonV)}${lonHemi}`;

    this.setData({
      dCur: dCur.toFixed(1),
      dMax: dMax.toFixed(1),
      losMargin: (dMax - dCur).toFixed(1),
      thetaCur: thetaCur.toFixed(1),
      thetaMaxDeg: thetaMax.toFixed(1),
      tangentText,
      deltaH: Math.abs(h1 - h2).toFixed(0),
      delayMs: delay.toFixed(3),
      rttMs: (delay * 2).toFixed(3),
      blocked,
      statusText,
      latHemi, lonHemi, esAddr,
      slant1: s1.slant.toFixed(1),
      elev1: s1.elev.toFixed(1),
      az1: s1.az.toFixed(1),
      esDelay1: (s1.slant / C_KM_S * 1000).toFixed(3),
      vis1: s1.elev >= 0,
      slant2: s2.slant.toFixed(1),
      elev2: s2.elev.toFixed(1),
      az2: s2.az.toFixed(1),
      esDelay2: (s2.slant / C_KM_S * 1000).toFixed(3),
      vis2: s2.elev >= 0
    });

    this._P1 = P1;
    this._P2 = P2;
    this._station = station;
  },

  // ===================== 输入交互 =====================

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value }, () => this._recompute());
  },
  onSliderChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: String(e.detail.value) }, () => this._recompute());
  },
  // 显示/隐藏 卫星1 / 卫星2 / 地球站（仅影响 3D 渲染，下一帧自动生效）
  onToggle(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: !this.data[key] });
    wx.vibrateShort({ type: 'light' });
  },

  // 点击经纬度后缀切换半球（正负号），以支持南纬 / 西经
  toggleHemi(e) {
    const key = e.currentTarget.dataset.key;
    const v = parseFloat(this.data[key]);
    this.setData({ [key]: String(isFinite(v) ? -v : 0) }, () => this._recompute());
    wx.vibrateShort({ type: 'light' });
  },

  // ===================== 3D 渲染 =====================

  _initCanvas() {
    wx.createSelectorQuery().select('#globeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = info.pixelRatio || 2;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this._canvas = canvas;
        this._ctx = ctx;
        this._cw = res[0].width;
        this._ch = res[0].height;
        this._loop();
      });
  },

  _loop() {
    if (!this._canvas) return;
    if (this._autoRotate && !this._dragging) this._yaw += 0.0035;
    this._draw();
    this._rafId = this._canvas.requestAnimationFrame(() => this._loop());
  },

  // 旋转 + 正交投影
  // yaw/pitch 的 cos/sin 每帧只算一次(由 _draw 缓存到 this)，避免逐点重复三角运算
  _project(x, y, z, cx, cy, scale) {
    const cy0 = this._cYaw, sy0 = this._sYaw;
    let x1 = x * cy0 + z * sy0;
    let z1 = -x * sy0 + z * cy0;
    let y1 = y;
    const cp = this._cPitch, sp = this._sPitch;
    let y2 = y1 * cp - z1 * sp;
    let z2 = y1 * sp + z1 * cp;
    return { x: cx + x1 * scale, y: cy - y2 * scale, z: z2 };
  },

  _occluded(p, cx, cy, Rpx) {
    if (p.z >= 0) return false;
    const dx = p.x - cx, dy = p.y - cy;
    return (dx * dx + dy * dy) < Rpx * Rpx * 0.999;
  },

  _drawPath(pts, cx, cy, scale, Rpx, opt) {
    const ctx = this._ctx;
    const scr = pts.map(p => {
      const s = this._project(p[0], p[1], p[2], cx, cy, scale);
      s.hidden = this._occluded(s, cx, cy, Rpx);
      return s;
    });
    let prevHidden = null;
    ctx.lineWidth = opt.width || 1;
    for (let i = 1; i < scr.length; i++) {
      const a = scr[i - 1], b = scr[i];
      const hidden = a.hidden || b.hidden;
      if (hidden !== prevHidden) {
        if (prevHidden !== null) ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.strokeStyle = hidden ? (opt.hiddenColor || 'rgba(255,255,255,0.12)') : opt.color;
        ctx.setLineDash(hidden ? [3, 4] : (opt.dash || []));
        prevHidden = hidden;
      }
      ctx.lineTo(b.x, b.y);
    }
    if (prevHidden !== null) ctx.stroke();
    ctx.setLineDash([]);
  },

  _draw() {
    const ctx = this._ctx;
    const w = this._cw, h = this._ch;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // 本帧旋转矩阵的三角量缓存，供 _project 逐点复用
    this._cYaw = Math.cos(this._yaw); this._sYaw = Math.sin(this._yaw);
    this._cPitch = Math.cos(this._pitch); this._sPitch = Math.sin(this._pitch);

    const d = this.data;
    const R1 = RE + num(d.h1, 0), R2 = RE + num(d.h2, 0);

    const half = Math.min(w, h) / 2 * 0.92;
    const maxOrbit = Math.max(R1, R2, RE * 1.05);
    const scale = half / maxOrbit;
    const Rpx = RE * scale;

    // 大气薄辉光
    const glow = ctx.createRadialGradient(cx, cy, Rpx * 0.99, cx, cy, Rpx * 1.09);
    glow.addColorStop(0, 'rgba(90,130,165,0.12)');
    glow.addColorStop(1, 'rgba(90,130,165,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx * 1.09, 0, Math.PI * 2);
    ctx.fill();

    // 地球球体（低饱和、定向光照）
    const lightX = cx - Rpx * 0.3, lightY = cy - Rpx * 0.34;
    const earth = ctx.createRadialGradient(lightX, lightY, Rpx * 0.1, cx, cy, Rpx * 1.05);
    earth.addColorStop(0, '#3a5269');
    earth.addColorStop(0.5, '#263a4d');
    earth.addColorStop(0.82, '#172734');
    earth.addColorStop(1, '#0c1722');
    ctx.fillStyle = earth;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(110,145,180,0.22)';
    ctx.stroke();

    this._drawGraticule(cx, cy, scale, Rpx);
    this._drawCoastline(cx, cy, scale, Rpx);

    const show1 = d.show1, show2 = d.show2, showSt = d.showStation;

    // 两条轨道（各自倾角 / 升交点赤经）
    if (show1) this._drawOrbit(R1, num(d.i1, 0), num(d.raan1, 0), cx, cy, scale, Rpx, 'rgba(111,159,200,0.4)');
    if (show2) this._drawOrbit(R2, num(d.i2, 0), num(d.raan2, 0), cx, cy, scale, Rpx, 'rgba(194,162,94,0.4)');

    const P1 = this._P1 || this._satPos(R1, num(d.i1, 0), num(d.raan1, 0), num(d.u1, 0));
    const P2 = this._P2 || this._satPos(R2, num(d.i2, 0), num(d.raan2, 0), num(d.u2, 0));

    // ISL 链路（两星都显示时才画）
    if (show1 && show2) {
      const blocked = d.blocked;
      const linePts = [];
      const N = 60;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        linePts.push([
          P1[0] + (P2[0] - P1[0]) * t,
          P1[1] + (P2[1] - P1[1]) * t,
          P1[2] + (P2[2] - P1[2]) * t
        ]);
      }
      this._drawPath(linePts, cx, cy, scale, Rpx, {
        color: blocked ? '#c25b58' : '#5a93a8',
        hiddenColor: blocked ? 'rgba(194,91,88,0.22)' : 'rgba(90,147,168,0.18)',
        width: 1.6,
        dash: blocked ? [6, 5] : []
      });
    }

    // 地球站斜距线（站与对应卫星都显示时才画）
    const station = this._station || this._stationPos(num(d.esLat, 0), num(d.esLon, 0));
    if (showSt && show1) this._drawSlant(station, P1, cx, cy, scale, Rpx, d.vis1);
    if (showSt && show2) this._drawSlant(station, P2, cx, cy, scale, Rpx, d.vis2);

    if (show1) this._drawSat(P1, cx, cy, scale, Rpx, '#6f9fc8', '卫星1');
    if (show2) this._drawSat(P2, cx, cy, scale, Rpx, '#c2a25e', '卫星2');
    if (showSt) this._drawStation(station, cx, cy, scale, Rpx);
  },

  // 站→星斜距线（可见绿、地平线下红，被地球挡住部分自动虚淡）
  _drawSlant(station, P, cx, cy, scale, Rpx, visible) {
    const pts = [];
    const N = 40;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      pts.push([
        station[0] + (P[0] - station[0]) * t,
        station[1] + (P[1] - station[1]) * t,
        station[2] + (P[2] - station[2]) * t
      ]);
    }
    this._drawPath(pts, cx, cy, scale, Rpx, {
      color: visible ? '#6fb88f' : '#b87a6f',
      hiddenColor: visible ? 'rgba(111,184,143,0.18)' : 'rgba(184,122,111,0.15)',
      width: 1,
      dash: [4, 4]
    });
  },

  _drawStation(station, cx, cy, scale, Rpx) {
    const ctx = this._ctx;
    const s = this._project(station[0], station[1], station[2], cx, cy, scale);
    const hidden = this._occluded(s, cx, cy, Rpx);
    const r = hidden ? 3 : 4.5;
    // 方块标记
    ctx.beginPath();
    ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
    ctx.fillStyle = '#6fb88f';
    ctx.globalAlpha = hidden ? 0.4 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!hidden) this._label('地球站', s.x + 8, s.y + 4, '#a9d6bd');
  },

  // 带暗色描边的小标签，提升在轨道线上的可读性
  _label(text, x, y, color) {
    const ctx = this._ctx;
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(8,12,18,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || 'rgba(214,222,232,0.95)';
    ctx.fillText(text, x, y);
  },

  _drawGraticule(cx, cy, scale, Rpx) {
    for (let lat = -60; lat <= 60; lat += 30) {
      const latR = lat * DEG;
      const pts = [];
      for (let lon = 0; lon <= 360; lon += 6) {
        const r = lon * DEG;
        pts.push([RE * Math.cos(latR) * Math.cos(r), RE * Math.sin(latR), RE * Math.cos(latR) * Math.sin(r)]);
      }
      this._drawPath(pts, cx, cy, scale, Rpx, {
        color: lat === 0 ? 'rgba(150,180,210,0.35)' : 'rgba(150,180,210,0.16)',
        hiddenColor: 'rgba(150,180,210,0.04)',
        width: lat === 0 ? 1 : 0.6
      });
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const r = lon * DEG;
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 6) {
        const latR = lat * DEG;
        pts.push([RE * Math.cos(latR) * Math.cos(r), RE * Math.sin(latR), RE * Math.cos(latR) * Math.sin(r)]);
      }
      this._drawPath(pts, cx, cy, scale, Rpx, {
        color: 'rgba(150,180,210,0.14)',
        hiddenColor: 'rgba(150,180,210,0.04)',
        width: 0.6
      });
    }
  },

  // 陆地/海岸线轮廓：每条折线投到地球表面（与经纬网同坐标系：极轴=Y，经度0在+X，绕Y到+Z）
  // 复用 _drawPath，背面自动虚淡，正面实线。
  // 球面 XYZ 与经纬度无关、不随旋转变化，故首帧构建一次缓存到 this._coastXYZ，
  // 后续帧只做投影，避免对 2 万+ 点逐帧重复三角运算（50m 数据下这是性能关键）。
  _buildCoastXYZ() {
    const polys = [];
    for (let p = 0; p < COASTLINE.length; p++) {
      const poly = COASTLINE[p];
      if (poly.length < 4) continue;
      const pts = [];
      for (let k = 0; k < poly.length; k += 2) {
        const lon = poly[k] * DEG, lat = poly[k + 1] * DEG;
        const cl = Math.cos(lat);
        // 经度取负：修正东西镜像（与 isl-visual 既有坐标系手性对齐，使大陆朝向正确）
        pts.push([RE * cl * Math.cos(lon), RE * Math.sin(lat), -RE * cl * Math.sin(lon)]);
      }
      polys.push(pts);
    }
    return polys;
  },

  _drawCoastline(cx, cy, scale, Rpx) {
    if (!this._coastXYZ) this._coastXYZ = this._buildCoastXYZ();
    const polys = this._coastXYZ;
    for (let p = 0; p < polys.length; p++) {
      this._drawPath(polys[p], cx, cy, scale, Rpx, {
        color: 'rgba(150,185,215,0.55)',
        hiddenColor: 'rgba(150,185,215,0.08)',
        width: 0.7
      });
    }
  },

  _drawOrbit(R, iDeg, raanDeg, cx, cy, scale, Rpx, color) {
    const pts = [];
    for (let u = 0; u <= 360; u += 4) pts.push(this._satPos(R, iDeg, raanDeg, u));
    this._drawPath(pts, cx, cy, scale, Rpx, {
      color, hiddenColor: 'rgba(255,255,255,0.08)', width: 1
    });
  },

  _drawSat(p, cx, cy, scale, Rpx, color, label) {
    const ctx = this._ctx;
    const s = this._project(p[0], p[1], p[2], cx, cy, scale);
    const hidden = this._occluded(s, cx, cy, Rpx);
    ctx.beginPath();
    ctx.arc(s.x, s.y, hidden ? 3.5 : 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = hidden ? 0.35 : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, hidden ? 1.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#dfe6ee';
    ctx.fill();
    if (!hidden) this._label(label, s.x + 9, s.y - 7, color);
  },

  // ===================== 触摸旋转 =====================

  onTouchStart(e) {
    const t = e.touches[0];
    this._dragging = true;
    this._autoRotate = false;
    this._lastX = t.clientX;
    this._lastY = t.clientY;
  },
  onTouchMove(e) {
    if (!this._dragging) return;
    const t = e.touches[0];
    this._yaw += (t.clientX - this._lastX) * 0.01;
    this._pitch = clamp(this._pitch + (t.clientY - this._lastY) * 0.01, -1.45, 1.45);
    this._lastX = t.clientX;
    this._lastY = t.clientY;
  },
  onTouchEnd() {
    this._dragging = false;
  }
});
