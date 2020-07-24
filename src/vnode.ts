import { Hooks } from './hooks';
import { AttachData } from './helpers/attachto';
import { VNodeStyle } from './modules/style';
import { On } from './modules/eventlisteners';
import { Attrs } from './modules/attributes';
import { Classes } from './modules/class';
import { Props } from './modules/props';
import { Dataset } from './modules/dataset';
import { Hero } from './modules/hero';
// 定义类型
export type Key = string | number;
// VNode对象的数据结构
export interface VNode {
  // 选择器
  sel: string | undefined;
  // 节点数据：属性/样式/事件等（此数据结构是由VNodeData此接口定义的）
  data: VNodeData | undefined;
  // 子节点：和text互斥（只能存在一个）
  children: Array<VNode | string> | undefined;
  // 记录VNode对应的真实DOM
  elm: Node | undefined;
  // 节点中的内容，和children互斥
  text: string | undefined;
  // 优化使用
  key: Key | undefined;
}
// 节点数据的数据结构
export interface VNodeData {
  props?: Props;
  attrs?: Attrs;
  class?: Classes;
  style?: VNodeStyle;
  dataset?: Dataset;
  on?: On;
  hero?: Hero;
  attachData?: AttachData;
  hook?: Hooks;
  key?: Key;
  ns?: string; // for SVGs
  fn?: () => VNode; // for thunks
  args?: any[]; // for thunks
  [key: string]: any; // for any other 3rd party module
}
// 传入的参数中使用VNode此接口进行约束入参格式
// 五个入参与VNode对象的数据结构前五个一致，key作为data属性传入
// 返回值就是js对象，用此来描述虚拟dom
// 虚拟dom如何转化为真实dom？===> 此过程在
export function vnode(
  sel: string | undefined,
  data: any | undefined,
  children: Array<VNode | string> | undefined,
  text: string | undefined,
  elm: Element | Text | undefined
): VNode {
  const key = data === undefined ? undefined : data.key;
  return { sel, data, children, text, elm, key };
}

export default vnode;
