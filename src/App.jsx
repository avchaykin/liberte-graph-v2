import { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import { nanoid } from 'nanoid';
import 'reactflow/dist/style.css';
import './App.css';

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');

const PASTEL_COLORS = ['#FDE68A', '#FBCFE8', '#BFDBFE', '#C7D2FE', '#BBF7D0', '#FED7AA', '#E9D5FF', '#A7F3D0'];

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

  const yPos = (index) => `${HEADER_H + PORTS_PAD + index * PORT_ROW_H + PORT_ROW_H / 2}px`;

  return (
    <div className={`rf-block ${selected ? 'rf-block--selected' : ''}`}>
      <div className="rf-block__header" style={{ background: data.headerColor || '#ffffff' }}>
        {data.instanceName}
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

const nodeTypes = { block: BlockNode };

function DiagramApp() {
  const rf = useReactFlow();
  const wrapperRef = useRef(null);

  const [blockTypes, setBlockTypes] = useState(initialBlockTypes);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [menu, setMenu] = useState({ visible: false, x: 0, y: 0, flowX: 0, flowY: 0 });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftGroup, setDraftGroup] = useState('power');
  const [draftName, setDraftName] = useState('');
  const [draftHeaderColor, setDraftHeaderColor] = useState(PASTEL_COLORS[0]);
  const [draftInputs, setDraftInputs] = useState([]);
  const [draftOutputs, setDraftOutputs] = useState([]);
  const [draftAttrs, setDraftAttrs] = useState([]);

  const grouped = useMemo(() => {
    const g = {};
    for (const t of blockTypes) {
      g[t.group] ??= [];
      g[t.group].push(t);
    }
    return g;
  }, [blockTypes]);

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

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const closeMenu = () => setMenu((m) => ({ ...m, visible: false }));

  const openMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const flow = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ visible: true, x: event.clientX, y: event.clientY, flowX: flow.x, flowY: flow.y });
    },
    [rf]
  );

  const buildTypeId = (group, name) => `${slugify(group)}/${slugify(name)}`;

  const instantiate = (typeDef) => {
    const node = {
      id: nanoid(10),
      type: 'block',
      position: { x: menu.flowX, y: menu.flowY },
      data: {
        typeId: typeDef.id,
        instanceName: typeDef.name,
        headerColor: typeDef.headerColor || PASTEL_COLORS[0],
        inputs: typeDef.inputs,
        outputs: typeDef.outputs,
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

  const onConnect = useCallback(
    (params) =>
      setEdges((prev) =>
        addEdge(
          {
            ...params,
            type: 'bezier',
            style: { stroke: '#cbd5e1', strokeWidth: 2 },
          },
          prev
        )
      ),
    [setEdges]
  );

  const openCreate = () => {
    setEditingId(null);
    setDraftGroup('power');
    setDraftName('');
    setDraftHeaderColor(PASTEL_COLORS[0]);
    setDraftInputs([]);
    setDraftOutputs([]);
    setDraftAttrs([]);
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
        .filter((p) => p.name.trim() && p.type.trim())
        .map((p, i) => ({ id: p.id || `in-${slugify(p.name)}-${i}`, name: p.name.trim(), type: p.type.trim() })),
      outputs: draftOutputs
        .filter((p) => p.name.trim() && p.type.trim())
        .map((p, i) => ({ id: p.id || `out-${slugify(p.name)}-${i}`, name: p.name.trim(), type: p.type.trim() })),
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
              headerColor: normalized.headerColor,
              inputs: normalized.inputs,
              outputs: normalized.outputs,
              attributes: normalized.attributes.map((attr) => ({
                name: attr.name,
                hidden: Boolean(attr.hidden),
                value: oldAttrMap[attr.name] ?? '',
              })),
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
    setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, instanceName: name } } : n)));
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
        <ReactFlow
          nodes={renderedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="menu__group">
                <div className="menu__group-title">{group}</div>
                {items.map((t) => (
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
            ))}
          </div>
        )}
      </div>

      <aside className="inspector">
        <h3>Инспектор</h3>
        {selectedNode ? (
          <>
            <label className="field">
              <span>Имя экземпляра</span>
              <input value={selectedNode.data.instanceName} onChange={(e) => updateNodeName(e.target.value)} />
            </label>
            {selectedNode.data.attributes.map((a) => (
              <label className="field" key={a.name}>
                <span>{a.name}</span>
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
                <button onClick={() => setDraftInputs((prev) => [...prev, { id: '', name: '', type: '' }])}>+ Вход</button>
              </div>
              {draftInputs.map((p, i) => (
                <div className="row" key={`in-${i}`}>
                  <input
                    placeholder="Название"
                    value={p.name}
                    onChange={(e) => setDraftInputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))}
                  />
                  <input
                    placeholder="Тип"
                    value={p.type}
                    onChange={(e) => setDraftInputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, type: e.target.value } : it)))}
                  />
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section__head">
                <span>Выходы</span>
                <button onClick={() => setDraftOutputs((prev) => [...prev, { id: '', name: '', type: '' }])}>+ Выход</button>
              </div>
              {draftOutputs.map((p, i) => (
                <div className="row" key={`out-${i}`}>
                  <input
                    placeholder="Название"
                    value={p.name}
                    onChange={(e) => setDraftOutputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it)))}
                  />
                  <input
                    placeholder="Тип"
                    value={p.type}
                    onChange={(e) => setDraftOutputs((prev) => prev.map((it, idx) => (idx === i ? { ...it, type: e.target.value } : it)))}
                  />
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
                      setDraftAttrs((prev) =>
                        prev.map((it, idx) => (idx === i ? { ...it, name: e.target.value } : it))
                      )
                    }
                  />
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={Boolean(a.hidden)}
                      onChange={(e) =>
                        setDraftAttrs((prev) =>
                          prev.map((it, idx) => (idx === i ? { ...it, hidden: e.target.checked } : it))
                        )
                      }
                    />
                    скрытый
                  </label>
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
