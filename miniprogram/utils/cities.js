// cities.js
// 城市数据 - 覆盖中国所有地级市及主要国际城市

// 中国地级市总数
const CHINA_CITIES_COUNT = 349;

// 城市显示优先级顺序（打开下拉时默认排序）
const PRIORITY_ORDER = [
  // 第1层：直辖市 + 港澳台
  '北京', '上海', '天津', '重庆', '香港', '澳门', '台北',
  // 第2层：一线城市 + 各省省会
  '深圳',
  '石家庄', '太原', '呼和浩特',
  '沈阳', '长春', '哈尔滨',
  '济南', '南京', '杭州', '合肥', '福州', '南昌',
  '郑州', '武汉', '长沙',
  '广州', '南宁', '海口',
  '成都', '贵阳', '昆明', '拉萨',
  '西安', '兰州', '西宁',
  '银川',      // 宁夏省会 / 中星27信关站
  '乌鲁木齐',  // 新疆省会 / 中星26关口站
  // 第3层：卫通信关站 / 航天重要城市
  '怀来',    // 中星16 Ka信关站
  '喀什',    // 中星26关口站
  '大理',    // 中星26关口站
  '格尔木',  // 中星27信关站
  '西昌',    // 卫星发射中心
  '文昌',    // 卫星发射中心
  '敦煌',    // 深空测控站
  // 第4层：亚太地区各国首都
  '东京', '首尔', '乌兰巴托',
  '曼谷', '新加坡', '吉隆坡', '雅加达', '马尼拉', '河内',
  '金边', '万象', '内比都',
  '新德里', '达卡', '科伦坡', '加德满都', '伊斯兰堡',
  '堪培拉', '阿布扎比'
];

