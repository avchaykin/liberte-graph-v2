import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  NodeResizer,
  Position,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import { nanoid } from 'nanoid';
import { icon as faIcon } from '@fortawesome/fontawesome-svg-core';
import * as faSolid from '@fortawesome/free-solid-svg-icons';
import 'reactflow/dist/style.css';
import './App.css';

const STORAGE_SCHEMAS = 'liberte.schemas.v1';
const STORAGE_AUTOSAVE = 'liberte.autosave.v1';
const STORAGE_LAST_NAME = 'liberte.lastName.v1';

const PASTEL_COLORS = [
  '#FDE68A', '#FBCFE8', '#BFDBFE', '#C7D2FE', '#BBF7D0', '#FED7AA', '#E9D5FF', '#A7F3D0',
  '#FCA5A5', '#FB7185', '#F59E0B', '#F97316', '#A78BFA', '#8B5CF6', '#22D3EE', '#06B6D4',
  '#34D399', '#10B981', '#60A5FA', '#3B82F6', '#94A3B8', '#64748B', '#475569', '#334155'
];

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');

const initialBlockTypes = [
  {
    id: 'power/circuit-breaker-1p-n',
    group: 'power',
    name: 'Circuit Breaker 1P+N',
    icon: 'bolt',
    headerColor: '#BFDBFE',
    inputs: [
      { id: 'in-n', name: 'N', type: 'electrical' },
      { id: 'in-l', name: 'L', type: 'electrical' },
    ],
    outputs: [
      { id: 'out-n', name: 'N', type: 'electrical' },
      { id: 'out-l', name: 'L', type: 'electrical' },
    ],
    attributes: [
      { name: 'Line', hidden: false },
      { name: 'Model', hidden: false },
      { name: 'Power', hidden: false },
    ],
  },
];

const HEADER_H = 40;
const PORTS_PAD = 10;
const PORT_ROW_H = 24;

const deepClone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const getTextColorForBackground = (hex = '#ffffff') => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((x) => x + x).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0f172a' : '#ffffff';
};

const renderBlockIcon = (iconName, className = 'rf-block__title-icon') => {
  const clean = String(iconName || '').trim();
  if (!clean) return null;

  if (clean.startsWith('fa-')) {
    const pascal = clean
      .slice(3)
      .split('-')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('');
    const definition = faSolid[`fa${pascal}`];
    if (!definition) return <span className={`material-symbols-outlined ${className}`}>category</span>;
    return <span className={className} dangerouslySetInnerHTML={{ __html: faIcon(definition).html.join('') }} />;
  }

  return <span className={`material-symbols-outlined ${className}`}>{clean}</span>;
};

