/* global module, document, Node */
import { Module } from './modules/module';
import { Hooks } from './hooks';
import vnode, { VNode, VNodeData, Key } from './vnode';
import * as is from './is';
import htmlDomApi, { DOMAPI } from './htmldomapi';

function isUndef(s: any): boolean {
  return s === undefined;
}
function isDef(s: any): boolean {
  return s !== undefined;
}

type VNodeQueue = Array<VNode>;

const emptyNode = vnode('', {}, [], undefined, undefined);

function sameVnode(vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}
// 存在sel属性则为虚拟节点
function isVnode(vnode: any): vnode is VNode {
  return vnode.sel !== undefined;
}

type KeyToIndexMap = { [key: string]: number };

type ArraysOf<T> = {
  [K in keyof T]: T[K][];
};

type ModuleHooks = ArraysOf<Module>;

function createKeyToOldIdx(
  children: Array<VNode>,
  beginIdx: number,
  endIdx: number
): KeyToIndexMap {
  let i: number,
    map: KeyToIndexMap = {},
    key: Key | undefined,
    ch;
  for (i = beginIdx; i <= endIdx; ++i) {
    ch = children[i];
    if (ch != null) {
      key = ch.key;
      if (key !== undefined) map[key] = i;
    }
  }
  return map;
}
// 虚拟dom的钩子函数
const hooks: (keyof Module)[] = [
  'create',
  'update',
  'remove',
  'destroy',
  'pre',
  'post',
];

export { h } from './h';
export { thunk } from './thunk';

