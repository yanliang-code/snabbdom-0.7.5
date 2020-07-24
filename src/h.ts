import { vnode, VNode, VNodeData } from './vnode';
export type VNodes = Array<VNode>;
export type VNodeChildElement = VNode | string | number | undefined | null;
export type ArrayOrElement<T> = T | T[];
export type VNodeChildren = ArrayOrElement<VNodeChildElement>;
import * as is from './is';

function addNS(
  data: any,
  children: VNodes | undefined,
  sel: string | undefined
): void {
  data.ns = 'http://www.w3.org/2000/svg'; // 命名空间
  if (sel !== 'foreignObject' && children !== undefined) {
    // 遍历子元素，存在则递归调用本身，添加命名空间
    for (let i = 0; i < children.length; ++i) {
      let childData = children[i].data;
      if (childData !== undefined) {
        addNS(
          childData,
          (children[i] as VNode).children as VNodes,
          children[i].sel
        );
      }
    }
  }
}
// h 函数的重载
export function h(sel: string): VNode;
export function h(sel: string, data: VNodeData): VNode;
export function h(sel: string, children: VNodeChildren): VNode;
export function h(sel: string, data: VNodeData, children: VNodeChildren): VNode;
// 重载的实现在此（ts支持重载，js不支持，ts最终会编译为js）
// b?: any, c?: any中?代表这两个参数可为空
export function h(sel: any, b?: any, c?: any): VNode {
  var data: VNodeData = {},
    children: any,
    text: any,
    i: number;
  // 处理三个参数的情况  sel、data、children/text
  if (c !== undefined) {
    // 其他模块来处理data
    data = b;
    if (is.array(c)) {
      // c是数组，创建子元素
      children = c;
    } else if (is.primitive(c)) {
      // c是字符串或者数字，创建文本
      text = c;
    } else if (c && c.sel) {
      // c为虚拟dom（VNode）
      children = [c];
    }
    // 处理两个参数的情况
  } else if (b !== undefined) {
    if (is.array(b)) {
      children = b;
    } else if (is.primitive(b)) {
      text = b;
    } else if (b && b.sel) {
      children = [b];
    } else {
      data = b;
    }
  }
  // 通过前面多参数处理，若children有值，进行处理
  if (children !== undefined) {
    for (i = 0; i < children.length; ++i) {
      // 数组中存在字符串或者数字，调用vnode函数创建文本节点
      if (is.primitive(children[i]))
        children[i] = vnode(
          undefined,
          undefined,
          undefined,
          children[i],
          undefined
        );
    }
  }
  // svg情况下，需要在创建虚拟节点前多一步操作
  if (
    sel[0] === 's' &&
    sel[1] === 'v' &&
    sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    // 传入的标签是svg，需要调用addNs创建命名空间
    addNS(data, children, sel);
  }
  // 最终创建通过vnode函数创建虚拟节点
  return vnode(sel, data, children, text, undefined);
}
export default h;
