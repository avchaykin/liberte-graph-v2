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

const initialBlockTypes = [
  {
    id: 'power/circuit-breaker-1pn',
    path: ['power', 'circuit breaker'],
    title: 'Circuit Breaker 1P+N',
    ports: [
      { id: 'in-n', name: 'N', direction: 'in' },
      { id: 'in-l', name: 'L', direction: 'in' },
      { id: 'out-n', name: 'N', direction: 'out' },
      { id: 'out-l', name: 'L', direction: 'out' },
    ],
    attributes: [
      { key: 'line', label: 'Line', defaultValue: '4: HEATING?' },
      { key: 'model', label: 'Model', defaultValue: 'Hager MF 710' },
      { key: 'power', label: 'Power', defaultValue: '10' },
    ],
  },
];

const blockNodeTypes = {
  blockNode: BlockNode,
};

function BlockNode({ data, selected }) {
  const inPorts = data.ports.filter((p) => p.direction === 'in');
  const outPorts = data.ports.filter((p) => p.direction === 'out');

  const handleTop = (index, total) => {
    const step = 100 / (total + 1);
    return `${Math.round((index + 1) * step)}%`;
  };

  return (
    <div className={`block-node ${selected ? 'block-node--selected' : ''}`}>
      <div className="block-node__header">
        <div className="block-node__dot" />
        <div>{data.instanceName}</div>
      </div>

      <div className="block-node__ports-layer">
        {inPorts.map((port, i) => (
          <Handle
            key={`in-${port.id}`}
            id={port.id}
            type="target"
            position={Position.Left}
            className="block-node__handle"
            style={{ top: handleTop(i, inPorts.length) }}
          />
        ))}

        {outPorts.map((port, i) => (
          <Handle
            key={`out-${port.id}`}
            id={port.id}
            type="source"
            position={Position.Right}
            className="block-node__handle"
            style={{ top: handleTop(i, outPorts.length) }}
          />
        ))}

        <div className="block-node__ports block-node__ports--left">
          {inPorts.map((port) => (
            <div key={`lbl-in-${port.id}`} className="block-node__port-row">
              <span>{port.name}</span>
            </div>
          ))}
        </div>

        <div className="block-node__ports block-node__ports--right">
          {outPorts.map((port) => (
            <div key={`lbl-out-${port.id}`} className="block-node__port-row">
              <span>{port.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="block-node__attrs">
        {data.attributes.map((attr) => (
          <div className="block-node__attr" key={attr.key}>
            <span>{attr.label}</span>
            <strong>{String(attr.value ?? '')}</strong>
          </div>
        ))}
      </div>

      <div className="block-node__type">{data.typeId}</div>
    </div>
  );
}

function DiagramApp() {
  const [blockTypes, setBlockTypes] = useState(initialBlockTypes);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [menu, setMenu] = useState({ visible: false, x: 0, y: 0, flowX: 0, flowY: 0 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState(null);

  const [draftId, setDraftId] = useState('');
  const [draftGroup, setDraftGroup] = useState('power');
  const [draftSubgroup, setDraftSubgroup] = useState('circuit breaker');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPorts, setDraftPorts] = useState([]);
  const [draftAttrs, setDraftAttrs] = useState([]);

  const wrapperRef = useRef(null);
  const rf = useReactFlow();

  const groupedTypes = useMemo(() => {
    const grouped = {};
    for (const t of blockTypes) {
      const [g, sg] = t.path;
      grouped[g] ??= {};
      grouped[g][sg] ??= [];
      grouped[g][sg].push(t);
    }
    return grouped;
  }, [blockTypes]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const openMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const flowPoint = rf.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        flowX: flowPoint.x,
        flowY: flowPoint.y,
      });
    },
    [rf]
  );

  const closeMenu = useCallback(() => {
    setMenu((m) => ({ ...m, visible: false }));
  }, []);

  const onPaneClick = () => {
    closeMenu();
    setSelectedNodeId(null);
  };

  const instantiateType = (typeDef) => {
    const attrs = typeDef.attributes.map((a) => ({ ...a, value: a.defaultValue ?? '' }));
    const node = {
      id: nanoid(10),
      type: 'blockNode',
      position: { x: menu.flowX, y: menu.flowY },
      data: {
        typeId: typeDef.id,
        instanceName: typeDef.title,
        ports: typeDef.ports,
        attributes: attrs,
      },
    };
    setNodes((prev) => [...prev, node]);
    closeMenu();
  };

  const onConnect = useCallback(
    (params) => {
      setEdges((prev) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            style: { stroke: '#1f2937', strokeWidth: 2 },
          },
          prev
        )
      );
    },
    [setEdges]
  );

  const openCreateType = () => {
    setEditingTypeId(null);
    setDraftId('');
    setDraftGroup('power');
    setDraftSubgroup('circuit breaker');
    setDraftTitle('');
    setDraftPorts([]);
    setDraftAttrs([]);
    setEditorOpen(true);
    closeMenu();
  };

  const openEditType = (typeDef) => {
    setEditingTypeId(typeDef.id);
    setDraftId(typeDef.id);
    setDraftGroup(typeDef.path[0] || 'group');
    setDraftSubgroup(typeDef.path[1] || 'subgroup');
    setDraftTitle(typeDef.title);
    setDraftPorts(typeDef.ports.map((p) => ({ ...p })));
    setDraftAttrs(typeDef.attributes.map((a) => ({ ...a })));
    setEditorOpen(true);
    closeMenu();
  };

  const saveType = () => {
    if (!draftId.trim() || !draftTitle.trim()) return;
    const cleanedPorts = draftPorts.filter((p) => p.id && p.name);
    const cleanedAttrs = draftAttrs.filter((a) => a.key && a.label);

    const payload = {
      id: draftId.trim(),
      path: [draftGroup.trim() || 'group', draftSubgroup.trim() || 'subgroup'],
      title: draftTitle.trim(),
      ports: cleanedPorts,
      attributes: cleanedAttrs,
    };

    if (editingTypeId) {
      setBlockTypes((prev) => prev.map((t) => (t.id === editingTypeId ? payload : t)));
    } else {
      setBlockTypes((prev) => [...prev, payload]);
    }

    setEditorOpen(false);
  };

  const updateSelectedNodeName = (name) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, instanceName: name } } : n))
    );
  };

  const updateSelectedNodeAttr = (key, value) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== selectedNodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            attributes: n.data.attributes.map((a) => (a.key === key ? { ...a, value } : a)),
          },
        };
      })
    );
  };

  return (
    <div className="app-shell">
      <div className="canvas-wrap" ref={wrapperRef} onContextMenu={openMenu}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          nodeTypes={blockNodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={3}
        >
          <Background variant="dots" gap={22} size={1.2} color="#475569" bgColor="#ffffff" />
          <Controls position="bottom-right" />
        </ReactFlow>

        {menu.visible && (
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <div className="ctx-menu__head">
              <span>Добавить блок</span>
              <button onClick={openCreateType}>+ Новый</button>
            </div>

            {Object.entries(groupedTypes).map(([g, sub]) => (
              <div key={g} className="ctx-group">
                <div className="ctx-group__title">{g}</div>
                {Object.entries(sub).map(([sg, items]) => (
                  <div key={`${g}-${sg}`} className="ctx-subgroup">
                    <div className="ctx-subgroup__title">{sg}</div>
                    {items.map((it) => (
                      <div key={it.id} className="ctx-item">
                        <button className="ctx-item__add" onClick={() => instantiateType(it)}>
                          {it.title}
                        </button>
                        <button className="ctx-item__edit" onClick={() => openEditType(it)}>
                          Изм.
                        </button>
                      </div>
                    ))}
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
              <span>Тип (class id)</span>
              <input value={selectedNode.data.typeId} disabled />
            </label>
            <label className="field">
              <span>Имя экземпляра</span>
              <input
                value={selectedNode.data.instanceName}
                onChange={(e) => updateSelectedNodeName(e.target.value)}
              />
            </label>
            <div className="field-list">
              {selectedNode.data.attributes.map((a) => (
                <label key={a.key} className="field">
                  <span>{a.label}</span>
                  <input value={a.value} onChange={(e) => updateSelectedNodeAttr(a.key, e.target.value)} />
                </label>
              ))}
            </div>
          </>
        ) : (
          <p>Выберите блок на схеме.</p>
        )}
      </aside>

      {editorOpen && (
        <div className="modal-backdrop" onClick={() => setEditorOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTypeId ? 'Редактировать тип блока' : 'Новый тип блока'}</h3>
            <label className="field">
              <span>Class ID</span>
              <input value={draftId} onChange={(e) => setDraftId(e.target.value)} placeholder="power/circuit-breaker-1pn" />
            </label>
            <div className="row2">
              <label className="field">
                <span>Группа</span>
                <input value={draftGroup} onChange={(e) => setDraftGroup(e.target.value)} placeholder="power" />
              </label>
              <label className="field">
                <span>Подгруппа</span>
                <input value={draftSubgroup} onChange={(e) => setDraftSubgroup(e.target.value)} placeholder="circuit breaker" />
              </label>
            </div>
            <label className="field">
              <span>Название</span>
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Circuit Breaker 1P+N" />
            </label>

            <div className="section">
              <div className="section__head">
                <span>Порты (входы/выходы)</span>
                <button onClick={() => setDraftPorts((p) => [...p, { id: '', name: '', direction: 'in' }])}>+ Порт</button>
              </div>
              {draftPorts.map((p, idx) => (
                <div className="row3" key={`${idx}-${p.id}`}>
                  <input
                    value={p.id}
                    onChange={(e) =>
                      setDraftPorts((prev) => prev.map((it, i) => (i === idx ? { ...it, id: e.target.value } : it)))
                    }
                    placeholder="id"
                  />
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setDraftPorts((prev) => prev.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                    }
                    placeholder="name"
                  />
                  <select
                    value={p.direction}
                    onChange={(e) =>
                      setDraftPorts((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, direction: e.target.value } : it))
                      )
                    }
                  >
                    <option value="in">in</option>
                    <option value="out">out</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section__head">
                <span>Атрибуты</span>
                <button
                  onClick={() =>
                    setDraftAttrs((a) => [...a, { key: '', label: '', defaultValue: '' }])
                  }
                >
                  + Атрибут
                </button>
              </div>
              {draftAttrs.map((a, idx) => (
                <div className="row3" key={`${idx}-${a.key}`}>
                  <input
                    value={a.key}
                    onChange={(e) =>
                      setDraftAttrs((prev) => prev.map((it, i) => (i === idx ? { ...it, key: e.target.value } : it)))
                    }
                    placeholder="key"
                  />
                  <input
                    value={a.label}
                    onChange={(e) =>
                      setDraftAttrs((prev) => prev.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)))
                    }
                    placeholder="label"
                  />
                  <input
                    value={a.defaultValue}
                    onChange={(e) =>
                      setDraftAttrs((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, defaultValue: e.target.value } : it))
                      )
                    }
                    placeholder="default"
                  />
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-muted" onClick={() => setEditorOpen(false)}>
                Отмена
              </button>
              <button className="btn-primary" onClick={saveType}>
                Сохранить
              </button>
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
