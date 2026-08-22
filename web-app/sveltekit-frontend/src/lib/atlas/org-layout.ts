export interface AtlasOrgNode {
  id: string;
  name: string;
  role: string;
  status: string;
  reportsTo?: string | null;
}

export interface AtlasOrgLayoutNode extends AtlasOrgNode {
  x: number;
  y: number;
  children: AtlasOrgLayoutNode[];
}

export interface AtlasOrgEdge {
  parent: AtlasOrgLayoutNode;
  child: AtlasOrgLayoutNode;
}

export const ORG_CARD_WIDTH = 200;
export const ORG_CARD_HEIGHT = 88;
const GAP_X = 32;
const GAP_Y = 64;
const PADDING = 32;

type TreeNode = AtlasOrgNode & { children: TreeNode[] };

export function buildAtlasOrgForest(agents: readonly AtlasOrgNode[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const agent of agents) nodes.set(agent.id, { ...agent, children: [] });

  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.reportsTo && nodes.has(node.reportsTo) && node.reportsTo !== node.id) {
      nodes.get(node.reportsTo)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of list) sort(child.children);
  };
  sort(roots);
  return roots;
}

function subtreeWidth(node: TreeNode, visiting = new Set<string>()): number {
  if (visiting.has(node.id)) return ORG_CARD_WIDTH;
  const next = new Set(visiting).add(node.id);
  if (node.children.length === 0) return ORG_CARD_WIDTH;
  const childrenWidth = node.children.reduce((sum, child) => sum + subtreeWidth(child, next), 0);
  return Math.max(ORG_CARD_WIDTH, childrenWidth + (node.children.length - 1) * GAP_X);
}

function layoutTree(node: TreeNode, x: number, y: number, visiting = new Set<string>()): AtlasOrgLayoutNode {
  if (visiting.has(node.id)) {
    return { ...node, children: [], x, y };
  }
  const nextVisiting = new Set(visiting).add(node.id);
  const totalWidth = subtreeWidth(node, nextVisiting);
  const children: AtlasOrgLayoutNode[] = [];

  if (node.children.length > 0) {
    const childrenWidth = node.children.reduce(
      (sum, child) => sum + subtreeWidth(child, nextVisiting),
      0
    );
    const gaps = (node.children.length - 1) * GAP_X;
    let childX = x + (totalWidth - childrenWidth - gaps) / 2;
    for (const child of node.children) {
      const width = subtreeWidth(child, nextVisiting);
      children.push(layoutTree(child, childX, y + ORG_CARD_HEIGHT + GAP_Y, nextVisiting));
      childX += width + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    reportsTo: node.reportsTo,
    x: x + (totalWidth - ORG_CARD_WIDTH) / 2,
    y,
    children
  };
}

export function layoutAtlasOrg(agents: readonly AtlasOrgNode[]): AtlasOrgLayoutNode[] {
  const roots = buildAtlasOrgForest(agents);
  let x = PADDING;
  const result: AtlasOrgLayoutNode[] = [];
  for (const root of roots) {
    const width = subtreeWidth(root);
    result.push(layoutTree(root, x, PADDING));
    x += width + GAP_X;
  }
  return result;
}

export function flattenAtlasOrg(nodes: readonly AtlasOrgLayoutNode[]): AtlasOrgLayoutNode[] {
  const result: AtlasOrgLayoutNode[] = [];
  const visit = (node: AtlasOrgLayoutNode) => {
    result.push(node);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return result;
}

export function collectAtlasOrgEdges(nodes: readonly AtlasOrgLayoutNode[]): AtlasOrgEdge[] {
  const result: AtlasOrgEdge[] = [];
  const visit = (node: AtlasOrgLayoutNode) => {
    for (const child of node.children) {
      result.push({ parent: node, child });
      visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return result;
}

export function atlasOrgBounds(nodes: readonly AtlasOrgLayoutNode[]) {
  const flat = flattenAtlasOrg(nodes);
  return flat.reduce(
    (bounds, node) => ({
      width: Math.max(bounds.width, node.x + ORG_CARD_WIDTH + PADDING),
      height: Math.max(bounds.height, node.y + ORG_CARD_HEIGHT + PADDING)
    }),
    { width: 640, height: 320 }
  );
}