// 初始化数据并返回patch函数   modules：模块  domApi：操作dom的api
export function init(modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number,
    j: number,
    cbs = {} as ModuleHooks;
  // 初始化赋值转换虚拟节点的api
  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi;
  // 把传入所有模块的钩子函数，统一存储在cbs对象中
  // 最终构建的cbs对象形式为 [create：[fn1, fn2], update：[fn1, fn2, fn3], .... ]
  for (i = 0; i < hooks.length; ++i) {
    // 给cbs定义属性，属性值为数组
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      // 获取每个模块中的指定钩子函数
      const hook = modules[j][hooks[i]];
      if (hook !== undefined) {
        // 存在则存入cbs对应的数组中
        (cbs[hooks[i]] as Array<any>).push(hook);
      }
    }
  }
  // 生成一个同入参dom一致的id、class的虚拟dom
  function emptyNodeAt(elm: Element) {
    const id = elm.id ? '#' + elm.id : ''; // 处理id
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : ''; // 处理class
    return vnode(
      api.tagName(elm).toLowerCase() + id + c,
      {},
      [],
      undefined,
      elm
    );
  }

  function createRmCb(childElm: Node, listeners: number) {
    // 返回删除元素的回调函数
    return function rmCb() {
      // 通过listeners变量，防止多次移除子节点
      if (--listeners === 0) {
        const parent = api.parentNode(childElm);
        api.removeChild(parent, childElm);
      }
    };
  }
  // 返回创建 vnode 对应的 DOM 元素
  function createElm(vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any,
      data = vnode.data; // 使用其他模块的数据
    if (data !== undefined) {
      // 执行用户设置的init钩子函数（isDef：判断变量是否有值）
      if (isDef((i = data.hook)) && isDef((i = i.init))) {
        // 调用用户设置的钩子函数，并且调用完，防止用户重新赋值虚拟节点的data属性，再次赋值
        i(vnode);
        data = vnode.data;
      }
    }
    // 把vnode转化为真实DOM对象（没有渲染到页面）
    let children = vnode.children,
      sel = vnode.sel;
    // 选择器为！，创建注释节点
    if (sel === '!') {
      if (isUndef(vnode.text)) {
        // 未传text值，默认空字符串
        vnode.text = '';
      }
      // 创建注释节点，存储到vnode.elm
      vnode.elm = api.createComment(vnode.text as string);
    } else if (sel !== undefined) {
      // 按照vnode要求创建dom元素
      // 解析选择器
      const hashIdx = sel.indexOf('#');
      const dotIdx = sel.indexOf('.', hashIdx);
      const hash = hashIdx > 0 ? hashIdx : sel.length;
      const dot = dotIdx > 0 ? dotIdx : sel.length;
      // 获取将要创建元素的标签
      const tag =
        hashIdx !== -1 || dotIdx !== -1
          ? sel.slice(0, Math.min(hash, dot))
          : sel;
      // 创建dom元素，存储到vnode.elm（兼容有命名空间的情况）
      const elm = (vnode.elm =
        isDef(data) && isDef((i = (data as VNodeData).ns))
          ? api.createElementNS(i, tag)
          : api.createElement(tag));
      // 给dom元素赋值id属性
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot));
      if (dotIdx > 0)
        // 给dom元素赋值iclass属性
        elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '));
      // 执行模块中create钩子函数
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);
      // 如果vnode中有子节点，遍历children创建子节点对应的dom元素，追加到指定dom树内
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue));
          }
        }
        // 文本为字符串或者数字时，创建文本节点，追加到指定dom树内（children与text只能存在一个）
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text));
      }
      // 判断用户是否定义了钩子函数
      i = (vnode.data as VNodeData).hook; // Reuse variable
      if (isDef(i)) {
        // 直接执行create钩子函数
        if (i.create) i.create(emptyNode, vnode);
        // 维护insert钩子函数
        if (i.insert) insertedVnodeQueue.push(vnode);
      }
    } else {
      // 选择器为空，创建文本节点，存储到vnode.elm
      vnode.elm = api.createTextNode(vnode.text as string);
    }
    // 返回新创建的DOM
    return vnode.elm;
  }
  // 批量在指定节点下增加子节点
  function addVnodes(
    parentElm: Node,
    before: Node | null,
    vnodes: Array<VNode>,
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    // parentElm：父节点 before：参考节点  vnodes：将要插入的节点数组  insertedVnodeQueue：插入函数队列
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
      }
    }
  }

  function invokeDestroyHook(vnode: VNode) {
    let i: any,
      j: number,
      data = vnode.data;
    // 先触发自身的destroy钩子函数，在触发其子节点的destroy钩子函数
    if (data !== undefined) {
      // 指定虚拟节点用户自定义了destroy钩子函数，调用
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode);
      // 调用模块的destroy钩子函数
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);
      // 执行子节点的destroy钩子函数
      if (vnode.children !== undefined) {
        for (j = 0; j < vnode.children.length; ++j) {
          i = vnode.children[j];
          if (i != null && typeof i !== 'string') {
            invokeDestroyHook(i);
          }
        }
      }
    }
  }
  // 批量在指定节点下删除子节点
  function removeVnodes(
    parentElm: Node,
    vnodes: Array<VNode>,
    startIdx: number,
    endIdx: number
  ): void {
    // 遍历指定区间，处理指定区间中的虚拟节点
    for (; startIdx <= endIdx; ++startIdx) {
      let i: any,
        listeners: number,
        rm: () => void,
        ch = vnodes[startIdx];
      if (ch != null) {
        if (isDef(ch.sel)) {
          // sel已定义，为元素元素节点
          // 执行destory钩子函数（会执行所有子节点的destory钩子函数）
          invokeDestroyHook(ch);
          // 记录模块中remove函数的个数（+1：模块调用remove不会执行，模块执行完，最后再调用才会移除）
          listeners = cbs.remove.length + 1;
          // 创建删除的回调函数(listeners变量，防止重复删除)
          rm = createRmCb(ch.elm as Node, listeners);
          // 调用模块中的remove函数时，会传入rm，相应模块也会调用此rm函数
          for (i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm);
          if (
            isDef((i = ch.data)) &&
            isDef((i = i.hook)) &&
            isDef((i = i.remove))
          ) {
            // 执行用户设置的remove钩子函数
            i(ch, rm);
          } else {
            // 如果没有用户设置的钩子函数，直接调用删除元素的方法
            rm();
          }
        } else {
          // sel等于undefined，为文本节点，直接移除
          // Text node
          api.removeChild(parentElm, ch.elm as Node);
        }
      }
    }
  }
  // 对比新老节点的子节点，更新指定元素的子节点
  // key与sel一致，老节点优先按新节点的位置进行调整
  /*
    个人理解：
    比较过程 新、老节点的首尾子节点相同，老节点按照新节点的位置进行调整
    没有比对上，那么将新节点的首子节点作为新元素添加到老节点的首子节点前
  */
  function updateChildren(
    parentElm: Node,
    oldCh: Array<VNode>,
    newCh: Array<VNode>,
    insertedVnodeQueue: VNodeQueue
  ) {
    let oldStartIdx = 0,
      newStartIdx = 0;
    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];
    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];
    let oldKeyToIdx: any;
    let idxInOld: number;
    let elmToMove: VNode;
    let before: any;
    // 老、新节点同时拥有可遍历的元素（每处理一个子节点，调整数组前后指针的指向位置）
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      /*
        情况1：老、新节点的前后元素为null，移动指针指向
      */
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx];
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 老节点的第一个子节点与新节点的第一个子节点为同一节点
        // 调用patchVnode，进行dom元素更新
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        // 调整指针指向
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 同上
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        // 需要移动位置，放到老节点内最后的位置
        api.insertBefore(
          parentElm,
          oldStartVnode.elm as Node,
          api.nextSibling(oldEndVnode.elm as Node)
        );
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        // 需要移动位置，放到老节点内最前的位置
        api.insertBefore(
          parentElm,
          oldEndVnode.elm as Node,
          oldStartVnode.elm as Node
        );
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } else {
        // 疯狂向老节点中加入新节点中的部分子节点（一直在增加新节点的指针指向）
        if (oldKeyToIdx === undefined) {
          // 将老节点下的子节点，按key：i（子节点在老节点内的位置）存入map
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }
        // 使用新节点当前指向的元素的key在老节点维护的map中取值
        idxInOld = oldKeyToIdx[newStartVnode.key as string];
        // 没取到，此节点相对于老节点是新元素
        if (isUndef(idxInOld)) {
          // New element
          api.insertBefore(
            parentElm,
            createElm(newStartVnode, insertedVnodeQueue),
            oldStartVnode.elm as Node
          );
          newStartVnode = newCh[++newStartIdx];
          // 取到
        } else {
          // 老节点中与新节点中指定子节点key一致的子节点
          elmToMove = oldCh[idxInOld];
          if (elmToMove.sel !== newStartVnode.sel) {
            // 标签不一致，新元素，插入
            api.insertBefore(
              parentElm,
              createElm(newStartVnode, insertedVnodeQueue),
              oldStartVnode.elm as Node
            );
          } else {
            // 标签一致，进行比较，更新
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
            //维护的map指定key值置为undefined
            oldCh[idxInOld] = undefined as any;
            // 插入更新后的元素
            api.insertBefore(
              parentElm,
              elmToMove.elm as Node,
              oldStartVnode.elm as Node
            );
          }
          newStartVnode = newCh[++newStartIdx];
        }
      }
    }
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) {
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
        // 将剩余新节点中的子节点加入老节点中
        addVnodes(
          parentElm,
          before,
          newCh,
          newStartIdx,
          newEndIdx,
          insertedVnodeQueue
        );
      } else {
        // 移除旧节点（加操作，加在oldStartIdx之前）
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
      }
    }
  }
  // 对比 oldVnode 和 vnode 的差异，把差异渲染到 DOM
  function patchVnode(
    oldVnode: VNode,
    vnode: VNode,
    insertedVnodeQueue: VNodeQueue
  ) {
    let i: any, hook: any;
    if (
      isDef((i = vnode.data)) &&
      isDef((hook = i.hook)) &&
      isDef((i = hook.prepatch))
    ) {
      // 首先执行用户设置的prepatch钩子函数
      i(oldVnode, vnode);
    }
    // 将老节点的dom元素赋值给新节点上
    const elm = (vnode.elm = oldVnode.elm as Node);
    let oldCh = oldVnode.children;
    let ch = vnode.children;
    // 老节点与新节点的内存地址一致，直接return
    // prepatch每次都会调用；update只有在新、老节点内存地址不一致时，才会调用。
    if (oldVnode === vnode) return;
    if (vnode.data !== undefined) {
      // 执行所有模块中的update钩子函数
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode);
      i = vnode.data.hook;
      // 执行新节点的update钩子函数
      if (isDef(i) && isDef((i = i.update))) i(oldVnode, vnode);
    }
    // =======================================
    // 1.新节点text未定义
    if (isUndef(vnode.text)) {
      // 老、新节点的子节点都已定义
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch)
          // 不相等，调用函数使用diff算法对比子节点，更新子节点
          updateChildren(
            elm,
            oldCh as Array<VNode>,
            ch as Array<VNode>,
            insertedVnodeQueue
          );
        // 老节点的子节点未定义，新节点的子节点已定义
      } else if (isDef(ch)) {
        // 老节点的子节点未定义，一般子节点就是文本节点，清空文本节点
        if (isDef(oldVnode.text)) api.setTextContent(elm, '');
        // 直接向指定dom元素上添加节点
        addVnodes(
          elm,
          null,
          ch as Array<VNode>,
          0,
          (ch as Array<VNode>).length - 1,
          insertedVnodeQueue
        );
        // 老节点的子节点已定义，新节点的子节点未定义
      } else if (isDef(oldCh)) {
        // 清空老节点的子节点
        removeVnodes(
          elm,
          oldCh as Array<VNode>,
          0,
          (oldCh as Array<VNode>).length - 1
        );
        // 老节点已定义text（前提是新节点text未定义）
      } else if (isDef(oldVnode.text)) {
        // 直接清空老节点的text
        api.setTextContent(elm, '');
      }
    } else if (oldVnode.text !== vnode.text) {
      // 2.老、新节点的文本不同
      // 老节点存在子节点
      if (isDef(oldCh)) {
        // 移除老节点的所有子节点
        removeVnodes(
          elm,
          oldCh as Array<VNode>,
          0,
          (oldCh as Array<VNode>).length - 1
        );
      }
      // 设置当前节点的textContent为新节点的文本vnode.text
      api.setTextContent(elm, vnode.text as string);
    }
    // =========================================================
    // 最后执行用户设置的postpatch钩子函数
    if (isDef(hook) && isDef((i = hook.postpatch))) {
      i(oldVnode, vnode);
    }
  }
  // init内部返回patch函数（高阶函数），对比两次vnode，得到变化并更新，把vnode渲染成真实dom，并返回vnode
  // 高阶函数的好处，调用patch时，不需要再次传入modules、domApi，由于第一次初始化时已经传入
  // 形成了闭包，内部函数可获取外部函数的变量
  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node;
    const insertedVnodeQueue: VNodeQueue = [];
    // 先执行所有模块所有的pre钩子函数（预处理函数）
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();
    // 判断是否为虚拟节点
    if (!isVnode(oldVnode)) {
      // 不是虚拟节点，需要将dom元素转换为虚拟节点（生成一个新的虚拟节点，内部挂载原生dom）
      oldVnode = emptyNodeAt(oldVnode);
    }
    // 判断两个入参节点是否是同一节点（判断节点的key以及sel是否相同）
    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    } else {
      // 如果两个入参节点不同，vnode创建对应的dom（删除旧的，增加新的）
      // 获取当前dom元素
      elm = oldVnode.elm as Node;
      // 获取当前元素的父元素
      parent = api.parentNode(elm);
      // 将新的vnode转换为对应的dom元素，并触发init/create钩子函数
      createElm(vnode, insertedVnodeQueue);

      if (parent !== null) {
        // 父节点不为空，将通过虚拟dom生成的dom元素插在当前dom后一个元素之前 === 插在当前元素之后
        api.insertBefore(parent, vnode.elm as Node, api.nextSibling(elm));
        // 移除老元素
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }
    // 执行用户设置的insert钩子函数（createElm时维护的insert函数，上方进行页面insert，所以这里要触发）
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      (((insertedVnodeQueue[i].data as VNodeData).hook as Hooks).insert as any)(
        insertedVnodeQueue[i]
      );
    }
    // 执行所有模块的post钩子函数
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();
    return vnode; // 返回当前页面上更新过的虚拟节点
  };
}