const CITIES_DATA = [
  // ========== 中国地级市 (337个) ==========
  
  // 直辖市 (4个)
  { name: "北京", py: "bj", lat: 39.904, lon: 116.407, alt: 43.5 },
  { name: "上海", py: "sh", lat: 31.230, lon: 121.473, alt: 4.0 },
  { name: "天津", py: "tj", lat: 39.084, lon: 117.201, alt: 5.0 },
  { name: "重庆", py: "cq", lat: 29.563, lon: 106.551, alt: 237.0 },
  
  // 特别行政区 (2个)
  { name: "香港", py: "xg", lat: 22.319, lon: 114.169, alt: 32.0 },
  { name: "澳门", py: "am", lat: 22.199, lon: 113.544, alt: 22.0 },
  
  // 台湾省 (1个)
  { name: "台北", py: "tb", lat: 25.033, lon: 121.565, alt: 10.0 },
  
  // 黑龙江省 (13个)
  { name: "哈尔滨", py: "heb", lat: 45.803, lon: 126.535, alt: 150.0 },
  { name: "齐齐哈尔", py: "qqhe", lat: 47.354, lon: 123.918, alt: 147.0 },
  { name: "牡丹江", py: "mdj", lat: 44.551, lon: 129.633, alt: 230.0 },
  { name: "佳木斯", py: "jms", lat: 46.800, lon: 130.318, alt: 83.0 },
  { name: "大庆", py: "dq", lat: 46.590, lon: 125.104, alt: 146.0 },
  { name: "鸡西", py: "jx", lat: 45.300, lon: 130.969, alt: 239.0 },
  { name: "双鸭山", py: "sys", lat: 46.646, lon: 131.159, alt: 81.0 },
  { name: "伊春", py: "yc", lat: 47.727, lon: 128.899, alt: 241.0 },
  { name: "七台河", py: "qth", lat: 45.771, lon: 131.003, alt: 215.0 },
  { name: "鹤岗", py: "hg", lat: 47.350, lon: 130.298, alt: 100.0 },
  { name: "黑河", py: "hh", lat: 50.245, lon: 127.528, alt: 166.0 },
  { name: "绥化", py: "shh", lat: 46.637, lon: 126.969, alt: 180.0 },
  { name: "大兴安岭", py: "dxal", lat: 51.991, lon: 124.711, alt: 496.0 },
  
  // 吉林省 (9个)
  { name: "长春", py: "cc", lat: 43.817, lon: 125.324, alt: 215.0 },
  { name: "吉林", py: "jl", lat: 43.838, lon: 126.550, alt: 189.0 },
  { name: "四平", py: "sp", lat: 43.166, lon: 124.350, alt: 165.0 },
  { name: "辽源", py: "ly", lat: 42.888, lon: 125.145, alt: 260.0 },
  { name: "通化", py: "thh", lat: 41.728, lon: 125.940, alt: 380.0 },
  { name: "白山", py: "bs", lat: 41.943, lon: 126.428, alt: 696.0 },
  { name: "松原", py: "soy", lat: 45.142, lon: 124.825, alt: 140.0 },
  { name: "白城", py: "bc", lat: 45.619, lon: 122.839, alt: 155.0 },
  { name: "延边", py: "yb", lat: 42.891, lon: 129.509, alt: 176.0 },
  
  // 辽宁省 (14个)
  { name: "沈阳", py: "sya", lat: 41.805, lon: 123.431, alt: 55.0 },
  { name: "大连", py: "dl", lat: 38.914, lon: 121.615, alt: 93.0 },
  { name: "鞍山", py: "as", lat: 41.108, lon: 122.994, alt: 40.0 },
  { name: "抚顺", py: "fs", lat: 41.881, lon: 123.957, alt: 117.0 },
  { name: "本溪", py: "bx", lat: 41.294, lon: 123.766, alt: 185.0 },
  { name: "丹东", py: "dd", lat: 40.000, lon: 124.357, alt: 14.0 },
  { name: "锦州", py: "jz", lat: 41.095, lon: 121.127, alt: 28.0 },
  { name: "营口", py: "yk", lat: 40.666, lon: 122.235, alt: 4.0 },
  { name: "阜新", py: "fx", lat: 42.021, lon: 121.670, alt: 180.0 },
  { name: "辽阳", py: "liy", lat: 41.268, lon: 123.173, alt: 30.0 },
  { name: "盘锦", py: "pj", lat: 41.120, lon: 122.070, alt: 6.0 },
  { name: "铁岭", py: "tl", lat: 42.286, lon: 123.726, alt: 73.0 },
  { name: "朝阳", py: "chy", lat: 41.576, lon: 120.451, alt: 169.0 },
  { name: "葫芦岛", py: "hld", lat: 40.711, lon: 120.836, alt: 10.0 },
  
  // 内蒙古自治区 (12个)
  { name: "呼和浩特", py: "hhht", lat: 40.842, lon: 111.749, alt: 1065.0 },
  { name: "包头", py: "bt", lat: 40.657, lon: 109.840, alt: 1067.0 },
  { name: "乌海", py: "wh", lat: 39.655, lon: 106.794, alt: 1150.0 },
  { name: "赤峰", py: "cf", lat: 42.258, lon: 118.887, alt: 568.0 },
  { name: "通辽", py: "tol", lat: 43.653, lon: 122.244, alt: 179.0 },
  { name: "鄂尔多斯", py: "eeds", lat: 39.608, lon: 109.781, alt: 1380.0 },
  { name: "呼伦贝尔", py: "hlbe", lat: 49.212, lon: 119.766, alt: 650.0 },
  { name: "巴彦淖尔", py: "byne", lat: 40.743, lon: 107.387, alt: 1039.0 },
  { name: "乌兰察布", py: "wlcb", lat: 41.000, lon: 113.133, alt: 1417.0 },
  { name: "兴安盟", py: "xam", lat: 46.076, lon: 122.037, alt: 284.0 },
  { name: "锡林郭勒盟", py: "xlglm", lat: 43.933, lon: 116.048, alt: 989.0 },
  { name: "阿拉善盟", py: "alsm", lat: 38.851, lon: 105.729, alt: 1342.0 },
  
  // 河北省 (11个)
  { name: "石家庄", py: "sjz", lat: 38.042, lon: 114.514, alt: 83.0 },
  { name: "唐山", py: "ts", lat: 39.631, lon: 118.180, alt: 29.0 },
  { name: "秦皇岛", py: "qhd", lat: 39.936, lon: 119.600, alt: 5.0 },
  { name: "邯郸", py: "hd", lat: 36.609, lon: 114.490, alt: 60.0 },
  { name: "邢台", py: "xt", lat: 37.070, lon: 114.504, alt: 77.0 },
  { name: "保定", py: "bd", lat: 38.874, lon: 115.465, alt: 19.0 },
  { name: "张家口", py: "zjk", lat: 40.824, lon: 114.886, alt: 726.0 },
  { name: "承德", py: "chd", lat: 40.951, lon: 117.963, alt: 386.0 },
  { name: "沧州", py: "caz", lat: 38.304, lon: 116.839, alt: 10.0 },
  { name: "廊坊", py: "lf", lat: 39.538, lon: 116.683, alt: 27.0 },
  { name: "衡水", py: "hs", lat: 37.739, lon: 115.670, alt: 20.0 },
  
  // 山西省 (11个)
  { name: "太原", py: "ty", lat: 37.870, lon: 112.549, alt: 800.0 },
  { name: "大同", py: "dt", lat: 40.076, lon: 113.300, alt: 1040.0 },
  { name: "阳泉", py: "yq", lat: 37.857, lon: 113.569, alt: 700.0 },
  { name: "长治", py: "cz", lat: 36.195, lon: 113.116, alt: 929.0 },
  { name: "晋城", py: "jch", lat: 35.490, lon: 112.851, alt: 700.0 },
  { name: "朔州", py: "sz", lat: 39.331, lon: 112.432, alt: 1100.0 },
  { name: "晋中", py: "jzh", lat: 37.687, lon: 112.752, alt: 744.0 },
  { name: "运城", py: "yuch", lat: 35.026, lon: 111.007, alt: 370.0 },
  { name: "忻州", py: "xz", lat: 38.416, lon: 112.734, alt: 792.0 },
  { name: "临汾", py: "lif", lat: 36.088, lon: 111.518, alt: 449.0 },
  { name: "吕梁", py: "ll", lat: 37.518, lon: 111.143, alt: 951.0 },
  
  // 山东省 (16个)
  { name: "济南", py: "jn", lat: 36.651, lon: 117.120, alt: 58.0 },
  { name: "青岛", py: "qd", lat: 36.067, lon: 120.383, alt: 76.0 },
  { name: "淄博", py: "zb", lat: 36.813, lon: 118.055, alt: 57.0 },
  { name: "枣庄", py: "zaz", lat: 34.811, lon: 117.324, alt: 63.0 },
  { name: "东营", py: "dy", lat: 37.434, lon: 118.675, alt: 8.0 },
  { name: "烟台", py: "yat", lat: 37.463, lon: 121.448, alt: 47.0 },
  { name: "潍坊", py: "wf", lat: 36.707, lon: 119.162, alt: 27.0 },
  { name: "济宁", py: "jin", lat: 35.415, lon: 116.587, alt: 41.0 },
  { name: "泰安", py: "ta", lat: 36.200, lon: 117.089, alt: 128.0 },
  { name: "威海", py: "weih", lat: 37.510, lon: 122.120, alt: 7.0 },
  { name: "日照", py: "rz", lat: 35.416, lon: 119.527, alt: 16.0 },
  { name: "临沂", py: "liy", lat: 35.104, lon: 118.356, alt: 72.0 },
  { name: "德州", py: "dez", lat: 37.436, lon: 116.359, alt: 21.0 },
  { name: "聊城", py: "lic", lat: 36.457, lon: 115.985, alt: 29.0 },
  { name: "滨州", py: "bz", lat: 37.382, lon: 117.970, alt: 12.0 },
  { name: "菏泽", py: "hz", lat: 35.234, lon: 115.480, alt: 50.0 },
  
  // 河南省 (17个)
  { name: "郑州", py: "zz", lat: 34.746, lon: 113.625, alt: 110.0 },
  { name: "开封", py: "kf", lat: 34.797, lon: 114.348, alt: 73.0 },
  { name: "洛阳", py: "luy", lat: 34.620, lon: 112.454, alt: 144.0 },
  { name: "平顶山", py: "pds", lat: 33.766, lon: 113.193, alt: 136.0 },
  { name: "安阳", py: "ay", lat: 36.097, lon: 114.393, alt: 61.0 },
  { name: "鹤壁", py: "heb", lat: 35.748, lon: 114.297, alt: 65.0 },
  { name: "新乡", py: "xx", lat: 35.303, lon: 113.927, alt: 73.0 },
  { name: "焦作", py: "jz", lat: 35.216, lon: 113.242, alt: 95.0 },
  { name: "濮阳", py: "puy", lat: 35.762, lon: 115.029, alt: 50.0 },
  { name: "许昌", py: "xuc", lat: 34.035, lon: 113.852, alt: 67.0 },
  { name: "漯河", py: "lh", lat: 33.582, lon: 114.017, alt: 60.0 },
  { name: "三门峡", py: "smx", lat: 34.773, lon: 111.200, alt: 374.0 },
  { name: "南阳", py: "ny", lat: 33.004, lon: 112.528, alt: 130.0 },
  { name: "商丘", py: "shq", lat: 34.414, lon: 115.656, alt: 50.0 },
  { name: "信阳", py: "xiy", lat: 32.147, lon: 114.075, alt: 114.0 },
  { name: "周口", py: "zk", lat: 33.625, lon: 114.696, alt: 48.0 },
  { name: "驻马店", py: "zmd", lat: 33.011, lon: 114.022, alt: 82.0 },
  
  // 江苏省 (13个)
  { name: "南京", py: "nj", lat: 32.060, lon: 118.797, alt: 20.0 },
  { name: "无锡", py: "wx", lat: 31.491, lon: 120.312, alt: 8.0 },
  { name: "徐州", py: "xuz", lat: 34.205, lon: 117.284, alt: 41.0 },
  { name: "常州", py: "chz", lat: 31.811, lon: 119.974, alt: 7.0 },
  { name: "苏州", py: "suz", lat: 31.299, lon: 120.585, alt: 6.0 },
  { name: "南通", py: "nt", lat: 31.980, lon: 120.894, alt: 6.0 },
  { name: "连云港", py: "lyg", lat: 34.596, lon: 119.222, alt: 5.0 },
  { name: "淮安", py: "ha", lat: 33.610, lon: 119.015, alt: 10.0 },
  { name: "盐城", py: "yc", lat: 33.347, lon: 120.163, alt: 4.0 },
  { name: "扬州", py: "yz", lat: 32.394, lon: 119.413, alt: 8.0 },
  { name: "镇江", py: "zj", lat: 32.188, lon: 119.425, alt: 22.0 },
  { name: "泰州", py: "taz", lat: 32.455, lon: 119.923, alt: 6.0 },
  { name: "宿迁", py: "sq", lat: 33.963, lon: 118.275, alt: 25.0 },
  
  // 浙江省 (11个)
  { name: "杭州", py: "haz", lat: 30.274, lon: 120.155, alt: 19.0 },
  { name: "宁波", py: "nb", lat: 29.868, lon: 121.544, alt: 4.0 },
  { name: "温州", py: "wz", lat: 27.994, lon: 120.699, alt: 22.0 },
  { name: "嘉兴", py: "jx", lat: 30.746, lon: 120.755, alt: 5.0 },
  { name: "湖州", py: "huz", lat: 30.893, lon: 120.088, alt: 14.0 },
  { name: "绍兴", py: "sx", lat: 30.030, lon: 120.580, alt: 13.0 },
  { name: "金华", py: "jh", lat: 29.079, lon: 119.647, alt: 63.0 },
  { name: "衢州", py: "qz", lat: 28.970, lon: 118.873, alt: 66.0 },
  { name: "舟山", py: "zs", lat: 29.985, lon: 122.207, alt: 3.0 },
  { name: "台州", py: "taz", lat: 28.656, lon: 121.421, alt: 5.0 },
  { name: "丽水", py: "lis", lat: 28.468, lon: 119.923, alt: 60.0 },
  
  // 安徽省 (16个)
  { name: "合肥", py: "hf", lat: 31.821, lon: 117.227, alt: 37.0 },
  { name: "芜湖", py: "wuh", lat: 31.353, lon: 118.433, alt: 15.0 },
  { name: "蚌埠", py: "bb", lat: 32.916, lon: 117.389, alt: 21.0 },
  { name: "淮南", py: "hn", lat: 32.625, lon: 117.018, alt: 20.0 },
  { name: "马鞍山", py: "mas", lat: 31.670, lon: 118.507, alt: 28.0 },
  { name: "淮北", py: "hub", lat: 33.974, lon: 116.791, alt: 31.0 },
  { name: "铜陵", py: "tol", lat: 30.945, lon: 117.812, alt: 33.0 },
  { name: "安庆", py: "aq", lat: 30.543, lon: 117.063, alt: 20.0 },
  { name: "黄山", py: "hus", lat: 29.715, lon: 118.338, alt: 136.0 },
  { name: "滁州", py: "chuz", lat: 32.302, lon: 118.317, alt: 27.0 },
  { name: "阜阳", py: "fy", lat: 32.890, lon: 115.815, alt: 30.0 },
  { name: "宿州", py: "suz", lat: 33.646, lon: 116.964, alt: 27.0 },
  { name: "六安", py: "la", lat: 31.735, lon: 116.521, alt: 60.0 },
  { name: "亳州", py: "boz", lat: 33.845, lon: 115.779, alt: 37.0 },
  { name: "池州", py: "ciz", lat: 30.665, lon: 117.491, alt: 23.0 },
  { name: "宣城", py: "xc", lat: 30.945, lon: 118.758, alt: 29.0 },
  
  // 福建省 (9个)
  { name: "福州", py: "fz", lat: 26.075, lon: 119.296, alt: 10.0 },
  { name: "厦门", py: "xm", lat: 24.480, lon: 118.089, alt: 63.0 },
  { name: "莆田", py: "pt", lat: 25.454, lon: 119.007, alt: 14.0 },
  { name: "三明", py: "sm", lat: 26.263, lon: 117.639, alt: 215.0 },
  { name: "泉州", py: "quz", lat: 24.874, lon: 118.676, alt: 30.0 },
  { name: "漳州", py: "zhz", lat: 24.513, lon: 117.647, alt: 19.0 },
  { name: "南平", py: "np", lat: 26.641, lon: 118.178, alt: 155.0 },
  { name: "龙岩", py: "loy", lat: 25.075, lon: 117.017, alt: 290.0 },
  { name: "宁德", py: "nd", lat: 26.666, lon: 119.548, alt: 14.0 },
  
  // 江西省 (11个)
  { name: "南昌", py: "nc", lat: 28.683, lon: 115.858, alt: 50.0 },
  { name: "景德镇", py: "jdz", lat: 29.269, lon: 117.178, alt: 61.0 },
  { name: "萍乡", py: "px", lat: 27.623, lon: 113.854, alt: 120.0 },
  { name: "九江", py: "jj", lat: 29.705, lon: 116.001, alt: 35.0 },
  { name: "新余", py: "xyu", lat: 27.818, lon: 114.917, alt: 131.0 },
  { name: "鹰潭", py: "yit", lat: 28.260, lon: 117.069, alt: 49.0 },
  { name: "赣州", py: "gaz", lat: 25.831, lon: 114.935, alt: 124.0 },
  { name: "吉安", py: "ja", lat: 27.111, lon: 114.993, alt: 71.0 },
  { name: "宜春", py: "yic", lat: 27.815, lon: 114.416, alt: 130.0 },
  { name: "抚州", py: "fuz", lat: 27.949, lon: 116.358, alt: 27.0 },
  { name: "上饶", py: "sr", lat: 28.455, lon: 117.943, alt: 79.0 },
  
  // 湖北省 (17个)
  { name: "武汉", py: "wh", lat: 30.593, lon: 114.305, alt: 37.0 },
  { name: "黄石", py: "hus", lat: 30.199, lon: 115.039, alt: 25.0 },
  { name: "十堰", py: "syy", lat: 32.629, lon: 110.798, alt: 260.0 },
  { name: "宜昌", py: "yich", lat: 30.692, lon: 111.286, alt: 76.0 },
  { name: "襄阳", py: "xy", lat: 32.009, lon: 112.122, alt: 69.0 },
  { name: "鄂州", py: "ez", lat: 30.391, lon: 114.895, alt: 22.0 },
  { name: "荆门", py: "jm", lat: 31.035, lon: 112.199, alt: 54.0 },
  { name: "孝感", py: "xg", lat: 30.924, lon: 113.926, alt: 36.0 },
  { name: "荆州", py: "jiz", lat: 30.335, lon: 112.239, alt: 32.0 },
  { name: "黄冈", py: "hug", lat: 30.453, lon: 114.872, alt: 36.0 },
  { name: "咸宁", py: "xn", lat: 29.841, lon: 114.322, alt: 38.0 },
  { name: "随州", py: "suiz", lat: 31.690, lon: 113.382, alt: 84.0 },
  { name: "恩施", py: "es", lat: 30.272, lon: 109.488, alt: 460.0 },
  { name: "仙桃", py: "xit", lat: 30.362, lon: 113.454, alt: 27.0 },
  { name: "潜江", py: "qj", lat: 30.402, lon: 112.899, alt: 31.0 },
  { name: "天门", py: "tm", lat: 30.663, lon: 113.166, alt: 34.0 },
  { name: "神农架", py: "snj", lat: 31.745, lon: 110.676, alt: 1200.0 },
  
  // 湖南省 (14个)
  { name: "长沙", py: "cs", lat: 28.228, lon: 112.939, alt: 66.0 },
  { name: "株洲", py: "zuz", lat: 27.827, lon: 113.134, alt: 61.0 },
  { name: "湘潭", py: "xta", lat: 27.829, lon: 112.944, alt: 40.0 },
  { name: "衡阳", py: "hey", lat: 26.893, lon: 112.572, alt: 79.0 },
  { name: "邵阳", py: "shay", lat: 27.239, lon: 111.468, alt: 248.0 },
  { name: "岳阳", py: "yy", lat: 29.357, lon: 113.129, alt: 54.0 },
  { name: "常德", py: "chd", lat: 29.032, lon: 111.699, alt: 35.0 },
  { name: "张家界", py: "zjj", lat: 29.117, lon: 110.479, alt: 183.0 },
  { name: "益阳", py: "yiy", lat: 28.554, lon: 112.355, alt: 35.0 },
  { name: "郴州", py: "cez", lat: 25.770, lon: 113.015, alt: 189.0 },
  { name: "永州", py: "yoz", lat: 26.420, lon: 111.613, alt: 172.0 },
  { name: "怀化", py: "huh", lat: 27.550, lon: 109.998, alt: 272.0 },
  { name: "娄底", py: "ld", lat: 27.700, lon: 111.994, alt: 170.0 },
  { name: "湘西", py: "xix", lat: 28.311, lon: 109.739, alt: 237.0 },
  
  // 广东省 (21个)
  { name: "广州", py: "gz", lat: 23.129, lon: 113.264, alt: 21.0 },
  { name: "韶关", py: "sg", lat: 24.810, lon: 113.597, alt: 69.0 },
  { name: "深圳", py: "szh", lat: 22.543, lon: 114.058, alt: 17.0 },
  { name: "珠海", py: "zhh", lat: 22.271, lon: 113.576, alt: 36.0 },
  { name: "汕头", py: "st", lat: 23.354, lon: 116.682, alt: 51.0 },
  { name: "佛山", py: "fos", lat: 23.022, lon: 113.122, alt: 8.0 },
  { name: "江门", py: "jme", lat: 22.579, lon: 113.081, alt: 18.0 },
  { name: "湛江", py: "zhj", lat: 21.271, lon: 110.359, alt: 26.0 },
  { name: "茂名", py: "mm", lat: 21.663, lon: 110.925, alt: 28.0 },
  { name: "肇庆", py: "zq", lat: 23.047, lon: 112.465, alt: 18.0 },
  { name: "惠州", py: "huiz", lat: 23.112, lon: 114.416, alt: 19.0 },
  { name: "梅州", py: "mz", lat: 24.289, lon: 116.117, alt: 88.0 },
  { name: "汕尾", py: "sw", lat: 22.786, lon: 115.375, alt: 9.0 },
  { name: "河源", py: "hy", lat: 23.746, lon: 114.700, alt: 35.0 },
  { name: "阳江", py: "yj", lat: 21.857, lon: 111.983, alt: 23.0 },
  { name: "清远", py: "qy", lat: 23.682, lon: 113.056, alt: 16.0 },
  { name: "东莞", py: "dg", lat: 23.020, lon: 113.751, alt: 6.0 },
  { name: "中山", py: "zhs", lat: 22.517, lon: 113.393, alt: 6.0 },
  { name: "潮州", py: "chaz", lat: 23.657, lon: 116.622, alt: 8.0 },
  { name: "揭阳", py: "jiy", lat: 23.550, lon: 116.373, alt: 20.0 },
  { name: "云浮", py: "yf", lat: 22.915, lon: 112.044, alt: 54.0 },
  
  // 广西壮族自治区 (14个)
  { name: "南宁", py: "nn", lat: 22.817, lon: 108.366, alt: 72.0 },
  { name: "柳州", py: "liuz", lat: 24.326, lon: 109.412, alt: 97.0 },
  { name: "桂林", py: "gl", lat: 25.234, lon: 110.180, alt: 153.0 },
  { name: "梧州", py: "wuz", lat: 23.477, lon: 111.279, alt: 15.0 },
  { name: "北海", py: "bh", lat: 21.481, lon: 109.120, alt: 14.0 },
  { name: "防城港", py: "fcg", lat: 21.687, lon: 108.354, alt: 5.0 },
  { name: "钦州", py: "qiz", lat: 21.979, lon: 108.654, alt: 10.0 },
  { name: "贵港", py: "gg", lat: 23.111, lon: 109.599, alt: 42.0 },
  { name: "玉林", py: "yl", lat: 22.654, lon: 110.181, alt: 82.0 },
  { name: "百色", py: "bse", lat: 23.902, lon: 106.618, alt: 173.0 },
  { name: "贺州", py: "hez", lat: 24.403, lon: 111.567, alt: 108.0 },
  { name: "河池", py: "hec", lat: 24.692, lon: 108.085, alt: 221.0 },
  { name: "来宾", py: "lb", lat: 23.750, lon: 109.221, alt: 89.0 },
  { name: "崇左", py: "chz", lat: 22.377, lon: 107.365, alt: 128.0 },
  
  // 海南省 (4个)
  { name: "海口", py: "hk", lat: 20.020, lon: 110.320, alt: 14.0 },
  { name: "三亚", py: "say", lat: 18.253, lon: 109.504, alt: 7.0 },
  { name: "三沙", py: "sas", lat: 16.833, lon: 112.333, alt: 4.0 },
  { name: "儋州", py: "daz", lat: 19.521, lon: 109.580, alt: 23.0 },
  
  // 四川省 (21个)
  { name: "成都", py: "chd", lat: 30.572, lon: 104.066, alt: 500.0 },
  { name: "自贡", py: "zg", lat: 29.339, lon: 104.778, alt: 305.0 },
  { name: "攀枝花", py: "pzh", lat: 26.582, lon: 101.718, alt: 1108.0 },
  { name: "泸州", py: "luz", lat: 28.871, lon: 105.442, alt: 306.0 },
  { name: "德阳", py: "dey", lat: 31.127, lon: 104.398, alt: 465.0 },
  { name: "绵阳", py: "my", lat: 31.468, lon: 104.679, alt: 470.0 },
  { name: "广元", py: "gy", lat: 32.435, lon: 105.843, alt: 489.0 },
  { name: "遂宁", py: "sn", lat: 30.513, lon: 105.593, alt: 300.0 },
  { name: "内江", py: "nj", lat: 29.580, lon: 105.058, alt: 350.0 },
  { name: "乐山", py: "ls", lat: 29.552, lon: 103.765, alt: 424.0 },
  { name: "南充", py: "nch", lat: 30.837, lon: 106.110, alt: 298.0 },
  { name: "眉山", py: "ms", lat: 30.075, lon: 103.848, alt: 420.0 },
  { name: "宜宾", py: "yib", lat: 28.752, lon: 104.643, alt: 292.0 },
  { name: "广安", py: "ga", lat: 30.456, lon: 106.633, alt: 400.0 },
  { name: "达州", py: "daz", lat: 31.209, lon: 107.468, alt: 310.0 },
  { name: "雅安", py: "yaa", lat: 30.014, lon: 103.042, alt: 627.0 },
  { name: "巴中", py: "bzh", lat: 31.867, lon: 106.747, alt: 418.0 },
  { name: "资阳", py: "ziy", lat: 30.128, lon: 104.627, alt: 391.0 },
  { name: "阿坝", py: "ab", lat: 31.899, lon: 102.224, alt: 2664.0 },
  { name: "甘孜", py: "gaz", lat: 30.050, lon: 101.963, alt: 3394.0 },
  { name: "凉山", py: "lis", lat: 27.881, lon: 102.267, alt: 1580.0 },
  
  // 贵州省 (9个)
  { name: "贵阳", py: "guy", lat: 26.647, lon: 106.630, alt: 1070.0 },
  { name: "六盘水", py: "lps", lat: 26.592, lon: 104.830, alt: 1797.0 },
  { name: "遵义", py: "zy", lat: 27.725, lon: 106.927, alt: 844.0 },
  { name: "安顺", py: "as", lat: 26.253, lon: 105.947, alt: 1392.0 },
  { name: "毕节", py: "bij", lat: 27.284, lon: 105.292, alt: 1511.0 },
  { name: "铜仁", py: "tr", lat: 27.718, lon: 109.189, alt: 414.0 },
  { name: "黔西南", py: "qxn", lat: 25.088, lon: 104.906, alt: 1274.0 },
  { name: "黔东南", py: "qdn", lat: 26.584, lon: 107.982, alt: 676.0 },
  { name: "黔南", py: "qn", lat: 26.254, lon: 107.522, alt: 997.0 },
  
  // 云南省 (16个)
  { name: "昆明", py: "km", lat: 25.043, lon: 102.832, alt: 1892.0 },
  { name: "曲靖", py: "quj", lat: 25.490, lon: 103.796, alt: 1881.0 },
  { name: "玉溪", py: "yux", lat: 24.352, lon: 102.543, alt: 1636.0 },
  { name: "保山", py: "bos", lat: 25.112, lon: 99.161, alt: 1653.0 },
  { name: "昭通", py: "zt", lat: 27.338, lon: 103.717, alt: 1949.0 },
  { name: "丽江", py: "lj", lat: 26.855, lon: 100.228, alt: 2400.0 },
  { name: "普洱", py: "pe", lat: 22.825, lon: 100.966, alt: 1302.0 },
  { name: "临沧", py: "lic", lat: 23.877, lon: 100.092, alt: 1502.0 },
  { name: "楚雄", py: "chx", lat: 25.033, lon: 101.546, alt: 1773.0 },
  { name: "红河", py: "hoh", lat: 23.364, lon: 103.374, alt: 1302.0 },
  { name: "文山", py: "wes", lat: 23.369, lon: 104.216, alt: 1260.0 },
  { name: "西双版纳", py: "xsbn", lat: 22.008, lon: 100.797, alt: 552.0 },
  { name: "大理", py: "dal", lat: 25.606, lon: 100.268, alt: 1976.0 },
  { name: "德宏", py: "deh", lat: 24.434, lon: 98.585, alt: 905.0 },
  { name: "怒江", py: "nuj", lat: 25.850, lon: 98.856, alt: 1400.0 },
  { name: "迪庆", py: "diq", lat: 27.819, lon: 99.702, alt: 3280.0 },
  
  // 西藏自治区 (7个)
  { name: "拉萨", py: "las", lat: 29.645, lon: 91.117, alt: 3650.0 },
  { name: "日喀则", py: "rkz", lat: 29.267, lon: 88.881, alt: 3836.0 },
  { name: "昌都", py: "chd", lat: 31.141, lon: 97.172, alt: 3240.0 },
  { name: "林芝", py: "lz", lat: 29.654, lon: 94.361, alt: 3000.0 },
  { name: "山南", py: "shn", lat: 29.237, lon: 91.773, alt: 3700.0 },
  { name: "那曲", py: "nq", lat: 31.476, lon: 92.071, alt: 4507.0 },
  { name: "阿里", py: "al", lat: 32.501, lon: 80.106, alt: 4278.0 },
  
  // 陕西省 (10个)
  { name: "西安", py: "xa", lat: 34.342, lon: 108.940, alt: 400.0 },
  { name: "铜川", py: "tc", lat: 34.896, lon: 108.945, alt: 978.0 },
  { name: "宝鸡", py: "bj", lat: 34.362, lon: 107.238, alt: 574.0 },
  { name: "咸阳", py: "xiy", lat: 34.329, lon: 108.709, alt: 479.0 },
  { name: "渭南", py: "wn", lat: 34.499, lon: 109.510, alt: 351.0 },
  { name: "延安", py: "ya", lat: 36.585, lon: 109.489, alt: 959.0 },
  { name: "汉中", py: "haz", lat: 33.068, lon: 107.023, alt: 509.0 },
  { name: "榆林", py: "yul", lat: 38.285, lon: 109.734, alt: 1057.0 },
  { name: "安康", py: "ak", lat: 32.680, lon: 109.029, alt: 290.0 },
  { name: "商洛", py: "shl", lat: 33.870, lon: 109.940, alt: 742.0 },
  
  // 甘肃省 (14个)
  { name: "兰州", py: "laz", lat: 36.061, lon: 103.834, alt: 1520.0 },
  { name: "嘉峪关", py: "jyg", lat: 39.773, lon: 98.290, alt: 1700.0 },
  { name: "金昌", py: "jc", lat: 38.520, lon: 102.188, alt: 1540.0 },
  { name: "白银", py: "by", lat: 36.544, lon: 104.139, alt: 1641.0 },
  { name: "天水", py: "tis", lat: 34.581, lon: 105.725, alt: 1141.0 },
  { name: "武威", py: "ww", lat: 37.928, lon: 102.638, alt: 1531.0 },
  { name: "张掖", py: "zhy", lat: 38.925, lon: 100.449, alt: 1483.0 },
  { name: "平凉", py: "pl", lat: 35.543, lon: 106.665, alt: 1346.0 },
  { name: "酒泉", py: "jq", lat: 39.734, lon: 98.500, alt: 1477.0 },
  { name: "庆阳", py: "qiy", lat: 35.709, lon: 107.643, alt: 1265.0 },
  { name: "定西", py: "dx", lat: 35.580, lon: 104.626, alt: 1898.0 },
  { name: "陇南", py: "lon", lat: 33.401, lon: 104.921, alt: 1010.0 },
  { name: "临夏", py: "lix", lat: 35.601, lon: 103.210, alt: 1917.0 },
  { name: "甘南", py: "gan", lat: 34.983, lon: 102.911, alt: 2910.0 },
  
  // 青海省 (9个)
  { name: "西宁", py: "xn", lat: 36.623, lon: 101.779, alt: 2275.0 },
  { name: "海东", py: "had", lat: 36.502, lon: 102.103, alt: 1978.0 },
  { name: "海北", py: "hab", lat: 36.954, lon: 100.901, alt: 2868.0 },
  { name: "黄南", py: "hun", lat: 35.519, lon: 102.015, alt: 2491.0 },
  { name: "海南州", py: "hnz", lat: 36.286, lon: 100.620, alt: 2261.0 },
  { name: "果洛", py: "gl", lat: 34.471, lon: 100.244, alt: 3719.0 },
  { name: "玉树", py: "ysh", lat: 33.004, lon: 97.007, alt: 3681.0 },
  { name: "海西", py: "hax", lat: 37.377, lon: 97.371, alt: 2817.0 },
  { name: "格尔木", py: "gem", lat: 36.420, lon: 94.900, alt: 2808.0 },
  
  // 宁夏回族自治区 (5个)
  { name: "银川", py: "yc", lat: 38.487, lon: 106.232, alt: 1112.0 },
  { name: "石嘴山", py: "szs", lat: 39.233, lon: 106.376, alt: 1090.0 },
  { name: "吴忠", py: "wz", lat: 37.997, lon: 106.199, alt: 1126.0 },
  { name: "固原", py: "guy", lat: 36.016, lon: 106.242, alt: 1753.0 },
  { name: "中卫", py: "zw", lat: 37.500, lon: 105.190, alt: 1225.0 },
  
  // 新疆维吾尔自治区 (14个)
  { name: "乌鲁木齐", py: "wlmq", lat: 43.825, lon: 87.617, alt: 800.0 },
  { name: "克拉玛依", py: "klmy", lat: 45.579, lon: 84.889, alt: 283.0 },
  { name: "吐鲁番", py: "tlf", lat: 42.951, lon: 89.189, alt: -95.0 },
  { name: "哈密", py: "hm", lat: 42.819, lon: 93.515, alt: 739.0 },
  { name: "昌吉", py: "chj", lat: 44.011, lon: 87.308, alt: 700.0 },
  { name: "博尔塔拉", py: "betl", lat: 44.906, lon: 82.066, alt: 533.0 },
  { name: "巴音郭楞", py: "bygl", lat: 41.764, lon: 86.145, alt: 932.0 },
  { name: "阿克苏", py: "aks", lat: 41.168, lon: 80.263, alt: 1104.0 },
  { name: "克孜勒苏", py: "kzls", lat: 39.714, lon: 76.168, alt: 1433.0 },
  { name: "喀什", py: "ks", lat: 39.468, lon: 75.994, alt: 1289.0 },
  { name: "和田", py: "ht", lat: 37.110, lon: 79.922, alt: 1375.0 },
  { name: "伊犁", py: "yl", lat: 43.916, lon: 81.324, alt: 639.0 },
  { name: "塔城", py: "tac", lat: 46.746, lon: 82.980, alt: 534.0 },
  { name: "阿勒泰", py: "alt", lat: 47.848, lon: 88.141, alt: 735.0 },
  
  // 卫通信关站 / 航天重要城市
  { name: "怀来", py: "hl", lat: 40.415, lon: 115.517, alt: 535.0 },   // 中星16 Ka信关站
  { name: "西昌", py: "xc", lat: 27.892, lon: 102.265, alt: 1590.0 },  // 卫星发射中心
  { name: "文昌", py: "wc", lat: 19.613, lon: 110.750, alt: 34.0 },    // 卫星发射中心
  { name: "敦煌", py: "dh", lat: 40.142, lon: 94.662, alt: 1140.0 },   // 深空测控站
  
  // ========== 国际主要城市 (33个) ==========
  
  // 东亚
  { name: "东京", py: "dj", lat: 35.689, lon: 139.692, alt: 40.0 },
  { name: "首尔", py: "se", lat: 37.566, lon: 126.978, alt: 38.0 },
  
  // 东南亚
  { name: "曼谷", py: "mg", lat: 13.756, lon: 100.502, alt: 2.0 },
  { name: "新加坡", py: "xjp", lat: 1.352, lon: 103.819, alt: 15.0 },
  { name: "吉隆坡", py: "jlp", lat: 3.139, lon: 101.687, alt: 66.0 },
  { name: "雅加达", py: "yjd", lat: -6.208, lon: 106.845, alt: 8.0 },
  { name: "马尼拉", py: "mnl", lat: 14.599, lon: 120.984, alt: 16.0 },
  { name: "河内", py: "hn", lat: 21.028, lon: 105.854, alt: 16.0 },
  
  // 南亚
  { name: "新德里", py: "xdl", lat: 28.613, lon: 77.209, alt: 216.0 },
  { name: "孟买", py: "mm", lat: 19.076, lon: 72.877, alt: 14.0 },
  { name: "伊斯兰堡", py: "yslb", lat: 33.684, lon: 73.047, alt: 507.0 },
  
  // 中东
  { name: "迪拜", py: "db", lat: 25.204, lon: 55.271, alt: 5.0 },
  { name: "利雅得", py: "lyd", lat: 24.713, lon: 46.675, alt: 612.0 },
  
  // 欧洲
  { name: "莫斯科", py: "msk", lat: 55.755, lon: 37.617, alt: 156.0 },
  { name: "伦敦", py: "ld", lat: 51.507, lon: -0.128, alt: 24.0 },
  { name: "巴黎", py: "bl", lat: 48.856, lon: 2.352, alt: 35.0 },
  { name: "柏林", py: "bol", lat: 52.520, lon: 13.405, alt: 34.0 },
  { name: "罗马", py: "lm", lat: 41.902, lon: 12.496, alt: 21.0 },
  
  // 非洲
  { name: "开罗", py: "kl", lat: 30.044, lon: 31.236, alt: 23.0 },
  { name: "约翰内斯堡", py: "yhnsb", lat: -26.204, lon: 28.047, alt: 1753.0 },
  
  // 北美
  { name: "纽约", py: "ny", lat: 40.712, lon: -74.006, alt: 10.0 },
  { name: "洛杉矶", py: "lsj", lat: 34.052, lon: -118.244, alt: 93.0 },
  
  // 南美
  { name: "圣保罗", py: "sbl", lat: -23.550, lon: -46.633, alt: 760.0 },
  
  // 大洋洲
  { name: "悉尼", py: "xn", lat: -33.868, lon: 151.209, alt: 6.0 },
  { name: "堪培拉", py: "kpl", lat: -35.281, lon: 149.130, alt: 577.0 },

  // 新增亚太地区首都
  { name: "乌兰巴托", py: "wlbt", lat: 47.921, lon: 106.906, alt: 1350.0 },
  { name: "金边", py: "jb", lat: 11.556, lon: 104.928, alt: 12.0 },
  { name: "万象", py: "wx", lat: 17.976, lon: 102.633, alt: 174.0 },
  { name: "内比都", py: "nbd", lat: 19.763, lon: 96.079, alt: 104.0 },
  { name: "达卡", py: "dk", lat: 23.810, lon: 90.413, alt: 8.0 },
  { name: "科伦坡", py: "klb", lat: 6.927, lon: 79.861, alt: 7.0 },
  { name: "加德满都", py: "jdmd", lat: 27.717, lon: 85.324, alt: 1400.0 },

  // 中东
  { name: "阿布扎比", py: "abzb", lat: 24.454, lon: 54.377, alt: 27.0 }
];

