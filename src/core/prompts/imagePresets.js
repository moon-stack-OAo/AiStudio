export const IMAGE_PROMPT_PRESETS = [
  {
    id: 'i-t2i-portrait',
    label: '人像写真',
    mode: 'txt2img',
    prompt:
      '一位东亚女性半身肖像，自然侧光从窗边洒落，浅景深虚化背景，细腻皮肤质感，柔和眼神，85mm 镜头感，写实摄影风格',
    tags: ['人像', '写实', '侧光'],
  },
  {
    id: 'i-t2i-product',
    label: '产品静物',
    mode: 'txt2img',
    prompt:
      '极简产品静物摄影，哑光陶瓷水杯置于浅灰台面，柔光箱均匀照明，干净构图留白，突出材质与阴影层次，商业广告质感',
    tags: ['产品', '静物', '商业'],
  },
  {
    id: 'i-t2i-landscape',
    label: '风景大片',
    mode: 'txt2img',
    prompt:
      '高山湖泊日出风景，金色晨光映照水面与云层，广角构图前景有礁石，中景湖面，远山层叠，清透空气感，风光摄影风格',
    tags: ['风景', '自然光', '广角'],
  },
  {
    id: 'i-t2i-cyber',
    label: '赛博都市',
    mode: 'txt2img',
    prompt:
      '赛博朋克雨夜街景，霓虹招牌与全息广告倒映在湿润地面，高对比粉紫青蓝光，蒸汽与雾气，低角度构图，科幻概念艺术',
    tags: ['赛博', '夜景', '概念'],
  },
  {
    id: 'i-t2i-food',
    label: '美食特写',
    mode: 'txt2img',
    prompt:
      '新鲜草莓塔微距特写，奶油与果肉质感清晰，柔和顶侧光，浅景深，暖色调，食物摄影风格，诱人细节',
    tags: ['美食', '微距', '静物'],
  },
  {
    id: 'i-t2i-arch',
    label: '建筑空间',
    mode: 'txt2img',
    prompt:
      '现代极简建筑外立面，混凝土与玻璃材质对比，对称构图，硬朗几何线条，午后斜射光形成清晰阴影，建筑摄影风格',
    tags: ['建筑', '几何', '光影'],
  },
  {
    id: 'i-t2i-pet',
    label: '宠物写真',
    mode: 'txt2img',
    prompt:
      '一只橘猫趴在阳光窗台，逆光勾勒毛发轮廓，眼神对焦清晰，浅景深，温馨居家氛围，写实宠物摄影',
    tags: ['宠物', '逆光', '写实'],
  },
  {
    id: 'i-t2i-illustration',
    label: '插画风格',
    mode: 'txt2img',
    prompt:
      '日系清新插画风少女坐在樱花树下，柔和粉彩配色，干净线条，扁平与轻微阴影结合，治愈氛围，二次元插画风格',
    tags: ['插画', '日系', '治愈'],
  },
  {
    id: 'i-i2i-style',
    label: '风格迁移',
    mode: 'img2img',
    prompt: '在参考图基础上转换为油画质感，保留主体构图与姿态，强化笔触与色彩层次，艺术氛围',
    tags: ['风格', '油画'],
  },
  {
    id: 'i-i2i-detail',
    label: '细节增强',
    mode: 'img2img',
    prompt: '在参考图基础上增强纹理与细节清晰度，保留原有构图与色调，材质更真实，边缘更锐利',
    tags: ['细节', '增强'],
  },
  {
    id: 'i-i2i-bg',
    label: '换背景',
    mode: 'img2img',
    prompt: '在参考图基础上保留主体，将背景替换为柔和虚化的城市夜景，光影与主体自然衔接',
    tags: ['背景', '替换'],
  },
  {
    id: 'i-i2i-light',
    label: '光影重塑',
    mode: 'img2img',
    prompt: '在参考图基础上重塑光影，改为侧逆光轮廓光，加深阴影层次，提升立体感与氛围，主体不变',
    tags: ['光影', '重塑'],
  },
  {
    id: 'i-common-clean',
    label: '干净构图',
    mode: null,
    prompt: '干净简洁构图，主体突出，柔和自然光，高品质细节，无杂乱元素',
    tags: ['通用', '构图'],
  },
]
