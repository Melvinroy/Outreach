"use client";
import {useState,useRef,useLayoutEffect,type PointerEvent} from "react";
import {Users,MessagesSquare,Building2,FileText,Send,Settings2,Clock3,AlertTriangle} from "lucide-react";
import {projectRelationships} from "@/lib/relationship-projection.mjs";
import type {Snapshot,View} from "./control-center";
const edges = [
    ['discovery','candidate','right'],['candidate','send','right'],['send','waiting','down'],
    ['waiting','connected','down'],['outside','connected','right'],['connected','prepare','return'],
    ['prepare','review','right'],['review','send','queue'],['candidate','attention','branch'],
  ];
export function Lifecycle({
  relationships,
  onSelect,
}: {
  snapshot: Snapshot;
  relationships: ReturnType<typeof projectRelationships>;
  onSelect: (view: View, filter: string) => void;
}) {
  const definitions = [
    ['discovery','Research','discovery','Recorded discovery recommendations'],
    ['candidate','To connect','to_connect','Review the person, source and saved invitation'],
    ['send','Queued','execution',`Awaiting your explicit ChatGPT Work command; ${relationships.groups.running.length} running`],
    ['waiting','Waiting','waiting','Confirmed sent; awaiting acceptance or response'],
    ['connected','Conversations','conversations','Recorded connected relationships, including outside connections'],
    ['outside','Other connections','outside','Confirmed connections from outside discovery'],
    ['prepare','Prepare','prepare','Reply or follow-up due: prepare the next message'],
    ['review','Review','review','Approve the exact saved message before queueing'],
    ['attention','Needs attention','attention','Review specific issues; excluded people retain unresolved delivery checks'],
  ];
  const nodes = definitions.map(([id,label,filter,description])=>({id,label,filter,description,view:'people',count:relationships.groups[filter].length}));
  const [offsets, setOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const flow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = flow.current;
    if (!root) return;
    const update = () => {
      const bounds = root.getBoundingClientRect();
      const box = (id: string) => {
        const el = root.querySelector<HTMLElement>(`.cc-node-${id}`)!;
        const r = el.getBoundingClientRect();
        return {
          x: r.left - bounds.left + r.width / 2,
          top: r.top - bounds.top,
          bottom: r.bottom - bounds.top,
          right: r.right - bounds.left,
          left: r.left - bounds.left,
          y: r.top - bounds.top + r.height / 2,
        };
      };
      const svg = root.querySelector("svg.cc-flow-lines")!;
      svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
      const paths = svg.querySelectorAll("g path");
      edges.forEach(([from,to,direction],i)=>{
        const a=box(from), b=box(to);
        let d='';
        if(direction==='right' && b.top>a.bottom) d=`M${a.x} ${a.bottom} C${a.x} ${(a.bottom+b.top)/2} ${b.x} ${(a.bottom+b.top)/2} ${b.x} ${b.top-4}`;
        else if(direction==='right') d=`M${a.right} ${a.y} C${(a.right+b.left)/2} ${a.y} ${(a.right+b.left)/2} ${b.y} ${b.left-4} ${b.y}`;
        else if(direction==='down') d=`M${a.x} ${a.bottom} C${a.x} ${(a.bottom+b.top)/2} ${b.x} ${(a.bottom+b.top)/2} ${b.x} ${b.top-4}`;
        else if(direction==='return') { const y=(a.bottom+b.top)/2; d=`M${a.x} ${a.bottom} V${y} H${b.x} V${b.top-4}`; }
        else if(direction==='queue') {const x=bounds.width-5;d=`M${a.right} ${a.y} H${x} V${b.y} H${b.right+4}`;}
        else {const y=(a.bottom+b.top)/2;d=`M${a.x} ${a.bottom} V${y} H${b.x} V${b.top-4}`;}
        paths[i].setAttribute('d',d);
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [offsets]);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    time: number;
    active: boolean;
    touch: boolean;
  } | null>(null);
  const suppress = useRef(false);
  const start = (id: string, e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      time: e.timeStamp,
      active: false,
      touch: e.pointerType === "touch",
    };
    suppress.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const x = e.clientX - d.x,
      y = e.clientY - d.y;
    if (Math.hypot(x, y) > 6) d.active = true;
    if (d.active) {
      suppress.current = true;
      setOffsets((o) => ({
        ...o,
        [d.id]: {
          x: Math.max(-8, Math.min(8, x)),
          y: Math.max(-8, Math.min(8, y)),
        },
      }));
    }
  };
  const end = () => {
    drag.current = null;
    setOffsets({});
  };
  return (
    <section className="cc-flow-card ov-cycle" aria-labelledby="cc-flow-title">
      <div className="cc-card-heading">
        <div>
          <h2 id="cc-flow-title">Relationship Cycle</h2><p className="ov-subtitle">From discovery to meaningful opportunities</p>
        </div>
      </div>
      <div
        className="cc-flow relationship-flow"
        ref={flow}
        aria-describedby="cc-flow-description"
      >
        <svg
          className="cc-flow-lines"
          viewBox="0 0 500 545"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker id="cc-return-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#00836b"/></marker>
            <marker
              id="cc-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0L7 3.5L0 7" fill="#8ba299" />
            </marker>
          </defs>
          <g
            fill="none"
            stroke="#becdc5"
            strokeWidth="1.4"
            markerEnd="url(#cc-arrow)"
          >
            {edges.map(([from,to])=><path key={`${from}-${to}`} />)}
          </g>
        </svg>
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`cc-flow-node cc-node-${n.id}`}
            style={{
              transform: `translate(${offsets[n.id]?.x || 0}px,${offsets[n.id]?.y || 0}px)`,
            }}
            aria-label={`${n.label}: ${n.count} people. ${n.description}`}
            onPointerDown={(e) => start(n.id, e)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                end();
                return;
              }
              if (e.altKey && e.key.startsWith("Arrow")) {
                e.preventDefault();
                setOffsets({
                  [n.id]: {
                    x:
                      e.key === "ArrowLeft"
                        ? -8
                        : e.key === "ArrowRight"
                          ? 8
                          : 0,
                    y:
                      e.key === "ArrowUp"
                        ? -8
                        : e.key === "ArrowDown"
                          ? 8
                          : 0,
                  },
                });
              }
            }}
            onBlur={end}
            onClick={() => {
              if (suppress.current) {
                suppress.current = false;
                return;
              }
              onSelect(n.view as View, n.filter);
            }}
          >
            {(() => { const Icon = ({candidate:Users,attention:AlertTriangle,discovery: Users, outside: MessagesSquare, connected: Building2, prepare: FileText, review: Send, send: Settings2, waiting: Clock3})[n.id]!; return <Icon size={23} aria-hidden="true"/>; })()}<span>{n.label}</span>
            <strong>{n.count}</strong>
          </button>
        ))}
        <span className="relationship-return-label">Reply / Follow-up due</span>
      </div>
      <div className="relationship-outcomes">{relationships.milestones.slice(2).map(m=><span key={m.id}>{m.label} <strong>{m.count ?? "—"}</strong></span>)}</div>
      <details className="cc-cycle-help">
        <summary>About these numbers</summary>
        <p id="cc-flow-description" className="cc-flow-note">
          Replies and due follow-ups return through preparation and exact-message review. Queued work needs an explicit ChatGPT Work command. Ordinary queued or waiting work is not an error. Needs attention counts unique people with one or more reasons, including uncertain deliveries on excluded contacts. Closing, snoozing and Do not contact remain person-level actions.
        </p>
      <dl className="ov-stage-help">{nodes.map(node => <div key={node.id}><dt>{node.label}</dt><dd>{node.description}</dd></div>)}</dl></details>
      <p className="cc-sr">
        Select a node to open its people. Drag its body to explore. Alt and
        arrow keys move a focused node; Escape resets. Movement does not change
        workflow state.
      </p>
    </section>
  );
}