/**
 * 获取所有城市列表
 */
function getAllCities() {
  return CITIES_DATA;
}

/**
 * 获取中国城市列表（前337个）
 */
function getChinaCities() {
  return CITIES_DATA.slice(0, CHINA_CITIES_COUNT);
}

/**
 * 获取国际城市列表
 */
function getInternationalCities() {
  return CITIES_DATA.slice(CHINA_CITIES_COUNT);
}

/**
 * 根据城市名称查找城市信息
 */
function getCityByName(name) {
  return CITIES_DATA.find(city => city.name === name);
}

// 缓存排序后的显示顺序城市列表
let _displayOrderCache = null;

/**
 * 获取按优先级排序的城市列表（用于下拉默认显示）
 */
function getDisplayOrderCities() {
  if (_displayOrderCache) return _displayOrderCache;
  const priorityMap = new Map();
  PRIORITY_ORDER.forEach((name, i) => priorityMap.set(name, i));
  const defaultPriority = PRIORITY_ORDER.length;
  _displayOrderCache = [...CITIES_DATA].sort((a, b) => {
    const pa = priorityMap.has(a.name) ? priorityMap.get(a.name) : defaultPriority;
    const pb = priorityMap.has(b.name) ? priorityMap.get(b.name) : defaultPriority;
    if (pa !== pb) return pa - pb;
    return 0;
  });
  return _displayOrderCache;
}

