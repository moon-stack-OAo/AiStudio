/** 视频提示词维度（文生/图生共用） */
export const VIDEO_DIMENSIONS = [
  {
    id: 'subject',
    label: '主体',
    options: [
      {id: 'person', label: '人物', text: '一位人物作为画面主体'},
      {id: 'product', label: '产品', text: '一件产品置于画面中心展示'},
      {id: 'landscape', label: '风景', text: '开阔自然风景作为主体'},
      {id: 'animal', label: '动物', text: '一只动物作为画面主体'},
      {id: 'street', label: '街景', text: '城市街景作为画面主体'},
    ],
  },
  {
    id: 'camera',
    label: '镜头',
    options: [
      {id: 'dolly_in', label: '推进', text: '镜头缓慢向前推进'},
      {id: 'dolly_out', label: '拉远', text: '镜头平稳向后拉远'},
      {id: 'orbit', label: '环绕', text: '镜头绕主体缓慢环绕'},
      {id: 'follow', label: '跟随', text: '镜头从侧后方平稳跟随主体'},
      {id: 'aerial', label: '航拍', text: '航拍高机位俯瞰推进'},
      {id: 'static', label: '固定', text: '固定机位稳定构图'},
    ],
  },
  {
    id: 'motion',
    label: '运动',
    options: [
      {id: 'smooth', label: '缓慢流畅', text: '运动节奏缓慢流畅'},
      {id: 'slow_mo', label: '慢动作', text: '慢动作呈现细腻动态'},
      {id: 'urgent', label: '急促', text: '运动节奏急促有力'},
      {id: 'float', label: '漂浮感', text: '画面带有轻盈漂浮感'},
    ],
  },
  {
    id: 'style',
    label: '风格',
    options: [
      {id: 'cinematic', label: '电影感', text: '电影级质感与运镜'},
      {id: 'realistic', label: '写实', text: '写实摄影风格'},
      {id: 'cyberpunk', label: '赛博朋克', text: '赛博朋克科幻风格'},
      {id: 'anime', label: '动画感', text: '动画感画面风格'},
    ],
  },
  {
    id: 'mood',
    label: '氛围',
    options: [
      {id: 'dusk', label: '黄昏', text: '黄昏暖色柔光氛围'},
      {id: 'rain_night', label: '雨夜', text: '雨夜潮湿冷暖对比光'},
      {id: 'neon', label: '霓虹', text: '霓虹灯光与都市夜色'},
      {id: 'sunny', label: '晴朗自然光', text: '晴朗自然光，氛围清新'},
    ],
  },
]
