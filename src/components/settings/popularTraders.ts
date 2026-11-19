import type { SeatCategory } from '../dragon_tiger/types'

export interface PopularTraderPreset {
  name: string
  branchKeywords: string[]
  desc: string
  category: SeatCategory
}

export const POPULAR_TRADERS: PopularTraderPreset[] = [
  { name: '六一路', branchKeywords: ['福州六一中路'], desc: '招商福州六一中路 / 华泰福建分公司', category: 'trader' },
  { name: '呼家楼', branchKeywords: ['北京东城分公司', '北京呼家楼'], desc: '中信建投北京东城分公司 / 朝外大街', category: 'trader' },
  { name: '章盟主', branchKeywords: ['上海江苏路', '长宁区江苏路', '杭州延安路'], desc: '国泰君安上海江苏路 / 国泰海通长宁区江苏路 / 杭州延安路', category: 'trader' },
  { name: '96余哥', branchKeywords: ['苏州石路', '苏州相城大道'], desc: '东吴证券苏州石路 / 苏州相城大道（90后知名短线打板游资）', category: 'trader' },
  { name: '小方神', branchKeywords: ['东莞证券南京分公司'], desc: '东莞证券南京分公司（短线题材活跃游资）', category: 'trader' },
  { name: '92科比', branchKeywords: ['上海徐汇区瑞平路', '徐汇区瑞平路'], desc: '华鑫证券上海徐汇区瑞平路（情绪周期与龙头接力传奇）', category: 'trader' },
  { name: '方新侠', branchKeywords: ['西安朱雀大街'], desc: '中信证券西安朱雀大街', category: 'trader' },
  { name: '陈小群', branchKeywords: ['大连黄河路'], desc: '中国银河证券大连黄河路', category: 'trader' },
  { name: '炒股养家', branchKeywords: ['上海宛平南路', '上海茅台路'], desc: '华鑫证券上海宛平南路 / 茅台路', category: 'trader' },
  { name: '机构专用', branchKeywords: ['机构专用'], desc: '公募基金、社保基金与保险机构席位', category: 'institution' },
  { name: '北向外资', branchKeywords: ['深股通', '沪股通'], desc: '香港中央结算有限公司（深股通/沪股通）', category: 'north' },
  { name: '拉萨天团', branchKeywords: ['拉萨团结路', '拉萨东环路'], desc: '东方财富证券拉萨高频与散户席位（散户大本营）', category: 'retail' },
]