// 省份映射表（城市索引范围）
const PROVINCE_MAPPING = {
  '北京': { start: 0, count: 1, aliases: ['北京市'] },
  '上海': { start: 1, count: 1, aliases: ['上海市'] },
  '天津': { start: 2, count: 1, aliases: ['天津市'] },
  '重庆': { start: 3, count: 1, aliases: ['重庆市'] },
  '香港': { start: 4, count: 1, aliases: ['香港特别行政区'] },
  '澳门': { start: 5, count: 1, aliases: ['澳门特别行政区'] },
  '台湾': { start: 6, count: 1, aliases: ['台湾省'] },
  '黑龙江': { start: 7, count: 13, aliases: ['黑龙江省'] },
  '吉林': { start: 20, count: 9, aliases: ['吉林省'] },
  '辽宁': { start: 29, count: 14, aliases: ['辽宁省'] },
  '内蒙古': { start: 43, count: 12, aliases: ['内蒙古自治区'] },
  '河北': { start: 55, count: 11, aliases: ['河北省'] },
  '山西': { start: 66, count: 11, aliases: ['山西省'] },
  '山东': { start: 77, count: 16, aliases: ['山东省'] },
  '河南': { start: 93, count: 17, aliases: ['河南省'] },
  '江苏': { start: 110, count: 13, aliases: ['江苏省'] },
  '浙江': { start: 123, count: 11, aliases: ['浙江省'] },
  '安徽': { start: 134, count: 16, aliases: ['安徽省'] },
  '福建': { start: 150, count: 9, aliases: ['福建省'] },
  '江西': { start: 159, count: 11, aliases: ['江西省'] },
  '湖北': { start: 170, count: 17, aliases: ['湖北省'] },
  '湖南': { start: 187, count: 14, aliases: ['湖南省'] },
  '广东': { start: 201, count: 21, aliases: ['广东省'] },
  '广西': { start: 222, count: 14, aliases: ['广西壮族自治区', '广西自治区'] },
  '海南': { start: 236, count: 4, aliases: ['海南省'] },
  '四川': { start: 240, count: 21, aliases: ['四川省'] },
  '贵州': { start: 261, count: 9, aliases: ['贵州省'] },
  '云南': { start: 270, count: 16, aliases: ['云南省'] },
  '西藏': { start: 286, count: 7, aliases: ['西藏自治区'] },
  '陕西': { start: 293, count: 10, aliases: ['陕西省'] },
  '甘肃': { start: 303, count: 14, aliases: ['甘肃省'] },
  '青海': { start: 317, count: 9, aliases: ['青海省'] },
  '宁夏': { start: 326, count: 5, aliases: ['宁夏回族自治区', '宁夏自治区'] },
  '新疆': { start: 331, count: 14, aliases: ['新疆维吾尔自治区', '新疆自治区'] }
};

