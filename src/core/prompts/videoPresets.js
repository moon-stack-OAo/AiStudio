export const VIDEO_PROMPT_PRESETS = [
  {
    id: 'v-t2v-walk',
    label: '人物走路',
    mode: 'txt2video',
    prompt:
      '一位年轻女性穿着风衣在秋日林荫道上缓步前行，落叶随风轻扬，跟拍镜头平稳跟随，浅景深虚化背景，暖色柔光从侧面洒落，氛围宁静自然',
    tags: ['人物', '跟拍', '自然光'],
  },
  {
    id: 'v-t2v-product',
    label: '产品旋转',
    mode: 'txt2video',
    prompt:
      '一款哑光黑无线耳机置于纯白台面上缓慢水平旋转展示，特写镜头固定构图，均匀柔光箱照明，突出材质纹理与金属细节，干净商业广告风格',
    tags: ['产品', '旋转', '商业'],
  },
  {
    id: 'v-t2v-aerial',
    label: '航拍风景',
    mode: 'txt2video',
    prompt:
      '航拍镜头从高空缓缓向前推进掠过翠绿山谷与蜿蜒河流，晨雾在山间流动，广角镜头，金色晨光穿透云层，壮阔空灵感',
    tags: ['航拍', '风景', '推进'],
  },
  {
    id: 'v-t2v-cyber',
    label: '赛博夜景',
    mode: 'txt2video',
    prompt:
      '赛博朋克都市夜景，霓虹招牌与全息广告在雨后湿润街道上倒映，低角度缓慢横移镜头，粉紫青蓝对比光，潮湿雾气与蒸汽，未来科幻氛围',
    tags: ['赛博', '夜景', '横移'],
  },
  {
    id: 'v-t2v-rain',
    label: '雨夜街道',
    mode: 'txt2video',
    prompt:
      '雨夜空旷街道，路灯在积水中拉出长长光晕，行人撑伞快步走过，固定机位轻微推近，高对比冷暖光，潮湿空气与水雾，孤独电影感',
    tags: ['雨夜', '街道', '电影感'],
  },
  {
    id: 'v-t2v-animal',
    label: '动物奔跑',
    mode: 'txt2video',
    prompt:
      '一只金毛犬在开阔草原上全力奔跑，侧向跟拍镜头保持同步，鬃毛与草地被风吹起，明亮自然光，景深浅焦，充满速度与活力',
    tags: ['动物', '跟拍', '运动'],
  },
  {
    id: 'v-t2v-latte',
    label: '咖啡拉花',
    mode: 'txt2video',
    prompt:
      '极近特写咖啡拉花过程，牛奶缓缓注入形成心形图案，微距镜头轻微下移，柔和顶光，蒸汽升腾，温馨生活感与细腻质感',
    tags: ['特写', '美食', '微距'],
  },
  {
    id: 'v-t2v-timelapse',
    label: '城市延时',
    mode: 'txt2video',
    prompt:
      '城市天际线从黄昏到夜晚的延时摄影，车流光轨在道路上流动，云层快速掠过，固定广角高机位，暖橙转深蓝的色温变化，都市节奏感',
    tags: ['延时', '城市', '夜景'],
  },
  {
    id: 'v-i2v-dolly',
    label: '缓慢推进',
    mode: 'img2video',
    prompt: '基于参考图，镜头缓慢平稳向前推进，轻微景深变化，保持主体与构图不变，自然光影过渡',
    tags: ['推进', '镜头运动'],
  },
  {
    id: 'v-i2v-orbit',
    label: '环绕运镜',
    mode: 'img2video',
    prompt:
      '基于参考图，镜头绕主体缓慢环绕半圈，视角平滑切换，主体位置居中稳定，光影随角度轻微变化',
    tags: ['环绕', '镜头运动'],
  },
  {
    id: 'v-i2v-follow',
    label: '跟随运镜',
    mode: 'img2video',
    prompt: '基于参考图，镜头从侧后方轻微跟随主体向前移动，保持构图稳定，背景产生自然运动视差',
    tags: ['跟随', '镜头运动'],
  },
  {
    id: 'v-i2v-parallax',
    label: '轻微视差',
    mode: 'img2video',
    prompt: '基于参考图，镜头做轻微左右平移，前景与背景产生细腻视差层次，主体相对静止，氛围沉静',
    tags: ['视差', '平移'],
  },
  {
    id: 'v-i2v-crane',
    label: '镜头上移',
    mode: 'img2video',
    prompt: '基于参考图，镜头缓慢向上升起，逐渐展现场景纵深，保持画面稳定，光影自然连贯',
    tags: ['升镜', '镜头运动'],
  },
  {
    id: 'v-i2v-bokeh',
    label: '景深呼吸',
    mode: 'img2video',
    prompt:
      '基于参考图，焦点在主体与背景之间缓慢呼吸切换，浅景深虚实交替，画面几乎无位移，柔和电影感',
    tags: ['景深', '焦点'],
  },
  {
    id: 'v-common-cinematic',
    label: '电影运镜',
    mode: null,
    prompt: '电影级运镜，平滑稳定，自然光影过渡，浅景深，氛围沉浸，画面干净无抖动',
    tags: ['通用', '电影感'],
  },
]
