/** 生图提示词维度 */
export const IMAGE_DIMENSIONS = [
  {
    id: 'subject',
    label: '主体',
    options: [
      {id: 'portrait', label: '人像', text: '人像作为画面主体'},
      {id: 'product', label: '产品静物', text: '产品静物置于画面中心'},
      {id: 'landscape', label: '风景', text: '自然风景作为主体'},
      {id: 'food', label: '美食', text: '美食特写作为主体'},
      {id: 'architecture', label: '建筑', text: '建筑空间作为主体'},
      {id: 'pet', label: '宠物', text: '宠物作为画面主体'},
    ],
  },
  {
    id: 'composition',
    label: '构图',
    options: [
      {id: 'closeup', label: '居中特写', text: '居中特写构图'},
      {id: 'rule_of_thirds', label: '三分法', text: '三分法构图，主体偏置'},
      {id: 'wide', label: '广角全景', text: '广角全景构图'},
      {id: 'top_down', label: '俯拍', text: '俯拍视角构图'},
    ],
  },
  {
    id: 'lighting',
    label: '光影',
    options: [
      {id: 'soft', label: '柔光', text: '柔和均匀光影'},
      {id: 'backlight', label: '逆光轮廓', text: '逆光勾勒轮廓光'},
      {id: 'neon', label: '霓虹', text: '霓虹灯光照明'},
      {id: 'natural', label: '自然光', text: '自然光洒落'},
    ],
  },
  {
    id: 'style',
    label: '风格',
    options: [
      {id: 'photo', label: '写实摄影', text: '写实摄影风格'},
      {id: 'cinematic', label: '电影感', text: '电影感画面质感'},
      {id: 'illustration', label: '插画', text: '插画风格'},
      {id: 'cyberpunk', label: '赛博', text: '赛博朋克风格'},
    ],
  },
  {
    id: 'detail',
    label: '质感',
    options: [
      {id: 'sharp', label: '锐利细节', text: '锐利清晰细节'},
      {id: 'bokeh', label: '浅景深', text: '浅景深虚化背景'},
      {id: 'film_grain', label: '胶片颗粒', text: '轻微胶片颗粒质感'},
    ],
  },
]
