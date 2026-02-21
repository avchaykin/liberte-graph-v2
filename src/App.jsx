import { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
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

const initialBlockTypes = [
  {
    id: 'power/circuit-breaker-1p-n',
    group: 'power',
    name: 'Circuit Breaker 1P+N',
    inputs: [
      { id: 'in-n', name: 'N', type: 'electrical' },
      { id: 'in-l', name: 'L', type: 'electrical' },
    ],
    outputs: [
      { id: 'out-n', name: 'N', type: 'electrical' },
      { id: 'out-l', name: 'L', type: 'electrical' },
    ],
    attributes: [
      { key: 'line', label: 'Line', defaultValue: '4: HEATING?' },
      { key: 'model', label: 'Model', defaultValue: 'Hager MF 710' },
      { key: 'power', label: 'Power', defaultValue: '10' },
    ],
  },
];

function BlockNode({ data, selected }) {
  const inPorts = data.inputs ?? [];
  const outPorts = data.outputs ?? [];

  const yPos = (idx, total) => `${((idx + 1) * 100) / (total + 1)}%`;

  return (
    <div className={`rf-block ${selected ? 'rf-block--selected' : ''}`}>
      <div className="rf-block__header">{data.instanceName}</div>

      {inPorts.map((p, idx) => (
        <Handle
          key={p.id}
          id={p.id}
          type="target"
          position={Position.Left}
          className="rf-block__handle"
          style={{ top: yPos(idx, inPorts.length) }}
        />
      ))}
      {outPorts.map((p, idx) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Right}
          className="rf-block__handle"
          style={{ top: yPos(idx, outPorts.length) }}
        />
      ))}

      <div className="rf-block__ports">
        <div>
          {inPorts.map((p) => (
            <div key={`in-${p.id}`} className="rf-block__port-row">
              <strong>{p.name}</strong>
              <span>{p.type}</span>
            </div>
          ))}
        </div>
        <div>
          {outPorts.map((p) => (
            <div key={`out-${p.id}`} className="rf-block__port-row rf-block__port-row--right">
              <strong>{p.name}</strong>
              <span>{p.type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rf-block__attrs">
        {data.attributes.map((a) => (
          <div className="rf-block__attr" key={a.key}>
            <span>{a.label}</span>
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
        inputs: typeDef.inputs,
        outputs: typeDef.outputs,
        attributes: typeDef.attributes.map((a) => ({ ...a, value: a.defaultValue ?? '' })),
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
            type: 'smoothstep',
            style: { stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '5 5' },
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
    setDraftInputs(t.inputs.map((x) => ({ ...x })));
    setDraftOutputs(t.outputs.map((x) => ({ ...x })));
    setDraftAttrs(t.attributes.map((x) => ({ ...x })));
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
      inputs: draftInputs
        .filter((p) => p.name.trim() && p.type.trim())
        .map((p, i) => ({ id: p.id || `in-${slugify(p.name)}-${i}`, name: p.name.trim(), type: p.type.trim() })),
      outputs: draftOutputs
        .filter((p) => p.name.trim() && p.type.trim())
        .map((p, i) => ({ id: p.id || `out-${slugify(p.name)}-${i}`, name: p.name.trim(), type: p.type.trim() })),
      attributes: draftAttrs
        .filter((a) => a.key.trim() && a.label.trim())
        .map((a) => ({ ...a, key: a.key.trim(), label: a.label.trim() })),
    };

    if (editingId) {
      setBlockTypes((prev) => prev.map((t) => (t.id === editingId ? normalized : t)));
    } else {
      setBlockTypes((prev) => [...prev, normalized]);
    }

    setEditorOpen(false);
  };

  const updateNodeName = (name) => {
    setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, instanceName: name } } : n)));
  };

  const updateNodeAttr = (key, value) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, attributes: n.data.attributes.map((a) => (a.key === key ? { ...a, value } : a)) } }
          : n
      )
    );
  };

  return (
    <div className="layout">
      <div className="canvas" ref={wrapperRef} onContextMenu={openMenu}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
              <label className="field" key={a.key}>
                <span>{a.label}</span>
                <input value={a.value} onChange={(e) => updateNodeAttr(a.key, e.target.value)} />
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
                <button onClick={() => setDraftAttrs((prev) => [...prev, { key: '', label: '', defaultValue: '' }])}>+ Атрибут</button>
              </div>
              {draftAttrs.map((a, i) => (
                <div className="row3" key={`attr-${i}`}>
                  <input
                    placeholder="key"
                    value={a.key}
                    onChange={(e) => setDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, key: e.target.value } : it)))}
                  />
                  <input
                    placeholder="label"
                    value={a.label}
                    onChange={(e) => setDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, label: e.target.value } : it)))}
                  />
                  <input
                    placeholder="default"
                    value={a.defaultValue}
                    onChange={(e) =>
                      setDraftAttrs((prev) => prev.map((it, idx) => (idx === i ? { ...it, defaultValue: e.target.value } : it)))
                    }
                  />
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