function BlockNode({ data, selected }) {
  const inPorts = data.inputs ?? [];
  const outPorts = data.outputs ?? [];
  const connected = new Set(data.connectedHandles ?? []);
  const rawInstanceName = data.instanceName ?? '';
  const title = rawInstanceName.length > 0 ? rawInstanceName : (data.blockName || '');
  const minimized = Boolean(data.minimized ?? data.collapsed);
  const attrsCollapsed = Boolean(data.attrsCollapsed);
  const tooltipAttrs = (data.attributes || [])
    .filter((a) => String(a.value || '').trim())
    .map((a) => ({ name: a.name, value: a.value }));
  const badgeAttr = (data.attributes || []).find((a) => String(a.name || '').toLowerCase() === 'name');
  const badgeValue = String(badgeAttr?.value || '').trim();
  const badgeLong = badgeValue.length > 2;
  const badgeVeryLong = badgeValue.length > 6;
  const badgeFontSize = badgeValue.length <= 6 ? 11 : badgeValue.length <= 10 ? 8 : 6;

  const maxPorts = Math.max(inPorts.length, outPorts.length, 1);
  const minimizedBodyHeight = Math.max(58, PORTS_PAD * 2 + maxPorts * PORT_ROW_H);
  const yPos = (index) => `${(minimized ? 0 : HEADER_H) + PORTS_PAD + index * PORT_ROW_H + PORT_ROW_H / 2}px`;

  return (
    <div
      className={`rf-block ${selected ? 'rf-block--selected' : ''} ${minimized ? 'rf-block--collapsed' : ''}`}
      style={minimized ? { minHeight: `${minimizedBodyHeight}px`, background: data.headerColor || '#BFDBFE' } : undefined}
      onDoubleClick={(e) => {
        if (!minimized) return;
        e.stopPropagation();
        data.onToggleMinimize?.(data.nodeId);
      }}
    >
      <NodeResizer isVisible={selected} minWidth={minimized ? 68 : 220} minHeight={minimized ? minimizedBodyHeight : 150} lineStyle={{ borderColor: '#93c5fd' }} />
      {!minimized && (
        <div
          className="rf-block__header"
          onDoubleClick={(e) => {
            e.stopPropagation();
            data.onToggleMinimize?.(data.nodeId);
          }}
          style={{ background: data.headerColor || '#ffffff', color: getTextColorForBackground(data.headerColor || '#ffffff') }}
        >
          <span className="rf-block__title-wrap">
            {data.icon && (
              <span className="rf-block__icon-circle">
                {renderBlockIcon(data.icon, 'rf-block__title-icon')}
              </span>
            )}
            <span>{title}</span>
          </span>
          <button
            type="button"
            className="rf-block__collapse"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleAttrs?.(data.nodeId);
            }}
            title={attrsCollapsed ? 'Показать атрибуты' : 'Скрыть атрибуты'}
          >
            {attrsCollapsed ? '+' : '−'}
          </button>
        </div>
      )}

      {inPorts.map((p, idx) => (
        <Handle
          key={p.id}
          id={p.id}
          type="target"
          position={Position.Left}
          className="rf-block__handle"
          style={{ top: yPos(idx), background: connected.has(p.id) ? '#94a3b8' : '#ffffff' }}
        />
      ))}

      {outPorts.map((p, idx) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Right}
          className="rf-block__handle"
          style={{ top: yPos(idx), background: connected.has(p.id) ? '#94a3b8' : '#ffffff' }}
        />
      ))}

      {!minimized && <div className="rf-block__ports">
        <div>
          {inPorts.map((p) => (
            <div key={`in-${p.id}`} className="rf-block__port-row">
              <strong>{p.name}</strong>
            </div>
          ))}
        </div>
        <div>
          {outPorts.map((p) => (
            <div key={`out-${p.id}`} className="rf-block__port-row rf-block__port-row--right">
              <strong>{p.name}</strong>
            </div>
          ))}
        </div>
      </div>}

      {!minimized && !attrsCollapsed && (
        <div className="rf-block__attrs">
          {data.attributes
            .filter((a) => !a.hidden)
            .map((a) => (
              <div className="rf-block__attr" key={a.name}>
                <span>{a.name}</span>
                <strong>{a.value}</strong>
              </div>
            ))}
        </div>
      )}

      {minimized && data.icon && (
        <div className={`rf-block__minimized-icon-wrap ${badgeLong ? 'rf-block__minimized-icon-wrap--raised' : ''} ${badgeVeryLong ? 'rf-block__minimized-icon-wrap--raised-more' : ''}`}>
          <span className="rf-block__icon-circle rf-block__icon-circle--large">
            {renderBlockIcon(data.icon, `rf-block__title-icon rf-block__title-icon--large ${badgeLong ? 'rf-block__title-icon--badge-adjust' : ''} ${badgeVeryLong ? 'rf-block__title-icon--badge-adjust-more' : ''}`)}
          </span>
        </div>
      )}

      {minimized && badgeValue && (
        <div
          className={`rf-block__badge ${badgeLong ? 'rf-block__badge--long' : ''} ${badgeVeryLong ? 'rf-block__badge--very-long' : ''}`}
          style={{ fontSize: `${badgeFontSize}px` }}
          title={badgeValue}
        >
          {badgeValue}
        </div>
      )}

      {(minimized || tooltipAttrs.length > 0) && (
        <div className="rf-block__tooltip" role="tooltip">
          {minimized && <div className="rf-block__tooltip-title">{title}</div>}
          {tooltipAttrs.map((attr) => (
            <div className="rf-block__tooltip-row" key={`${attr.name}-${attr.value}`}>
              <strong className="rf-block__tooltip-key">{attr.name}</strong>
              <span className="rf-block__tooltip-value">{attr.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FrameNode({ data, selected, dragging }) {
  return (
    <div
      className={`rf-frame ${selected ? 'rf-frame--selected' : ''} ${dragging ? 'rf-frame--dragging' : ''}`}
      style={{ borderStyle: data.frameBorderStyle || 'solid' }}
    >
      <NodeResizer isVisible={selected} minWidth={240} minHeight={160} lineStyle={{ borderColor: '#93c5fd' }} />
      <div
        className="rf-frame__title"
        style={{
          background: data.headerColor || '#BFDBFE',
          color: getTextColorForBackground(data.headerColor || '#BFDBFE'),
          fontSize: `${data.fontSize || 16}px`,
        }}
      >
        {data.instanceName || 'Frame'}
      </div>
    </div>
  );
}

function DiagramApp() {
  const rf = useReactFlow();
  const wrapperRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const loadedRef = useRef(false);
  const reconnectRef = useRef({ removedEdge: null, didConnect: false });
  const frameDragRef = useRef({ frameId: null, nodeStart: {}, frameStart: null });
  const importInputRef = useRef(null);

  const [blockTypes, setBlockTypes] = useState(initialBlockTypes);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  const [currentSchemaName, setCurrentSchemaName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [draftSchemaName, setDraftSchemaName] = useState('');
  const [showLoad, setShowLoad] = useState(false);
  const [savePulse, setSavePulse] = useState(false);

  useEffect(() => {
    document.title = currentSchemaName?.trim()
      ? `${currentSchemaName.trim()} : home-schematic`
      : 'home-schematic';
  }, [currentSchemaName]);

  const [menu, setMenu] = useState({ visible: false, x: 0, y: 0, flowX: 0, flowY: 0 });
  const [instanceEditorOpen, setInstanceEditorOpen] = useState(false);
  const [instanceDraftInputs, setInstanceDraftInputs] = useState([]);
  const [instanceDraftOutputs, setInstanceDraftOutputs] = useState([]);
  const [instanceDraftAttrs, setInstanceDraftAttrs] = useState([]);
  const [hoveredGroup, setHoveredGroup] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftGroup, setDraftGroup] = useState('power');
  const [draftName, setDraftName] = useState('');
  const [draftHeaderColor, setDraftHeaderColor] = useState(PASTEL_COLORS[0]);
  const [draftIcon, setDraftIcon] = useState('');
  const [draftInputs, setDraftInputs] = useState([]);
  const [draftOutputs, setDraftOutputs] = useState([]);
  const [draftAttrs, setDraftAttrs] = useState([]);
  const [dragState, setDragState] = useState({ list: null, index: null });
  const [menuDrag, setMenuDrag] = useState({ kind: null, group: null, typeId: null });

  const historyRef = useRef({ undo: [], redo: [], recording: true });
  const lastSnapshotRef = useRef(null);
  const dragSnapshotRef = useRef(null);

  const nodeTypes = useMemo(() => ({ block: BlockNode, frame: FrameNode }), []);

  const grouped = useMemo(() => {
    const g = {};
    for (const t of blockTypes) {
      g[t.group] ??= [];
      g[t.group].push(t);
    }
    return g;
  }, [blockTypes]);

  const groupOrder = useMemo(() => Object.keys(grouped), [grouped]);

  const savedSchemas = useMemo(() => {
    if (!showLoad) return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_SCHEMAS) || '{}');
    } catch {
      return {};
    }
  }, [showLoad]);

  const connectedByNode = useMemo(() => {
    const map = {};
    for (const e of edges) {
      if (e.source && e.sourceHandle) {
        map[e.source] ??= new Set();
        map[e.source].add(e.sourceHandle);
      }
      if (e.target && e.targetHandle) {
        map[e.target] ??= new Set();
        map[e.target].add(e.targetHandle);
      }
    }
    return map;
  }, [edges]);

  const toggleNodeMinimize = useCallback((nodeId) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const isMinimized = Boolean(n.data.minimized ?? n.data.collapsed);
        const willExpand = isMinimized;
        return {
          ...n,
          style: willExpand
            ? { ...n.style, width: n.data.expandedSize?.width, height: n.data.expandedSize?.height }
            : { ...n.style, width: 72 },
          data: {
            ...n.data,
            minimized: !isMinimized,
            collapsed: undefined,
            expandedSize: willExpand ? n.data.expandedSize : { width: n.style?.width, height: n.style?.height },
          },
        };
      })
    );
  }, [setNodes]);

  const toggleNodeAttrs = useCallback((nodeId) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, attrsCollapsed: !n.data.attrsCollapsed } }
          : n
      )
    );
  }, [setNodes]);

  const renderedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        zIndex: n.type === 'frame' ? -1 : n.id === hoveredNodeId ? 1000 : 10,
        data: {
          ...n.data,
          nodeId: n.id,
          onToggleMinimize: toggleNodeMinimize,
          onToggleAttrs: toggleNodeAttrs,
          connectedHandles: [...(connectedByNode[n.id] ?? [])],
        },
      })),
    [nodes, connectedByNode, toggleNodeMinimize, toggleNodeAttrs, hoveredNodeId]
  );

  const getHandleTypes = useCallback(
    (nodeId, handleId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return [];
      const inPort = (node.data.inputs || []).find((p) => p.id === handleId);
      const raw = inPort ? inPort.type : (node.data.outputs || []).find((p) => p.id === handleId)?.type;
      return String(raw || '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    },
    [nodes]
  );

  const renderedEdges = useMemo(
    () =>
      edges.map((e) => {
        const sTypes = getHandleTypes(e.source, e.sourceHandle);
        const tTypes = getHandleTypes(e.target, e.targetHandle);
        const mismatch =
          sTypes.length > 0
          && tTypes.length > 0
          && !sTypes.some((s) => tTypes.includes(s));
        return {
          ...e,
          type: e.type === 'bezier' ? 'default' : e.type || 'default',
          style: mismatch
            ? { ...(e.style || {}), stroke: '#ef4444', strokeWidth: 2.5 }
            : { ...(e.style || {}), stroke: '#cbd5e1', strokeWidth: 2 },
        };
      }),
    [edges, getHandleTypes]
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedType = selectedNode && selectedNode.type === 'block'
    ? blockTypes.find((t) => t.id === selectedNode.data.typeId) || null
    : null;
  const selectedBlockNodes = nodes.filter((n) => n.type === 'block' && n.selected);

  const connectedNamesByNodeHandle = useMemo(() => {
    const labels = {};

    const nodeLabelById = new Map(
      nodes.map((n) => {
        const name = n.data?.instanceName?.trim() || n.data?.blockName || n.id;
        const idAttr = (n.data?.attributes || []).find((a) => String(a.name || '').toLowerCase() === 'id');
        const idValue = String(idAttr?.value || '').trim();
        const label = idValue ? `${name} (${idValue})` : name;
        return [n.id, label];
      })
    );

    for (const edge of edges) {
      if (edge.target && edge.targetHandle && edge.source) {
        labels[edge.target] ??= {};
        labels[edge.target][`in:${edge.targetHandle}`] ??= [];
        labels[edge.target][`in:${edge.targetHandle}`].push(nodeLabelById.get(edge.source) || edge.source);
      }
      if (edge.source && edge.sourceHandle && edge.target) {
        labels[edge.source] ??= {};
        labels[edge.source][`out:${edge.sourceHandle}`] ??= [];
        labels[edge.source][`out:${edge.sourceHandle}`].push(nodeLabelById.get(edge.target) || edge.target);
      }
    }

    return labels;
  }, [nodes, edges]);

  const buildPayload = useCallback(
    (name = '') => ({
      version: 1,
      name,
      updatedAt: Date.now(),
      blockTypes,
      nodes,
      edges,
      viewport: rf.getViewport(),
    }),
    [blockTypes, nodes, edges, rf]
  );

  const snapshotState = useCallback(() => ({
    blockTypes: deepClone(blockTypes),
    nodes: deepClone(nodes),
    edges: deepClone(edges),
    currentSchemaName,
    viewport: rf.getViewport(),
  }), [blockTypes, nodes, edges, currentSchemaName, rf]);

  const applyPayload = useCallback(
    (payload, { fromAutosave = false } = {}) => {
      setBlockTypes(payload.blockTypes || initialBlockTypes);
      setNodes(payload.nodes || []);
      setEdges(
        (payload.edges || []).map((e) => ({
          ...e,
          type: e.type === 'bezier' ? 'default' : e.type || 'default',
        }))
      );
      setSelectedNodeId(null);
      if (!fromAutosave) {
        setCurrentSchemaName(payload.name || '');
        localStorage.setItem(STORAGE_LAST_NAME, payload.name || '');
      }
      if (payload.viewport) {
        requestAnimationFrame(() => rf.setViewport(payload.viewport, { duration: 0 }));
      }
    },
    [setNodes, setEdges, rf]
  );

  const applySnapshot = useCallback((snap) => {
    if (!snap) return;
    historyRef.current.recording = false;
    setBlockTypes(snap.blockTypes || initialBlockTypes);
    setNodes(snap.nodes || []);
    setEdges(snap.edges || []);
    setCurrentSchemaName(snap.currentSchemaName || '');
    requestAnimationFrame(() => {
      if (snap.viewport) rf.setViewport(snap.viewport, { duration: 0 });
      lastSnapshotRef.current = snap;
      historyRef.current.recording = true;
    });
  }, [rf, setNodes, setEdges]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.undo.pop();
    if (!prev) return;
    historyRef.current.redo.push(snapshotState());
    applySnapshot(prev);
  }, [applySnapshot, snapshotState]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo.pop();
    if (!next) return;
    historyRef.current.undo.push(snapshotState());
    applySnapshot(next);
  }, [applySnapshot, snapshotState]);

  useEffect(() => {
    if (!loadedRef.current || !historyRef.current.recording) return;
    const current = snapshotState();

    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = current;
      return;
    }

    const prev = lastSnapshotRef.current;
    const changed = JSON.stringify(prev) !== JSON.stringify(current);
    if (!changed) return;

    historyRef.current.undo.push(prev);
    if (historyRef.current.undo.length > 100) historyRef.current.undo.shift();
    historyRef.current.redo = [];
    lastSnapshotRef.current = current;
  }, [blockTypes, nodes, edges, currentSchemaName, snapshotState]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const autosaveRaw = localStorage.getItem(STORAGE_AUTOSAVE);
    if (autosaveRaw) {
      try {
        const payload = JSON.parse(autosaveRaw);
        applyPayload(payload, { fromAutosave: true });
      } catch {
        // ignore broken autosave
      }
    }

    const lastName = localStorage.getItem(STORAGE_LAST_NAME) || '';
    setCurrentSchemaName(lastName);
  }, [applyPayload]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_AUTOSAVE, JSON.stringify(buildPayload(currentSchemaName || 'autosave')));
    }, 700);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [nodes, edges, blockTypes, currentSchemaName, buildPayload]);

  const persistNamedSchema = useCallback(
    (name) => {
      const clean = name.trim();
      if (!clean) return false;
      let map = {};
      try {
        map = JSON.parse(localStorage.getItem(STORAGE_SCHEMAS) || '{}');
      } catch {
        map = {};
      }
      map[clean] = buildPayload(clean);
      localStorage.setItem(STORAGE_SCHEMAS, JSON.stringify(map));
      localStorage.setItem(STORAGE_LAST_NAME, clean);
      setCurrentSchemaName(clean);
      return true;
    },
    [buildPayload]
  );

  const triggerSavePulse = () => {
    setSavePulse(true);
    setTimeout(() => setSavePulse(false), 700);
  };

  const handleSave = () => {
    if (!currentSchemaName) {
      setDraftSchemaName('');
      setShowSaveAs(true);
      return;
    }
    if (persistNamedSchema(currentSchemaName)) triggerSavePulse();
  };

  const handleSaveAs = () => {
    if (persistNamedSchema(draftSchemaName)) {
      setShowSaveAs(false);
      triggerSavePulse();
    }
  };

  const handleLoad = (name) => {
    const map = JSON.parse(localStorage.getItem(STORAGE_SCHEMAS) || '{}');
    if (!map[name]) return;
    applyPayload(map[name], { fromAutosave: false });
    setShowLoad(false);
  };

  const handleNewSchema = () => {
    if (!confirm('Создать новую схему? Несохранённые изменения останутся только в автосейве.')) return;
    setNodes([]);
    setEdges([]);
    setBlockTypes(initialBlockTypes);
    setSelectedNodeId(null);
    setCurrentSchemaName('');
    localStorage.removeItem(STORAGE_LAST_NAME);
  };

  const handleExport = () => {
    const payload = buildPayload(currentSchemaName || 'untitled');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.name || 'schema'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges) || !Array.isArray(payload.blockTypes)) {
        throw new Error('invalid');
      }
      applyPayload(payload, { fromAutosave: false });
    } catch {
      alert('Не удалось импортировать JSON-схему');
    } finally {
      event.target.value = '';
    }
  };

  const closeMenu = () => {
    setMenu((m) => ({ ...m, visible: false }));
    setHoveredGroup('');
  };

  const openMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const flow = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const maxX = Math.max(8, window.innerWidth - 240);
      const maxY = Math.max(8, window.innerHeight - 320);
      setHoveredGroup(groupOrder[0] || '');
      setMenu({
        visible: true,
        x: Math.min(event.clientX, maxX),
        y: Math.min(event.clientY, maxY),
        flowX: flow.x,
        flowY: flow.y,
      });
    },
    [rf, groupOrder]
  );

  const buildTypeId = (group, name) => `${slugify(group)}/${slugify(name)}`;

  const reorderList = (setter, from, to) => {
    setter((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const onDragStart = (list, index) => setDragState({ list, index });
  const onDragOver = (event) => event.preventDefault();
  const onDropRow = (list, index) => {
    if (dragState.list !== list || dragState.index == null) return;
    const setter = {
      inputs: setDraftInputs,
      outputs: setDraftOutputs,
      attrs: setDraftAttrs,
      'inst-inputs': setInstanceDraftInputs,
      'inst-outputs': setInstanceDraftOutputs,
      'inst-attrs': setInstanceDraftAttrs,
    }[list];
    if (!setter) return;
    reorderList(setter, dragState.index, index);
    setDragState({ list: null, index: null });
  };
  const onDragEnd = () => setDragState({ list: null, index: null });

  const onMenuDragOver = (event) => event.preventDefault();

  const onMenuGroupDragStart = (group) => setMenuDrag({ kind: 'group', group, typeId: null });
  const onMenuGroupDrop = (targetGroup) => {
    if (menuDrag.kind !== 'group' || !menuDrag.group || menuDrag.group === targetGroup) return;
    const from = groupOrder.indexOf(menuDrag.group);
    const to = groupOrder.indexOf(targetGroup);
    if (from < 0 || to < 0) return;

    setBlockTypes((prev) => {
      const buckets = {};
      for (const t of prev) {
        buckets[t.group] ??= [];
        buckets[t.group].push(t);
      }
      const nextGroups = [...groupOrder];
      const [moved] = nextGroups.splice(from, 1);
      nextGroups.splice(to, 0, moved);
      return nextGroups.flatMap((g) => buckets[g] || []);
    });
    setMenuDrag({ kind: null, group: null, typeId: null });
  };

  const onMenuTypeDragStart = (group, typeId) => setMenuDrag({ kind: 'type', group, typeId });
  const onMenuTypeDrop = (group, targetTypeId) => {
    if (menuDrag.kind !== 'type' || menuDrag.group !== group || !menuDrag.typeId || menuDrag.typeId === targetTypeId) return;

    setBlockTypes((prev) => {
      const inGroup = prev.filter((t) => t.group === group);
      const from = inGroup.findIndex((t) => t.id === menuDrag.typeId);
      const to = inGroup.findIndex((t) => t.id === targetTypeId);
      if (from < 0 || to < 0) return prev;

      const reordered = [...inGroup];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

      let cursor = 0;
      return prev.map((t) => (t.group === group ? reordered[cursor++] : t));
    });
    setMenuDrag({ kind: null, group: null, typeId: null });
  };

  const onMenuDragEnd = () => setMenuDrag({ kind: null, group: null, typeId: null });

  const instantiate = (typeDef) => {
    const node = {
      id: nanoid(10),
      type: 'block',
      position: { x: menu.flowX, y: menu.flowY },
      data: {
        typeId: typeDef.id,
        blockGroup: typeDef.group,
        blockName: typeDef.name,
        instanceName: typeDef.name,
        minimized: false,
        attrsCollapsed: false,
        icon: typeDef.icon || '',
        headerColor: typeDef.headerColor || PASTEL_COLORS[0],
        inputs: deepClone(typeDef.inputs),
        outputs: deepClone(typeDef.outputs),
        attributes: typeDef.attributes.map((attr) => ({
          name: attr.name,
          hidden: Boolean(attr.hidden),
          value: '',
        })),
      },
    };
    setNodes((prev) => [...prev, node]);
    closeMenu();
  };

  const instantiateFrame = () => {
    const frameNode = {
      id: nanoid(10),
      type: 'frame',
      position: { x: menu.flowX, y: menu.flowY },
      zIndex: -1,
      style: { width: 360, height: 220 },
      data: {
        instanceName: 'Frame',
        headerColor: '#E2E8F0',
        frameBorderStyle: 'solid',
        fontSize: 16,
      },
    };
    setNodes((prev) => [...prev, frameNode]);
    closeMenu();
  };

  const onConnect = useCallback(
    (params) => {
      reconnectRef.current.didConnect = true;
      setEdges((prev) => {
        const filtered = prev.filter((e) => {
          if (reconnectRef.current.removedEdge && e.id === reconnectRef.current.removedEdge.id) {
            return false;
          }
          return !(e.target === params.target && e.targetHandle === params.targetHandle);
        });
        return addEdge(
          {
            ...params,
            type: 'default',
            style: { stroke: '#cbd5e1', strokeWidth: 2 },
          },
          filtered
        );
      });
    },
    [setEdges]
  );

  const onConnectStart = useCallback((event, info) => {
    const startX = event?.clientX ?? event?.touches?.[0]?.clientX ?? 0;
    const startY = event?.clientY ?? event?.touches?.[0]?.clientY ?? 0;
    let removedEdge = null;
    if (info.handleType === 'target') {
      removedEdge = edges.find((e) => e.target === info.nodeId && e.targetHandle === info.handleId) || null;
    }
    reconnectRef.current = { removedEdge, didConnect: false, startX, startY };
  }, [edges]);

  const onConnectEnd = useCallback(
    (event) => {
      const endX = event?.clientX ?? event?.changedTouches?.[0]?.clientX ?? reconnectRef.current.startX;
      const endY = event?.clientY ?? event?.changedTouches?.[0]?.clientY ?? reconnectRef.current.startY;
      const dx = endX - (reconnectRef.current.startX ?? endX);
      const dy = endY - (reconnectRef.current.startY ?? endY);
      const movedDistance = Math.hypot(dx, dy);
      const removedEdge = reconnectRef.current.removedEdge;
      const shouldDisconnect = removedEdge && !reconnectRef.current.didConnect && movedDistance >= 8;

      if (shouldDisconnect) {
        setEdges((prev) => prev.filter((e) => e.id !== removedEdge.id));
      }

      reconnectRef.current = { removedEdge: null, didConnect: false, startX: 0, startY: 0 };
    },
    [setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges((prev) => reconnectEdge(oldEdge, newConnection, prev));
    },
    [setEdges]
  );

  const openCreate = () => {
    setEditingId(null);
    setDraftGroup('power');
    setDraftName('');
    setDraftHeaderColor(PASTEL_COLORS[0]);
    setDraftIcon('');
    setDraftInputs([]);
    setDraftOutputs([]);
    setDraftAttrs([
      { name: 'ID', hidden: true },
      { name: 'Name', hidden: true },
    ]);
    setEditorOpen(true);
    closeMenu();
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setDraftGroup(t.group);
    setDraftName(t.name);
    setDraftHeaderColor(t.headerColor || PASTEL_COLORS[0]);
    setDraftIcon(t.icon || '');
    setDraftInputs(t.inputs.map((x) => ({ ...x })));
    setDraftOutputs(t.outputs.map((x) => ({ ...x })));
    setDraftAttrs(t.attributes.map((attr) => ({ name: attr.name, hidden: Boolean(attr.hidden) })));
    setEditorOpen(true);
    closeMenu();
  };

  const deleteType = (typeId) => {
    setBlockTypes((prev) => prev.filter((t) => t.id !== typeId));
    const remainingNodes = nodes.filter((n) => n.data.typeId !== typeId);
    const remainingIds = new Set(remainingNodes.map((n) => n.id));
    setNodes(remainingNodes);
    setEdges((prev) => prev.filter((e) => remainingIds.has(e.source) && remainingIds.has(e.target)));
    if (selectedNode && selectedNode.data.typeId === typeId) setSelectedNodeId(null);
  };

  const saveType = () => {
    if (!draftGroup.trim() || !draftName.trim()) return;
    const id = buildTypeId(draftGroup, draftName);

    const normalized = {
      id,
      group: draftGroup.trim(),
      name: draftName.trim(),
      icon: draftIcon.trim(),
      headerColor: draftHeaderColor || PASTEL_COLORS[0],
      inputs: draftInputs
        .filter((p) => p.name.trim())
        .map((p) => ({ id: p.id || nanoid(6), name: p.name.trim(), type: p.type?.trim() || '' })),
      outputs: draftOutputs
        .filter((p) => p.name.trim())
        .map((p) => ({ id: p.id || nanoid(6), name: p.name.trim(), type: p.type?.trim() || '' })),
      attributes: draftAttrs
        .filter((a) => a.name.trim())
        .map((a) => ({ name: a.name.trim(), hidden: Boolean(a.hidden) })),
    };

    if (editingId) {
      const previousType = blockTypes.find((t) => t.id === editingId) || null;
      setBlockTypes((prev) => prev.map((t) => (t.id === editingId ? normalized : t)));
      setNodes((prev) =>
        prev.map((n) => {
          if (n.data.typeId !== editingId) return n;
          const shouldUpdateIcon = !n.data.icon || n.data.icon === (previousType?.icon || '');
          return {
            ...n,
            data: {
              ...n.data,
              typeId: normalized.id,
              blockGroup: normalized.group,
              blockName: normalized.name,
              headerColor: normalized.headerColor,
              icon: shouldUpdateIcon ? normalized.icon : n.data.icon,
            },
          };
        })
      );
    } else {
      setBlockTypes((prev) => [...prev, normalized]);
    }

    setEditorOpen(false);
  };

  const updateNodeName = (name) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== selectedNodeId) return n;
        const effectiveName = n.type === 'block' ? (name === '' ? (n.data.blockName || '') : name) : name;
        return {
          ...n,
          data: {
            ...n.data,
            instanceName: effectiveName,
          },
        };
      })
    );
  };

  const updateNodeAttr = (name, value) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                attributes: n.data.attributes.map((a) => (a.name === name ? { ...a, value } : a)),
              },
            }
          : n
      )
    );
  };

  const openInstanceEditorForNode = useCallback((node) => {
    if (!node || node.type !== 'block') return;
    setSelectedNodeId(node.id);
    setInstanceDraftInputs(deepClone(node.data.inputs || []));
    setInstanceDraftOutputs(deepClone(node.data.outputs || []));
    setInstanceDraftAttrs(deepClone(node.data.attributes || []));
    setInstanceEditorOpen(true);
  }, []);

  const openInstanceEditor = () => {
    if (!selectedNode || selectedNode.type !== 'block') return;
    openInstanceEditorForNode(selectedNode);
  };

  const saveInstanceEditor = () => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                inputs: instanceDraftInputs.filter((p) => p.name?.trim()).map((p) => ({ ...p, name: p.name.trim() })),
                outputs: instanceDraftOutputs.filter((p) => p.name?.trim()).map((p) => ({ ...p, name: p.name.trim() })),
                attributes: instanceDraftAttrs.filter((a) => a.name?.trim()).map((a) => ({ ...a, name: a.name.trim() })),
              },
            }
          : n
      )
    );
    setInstanceEditorOpen(false);
  };

  const alignSelected = (mode) => {
    const selectedIds = new Set(selectedBlockNodes.map((n) => n.id));
    if (selectedIds.size < 2) return;

    setNodes((prev) => {
      const selected = prev
        .filter((n) => selectedIds.has(n.id))
        .map((n) => {
          const width = n.width || n.style?.width || 260;
          const height = n.height || n.style?.height || 180;
          return {
            ...n,
            _w: width,
            _h: height,
            _left: n.position.x,
            _right: n.position.x + width,
            _top: n.position.y,
            _bottom: n.position.y + height,
            _centerX: n.position.x + width / 2,
            _centerY: n.position.y + height / 2,
          };
        });

      const minLeft = Math.min(...selected.map((n) => n._left));
      const maxRight = Math.max(...selected.map((n) => n._right));
      const minTop = Math.min(...selected.map((n) => n._top));
      const maxBottom = Math.max(...selected.map((n) => n._bottom));
      const midX = selected.reduce((sum, n) => sum + n._centerX, 0) / selected.length;
      const midY = selected.reduce((sum, n) => sum + n._centerY, 0) / selected.length;

      const xById = {};
      const yById = {};

      if (mode === 'distributeX') {
        const sorted = [...selected].sort((a, b) => a._left - b._left);
        const totalWidth = sorted.reduce((sum, n) => sum + n._w, 0);
        const gap = sorted.length > 1 ? Math.max(0, (maxRight - minLeft - totalWidth) / (sorted.length - 1)) : 0;
        let cursor = minLeft;
        for (const item of sorted) {
          xById[item.id] = cursor;
          cursor += item._w + gap;
        }
      }

      if (mode === 'distributeY') {
        const sorted = [...selected].sort((a, b) => a._top - b._top);
        const totalHeight = sorted.reduce((sum, n) => sum + n._h, 0);
        const gap = sorted.length > 1 ? Math.max(0, (maxBottom - minTop - totalHeight) / (sorted.length - 1)) : 0;
        let cursor = minTop;
        for (const item of sorted) {
          yById[item.id] = cursor;
          cursor += item._h + gap;
        }
      }

      return prev.map((n) => {
        if (!selectedIds.has(n.id)) return n;
        const width = n.width || n.style?.width || 260;
        const height = n.height || n.style?.height || 180;

        if (mode === 'left') return { ...n, position: { ...n.position, x: minLeft } };
        if (mode === 'right') return { ...n, position: { ...n.position, x: maxRight - width } };
        if (mode === 'hcenter') return { ...n, position: { ...n.position, x: midX - width / 2 } };
        if (mode === 'top') return { ...n, position: { ...n.position, y: minTop } };
        if (mode === 'bottom') return { ...n, position: { ...n.position, y: maxBottom - height } };
        if (mode === 'vcenter') return { ...n, position: { ...n.position, y: midY - height / 2 } };
        if (mode === 'distributeX') return { ...n, position: { ...n.position, x: xById[n.id] ?? n.position.x } };
        if (mode === 'distributeY') return { ...n, position: { ...n.position, y: yById[n.id] ?? n.position.y } };

        return n;
      });
    });
  };

  const onNodeDragStart = (_, node) => {
    if (!dragSnapshotRef.current) {
      dragSnapshotRef.current = snapshotState();
      historyRef.current.recording = false;
    }

    if (node.type !== 'frame') return;

    const frameLeft = node.position.x;
    const frameTop = node.position.y;
    const frameRight = frameLeft + (node.width || node.style?.width || 360);
    const frameBottom = frameTop + (node.height || node.style?.height || 220);

    const inside = nodes.filter((n) => {
      if (n.id === node.id || n.type === 'frame') return false;
      const width = n.width || n.style?.width || 260;
      const height = n.height || n.style?.height || 180;
      const centerX = n.position.x + width / 2;
      const centerY = n.position.y + height / 2;
      return centerX >= frameLeft && centerX <= frameRight && centerY >= frameTop && centerY <= frameBottom;
    });

    frameDragRef.current = {
      frameId: node.id,
      frameStart: { ...node.position },
      nodeStart: Object.fromEntries(inside.map((n) => [n.id, { ...n.position }])),
    };
  };

  const onNodeDrag = (_, node) => {
    if (node.type !== 'frame' || frameDragRef.current.frameId !== node.id) return;
    const dx = node.position.x - (frameDragRef.current.frameStart?.x || 0);
    const dy = node.position.y - (frameDragRef.current.frameStart?.y || 0);
    const movedIds = new Set(Object.keys(frameDragRef.current.nodeStart));
    setNodes((prev) =>
      prev.map((n) => {
        if (!movedIds.has(n.id)) return n;
        const start = frameDragRef.current.nodeStart[n.id];
        return { ...n, position: { x: start.x + dx, y: start.y + dy } };
      })
    );
  };

  const onNodeDragStop = () => {
    frameDragRef.current = { frameId: null, nodeStart: {}, frameStart: null };

    const startSnap = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    historyRef.current.recording = true;

    if (!startSnap) return;

    const endSnap = snapshotState();
    const changed = JSON.stringify(startSnap) !== JSON.stringify(endSnap);
    if (!changed) return;

    historyRef.current.undo.push(startSnap);
    if (historyRef.current.undo.length > 100) historyRef.current.undo.shift();
    historyRef.current.redo = [];
    lastSnapshotRef.current = endSnap;
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const targetTag = event.target?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

      const key = event.key.toLowerCase();

      if ((key === 'z' || key === 'я') && !event.shiftKey) {
        handleUndo();
        event.preventDefault();
        return;
      }

      if (((key === 'z' || key === 'я') && event.shiftKey) || key === 'y' || key === 'н') {
        handleRedo();
        event.preventDefault();
        return;
      }

      if (key === 'c' && selectedNodeId) {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (!selected) return;
        window.__liberteClipboardNode = deepClone(selected);
        event.preventDefault();
      }

      if (key === 'v' && window.__liberteClipboardNode) {
        const cloned = deepClone(window.__liberteClipboardNode);
        const newId = nanoid(10);
        const nextNode = {
          ...cloned,
          id: newId,
          selected: false,
          dragging: false,
          position: {
            x: (cloned.position?.x || 0) + 40,
            y: (cloned.position?.y || 0) + 40,
          },
        };
        setNodes((prev) => [...prev, nextNode]);
        setSelectedNodeId(newId);
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, selectedNodeId, setNodes, handleUndo, handleRedo]);

  return (
    <div className="layout">
      <div className="canvas" ref={wrapperRef} onContextMenu={openMenu}>
        <div className="topbar">
          <button className="topbar__btn topbar__btn--new icon-btn" onClick={handleNewSchema} title="Новая схема" aria-label="Новая схема">
            <span className="material-symbols-outlined">note_add</span>
          </button>
          <button className={`topbar__btn topbar__btn--save icon-btn ${savePulse ? 'topbar__btn--saving' : ''}`} onClick={handleSave} title="Сохранить" aria-label="Сохранить">
            <span className="material-symbols-outlined">save</span>
          </button>
          <button
            className="topbar__btn topbar__btn--saveas icon-btn"
            onClick={() => {
              setDraftSchemaName(currentSchemaName || '');
              setShowSaveAs(true);
            }}
            title="Сохранить как"
            aria-label="Сохранить как"
          >
            <span className="material-symbols-outlined">save_as</span>
          </button>
          <button className="topbar__btn topbar__btn--load icon-btn" onClick={() => setShowLoad(true)} title="Загрузить" aria-label="Загрузить">
            <span className="material-symbols-outlined">folder_open</span>
          </button>
          <button className="topbar__btn topbar__btn--export icon-btn" onClick={handleExport} title="Экспорт JSON" aria-label="Экспорт JSON">
            <span className="material-symbols-outlined">download</span>
          </button>
          <button className="topbar__btn topbar__btn--import icon-btn" onClick={() => importInputRef.current?.click()} title="Импорт JSON" aria-label="Импорт JSON">
            <span className="material-symbols-outlined">upload_file</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <div className="topbar__name" aria-label="Текущая схема">
            <span className="topbar__schema">{currentSchemaName || ''}</span>
          </div>
        </div>

        {selectedBlockNodes.length > 1 && (
          <div className="alignbar">
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('left')} title="Выровнять по левому краю"><span className="material-symbols-outlined">format_align_left</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('hcenter')} title="Выровнять по центру X"><span className="material-symbols-outlined">align_horizontal_center</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('right')} title="Выровнять по правому краю"><span className="material-symbols-outlined">format_align_right</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('top')} title="Выровнять по верхнему краю"><span className="material-symbols-outlined">vertical_align_top</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('vcenter')} title="Выровнять по центру Y"><span className="material-symbols-outlined">align_vertical_center</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('bottom')} title="Выровнять по нижнему краю"><span className="material-symbols-outlined">vertical_align_bottom</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('distributeX')} title="Распределить по горизонтали"><span className="material-symbols-outlined">view_week</span></button>
            <button className="topbar__btn icon-btn" onClick={() => alignSelected('distributeY')} title="Распределить по вертикали"><span className="material-symbols-outlined">view_agenda</span></button>
          </div>
        )}

        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          elevateNodesOnSelect={false}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          connectionLineType={ConnectionLineType.Bezier}
          onNodeClick={(event, n) => {
            if (event.shiftKey) {
              setNodes((prev) => prev.map((node) => (node.id === n.id ? { ...node, selected: true } : node)));
              setSelectedNodeId(n.id);
            } else {
              setNodes((prev) => prev.map((node) => ({ ...node, selected: node.id === n.id })));
              setSelectedNodeId(n.id);
            }
          }}
          onNodeMouseEnter={(_, n) => setHoveredNodeId(n.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={(event, n) => {
            if (n.type !== 'block') return;
            if (event.target.closest('.rf-block__header')) return;
            openInstanceEditorForNode(n);
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setHoveredNodeId(null);
            setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
            closeMenu();
          }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={3}
        >
          <Background variant="dots" gap={22} size={1.2} color="#334155" bgColor="#ffffff" />
          <Controls position="bottom-right" />
        </ReactFlow>

        {menu.visible && (
          <div className="menu" style={{ left: menu.x, top: menu.y }}>
            <div className="menu__head">
              <span>Добавить блок</span>
              <div className="menu__head-actions">
                <button className="icon-btn" onClick={instantiateFrame} title="Добавить фрейм" aria-label="Добавить фрейм">
                  <span className="material-symbols-outlined">crop_square</span>
                </button>
                <button className="icon-btn" onClick={openCreate} title="Создать новый тип блока" aria-label="Создать новый тип блока">
                  <span className="material-symbols-outlined">add_box</span>
                </button>
              </div>
            </div>

            <div className="menu__groups">
              {groupOrder.map((group) => (
                <button
                  key={group}
                  className={`menu__group-btn ${hoveredGroup === group ? 'menu__group-btn--active' : ''}`}
                  onMouseEnter={() => setHoveredGroup(group)}
                  onFocus={() => setHoveredGroup(group)}
                  onDragOver={onMenuDragOver}
                  onDrop={() => onMenuGroupDrop(group)}
                  onDragStart={() => onMenuGroupDragStart(group)}
                  onDragEnd={onMenuDragEnd}
                  draggable
                  type="button"
                >
                  <span className="material-symbols-outlined drag-handle" aria-hidden title="Перетащите для сортировки группы">drag_indicator</span>
                  {group}
                </button>
              ))}
            </div>

            {hoveredGroup && grouped[hoveredGroup] && (
              <div
                className="menu__submenu"
                style={{
                  left: menu.x + 220 + 300 > window.innerWidth ? 'auto' : 'calc(100% + 8px)',
                  right: menu.x + 220 + 300 > window.innerWidth ? 'calc(100% + 8px)' : 'auto',
                  maxHeight: `min(70vh, ${Math.max(220, window.innerHeight - menu.y - 12)}px)`,
                }}
              >
                <div className="menu__group-title">{hoveredGroup}</div>
                {grouped[hoveredGroup].map((t) => (
                  <div
                    key={t.id}
                    className="menu__item"
                    draggable
                    onDragStart={() => onMenuTypeDragStart(hoveredGroup, t.id)}
                    onDragOver={onMenuDragOver}
                    onDrop={() => onMenuTypeDrop(hoveredGroup, t.id)}
                    onDragEnd={onMenuDragEnd}
                  >
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button className="menu__add" onClick={() => instantiate(t)}>
                      {t.name}
                    </button>
                    <button className="menu__edit icon-btn" onClick={() => openEdit(t)} title="Редактировать тип" aria-label="Редактировать тип">
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="inspector">
        <h3>Инспектор</h3>
        {selectedNode ? (
          <>
            {selectedNode.type === 'block' ? (
              <>
                <label className="field">
                  <span>Группа</span>
                  <input value={selectedNode.data.blockGroup || selectedType?.group || ''} disabled />
                </label>
                <label className="field">
                  <span>Тип блока</span>
                  <input value={selectedNode.data.blockName || selectedType?.name || ''} disabled />
                </label>
                <label className="field">
                  <span>Иконка (Material Symbols)</span>
                  <input
                    value={selectedNode.data.icon || ''}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, icon: e.target.value } } : n))
                      )
                    }
                    placeholder="bolt или fa-house"
                  />
                </label>
                <label className="field">
                  <span>Имя экземпляра</span>
                  <input value={selectedNode.data.instanceName} onChange={(e) => updateNodeName(e.target.value)} />
                </label>

                <div className="inspector-actions">
                  <button className="btn-primary icon-btn" type="button" onClick={openInstanceEditor} title="Редактировать экземпляр" aria-label="Редактировать экземпляр">
                    <span className="material-symbols-outlined">tune</span>
                  </button>
                  <button
                    className="menu__edit icon-btn"
                    type="button"
                    onClick={() => selectedType && openEdit(selectedType)}
                    title="Редактировать тип"
                    aria-label="Редактировать тип"
                    disabled={!selectedType}
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                </div>

                <div className="inspector-desc-grid">
                  <div className="inspector-desc">
                    <div className="inspector-desc__head">
                      <strong>Входы</strong>
                    </div>

                    <div className="inspector-desc__section">
                      {selectedNode.data.inputs?.length ? (
                        <ul>
                          {selectedNode.data.inputs.map((p) => (
                            <li key={`inst-in-${p.id}`}>
                              <strong>{p.name}</strong>
                              <em>{p.type || 'без типа'}</em>
                              {!!connectedNamesByNodeHandle[selectedNode.id]?.[`in:${p.id}`]?.length && (
                                <small>{connectedNamesByNodeHandle[selectedNode.id][`in:${p.id}`].map((name) => `${name} →`).join(', ')}</small>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Нет входов</p>
                      )}
                    </div>
                  </div>

                  <div className="inspector-desc">
                    <div className="inspector-desc__head">
                      <strong>Выходы</strong>
                    </div>

                    <div className="inspector-desc__section">
                      {selectedNode.data.outputs?.length ? (
                        <ul>
                          {selectedNode.data.outputs.map((p) => (
                            <li key={`inst-out-${p.id}`}>
                              <strong>{p.name}</strong>
                              <em>{p.type || 'без типа'}</em>
                              {!!connectedNamesByNodeHandle[selectedNode.id]?.[`out:${p.id}`]?.length && (
                                <small>{connectedNamesByNodeHandle[selectedNode.id][`out:${p.id}`].map((name) => `→ ${name}`).join(', ')}</small>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Нет выходов</p>
                      )}
                    </div>
                  </div>
                </div>

                {selectedNode.data.attributes.map((a) => (
                  <label className="field" key={a.name}>
                    <span>{a.name}{a.hidden ? ' (скрытый)' : ''}</span>
                    <input value={a.value} onChange={(e) => updateNodeAttr(a.name, e.target.value)} />
                  </label>
                ))}
              </>
            ) : (
              <>
                <label className="field">
                  <span>Заголовок фрейма</span>
                  <input value={selectedNode.data.instanceName || ''} onChange={(e) => updateNodeName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Размер шрифта</span>
                  <input
                    type="number"
                    min={10}
                    max={48}
                    value={selectedNode.data.fontSize || 16}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNodeId ? { ...n, data: { ...n.data, fontSize: Number(e.target.value) || 16 } } : n
                        )
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Цвет заголовка</span>
                  <input
                    type="color"
                    value={selectedNode.data.headerColor || '#E2E8F0'}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNodeId ? { ...n, data: { ...n.data, headerColor: e.target.value } } : n
                        )
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Обрамление</span>
                  <select
                    value={selectedNode.data.frameBorderStyle || 'solid'}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNodeId ? { ...n, data: { ...n.data, frameBorderStyle: e.target.value } } : n
                        )
                      )
                    }
                  >
                    <option value="solid">Сплошное</option>
                    <option value="dashed">Пунктир</option>
                  </select>
                </label>
              </>
            )}
          </>
        ) : (
          <p>Выберите блок на поле</p>
        )}
      </aside>

      {editorOpen && (
        <div className="modal-backdrop" onClick={() => setEditorOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? 'Редактировать тип' : 'Новый тип'}</h3>

            <label className="field">
              <span>Группа</span>
              <input value={draftGroup} onChange={(e) => setDraftGroup(e.target.value)} placeholder="power" />
            </label>
            <label className="field">
              <span>Имя блока</span>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Circuit Breaker 1P+N" />
            </label>
            <label className="field">
              <span>Иконка (Material Symbols)</span>
              <input value={draftIcon} onChange={(e) => setDraftIcon(e.target.value)} placeholder="bolt или fa-house" />
            </label>
            <label className="field">
              <span>Цвет заголовка</span>
              <input type="color" value={draftHeaderColor} onChange={(e) => setDraftHeaderColor(e.target.value)} />
            </label>
            <p className="hint">ID создаётся автоматически: {buildTypeId(draftGroup || 'group', draftName || 'name')}</p>

            <div className="section">
              <div className="section__head">
                <span>Входы</span>
                <button onClick={() => setDraftInputs((prev) => [...prev, { id: nanoid(6), name: '', type: '' }])}>+ Вход</button>
              </div>
              {draftInputs.map((p, i) => (
                <div
                  className="row row--with-controls"
                  key={`in-${i}`}
                  draggable
                  onDragStart={() => onDragStart('inputs', i)}
                  onDragOver={onDragOver}
                  onDrop={() => onDropRow('inputs', i)}
                  onDragEnd={onDragEnd}
                >
                  <input
                    placeholder="Название"
                    value={p.name}
                    onChange={(e) => setDraftInputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))}
                  />
                  <input
                    placeholder="Тип (необязательно)"
                    value={p.type}
                    onChange={(e) => setDraftInputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, type: e.target.value } : it)))}
                  />
                  <div className="row-controls">
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button type="button" className="row-controls__delete" title="Удалить вход" aria-label="Удалить вход" onClick={() => setDraftInputs((prev) => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section__head">
                <span>Выходы</span>
                <button onClick={() => setDraftOutputs((prev) => [...prev, { id: nanoid(6), name: '', type: '' }])}>+ Выход</button>
              </div>
              {draftOutputs.map((p, i) => (
                <div
                  className="row row--with-controls"
                  key={`out-${i}`}
                  draggable
                  onDragStart={() => onDragStart('outputs', i)}
                  onDragOver={onDragOver}
                  onDrop={() => onDropRow('outputs', i)}
                  onDragEnd={onDragEnd}
                >
                  <input
                    placeholder="Название"
                    value={p.name}
                    onChange={(e) => setDraftOutputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))}
                  />
                  <input
                    placeholder="Тип (необязательно)"
                    value={p.type}
                    onChange={(e) => setDraftOutputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, type: e.target.value } : it)))}
                  />
                  <div className="row-controls">
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button type="button" className="row-controls__delete" title="Удалить выход" aria-label="Удалить выход" onClick={() => setDraftOutputs((prev) => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section__head">
                <span>Атрибуты</span>
                <button onClick={() => setDraftAttrs((prev) => [...prev, { name: '', hidden: false }])}>+ Атрибут</button>
              </div>
              {draftAttrs.map((a, i) => (
                <div
                  className="row row--attr"
                  key={`attr-${i}`}
                  draggable
                  onDragStart={() => onDragStart('attrs', i)}
                  onDragOver={onDragOver}
                  onDrop={() => onDropRow('attrs', i)}
                  onDragEnd={onDragEnd}
                >
                  <input
                    placeholder="Имя атрибута"
                    value={a.name}
                    onChange={(e) =>
                      setDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))
                    }
                  />
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={Boolean(a.hidden)}
                      onChange={(e) =>
                        setDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, hidden: e.target.checked } : it)))
                      }
                    />
                    скрытый
                  </label>
                  <div className="row-controls">
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button type="button" className="row-controls__delete" title="Удалить атрибут" aria-label="Удалить атрибут" onClick={() => setDraftAttrs((prev) => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions modal-actions--spread">
              <div>
                {editingId && (
                  <button
                    className="menu__delete"
                    onClick={() => {
                      if (confirm(`Удалить тип блока "${draftName}" и все его экземпляры на схеме?`)) {
                        deleteType(editingId);
                        setEditorOpen(false);
                      }
                    }}
                  >
                    Удалить тип
                  </button>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn-muted" onClick={() => setEditorOpen(false)}>Отмена</button>
                <button className="btn-primary" onClick={saveType}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {instanceEditorOpen && (
        <div className="modal-backdrop" onClick={() => setInstanceEditorOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Редактировать экземпляр</h3>

            <div className="section">
              <div className="section__head">
                <span>Входы</span>
                <button onClick={() => setInstanceDraftInputs((prev) => [...prev, { id: nanoid(6), name: '', type: '' }])}>+ Вход</button>
              </div>
              {instanceDraftInputs.map((p, i) => (
                <div className="row row--with-controls" key={`i-in-${i}`} draggable onDragStart={() => onDragStart('inst-inputs', i)} onDragOver={onDragOver} onDrop={() => onDropRow('inst-inputs', i)} onDragEnd={onDragEnd}>
                  <input placeholder="Название" value={p.name} onChange={(e) => setInstanceDraftInputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))} />
                  <input placeholder="Тип" value={p.type || ''} onChange={(e) => setInstanceDraftInputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, type: e.target.value } : it)))} />
                  <div className="row-controls">
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button type="button" className="row-controls__delete" title="Удалить вход экземпляра" aria-label="Удалить вход экземпляра" onClick={() => setInstanceDraftInputs((prev) => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section__head">
                <span>Выходы</span>
                <button onClick={() => setInstanceDraftOutputs((prev) => [...prev, { id: nanoid(6), name: '', type: '' }])}>+ Выход</button>
              </div>
              {instanceDraftOutputs.map((p, i) => (
                <div className="row row--with-controls" key={`i-out-${i}`} draggable onDragStart={() => onDragStart('inst-outputs', i)} onDragOver={onDragOver} onDrop={() => onDropRow('inst-outputs', i)} onDragEnd={onDragEnd}>
                  <input placeholder="Название" value={p.name} onChange={(e) => setInstanceDraftOutputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))} />
                  <input placeholder="Тип" value={p.type || ''} onChange={(e) => setInstanceDraftOutputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, type: e.target.value } : it)))} />
                  <div className="row-controls">
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button type="button" className="row-controls__delete" title="Удалить выход экземпляра" aria-label="Удалить выход экземпляра" onClick={() => setInstanceDraftOutputs((prev) => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section__head">
                <span>Атрибуты</span>
                <button onClick={() => setInstanceDraftAttrs((prev) => [...prev, { name: '', hidden: false, value: '' }])}>+ Атрибут</button>
              </div>
              {instanceDraftAttrs.map((a, i) => (
                <div className="row row--attr" key={`i-attr-${i}`} draggable onDragStart={() => onDragStart('inst-attrs', i)} onDragOver={onDragOver} onDrop={() => onDropRow('inst-attrs', i)} onDragEnd={onDragEnd}>
                  <input placeholder="Имя" value={a.name} onChange={(e) => setInstanceDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))} />
                  <label className="checkbox-inline">
                    <input type="checkbox" checked={Boolean(a.hidden)} onChange={(e) => setInstanceDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, hidden: e.target.checked } : it)))} />
                    скрытый
                  </label>
                  <div className="row-controls">
                    <span className="material-symbols-outlined drag-handle" title="Перетащите для сортировки">drag_indicator</span>
                    <button type="button" className="row-controls__delete" title="Удалить атрибут экземпляра" aria-label="Удалить атрибут экземпляра" onClick={() => setInstanceDraftAttrs((prev) => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-muted" onClick={() => setInstanceEditorOpen(false)}>Отмена</button>
              <button className="btn-primary" onClick={saveInstanceEditor}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {showSaveAs && (
        <div className="modal-backdrop" onClick={() => setShowSaveAs(false)}>
          <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
            <h3>Сохранить схему как</h3>
            <label className="field">
              <span>Имя схемы</span>
              <input value={draftSchemaName} onChange={(e) => setDraftSchemaName(e.target.value)} placeholder="my-home-v1" />
            </label>
            <div className="modal-actions">
              <button className="btn-muted" onClick={() => setShowSaveAs(false)}>Отмена</button>
              <button className="btn-primary" onClick={handleSaveAs}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {showLoad && (
        <div className="modal-backdrop" onClick={() => setShowLoad(false)}>
          <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
            <h3>Загрузить схему</h3>
            <div className="schema-list">
              {Object.keys(savedSchemas).length === 0 && <p>Сохранённых схем нет</p>}
              {Object.entries(savedSchemas)
                .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
                .map(([name, payload]) => (
                  <button key={name} className="schema-list__item" onClick={() => handleLoad(name)}>
                    <strong>{name}</strong>
                    <span>{new Date(payload.updatedAt || Date.now()).toLocaleString()}</span>
                  </button>
                ))}
            </div>
            <div className="modal-actions">
              <button className="btn-muted" onClick={() => setShowLoad(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <DiagramApp />
    </ReactFlowProvider>
  );
}
