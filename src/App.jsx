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
import 'reactflow/dist/style.css';
import './App.css';

const STORAGE_SCHEMAS = 'liberte.schemas.v1';
const STORAGE_AUTOSAVE = 'liberte.autosave.v1';
const STORAGE_LAST_NAME = 'liberte.lastName.v1';

const PASTEL_COLORS = ['#FDE68A', '#FBCFE8', '#BFDBFE', '#C7D2FE', '#BBF7D0', '#FED7AA', '#E9D5FF', '#A7F3D0'];

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

function BlockNode({ data, selected }) {
  const inPorts = data.inputs ?? [];
  const outPorts = data.outputs ?? [];
  const connected = new Set(data.connectedHandles ?? []);
  const title = data.instanceName?.trim() || data.blockName || data.instanceName || '';

  const yPos = (index) => `${HEADER_H + PORTS_PAD + index * PORT_ROW_H + PORT_ROW_H / 2}px`;

  return (
    <div className={`rf-block ${selected ? 'rf-block--selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={220} minHeight={150} lineStyle={{ borderColor: '#93c5fd' }} />
      <div className="rf-block__header" style={{ background: data.headerColor || '#ffffff' }}>
        {title}
      </div>

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

      <div className="rf-block__ports">
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
      </div>

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
    </div>
  );
}

function DiagramApp() {
  const rf = useReactFlow();
  const wrapperRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const loadedRef = useRef(false);
  const reconnectRef = useRef({ removedEdge: null, didConnect: false });

  const [blockTypes, setBlockTypes] = useState(initialBlockTypes);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [currentSchemaName, setCurrentSchemaName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [draftSchemaName, setDraftSchemaName] = useState('');
  const [showLoad, setShowLoad] = useState(false);

  const [menu, setMenu] = useState({ visible: false, x: 0, y: 0, flowX: 0, flowY: 0 });
  const [hoveredGroup, setHoveredGroup] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftGroup, setDraftGroup] = useState('power');
  const [draftName, setDraftName] = useState('');
  const [draftHeaderColor, setDraftHeaderColor] = useState(PASTEL_COLORS[0]);
  const [draftInputs, setDraftInputs] = useState([]);
  const [draftOutputs, setDraftOutputs] = useState([]);
  const [draftAttrs, setDraftAttrs] = useState([]);

  const nodeTypes = useMemo(() => ({ block: BlockNode }), []);

  const grouped = useMemo(() => {
    const g = {};
    for (const t of blockTypes) {
      g[t.group] ??= [];
      g[t.group].push(t);
    }
    return g;
  }, [blockTypes]);

  const savedSchemas = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_SCHEMAS) || '{}');
    } catch {
      return {};
    }
  }, [showLoad, currentSchemaName, nodes, edges, blockTypes]);

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

  const renderedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          connectedHandles: [...(connectedByNode[n.id] ?? [])],
        },
      })),
    [nodes, connectedByNode]
  );

  const getHandleType = useCallback(
    (nodeId, handleId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return '';
      const inPort = (node.data.inputs || []).find((p) => p.id === handleId);
      if (inPort) return (inPort.type || '').trim();
      const outPort = (node.data.outputs || []).find((p) => p.id === handleId);
      if (outPort) return (outPort.type || '').trim();
      return '';
    },
    [nodes]
  );

  const renderedEdges = useMemo(
    () =>
      edges.map((e) => {
        const sType = getHandleType(e.source, e.sourceHandle);
        const tType = getHandleType(e.target, e.targetHandle);
        const mismatch = sType && tType && sType !== tType;
        return {
          ...e,
          type: e.type === 'bezier' ? 'default' : e.type || 'default',
          style: mismatch
            ? { ...(e.style || {}), stroke: '#ef4444', strokeWidth: 2.5 }
            : { ...(e.style || {}), stroke: '#cbd5e1', strokeWidth: 2 },
        };
      }),
    [edges, getHandleType]
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedType = selectedNode
    ? blockTypes.find((t) => t.id === selectedNode.data.typeId) || null
    : null;

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

  const handleSave = () => {
    if (!currentSchemaName) {
      setDraftSchemaName('');
      setShowSaveAs(true);
      return;
    }
    persistNamedSchema(currentSchemaName);
  };

  const handleSaveAs = () => {
    if (persistNamedSchema(draftSchemaName)) setShowSaveAs(false);
  };

  const handleLoad = (name) => {
    const map = JSON.parse(localStorage.getItem(STORAGE_SCHEMAS) || '{}');
    if (!map[name]) return;
    applyPayload(map[name], { fromAutosave: false });
    setShowLoad(false);
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
      const groups = Object.keys(grouped);
      setHoveredGroup(groups[0] || '');
      setMenu({ visible: true, x: event.clientX, y: event.clientY, flowX: flow.x, flowY: flow.y });
    },
    [rf, grouped]
  );

  const buildTypeId = (group, name) => `${slugify(group)}/${slugify(name)}`;

  const moveItem = (setter, index, direction) => {
    setter((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const instantiate = (typeDef) => {
    const nodeId = nanoid(10);
    const defaultName = typeDef.name;
    const node = {
      id: nodeId,
      type: 'block',
      position: { x: menu.flowX, y: menu.flowY },
      data: {
        typeId: typeDef.id,
        blockName: typeDef.name,
        instanceName: typeDef.name,
        headerColor: typeDef.headerColor || PASTEL_COLORS[0],
        inputs: typeDef.inputs,
        outputs: typeDef.outputs,
        attributes: typeDef.attributes.map((attr) => ({
          name: attr.name,
          hidden: Boolean(attr.hidden),
          value:
            attr.name.toLowerCase() === 'id'
              ? nodeId
              : attr.name.toLowerCase() === 'name'
                ? defaultName
                : '',
        })),
      },
    };
    setNodes((prev) => [...prev, node]);
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
    setDraftInputs(t.inputs.map((x) => ({ ...x })));
    setDraftOutputs(t.outputs.map((x) => ({ ...x })));
    setDraftAttrs(t.attributes.map((attr) => ({ name: attr.name, hidden: Boolean(attr.hidden) })));
    setEditorOpen(true);
    closeMenu();
  };

  const saveType = () => {
    if (!draftGroup.trim() || !draftName.trim()) return;
    const id = buildTypeId(draftGroup, draftName);

    const normalized = {
      id,
      group: draftGroup.trim(),
      name: draftName.trim(),
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
      setBlockTypes((prev) => prev.map((t) => (t.id === editingId ? normalized : t)));
      setNodes((prev) =>
        prev.map((n) => {
          if (n.data.typeId !== editingId) return n;
          const oldAttrMap = Object.fromEntries((n.data.attributes ?? []).map((a) => [a.name, a.value]));
          return {
            ...n,
            data: {
              ...n.data,
              typeId: normalized.id,
              blockName: normalized.name,
              headerColor: normalized.headerColor,
              instanceName: n.data.instanceName?.trim() || normalized.name,
              inputs: normalized.inputs,
              outputs: normalized.outputs,
              attributes: normalized.attributes.map((attr) => {
                const lower = attr.name.toLowerCase();
                const fallbackName = n.data.instanceName?.trim() || normalized.name;
                return {
                  name: attr.name,
                  hidden: Boolean(attr.hidden),
                  value:
                    oldAttrMap[attr.name] ??
                    (lower === 'id' ? n.id : lower === 'name' ? fallbackName : ''),
                };
              }),
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
        const effectiveName = name.trim() || n.data.blockName || '';
        return {
          ...n,
          data: {
            ...n.data,
            instanceName: effectiveName,
            attributes: (n.data.attributes || []).map((a) =>
              a.name.toLowerCase() === 'name' ? { ...a, value: effectiveName } : a
            ),
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

  return (
    <div className="layout">
      <div className="canvas" ref={wrapperRef} onContextMenu={openMenu}>
        <div className="topbar">
          <button onClick={handleSave}>Сохранить</button>
          <button
            onClick={() => {
              setDraftSchemaName(currentSchemaName || '');
              setShowSaveAs(true);
            }}
          >
            Сохранить как
          </button>
          <button onClick={() => setShowLoad(true)}>Загрузить</button>
          <span className="topbar__name">{currentSchemaName ? `Схема: ${currentSchemaName}` : 'Без имени'}</span>
        </div>

        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          connectionLineType={ConnectionLineType.Bezier}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => {
            setSelectedNodeId(null);
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
              <button onClick={openCreate}>+ Новый</button>
            </div>
            <div className="menu__groups">
              {Object.keys(grouped).map((group) => (
                <button
                  key={group}
                  className={`menu__group-btn ${hoveredGroup === group ? 'menu__group-btn--active' : ''}`}
                  onMouseEnter={() => setHoveredGroup(group)}
                  onFocus={() => setHoveredGroup(group)}
                  type="button"
                >
                  {group}
                </button>
              ))}
            </div>

            {hoveredGroup && grouped[hoveredGroup] && (
              <div className="menu__submenu">
                <div className="menu__group-title">{hoveredGroup}</div>
                {grouped[hoveredGroup].map((t) => (
                  <div key={t.id} className="menu__item">
                    <button className="menu__add" onClick={() => instantiate(t)}>
                      {t.name}
                    </button>
                    <button className="menu__edit" onClick={() => openEdit(t)}>
                      Изм.
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
            <label className="field">
              <span>Группа</span>
              <input value={selectedType?.group || ''} disabled />
            </label>
            <label className="field">
              <span>Тип блока</span>
              <input value={selectedType?.name || selectedNode.data.blockName || ''} disabled />
            </label>
            <label className="field">
              <span>Имя экземпляра</span>
              <input value={selectedNode.data.instanceName} onChange={(e) => updateNodeName(e.target.value)} />
            </label>
            {selectedNode.data.attributes.map((a) => (
              <label className="field" key={a.name}>
                <span>{a.name}{a.hidden ? ' (скрытый)' : ''}</span>
                <input value={a.value} onChange={(e) => updateNodeAttr(a.name, e.target.value)} />
              </label>
            ))}
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
            <div className="field">
              <span>Цвет заголовка (пастель)</span>
              <div className="color-palette">
                {PASTEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${draftHeaderColor === color ? 'color-swatch--active' : ''}`}
                    style={{ background: color }}
                    onClick={() => setDraftHeaderColor(color)}
                    aria-label={`color ${color}`}
                  />
                ))}
              </div>
            </div>
            <p className="hint">ID создаётся автоматически: {buildTypeId(draftGroup || 'group', draftName || 'name')}</p>

            <div className="section">
              <div className="section__head">
                <span>Входы</span>
                <button onClick={() => setDraftInputs((prev) => [...prev, { id: nanoid(6), name: '', type: '' }])}>+ Вход</button>
              </div>
              {draftInputs.map((p, i) => (
                <div className="row row--with-controls" key={`in-${i}`}>
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
                    <button type="button" onClick={() => moveItem(setDraftInputs, i, -1)}>↑</button>
                    <button type="button" onClick={() => moveItem(setDraftInputs, i, 1)}>↓</button>
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
                <div className="row row--with-controls" key={`out-${i}`}>
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
                    <button type="button" onClick={() => moveItem(setDraftOutputs, i, -1)}>↑</button>
                    <button type="button" onClick={() => moveItem(setDraftOutputs, i, 1)}>↓</button>
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
                <div className="row row--attr" key={`attr-${i}`}>
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
                    <button type="button" onClick={() => moveItem(setDraftAttrs, i, -1)}>↑</button>
                    <button type="button" onClick={() => moveItem(setDraftAttrs, i, 1)}>↓</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-muted" onClick={() => setEditorOpen(false)}>Отмена</button>
              <button className="btn-primary" onClick={saveType}>Сохранить</button>
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