// 获取所有省份列表
const PROVINCES = Object.keys(PROVINCE_MAPPING);

/**
 * 根据关键词匹配省份
 * @param {string} keyword - 搜索关键词
 * @returns {string|null} - 匹配到的省份名称或null
 */
function matchProvince(keyword) {
  if (!keyword) return null;
  const trimmed = keyword.trim();
  
  // 精确匹配省份名
  if (PROVINCE_MAPPING[trimmed]) {
    return trimmed;
  }
  
  // 匹配别名
  for (const [province, info] of Object.entries(PROVINCE_MAPPING)) {
    if (info.aliases && info.aliases.includes(trimmed)) {
      return province;
    }
  }
  
  // 模糊匹配（省份名包含关键词或关键词包含省份名）
  for (const province of PROVINCES) {
    if (province.includes(trimmed) || trimmed.includes(province)) {
      return province;
    }
  }
  
  return null;
}

/**
 * 检测字符串是否为纯拼音/英文字母
 * @param {string} str - 要检测的字符串
 * @returns {boolean}
 */
function isPinyin(str) {
  return /^[a-zA-Z]+$/.test(str);
}

/**
 * 搜索城市（支持城市名、省份名和拼音首字母搜索）
 * @param {string} keyword - 搜索关键词（城市名、省份名或拼音首字母）
 * @param {Object} options - 搜索选项
 * @param {boolean} options.includeProvince - 是否支持按省份搜索，默认true
 * @param {boolean} options.includePinyin - 是否支持拼音搜索，默认true
 * @param {boolean} options.fuzzy - 是否模糊匹配，默认true
 */
