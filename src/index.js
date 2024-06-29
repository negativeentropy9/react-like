function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

function createDom(fiber) {
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(
      (key) => isGone(prevProps, nextProps) || isNew(prevProps, nextProps)(key)
    )
    .forEach((name) => {
      dom.removeEventListener(name.toLowerCase().slice(2), prevProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom.addEventListener(name.toLowerCase().slice(2), nextProps[name]);
    });
}

let nextUnitOfWork = null;
let currentTreeRoot = null;
let wipTreeRoot = null;
let hookIndex = 0;
let wipFiberNode = null;

const PLACEMENT = "PLACEMENT";
const DELETE = "DELETE";
const UPDATE = "UPDATE";

class FiberRootNode {
  constructor({ dom, props, alternate }) {
    this.dom = dom;
    this.props = props;
    this.alternate = alternate;
  }
}

class FiberNode {
  constructor({
    type,
    props,
    sibling = null,
    return: parent = null,
    alternate = null,
    dom = null,
    effectTag = PLACEMENT,
  }) {
    this.type = type;
    this.props = props;
    this.sibling = sibling;
    this.return = parent;
    this.alternate = alternate;
    this.dom = dom;
    this.effectTag = effectTag;
  }
}

function createFiberRootNode(config) {
  return new FiberRootNode(config);
}

function createFiberNode(config) {
  return new FiberNode(config);
}

function render(element, container) {
  wipTreeRoot = createFiberRootNode({
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentTreeRoot,
  });

  nextUnitOfWork = wipTreeRoot;

  requestAnimationFrame(workLoop);
}

function workLoop() {
  while (nextUnitOfWork) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }

  if (!nextUnitOfWork && wipTreeRoot) {
    commitRoot();
  }
}

function performUnitOfWork(fiberNode) {
  if (typeof fiberNode.type === "function") {
    updateFunctionComponent(fiberNode);
  } else {
    updateHostComponent(fiberNode);
  }

  if (fiberNode.child) {
    return fiberNode.child;
  }

  let nextFiber = fiberNode;
  while (nextFiber) {
    if (fiberNode.sibling) {
      return fiberNode.sibling;
    }

    nextFiber = nextFiber.return;
  }
}

function updateFunctionComponent(fiberNode) {
  fiberNode.hooks = [];
  wipFiberNode = fiberNode;
  hookIndex = 0;

  const children = [fiberNode.type(fiberNode.props)];

  reconciliationChildren(fiberNode, children);
}

function updateHostComponent(fiberNode) {
  if (!fiberNode.dom) {
    fiberNode.dom = createDom(fiberNode);
  }

  reconciliationChildren(fiberNode, fiberNode.props.children);
}

function reconciliationChildren(fiberNode, children) {
  let oldChildFiberNode = fiberNode.alternate?.child;
  let childIndex = 0;
  let child;
  let preChildFiberNode = null;

  while (childIndex < children.length) {
    child = children[childIndex];

    const isSameType = oldChildFiberNode?.type === child.type;
    let newChildFiberNode = null;

    if (isSameType) {
      newChildFiberNode = {
        ...oldChildFiberNode,
        props: child.props,
        effectTag: UPDATE,
        alternate: oldChildFiberNode,
      };
    } else {
      newChildFiberNode = createFiberNode({
        type: child.type,
        props: child.props,
        sibling: null,
        return: fiberNode,
        alternate: null,
      });
    }

    if (preChildFiberNode) {
      preChildFiberNode.sibling = newChildFiberNode;
    } else {
      fiberNode.child = newChildFiberNode;
    }

    if (oldChildFiberNode) {
      oldChildFiberNode.effectTag = DELETE;
      oldChildFiberNode = oldChildFiberNode.sibling;
    }

    preChildFiberNode = newChildFiberNode;
    childIndex++;
  }
}

function commitRoot() {
  commitWork(wipTreeRoot.child);
  currentTreeRoot = wipTreeRoot;
  wipTreeRoot = null;
}

function commitWork(fiberNode) {
  if (!fiberNode) {
    return;
  }

  let parentFiberNode = fiberNode.return;

  while (!parentFiberNode.dom) {
    parentFiberNode = parentFiberNode.return;
  }

  if (fiberNode.dom) {
    if (fiberNode.effectTag === PLACEMENT) {
      parentFiberNode.dom.appendChild(fiberNode.dom);
    } else if (fiberNode.effectTag === UPDATE) {
      updateDom(fiberNode.dom, fiberNode.alternate.props, fiberNode.props);
    } else {
      parentFiberNode.dom.removeChild(fiberNode.dom);
    }
  }

  commitWork(fiberNode.child);
  commitWork(fiberNode.sibling);
}

function useState(initialState) {
  const oldHook = wipFiberNode.alternate?.hooks?.[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initialState,
    queue: [],
  };
  const oldQueue = oldHook?.queue ?? [];

  oldQueue.forEach((fn) => {
    hook.state = fn.call(null, hook.state);
  });

  wipFiberNode.hooks[hookIndex] = hook;

  function setState(newState) {
    if (typeof newState === "function") {
      hook.queue.push(newState);
    } else {
      hook.queue.push(() => newState);
    }

    wipTreeRoot = createFiberRootNode({
      dom: currentTreeRoot.dom,
      props: currentTreeRoot.props,
      alternate: currentTreeRoot,
    });

    nextUnitOfWork = wipTreeRoot;
    requestAnimationFrame(workLoop);
  }

  return [hook.state, setState];
}

const ReactLike = {
  render,
  createElement,
  useState,
};

/** @jsx ReactLike.createElement */
function Counter() {
  const [state, setState] = ReactLike.useState(1);
  return (
    <h1 onClick={() => setState((c) => c + 1)} style="user-select: none">
      Count: {state}
    </h1>
  );
}

const element = <Counter />;
const container = document.querySelector("#root");
ReactLike.render(element, container);