function searchCities(keyword, options = {}) {
  const { includeProvince = true, includePinyin = true, fuzzy = true } = options;
  
  if (!keyword || keyword.trim() === '') {
    return getDisplayOrderCities();
  }
  
  const trimmedKeyword = keyword.trim();
  const lowerKeyword = trimmedKeyword.toLowerCase();
  
  // 检测是否为拼音输入
  const isPinyinInput = isPinyin(trimmedKeyword);
  
  // 如果是拼音输入，优先按拼音搜索
  if (isPinyinInput && includePinyin) {
    const pinyinResults = CITIES_DATA.filter(city => {
      if (!city.py) return false;
      if (fuzzy) {
        // 模糊匹配：拼音以关键词开头或包含关键词
        return city.py.startsWith(lowerKeyword) || city.py.includes(lowerKeyword);
      } else {
        // 精确匹配
        return city.py === lowerKeyword;
      }
    });
    
    if (pinyinResults.length > 0) {
      // 排序：完全匹配优先，然后是前缀匹配
      return pinyinResults.sort((a, b) => {
        const aExact = a.py === lowerKeyword ? 0 : 1;
        const bExact = b.py === lowerKeyword ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        
        const aPrefix = a.py.startsWith(lowerKeyword) ? 0 : 1;
        const bPrefix = b.py.startsWith(lowerKeyword) ? 0 : 1;
        return aPrefix - bPrefix;
      });
    }
  }
  
  // 尝试按省份搜索（非拼音输入时）
  if (includeProvince && !isPinyinInput) {
    const matchedProvince = matchProvince(trimmedKeyword);
    if (matchedProvince) {
      return getCitiesByProvince(matchedProvince);
    }
  }
  
  // 按城市名搜索
  if (fuzzy) {
    // 模糊匹配
    return CITIES_DATA.filter(city => 
      city.name.toLowerCase().includes(lowerKeyword)
    );
  } else {
    // 精确匹配
    return CITIES_DATA.filter(city => 
      city.name.toLowerCase() === lowerKeyword
    );
  }
}

/**
 * 按拼音首字母搜索城市
 * @param {string} pinyin - 拼音首字母
 * @param {boolean} exact - 是否精确匹配，默认false
 */
function searchByPinyin(pinyin, exact = false) {
  if (!pinyin || pinyin.trim() === '') {
    return [];
  }
  
  const lowerPinyin = pinyin.trim().toLowerCase();
  
  return CITIES_DATA.filter(city => {
    if (!city.py) return false;
    if (exact) {
      return city.py === lowerPinyin;
    }
    return city.py.startsWith(lowerPinyin) || city.py.includes(lowerPinyin);
  });
}

/**
 * 按省份获取城市（返回某省所有地级市）
 * @param {string} province - 省份名称
 */
function getCitiesByProvince(province) {
  // 先尝试匹配省份
  const matchedProvince = matchProvince(province);
  const info = PROVINCE_MAPPING[matchedProvince || province];
  
  if (info) {
    return CITIES_DATA.slice(info.start, info.start + info.count);
  }
  return [];
}

/**
 * 获取所有省份列表
 */
function getAllProvinces() {
  return PROVINCES.slice();
}

/**
 * 获取城市统计信息
 */
function getCitiesStats() {
  return {
    total: CITIES_DATA.length,
    china: CHINA_CITIES_COUNT,
    international: CITIES_DATA.length - CHINA_CITIES_COUNT
  };
}

module.exports = {
  CITIES_DATA,
  CHINA_CITIES_COUNT,
  PRIORITY_ORDER,
  PROVINCE_MAPPING,
  PROVINCES,
  getAllCities,
  getDisplayOrderCities,
  getChinaCities,
  getInternationalCities,
  getCityByName,
  searchCities,
  searchByPinyin,
  isPinyin,
  getCitiesByProvince,
  getAllProvinces,
  matchProvince,
  getCitiesStats
};
